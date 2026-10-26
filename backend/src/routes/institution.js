const express = require("express");

const db = require("../database/database");
const { authenticateToken, requireRole } = require("../middleware/auth");

const router = express.Router();
const OPEN_RENEWAL_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTION_REQUIRED"
];

function getInstitutionForUser(userId) {
  return db.prepare(`
    SELECT id, name, user_id
    FROM institutions
    WHERE user_id = ?
  `).get(userId);
}

function insertAudit(userId, action, entityType, entityId, newValue) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    entityType,
    entityId,
    newValue ? JSON.stringify(newValue) : null
  );
}

function getRenewalsForInstitution(institutionId) {
  return db.prepare(`
    SELECT
      r.id AS renewal_id,
      r.renewal_date AS request_date,
      r.status AS renewal_status,
      r.requested_maturity_date,
      r.reason,
      r.reviewed_at,
      old_fdr.id AS fdr_id,
      old_fdr.fdr_number,
      old_fdr.bank_name,
      old_fdr.amount,
      old_fdr.issue_date,
      old_fdr.maturity_date,
      old_fdr.status AS fdr_status,
      old_fdr.verification_status,
      old_app.id AS application_id,
      old_app.application_type,
      old_app.programme_name,
      old_app.programme_level,
      old_app.discipline,
      old_app.current_intake,
      old_app.proposed_intake,
      old_app.academic_year,
      old_app.status AS application_status,
      new_fdr.id AS new_fdr_id,
      new_fdr.fdr_number AS new_fdr_number
    FROM renewals r
    JOIN fdrs old_fdr ON old_fdr.id = r.old_fdr_id
    LEFT JOIN applications old_app ON old_app.id = old_fdr.application_id
    LEFT JOIN fdrs new_fdr ON new_fdr.id = r.new_fdr_id
    WHERE old_fdr.institution_id = ?
    ORDER BY r.renewal_date DESC, r.id DESC
  `).all(institutionId);
}

function getFdrRenewalEligibility(institutionId) {
  const fdrs = db.prepare(`
    SELECT f.id, f.fdr_number, f.bank_name, f.amount, f.issue_date,
      f.maturity_date, f.status, f.verification_status,
      a.application_type, a.programme_name, a.programme_level,
      a.discipline, a.current_intake, a.proposed_intake, a.academic_year
    FROM fdrs f
    LEFT JOIN applications a ON a.id = f.application_id
    WHERE f.institution_id = ?
    ORDER BY f.created_at DESC, f.id DESC
  `).all(institutionId);
  const openStatusPlaceholders = OPEN_RENEWAL_STATUSES.map(() => "?").join(",");
  const hasRenewalRequest = db.prepare(`
    SELECT id, status
    FROM renewals
    WHERE old_fdr_id = ?
      AND new_fdr_id IS NULL
      AND status IN (${openStatusPlaceholders})
    ORDER BY id DESC
    LIMIT 1
  `);
  const hasCompletedRenewal = db.prepare(`
    SELECT id
    FROM renewals
    WHERE old_fdr_id = ? AND new_fdr_id IS NOT NULL
    LIMIT 1
  `);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latestEligibleDate = new Date(today);
  latestEligibleDate.setDate(latestEligibleDate.getDate() + 90);

  return fdrs.map((fdr) => {
    const request = hasRenewalRequest.get(fdr.id, ...OPEN_RENEWAL_STATUSES);
    const completed = hasCompletedRenewal.get(fdr.id);
    const maturityDate = fdr.maturity_date
      ? new Date(`${fdr.maturity_date}T00:00:00`)
      : null;
    let ineligibilityReason = "";

    if (String(fdr.status).toUpperCase() !== "ACTIVE") {
      ineligibilityReason = "Only active FDRs can be renewed.";
    } else if (completed) {
      ineligibilityReason = "This FDR already has a completed renewal.";
    } else if (request) {
      ineligibilityReason = `A renewal request is already ${request.status.toLowerCase().replaceAll("_", " ")}.`;
    } else if (!maturityDate || Number.isNaN(maturityDate.getTime())) {
      ineligibilityReason = "The FDR maturity date is unavailable.";
    } else if (maturityDate < today) {
      ineligibilityReason = "This FDR has already matured.";
    } else if (maturityDate > latestEligibleDate) {
      ineligibilityReason = "Renewal can be requested within 90 days of maturity.";
    }

    return {
      ...fdr,
      eligible: !ineligibilityReason,
      ineligibility_reason: ineligibilityReason
    };
  });
}

