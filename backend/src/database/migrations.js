function ensureVerificationColumns(db) {
  const applicationsTable = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'applications'
    `)
    .get();

  if (!applicationsTable) {
    throw new Error(
      "The applications table is missing. Run npm run db:init before starting the backend."
    );
  }

  const applicationColumns = new Set(
    db.prepare("PRAGMA table_info(applications)")
      .all()
      .map((column) => column.name)
  );

  if (!applicationColumns.has("description")) {
    db.exec("ALTER TABLE applications ADD COLUMN description TEXT");
  }

  const table = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'verifications'
    `)
    .get();

  if (!table) {
    throw new Error(
      "The verifications table is missing. Run npm run db:init before starting the backend."
    );
  }

  const columns = new Set(
    db.prepare("PRAGMA table_info(verifications)")
      .all()
      .map((column) => column.name)
  );

  const migrations = [
    ["verification_score", "REAL"],
    ["ocr_confidence", "REAL"],
    ["extracted_data", "TEXT"],
    ["comparison_results", "TEXT"],
    ["review_reason", "TEXT"],
    ["bank_verification_result", "TEXT"],
    ["verification_checks", "TEXT"]
  ];

  for (const [column, type] of migrations) {
    if (!columns.has(column)) {
      db.exec(`ALTER TABLE verifications ADD COLUMN ${column} ${type}`);
    }
  }

  const renewalsTable = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'renewals'
    `)
    .get();
  if (!renewalsTable) {
    throw new Error(
      "The renewals table is missing. Run npm run db:init before starting the backend."
    );
  }

  const renewalColumns = db
    .prepare("PRAGMA table_info(renewals)")
    .all();
  const renewalColumnNames = new Set(
    renewalColumns.map((column) => column.name)
  );
  const newFdrColumn = renewalColumns.find(
    (column) => column.name === "new_fdr_id"
  );

  if (!newFdrColumn) {
    throw new Error("The renewals table is missing new_fdr_id.");
  }

  if (newFdrColumn.notnull) {
    const migrateRenewals = db.transaction(() => {
      db.exec(`
        CREATE TABLE renewals_migration (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          old_fdr_id INTEGER NOT NULL,
          new_fdr_id INTEGER,
          renewal_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'APPROVED',
          requested_maturity_date TEXT,
          reason TEXT,
          reviewed_by INTEGER,
          reviewed_at DATETIME,
          review_reason TEXT,
          FOREIGN KEY (old_fdr_id) REFERENCES fdrs(id),
          FOREIGN KEY (new_fdr_id) REFERENCES fdrs(id),
          FOREIGN KEY (reviewed_by) REFERENCES users(id)
        )
      `);
      db.exec(`
        INSERT INTO renewals_migration (
          id, old_fdr_id, new_fdr_id, renewal_date, status
        )
        SELECT id, old_fdr_id, new_fdr_id, renewal_date, 'APPROVED'
        FROM renewals
      `);
      db.exec("DROP TABLE renewals");
      db.exec("ALTER TABLE renewals_migration RENAME TO renewals");
    });
    migrateRenewals();
  } else {
    const renewalMigrations = [
      ["status", "TEXT NOT NULL DEFAULT 'APPROVED'"],
      ["requested_maturity_date", "TEXT"],
      ["reason", "TEXT"],
      ["reviewed_by", "INTEGER REFERENCES users(id)"],
      ["reviewed_at", "DATETIME"],
      ["review_reason", "TEXT"]
    ];

    for (const [column, type] of renewalMigrations) {
      if (!renewalColumnNames.has(column)) {
        db.exec(`ALTER TABLE renewals ADD COLUMN ${column} ${type}`);
      }
    }
  }

  const notificationTable = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'notifications'
    `)
    .get();
  if (!notificationTable) {
    throw new Error(
      "The notifications table is missing. Run npm run db:init before starting the backend."
    );
  }

  const notificationColumns = new Set(
    db.prepare("PRAGMA table_info(notifications)")
      .all()
      .map((column) => column.name)
  );
  const notificationMigrations = [
    ["fdr_id", "INTEGER REFERENCES fdrs(id)"],
    ["application_id", "INTEGER REFERENCES applications(id)"],
    ["renewal_id", "INTEGER REFERENCES renewals(id)"]
  ];

  for (const [column, type] of notificationMigrations) {
    if (!notificationColumns.has(column)) {
      db.exec(`ALTER TABLE notifications ADD COLUMN ${column} ${type}`);
    }
  }

  const releaseRequestColumns = new Set(
    db.prepare("PRAGMA table_info(release_requests)")
      .all()
      .map((column) => column.name)
  );

  const releaseRequestMigrations = [
    ["request_type", "TEXT DEFAULT 'Release'"],
    ["review_remarks", "TEXT"]
  ];

  for (const [column, type] of releaseRequestMigrations) {
    if (!releaseRequestColumns.has(column)) {
      db.exec(`ALTER TABLE release_requests ADD COLUMN ${column} ${type}`);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_renewals_old_fdr
      ON renewals(old_fdr_id);
    CREATE INDEX IF NOT EXISTS idx_renewals_status
      ON renewals(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_renewals_single_open_request
      ON renewals(old_fdr_id)
      WHERE new_fdr_id IS NULL
        AND status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'ACTION_REQUIRED');
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read
      ON notifications(user_id, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_fdr
      ON notifications(fdr_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_renewal
      ON notifications(renewal_id);
  `);
}

module.exports = ensureVerificationColumns;
