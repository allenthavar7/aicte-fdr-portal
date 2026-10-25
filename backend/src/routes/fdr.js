
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const db = require("../database/database");

const {
  authenticateToken,
  requireRole
} = require("../middleware/auth");

const router = express.Router();


// ====================================================
// UPLOAD DIRECTORY
// ====================================================

const uploadDirectory = path.join(
  __dirname,
  "..",
  "uploads",
  "fdr"
);

fs.mkdirSync(uploadDirectory, {
  recursive: true
});


// ====================================================
// MULTER CONFIGURATION
// ====================================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {

    const extension = path.extname(
      file.originalname
    );

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

    if (!allowedMimeTypes.includes(file.mimetype)) {

      return cb(
        new Error(
          "Only PDF, JPG and PNG files are allowed"
        )
      );
    }

    cb(null, true);
  }

});


// ====================================================
// VALID APPLICATION TYPES
// ====================================================

const validApplicationTypes = [

  "NEW_INSTITUTION",

  "NEW_PROGRAMME",

  "INCREASE_INTAKE",

  "RENEWAL",

  "REPLACEMENT",

  "MODIFICATION",

  "OTHER"

];


// ====================================================
// POST /api/fdr
//
// Institution submits an application + FDR
// ====================================================

router.post(
  "/",
  authenticateToken,
  requireRole("INSTITUTION"),
  upload.single("fdrDocument"),

  (req, res) => {

    let uploadedFilePath = null;

    try {

      // ==================================================
      // APPLICATION DATA
      // ==================================================

      const {
        applicationType,
        programmeName,
        programmeLevel,
        discipline,
        currentIntake,
        proposedIntake,
        academicYear
      } = req.body;


      // ==================================================
      // FDR DATA
      // ==================================================

      const {
        fdrNumber,
        bankName,
        amount,
        issueDate,
        maturityDate
      } = req.body;


      // ==================================================
      // APPLICATION TYPE
      // ==================================================

      if (!applicationType) {

        return res.status(400).json({
          message:
            "Application type is required"
        });

      }


      if (
        !validApplicationTypes.includes(
          applicationType
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid application type"
        });

      }


      // ==================================================
      // FDR REQUIRED FIELDS
      // ==================================================

      if (
        !fdrNumber ||
        !bankName ||
        !amount ||
        !issueDate ||
        !maturityDate
      ) {

        return res.status(400).json({

          message:
            "FDR number, bank name, amount, issue date and maturity date are required"

        });

      }


      // ==================================================
      // DOCUMENT REQUIRED
      // ==================================================

      if (!req.file) {

        return res.status(400).json({

          message:
            "FDR document is required"

        });

      }


      uploadedFilePath =
        req.file.path;


      // ==================================================
      // VALIDATE AMOUNT
      // ==================================================

      const numericAmount =
        Number(amount);


      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {

        fs.unlinkSync(
          uploadedFilePath
        );

        uploadedFilePath = null;

        return res.status(400).json({

          message:
            "Amount must be a valid positive number"

        });

      }


      // ==================================================
      // VALIDATE DATES
      // ==================================================

      const issue =
        new Date(issueDate);

      const maturity =
        new Date(maturityDate);


      if (
        Number.isNaN(issue.getTime()) ||
        Number.isNaN(maturity.getTime())
      ) {

        fs.unlinkSync(
          uploadedFilePath
        );

        uploadedFilePath = null;

        return res.status(400).json({

          message:
            "Invalid issue date or maturity date"

        });

      }


      if (maturity <= issue) {

        fs.unlinkSync(
          uploadedFilePath
        );

        uploadedFilePath = null;

        return res.status(400).json({

          message:
            "Maturity date must be after issue date"

        });

      }


      // ==================================================
      // VALIDATE INTAKE
      // ==================================================

      let numericCurrentIntake = null;

      let numericProposedIntake = null;


      if (
        currentIntake !== undefined &&
        currentIntake !== ""
      ) {

        numericCurrentIntake =
          Number(currentIntake);


        if (
          !Number.isInteger(
            numericCurrentIntake
          ) ||
          numericCurrentIntake < 0
        ) {

          fs.unlinkSync(
            uploadedFilePath
          );

          uploadedFilePath = null;

          return res.status(400).json({

            message:
              "Current intake must be a valid number"

          });

        }

      }


      if (
        proposedIntake !== undefined &&
        proposedIntake !== ""
      ) {

        numericProposedIntake =
          Number(proposedIntake);


        if (
          !Number.isInteger(
            numericProposedIntake
          ) ||
          numericProposedIntake <= 0
        ) {

          fs.unlinkSync(
            uploadedFilePath
          );

          uploadedFilePath = null;

          return res.status(400).json({

            message:
              "Proposed intake must be a valid positive number"

          });

        }

      }


      // ==================================================
      // INCREASE INTAKE VALIDATION
      // ==================================================

      if (
        applicationType ===
        "INCREASE_INTAKE"
      ) {

        if (
          numericCurrentIntake === null ||
          numericProposedIntake === null
        ) {

          fs.unlinkSync(
            uploadedFilePath
          );

          uploadedFilePath = null;

          return res.status(400).json({

            message:
              "Current and proposed intake are required for an intake increase"

          });

        }


        if (
          numericProposedIntake <=
          numericCurrentIntake
        ) {

          fs.unlinkSync(
            uploadedFilePath
          );

          uploadedFilePath = null;

          return res.status(400).json({

            message:
              "Proposed intake must be greater than current intake"

          });

        }

      }


      // ==================================================
      // FIND INSTITUTION
      // ====================================================

      const institution =
        db.prepare(`
          SELECT
            id,
            name,
            aicte_code
          FROM institutions
          WHERE user_id = ?
        `)
        .get(
          req.user.userId
        );


      if (!institution) {

        fs.unlinkSync(
          uploadedFilePath
        );

        uploadedFilePath = null;

        return res.status(404).json({

          message:
            "Institution profile not found"

        });

      }


      // ==================================================
      // DATABASE TRANSACTION
      //
      // APPLICATION
      //      ↓
      // FDR
      //      ↓
      // DOCUMENT
      // ====================================================

      const transaction =
        db.transaction(() => {


          // ================================================
          // 1. CREATE APPLICATION
          // ================================================

          const applicationResult =
            db.prepare(`
              INSERT INTO applications (
                institution_id,
                application_type,
                programme_name,
                programme_level,
                discipline,
                current_intake,
                proposed_intake,
                academic_year,
                status
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(

              institution.id,

              applicationType,

              programmeName
                ? programmeName.trim()
                : null,

              programmeLevel
                ? programmeLevel.trim()
                : null,

              discipline
                ? discipline.trim()
                : null,

              numericCurrentIntake,

              numericProposedIntake,

              academicYear
                ? academicYear.trim()
                : null,

              "PENDING"

            );


          const applicationId =
            applicationResult.lastInsertRowid;


          // ================================================
          // 2. CREATE FDR
          // ================================================

          const fdrResult =
            db.prepare(`
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
            `)
            .run(

              fdrNumber.trim(),

              bankName.trim(),

              numericAmount,

              issueDate,

              maturityDate,

              "ACTIVE",

              "PENDING",

              institution.id,

              applicationId

            );


          const fdrId =
            fdrResult.lastInsertRowid;


          // ================================================
          // 3. CREATE DOCUMENT
          // ================================================

          db.prepare(`
            INSERT INTO documents (
              fdr_id,
              file_name,
              file_path,
              document_type
            )
            VALUES (?, ?, ?, ?)
          `)
          .run(

            fdrId,

            req.file.originalname,

            uploadedFilePath,

            "FDR"

          );


          // ================================================
          // RETURN IDS
          // ================================================

          return {

            applicationId,

            fdrId

          };

        });


      // ==================================================
      // EXECUTE TRANSACTION
      // ==================================================

      const result =
        transaction();


      // ==================================================
      // AUDIT LOG
      // ==================================================

      db.prepare(`
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          new_value
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(

        req.user.userId,

        "FDR_APPLICATION_SUBMITTED",

        "APPLICATION",

        result.applicationId,

        JSON.stringify({

          applicationType,

          applicationId:
            result.applicationId,

          fdrId:
            result.fdrId,

          fdrNumber:
            fdrNumber.trim(),

          amount:
            numericAmount,

          bankName:
            bankName.trim()

        })

      );


      // ==================================================
      // SUCCESS RESPONSE
      // ==================================================

      return res.status(201).json({

        message:
          "FDR application submitted successfully",


        application: {

          id:
            result.applicationId,

          type:
            applicationType,

          programmeName:
            programmeName || null,

          programmeLevel:
            programmeLevel || null,

          discipline:
            discipline || null,

          currentIntake:
            numericCurrentIntake,

          proposedIntake:
            numericProposedIntake,

          academicYear:
            academicYear || null,

          status:
            "PENDING"

        },


        fdr: {

          id:
            result.fdrId,

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
            "PENDING"

        }

      });


    } catch (error) {

      console.error(
        "FDR submission error:",
        error
      );


      // ==================================================
      // REMOVE UPLOADED FILE ON FAILURE
      // ==================================================

      if (
        uploadedFilePath &&
        fs.existsSync(
          uploadedFilePath
        )
      ) {

        try {

          fs.unlinkSync(
            uploadedFilePath
          );

        } catch (fileError) {

          console.error(
            "Unable to remove uploaded file:",
            fileError
          );

        }

      }


      return res.status(500).json({

        message:
          "Unable to submit FDR"

      });

    }

  }
);


// ====================================================
// GET /api/fdr/my
//
// Institution views its own FDRs
// ====================================================

router.get(
  "/my",
  authenticateToken,
  requireRole("INSTITUTION"),

  (req, res) => {

    try {

      // ==================================================
      // FIND INSTITUTION
      // ==================================================

      const institution =
        db.prepare(`
          SELECT
            id,
            name,
            aicte_code
          FROM institutions
          WHERE user_id = ?
        `)
        .get(
          req.user.userId
        );


      if (!institution) {

        return res.status(404).json({

          message:
            "Institution profile not found"

        });

      }


      // ==================================================
      // GET FDRs WITH THEIR APPLICATION
      // ==================================================

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


            /* APPLICATION INFORMATION */

            a.application_type,

            a.programme_name,

            a.programme_level,

            a.discipline,

            a.current_intake,

            a.proposed_intake,

            a.academic_year,

            a.status AS application_status


          FROM fdrs f


          LEFT JOIN applications a
            ON a.id = f.application_id


          WHERE f.institution_id = ?


          ORDER BY f.created_at DESC

        `)
        .all(
          institution.id
        );


      // ==================================================
      // RESPONSE
      // ==================================================

      return res.json({

        institution: {

          id:
            institution.id,

          name:
            institution.name,

          aicteCode:
            institution.aicte_code

        },

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


module.exports = router;