router.get("/renewals/eligible-fdrs", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  try {
    const institution = getInstitutionForUser(req.user.userId);
    if (!institution) {
      return res.status(404).json({ message: "Institution profile not found" });
    }
    return res.json({
      fdrs: getFdrRenewalEligibility(institution.id)
    });
  } catch (error) {
    console.error("Institution eligible FDR fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch eligible FDRs" });
  }
});

router.get("/renewals", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  try {
    const institution = getInstitutionForUser(req.user.userId);
    if (!institution) {
      return res.status(404).json({ message: "Institution profile not found" });
    }

    const reminders = db.prepare(`
      SELECT f.id, f.fdr_number, f.maturity_date
      FROM fdrs f
      WHERE f.institution_id = ?
        AND upper(f.status) = 'ACTIVE'
        AND date(f.maturity_date) BETWEEN date('now') AND date('now', '+30 days')
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = ?
            AND n.type = 'RENEWAL_REMINDER'
            AND n.fdr_id = f.id
        )
    `).all(institution.id, req.user.userId);
    if (reminders.length) {
      const createReminder = db.prepare(`
        INSERT INTO notifications (user_id, message, type, fdr_id)
        VALUES (?, ?, 'RENEWAL_REMINDER', ?)
      `);
      const createReminders = db.transaction(() => {
        for (const fdr of reminders) {
          const days = Math.max(
            0,
            Math.ceil(
              (new Date(`${fdr.maturity_date}T00:00:00`).getTime() -
                new Date().setHours(0, 0, 0, 0)) /
                86400000
            )
          );
          createReminder.run(
            req.user.userId,
            `FDR ${fdr.fdr_number} will mature in ${days} days. Please submit a renewal request if required.`,
            fdr.id
          );
        }
      });
      createReminders();
    }

    const renewals = getRenewalsForInstitution(institution.id);
    const summary = {
      total: renewals.length,
      pending: renewals.filter((item) => item.renewal_status === "PENDING").length,
      under_review: renewals.filter((item) => item.renewal_status === "UNDER_REVIEW").length,
      approved: renewals.filter((item) => item.renewal_status === "APPROVED").length,
      action_required: renewals.filter((item) => item.renewal_status === "ACTION_REQUIRED").length
    };
    return res.json({ count: renewals.length, summary, renewals });
  } catch (error) {
    console.error("Institution renewals fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch renewals" });
  }
});

