const express = require("express");
const fs = require("fs");
const path = require("path");

const db = require("../database/database");
require("../database/migrations")(db);
const {
  calculateInstitutionCompliance
} = require("../services/complianceService");
const { extractFdrData } = require("../services/ocrService");
const { verifyFdr } = require("../services/verificationService");
const {
  createConfiguredMockBankProvider,
  verifyBankFdr
} = require("../services/bankVerificationService");

const {
  authenticateToken,
  requireRole
} = require("../middleware/auth");

const router = express.Router();
const uploadDirectory = path.resolve(
  __dirname,
  "..",
  "uploads",
  "fdr"
);

function insertAudit(userId, action, entityType, entityId, oldValue, newValue) {
  db.prepare(`
    INSERT INTO audit_logs (
      user_id, action, entity_type, entity_id, old_value, new_value
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    entityType,
    entityId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null
  );
}

function getLatestVerification(fdrId) {
  return db.prepare(`
    SELECT *
    FROM verifications
    WHERE fdr_id = ?
    ORDER BY verified_at DESC, id DESC
    LIMIT 1
  `).get(fdrId);
}

function getOfficerStatsSummary() {
  return db.prepare(`
    SELECT
      COUNT(*) AS total_fdrs,
      COALESCE(SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END), 0) AS verified,
      COALESCE(SUM(CASE WHEN verification_status = 'FLAGGED' THEN 1 ELSE 0 END), 0) AS flagged,
      COALESCE(SUM(CASE WHEN verification_status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(amount), 0) AS total_deposit_amount,
      (SELECT COUNT(*) FROM institutions) AS institutions,
      COALESCE(SUM(
        CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END
      ), 0) AS recent_submissions
    FROM fdrs
  `).get();
}

function getOfficerVerificationQueueRecords() {
  const rows = db.prepare(`
    SELECT
      f.id, f.fdr_number, f.bank_name, f.amount, f.issue_date,
      f.maturity_date, f.status, f.verification_status, f.created_at,
      f.updated_at,
      i.id AS institution_id, i.name AS institution_name,
      i.aicte_code, i.address AS institution_address, i.city, i.state,
      i.email AS institution_email,
      a.id AS application_id, a.application_type, a.programme_name,
      a.programme_level, a.discipline, a.current_intake, a.proposed_intake,
      a.academic_year, a.status AS application_status,
      v.result AS verification_result, v.verification_score,
      v.ocr_confidence, v.extracted_data, v.comparison_results,
      v.review_reason, v.verification_source, v.verified_at,
      v.bank_verification_result, v.verification_checks
    FROM fdrs f
    LEFT JOIN institutions i ON i.id = f.institution_id
    LEFT JOIN applications a ON a.id = f.application_id
    LEFT JOIN verifications v ON v.id = (
      SELECT latest.id
      FROM verifications latest
      WHERE latest.fdr_id = f.id
      ORDER BY latest.verified_at DESC, latest.id DESC
      LIMIT 1
    )
    ORDER BY f.created_at DESC, f.id DESC
  `).all();

  return rows.flatMap((row) => {
    const bankVerification = row.bank_verification_result
      ? JSON.parse(row.bank_verification_result)
      : null;
    const checks = row.verification_checks
      ? JSON.parse(row.verification_checks)
      : [];
    const comparisons = row.comparison_results
      ? JSON.parse(row.comparison_results)
      : [];
    const verificationStatus = getEffectiveVerificationStatus(
      row.verification_status,
      checks,
      bankVerification
    );
    const score = Number.isFinite(row.verification_score)
      ? row.verification_score
      : null;
    const failedChecks = checks.filter((item) => item.status === "FAILED");
    const mismatchedFields = comparisons.filter(
      (item) => item.result === "MISMATCH"
    );
    const bankFailed = String(bankVerification?.status || "").toUpperCase() === "FAILED";
    const requiresAttention =
      ["PENDING", "FLAGGED", "FAILED"].includes(verificationStatus) ||
      (score !== null && score < 70) ||
      failedChecks.length > 0 ||
      mismatchedFields.length > 0 ||
      bankFailed;

    if (!requiresAttention) {
      return [];
    }

    return [{
      id: row.id,
      fdr_number: row.fdr_number,
      bank_name: row.bank_name,
      amount: row.amount,
      issue_date: row.issue_date,
      maturity_date: row.maturity_date,
      status: row.status,
      verification_status: verificationStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      institution: row.institution_id
        ? {
            id: row.institution_id,
            name: row.institution_name,
            aicte_code: row.aicte_code,
            address: row.institution_address,
            city: row.city,
            state: row.state,
            email: row.institution_email
          }
        : null,
      application: row.application_id
        ? {
            id: row.application_id,
            application_type: row.application_type,
            programme_name: row.programme_name,
            programme_level: row.programme_level,
            discipline: row.discipline,
            current_intake: row.current_intake,
            proposed_intake: row.proposed_intake,
            academic_year: row.academic_year,
            status: row.application_status
          }
        : null,
      verification: row.verification_result
        ? {
            result: row.verification_result,
            score,
            ocr_confidence: row.ocr_confidence,
            extracted_data: row.extracted_data
              ? JSON.parse(row.extracted_data)
              : null,
            comparisons,
            review_reason: row.review_reason,
            source: row.verification_source,
            verified_at: row.verified_at,
            bank_verification: bankVerification,
            checks
          }
        : null,
      attention: {
        priority:
          verificationStatus === "FAILED" ||
          verificationStatus === "FLAGGED" ||
          bankFailed ||
          failedChecks.length > 0 ||
          mismatchedFields.length > 0 ||
          (score !== null && score < 70)
            ? "HIGH"
            : "MEDIUM",
        reasons: [
          ...failedChecks.map((item) => item.explanation || item.label),
          ...mismatchedFields.map((item) => `${item.field} mismatch`),
          ...(bankFailed ? ["Bank verification failed"] : []),
          ...(score !== null && score < 70
            ? [`Verification score is below 70/100 (${score}/100)`]
            : []),
          ...(["PENDING", "FLAGGED", "FAILED"].includes(verificationStatus)
            ? [`Verification status: ${verificationStatus}`]
            : [])
        ]
      }
    }];
  });
}

function getEffectiveVerificationStatus(storedStatus, checks, bankVerification) {
  const normalizedStatus = String(storedStatus || "").toUpperCase();

  if (normalizedStatus === "REJECTED") {
    return "REJECTED";
  }
  if (normalizedStatus === "FAILED") {
    return "FAILED";
  }

  if (Array.isArray(checks) && checks.length) {
    if (checks.some((item) => item.status === "FAILED")) {
      return "FLAGGED";
    }
    if (checks.some((item) => item.status !== "PASS")) {
      return "PENDING";
    }
  }

  return normalizedStatus === "VERIFIED" &&
    String(bankVerification?.status || "").toUpperCase() === "VERIFIED"
    ? "VERIFIED"
    : normalizedStatus === "VERIFIED"
      ? "PENDING"
      : normalizedStatus;
}

// ====================================================
// GET /api/officer/fdrs
// Get all FDRs for AICTE officers
// ====================================================

router.get(
  "/fdrs",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const rows = db
        .prepare(`
          SELECT
            f.id,
            f.fdr_number,
            f.bank_name,
            f.amount,
            f.issue_date,
            f.maturity_date,
            f.status,
            f.verification_status,
            f.created_at,
            f.updated_at,
            v.result AS verification_result,
            v.verification_score,
            v.ocr_confidence,
            v.extracted_data,
            v.comparison_results,
            v.review_reason,
            v.verification_source,
            v.verified_at,
            v.bank_verification_result,
            v.verification_checks,

            i.id AS institution_id,
            i.name AS institution_name,
            i.aicte_code,
            i.address AS institution_address,
            i.city,
            i.state,
            i.email AS institution_email,

            a.id AS application_id,
            a.application_type,
            a.programme_name,
            a.programme_level,
            a.discipline,
            a.current_intake,
            a.proposed_intake,
            a.academic_year,
            a.description AS application_description,
            a.status AS application_status,

            d.id AS document_id,
            d.file_name AS document_file_name,
            d.file_path AS document_file_path,
            d.document_type,
            d.uploaded_at AS document_uploaded_at

          FROM fdrs f

          INNER JOIN institutions i
            ON f.institution_id = i.id

          LEFT JOIN applications a
            ON f.application_id = a.id

          LEFT JOIN verifications v
            ON v.id = (
              SELECT latest.id
              FROM verifications latest
              WHERE latest.fdr_id = f.id
              ORDER BY latest.verified_at DESC, latest.id DESC
              LIMIT 1
            )

          LEFT JOIN documents d
            ON f.id = d.fdr_id

          ORDER BY f.created_at DESC, f.id DESC, d.uploaded_at DESC, d.id DESC
        `)
        .all();

      const fdrsById = new Map();

      for (const row of rows) {
        let fdr = fdrsById.get(row.id);

        if (!fdr) {
          const bankVerification = row.bank_verification_result
            ? JSON.parse(row.bank_verification_result)
            : null;
          const verificationChecks = row.verification_checks
            ? JSON.parse(row.verification_checks)
            : [];

          fdr = {
            id: row.id,
            fdr_number: row.fdr_number,
            bank_name: row.bank_name,
            amount: row.amount,
            issue_date: row.issue_date,
            maturity_date: row.maturity_date,
            status: row.status,
            verification_status: getEffectiveVerificationStatus(
              row.verification_status,
              verificationChecks,
              bankVerification
            ),
            created_at: row.created_at,
            updated_at: row.updated_at,
            institution: {
              id: row.institution_id,
              name: row.institution_name,
              aicte_code: row.aicte_code,
              address: row.institution_address,
              city: row.city,
              state: row.state,
              email: row.institution_email
            },
            application: row.application_id
              ? {
                  id: row.application_id,
                  application_type: row.application_type,
                  programme_name: row.programme_name,
                  programme_level: row.programme_level,
                  discipline: row.discipline,
                  current_intake: row.current_intake,
                  proposed_intake: row.proposed_intake,
                  academic_year: row.academic_year,
                  description: row.application_description,
                  status: row.application_status
                }
              : null,
            verification: row.verification_result
              ? {
                  result: row.verification_result,
                  score: row.verification_score,
                  ocr_confidence: row.ocr_confidence,
                  extracted_data: row.extracted_data
                    ? JSON.parse(row.extracted_data)
                    : null,
                  comparisons: row.comparison_results
                    ? JSON.parse(row.comparison_results)
                    : [],
                  review_reason: row.review_reason,
                  source: row.verification_source,
                  verified_at: row.verified_at,
                  bank_verification: bankVerification,
                  checks: verificationChecks
                }
              : null,
            documents: []
          };

          fdrsById.set(row.id, fdr);
        }

        if (row.document_id !== null) {
          fdr.documents.push({
            id: row.document_id,
            file_name: row.document_file_name,
            file_path: row.document_file_path,
            document_type: row.document_type,
            uploaded_at: row.document_uploaded_at
          });
        }
      }

      const fdrs = Array.from(fdrsById.values());

      res.json({
        count: fdrs.length,
        fdrs
      });

    } catch (error) {
      console.error("Officer FDR fetch error:", error);

      res.status(500).json({
        message: "Unable to fetch FDR records"
      });
    }
  }
);

router.get(
  "/fdrs/:id/documents/:documentId",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const fdrId = Number(req.params.id);
    const documentId = Number(req.params.documentId);

    if (
      !Number.isInteger(fdrId) ||
      !Number.isInteger(documentId)
    ) {
      return res.status(400).json({
        message: "Invalid FDR or document ID"
      });
    }

    try {
      const document = db
        .prepare(`
          SELECT file_path
          FROM documents
          WHERE id = ? AND fdr_id = ?
        `)
        .get(documentId, fdrId);

      if (!document) {
        return res.status(404).json({
          message: "Document not found"
        });
      }

      const documentPath = path.resolve(document.file_path);
      const relativePath = path.relative(uploadDirectory, documentPath);

      if (
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath) ||
        !fs.existsSync(documentPath)
      ) {
        return res.status(404).json({
          message: "Document file not found"
        });
      }

      const fileName = db.prepare(`
        SELECT file_name FROM documents WHERE id = ? AND fdr_id = ?
      `).get(documentId, fdrId)?.file_name;
      insertAudit(req.user.userId, "DOCUMENT_OPENED", "FDR", fdrId, null, {
        documentId,
        fileName
      });

      return res.sendFile(documentPath);
    } catch (error) {
      console.error("Officer FDR document fetch error:", error);

      return res.status(500).json({
        message: "Unable to open FDR document"
      });
    }
  }
);

router.get(
  "/stats",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      return res.json({ stats: getOfficerStatsSummary() });
    } catch (error) {
      console.error("Officer FDR statistics error:", error);
      return res.status(500).json({
        message: "Unable to fetch officer statistics"
      });
    }
  }
);

router.get(
  "/dashboard",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const stats = getOfficerStatsSummary();
      const verificationQueue = getOfficerVerificationQueueRecords();
      return res.json({
        source: "DATABASE",
        stats,
        verification_queue_count: verificationQueue.length
      });
    } catch (error) {
      console.error("Officer dashboard error:", error);
      return res.status(500).json({
        message: "Unable to fetch officer dashboard data"
      });
    }
  }
);

router.get(
  "/verification-queue",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const fdrs = getOfficerVerificationQueueRecords();
      return res.json({
        count: fdrs.length,
        verification_score_threshold: 70,
        fdrs
      });
    } catch (error) {
      console.error("Officer verification queue error:", error);
      return res.status(500).json({
        message: "Unable to fetch verification queue"
      });
    }
  }
);


// ====================================================
// GET /api/officer/fdrs/:id
// Get complete details of one FDR
// ====================================================

router.get(
  "/fdrs/:id/timeline",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const fdrId = Number(req.params.id);

    if (!Number.isInteger(fdrId) || fdrId <= 0) {
      return res.status(400).json({ message: "Invalid FDR ID" });
    }

    try {
      const fdr = db.prepare(`
        SELECT f.id, f.fdr_number, f.created_at, f.updated_at,
          f.verification_status, v.bank_verification_result,
          v.verification_checks
        FROM fdrs f
        LEFT JOIN verifications v ON v.id = (
          SELECT latest.id
          FROM verifications latest
          WHERE latest.fdr_id = f.id
          ORDER BY latest.verified_at DESC, latest.id DESC
          LIMIT 1
        )
        WHERE f.id = ?
      `).get(fdrId);

      if (!fdr) {
        return res.status(404).json({ message: "FDR not found" });
      }

      const bankVerification = fdr.bank_verification_result
        ? JSON.parse(fdr.bank_verification_result)
        : null;
      const verificationChecks = fdr.verification_checks
        ? JSON.parse(fdr.verification_checks)
        : [];
      const effectiveStatus = getEffectiveVerificationStatus(
        fdr.verification_status,
        verificationChecks,
        bankVerification
      );
      const events = db.prepare(`
        SELECT id, action, old_value, new_value, created_at
        FROM audit_logs
        WHERE entity_type = 'FDR' AND entity_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(fdrId).map((event) => {
        let details = null;
        const serialized = event.new_value || event.old_value;

        if (serialized) {
          try {
            details = JSON.parse(serialized);
          } catch (error) {
            console.error(
              `Unable to parse audit event ${event.id} for FDR ${fdrId}:`,
              error
            );
            details = { raw: serialized };
          }
        }

        const bankStatus = String(bankVerification?.status || "").toUpperCase();
        const action =
          event.action === "FDR_VERIFIED" && effectiveStatus !== "VERIFIED"
            ? "FDR_PENDING"
            : event.action === "BANK_VERIFICATION_COMPLETED" &&
                bankStatus !== "VERIFIED"
              ? bankStatus === "FAILED"
                ? "BANK_VERIFICATION_FAILED"
                : "BANK_VERIFICATION_PENDING"
              : event.action;

        return {
          id: `audit-${event.id}`,
          action,
          details: action !== event.action
            ? action === "FDR_PENDING"
              ? {
                  reason:
                    "Historical verification did not include confirmed bank verification."
                }
              : bankVerification
            : details,
          created_at: event.created_at,
          source: "AUDIT_LOG"
        };
      });

      const hasAction = (action) =>
        events.some((event) => event.action === action);

      if (
        bankVerification &&
        !events.some((event) =>
          [
            "BANK_VERIFICATION_COMPLETED",
            "BANK_VERIFICATION_PENDING",
            "BANK_VERIFICATION_FAILED"
          ].includes(event.action)
        )
      ) {
        const status = String(bankVerification.status || "").toUpperCase();
        events.push({
          id: `legacy-bank-${fdr.id}`,
          action:
            status === "VERIFIED"
              ? "BANK_VERIFICATION_COMPLETED"
              : status === "FAILED"
                ? "BANK_VERIFICATION_FAILED"
                : "BANK_VERIFICATION_PENDING",
          details: bankVerification,
          created_at: fdr.created_at,
          source: "VERIFICATION_RECORD"
        });
      }

      if (!hasAction("FDR_SUBMITTED")) {
        events.push({
          id: `legacy-submission-${fdr.id}`,
          action: "FDR_SUBMITTED",
          details: { fdrNumber: fdr.fdr_number },
          created_at: fdr.created_at,
          source: "FDR_RECORD"
        });
      }

      const statusAction = {
        VERIFIED: "FDR_VERIFIED",
        FLAGGED: "FDR_FLAGGED",
        FAILED: "FDR_FAILED",
        PENDING: "FDR_PENDING",
        REJECTED: "FDR_REJECTED"
      }[effectiveStatus];

      if (statusAction && !hasAction(statusAction)) {
        events.push({
          id: `legacy-status-${fdr.id}`,
          action: statusAction,
          details: { verificationStatus: fdr.verification_status },
          created_at: fdr.updated_at || fdr.created_at,
          source: "FDR_RECORD"
        });
      }

      const documents = db.prepare(`
        SELECT id, file_name, document_type, uploaded_at
        FROM documents
        WHERE fdr_id = ?
        ORDER BY uploaded_at ASC, id ASC
      `).all(fdrId);

      for (const document of documents) {
        const hasDocumentEvent = events.some(
          (event) =>
            event.action === "DOCUMENT_UPLOADED" &&
            event.details?.fileName === document.file_name
        );

        if (!hasDocumentEvent) {
          events.push({
            id: `legacy-document-${document.id}`,
            action: "DOCUMENT_UPLOADED",
            details: {
              fileName: document.file_name,
              documentType: document.document_type
            },
            created_at: document.uploaded_at,
            source: "DOCUMENT_RECORD"
          });
        }
      }

      if (
        !hasAction("VERIFICATION_SCORE_GENERATED") ||
        !hasAction("AUTOMATED_VERIFICATION_COMPLETED")
      ) {
        const verifications = db.prepare(`
          SELECT id, result, verification_score, verification_source,
            message, verified_at
          FROM verifications
          WHERE fdr_id = ?
          ORDER BY verified_at ASC, id ASC
        `).all(fdrId);

        for (const verification of verifications) {
          if (
            verification.verification_score !== null &&
            !hasAction("VERIFICATION_SCORE_GENERATED")
          ) {
            events.push({
              id: `legacy-score-${verification.id}`,
              action: "VERIFICATION_SCORE_GENERATED",
              details: { score: verification.verification_score },
              created_at: verification.verified_at,
              source: "VERIFICATION_RECORD"
            });
          }

          if (!hasAction("AUTOMATED_VERIFICATION_COMPLETED")) {
            events.push({
              id: `legacy-verification-${verification.id}`,
              action: "AUTOMATED_VERIFICATION_COMPLETED",
              details: {
                result: verification.result,
                source: verification.verification_source,
                reason: verification.message
              },
              created_at: verification.verified_at,
              source: "VERIFICATION_RECORD"
            });
          }
        }
      }

      events.sort((left, right) => {
        const timestampDifference =
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime();

        if (timestampDifference) {
          return timestampDifference;
        }

        const leftAuditId = Number(String(left.id).replace("audit-", ""));
        const rightAuditId = Number(String(right.id).replace("audit-", ""));

        if (Number.isFinite(leftAuditId) && Number.isFinite(rightAuditId)) {
          return leftAuditId - rightAuditId;
        }

        return String(left.id).localeCompare(String(right.id));
      });

      return res.json({ fdrId, count: events.length, events });
    } catch (error) {
      console.error("Officer FDR timeline error:", error);
      return res.status(500).json({
        message: "Unable to fetch FDR activity timeline"
      });
    }
  }
);

