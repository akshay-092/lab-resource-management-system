const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

/**
 * Auth middleware:
 * - Reads Bearer token from `Authorization` header
 * - Verifies JWT signature
 * - Ensures the user exists
 * - Attaches `req.user`
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers?.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      res
        .status(401)
        .json({ message: "Authorization token is required.", success: false });
      return;
    }

    if (!process.env.JWT_SECRET) {
      res.status(500).json({
        message: "JWT secret is not configured.",
        success: false,
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.userId;

    if (!userId) {
      res.status(401).json({ message: "Invalid token.", success: false });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({ message: "User not found.", success: false });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token.", success: false });
  }
}

module.exports = { requireAuth };

