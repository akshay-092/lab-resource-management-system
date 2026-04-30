const Material = require("../models/material.model");
const Booking = require("../models/booking.model");
const { isValidObjectId, toNumber, escapeRegex } = require("../utils/common");
const { ALLOWED_UNITS, BOOKING_STATUS } = require("../utils/constants");

/**
 * Creates a new material.
 *
 * @param {Object} req.body
 * @param {string} req.body.name
 * @param {string} [req.body.description]
 * @param {string} [req.body.unit]
 * @param {string} [req.body.owner]
 * @param {number} req.body.totalQuantity
 * @param {boolean} [req.body.requiresApproval]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, material: Object }
 */
const createMaterial = async (req, res) => {
  const {
    name,
    description,
    unit,
    owner,
    totalQuantity,
    requiresApproval,
  } = req.body;

  if (!name) {
    return res
      .status(400)
      .json({ message: "name is required.", success: false });
  }

  const total = toNumber(totalQuantity);

  if (Number.isNaN(total)) {
    return res.status(400).json({
      message: "totalQuantity must be a valid number.",
      success: false,
    });
  }

  if (total < 0) {
    return res.status(400).json({
      message: "totalQuantity cannot be negative.",
      success: false,
    });
  }

  const normalizedUnit = unit ? String(unit).trim() : "units";
  if (!ALLOWED_UNITS.includes(normalizedUnit)) {
    return res.status(400).json({
      message: "Invalid unit. Allowed: ml, g, L, units.",
      success: false,
    });
  }

  try {
    const ownerId = owner ? String(owner).trim() : String(req.user?._id || "");
    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(400).json({
        message: "Invalid owner id.",
        success: false,
      });
    }

    const material = await Material.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      owner: ownerId,
      unit: normalizedUnit,
      totalQuantity: total,
      // On create, all stock is free (no reservations yet).
      availableQuantity: total,
      reservedQuantity: 0,
      requiresApproval: Boolean(requiresApproval),
    });

    const materialData = material.toObject();
    delete materialData.__v;

    return res.status(201).json({
      message: "Material created successfully.",
      material: materialData,
      success: true,
    });
  } catch (error) {
    console.error("Create material error:", error);
    return res.status(500).json({
      message: "Server error while creating material.",
      success: false,
    });
  }
};

/**
 * Lists materials.
 *
 * @param {Object} req.body
 * @param {number} [req.body.page]
 * @param {number} [req.body.pageSize]
 * @param {string} [req.body.search]
 * @returns {Promise<import("express").Response>} { success: boolean, materials: Array, pagination: { page: number, pageSize: number, total: number, totalPages: number } }
 */
const listMaterials = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.body?.page, 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number.parseInt(req.body?.pageSize, 10) || 10)
    );
    const search = String(req.body?.search || "").trim();

    const filter = {};
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: re }, { description: re }, { unit: re }];
    }

    const total = await Material.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    const materials = await Material.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .populate("owner", "email role")
      .select("-__v");

    return res.json({
      materials,
      pagination: { page: safePage, pageSize, total, totalPages },
      success: true,
    });
  } catch (error) {
    console.error("List materials error:", error);
    return res.status(500).json({
      message: "Server error while listing materials.",
      success: false,
    });
  }
};

/**
 * Updates a material by id.
 *
 * @param {Object} req.body
 * @param {string} req.body.id
 * @param {string} [req.body.name]
 * @param {string} [req.body.description]
 * @param {string} [req.body.unit]
 * @param {string} [req.body.owner]
 * @param {number} [req.body.totalQuantity]
 * @param {boolean} [req.body.requiresApproval]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, material: Object }
 */