router.get(
  "/institutions/:id/compliance",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const institutionId = Number(req.params.id);

    if (!Number.isInteger(institutionId) || institutionId <= 0) {
      return res.status(400).json({ message: "Invalid institution ID" });
    }

    try {
      const compliance = calculateInstitutionCompliance(db, institutionId);

      if (!compliance) {
        return res.status(404).json({ message: "Institution not found" });
      }

      return res.json({ compliance });
    } catch (error) {
      console.error("Institution compliance score error:", error);
      return res.status(500).json({
        message: "Unable to calculate institution compliance score"
      });
    }
  }
);

router.get(
  "/fdrs/:id",
  authenticateToken,
  requireRole("OFFICER", "ADMIN"),
  (req, res) => {
    try {
      const fdrId = Number(req.params.id);

      if (!Number.isInteger(fdrId)) {
        return res.status(400).json({
          message: "Invalid FDR ID"
        });
      }

      const fdr = db
        .prepare(`
          SELECT
            f.id,
            f.fdr_number,
            f.bank_name,
            f.amount,
            f.issue_date,
            f.maturity_date,
            f.status,
            f.verification_status,
            f.created_at,
            f.updated_at,
            f.application_id,

            a.application_type,
            a.programme_name,
            a.programme_level,
            a.discipline,
            a.current_intake,
            a.proposed_intake,
            a.academic_year,
            a.description AS application_description,
            a.status AS application_status,

            v.result AS verification_result,
            v.verification_score,
            v.ocr_confidence,
            v.extracted_data,
            v.comparison_results,
            v.review_reason,
            v.verification_source,
            v.verified_at,
            v.bank_verification_result,
            v.verification_checks,

            i.id AS institution_id,
            i.name AS institution_name,
            i.aicte_code,
            i.address,
            i.city,
            i.state,
            i.email AS institution_email

          FROM fdrs f

          INNER JOIN institutions i
            ON f.institution_id = i.id

          LEFT JOIN applications a
            ON f.application_id = a.id

          LEFT JOIN verifications v
            ON v.id = (
              SELECT latest.id
              FROM verifications latest
              WHERE latest.fdr_id = f.id
              ORDER BY latest.verified_at DESC, latest.id DESC
              LIMIT 1
            )

          WHERE f.id = ?
        `)
        .get(fdrId);

      if (!fdr) {
        return res.status(404).json({
          message: "FDR not found"
        });
      }

      const documents = db
        .prepare(`
          SELECT
            id,
            file_name,
            file_path,
            document_type,
            uploaded_at
          FROM documents
          WHERE fdr_id = ?
          ORDER BY uploaded_at DESC
        `)
        .all(fdrId);

      const application = fdr.application_id
        ? {
            id: fdr.application_id,
            application_type: fdr.application_type,
            programme_name: fdr.programme_name,
            programme_level: fdr.programme_level,
            discipline: fdr.discipline,
            current_intake: fdr.current_intake,
            proposed_intake: fdr.proposed_intake,
            academic_year: fdr.academic_year,
            description: fdr.application_description,
            status: fdr.application_status
          }
        : null;

      const verification = fdr.verification_result
        ? {
            result: fdr.verification_result,
            score: fdr.verification_score,
            ocr_confidence: fdr.ocr_confidence,
            extracted_data: fdr.extracted_data
              ? JSON.parse(fdr.extracted_data)
              : null,
            comparisons: fdr.comparison_results
              ? JSON.parse(fdr.comparison_results)
              : [],
            review_reason: fdr.review_reason,
            source: fdr.verification_source,
            verified_at: fdr.verified_at,
            bank_verification: fdr.bank_verification_result
              ? JSON.parse(fdr.bank_verification_result)
              : null,
            checks: fdr.verification_checks
              ? JSON.parse(fdr.verification_checks)
              : []
          }
        : null;
      fdr.verification_status = getEffectiveVerificationStatus(
        fdr.verification_status,
        verification?.checks || [],
        verification?.bank_verification
      );

      delete fdr.application_type;
      delete fdr.programme_name;
      delete fdr.programme_level;
      delete fdr.discipline;
      delete fdr.current_intake;
      delete fdr.proposed_intake;
      delete fdr.academic_year;
      delete fdr.application_description;
      delete fdr.application_status;
      delete fdr.verification_result;
      delete fdr.verification_score;
      delete fdr.ocr_confidence;
      delete fdr.extracted_data;
      delete fdr.comparison_results;
      delete fdr.review_reason;
      delete fdr.verification_source;
      delete fdr.verified_at;
      delete fdr.bank_verification_result;
      delete fdr.verification_checks;

      const verifications = db
        .prepare(`
          SELECT
            id,
            submitted_amount,
            bank_amount,
            result,
            verification_source,
            message,
            verified_at
          FROM verifications
          WHERE fdr_id = ?
          ORDER BY verified_at DESC
        `)
        .all(fdrId);

      insertAudit(req.user.userId, "FDR_VIEWED", "FDR", fdrId, null, {
        fdrNumber: fdr.fdr_number
      });

      res.json({
        fdr,
        application,
        verification,
        documents,
        verifications
      });

    } catch (error) {
      console.error("Officer FDR detail error:", error);

      res.status(500).json({
        message: "Unable to fetch FDR details"
      });
    }
  }
);


