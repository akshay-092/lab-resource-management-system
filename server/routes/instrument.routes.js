const express = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireAdmin } = require("../middlewares/role.middleware");
const {
  createInstrument,
  deleteInstrument,
  listInstruments,
  updateInstrument,
} = require("../controllers/instrument.controllers");

const router = express.Router();

// All instrument endpoints require a valid token and existing user.
router.use(requireAuth);

// POST /api/instruments/list
router.post("/list", listInstruments);

// POST /api/instruments/create
router.post("/create", requireAdmin, createInstrument);

// POST /api/instruments/update
router.post("/update", requireAdmin, updateInstrument);

// POST /api/instruments/delete
router.post("/delete", requireAdmin, deleteInstrument);

module.exports = router;
