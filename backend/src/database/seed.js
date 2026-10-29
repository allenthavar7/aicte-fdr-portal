const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const db = require("./database");
require("./migrations")(db);
const demoData = require("../../../shared/officerDemoData.json");

const institutionPassword = bcrypt.hashSync("ABC@12345", 10);
const officerPassword = bcrypt.hashSync("AICTE@12345", 10);

// Ensure ABC user exists
db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, 'INSTITUTION')
`).run("ABC", "admin@abc.ac.in", institutionPassword);

const institutionUserRecord = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .get("admin@abc.ac.in");

// Ensure ABC institution exists
db.prepare(`
  INSERT OR IGNORE INTO institutions (name, aicte_code, address, city, state, email, user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "ABC",
  "AICTE-MH-001",
  "Matunga, Mumbai",
  "Mumbai",
  "Maharashtra",
  "admin@abc.ac.in",
  institutionUserRecord.id
);

const abcInstitutionId = db
  .prepare("SELECT id FROM institutions WHERE aicte_code = ?")
  .get("AICTE-MH-001")?.id;

// Ensure AICTE Officer user exists
db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, 'OFFICER')
`).run("AICTE Regulation Officer", "officer@aicte.gov.in", officerPassword);

const officerUserRecord = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .get("officer@aicte.gov.in");

const demoInstitutionIds = new Map();
demoInstitutionIds.set("AICTE-MH-001", abcInstitutionId);
const demoFdrIds = new Map();

const seedDemoRecords = db.transaction(() => {
  // 1. Seed demo institutions & users
  for (const institution of demoData.institutions) {
    const institutionUsers = demoData.users.filter(
      (user) => user.institutionCode === institution.code
    );
    for (const user of institutionUsers) {
      db.prepare(`
        INSERT OR IGNORE INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, 'INSTITUTION')
      `).run(
        user.name,
        user.email,
        bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10)
      );
    }

    const admin = institutionUsers.find(
      (user) => user.displayRole === "Institution Admin"
    );
    const adminId = admin
      ? db.prepare("SELECT id FROM users WHERE email = ?").get(admin.email)?.id
      : null;

    db.prepare(`
      INSERT OR IGNORE INTO institutions
        (name, aicte_code, address, city, state, email, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      institution.name,
      institution.code,
      institution.address,
      institution.city,
      institution.state,
      institution.email,
      adminId
    );

    const institutionId = db
      .prepare("SELECT id FROM institutions WHERE aicte_code = ?")
      .get(institution.code)?.id;

    if (!institutionId) {
      throw new Error(`Unable to seed demo institution ${institution.code}`);
    }
    demoInstitutionIds.set(institution.code, institutionId);
  }

  // 2. Clear existing FDR and transaction tables to achieve exact 51 distribution
  db.prepare("DELETE FROM notifications").run();
  db.prepare("DELETE FROM renewals").run();
  db.prepare("DELETE FROM release_requests").run();
  db.prepare("DELETE FROM verifications").run();
  db.prepare("DELETE FROM documents").run();
  db.prepare("DELETE FROM audit_logs").run();
  db.prepare("DELETE FROM fdrs").run();
  db.prepare("DELETE FROM applications WHERE description LIKE 'DEMO-DATA%'").run();

  const officerId = officerUserRecord.id;

  // 3. Seed the 51 FDRs
  let fdrIndex = 0;
  for (const fdr of demoData.fdrs) {
    fdrIndex++;
    const institutionId = demoInstitutionIds.get(fdr.institutionCode);
    if (!institutionId) {
      throw new Error(`Missing demo institution for ${fdr.number}`);
    }

    const instUser = db.prepare("SELECT user_id FROM institutions WHERE id = ?").get(institutionId);
    const instUserId = instUser?.user_id || institutionUserRecord.id;

    const applicationDescription = `DEMO-DATA for ${fdr.number}`;
    let applicationId = db.prepare(
      "SELECT id FROM applications WHERE description = ?"
    ).get(applicationDescription)?.id;

    if (!applicationId) {
      const application = db.prepare(`
        INSERT INTO applications (
          institution_id, application_type, programme_name, programme_level,
          discipline, academic_year, description, status
        )
        VALUES (?, ?, ?, 'UNDERGRADUATE', 'Engineering', '2026-27', ?, 'APPROVED')
      `).run(
        institutionId,
        fdr.applicationType || "NEW_PROGRAMME",
        "DEMO — Applied Engineering",
        applicationDescription
      );
      applicationId = Number(application.lastInsertRowid);
    }

    const result = db.prepare(`
      INSERT INTO fdrs (
        fdr_number, bank_name, amount, issue_date, maturity_date, status,
        verification_status, institution_id, application_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' days'), datetime('now'))
    `).run(
      fdr.number,
      fdr.bank,
      fdr.amount,
      fdr.issueDate,
      fdr.maturityDate,
      fdr.status,
      fdr.verificationStatus,
      institutionId,
      applicationId,
      Math.max(1, 30 - fdrIndex)
    );
    const fdrId = Number(result.lastInsertRowid);
    demoFdrIds.set(fdr.number, fdrId);

    // Seed document for FDR
    db.prepare(`
      INSERT INTO documents (fdr_id, file_name, file_path, document_type, uploaded_at)
      VALUES (?, ?, ?, 'FDR_RECEIPT', datetime('now', '-' || ? || ' days'))
    `).run(
      fdrId,
      `${fdr.number}.pdf`,
      `/uploads/fdr/${fdr.number}.pdf`,
      Math.max(1, 30 - fdrIndex)
    );

    // Build verification checks and comparisons
    const isDiscrepant = fdr.verificationStatus === "FLAGGED" || fdr.verificationStatus === "FAILED";
    const isVerified = fdr.verificationStatus === "VERIFIED";

    const checks = [
      { key: "institution_match", label: "Institution Match", points: 15, status: fdr.ruleCode === "R13" ? "FAILED" : "PASS", explanation: fdr.ruleCode === "R13" ? "Institutional entity under merger review by AICTE Vigilance" : "Institution matches authorized portal account" },
      { key: "bank_name_match", label: "Bank Name Match", points: 15, status: fdr.ruleCode === "R7" ? "FAILED" : "PASS", explanation: fdr.ruleCode === "R7" ? "Partner bank confirmation API timed out" : "Issuer bank matches authorized scheduled bank" },
      { key: "fdr_number_match", label: "FDR Number Match", points: 15, status: fdr.ruleCode === "R1" ? "FAILED" : "PASS", explanation: fdr.ruleCode === "R1" ? "Duplicate instrument number detected across institutions" : "FDR number matches document scan" },
      { key: "amount_verification", label: "Amount Verification", points: 20, status: fdr.ruleCode === "R4" ? "FAILED" : "PASS", explanation: fdr.ruleCode === "R4" ? "Submitted amount ₹25,00,000 does not match bank record ₹15,00,000" : "Amount verified with issuer bank records" },
      { key: "date_verification", label: "Date Verification", points: 15, status: fdr.ruleCode === "R2" ? "FAILED" : "PASS", explanation: fdr.ruleCode === "R2" ? "Maturity date is on or before issuance date" : "Valid tenure and non-expired deposit" },
      { key: "document_ocr", label: "Document OCR", points: 20, status: "PASS", explanation: "OCR confidence exceeds statutory regulatory threshold" }
    ];

    const comparisons = [
      { field: "fdrNumber", submittedValue: fdr.number, extractedValue: fdr.number, result: fdr.ruleCode === "R1" ? "MISMATCH" : "MATCH" },
      { field: "bankName", submittedValue: fdr.bank, extractedValue: fdr.bank, result: fdr.ruleCode === "R7" ? "MISMATCH" : "MATCH" },
      { field: "amount", submittedValue: String(fdr.amount), extractedValue: String(fdr.bankAmount || fdr.amount), result: fdr.ruleCode === "R4" ? "MISMATCH" : "MATCH" },
      { field: "issueDate", submittedValue: fdr.issueDate, extractedValue: fdr.issueDate, result: "MATCH" },
      { field: "maturityDate", submittedValue: fdr.maturityDate, extractedValue: fdr.maturityDate, result: fdr.ruleCode === "R2" ? "MISMATCH" : "MATCH" }
    ];

    const bankResult = {
      status: fdr.ruleCode === "R7" ? "FAILED" : fdr.ruleCode === "R4" ? "MISMATCH" : "VERIFIED",
      fdrNumber: fdr.number,
      bankName: fdr.bank,
      amount: fdr.bankAmount || fdr.amount
    };

    db.prepare(`
      INSERT INTO verifications (
        fdr_id, submitted_amount, bank_amount, result, verification_source,
        message, verified_at, verification_score, ocr_confidence, extracted_data,
        comparison_results, review_reason, bank_verification_result, verification_checks
      )
      VALUES (?, ?, ?, ?, 'AUTOMATED_OCR_MOCK_BANK', ?, datetime('now', '-' || ? || ' days'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fdrId,
      fdr.amount,
      fdr.bankAmount || fdr.amount,
      isDiscrepant ? "FLAGGED" : isVerified ? "VERIFIED" : "PENDING",
      fdr.reviewReason || (isVerified ? "All checks passed successfully." : "Verification pending review."),
      Math.max(1, 28 - fdrIndex),
      fdr.verificationScore || (isDiscrepant ? 40 : isVerified ? 100 : 70),
      isDiscrepant ? 0.72 : 0.96,
      JSON.stringify({ fdrNumber: fdr.number, bankName: fdr.bank, amount: fdr.amount, issueDate: fdr.issueDate, maturityDate: fdr.maturityDate, ocrProvider: "Tesseract.js", ocrStatus: isDiscrepant ? "MISMATCH" : "SUCCESS" }),
      JSON.stringify(comparisons),
      fdr.reviewReason || (isDiscrepant ? "Flagged for manual officer scrutiny." : "Verified compliant."),
      JSON.stringify(bankResult),
      JSON.stringify(checks)
    );

    // 4. Seed Audit Logs: Every FDR must have AT LEAST 3 audit events
    const daysAgo = Math.max(1, 30 - fdrIndex);

    // Event 1: FDR Submitted by Institution
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
      VALUES (?, 'FDR_SUBMITTED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' days', '+2 hours'))
    `).run(
      instUserId,
      fdrId,
      JSON.stringify({
        fdrNumber: fdr.number,
        bank: fdr.bank,
        amount: fdr.amount,
        remark: "FDR security deposit submitted by institution"
      }),
      daysAgo + 2
    );

    // Event 2: Document Uploaded
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
      VALUES (?, 'DOCUMENT_UPLOADED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' days', '+4 hours'))
    `).run(
      instUserId,
      fdrId,
      JSON.stringify({
        fileName: `${fdr.number}.pdf`,
        documentType: "FDR_RECEIPT",
        remark: "Fixed deposit receipt document uploaded and scanned"
      }),
      daysAgo + 1
    );

    // Event 3: Verification / Scrutiny / Review Event
    if (fdr.status === "RELEASE_REQUESTED") {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'FDR_VERIFIED', 'FDR', ?, ?, ?, datetime('now', '-' || ? || ' days', '+6 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({ status: "SUBMITTED" }),
        JSON.stringify({
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          remark: "Instrument verified and lien endorsed to AICTE"
        }),
        daysAgo
      );

      // Event 4 for Release
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'RELEASE_REQUESTED', 'FDR', ?, ?, ?, datetime('now', '-' || ? || ' hours'))
      `).run(
        instUserId,
        fdrId,
        JSON.stringify({ status: "ACTIVE" }),
        JSON.stringify({
          status: "RELEASE_REQUESTED",
          clearance_progress: fdr.clearanceProgress || "2 of 4 cleared",
          rule_code: fdr.ruleCode || null,
          rule_reason: fdr.ruleReason || null,
          remark: fdr.reviewReason || "Release requested upon course completion / programme closure"
        }),
        fdrIndex * 3
      );
    } else if (fdr.status === "MATURED") {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'FDR_VERIFIED', 'FDR', ?, ?, ?, datetime('now', '-' || ? || ' days', '+6 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({ status: "SUBMITTED" }),
        JSON.stringify({
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          remark: "Initial deposit verification verified and approved"
        }),
        daysAgo
      );

      // Event 4: Maturity alert
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'MATURITY_ALERT_GENERATED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({
          status: "MATURED",
          remark: fdr.reviewReason || "Deposit instrument reached statutory maturity date. Renewal notice dispatched."
        }),
        fdrIndex * 4
      );
    } else if (isDiscrepant) {
      // Discrepancy Found event
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'BANK_VERIFICATION_FAIL', 'FDR', ?, ?, ?, datetime('now', '-' || ? || ' days', '+6 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({ verificationStatus: "PENDING" }),
        JSON.stringify({
          verificationStatus: "FLAGGED",
          rule_code: fdr.ruleCode,
          rule_reason: fdr.ruleReason,
          remark: fdr.reviewReason
        }),
        daysAgo
      );

      // Event 4: Officer review notice
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'OFFICER_REVIEWED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({
          decision: "FLAGGED",
          rule_code: fdr.ruleCode,
          rule_reason: fdr.ruleReason,
          remark: `Compliance scrutiny notice issued: ${fdr.ruleReason}`
        }),
        fdrIndex * 2
      );
    } else if (fdr.status === "SUBMITTED") {
      // Event 3 for Submitted
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'INGESTION_VALIDATED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' days', '+5 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({
          status: "SUBMITTED",
          remark: "Document checksum verified; instrument queued for OCR scrutiny pipeline"
        }),
        daysAgo
      );
    } else if (fdr.verificationStatus === "PENDING") {
      // Event 3 for Under Review
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'OCR_COMPLETED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' days', '+6 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({
          confidence: 0.94,
          remark: "Automated OCR extraction completed with 94% confidence; awaiting officer scrutiny"
        }),
        daysAgo
      );
    } else {
      // Active Verified or Approaching Maturity
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'BANK_VERIFICATION_PASS', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' days', '+5 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({
          bank: fdr.bank,
          fdrNumber: fdr.number,
          remark: "Direct issuer bank API confirmed active deposit status and AICTE joint lien"
        }),
        daysAgo
      );

      // Event 4: Officer Verified
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (?, 'FDR_VERIFIED', 'FDR', ?, ?, ?, datetime('now', '-' || ? || ' days', '+8 hours'))
      `).run(
        officerId,
        fdrId,
        JSON.stringify({ verificationStatus: "PENDING" }),
        JSON.stringify({
          verificationStatus: "VERIFIED",
          remark: "Security deposit endorsed and fully verified into AICTE registry"
        }),
        daysAgo
      );

      if (fdr.number.includes("APPR")) {
        // Event 5 for Approaching Maturity
        db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
          VALUES (?, 'RENEWAL_WINDOW_OPENED', 'FDR', ?, NULL, ?, datetime('now', '-' || ? || ' hours'))
        `).run(
          officerId,
          fdrId,
          JSON.stringify({
            maturityDate: fdr.maturityDate,
            remark: "Deposit matures within 90 days. Mandatory renewal window opened for institution."
          }),
          fdrIndex * 3
        );
      }
    }
  }

  // 5. Seed renewals
  for (const renewal of demoData.renewals) {
    const oldFdrId = demoFdrIds.get(renewal.oldFdrNumber);
    const newFdrId = renewal.newFdrNumber ? demoFdrIds.get(renewal.newFdrNumber) : null;
    if (oldFdrId) {
      db.prepare(`
        INSERT INTO renewals (old_fdr_id, new_fdr_id, renewal_date, status, requested_maturity_date, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        oldFdrId,
        newFdrId,
        renewal.renewalDate,
        renewal.status,
        renewal.requestedMaturityDate,
        renewal.reason
      );
    }
  }

  // 6. Seed release requests and associated documents
  const releaseFdr1 = demoFdrIds.get("DEMO-FDR-2027-LOCKIN-09");
  const releaseFdr2 = demoFdrIds.get("DEMO-FDR-2027-REL-01");
  const releaseFdr3 = demoFdrIds.get("DEMO-FDR-2027-REL-02");
  const releaseFdr4 = demoFdrIds.get("DEMO-FDR-2026-MAT-01");
  const releaseFdr5 = demoFdrIds.get("DEMO-FDR-2026-VIG-05");

  const insertRelease = db.prepare(`
    INSERT INTO release_requests (fdr_id, request_type, reason, review_remarks, status, reviewed_by, reviewed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const insertAuditLog = db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (?, ?, 'RELEASE_REQUEST', ?, ?, ?, datetime('now', ?))
  `);

  const insertDoc = db.prepare(`
    INSERT INTO documents (fdr_id, file_name, file_path, document_type, uploaded_at)
    VALUES (?, ?, ?, ?, datetime('now', ?))
  `);

  // Helper to ensure documents for release FDR
  function seedReleaseDocuments(fdrId, fdrNumber) {
    insertDoc.run(fdrId, `Release_Application_Letter_${fdrNumber}.pdf`, '/uploads/fdr/fdr-1792874488437-465716210.pdf', 'Release Request Letter', '-4 days');
    insertDoc.run(fdrId, `Board_Resolution_Course_Closure_${fdrNumber}.pdf`, '/uploads/fdr/fdr-1792874517178-820766673.pdf', 'Supporting Document', '-3 days');
    insertDoc.run(fdrId, `Bank_No_Lien_Certificate_${fdrNumber}.pdf`, '/uploads/fdr/fdr-1792915193599-800728016.pdf', 'Supporting Document', '-2 days');
  }

  // Request 1: Pending (DEMO-FDR-2027-REL-01, Konkan)
  if (releaseFdr2) {
    const res = insertRelease.run(
      releaseFdr2,
      'Release',
      'Course closure completed; security deposit release clearance initiated (2 of 4 clearances received).',
      null,
      'PENDING',
      null,
      null,
      '-2 days'
    );
    seedReleaseDocuments(releaseFdr2, 'DEMO-FDR-2027-REL-01');
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_SUBMITTED',
      res.lastInsertRowid,
      null,
      JSON.stringify({ status: 'PENDING', remarks: 'Application submitted by institution nodal officer.', previousStatus: 'NEW', officerName: 'System / Institution' }),
      '-2 days'
    );
  }

  // Request 2: Under Review (DEMO-FDR-2027-REL-02, Deccan)
  if (releaseFdr3) {
    const res = insertRelease.run(
      releaseFdr3,
      'Release',
      'Programme capacity rationalization; release clearance in progress across regional desk.',
      'Request dossier received and assigned for inter-departmental verification.',
      'UNDER_REVIEW',
      officerId,
      new Date().toISOString(),
      '-3 days'
    );
    seedReleaseDocuments(releaseFdr3, 'DEMO-FDR-2027-REL-02');
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_SUBMITTED',
      res.lastInsertRowid,
      null,
      JSON.stringify({ status: 'PENDING', remarks: 'Application submitted by institution.', previousStatus: 'NEW', officerName: 'System / Institution' }),
      '-3 days'
    );
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_UNDER_REVIEW',
      res.lastInsertRowid,
      JSON.stringify({ status: 'PENDING' }),
      JSON.stringify({ status: 'UNDER_REVIEW', remarks: 'Request dossier received and assigned for inter-departmental verification.', previousStatus: 'PENDING', officerName: 'Raj Sharma (AICTE Regulation Officer)' }),
      '-4 hours'
    );
  }

  // Request 3: More Information Required (DEMO-FDR-2026-MAT-01, ABC)
  if (releaseFdr4) {
    const res = insertRelease.run(
      releaseFdr4,
      'Refund',
      'Refund of security deposit requested after closure of postgraduate division and issuance of NOC.',
      'Please provide the required supporting document: Certified copy of Governing Body Resolution and audited balance sheet showing zero pending liabilities.',
      'MORE_INFO_REQUIRED',
      officerId,
      new Date().toISOString(),
      '-4 days'
    );
    seedReleaseDocuments(releaseFdr4, 'DEMO-FDR-2026-MAT-01');
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_SUBMITTED',
      res.lastInsertRowid,
      null,
      JSON.stringify({ status: 'PENDING', remarks: 'Application submitted for security refund.', previousStatus: 'NEW', officerName: 'System / Institution' }),
      '-4 days'
    );
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_MORE_INFO_REQUIRED',
      res.lastInsertRowid,
      JSON.stringify({ status: 'UNDER_REVIEW' }),
      JSON.stringify({ status: 'MORE_INFO_REQUIRED', remarks: 'Please provide the required supporting document: Certified copy of Governing Body Resolution and audited balance sheet showing zero pending liabilities.', previousStatus: 'UNDER_REVIEW', officerName: 'Raj Sharma (AICTE Regulation Officer)' }),
      '-1 day'
    );
  }

  // Request 4: Rejected (DEMO-FDR-2027-LOCKIN-09, Western)
  if (releaseFdr1) {
    const res = insertRelease.run(
      releaseFdr1,
      'Release',
      'Premature release request submitted before statutory lock-in period elapsed.',
      'Rejected per Rule R9: Instrument is subject to mandatory statutory lock-in moratorium; premature release prohibited prior to regulatory tenure completion.',
      'REJECTED',
      officerId,
      new Date().toISOString(),
      '-5 days'
    );
    seedReleaseDocuments(releaseFdr1, 'DEMO-FDR-2027-LOCKIN-09');
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_SUBMITTED',
      res.lastInsertRowid,
      null,
      JSON.stringify({ status: 'PENDING', remarks: 'Application submitted by institution.', previousStatus: 'NEW', officerName: 'System / Institution' }),
      '-5 days'
    );
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_REJECTED',
      res.lastInsertRowid,
      JSON.stringify({ status: 'PENDING' }),
      JSON.stringify({ status: 'REJECTED', remarks: 'Rejected per Rule R9: Instrument is subject to mandatory statutory lock-in moratorium; premature release prohibited prior to regulatory tenure completion.', previousStatus: 'PENDING', officerName: 'Raj Sharma (AICTE Regulation Officer)' }),
      '-1 day'
    );
  }

  // Request 5: Approved (DEMO-FDR-2026-VIG-05, Deccan)
  if (releaseFdr5) {
    const res = insertRelease.run(
      releaseFdr5,
      'Refund',
      'Excess security deposit refund post annual capacity rationalization.',
      'Approved following complete regional office clearance, bank verification, and vigilance audit concurrence. Collateral discharged from AICTE registry.',
      'APPROVED',
      officerId,
      new Date().toISOString(),
      '-6 days'
    );
    seedReleaseDocuments(releaseFdr5, 'DEMO-FDR-2026-VIG-05');
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_SUBMITTED',
      res.lastInsertRowid,
      null,
      JSON.stringify({ status: 'PENDING', remarks: 'Application submitted by institution.', previousStatus: 'NEW', officerName: 'System / Institution' }),
      '-6 days'
    );
    insertAuditLog.run(
      officerId,
      'RELEASE_REQUEST_APPROVED',
      res.lastInsertRowid,
      JSON.stringify({ status: 'UNDER_REVIEW' }),
      JSON.stringify({ status: 'APPROVED', remarks: 'Approved following complete regional office clearance, bank verification, and vigilance audit concurrence. Collateral discharged from AICTE registry.', previousStatus: 'UNDER_REVIEW', officerName: 'Raj Sharma (AICTE Regulation Officer)' }),
      '-2 days'
    );
  }

  // 7. Seed realistic institution notifications (5 notifications)
  const abcUser = db.prepare("SELECT id FROM users WHERE email = 'admin@abc.ac.in'").get();
  if (abcUser) {
    const fdrAppr = demoFdrIds.get("DEMO-FDR-2026-APPR-01") || null;
    const fdrAct = demoFdrIds.get("DEMO-FDR-2027-ACT-01") || null;
    const fdrMat = demoFdrIds.get("DEMO-FDR-2026-MAT-01") || null;
    const fdrSub = demoFdrIds.get("DEMO-FDR-2026-SUB-01") || null;

    const renewalRow4 = fdrMat ? db.prepare("SELECT id FROM renewals WHERE old_fdr_id = ?").get(fdrMat) : null;
    const renewalRow6 = fdrAppr ? db.prepare("SELECT id FROM renewals WHERE old_fdr_id = ?").get(fdrAppr) : null;

    const insertNotification = db.prepare(`
      INSERT INTO notifications (user_id, message, type, is_read, fdr_id, renewal_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);

    insertNotification.run(
      abcUser.id,
      "FDR DEMO-FDR-2026-APPR-01 will mature in 14 days. Please submit a renewal request if required.",
      "RENEWAL_REMINDER",
      0,
      fdrAppr,
      renewalRow6?.id || null,
      "-2 hours"
    );

    insertNotification.run(
      abcUser.id,
      "FDR DEMO-FDR-2027-ACT-01 has been verified successfully against State Bank of India core banking records.",
      "FDR_VERIFIED",
      1,
      fdrAct,
      null,
      "-1 day"
    );

    insertNotification.run(
      abcUser.id,
      `Renewal request #${renewalRow4?.id || 4} for FDR DEMO-FDR-2026-MAT-01 has been approved by the AICTE Regional Officer.`,
      "RENEWAL_APPROVED",
      1,
      fdrMat,
      renewalRow4?.id || null,
      "-3 days"
    );

    insertNotification.run(
      abcUser.id,
      "New FDR submission DEMO-FDR-2026-SUB-01 received and queued for automated OCR document verification.",
      "FDR_SUBMITTED",
      1,
      fdrSub,
      null,
      "-5 days"
    );

    insertNotification.run(
      abcUser.id,
      "AICTE Western Regional Office has issued the annual fixed deposit compliance certificate for academic year 2026-27.",
      "SYSTEM_NOTICE",
      1,
      null,
      null,
      "-7 days"
    );
  }

  // 8. Seed realistic officer notifications (11 operational & compliance notifications)
  if (officerUserRecord) {
    const fdrAmt03 = demoFdrIds.get("DEMO-FDR-2026-AMT-03") || null;
    const fdrAppr01 = demoFdrIds.get("DEMO-FDR-2026-APPR-01") || null;
    const fdrSub01 = demoFdrIds.get("DEMO-FDR-2026-SUB-01") || null;
    const fdrDup01 = demoFdrIds.get("DEMO-FDR-2026-DUP-01") || null;
    const fdrLockin09 = demoFdrIds.get("DEMO-FDR-2027-LOCKIN-09") || null;
    const fdrRel01 = demoFdrIds.get("DEMO-FDR-2027-REL-01") || null;
    const fdrDate02 = demoFdrIds.get("DEMO-FDR-2026-DATE-02") || null;
    const fdrMat01 = demoFdrIds.get("DEMO-FDR-2026-MAT-01") || null;
    const fdrSub02 = demoFdrIds.get("DEMO-FDR-2026-SUB-02") || null;
    const fdrVig05 = demoFdrIds.get("DEMO-FDR-2026-VIG-05") || null;

    const renewalRowMat01 = fdrMat01 ? db.prepare("SELECT id FROM renewals WHERE old_fdr_id = ?").get(fdrMat01) : null;
    const renewalRowAppr01 = fdrAppr01 ? db.prepare("SELECT id FROM renewals WHERE old_fdr_id = ?").get(fdrAppr01) : null;

    const insertOfficerNotif = db.prepare(`
      INSERT INTO notifications (user_id, message, type, is_read, fdr_id, renewal_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Discrepancy detected in FDR DEMO-FDR-2026-AMT-03 (Sahyadri College of Applied Engineering): Stated certificate amount ₹25,00,000 does not match ICICI Bank core banking ledger (₹20,00,000). Scrutiny required.",
      "DISCREPANCY_ALERT",
      0,
      fdrAmt03,
      null,
      "-25 minutes"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "FDR DEMO-FDR-2026-APPR-01 (ABC) will mature in 14 days (10 Nov 2026). Mandatory renewal compliance window opened.",
      "RENEWAL_ALERT",
      0,
      fdrAppr01,
      renewalRowAppr01?.id || null,
      "-1 hour"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "New FDR submission DEMO-FDR-2026-SUB-01 (₹10,00,000) received from ABC. Queued for automated OCR and SBI core verification.",
      "FDR_SUBMISSION",
      0,
      fdrSub01,
      null,
      "-2 hours"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Rule R1 Violation: Instrument DEMO-FDR-2026-DUP-01 (Western Institute of Technology) flagged as duplicate registration across multiple application dockets.",
      "RULE_VIOLATION",
      0,
      fdrDup01,
      null,
      "-3 hours"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Premature collateral release request on DEMO-FDR-2027-LOCKIN-09 (Western Institute of Technology) blocked by Rule R9 (3-Year Statutory Lock-in Moratorium).",
      "RELEASE_REQUEST",
      0,
      fdrLockin09,
      null,
      "-5 hours"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Collateral release clearance for DEMO-FDR-2027-REL-01 (Konkan School of Engineering) updated: 2 of 4 regional nodal clearances completed.",
      "RELEASE_PROGRESS",
      1,
      fdrRel01,
      null,
      "-1 day"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Rule R2 Violation: FDR DEMO-FDR-2026-DATE-02 (Konkan School of Engineering) certificate states maturity date preceding issuance date.",
      "RULE_VIOLATION",
      1,
      fdrDate02,
      null,
      "-1 day"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Renewal request for FDR DEMO-FDR-2026-MAT-01 (ABC) approved and updated in AICTE central collateral registry.",
      "RENEWAL_APPROVED",
      1,
      fdrMat01,
      renewalRowMat01?.id || null,
      "-2 days"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "FDR DEMO-FDR-2026-SUB-02 submitted by Western Institute of Technology. Axis Bank branch confirmation pending.",
      "FDR_SUBMISSION",
      1,
      fdrSub02,
      null,
      "-3 days"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "Vigilance audit completed for FDR DEMO-FDR-2026-VIG-05 (Deccan School of Engineering, ₹30,00,000). Instrument cleared without lien encumbrance.",
      "COMPLIANCE_NOTICE",
      1,
      fdrVig05,
      null,
      "-4 days"
    );

    insertOfficerNotif.run(
      officerUserRecord.id,
      "AICTE Central Headquarters: Q3 Security Deposit reconciliation completed with Reserve Bank of India designated scheduled banks.",
      "SYSTEM_NOTICE",
      1,
      null,
      null,
      "-5 days"
    );
  }
});

seedDemoRecords();

console.log("Seed data created successfully with exactly 51 FDRs and rich audit logs.");
console.log("");
console.log("Institution Login: admin@abc.ac.in / ABC@12345");
console.log("AICTE Officer Login: officer@aicte.gov.in / AICTE@12345");

db.close();
