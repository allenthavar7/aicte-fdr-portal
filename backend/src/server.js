const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const fdrRoutes = require("./routes/fdr");
const officerRoutes = require("./routes/officer");
const institutionRoutes = require("./routes/institution");

const db = require("./database/database");

require("./database/migrations")(db);

const app = express();

/* =========================================================
   CORS
   ========================================================= */

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   ROUTES
   ========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/fdr", fdrRoutes);

app.use("/api/officer", officerRoutes);

app.use("/api/institution", institutionRoutes);

/* =========================================================
   HOME
   ========================================================= */

app.get("/", (req, res) => {
  res.json({
    message:
      "AICTE Security Deposit/FDR Management API is running"
  });
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database: "SQLite connected"
  });
});

/* =========================================================
   SERVER
   ========================================================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});