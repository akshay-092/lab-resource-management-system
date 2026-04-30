/**
 * Role-based access middleware helpers.
 */

/**
 * Allows only admin users.
 *
 * Requires `requireAuth` to run before this, so `req.user` is available.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
function requireAdmin(req, res, next) {
  const role = req.user?.role;

  if (role !== "admin") {
    res.status(403).json({
      message: "Access denied. Admin only.",
      success: false,
    });
    return;
  }

  next();
}

/**
 * Allows only standard users (not admins).
 *
 * Requires `requireAuth` to run before this, so `req.user` is available.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
function requireUser(req, res, next) {
  const role = req.user?.role;

  if (role !== "user") {
    res.status(403).json({
      message: "Access denied. Standard users only.",
      success: false,
    });
    return;
  }

  next();
}

module.exports = { requireAdmin, requireUser };

