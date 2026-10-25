const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../database/database");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "development-secret-change-this";

// POST /api/auth/login
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // Find user
    const user = db
      .prepare(`
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = ?
      `)
      .get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    // Check password
    const passwordValid = bcrypt.compareSync(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      JWT_SECRET,
      {
        expiresIn: "8h"
      }
    );

    // Don't send password hash to frontend
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Internal server error"
    });
  }
});

module.exports = router;