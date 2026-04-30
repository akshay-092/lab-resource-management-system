const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { USER_ROLES } = require("../utils/constants");

/**
 * Registers a new user using email, password, user Role.
 *
 * - Validates request body
 * - Prevents duplicate emails
 * - Hashes password
 * - Creates user document
 *
 * @param {Object} req.body
 * @param {string} req.body.email
 * @param {string} req.body.password
 * @param {string} [req.body.role]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, user: { id: string, email: string, role: string } }
 */
const handleRegisterUser = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required.", success: false });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res
      .status(400)
      .json({ message: "Invalid email address.", success: false });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters.",
      success: false,
    });
  }

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: "User already exists with this email.",
        success: false,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const normalizedRole = role ? String(role).trim().toLowerCase() : USER_ROLES.USER;

    if (role && !Object.values(USER_ROLES).includes(normalizedRole)) {
      return res.status(400).json({
        message: "Invalid role Provide valid role.",
        success: false,
      });
    }

    const user = await User.create({
      email: normalizedEmail,
      password: passwordHash,
      role: normalizedRole,
    });

    return res.status(201).json({
      message: "User registered successfully.",
      user: { id: user._id, email: user.email, role: user.role },
      success: true,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ message: "Server error during registration.", success: false });
  }
};

/**
 * Logs in a user using email + password.
 *
 * - Validates request body
 * - Checks user existence
 * - Compares password hash
 * - Updates `lastLoginAt`
 * - Returns a userData object with a JWT token
 *
 * @param {Object} req.body
 * @param {string} req.body.email
 * @param {string} req.body.password
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, userData: { id: string, email: string, role: string, token: string } }
 */
const handleLoginUser = async (req, res) => {
  const { email, password } = req.body;
  // Validate input
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required.", success: false });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password"
    );

    if (!user) {
      return res
        .status(401)
        .json({ message: "Invalid email or password.", success: false });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid email or password.", success: false });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret is not configured.",
        success: false,
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userData = {
      id: user._id,
      email: user.email,
      role: user.role,
      token: token,
    };

    return res.json({ message: "Login successful.", userData, success: true });
  } catch (err) {
    console.error("Login error:", err);
    return res
      .status(500)
      .json({ message: "Server error during login.", success: false });
  }
};

module.exports = {
  handleRegisterUser,
  handleLoginUser,
};