// ====================================================
// PATCH /api/officer/fdrs/:id/verify
// Verify an FDR
// ====================================================

router.patch(
  "/fdrs/:id/verify",
  authenticateToken,
  requireRole("OFFICER", "ADMIN"),
  (req, res) => {
    try {
      const fdrId = Number(req.params.id);

      if (!Number.isInteger(fdrId)) {
        return res.status(400).json({
          message: "Invalid FDR ID"
        });
      }

      const {
        verificationSource,
        bankAmount,
        message
      } = req.body;

      const fdr = db
        .prepare(`
          SELECT *
          FROM fdrs
          WHERE id = ?
        `)
        .get(fdrId);

      if (!fdr) {
        return res.status(404).json({
          message: "FDR not found"
        });
      }

      if (fdr.verification_status === "VERIFIED") {
        return res.status(400).json({
          message: "FDR is already verified"
        });
      }

      if (fdr.verification_status === "REJECTED") {
        return res.status(400).json({
          message: "Rejected FDR cannot be verified directly"
        });
      }

      if (!verificationSource) {
        return res.status(400).json({
          message: "Verification source is required"
        });
      }

      const currentVerification = db.prepare(`
        SELECT verification_score, ocr_confidence, comparison_results,
          verification_checks, bank_verification_result
        FROM verifications
        WHERE fdr_id = ?
        ORDER BY verified_at DESC, id DESC
        LIMIT 1
      `).get(fdrId);
      const currentChecks = currentVerification?.verification_checks
        ? JSON.parse(currentVerification.verification_checks)
        : [];
      const currentBankVerification =
        currentVerification?.bank_verification_result
          ? JSON.parse(currentVerification.bank_verification_result)
          : null;

      if (
        String(currentBankVerification?.status || "").toUpperCase() !==
          "VERIFIED" ||
        !currentChecks.length ||
        currentChecks.some((item) => item.status !== "PASS")
      ) {
        return res.status(409).json({
          message:
            "FDR cannot be verified until all required checks and bank verification pass"
        });
      }

      const numericBankAmount =
        bankAmount === undefined ||
        bankAmount === null ||
        bankAmount === ""
          ? null
          : Number(bankAmount);

      if (
        numericBankAmount !== null &&
        (!Number.isFinite(numericBankAmount) ||
          numericBankAmount <= 0)
      ) {
        return res.status(400).json({
          message: "Bank amount must be a valid positive number"
        });
      }

      const transaction = db.transaction(() => {

        // Update FDR status
        db.prepare(`
          UPDATE fdrs
          SET
            verification_status = 'VERIFIED',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(fdrId);

        // Store verification record
        db.prepare(`
          INSERT INTO verifications (
            fdr_id,
            submitted_amount,
            bank_amount,
            result,
            verification_source,
            message,
            verification_score,
            ocr_confidence,
            comparison_results,
            bank_verification_result,
            verification_checks
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          numericBankAmount,
          "VERIFIED",
          verificationSource,
          message || null,
          currentVerification.verification_score,
          currentVerification.ocr_confidence,
          currentVerification.comparison_results,
          currentVerification.bank_verification_result,
          currentVerification.verification_checks
        );

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_value,
            new_value
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.user.userId,
          "OFFICER_REVIEWED",
          "FDR",
          fdrId,
          JSON.stringify({ verificationStatus: fdr.verification_status }),
          JSON.stringify({ decision: "VERIFIED", reason: message || null })
        );

        db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_value,
            new_value
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.user.userId,
          "FDR_VERIFIED",
          "FDR",
          fdrId,
          JSON.stringify({
            verificationStatus: fdr.verification_status
          }),
          JSON.stringify({
            verificationStatus: "VERIFIED",
            verificationSource,
            bankAmount: numericBankAmount
          })
        );
      });

      transaction();

      res.json({
        message: "FDR verified successfully",
        fdrId,
        verificationStatus: "VERIFIED"
      });

    } catch (error) {
      console.error("FDR verification error:", error);

      res.status(500).json({
        message: "Unable to verify FDR"
      });
    }
  }
);


