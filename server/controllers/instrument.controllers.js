const Instrument = require("../models/instrument.model");
const Booking = require("../models/booking.model");
const { isValidObjectId, escapeRegex } = require("../utils/common");
const { BOOKING_STATUS } = require("../utils/constants");

/**
 * Creates a new instrument.
 *
 * @param {Object} req.body
 * @param {string} req.body.name
 * @param {string} [req.body.description]
 * @param {string} req.body.lab
 * @param {string} req.body.owner
 * @param {boolean} [req.body.requiresApproval]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, instrument: Object }
 */
const createInstrument = async (req, res) => {
  const { name, description, lab, owner, requiresApproval } = req.body;

  if (!name || !lab || !owner) {
    return res.status(400).json({
      message: "name, lab, and owner are required.",
      success: false,
    });
  }

  if (!isValidObjectId(owner)) {
    return res.status(400).json({
      message: "Invalid owner id.",
      success: false,
    });
  }

  try {
    const instrument = await Instrument.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      lab: String(lab).trim(),
      owner,
      requiresApproval: Boolean(requiresApproval),
    });

    const instrumentData = instrument.toObject();
    delete instrumentData.__v;

    return res.status(201).json({
      message: "Instrument created successfully.",
      instrument: instrumentData,
      success: true,
    });
  } catch (error) {
    console.error("Create instrument error:", error);
    return res.status(500).json({
      message: "Server error while creating instrument.",
      success: false,
    });
  }
};

/**
 * Lists instruments.
 *
 * @param {Object} req.body
 * @param {number} [req.body.page]
 * @param {number} [req.body.pageSize]
 * @param {string} [req.body.search]
 * @returns {Promise<import("express").Response>} { success: boolean, instruments: Array, pagination: { page: number, pageSize: number, total: number, totalPages: number } }
 */
const listInstruments = async (req, res) => {
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
      filter.$or = [{ name: re }, { lab: re }, { description: re }];
    }

    const total = await Instrument.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    const instruments = await Instrument.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * pageSize)
      .limit(pageSize)
      .populate("owner", "email role")
      .select("-__v");

    return res.json({
      instruments,
      pagination: { page: safePage, pageSize, total, totalPages },
      success: true,
    });
  } catch (error) {
    console.error("List instruments error:", error);
    return res.status(500).json({
      message: "Server error while listing instruments.",
      success: false,
    });
  }
};

/**
 * Updates an instrument by id.
 *
 * @param {Object} req.body
 * @param {string} req.body.id
 * @param {string} [req.body.name]
 * @param {string} [req.body.description]
 * @param {string} [req.body.lab]
 * @param {string} [req.body.owner]
 * @param {boolean} [req.body.requiresApproval]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, instrument: Object }
 */
const updateInstrument = async (req, res) => {
  const id = req.body?.id;
  const { name, description, lab, owner, requiresApproval } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid instrument id.", success: false });
  }

  if (owner && !isValidObjectId(owner)) {
    return res.status(400).json({ message: "Invalid owner id.", success: false });
  }

  const update = {};
  if (name !== undefined) update.name = String(name).trim();
  if (description !== undefined) update.description = String(description).trim();
  if (lab !== undefined) update.lab = String(lab).trim();
  if (owner !== undefined) update.owner = owner;
  if (requiresApproval !== undefined) update.requiresApproval = Boolean(requiresApproval);

  try {
    const existing = await Instrument.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: "Instrument not found.", success: false });
    }

    if ("requiresApproval" in update && update.requiresApproval === false && existing.requiresApproval === true) {
      const pendingBookings = await Booking.findOne({
        instrument: id,
        status: BOOKING_STATUS.PENDING,
      }).lean();

      if (pendingBookings) {
        return res.status(400).json({
          message: "Cannot disable approval requirement: There are pending bookings that must be resolved first.",
          success: false,
        });
      }
    }

    if ("name" in update) existing.name = update.name;
    if ("description" in update) existing.description = update.description;
    if ("lab" in update) existing.lab = update.lab;
    if ("owner" in update) existing.owner = update.owner;
    if ("requiresApproval" in update) existing.requiresApproval = update.requiresApproval;

    await existing.save();
    await existing.populate("owner", "email role");

    const existingData = existing.toObject();
    delete existingData.__v;

    return res.json({
      message: "Instrument updated successfully.",
      instrument: existingData,
      success: true,
    });
  } catch (error) {
    console.error("Update instrument error:", error);
    return res.status(500).json({
      message: "Server error while updating instrument.",
      success: false,
    });
  }
};

/**
 * Deletes an instrument by id.
 *
 * @param {Object} req.body
 * @param {string} req.body.id
 * @returns {Promise<import("express").Response>} { success: boolean, message: string }
 */
const deleteInstrument = async (req, res) => {
  const id = req.body?.id;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid instrument id.", success: false });
  }

  try {
    // Validates that the instrument is not currently in use before deletion.
    // Checks for any pending approval requests or active/future bookings.
    const activeBooking = await Booking.findOne({
      instrument: id,
      $or: [
        { status: BOOKING_STATUS.PENDING },
        { status: BOOKING_STATUS.APPROVED, endTime: { $gt: new Date() } },
      ],
    }).lean();

    if (activeBooking) {
      const reason = activeBooking.status === BOOKING_STATUS.PENDING
        ? "There are pending approval requests for this instrument."
        : "This instrument is currently booked or has future reservations.";

      return res.status(400).json({
        message: `Cannot delete: ${reason}`,
        success: false,
      });
    }

    const instrument = await Instrument.findByIdAndDelete(id);

    if (!instrument) {
      return res
        .status(404)
        .json({ message: "Instrument not found.", success: false });
    }

    return res.json({ message: "Instrument deleted successfully.", success: true });
  } catch (error) {
    console.error("Delete instrument error:", error);
    return res.status(500).json({
      message: "Server error while deleting instrument.",
      success: false,
    });
  }
};

module.exports = {
  createInstrument,
  listInstruments,
  updateInstrument,
  deleteInstrument,
};
