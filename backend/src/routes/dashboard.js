const express = require("express");
const db = require("../database/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

const STATUS_MAP = {
  active: "Active",
  submitted: "Submitted",
  under_review: "Under Review",
  discrepancy_found: "Discrepancy Found",
  approaching_maturity: "Approaching Maturity",
  matured: "Matured",
  release_requested: "Release Requested"
};

function normalizeStatusKey(input) {
  if (!input) return null;
  const cleaned = String(input).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (STATUS_MAP[cleaned]) return STATUS_MAP[cleaned];
  for (const val of Object.values(STATUS_MAP)) {
    if (val.toLowerCase() === String(input).trim().toLowerCase()) return val;
  }
  return null;
}

function maskFdrNumber(fdrNumber) {
  if (!fdrNumber) return "";
  const str = String(fdrNumber).trim();
  if (str.length <= 6) return "****";
  const parts = str.split("-");
  if (parts.length >= 3) {
    return `${parts[0]}-****-${parts[parts.length - 1]}`;
  }
  if (str.includes("/")) {
    const slashParts = str.split("/");
    return `${slashParts[0]}/****/${slashParts[slashParts.length - 1]}`;
  }
  return `${str.slice(0, 4)}****${str.slice(-3)}`;
}

function getDaysRemaining(dateString, now = new Date()) {
  if (!dateString) return null;
  const d = new Date(dateString);
  const diffTime = d.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getFdrDistributionStatus(fdr, now = new Date()) {
  const status = String(fdr.status || "").toUpperCase();
  const verificationStatus = String(fdr.verification_status || "").toUpperCase();
  const hasDiscrepancy = ["FLAGGED", "FAILED", "REJECTED"].includes(verificationStatus);

  if (status === "RELEASE_REQUESTED") return "Release Requested";
  const daysRemaining = getDaysRemaining(fdr.maturity_date, now);
  if (["MATURED", "EXPIRED"].includes(status) || (daysRemaining !== null && daysRemaining < 0)) {
    return "Matured";
  }
  if (hasDiscrepancy) return "Discrepancy Found";
  if (status === "SUBMITTED") return "Submitted";
  if (verificationStatus === "PENDING" || verificationStatus === "UNDER_REVIEW") {
    return "Under Review";
  }
  if (daysRemaining !== null && daysRemaining <= 90) {
    return "Approaching Maturity";
  }
  return "Active";
}

// GET /dashboard/status-logs or /api/dashboard/status-logs
router.get("/status-logs", authenticateToken, (req, res) => {
  try {
    const { status, q, event_type, cursor } = req.query;
    const requestedStatusCategory = normalizeStatusKey(status);
    const rawLimit = parseInt(req.query.limit, 10);
    const cursorId = cursor ? parseInt(cursor, 10) : null;

    // RBAC: Check user role
    const userRole = req.user?.role;
    let institutionFilterId = null;

    if (userRole === "INSTITUTION") {
      const inst = db
        .prepare("SELECT id FROM institutions WHERE user_id = ?")
        .get(req.user.id);
      if (!inst) {
        return res.json({
          status: requestedStatusCategory || "all",
          events: [],
          next_cursor: null,
          has_more: false
        });
      }
      institutionFilterId = inst.id;
    }

    // Load all FDRs to filter by computed distribution status
    let fdrQuery = "SELECT id, fdr_number, status, verification_status, maturity_date, institution_id FROM fdrs";
    const fdrParams = [];
    if (institutionFilterId) {
      fdrQuery += " WHERE institution_id = ?";
      fdrParams.push(institutionFilterId);
    }

    const allFdrs = db.prepare(fdrQuery).all(...fdrParams);

    let matchingFdrIds = null;
    if (requestedStatusCategory) {
      const matched = allFdrs.filter(
        (f) => getFdrDistributionStatus(f) === requestedStatusCategory
      );
      matchingFdrIds = matched.map((f) => f.id);
      if (matchingFdrIds.length === 0) {
        return res.json({
          status: requestedStatusCategory,
          events: [],
          next_cursor: null,
          has_more: false
        });
      }
    } else if (institutionFilterId) {
      matchingFdrIds = allFdrs.map((f) => f.id);
    }

    const limit = requestedStatusCategory
      ? Math.max(rawLimit || 0, matchingFdrIds ? matchingFdrIds.length : 20)
      : (rawLimit || 10);

    // Build audit_logs query
    const whereClauses = ["a.entity_type = 'FDR'"];
    const queryParams = [];

    let joinClause = "";
    if (requestedStatusCategory && matchingFdrIds && matchingFdrIds.length > 0) {
      const placeholders = matchingFdrIds.map(() => "?").join(",");
      joinClause = `INNER JOIN (
        SELECT entity_id, MAX(id) AS latest_id
        FROM audit_logs
        WHERE entity_type = 'FDR' AND entity_id IN (${placeholders})
        GROUP BY entity_id
      ) latest ON a.id = latest.latest_id`;
      queryParams.push(...matchingFdrIds);
    } else if (matchingFdrIds && matchingFdrIds.length > 0) {
      const placeholders = matchingFdrIds.map(() => "?").join(",");
      whereClauses.push(`a.entity_id IN (${placeholders})`);
      queryParams.push(...matchingFdrIds);
    }

    if (event_type && String(event_type).trim()) {
      whereClauses.push("a.action = ?");
      queryParams.push(String(event_type).trim());
    }

    if (q && String(q).trim()) {
      const searchTerm = `%${String(q).trim()}%`;
      whereClauses.push("(f.fdr_number LIKE ? OR f.bank_name LIKE ? OR i.name LIKE ?)");
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (cursorId && Number.isFinite(cursorId)) {
      whereClauses.push("a.id < ?");
      queryParams.push(cursorId);
    }

    const sql = `
      SELECT
        a.id,
        a.action AS event_type,
        a.entity_id AS fdr_id,
        a.new_value,
        a.old_value,
        a.created_at AS occurred_at,
        f.fdr_number,
        f.bank_name,
        i.name AS institution_name,
        u.name AS user_name,
        u.role AS user_role
      FROM audit_logs a
      ${joinClause}
      INNER JOIN fdrs f ON f.id = a.entity_id
      INNER JOIN institutions i ON i.id = f.institution_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY a.id DESC
      LIMIT ?
    `;

    queryParams.push(limit + 1);

    const rows = db.prepare(sql).all(...queryParams);

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? resultRows[resultRows.length - 1].id : null;

    const events = resultRows.map((row) => {
      let parsedNew = {};
      try {
        if (row.new_value) parsedNew = JSON.parse(row.new_value);
      } catch (e) {
        parsedNew = {};
      }

      const ruleCode = parsedNew.rule_code || null;
      const ruleReason = parsedNew.rule_reason || null;
      const clearanceProgress = parsedNew.clearance_progress || null;

      let defaultRemark = "System event recorded";
      switch (row.event_type) {
        case "FDR_SUBMITTED":
          defaultRemark = "FDR security deposit submitted by institution";
          break;
        case "DOCUMENT_UPLOADED":
          defaultRemark = "Fixed deposit receipt document uploaded and scanned";
          break;
        case "BANK_VERIFICATION_PASS":
          defaultRemark = "Direct issuer bank API confirmed active deposit status";
          break;
        case "BANK_VERIFICATION_FAIL":
          defaultRemark = ruleReason || "Bank verification check failed";
          break;
        case "FDR_VERIFIED":
          defaultRemark = "Security deposit verified and lien endorsed to AICTE";
          break;
        case "RELEASE_REQUESTED":
          defaultRemark = "Security deposit release clearance request initiated";
          break;
        case "MATURITY_ALERT_GENERATED":
          defaultRemark = "Instrument reached statutory maturity; compliance notification sent";
          break;
        case "RENEWAL_WINDOW_OPENED":
          defaultRemark = "Mandatory renewal window opened (within 90 days of maturity)";
          break;
        case "OCR_COMPLETED":
          defaultRemark = "Automated OCR extraction completed; awaiting officer scrutiny";
          break;
        case "INGESTION_VALIDATED":
          defaultRemark = "Payload schema validated; instrument queued for OCR scrutiny";
          break;
        case "OFFICER_REVIEWED":
          defaultRemark = parsedNew.decision ? `Officer review: ${parsedNew.decision}` : "Officer reviewed FDR record";
          break;
        default:
          defaultRemark = row.event_type.replace(/_/g, " ").toLowerCase();
      }

      const remark = parsedNew.remark || defaultRemark;

      return {
        id: row.id,
        fdr_id: row.fdr_id,
        fdr_number_masked: maskFdrNumber(row.fdr_number),
        institution: row.institution_name,
        bank: row.bank_name,
        event_type: row.event_type,
        actor: row.user_name || (row.user_role === "OFFICER" ? "AICTE Regulation Officer" : "System AI Engine"),
        role: row.user_role || (row.event_type.startsWith("OFFICER") ? "OFFICER" : row.event_type.startsWith("BANK") ? "BANK" : "SYSTEM"),
        remark,
        rule_code: ruleCode,
        rule_reason: ruleReason,
        clearance_progress: clearanceProgress,
        occurred_at: row.occurred_at
      };
    });

    return res.json({
      status: requestedStatusCategory || "all",
      events,
      next_cursor: nextCursor,
      has_more: hasMore
    });
  } catch (error) {
    console.error("Error fetching status logs:", error);
    return res.status(500).json({
      message: "Internal server error fetching status activity logs",
      error: error.message
    });
  }
});

module.exports = router;