// ====================================================
// PATCH /api/officer/fdrs/:id/reject
// Reject an FDR
// ====================================================

router.patch(
  "/fdrs/:id/reject",
  authenticateToken,
  requireRole("OFFICER", "ADMIN"),
  (req, res) => {
    try {
      const fdrId = Number(req.params.id);

      if (!Number.isInteger(fdrId)) {
        return res.status(400).json({
          message: "Invalid FDR ID"
        });
      }

      const {
        verificationSource,
        message
      } = req.body;

      const fdr = db
        .prepare(`
          SELECT *
          FROM fdrs
          WHERE id = ?
        `)
        .get(fdrId);

      if (!fdr) {
        return res.status(404).json({
          message: "FDR not found"
        });
      }

      if (fdr.verification_status === "VERIFIED") {
        return res.status(400).json({
          message: "Verified FDR cannot be rejected directly"
        });
      }

      if (!message) {
        return res.status(400).json({
          message: "Rejection reason is required"
        });
      }

      const currentVerification = db.prepare(`
        SELECT verification_score, ocr_confidence, extracted_data,
          comparison_results, bank_verification_result, verification_checks
        FROM verifications
        WHERE fdr_id = ?
        ORDER BY verified_at DESC, id DESC
        LIMIT 1
      `).get(fdrId);

      const transaction = db.transaction(() => {

        // Update status
        db.prepare(`
          UPDATE fdrs
          SET
            verification_status = 'REJECTED',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(fdrId);

        // Store verification attempt
        db.prepare(`
          INSERT INTO verifications (
            fdr_id,
            submitted_amount,
            bank_amount,
            result,
            verification_source,
            message,
            verification_score,
            ocr_confidence,
            extracted_data,
            comparison_results,
            review_reason,
            bank_verification_result,
            verification_checks
          )
          VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          "REJECTED",
          verificationSource || null,
          message,
          currentVerification?.verification_score ?? null,
          currentVerification?.ocr_confidence ?? null,
          currentVerification?.extracted_data ?? null,
          currentVerification?.comparison_results ?? null,
          message,
          currentVerification?.bank_verification_result ?? null,
          currentVerification?.verification_checks ?? null
        );

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_value,
            new_value
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.user.userId,
          "OFFICER_REVIEWED",
          "FDR",
          fdrId,
          JSON.stringify({ verificationStatus: fdr.verification_status }),
          JSON.stringify({ decision: "REJECTED", reason: message })
        );

        db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_value,
            new_value
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          req.user.userId,
          "FDR_REJECTED",
          "FDR",
          fdrId,
          JSON.stringify({
            verificationStatus: fdr.verification_status
          }),
          JSON.stringify({
            verificationStatus: "REJECTED",
            reason: message
          })
        );
      });

      transaction();

      res.json({
        message: "FDR rejected successfully",
        fdrId,
        verificationStatus: "REJECTED"
      });

    } catch (error) {
      console.error("FDR rejection error:", error);

      res.status(500).json({
        message: "Unable to reject FDR"
      });
    }
  }
);

