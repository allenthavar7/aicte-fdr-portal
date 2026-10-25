const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Store the SQLite database outside src/
const databaseFolder = path.join(__dirname, "../../database");

// Create database folder if it doesn't exist
if (!fs.existsSync(databaseFolder)) {
  fs.mkdirSync(databaseFolder, { recursive: true });
}

const databasePath = path.join(databaseFolder, "aicte.db");

// Open SQLite database
const db = new Database(databasePath);

// Enable foreign key relationships
db.pragma("foreign_keys = ON");

module.exports = db;