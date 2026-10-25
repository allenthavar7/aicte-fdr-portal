const express = require("express");

const db = require("../database/database");

const {
  authenticateToken,
  requireRole
} = require("../middleware/auth");

const router = express.Router();

// ====================================================
// GET /api/officer/fdrs
// Get all FDRs for AICTE officers
// ====================================================

router.get(
  "/fdrs",
  authenticateToken,
  requireRole("OFFICER", "ADMIN"),
  (req, res) => {
    try {
      const fdrs = db
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

            i.id AS institution_id,
            i.name AS institution_name,
            i.aicte_code,
            i.city,
            i.state

          FROM fdrs f

          INNER JOIN institutions i
            ON f.institution_id = i.id

          ORDER BY f.created_at DESC
        `)
        .all();

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


// ====================================================
// GET /api/officer/fdrs/:id
// Get complete details of one FDR
// ====================================================

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

      res.json({
        fdr,
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
            message
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          numericBankAmount,
          "VERIFIED",
          verificationSource,
          message || null
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
            message
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          fdr.amount,
          null,
          "REJECTED",
          verificationSource || null,
          message
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

module.exports = router;