router.post(
  "/fdrs/:id/override",
  authenticateToken,
  requireRole("OFFICER", "ADMIN"),
  (req, res) => {
    const fdrId = Number(req.params.id);
    const decision = String(req.body.decision || "").toUpperCase();
    const reason = String(req.body.reason || "").trim();

    if (!Number.isInteger(fdrId) || fdrId <= 0) {
      return res.status(400).json({
        message: "Invalid FDR ID"
      });
    }

    if (!["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({
        message: "Decision must be APPROVE or REJECT"
      });
    }

    if (!reason) {
      return res.status(400).json({
        message: "An officer review reason is required"
      });
    }

    try {
      const fdr = db.prepare(`
        SELECT
          f.*,
          i.user_id AS institution_user_id
        FROM fdrs f
        INNER JOIN institutions i ON i.id = f.institution_id
        WHERE f.id = ?
      `).get(fdrId);

      if (!fdr) {
        return res.status(404).json({
          message: "FDR not found"
        });
      }

      if (["VERIFIED", "REJECTED"].includes(fdr.verification_status)) {
        return res.status(409).json({
          message: "This FDR has already received a final decision"
        });
      }

      const currentVerification = db.prepare(`
        SELECT verification_score, ocr_confidence, extracted_data,
          comparison_results, bank_verification_result, verification_checks
        FROM verifications
        WHERE fdr_id = ?
        ORDER BY verified_at DESC, id DESC
        LIMIT 1
      `).get(fdrId);

      if (decision === "APPROVE") {
        const bankVerification = currentVerification?.bank_verification_result
          ? JSON.parse(currentVerification.bank_verification_result)
          : null;
        const verificationChecks = currentVerification?.verification_checks
          ? JSON.parse(currentVerification.verification_checks)
          : [];

        if (
          String(bankVerification?.status || "").toUpperCase() !== "VERIFIED" ||
          !verificationChecks.length ||
          verificationChecks.some((item) => item.status !== "PASS")
        ) {
          return res.status(409).json({
            message:
              "FDR cannot be approved until all required checks and bank verification pass"
          });
        }
      }

      const newStatus = decision === "APPROVE" ? "VERIFIED" : "REJECTED";
      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE fdrs
          SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStatus, fdrId);

        db.prepare(`
          INSERT INTO verifications (
            fdr_id,
            submitted_amount,
            bank_amount,
            result,
            verification_source,
            message,
            verification_score,
            ocr_confidence,
            extracted_data,
            comparison_results,
            review_reason,
            bank_verification_result,
            verification_checks
          )
          VALUES (?, ?, NULL, ?, 'OFFICER_OVERRIDE', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          newStatus,
          reason,
          currentVerification?.verification_score ?? null,
          currentVerification?.ocr_confidence ?? null,
          currentVerification?.extracted_data ?? null,
          currentVerification?.comparison_results ?? null,
          reason,
          currentVerification?.bank_verification_result ?? null,
          currentVerification?.verification_checks ?? null
        );

        const audit = db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_value,
            new_value
          )
          VALUES (?, ?, 'FDR', ?, ?, ?)
        `);

        audit.run(
          req.user.userId,
          "OFFICER_REVIEWED",
          fdrId,
          JSON.stringify({ verificationStatus: fdr.verification_status }),
          JSON.stringify({ decision: newStatus, reason })
        );

        audit.run(
          req.user.userId,
          "OFFICER_OVERRIDE",
          fdrId,
          JSON.stringify({ verificationStatus: fdr.verification_status }),
          JSON.stringify({ verificationStatus: newStatus, reason })
        );

        if (newStatus === "REJECTED") {
          audit.run(
            req.user.userId,
            "FDR_REJECTED",
            fdrId,
            JSON.stringify({ verificationStatus: fdr.verification_status }),
            JSON.stringify({ verificationStatus: newStatus, reason })
          );
        } else {
          audit.run(
            req.user.userId,
            "FDR_VERIFIED",
            fdrId,
            JSON.stringify({ verificationStatus: fdr.verification_status }),
            JSON.stringify({ verificationStatus: newStatus, reason })
          );
        }

        if (fdr.institution_user_id) {
          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, ?, ?, ?)
          `).run(
            fdr.institution_user_id,
            `FDR ${fdr.fdr_number} was ${newStatus.toLowerCase()} by an officer: ${reason}`,
            `FDR_${newStatus}`,
            fdrId,
            fdr.application_id
          );
        }
      });

      transaction();

      return res.json({
        message: `FDR ${newStatus.toLowerCase()} by officer review`,
        fdrId,
        verificationStatus: newStatus
      });
    } catch (error) {
      console.error("Officer FDR override error:", error);
      return res.status(500).json({
        message: "Unable to record officer decision"
      });
    }
  }
);

router.get(
  "/institutions",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const institutions = db.prepare(`
        SELECT i.id, i.name, i.aicte_code, i.address, i.city, i.state, i.email,
          i.created_at,
          COUNT(f.id) AS total_fdrs,
          SUM(CASE WHEN f.verification_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_fdrs,
          SUM(CASE WHEN f.verification_status IN ('PENDING', 'FLAGGED', 'FAILED') THEN 1 ELSE 0 END) AS pending_fdrs,
          (SELECT COUNT(*) FROM applications a WHERE a.institution_id = i.id) AS total_applications
        FROM institutions i
        LEFT JOIN fdrs f ON f.institution_id = i.id
        GROUP BY i.id
        ORDER BY i.name COLLATE NOCASE
      `).all();
      const institutionsWithCompliance = institutions.map((institution) => {
        const compliance = calculateInstitutionCompliance(db, institution.id);
        return {
          ...institution,
          compliance_score: compliance?.score ?? 0
        };
      });

      return res.json({
        count: institutionsWithCompliance.length,
        institutions: institutionsWithCompliance
      });
    } catch (error) {
      console.error("Officer institution list error:", error);
      return res.status(500).json({ message: "Unable to fetch institutions" });
    }
  }
);

router.get(
  "/institutions/:id",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const institutionId = Number(req.params.id);
    if (!Number.isInteger(institutionId) || institutionId <= 0) {
      return res.status(400).json({ message: "Invalid institution ID" });
    }

    try {
      const institution = db.prepare(`
        SELECT id, name, aicte_code, address, city, state, email, created_at
        FROM institutions WHERE id = ?
      `).get(institutionId);
      if (!institution) {
        return res.status(404).json({ message: "Institution not found" });
      }

      const fdrs = db.prepare(`
        SELECT f.id, f.fdr_number, f.bank_name, f.amount, f.issue_date,
          f.maturity_date, f.status, f.verification_status, f.created_at,
          a.id AS application_id, a.application_type, a.programme_name,
          a.status AS application_status,
          v.verification_score, v.bank_verification_result
        FROM fdrs f
        LEFT JOIN applications a ON a.id = f.application_id
        LEFT JOIN verifications v ON v.id = (
          SELECT latest.id FROM verifications latest
          WHERE latest.fdr_id = f.id
          ORDER BY latest.verified_at DESC, latest.id DESC LIMIT 1
        )
        WHERE f.institution_id = ?
        ORDER BY f.created_at DESC, f.id DESC
      `).all(institutionId).map((fdr) => ({
        ...fdr,
        bank_verification: fdr.bank_verification_result
          ? JSON.parse(fdr.bank_verification_result)
          : null
      }));

      const applications = db.prepare(`
        SELECT id, application_type, programme_name, programme_level,
          discipline, current_intake, proposed_intake, academic_year,
          description, status, created_at
        FROM applications
        WHERE institution_id = ?
        ORDER BY created_at DESC, id DESC
      `).all(institutionId);

      const compliance = calculateInstitutionCompliance(db, institutionId);
      const verificationHistory = db.prepare(`
        SELECT v.id, v.fdr_id, f.fdr_number, v.result, v.verification_source,
          v.message, v.verified_at
        FROM verifications v
        JOIN fdrs f ON f.id = v.fdr_id
        WHERE f.institution_id = ?
        ORDER BY v.verified_at DESC, v.id DESC
      `).all(institutionId);
      const documents = db.prepare(`
        SELECT d.id, d.fdr_id, f.fdr_number, d.file_name, d.document_type,
          d.uploaded_at
        FROM documents d
        JOIN fdrs f ON f.id = d.fdr_id
        WHERE f.institution_id = ?
        ORDER BY d.uploaded_at DESC, d.id DESC
      `).all(institutionId);

      return res.json({
        institution,
        fdrs,
        applications,
        verificationHistory,
        documents,
        compliance
      });
    } catch (error) {
      console.error("Officer institution detail error:", error);
      return res.status(500).json({
        message: "Unable to fetch institution details"
      });
    }
  }
);

router.get(
  "/release-requests",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const requests = db.prepare(`
        SELECT r.id, r.fdr_id, r.reason, r.status, r.reviewed_by,
          r.reviewed_at, r.created_at,
          f.fdr_number, f.amount, f.bank_name,
          i.id AS institution_id, i.name AS institution_name,
          u.name AS reviewer_name
        FROM release_requests r
        JOIN fdrs f ON f.id = r.fdr_id
        JOIN institutions i ON i.id = f.institution_id
        LEFT JOIN users u ON u.id = r.reviewed_by
        ORDER BY r.created_at DESC, r.id DESC
      `).all();
      return res.json({ count: requests.length, requests });
    } catch (error) {
      console.error("Officer release request list error:", error);
      return res.status(500).json({
        message: "Unable to fetch release requests"
      });
    }
  }
);

router.patch(
  "/release-requests/:id",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const requestId = Number(req.params.id);
    const decision = String(req.body.decision || "").toUpperCase();
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ message: "Invalid release request ID" });
    }
    if (!["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ message: "Decision must be APPROVE or REJECT" });
    }
    if (!reason) {
      return res.status(400).json({ message: "A review reason is required" });
    }

    try {
      const request = db.prepare(`
        SELECT r.*, f.fdr_number, i.user_id AS institution_user_id
        FROM release_requests r
        JOIN fdrs f ON f.id = r.fdr_id
        JOIN institutions i ON i.id = f.institution_id
        WHERE r.id = ?
      `).get(requestId);
      if (!request) {
        return res.status(404).json({ message: "Release request not found" });
      }
      if (request.status !== "PENDING") {
        return res.status(409).json({
          message: "Only pending release requests can be reviewed"
        });
      }

      const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE release_requests
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'PENDING'
        `).run(status, req.user.userId, requestId);
        insertAudit(
          req.user.userId,
          `RELEASE_REQUEST_${status}`,
          "RELEASE_REQUEST",
          requestId,
          { status: request.status },
          { status, reason, fdrId: request.fdr_id }
        );
        if (request.institution_user_id) {
          db.prepare(`
            INSERT INTO notifications (user_id, message, type)
            VALUES (?, ?, ?)
          `).run(
            request.institution_user_id,
            `Release request for ${request.fdr_number} was ${status.toLowerCase()}: ${reason}`,
            `RELEASE_REQUEST_${status}`
          );
        }
      });
      transaction();
      return res.json({ requestId, status, message: `Request ${status.toLowerCase()}` });
    } catch (error) {
      console.error("Officer release request review error:", error);
      return res.status(500).json({
        message: "Unable to review release request"
      });
    }
  }
);

