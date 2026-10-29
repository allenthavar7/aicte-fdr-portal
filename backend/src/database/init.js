const db = require("./database");

// Enable foreign-key support
db.pragma("foreign_keys = ON");

db.exec(`
  /* =========================================================
     USERS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,

    email TEXT UNIQUE NOT NULL,

    password_hash TEXT NOT NULL,

    role TEXT NOT NULL CHECK(
      role IN ('INSTITUTION', 'OFFICER', 'ADMIN')
    ),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );


  /* =========================================================
     INSTITUTIONS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,

    aicte_code TEXT UNIQUE NOT NULL,

    address TEXT,

    city TEXT,

    state TEXT,

    email TEXT,

    user_id INTEGER UNIQUE,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
  );


  /* =========================================================
     APPLICATIONS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    institution_id INTEGER NOT NULL,

    application_type TEXT NOT NULL CHECK(
      application_type IN (
        'NEW_INSTITUTION',
        'NEW_PROGRAMME',
        'INCREASE_INTAKE',
        'RENEWAL',
        'REPLACEMENT',
        'MODIFICATION',
        'OTHER'
      )
    ),

    programme_name TEXT,

    programme_level TEXT,

    discipline TEXT,

    current_intake INTEGER,

    proposed_intake INTEGER,

    academic_year TEXT,

    description TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (institution_id)
      REFERENCES institutions(id)
  );


  /* =========================================================
     FDRs
     ========================================================= */

  CREATE TABLE IF NOT EXISTS fdrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fdr_number TEXT NOT NULL,

    bank_name TEXT NOT NULL,

    amount REAL NOT NULL,

    issue_date TEXT NOT NULL,

    maturity_date TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',

    verification_status TEXT NOT NULL DEFAULT 'PENDING',

    institution_id INTEGER NOT NULL,

    application_id INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (institution_id)
      REFERENCES institutions(id),

    FOREIGN KEY (application_id)
      REFERENCES applications(id)
  );


  /* =========================================================
     DOCUMENTS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fdr_id INTEGER NOT NULL,

    file_name TEXT NOT NULL,

    file_path TEXT NOT NULL,

    document_type TEXT NOT NULL,

    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (fdr_id)
      REFERENCES fdrs(id)
  );


  /* =========================================================
     VERIFICATIONS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fdr_id INTEGER NOT NULL,

    submitted_amount REAL NOT NULL,

    bank_amount REAL,

    result TEXT NOT NULL,

    verification_source TEXT,

    message TEXT,

    verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (fdr_id)
      REFERENCES fdrs(id)
  );


  /* =========================================================
     RENEWALS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS renewals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    old_fdr_id INTEGER NOT NULL,

    new_fdr_id INTEGER NOT NULL,

    renewal_date DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (old_fdr_id)
      REFERENCES fdrs(id),

    FOREIGN KEY (new_fdr_id)
      REFERENCES fdrs(id)
  );


  /* =========================================================
     RELEASE REQUESTS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS release_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fdr_id INTEGER NOT NULL,

    request_type TEXT DEFAULT 'Release',

    reason TEXT NOT NULL,

    review_remarks TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    reviewed_by INTEGER,

    reviewed_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (fdr_id)
      REFERENCES fdrs(id)
  );


  /* =========================================================
     NOTIFICATIONS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    message TEXT NOT NULL,

    type TEXT NOT NULL,

    is_read INTEGER DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
  );


  /* =========================================================
     AUDIT LOGS
     ========================================================= */

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    action TEXT NOT NULL,

    entity_type TEXT NOT NULL,

    entity_id INTEGER,

    old_value TEXT,

    new_value TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
  );
`);


/* =========================================================
   MIGRATION
   =========================================================

   Existing databases may have been created before
   application_id was added to the fdrs table.

   CREATE TABLE IF NOT EXISTS does not modify an
   existing table, so check first.
   ========================================================= */

const fdrColumns = db
  .prepare("PRAGMA table_info(fdrs)")
  .all();

const hasApplicationId = fdrColumns.some(
  (column) => column.name === "application_id"
);

if (!hasApplicationId) {

  db.exec(`
    ALTER TABLE fdrs
    ADD COLUMN application_id INTEGER
  `);

  console.log(
    "Migration completed: application_id added to fdrs."
  );
}


/* =========================================================
   INDEXES
   ========================================================= */

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_fdrs_institution
  ON fdrs(institution_id);

  CREATE INDEX IF NOT EXISTS idx_fdrs_application
  ON fdrs(application_id);

  CREATE INDEX IF NOT EXISTS idx_fdrs_verification
  ON fdrs(verification_status);

  CREATE INDEX IF NOT EXISTS idx_applications_institution
  ON applications(institution_id);

  CREATE INDEX IF NOT EXISTS idx_documents_fdr
  ON documents(fdr_id);
`);

require("./migrations")(db);


/* =========================================================
   COMPLETE
   ========================================================= */

console.log(
  "SQLite database initialized successfully."
);

db.close();