router.post("/renewals", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  const fdrId = Number(req.body.fdrId);
  const requestedMaturityDate = String(req.body.requestedMaturityDate || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (!Number.isInteger(fdrId) || fdrId <= 0 || !reason) {
    return res.status(400).json({
      message: "Select an FDR and provide a renewal reason."
    });
  }
  const requestedDate = new Date(`${requestedMaturityDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(requestedMaturityDate) ||
    Number.isNaN(requestedDate.getTime()) ||
    requestedDate.toISOString().slice(0, 10) !== requestedMaturityDate
  ) {
    return res.status(400).json({ message: "Enter a valid requested maturity date." });
  }

  try {
    const institution = getInstitutionForUser(req.user.userId);
    if (!institution) {
      return res.status(404).json({ message: "Institution profile not found" });
    }
    const fdr = getFdrRenewalEligibility(institution.id).find(
      (record) => record.id === fdrId
    );
    if (!fdr) {
      return res.status(404).json({ message: "FDR not found for this institution." });
    }
    if (!fdr.eligible) {
      return res.status(409).json({
        message: `This FDR is not eligible for renewal. ${fdr.ineligibility_reason}`
      });
    }
    if (requestedMaturityDate <= String(fdr.maturity_date).slice(0, 10)) {
      return res.status(400).json({
        message: "Requested maturity date must be after the current maturity date."
      });
    }

    const createRenewal = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO renewals (
          old_fdr_id, new_fdr_id, status, requested_maturity_date, reason
        )
        VALUES (?, NULL, 'PENDING', ?, ?)
      `).run(fdrId, requestedMaturityDate, reason);
      const renewalId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO notifications (user_id, message, type, fdr_id, application_id, renewal_id)
        VALUES (?, ?, 'RENEWAL_SUBMITTED', ?, ?, ?)
      `).run(
        req.user.userId,
        "Your renewal request has been submitted successfully.",
        fdrId,
        db.prepare("SELECT application_id FROM fdrs WHERE id = ?").get(fdrId).application_id,
        renewalId
      );
      insertAudit(req.user.userId, "RENEWAL_REQUEST_SUBMITTED", "RENEWAL", renewalId, {
        fdrId,
        requestedMaturityDate,
        reason
      });
      return renewalId;
    });

    const renewalId = createRenewal();
    return res.status(201).json({
      message: "Renewal request submitted successfully.",
      renewalId
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "An active renewal request already exists for this FDR."
      });
    }
    console.error("Institution renewal submission error:", error);
    return res.status(500).json({ message: "Unable to submit renewal request" });
  }
});

router.get("/renewals/:id", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  const renewalId = Number(req.params.id);
  if (!Number.isInteger(renewalId) || renewalId <= 0) {
    return res.status(400).json({ message: "Invalid renewal ID" });
  }
  try {
    const institution = getInstitutionForUser(req.user.userId);
    if (!institution) {
      return res.status(404).json({ message: "Institution profile not found" });
    }
    const renewal = getRenewalsForInstitution(institution.id).find(
      (item) => item.renewal_id === renewalId
    );
    if (!renewal) {
      return res.status(404).json({ message: "Renewal request not found" });
    }
    const documents = db.prepare(`
      SELECT id, file_name, document_type, uploaded_at
      FROM documents
      WHERE fdr_id = ?
      ORDER BY uploaded_at DESC, id DESC
    `).all(renewal.fdr_id);
    const timeline = db.prepare(`
      SELECT id, action, new_value, created_at
      FROM audit_logs
      WHERE entity_type = 'RENEWAL' AND entity_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(renewalId).map((event) => {
      let details = null;
      if (event.new_value) {
        try {
          details = JSON.parse(event.new_value);
        } catch (error) {
          console.error(`Unable to parse renewal audit event ${event.id}:`, error);
        }
      }
      return { action: event.action, details, created_at: event.created_at };
    });
    const verification = db.prepare(`
      SELECT result, verification_score, verified_at, message
      FROM verifications
      WHERE fdr_id = ?
      ORDER BY verified_at DESC, id DESC
      LIMIT 1
    `).get(renewal.fdr_id);
    return res.json({
      renewal,
      documents,
      timeline,
      verification: verification || null
    });
  } catch (error) {
    console.error("Institution renewal detail error:", error);
    return res.status(500).json({ message: "Unable to fetch renewal details" });
  }
});

router.get("/notifications", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT n.id, n.message, n.type, n.is_read, n.created_at,
        n.fdr_id, f.fdr_number, n.application_id, n.renewal_id,
        r.status AS renewal_status
      FROM notifications n
      LEFT JOIN fdrs f ON f.id = n.fdr_id
      LEFT JOIN renewals r ON r.id = n.renewal_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC, n.id DESC
    `).all(req.user.userId);
    return res.json({
      count: notifications.length,
      unreadCount: notifications.filter((item) => !item.is_read).length,
      notifications
    });
  } catch (error) {
    console.error("Institution notifications fetch error:", error);
    return res.status(500).json({ message: "Unable to fetch notifications" });
  }
});

router.patch("/notifications/read-all", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  try {
    const update = db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `);
    const transaction = db.transaction(() => {
      const unread = db.prepare(`
        SELECT id FROM notifications WHERE user_id = ? AND is_read = 0
      `).all(req.user.userId);
      const result = update.run(req.user.userId);
      const audit = db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
        VALUES (?, 'NOTIFICATION_MARKED_READ', 'NOTIFICATION', ?, ?)
      `);
      for (const item of unread) {
        audit.run(req.user.userId, item.id, JSON.stringify({ is_read: true }));
      }
      return result.changes;
    });
    return res.json({ updated: transaction() });
  } catch (error) {
    console.error("Institution mark all notifications read error:", error);
    return res.status(500).json({ message: "Unable to update notifications" });
  }
});

router.patch("/notifications/:id/read", authenticateToken, requireRole("INSTITUTION"), (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: "Invalid notification ID" });
  }
  try {
    const notification = db.prepare(`
      SELECT id FROM notifications
      WHERE id = ? AND user_id = ?
    `).get(notificationId, req.user.userId);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    const transaction = db.transaction(() => {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(notificationId);
      insertAudit(req.user.userId, "NOTIFICATION_MARKED_READ", "NOTIFICATION", notificationId, {
        is_read: true
      });
    });
    transaction();
    return res.json({ id: notificationId, is_read: true });
  } catch (error) {
    console.error("Institution mark notification read error:", error);
    return res.status(500).json({ message: "Unable to update notification" });
  }
});

module.exports = router;