router.get(
  "/notifications",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const notifications = db.prepare(`
        SELECT id, message, type, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `).all(req.user.userId);
      return res.json({
        count: notifications.length,
        unreadCount: notifications.filter((item) => !item.is_read).length,
        notifications
      });
    } catch (error) {
      console.error("Officer notifications error:", error);
      return res.status(500).json({ message: "Unable to fetch notifications" });
    }
  }
);

router.patch(
  "/notifications/read-all",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const result = db.prepare(`
        UPDATE notifications SET is_read = 1
        WHERE user_id = ? AND is_read = 0
      `).run(req.user.userId);
      return res.json({ updated: result.changes });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      return res.status(500).json({
        message: "Unable to update notifications"
      });
    }
  }
);

router.patch(
  "/notifications/:id/read",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }
    try {
      const result = db.prepare(`
        UPDATE notifications SET is_read = 1
        WHERE id = ? AND user_id = ?
      `).run(notificationId, req.user.userId);
      if (!result.changes) {
        return res.status(404).json({ message: "Notification not found" });
      }
      return res.json({ notificationId, is_read: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      return res.status(500).json({
        message: "Unable to update notification"
      });
    }
  }
);

router.get(
  "/audit-logs",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const logs = db.prepare(`
        SELECT l.id, l.action, l.entity_type, l.entity_id, l.old_value,
          l.new_value, l.created_at, u.name AS user_name, u.email AS user_email
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 500
      `).all();
      return res.json({ count: logs.length, logs });
    } catch (error) {
      console.error("Officer audit log error:", error);
      return res.status(500).json({ message: "Unable to fetch audit logs" });
    }
  }
);

router.get(
  "/users",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, name, email, role, created_at
        FROM users
        ORDER BY created_at DESC, id DESC
      `).all();
      return res.json({ count: users.length, users });
    } catch (error) {
      console.error("Officer user list error:", error);
      return res.status(500).json({ message: "Unable to fetch users" });
    }
  }
);

router.get(
  "/renewals",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const renewals = db.prepare(`
        SELECT r.id, r.renewal_date, r.status, r.requested_maturity_date,
          r.reason, r.reviewed_at, r.review_reason,
          old_fdr.id AS old_fdr_id,
          old_fdr.fdr_number AS old_fdr_number,
          new_fdr.id AS new_fdr_id, new_fdr.fdr_number AS new_fdr_number,
          old_fdr.bank_name, old_fdr.amount,
          old_fdr.maturity_date AS current_maturity_date,
          old_fdr.verification_status AS old_fdr_verification_status,
          new_fdr.verification_status AS new_fdr_verification_status,
          i.id AS institution_id, i.name AS institution_name,
          i.user_id AS institution_user_id
        FROM renewals r
        JOIN fdrs old_fdr ON old_fdr.id = r.old_fdr_id
        LEFT JOIN fdrs new_fdr ON new_fdr.id = r.new_fdr_id
        JOIN institutions i ON i.id = old_fdr.institution_id
        ORDER BY r.renewal_date DESC, r.id DESC
      `).all();
      return res.json({ count: renewals.length, renewals });
    } catch (error) {
      console.error("Officer renewals error:", error);
      return res.status(500).json({ message: "Unable to fetch renewals" });
    }
  }
);

router.patch(
  "/renewals/:id/review",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const renewalId = Number(req.params.id);
    const status = String(req.body.status || "").toUpperCase();
    const reason = String(req.body.reason || "").trim();
    const allowedStatuses = new Set([
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "ACTION_REQUIRED"
    ]);
    if (!Number.isInteger(renewalId) || renewalId <= 0) {
      return res.status(400).json({ message: "Invalid renewal ID" });
    }
    if (!allowedStatuses.has(status) || !reason) {
      return res.status(400).json({
        message: "Select a valid renewal status and provide a review reason."
      });
    }
    try {
      const renewal = db.prepare(`
        SELECT r.id, r.status, r.old_fdr_id, r.new_fdr_id, f.fdr_number,
          f.institution_id, i.user_id AS institution_user_id
        FROM renewals r
        JOIN fdrs f ON f.id = r.old_fdr_id
        JOIN institutions i ON i.id = f.institution_id
        WHERE r.id = ?
      `).get(renewalId);
      if (!renewal) {
        return res.status(404).json({ message: "Renewal request not found" });
      }
      if (renewal.new_fdr_id || ["APPROVED", "REJECTED"].includes(renewal.status)) {
        return res.status(409).json({
          message: "This renewal request has already received a final review."
        });
      }
      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE renewals
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_reason = ?
          WHERE id = ?
        `).run(status, req.user.userId, reason, renewalId);
        insertAudit(
          req.user.userId,
          "RENEWAL_STATUS_CHANGED",
          "RENEWAL",
          renewalId,
          { status: renewal.status },
          { status, reason }
        );
        const notificationMessage = {
          UNDER_REVIEW: "Your renewal request is now under review.",
          APPROVED: "Your renewal request has been approved.",
          REJECTED: "Your renewal request has been rejected.",
          ACTION_REQUIRED: "Additional action is required for your renewal request."
        }[status];
        db.prepare(`
          INSERT INTO notifications (
            user_id, message, type, fdr_id, renewal_id
          )
          VALUES (?, ?, ?, ?, ?)
        `).run(
          renewal.institution_user_id,
          notificationMessage,
          status === "ACTION_REQUIRED"
            ? "ACTION_REQUIRED"
            : `RENEWAL_${status}`,
          renewal.old_fdr_id,
          renewalId
        );
      });
      transaction();
      return res.json({ id: renewalId, status, message: "Renewal review saved." });
    } catch (error) {
      console.error("Officer renewal review error:", error);
      return res.status(500).json({ message: "Unable to review renewal request" });
    }
  }
);

