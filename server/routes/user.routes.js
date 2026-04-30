const express = require("express");
const {
  handleLoginUser,
  handleRegisterUser,
} = require("../controllers/user.controllers");

const router = express.Router();

// POST /api/auth/register
router.post("/register", handleRegisterUser);

// POST /api/auth/login
router.post("/login", handleLoginUser);

module.exports = router;