const updateMaterial = async (req, res) => {
  const id = req.body?.id;
  const {
    name,
    description,
    unit,
    owner,
    totalQuantity,
    requiresApproval,
  } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid material id.", success: false });
  }

  const update = {};
  if (name !== undefined) update.name = String(name).trim();
  if (description !== undefined) update.description = String(description).trim();
  if (unit !== undefined) update.unit = String(unit).trim();
  if (owner !== undefined) update.owner = String(owner).trim();
  if (requiresApproval !== undefined) update.requiresApproval = Boolean(requiresApproval);

  if (totalQuantity !== undefined) update.totalQuantity = toNumber(totalQuantity);

  if ("unit" in update && !ALLOWED_UNITS.includes(update.unit)) {
    return res.status(400).json({
      message: "Invalid unit. Allowed: ml, g, L, units.",
      success: false,
    });
  }

  if ("owner" in update && !isValidObjectId(update.owner)) {
    return res.status(400).json({
      message: "Invalid owner id.",
      success: false,
    });
  }

  const numericFields = ["totalQuantity"];
  for (const key of numericFields) {
    if (key in update && Number.isNaN(update[key])) {
      return res.status(400).json({
        message: `${key} must be a valid number.`,
        success: false,
      });
    }
    if (key in update && update[key] < 0) {
      return res.status(400).json({
        message: `${key} cannot be negative.`,
        success: false,
      });
    }
  }

  try {
    const existing = await Material.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: "Material not found.", success: false });
    }

    if ("requiresApproval" in update && update.requiresApproval === false && existing.requiresApproval === true) {
      const pendingBookings = await Booking.findOne({
        material: id,
        status: BOOKING_STATUS.PENDING,
      }).lean();

      if (pendingBookings) {
        return res.status(400).json({
          message: "Cannot disable approval requirement: There are pending bookings that must be resolved first.",
          success: false,
        });
      }
    }

    if ("totalQuantity" in update) {
      const nextTotal = update.totalQuantity;
      const reserved = existing.reservedQuantity;

      if (nextTotal < reserved) {
        return res.status(400).json({
          message: "totalQuantity cannot be less than reservedQuantity.",
          success: false,
        });
      }

      existing.totalQuantity = nextTotal;
      // Keep reserved as-is; recompute free stock.
      existing.availableQuantity = nextTotal - reserved;
    }

    if ("name" in update) existing.name = update.name;
    if ("description" in update) existing.description = update.description;
    if ("unit" in update) existing.unit = update.unit;
    if ("owner" in update) existing.owner = update.owner;
    if ("requiresApproval" in update)
      existing.requiresApproval = update.requiresApproval;

    await existing.save();
    await existing.populate("owner", "email role");

    const existingData = existing.toObject();
    delete existingData.__v;

    return res.json({
      message: "Material updated successfully.",
      material: existingData,
      success: true,
    });
  } catch (error) {
    console.error("Update material error:", error);
    return res.status(500).json({
      message: "Server error while updating material.",
      success: false,
    });
  }
};

/**
 * Deletes a material by id.
 *
 * @param {Object} req.body
 * @param {string} req.body.id
 * @returns {Promise<import("express").Response>} { success: boolean, message: string }
 */
const deleteMaterial = async (req, res) => {
  const id = req.body?.id;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid material id.", success: false });
  }

  try {
    // Check if any stock is currently locked or being requested
    const material = await Material.findById(id);
    if (!material) {
      return res.status(404).json({ message: "Material not found.", success: false });
    }

    // Prevents deletion if the material is currently reserved or requested.
    // Checks for pending approval requests or active stock reservations.
    const pendingBooking = await Booking.findOne({
      material: id,
      status: BOOKING_STATUS.PENDING,
    }).lean();

    if (pendingBooking || material.reservedQuantity > 0) {
      return res.status(400).json({
        message: "Cannot delete: There are pending requests or reserved stock for this material.",
        success: false,
      });
    }

    await Material.findByIdAndDelete(id);
    if (!material) {
      return res
        .status(404)
        .json({ message: "Material not found.", success: false });
    }

    return res.json({ message: "Material deleted successfully.", success: true });
  } catch (error) {
    console.error("Delete material error:", error);
    return res.status(500).json({
      message: "Server error while deleting material.",
      success: false,
    });
  }
};

module.exports = {
  createMaterial,
  listMaterials,
  updateMaterial,
  deleteMaterial,
};
