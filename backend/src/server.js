const express = require("express");
const cors = require("cors");
require("dotenv").config();
const authRoutes = require("./routes/auth");
const fdrRoutes = require("./routes/fdr");
const officerRoutes = require("./routes/officer");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/auth", authRoutes);
app.use("/api/fdr", fdrRoutes);
app.use("/api/officer", officerRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "AICTE Security Deposit/FDR Management API is running"
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database: "SQLite connected"
  });
});

// Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});