const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

// @route   POST /api/login
// @desc    Admin authentication and JWT generation
// @access  Public
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";

  if (!username || !password) {
    return res.status(400).json({ msg: "Please enter all fields" });
  }

  if (username === adminUser && password === adminPass) {
    const payload = { username };
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "bytewire_super_secret_jwt_key_2026",
      { expiresIn: "7d" }
    );
    return res.json({ token, username });
  }

  return res.status(400).json({ msg: "Invalid admin credentials" });
});

module.exports = router;
