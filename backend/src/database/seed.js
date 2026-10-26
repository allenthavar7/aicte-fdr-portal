const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const db = require("./database");
const demoData = require("../../../shared/officerDemoData.json");

const institutionPassword = bcrypt.hashSync(
  "VJTI@12345",
  10
);

const officerPassword = bcrypt.hashSync(
  "AICTE@12345",
  10
);

// Create VJTI Engineering College user
const institutionUser = db.prepare(`
  INSERT OR IGNORE INTO users
  (name, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run(
  "VJTI Engineering College",
  "admin@vjti.ac.in",
  institutionPassword,
  "INSTITUTION"
);

// Get the institution user
const institutionUserRecord = db.prepare(`
  SELECT id
  FROM users
  WHERE email = ?
`).get("admin@vjti.ac.in");

// Create VJTI Engineering College
db.prepare(`
  INSERT OR IGNORE INTO institutions
  (name, aicte_code, address, city, state, email, user_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  "VJTI Engineering College",
  "AICTE-MH-001",
  "Matunga, Mumbai",
  "Mumbai",
  "Maharashtra",
  "admin@vjti.ac.in",
  institutionUserRecord.id
);

// Create AICTE Officer
db.prepare(`
  INSERT OR IGNORE INTO users
  (name, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run(
  "AICTE Regulation Officer",
  "officer@aicte.gov.in",
  officerPassword,
  "OFFICER"
);

const demoInstitutionIds = new Map();
const demoFdrIds = new Map();

const seedDemoRecords = db.transaction(() => {
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
    const institutionId = db.prepare(
      "SELECT id FROM institutions WHERE aicte_code = ?"
    ).get(institution.code)?.id;
    if (!institutionId) {
      throw new Error(`Unable to seed demo institution ${institution.code}`);
    }
    demoInstitutionIds.set(institution.code, institutionId);
  }

  for (const fdr of demoData.fdrs) {
    const institutionId = demoInstitutionIds.get(fdr.institutionCode);
    if (!institutionId) {
      throw new Error(`Missing demo institution for ${fdr.number}`);
    }

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
        fdr.applicationType,
        "DEMO — Applied Engineering",
        applicationDescription
      );
      applicationId = Number(application.lastInsertRowid);
    }

    let fdrId = db.prepare(
      "SELECT id FROM fdrs WHERE fdr_number = ?"
    ).get(fdr.number)?.id;
    if (!fdrId) {
      const result = db.prepare(`
        INSERT INTO fdrs (
          fdr_number, bank_name, amount, issue_date, maturity_date, status,
          verification_status, institution_id, application_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fdr.number,
        fdr.bank,
        fdr.amount,
        fdr.issueDate,
        fdr.maturityDate,
        fdr.status,
        fdr.verificationStatus,
        institutionId,
        applicationId
      );
      fdrId = Number(result.lastInsertRowid);
    }
    demoFdrIds.set(fdr.number, fdrId);
  }

  for (const renewal of demoData.renewals) {
    const oldFdrId = demoFdrIds.get(renewal.oldFdrNumber);
    const newFdrId = renewal.newFdrNumber
      ? demoFdrIds.get(renewal.newFdrNumber)
      : null;
    if (!oldFdrId || (renewal.newFdrNumber && !newFdrId)) {
      throw new Error(`Unable to link demo renewal for ${renewal.oldFdrNumber}`);
    }

    const existing = db.prepare(`
      SELECT id FROM renewals
      WHERE old_fdr_id = ? AND renewal_date = ? AND reason = ?
    `).get(oldFdrId, renewal.renewalDate, renewal.reason);
    if (!existing) {
      db.prepare(`
        INSERT INTO renewals (
          old_fdr_id, new_fdr_id, renewal_date, status,
          requested_maturity_date, reason
        )
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

  const releaseFdrId = demoFdrIds.get("DEMO-FDR-2027-JAN-02");
  const releaseExists = db.prepare(`
    SELECT id FROM release_requests
    WHERE fdr_id = ? AND reason = ?
  `).get(releaseFdrId, "DEMO — Course capacity reduction; sample request only.");
  if (!releaseExists) {
    db.prepare(`
      INSERT INTO release_requests (fdr_id, reason, status)
      VALUES (?, ?, 'PENDING')
    `).run(
      releaseFdrId,
      "DEMO — Course capacity reduction; sample request only."
    );
  }
});

seedDemoRecords();

console.log("Seed data created successfully.");

console.log("");
console.log("Institution Login");
console.log("-----------------");
console.log("Email: admin@vjti.ac.in");
console.log("Password: VJTI@12345");

console.log("");
console.log("AICTE Officer Login");
console.log("--------------------");
console.log("Email: officer@aicte.gov.in");
console.log("Password: AICTE@12345");

db.close();