router.get(
  "/master-data",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const banks = db.prepare(`
        SELECT DISTINCT bank_name AS name FROM fdrs
        WHERE trim(bank_name) <> '' ORDER BY bank_name COLLATE NOCASE
      `).all().map((item) => item.name);
      const disciplines = db.prepare(`
        SELECT DISTINCT discipline AS name FROM applications
        WHERE discipline IS NOT NULL AND trim(discipline) <> ''
        ORDER BY discipline COLLATE NOCASE
      `).all().map((item) => item.name);
      const programmeLevels = db.prepare(`
        SELECT DISTINCT programme_level AS name FROM applications
        WHERE programme_level IS NOT NULL AND trim(programme_level) <> ''
        ORDER BY programme_level COLLATE NOCASE
      `).all().map((item) => item.name);
      const states = db.prepare(`
        SELECT DISTINCT state AS name FROM institutions
        WHERE state IS NOT NULL AND trim(state) <> ''
        ORDER BY state COLLATE NOCASE
      `).all().map((item) => item.name);
      return res.json({
        source: "derived from existing FDR, application, and institution data",
        banks,
        applicationTypes: [
          "NEW_INSTITUTION", "NEW_PROGRAMME", "INCREASE_INTAKE",
          "RENEWAL", "REPLACEMENT", "MODIFICATION", "OTHER"
        ],
        programmeLevels,
        disciplines,
        states
      });
    } catch (error) {
      console.error("Officer master data error:", error);
      return res.status(500).json({ message: "Unable to fetch master data" });
    }
  }
);

router.get(
  "/me",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const user = db.prepare(`
        SELECT id, name, email, role, created_at
        FROM users
        WHERE id = ? AND role = 'OFFICER'
      `).get(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "Officer profile not found" });
      }
      return res.json({ user });
    } catch (error) {
      console.error("Officer profile error:", error);
      return res.status(500).json({ message: "Unable to fetch officer profile" });
    }
  }
);

router.patch(
  "/me",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "A valid name and email are required"
      });
    }
    try {
      const oldUser = db.prepare(`
        SELECT id, name, email, role FROM users
        WHERE id = ? AND role = 'OFFICER'
      `).get(req.user.userId);
      if (!oldUser) {
        return res.status(404).json({ message: "Officer profile not found" });
      }
      db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(
        name,
        email,
        req.user.userId
      );
      insertAudit(req.user.userId, "OFFICER_PROFILE_UPDATED", "USER", req.user.userId, oldUser, {
        name,
        email
      });
      return res.json({ user: { ...oldUser, name, email } });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ message: "That email is already in use" });
      }
      console.error("Officer profile update error:", error);
      return res.status(500).json({ message: "Unable to update officer profile" });
    }
  }
);

router.get(
  "/reports",
  authenticateToken,
  requireRole("OFFICER"),
  (req, res) => {
    try {
      const byBank = db.prepare(`
        SELECT bank_name AS label, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
        FROM fdrs GROUP BY bank_name ORDER BY count DESC, label COLLATE NOCASE
      `).all();
      const byApplicationType = db.prepare(`
        SELECT COALESCE(a.application_type, 'UNLINKED') AS label,
          COUNT(f.id) AS count
        FROM fdrs f LEFT JOIN applications a ON a.id = f.application_id
        GROUP BY label ORDER BY count DESC, label
      `).all();
      const expiry = db.prepare(`
        SELECT
          SUM(CASE WHEN date(maturity_date) < date('now') THEN 1 ELSE 0 END) AS matured,
          SUM(CASE WHEN date(maturity_date) >= date('now') AND date(maturity_date) < date('now', '+30 days') THEN 1 ELSE 0 END) AS critical,
          SUM(CASE WHEN date(maturity_date) >= date('now', '+30 days') AND date(maturity_date) <= date('now', '+90 days') THEN 1 ELSE 0 END) AS expiring_soon,
          SUM(CASE WHEN date(maturity_date) > date('now', '+90 days') THEN 1 ELSE 0 END) AS normal
        FROM fdrs
      `).get();
      const stats = db.prepare(`
        SELECT COUNT(*) AS total_fdrs,
          SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN verification_status = 'FLAGGED' THEN 1 ELSE 0 END) AS flagged,
          SUM(CASE WHEN verification_status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
          COALESCE(SUM(amount), 0) AS total_deposit_amount,
          (SELECT COUNT(*) FROM institutions) AS institutions
        FROM fdrs
      `).get();
      return res.json({ stats, byBank, byApplicationType, expiry });
    } catch (error) {
      console.error("Officer reports error:", error);
      return res.status(500).json({ message: "Unable to generate reports" });
    }
  }
);

router.post(
  "/fdrs/:id/run-verification",
  authenticateToken,
  requireRole("OFFICER"),
  async (req, res) => {
    const fdrId = Number(req.params.id);
    if (!Number.isInteger(fdrId) || fdrId <= 0) {
      return res.status(400).json({ message: "Invalid FDR ID" });
    }
    try {
      const fdr = db.prepare(`
        SELECT f.*, i.name AS institution_name, i.id AS institution_id,
          i.user_id AS institution_user_id,
          a.id AS linked_application_id
        FROM fdrs f
        JOIN institutions i ON i.id = f.institution_id
        LEFT JOIN applications a ON a.id = f.application_id
        WHERE f.id = ?
      `).get(fdrId);
      if (!fdr) {
        return res.status(404).json({ message: "FDR not found" });
      }
      const document = db.prepare(`
        SELECT id, file_name, file_path FROM documents
        WHERE fdr_id = ? ORDER BY uploaded_at DESC, id DESC LIMIT 1
      `).get(fdrId);
      const integrityChecks = [
        {
          key: "institution_relationship",
          label: "Institution Relationship",
          status: fdr.institution_id ? "PASS" : "FAILED",
          explanation: fdr.institution_id
            ? "FDR is linked to an existing institution."
            : "FDR has no valid institution relationship."
        },
        {
          key: "application_relationship",
          label: "Application Relationship",
          status: fdr.application_id && fdr.linked_application_id ? "PASS" : "FAILED",
          explanation: fdr.application_id && fdr.linked_application_id
            ? "FDR is linked to an existing application."
            : "FDR does not have a valid application relationship."
        },
        {
          key: "document_exists",
          label: "Document Validation",
          status: document && fs.existsSync(document.file_path) ? "PASS" : "FAILED",
          explanation: document && fs.existsSync(document.file_path)
            ? "Uploaded FDR document exists."
            : "Uploaded FDR document is missing."
        }
      ];
      const extraction = document && fs.existsSync(document.file_path)
        ? await extractFdrData({
            path: document.file_path,
            originalname: document.file_name
          })
        : {
            provider: "NOT_AVAILABLE",
            extracted: null,
            confidence: null,
            message: "No accessible FDR document was found."
          };
      const duplicate = db.prepare(`
        SELECT id, fdr_number, institution_id
        FROM fdrs
        WHERE id != ? AND lower(trim(fdr_number)) = lower(trim(?))
        ORDER BY id ASC LIMIT 1
      `).get(fdrId, fdr.fdr_number);
      const previous = getLatestVerification(fdrId);
      const bankVerification = previous?.bank_verification_result
        ? JSON.parse(previous.bank_verification_result)
        : await verifyBankFdr({
            fdrNumber: fdr.fdr_number,
            bankName: fdr.bank_name,
            amount: fdr.amount,
            issueDate: fdr.issue_date,
            maturityDate: fdr.maturity_date,
            status: fdr.status
          });
      const result = verifyFdr({
        submitted: {
          fdrNumber: fdr.fdr_number,
          bankName: fdr.bank_name,
          amount: fdr.amount,
          issueDate: fdr.issue_date,
          maturityDate: fdr.maturity_date,
          status: fdr.status
        },
        institution: { name: fdr.institution_name },
        extracted: extraction.extracted,
        ocrConfidence: extraction.confidence,
        extractionMessage: extraction.message,
        extractionFailure: extraction.provider === "ERROR",
        duplicate,
        bankVerification
      });
      const failedIntegrity = integrityChecks.some((item) => item.status === "FAILED");
      const checks = [...result.checks, ...integrityChecks];
      const overall = failedIntegrity ? "FLAGGED" : result.result;
      const reason = [
        result.reason,
        ...integrityChecks
          .filter((item) => item.status !== "PASS")
          .map((item) => `${item.label}: ${item.explanation}`)
      ].filter(Boolean).join(" ");

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO verifications (
            fdr_id, submitted_amount, bank_amount, result, verification_source,
            message, verification_score, ocr_confidence, extracted_data,
            comparison_results, review_reason, bank_verification_result,
            verification_checks
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          bankVerification.amount ?? null,
          overall,
          extraction.provider,
          reason,
          result.score,
          result.confidence,
          extraction.extracted ? JSON.stringify(extraction.extracted) : null,
          JSON.stringify(result.fields),
          reason,
          JSON.stringify(bankVerification),
          JSON.stringify(checks)
        );
        db.prepare(`
          UPDATE fdrs SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(overall, fdrId);
        insertAudit(req.user.userId, "AUTOMATED_VERIFICATION_COMPLETED", "FDR", fdrId, null, {
          result: overall,
          score: result.score,
          checks,
          reason
        });
        insertAudit(req.user.userId, "VERIFICATION_SCORE_GENERATED", "FDR", fdrId, null, {
          score: result.score,
          checks
        });
        const statusAuditAction = {
          VERIFIED: "FDR_VERIFIED",
          FLAGGED: "FDR_FLAGGED",
          FAILED: "FDR_FAILED",
          REJECTED: "FDR_REJECTED"
        }[overall] || "FDR_PENDING";
        insertAudit(req.user.userId, statusAuditAction, "FDR", fdrId, null, {
          result: overall,
          reason
        });
        if (fdr.institution_user_id) {
          const message = {
            VERIFIED: `FDR ${fdr.fdr_number} passed automated verification.`,
            FLAGGED: `FDR ${fdr.fdr_number} requires officer review. ${reason}`,
            FAILED: `FDR ${fdr.fdr_number} failed automated verification. ${reason}`,
            PENDING: `Automated verification for FDR ${fdr.fdr_number} is pending.`
          }[overall];
          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, ?, ?, ?)
          `).run(
            fdr.institution_user_id,
            message,
            ["FLAGGED", "FAILED"].includes(overall)
              ? "ACTION_REQUIRED"
              : `FDR_${overall}`,
            fdrId,
            fdr.application_id
          );
        }
      });
      transaction();
      return res.json({
        fdrId,
        verificationStatus: overall,
        score: result.score,
        checks,
        reason
      });
    } catch (error) {
      console.error("Officer automated verification error:", error);
      return res.status(500).json({ message: "Unable to run automated verification" });
    }
  }
);

