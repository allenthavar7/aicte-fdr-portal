const bcrypt = require("bcryptjs");
const db = require("./database");

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