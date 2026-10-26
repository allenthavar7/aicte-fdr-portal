const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = require("../database/database");
const ensureVerificationColumns = require("../database/migrations");
const { extractFdrData } = require("../services/ocrService");
const {
  createConfiguredMockBankProvider,
  verifyBankFdr
} = require("../services/bankVerificationService");
const { verifyFdr } = require("../services/verificationService");

const {
  authenticateToken,
  requireRole
} = require("../middleware/auth");

const router = express.Router();
ensureVerificationColumns(db);

const APPLICATION_TYPES = new Set([
  "NEW_INSTITUTION",
  "NEW_PROGRAMME",
  "INCREASE_INTAKE",
  "RENEWAL",
  "REPLACEMENT",
  "MODIFICATION",
  "OTHER"
]);

function isValidDate(value, date) {
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return date.toISOString().slice(0, 10) === value;
  }

  return true;
}


// =========================================================
// UPLOAD DIRECTORY
// =========================================================

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "fdr"
);

fs.mkdirSync(uploadDirectory, {
  recursive: true
});


// =========================================================
// MULTER
// =========================================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {

    const extension =
      path.extname(file.originalname);

    const uniqueName =
      `fdr-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, uniqueName);
  }

});


const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];


const upload = multer({

  storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    if (
      !allowedMimeTypes.includes(
        file.mimetype
      )
    ) {

      return cb(
        new Error(
          "Only PDF, JPG and PNG files are allowed"
        )
      );

    }

    cb(null, true);
  }

});


// =========================================================
// POST /api/fdr
// Institution submits an FDR
// =========================================================

router.post(
  "/",
  authenticateToken,
  requireRole("INSTITUTION"),
  upload.single("fdrDocument"),

  async (req, res) => {

    let uploadedFilePath = null;

    try {

      const {
        fdrNumber,
        bankName,
        amount,
        issueDate,
        maturityDate,
        applicationId,
        applicationType,
        programmeName,
        programmeLevel,
        discipline,
        currentIntake,
        proposedIntake,
        academicYear,
        previousFdrNumber,
        applicationDescription
      } = req.body;


      // =====================================================
      // REQUIRED FIELDS
      // =====================================================

      if (
        !fdrNumber ||
        !bankName ||
        !amount ||
        !issueDate ||
        !maturityDate
      ) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(400).json({

          message:
            "FDR number, bank name, amount, issue date and maturity date are required"

        });

      }


      // =====================================================
      // DOCUMENT
      // =====================================================

      if (!req.file) {

        return res.status(400).json({

          message:
            "FDR document is required"

        });

      }


      uploadedFilePath =
        req.file.path;


      // =====================================================
      // AMOUNT
      // =====================================================

      const numericAmount =
        Number(amount);


      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {

        fs.unlinkSync(
          uploadedFilePath
        );

        return res.status(400).json({

          message:
            "Amount must be a valid positive number"

        });

      }


      // =====================================================
      // DATES
      // =====================================================

      const issue =
        new Date(issueDate);

      const maturity =
        new Date(maturityDate);


      if (
        !isValidDate(issueDate, issue) ||
        !isValidDate(maturityDate, maturity)
      ) {

        fs.unlinkSync(
          uploadedFilePath
        );

        return res.status(400).json({

          message:
            "Invalid issue date or maturity date"

        });

      }


      if (maturity <= issue) {

        fs.unlinkSync(
          uploadedFilePath
        );

        return res.status(400).json({

          message:
            "Maturity date must be after issue date"

        });

      }


      // =====================================================
      // FIND INSTITUTION
      // =====================================================

      const institution =
        db.prepare(`
          SELECT
            id,
            name,
            aicte_code
          FROM institutions
          WHERE user_id = ?
        `).get(
          req.user.userId
        );


      if (!institution) {

        fs.unlinkSync(
          uploadedFilePath
        );

        return res.status(404).json({

          message:
            "Institution profile not found"

        });

      }


      // =====================================================
      // CHECK APPLICATION IF PROVIDED
      // =====================================================

      let finalApplicationId = applicationId
        ? Number(applicationId)
        : null;
      let applicationRecord = null;

      if (finalApplicationId !== null) {
        if (!Number.isInteger(finalApplicationId) || finalApplicationId <= 0) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(400).json({
            message: "Invalid application ID"
          });
        }

        applicationRecord = db.prepare(`
          SELECT id, institution_id
          FROM applications
          WHERE id = ?
        `).get(finalApplicationId);

        if (!applicationRecord) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(404).json({
            message: "Application not found"
          });
        }

        if (applicationRecord.institution_id !== institution.id) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(403).json({
            message: "You cannot use another institution's application"
          });
        }
      } else {
        if (!APPLICATION_TYPES.has(applicationType)) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(400).json({
            message: "A valid application type is required"
          });
        }

        const requiredApplicationFields = {
          NEW_PROGRAMME: [
            ["programmeName", programmeName],
            ["programmeLevel", programmeLevel],
            ["discipline", discipline],
            ["proposedIntake", proposedIntake],
            ["academicYear", academicYear]
          ],
          INCREASE_INTAKE: [
            ["programmeName", programmeName],
            ["currentIntake", currentIntake],
            ["proposedIntake", proposedIntake],
            ["academicYear", academicYear]
          ],
          REPLACEMENT: [
            ["previousFdrNumber", previousFdrNumber],
            ["applicationDescription", applicationDescription]
          ],
          MODIFICATION: [
            ["academicYear", academicYear],
            ["applicationDescription", applicationDescription]
          ],
          OTHER: [
            ["academicYear", academicYear],
            ["applicationDescription", applicationDescription]
          ]
        }[applicationType] || [];

        const missingField = requiredApplicationFields.find(
          ([, value]) =>
            value === undefined ||
            value === null ||
            (typeof value === "string" && !value.trim())
        );

        if (missingField) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(400).json({
            message: `${missingField[0]} is required for this application type`
          });
        }

        for (const [field, value] of [
          ["currentIntake", currentIntake],
          ["proposedIntake", proposedIntake]
        ]) {
          if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (!Number.isInteger(Number(value)) || Number(value) <= 0)
          ) {
            fs.unlinkSync(uploadedFilePath);
            return res.status(400).json({
              message: `${field} must be a positive whole number`
            });
          }
        }

        if (
          applicationType === "INCREASE_INTAKE" &&
          Number(proposedIntake) <= Number(currentIntake)
        ) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(400).json({
            message: "Proposed intake must be greater than current intake"
          });
        }
      }

      let previousFdr = null;
      if (["RENEWAL", "REPLACEMENT"].includes(applicationType)) {
        if (!previousFdrNumber?.trim()) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(400).json({
            message: "Previous FDR number is required for this application type"
          });
        }

        previousFdr = db.prepare(`
          SELECT id, fdr_number
          FROM fdrs
          WHERE institution_id = ?
            AND lower(trim(fdr_number)) = lower(trim(?))
          ORDER BY id DESC
          LIMIT 1
        `).get(institution.id, previousFdrNumber.trim());

        if (!previousFdr) {
          fs.unlinkSync(uploadedFilePath);
          return res.status(404).json({
            message: "Previous FDR was not found for this institution"
          });
        }
      }

      const duplicate = db.prepare(`
        SELECT id, fdr_number, institution_id, verification_status
        FROM fdrs
        WHERE lower(trim(fdr_number)) = lower(trim(?))
        ORDER BY id ASC
        LIMIT 1
      `).get(fdrNumber.trim());

      const submittedFdr = {
        fdrNumber: fdrNumber.trim(),
        bankName: bankName.trim(),
        amount: numericAmount,
        issueDate,
        maturityDate,
        status: "ACTIVE"
      };

      let extraction;
      let extractionFailure = false;
      try {
        extraction = await extractFdrData(req.file);
        extractionFailure = extraction.status === "FAILED";
      } catch (error) {
        console.error("FDR OCR extraction failed:", error);
        extractionFailure = true;
        extraction = {
          provider: "ERROR",
          status: "FAILED",
          extracted: null,
          confidence: null,
          confidenceByField: {},
          rawText: "",
          message: "OCR extraction failed; officer review is required."
        };
      }

      let bankVerification;
      try {
        bankVerification = await verifyBankFdr(
          submittedFdr,
          createConfiguredMockBankProvider()
        );
      } catch (error) {
        console.error("Mock bank verification provider failed:", error);
        bankVerification = {
          status: "FAILED",
          verified: false,
          exists: false,
          source: "MOCK_BANK_PROVIDER",
          isMock: true,
          checks: {},
          message: "Mock bank provider failed; officer review is required."
        };
      }

      const verification = verifyFdr({
        submitted: {
          ...submittedFdr
        },
        institution,
        extracted: extraction.extracted,
        ocrConfidence: extraction.confidence,
        extractionMessage: extraction.message,
        extractionFailure,
        duplicate,
        bankVerification
      });


      // =====================================================
      // DATABASE TRANSACTION
      // =====================================================

      const transaction = db.transaction(() => {
        if (finalApplicationId === null) {
          const applicationResult = db.prepare(`
            INSERT INTO applications (
              institution_id,
              application_type,
              programme_name,
              programme_level,
              discipline,
              current_intake,
              proposed_intake,
              academic_year,
              description
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            institution.id,
            applicationType,
            programmeName || null,
            programmeLevel || null,
            discipline || null,
            currentIntake ? Number(currentIntake) : null,
            proposedIntake ? Number(proposedIntake) : null,
            academicYear || null,
            applicationDescription?.trim() || null
          );

          finalApplicationId = applicationResult.lastInsertRowid;
        }

        const fdrResult = db.prepare(`
          INSERT INTO fdrs (
            fdr_number,
            bank_name,
            amount,
            issue_date,
            maturity_date,
            status,
            verification_status,
            institution_id,
            application_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrNumber.trim(),
          bankName.trim(),
          numericAmount,
          issueDate,
          maturityDate,
          "ACTIVE",
          verification.result,
          institution.id,
          finalApplicationId
        );

        const fdrId = fdrResult.lastInsertRowid;

        if (previousFdr) {
          const approvedRequest = db.prepare(`
            SELECT id FROM renewals
            WHERE old_fdr_id = ? AND new_fdr_id IS NULL AND status = 'APPROVED'
            ORDER BY id DESC
            LIMIT 1
          `).get(previousFdr.id);
          if (approvedRequest) {
            db.prepare(`
              UPDATE renewals
              SET new_fdr_id = ?, renewal_date = CURRENT_TIMESTAMP
              WHERE id = ? AND new_fdr_id IS NULL
            `).run(fdrId, approvedRequest.id);
            db.prepare(`
              INSERT INTO audit_logs (
                user_id, action, entity_type, entity_id, new_value
              )
              VALUES (?, 'RENEWAL_COMPLETED', 'RENEWAL', ?, ?)
            `).run(
              req.user.userId,
              approvedRequest.id,
              JSON.stringify({ oldFdrId: previousFdr.id, newFdrId: fdrId })
            );
            db.prepare(`
              INSERT INTO notifications (
                user_id, message, type, fdr_id, application_id, renewal_id
              )
              VALUES (?, ?, 'RENEWAL_COMPLETED', ?, ?, ?)
            `).run(
              req.user.userId,
              `Renewal for FDR ${previousFdr.fdr_number} has been completed.`,
              fdrId,
              finalApplicationId,
              approvedRequest.id
            );
          } else {
            db.prepare(`
              INSERT INTO renewals (old_fdr_id, new_fdr_id)
              VALUES (?, ?)
            `).run(previousFdr.id, fdrId);
          }
        }

        db.prepare(`
          INSERT INTO documents (
            fdr_id,
            file_name,
            file_path,
            document_type
          )
          VALUES (?, ?, ?, ?)
        `).run(
          fdrId,
          req.file.originalname,
          uploadedFilePath,
          "FDR"
        );

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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fdrId,
          numericAmount,
          bankVerification.amount !== null &&
            bankVerification.amount !== undefined &&
            Number.isFinite(Number(bankVerification.amount))
            ? Number(bankVerification.amount)
            : null,
          verification.result,
          extraction.provider,
          verification.reason,
          verification.score,
          verification.confidence,
          extraction.extracted
            ? JSON.stringify({
                ...extraction.extracted,
                ocrStatus: extraction.status,
                confidenceByField: extraction.confidenceByField,
                rawText: extraction.rawText
              })
            : null,
          JSON.stringify(verification.fields),
          verification.reason,
          JSON.stringify(bankVerification),
          JSON.stringify(verification.checks)
        );

        const audit = db.prepare(`
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            new_value
          )
          VALUES (?, ?, ?, ?, ?)
        `);

        audit.run(
          req.user.userId,
          "FDR_SUBMITTED",
          "FDR",
          fdrId,
          JSON.stringify({
            fdrNumber: fdrNumber.trim(),
            bankName: bankName.trim(),
            amount: numericAmount,
            applicationId: finalApplicationId
          })
        );

        db.prepare(`
          INSERT INTO notifications (
            user_id, message, type, fdr_id, application_id
          )
          VALUES (?, ?, 'FDR_SUBMITTED', ?, ?)
        `).run(
          req.user.userId,
          "FDR submitted successfully.",
          fdrId,
          finalApplicationId
        );

        audit.run(
          req.user.userId,
          "DOCUMENT_UPLOADED",
          "FDR",
          fdrId,
          JSON.stringify({
            fileName: req.file.originalname,
            documentType: "FDR"
          })
        );

        audit.run(
          req.user.userId,
          extraction.status === "FAILED" ? "OCR_FAILED" : "OCR_COMPLETED",
          "FDR",
          fdrId,
          JSON.stringify({
            status: extraction.status,
            provider: extraction.provider,
            confidence: verification.confidence,
            extracted: extraction.extracted,
            message: extraction.message
          })
        );

        const bankAuditAction = {
          VERIFIED: "BANK_VERIFICATION_COMPLETED",
          FAILED: "BANK_VERIFICATION_FAILED",
          MISMATCH: "BANK_VERIFICATION_FAILED",
          NOT_FOUND: "BANK_VERIFICATION_FAILED",
          PENDING: "BANK_VERIFICATION_PENDING"
        }[bankVerification.status] || "BANK_VERIFICATION_PENDING";

        audit.run(
          req.user.userId,
          bankAuditAction,
          "FDR",
          fdrId,
          JSON.stringify(bankVerification)
        );

        audit.run(
          req.user.userId,
          "AUTOMATED_VERIFICATION_COMPLETED",
          "FDR",
          fdrId,
          JSON.stringify({
            result: verification.result,
            automatedStatus: verification.automatedStatus,
            score: verification.score,
            ocrProvider: extraction.provider,
            reason: verification.reason
          })
        );

        audit.run(
          req.user.userId,
          "VERIFICATION_SCORE_GENERATED",
          "FDR",
          fdrId,
          JSON.stringify({ score: verification.score, checks: verification.checks })
        );

        if (verification.result === "FLAGGED") {
          audit.run(
            req.user.userId,
            "FDR_FLAGGED",
            "FDR",
            fdrId,
            JSON.stringify({ reason: verification.reason })
          );

          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, 'ACTION_REQUIRED', ?, ?)
          `).run(
            req.user.userId,
            `Your FDR requires attention because a verification check failed. ${verification.reason}`,
            fdrId,
            finalApplicationId
          );
          if (
            verification.fields.some(
              (field) => field.field === "amount" && field.result === "MISMATCH"
            )
          ) {
            db.prepare(`
              INSERT INTO notifications (
                user_id, message, type, fdr_id, application_id
              )
              VALUES (?, ?, 'AMOUNT_MISMATCH', ?, ?)
            `).run(
              req.user.userId,
              "The FDR amount does not match the submitted document.",
              fdrId,
              finalApplicationId
            );
          }
        } else if (verification.result === "FAILED") {
          audit.run(
            req.user.userId,
            "FDR_FAILED",
            "FDR",
            fdrId,
            JSON.stringify({ reason: verification.reason })
          );

          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, 'FDR_VERIFICATION_FAILED', ?, ?)
          `).run(
            req.user.userId,
            "Your FDR requires attention because a verification check failed.",
            fdrId,
            finalApplicationId
          );
        } else if (verification.result === "VERIFIED") {
          audit.run(
            req.user.userId,
            "FDR_VERIFIED",
            "FDR",
            fdrId,
            JSON.stringify({ score: verification.score })
          );
          db.prepare(`
            INSERT INTO notifications (
              user_id, message, type, fdr_id, application_id
            )
            VALUES (?, ?, 'FDR_VERIFIED', ?, ?)
          `).run(
            req.user.userId,
            "Your FDR has been successfully verified.",
            fdrId,
            finalApplicationId
          );
        } else {
          audit.run(
            req.user.userId,
            "FDR_PENDING",
            "FDR",
            fdrId,
            JSON.stringify({
              reason: verification.reason,
              bankVerificationStatus: bankVerification.status
            })
          );
        }

        const officerUsers = db.prepare(`
          SELECT id FROM users WHERE role = 'OFFICER'
        `).all();
        const createOfficerNotification = db.prepare(`
          INSERT INTO notifications (user_id, message, type)
          VALUES (?, ?, 'FDR_SUBMITTED')
        `);
        for (const officer of officerUsers) {
          const officerMessage =
            verification.result === "VERIFIED"
              ? `New FDR automatically verified: ${fdrNumber.trim()}`
              : verification.result === "FAILED"
                ? `${fdrNumber.trim()} failed automated verification.`
                : `${fdrNumber.trim()} requires review. Verification score: ${verification.score}/100`;
          createOfficerNotification.run(
            officer.id,
            officerMessage
          );
        }

        return {
          id: fdrId,
          applicationId: finalApplicationId
        };
      });

      const submission = transaction();


      // =====================================================
      // SUCCESS
      // =====================================================

      return res.status(201).json({

        success: true,
        message:
          "FDR submitted successfully",

        fdr: {

          id:
            submission.id,

          fdrNumber:
            fdrNumber.trim(),

          bankName:
            bankName.trim(),

          amount:
            numericAmount,

          issueDate,

          maturityDate,

          status:
            "ACTIVE",

          verificationStatus:
            verification.result,

          bankVerification,

          applicationId:
            submission.applicationId,

          previousFdrId:
            previousFdr?.id || null,

          verificationResult:
            verification.result,

          verificationScore:
            verification.score,

          ocrConfidence:
            verification.confidence,

          comparisonResults:
            verification.fields,

          reviewReason:
            verification.reason,

          ocrProvider:
            extraction.provider

        },

        application: {
          id: submission.applicationId,
          applicationType,
          programmeName: programmeName || null,
          programmeLevel: programmeLevel || null,
          discipline: discipline || null,
          academicYear: academicYear || null
        },

        verification: {
          status: verification.result,
          score: verification.score,
          ocr: {
            status: extraction.status,
            provider: extraction.provider,
            confidence: extraction.confidence,
            confidenceByField: extraction.confidenceByField,
            extracted: extraction.extracted,
            rawText: extraction.rawText,
            raw_text: extraction.rawText,
            message: extraction.message
          },
          bank: bankVerification,
          comparisons: verification.fields,
          checks: verification.checks,
          duplicateDetected: Boolean(duplicate),
          message: verification.reason
        }

      });


    } catch (error) {

      console.error(
        "FDR submission error:",
        error
      );


      if (
        uploadedFilePath &&
        fs.existsSync(
          uploadedFilePath
        )
      ) {

        fs.unlinkSync(
          uploadedFilePath
        );

      }


      return res.status(500).json({

        message:
          "Unable to submit FDR"

      });

    }

  }
);

router.get(
  "/:id/documents/:documentId",
  authenticateToken,
  requireRole("INSTITUTION"),
  (req, res) => {
    const fdrId = Number(req.params.id);
    const documentId = Number(req.params.documentId);

    if (
      !Number.isInteger(fdrId) ||
      fdrId <= 0 ||
      !Number.isInteger(documentId) ||
      documentId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid FDR or document ID"
      });
    }

    try {
      const document = db.prepare(`
        SELECT d.file_path
        FROM documents d
        INNER JOIN fdrs f ON f.id = d.fdr_id
        INNER JOIN institutions i ON i.id = f.institution_id
        WHERE d.id = ? AND f.id = ? AND i.user_id = ?
      `).get(documentId, fdrId, req.user.userId);

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

      return res.sendFile(documentPath);
    } catch (error) {
      console.error("Institution FDR document fetch error:", error);
      return res.status(500).json({
        message: "Unable to open FDR document"
      });
    }
  }
);


// =========================================================
// GET /api/fdr/my
// Institution views its own FDRs
// =========================================================

router.get(
  "/my",
  authenticateToken,
  requireRole("INSTITUTION"),

  (req, res) => {

    try {

      const institution =
        db.prepare(`
          SELECT
            id,
            name,
            aicte_code
          FROM institutions
          WHERE user_id = ?
        `).get(
          req.user.userId
        );


      if (!institution) {

        return res.status(404).json({

          message:
            "Institution profile not found"

        });

      }


      const fdrs =
        db.prepare(`

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

            (
              SELECT d.id
              FROM documents d
              WHERE d.fdr_id = f.id
              ORDER BY d.uploaded_at DESC, d.id DESC
              LIMIT 1
            ) AS document_id,
            (
              SELECT d.file_name
              FROM documents d
              WHERE d.fdr_id = f.id
              ORDER BY d.uploaded_at DESC, d.id DESC
              LIMIT 1
            ) AS document_file_name,
            (
              SELECT d.document_type
              FROM documents d
              WHERE d.fdr_id = f.id
              ORDER BY d.uploaded_at DESC, d.id DESC
              LIMIT 1
            ) AS document_type,

            v.result AS verification_result,
            v.verification_score,
            v.ocr_confidence,
            v.extracted_data,
            v.comparison_results,
            v.review_reason,
            v.verification_source,
            v.verified_at,

            a.application_type,

            a.programme_name,

            a.programme_level,

            a.discipline,

            a.current_intake,

            a.proposed_intake,
            a.academic_year,
            a.description AS application_description,
            a.status AS application_status

          FROM fdrs f

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

          WHERE f.institution_id = ?

          ORDER BY f.created_at DESC

        `).all(
          institution.id
        );


      return res.json({

        institution: {

          id:
            institution.id,

          name:
            institution.name,

          aicteCode:
            institution.aicte_code

        },

        count:
          fdrs.length,

        fdrs

      });


    } catch (error) {

      console.error(
        "Get FDR error:",
        error
      );


      return res.status(500).json({

        message:
          "Unable to fetch FDR records"

      });

    }

  }
);

router.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "FDR document must be 5 MB or smaller"
          : error.message
    });
  }

  if (error.message === "Only PDF, JPG and PNG files are allowed") {
    return res.status(400).json({
      message: error.message
    });
  }

  console.error("FDR route error:", error);
  return res.status(500).json({
    message: "Unable to process FDR request"
  });
});

module.exports = router;