router.post(
  "/fdrs/:id/bank-verify",
  authenticateToken,
  requireRole("OFFICER"),
  async (req, res) => {
    const fdrId = Number(req.params.id);
    if (!Number.isInteger(fdrId) || fdrId <= 0) {
      return res.status(400).json({ message: "Invalid FDR ID" });
    }
    try {
      const fdr = db.prepare(`
        SELECT f.*, i.user_id AS institution_user_id
        FROM fdrs f
        JOIN institutions i ON i.id = f.institution_id
        WHERE f.id = ?
      `).get(fdrId);
      if (!fdr) {
        return res.status(404).json({ message: "FDR not found" });
      }
      const previous = getLatestVerification(fdrId);
      if (!previous) {
        return res.status(409).json({
          message: "Run automated verification before bank verification"
        });
      }
      const bankVerification = await verifyBankFdr(
        {
          fdrNumber: fdr.fdr_number,
          bankName: fdr.bank_name,
          amount: fdr.amount,
          issueDate: fdr.issue_date,
          maturityDate: fdr.maturity_date,
          status: fdr.status
        },
        createConfiguredMockBankProvider()
      );
      const extraction = previous.extracted_data
        ? JSON.parse(previous.extracted_data)
        : null;
      const duplicate = db.prepare(`
        SELECT id, fdr_number, institution_id FROM fdrs
        WHERE id != ? AND lower(trim(fdr_number)) = lower(trim(?))
        ORDER BY id ASC LIMIT 1
      `).get(fdrId, fdr.fdr_number);
      const institution = db.prepare(`
        SELECT name FROM institutions WHERE id = ?
      `).get(fdr.institution_id);
      const result = verifyFdr({
        submitted: {
          fdrNumber: fdr.fdr_number,
          bankName: fdr.bank_name,
          amount: fdr.amount,
          issueDate: fdr.issue_date,
          maturityDate: fdr.maturity_date,
          status: fdr.status
        },
        institution,
        extracted: extraction,
        ocrConfidence: previous.ocr_confidence,
        extractionMessage:
          previous.verification_source === "NOT_CONFIGURED"
            ? "OCR provider is not configured; document data was not extracted."
            : previous.message,
        extractionFailure: previous.verification_source === "ERROR",
        duplicate,
        bankVerification
      });
      const integrityChecks = (previous.verification_checks
        ? JSON.parse(previous.verification_checks)
        : []).filter((item) =>
        ["institution_relationship", "application_relationship", "document_exists"].includes(item.key)
      );
      const checks = [...result.checks, ...integrityChecks];
      const failedIntegrity = integrityChecks.some((item) => item.status === "FAILED");
      const resultStatus = failedIntegrity ? "FLAGGED" : result.result;
      const verificationReason = [
        result.reason,
        ...integrityChecks
          .filter((item) => item.status !== "PASS")
          .map((item) => `${item.label}: ${item.explanation}`)
      ].filter(Boolean).join(" ");
      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO verifications (
            fdr_id, submitted_amount, bank_amount, result, verification_source,
            message, verification_score, ocr_confidence, extracted_data,
            comparison_results, review_reason, bank_verification_result,
            verification_checks
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          bankVerification.amount ?? null,
          resultStatus,
          previous.verification_source,
          verificationReason,
          result.score,
          previous.ocr_confidence,
          previous.extracted_data,
          JSON.stringify(result.fields),
          verificationReason,
          JSON.stringify(bankVerification),
          JSON.stringify(checks)
        );
        db.prepare(`
          UPDATE fdrs SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(resultStatus, fdrId);
        const action = {
          VERIFIED: "BANK_VERIFICATION_COMPLETED",
          FAILED: "BANK_VERIFICATION_FAILED",
          PENDING: "BANK_VERIFICATION_PENDING"
        }[bankVerification.status];
        insertAudit(req.user.userId, action, "FDR", fdrId, null, bankVerification);
        insertAudit(req.user.userId, "AUTOMATED_VERIFICATION_COMPLETED", "FDR", fdrId, null, {
          result: resultStatus,
          score: result.score,
          checks,
          reason: verificationReason
        });
        insertAudit(req.user.userId, "VERIFICATION_SCORE_GENERATED", "FDR", fdrId, null, {
          score: result.score,
          checks
        });
        const statusAuditAction = {
          VERIFIED: "FDR_VERIFIED",
          FLAGGED: "FDR_FLAGGED",
          FAILED: "FDR_FAILED",
          REJECTED: "FDR_REJECTED"
        }[resultStatus] || "FDR_PENDING";
        insertAudit(req.user.userId, statusAuditAction, "FDR", fdrId, null, {
          result: resultStatus,
          reason: verificationReason
        });
        if (fdr.institution_user_id) {
          const passed = bankVerification.status === "VERIFIED" &&
            resultStatus === "VERIFIED";
          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, ?, ?, ?)
          `).run(
            fdr.institution_user_id,
            passed
              ? `Mock bank verification passed for FDR ${fdr.fdr_number}.`
              : `FDR ${fdr.fdr_number} requires officer review after mock bank verification. ${verificationReason}`,
            passed ? "BANK_VERIFICATION_COMPLETED" : "ACTION_REQUIRED",
            fdrId,
            fdr.application_id
          );
        }
      });
      transaction();
      return res.json({
        fdrId,
        verificationStatus: resultStatus,
        score: result.score,
        bankVerification,
        checks
      });
    } catch (error) {
      console.error("Officer mock bank verification error:", error);
      return res.status(500).json({
        message: error.message || "Unable to run mock bank verification"
      });
    }
  }
);

module.exports = router;