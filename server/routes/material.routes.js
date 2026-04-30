const express = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireAdmin } = require("../middlewares/role.middleware");
const {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
} = require("../controllers/material.controllers");

const router = express.Router();

// All material endpoints require a valid token and existing user.
router.use(requireAuth);

// POST /api/materials/list
router.post("/list", listMaterials);

// POST /api/materials/create
router.post("/create", requireAdmin, createMaterial);

// POST /api/materials/update
router.post("/update", requireAdmin, updateMaterial);

// POST /api/materials/delete
router.post("/delete", requireAdmin, deleteMaterial);

module.exports = router;
