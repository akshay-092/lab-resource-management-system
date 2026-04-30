const Booking = require("../models/booking.model");
const Instrument = require("../models/instrument.model");
const Material = require("../models/material.model");
const { isValidObjectId, toNumber, escapeRegex, parseDate, minutesBetween } = require("../utils/common");
const { MIN_INSTRUMENT_DURATION_MINUTES, RESOURCE_TYPES, BOOKING_STATUS, USER_ROLES } = require("../utils/constants");

/**
 * Bubbles up state changes (quantity or endTime) from an extension to all its ancestors.
 * This ensures the absolute Root Parent always reflects the current total state.
 *
 * @param {string} parentId The immediate parent ID
 * @param {Object} update { type: 'INSTRUMENT'|'MATERIAL', value: Date|Number }
 */
async function bubbleUpState(parentId, update) {
  if (!parentId) return;

  const parent = await Booking.findById(parentId);
  if (!parent) return;

  if (update.type === RESOURCE_TYPES.INSTRUMENT) {
    if (!parent.endTime || update.value > parent.endTime) {
      parent.endTime = update.value;
    }
  } else if (update.type === RESOURCE_TYPES.MATERIAL) {
    parent.quantity = (parent.quantity || 0) + update.value;
  }

  await parent.save();

  // Recursive call to update the next level up
  if (parent.isExtension && parent.parentBooking) {
    await bubbleUpState(parent.parentBooking, update);
  }
}

/**
 * Bubbles up a "reversion" (subtraction) from an extension to all its ancestors.
 *
 * @param {string} parentId The immediate parent ID
 * @param {Object} update { type: 'INSTRUMENT'|'MATERIAL', value: Number|Date, revertTo: Date }
 */
async function bubbleUpRevert(parentId, update) {
  if (!parentId) return;

  const parent = await Booking.findById(parentId);
  if (!parent) return;

  if (update.type === RESOURCE_TYPES.INSTRUMENT) {
    // If the parent's endTime matches the extension's endTime, revert it.
    if (
      parent.endTime &&
      update.value &&
      parent.endTime.getTime() === update.value.getTime()
    ) {
      parent.endTime = update.revertTo;
    }
  } else if (update.type === RESOURCE_TYPES.MATERIAL) {
    parent.quantity = Math.max(0, (parent.quantity || 0) - update.value);
  }

  await parent.save();

  if (parent.isExtension && parent.parentBooking) {
    await bubbleUpRevert(parent.parentBooking, update);
  }
}

/**
 * Recursively cancels all descendant extensions of a booking.
 *
 * @param {string} parentId
 * @param {Object} [materialDoc] Optional Material doc to restore stock for pending extensions.
 */
async function recursiveCancel(parentId, materialDoc = null) {
  const children = await Booking.find({
    parentBooking: parentId,
    status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] },
  });

  for (const child of children) {
    if (child.status === BOOKING_STATUS.PENDING) {
      // PENDING extensions have their own reserved stock. We must restore it.
      if (child.resourceType === RESOURCE_TYPES.MATERIAL && materialDoc) {
        materialDoc.reservedQuantity -= child.quantity || 0;
        materialDoc.availableQuantity += child.quantity || 0;
      }
    }

    // NOTE: We DO NOT restore stock for APPROVED children here, because their stock
    // was merged into the parent's total and is already handled by the top-level cancelBooking.
    // NOTE: We DO NOT bubble up revert here, because the parent is already being handled.

    child.status = BOOKING_STATUS.CANCELLED;
    await child.save();

    // Recurse into grandchildren
    await recursiveCancel(child._id, materialDoc);
  }
}

async function hasInstrumentConflict({ instrumentId, startTime, endTime, excludeBookingId }) {
  // Looks for any existing booking for the same instrument that overlaps with the requested time.
  // Overlap occurs if (ExistingStart < RequestedEnd) AND (ExistingEnd > RequestedStart).
  const query = {
    instrument: instrumentId,
    status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const existing = await Booking.findOne(query).lean();
  return Boolean(existing);
}

/**
 * Validates the consistency of material stock levels.
 * @param {Object} material Mongoose Material document.
 * @returns {boolean} Returns true if the stock levels are consistent, false otherwise.
 */
function ensureMaterialConsistency(material) {
  if (
    material.availableQuantity < 0 ||
    material.reservedQuantity < 0 ||
    material.totalQuantity < 0
  ) {
    return false;
  }

  if (material.availableQuantity + material.reservedQuantity > material.totalQuantity) {
    return false;
  }

  return true;
}

/**
 * Creates a booking for an instrument or material.
 *
 * Instrument booking:
 * - requires: instrumentId, startTime, endTime
 *
 * Material booking:
 * - requires: materialId, quantity
 *
 * @param {Object} req.body
 * @param {string} req.body.resourceType - "INSTRUMENT" or "MATERIAL"
 * @param {string} [req.body.instrumentId]
 * @param {string} [req.body.materialId]
 * @param {string} [req.body.startTime]
 * @param {string} [req.body.endTime]
 * @param {number} [req.body.quantity]
 * @param {string} [req.body.purpose]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, booking: Object }
 */
const createBooking = async (req, res) => {
  const { resourceType, instrumentId, materialId, startTime, endTime, quantity, purpose } =
    req.body;

  if (!resourceType || ![RESOURCE_TYPES.INSTRUMENT, RESOURCE_TYPES.MATERIAL].includes(resourceType)) {
    return res.status(400).json({
      message: `resourceType must be "${RESOURCE_TYPES.INSTRUMENT}" or "${RESOURCE_TYPES.MATERIAL}".`,
      success: false,
    });
  }

  try {
    if (resourceType === RESOURCE_TYPES.INSTRUMENT) {
      if (!instrumentId || !isValidObjectId(instrumentId)) {
        return res
          .status(400)
          .json({ message: "Valid instrumentId is required.", success: false });
      }

      const start = parseDate(startTime);
      const end = parseDate(endTime);
      if (!start || !end) {
        return res.status(400).json({
          message: "startTime and endTime are required and must be valid dates.",
          success: false,
        });
      }

      if (start >= end) {
        return res.status(400).json({
          message: "End time must be after start time",
          success: false,
        });
      }

      const now = new Date();
      if (start <= now) {
        return res
          .status(400)
          .json({ message: "Cannot book in the past", success: false });
      }

      if (minutesBetween(start, end) < MIN_INSTRUMENT_DURATION_MINUTES) {
        return res.status(400).json({
          message: `Minimum duration is ${MIN_INSTRUMENT_DURATION_MINUTES} minutes.`,
          success: false,
        });
      }

      const instrument = await Instrument.findById(instrumentId);
      if (!instrument) {
        return res
          .status(404)
          .json({ message: "Resource not found", success: false });
      }

      const conflict = await hasInstrumentConflict({
        instrumentId,
        startTime: start,
        endTime: end,
      });
      if (conflict) {
        return res
          .status(409)
          .json({ message: "Time slot already booked", success: false });
      }

      const status = instrument.requiresApproval ? "PENDING" : "APPROVED";

      const booking = await Booking.create({
        user: req.user._id,
        resourceType: RESOURCE_TYPES.INSTRUMENT,
        instrument: instrumentId,
        startTime: start,
        endTime: end,
        status,
        purpose: String(purpose || "").trim(),
      });

      const bookingData = booking.toObject();
      delete bookingData.__v;

      return res.status(201).json({
        message: "Booking created successfully.",
        booking: bookingData,
        success: true,
      });
    }

    // MATERIAL
    if (!materialId || !isValidObjectId(materialId)) {
      return res
        .status(400)
        .json({ message: "Valid materialId is required.", success: false });
    }

    const qty = toNumber(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
        success: false,
      });
    }

    const material = await Material.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: "Resource not found", success: false });
    }

    if (qty > material.availableQuantity) {
      return res.status(400).json({
        message: `Insufficient stock. Requested: ${qty}${material.unit}, Available: ${material.availableQuantity}${material.unit}`,
        success: false,
      });
    }

    const status = material.requiresApproval ? BOOKING_STATUS.PENDING : BOOKING_STATUS.APPROVED;

    // Handles stock update based on resource approval setting.
    // - If approval required: moves quantity from 'available' to 'reserved' to lock it.
    // - If instant approval: decrements both 'available' and 'total' immediately.
    if (material.requiresApproval) {
      material.availableQuantity -= qty;
      material.reservedQuantity += qty;
    } else {
      material.availableQuantity -= qty;
      material.totalQuantity -= qty;
    }

    if (!ensureMaterialConsistency(material)) {
      return res.status(400).json({
        message: "Stock consistency validation failed.",
        success: false,
      });
    }

    await material.save();

    const booking = await Booking.create({
      user: req.user._id,
      resourceType: RESOURCE_TYPES.MATERIAL,
      material: materialId,
      quantity: qty,
      status,
      purpose: String(purpose || "").trim(),
    });

    const bookingData = booking.toObject();
    delete bookingData.__v;

    return res.status(201).json({
      message: "Booking created successfully.",
      booking: bookingData,
      success: true,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    return res
      .status(500)
      .json({ message: "Server error while creating booking.", success: false });
  }
};

/**
 * Lists bookings for the logged-in user (admins can pass `userId` to filter).
 *
 * @param {Object} req.body
 * @param {string} [req.body.userId]
 * @param {number} [req.body.page]
 * @param {number} [req.body.limit]
 * @param {string} [req.body.search]
 * @returns {Promise<import("express").Response>} { success: boolean, bookings: Array, totalCount: number, totalPages: number, page: number }
 */
const listBookings = async (req, res) => {
  const userId =
    req.user?.role === USER_ROLES.ADMIN && req.body?.userId && isValidObjectId(req.body.userId)
      ? req.body.userId
      : req.user._id;

  try {
    const page = Math.max(1, parseInt(req.body?.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.body?.limit) || 10));
    const skip = (page - 1) * limit;

    const search = req.body?.search || "";
    let filter = { user: userId };

    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      const [instrIds, matIds] = await Promise.all([
        Instrument.find({
          $or: [{ name: re }, { lab: re }, { description: re }],
        }).distinct("_id"),
        Material.find({
          $or: [{ name: re }, { description: re }],
        }).distinct("_id"),
      ]);
      filter.$or = [
        { instrument: { $in: instrIds } },
        { material: { $in: matIds } },
        { purpose: re },
        { status: re },
      ];
    }

    const [bookings, totalCount] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("instrument", "-__v")
        .populate("material", "-__v")
        .populate("approvedBy", "email role")
        .select("-__v"),
      Booking.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return res.json({ bookings, totalCount, totalPages, page, success: true });
  } catch (error) {
    console.error("List bookings error:", error);
    return res
      .status(500)
      .json({ message: "Server error while listing bookings.", success: false });
  }
};

/**
 * Cancels a booking.
 *
 * Rules:
 * - Only APPROVED can be cancelled
 * - Not allowed if already CANCELLED
 * - Instruments can be cancelled only before startTime
 * - Materials restore stock
 *
 * @param {Object} req.body
 * @param {string} req.body.bookingId
 * @returns {Promise<import("express").Response>} { success: boolean, message: string }
 */
const cancelBooking = async (req, res) => {
  const bookingId = req.body?.bookingId;

  if (!bookingId || !isValidObjectId(bookingId)) {
    return res
      .status(400)
      .json({ message: "Valid bookingId is required.", success: false });
  }

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found.", success: false });
    }

    const isOwner = String(booking.user) === String(req.user._id);
    if (!isOwner) {
      return res.status(403).json({
        message: "Only the booking owner can cancel this booking.",
        success: false,
      });
    }

    if (![BOOKING_STATUS.APPROVED, BOOKING_STATUS.PENDING].includes(booking.status)) {
      return res.status(400).json({
        message: "This action cannot be performed. Only pending or approved bookings can be cancelled.",
        success: false,
      });
    }

    if (booking.resourceType === "INSTRUMENT") {
      const now = new Date();
      if (booking.startTime && booking.startTime <= now) {
        return res.status(400).json({
          message: "Instrument booking can be cancelled only before start time.",
          success: false,
        });
      }
    }

    // Sync extension cancellation with ancestors (Proper ID Relation)
    if (booking.isExtension && booking.parentBooking && booking.status === BOOKING_STATUS.APPROVED) {
      await bubbleUpRevert(booking.parentBooking, {
        type: booking.resourceType,
        value: booking.resourceType === RESOURCE_TYPES.MATERIAL ? booking.quantity : booking.endTime,
        revertTo: booking.startTime,
      });
    }

    if (booking.resourceType === "MATERIAL" && booking.material) {
      const material = await Material.findById(booking.material);
      if (!material) {
        return res.status(404).json({ message: "Resource not found", success: false });
      }

      const qty = booking.quantity || 0;

      // Restore stock for the current booking being cancelled.
      if (booking.status === BOOKING_STATUS.PENDING) {
        material.reservedQuantity -= qty;
        material.availableQuantity += qty;
      } else {
        material.availableQuantity += qty;
        material.totalQuantity += qty;
      }

      // Cascade Cancellation:
      // 1. Recursively cancel all direct descendants (Proper ID relation)
      await recursiveCancel(booking._id, material);

      // 2. Find and cancel sequential siblings (other extensions of the same parent that come after this one)
      if (booking.isExtension && booking.parentBooking) {
        const siblingsQuery = {
          parentBooking: booking.parentBooking,
          _id: { $ne: booking._id },
          status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] },
        };

        if (booking.resourceType === "INSTRUMENT") {
          siblingsQuery.startTime = { $gte: booking.startTime };
        } else {
          siblingsQuery.createdAt = { $gt: booking.createdAt };
        }

        const subsequentSiblings = await Booking.find(siblingsQuery);
        for (const sibling of subsequentSiblings) {
          // Restore stock for material siblings
          if (sibling.resourceType === "MATERIAL") {
            if (sibling.status === BOOKING_STATUS.PENDING) {
              material.reservedQuantity -= sibling.quantity || 0;
              material.availableQuantity += sibling.quantity || 0;
            }
          }
          sibling.status = BOOKING_STATUS.CANCELLED;
          await sibling.save();
          // Recursively cancel the sibling's own children
          await recursiveCancel(sibling._id, material);
        }
      }

      if (!ensureMaterialConsistency(material)) {
        return res.status(400).json({
          message: "Stock consistency validation failed.",
          success: false,
        });
      }

      await material.save();
    }

    // Handle INSTRUMENT recursive/sequential cancellation
    if (booking.resourceType === "INSTRUMENT") {
      // 1. Recursive descendants
      await recursiveCancel(booking._id);

      // 2. Sequential siblings
      if (booking.isExtension && booking.parentBooking) {
        const subsequentSiblings = await Booking.find({
          parentBooking: booking.parentBooking,
          _id: { $ne: booking._id },
          startTime: { $gte: booking.startTime },
          status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] },
        });

        for (const sibling of subsequentSiblings) {
          sibling.status = BOOKING_STATUS.CANCELLED;
          await sibling.save();
          await recursiveCancel(sibling._id);
        }
      }
    }

    booking.status = BOOKING_STATUS.CANCELLED;
    await booking.save();

    return res.json({ message: "Booking cancelled successfully.", success: true });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res
      .status(500)
      .json({ message: "Server error while cancelling booking.", success: false });
  }
};

/**
 * Requests an extension:
 * - Instrument: provide bookingId + newEndTime
 * - Material: provide bookingId + extraQuantity
 *
 * Extension is created as a new booking with `parentBooking` and `isExtension=true`.
 * If the resource requires approval, extension status will be PENDING; otherwise APPROVED.
 *
 * @param {Object} req.body
 * @param {string} req.body.bookingId
 * @param {string} [req.body.newEndTime]
 * @param {number} [req.body.extraQuantity]
 * @returns {Promise<import("express").Response>} { success: boolean, message: string, booking: Object }
 */
const extendBooking = async (req, res) => {
  const bookingId = req.body?.bookingId;

  if (!bookingId || !isValidObjectId(bookingId)) {
    return res
      .status(400)
      .json({ message: "Valid bookingId is required.", success: false });
  }

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found.", success: false });
    }

    const isOwner = String(booking.user) === String(req.user._id);
    if (!isOwner) {
      return res.status(403).json({
        message: "Only booking owner can extend.",
        success: false,
      });
    }

    if (booking.status !== BOOKING_STATUS.APPROVED) {
      return res.status(400).json({
        message: "This action cannot be performed. Only approved bookings can be extended.",
        success: false,
      });
    }

    // To ensure a proper linear chain (Proper ID Relation), we find the Root 
    // and then find the LATEST extension to use as the parent.
    let rootId = booking.isExtension ? booking.parentBooking : booking._id;
    // Walk up to absolute root just in case
    let root = await Booking.findById(rootId);
    while (root && root.isExtension && root.parentBooking) {
      root = await Booking.findById(root.parentBooking);
    }
    if (!root) {
      return res.status(404).json({ message: "Root booking not found.", success: false });
    }
    rootId = root._id;

    // Find the latest leaf in the chain
    let actualParent = root;
    const allExtensions = await Booking.find({ 
      parentBooking: { $exists: true }, 
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.APPROVED] }
    });
    
    // Helper to find the deepest child in this specific root's tree
    function findLatestChild(parentId) {
      const children = allExtensions.filter(e => String(e.parentBooking) === String(parentId));
      if (children.length === 0) return null;
      // Sort by end time or creation date
      children.sort((a, b) => (b.endTime || b.createdAt) - (a.endTime || a.createdAt));
      return children[0];
    }

    let current = root;
    while (true) {
      const next = findLatestChild(current._id);
      if (!next) break;
      current = next;
    }
    actualParent = current;

    if (booking.resourceType === "INSTRUMENT") {
      const newEnd = parseDate(req.body?.newEndTime);
      if (!newEnd) {
        return res.status(400).json({
          message: "newEndTime is required and must be a valid date.",
          success: false,
        });
      }

      // Important: Extension must start from the end of the LATEST extension
      if (!actualParent.endTime || newEnd <= actualParent.endTime) {
        return res.status(400).json({
          message: `New endTime must be after the current chain end time (${actualParent.endTime?.toLocaleString()}).`,
          success: false,
        });
      }

      const instrument = await Instrument.findById(booking.instrument);
      if (!instrument) {
        return res.status(404).json({ message: "Resource not found", success: false });
      }

      const extensionStart = actualParent.endTime;
      const extensionEnd = newEnd;

      const conflict = await hasInstrumentConflict({
        instrumentId: booking.instrument,
        startTime: extensionStart,
        endTime: extensionEnd,
        excludeBookingId: booking._id,
      });
      if (conflict) {
        return res.status(409).json({
          message: "Cannot extend due to another booking",
          success: false,
        });
      }

      const status = instrument.requiresApproval ? "PENDING" : "APPROVED";

      const extensionBooking = await Booking.create({
        user: booking.user,
        resourceType: "INSTRUMENT",
        instrument: booking.instrument,
        startTime: extensionStart,
        endTime: extensionEnd,
        status,
        parentBooking: actualParent._id, // Link to the LATEST leaf
        isExtension: true,
      });

      if (!instrument.requiresApproval) {
        await bubbleUpState(actualParent._id, {
          type: RESOURCE_TYPES.INSTRUMENT,
          value: extensionEnd,
        });
      }

      const extensionData = extensionBooking.toObject();
      delete extensionData.__v;

      return res.status(201).json({
        message: "Extension request created successfully.",
        booking: extensionData,
        success: true,
      });
    }

    // MATERIAL
    const extraQty = toNumber(req.body?.extraQuantity);
    if (Number.isNaN(extraQty) || extraQty <= 0) {
      return res.status(400).json({
        message: "extraQuantity must be greater than 0",
        success: false,
      });
    }

    const material = await Material.findById(booking.material);
    if (!material) {
      return res.status(404).json({ message: "Resource not found", success: false });
    }

    if (extraQty > material.availableQuantity) {
      return res.status(400).json({
        message: `Insufficient stock for extension. Requested: ${extraQty}${material.unit}, Available: ${material.availableQuantity}${material.unit}`,
        success: false,
      });
    }

    const status = material.requiresApproval ? BOOKING_STATUS.PENDING : BOOKING_STATUS.APPROVED;

    if (material.requiresApproval) {
      material.availableQuantity -= extraQty;
      material.reservedQuantity += extraQty;
    } else {
      material.availableQuantity -= extraQty;
      material.totalQuantity -= extraQty;
    }

    if (!ensureMaterialConsistency(material)) {
      return res.status(400).json({
        message: "Stock consistency validation failed.",
        success: false,
      });
    }

    await material.save();

    const extensionBooking = await Booking.create({
      user: booking.user,
      resourceType: "MATERIAL",
      material: booking.material,
      quantity: extraQty,
      status,
      parentBooking: actualParent._id, // Link to the LATEST leaf
      isExtension: true,
    });

    // If no approval needed, bubble up the quantity change to all ancestors.
    if (!material.requiresApproval) {
      await bubbleUpState(actualParent._id, {
        type: RESOURCE_TYPES.MATERIAL,
        value: extraQty,
      });
    }

    const extensionData = extensionBooking.toObject();
    delete extensionData.__v;

    return res.status(201).json({
      message: "Extension request created successfully.",
      booking: extensionData,
      success: true,
    });
  } catch (error) {
    console.error("Extend booking error:", error);
    return res
      .status(500)
      .json({ message: "Server error while extending booking.", success: false });
  }
};

/**
 * Lists pending bookings for admin approvals.
 *
 * @param {Object} req.body
 * @param {number} [req.body.page]
 * @param {number} [req.body.limit]
 * @param {string} [req.body.search]
 * @returns {Promise<import("express").Response>} { success: boolean, bookings: Array, totalCount: number, totalPages: number, page: number }
 */
const listPendingBookings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.body?.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.body?.limit) || 10));
    const skip = (page - 1) * limit;

    const search = req.body?.search || "";
    let filter = { status: BOOKING_STATUS.PENDING };

    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      const [instrIds, matIds] = await Promise.all([
        Instrument.find({
          $or: [{ name: re }, { lab: re }, { description: re }],
        }).distinct("_id"),
        Material.find({
          $or: [{ name: re }, { description: re }],
        }).distinct("_id"),
      ]);
      filter.$or = [
        { instrument: { $in: instrIds } },
        { material: { $in: matIds } },
        { purpose: re },
        { status: re },
      ];
    }

    const [bookings, totalCount] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "email role")
        .populate("instrument", "-__v")
        .populate("material", "-__v")
        .select("-__v"),
      Booking.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return res.json({ bookings, totalCount, totalPages, page, success: true });
  } catch (error) {
    console.error("List pending bookings error:", error);
    return res.status(500).json({
      message: "Server error while listing pending bookings.",
      success: false,
    });
  }
};

/**
 * Admin approves a pending booking.
 *
 * @param {Object} req.body
 * @param {string} req.body.bookingId
 * @returns {Promise<import("express").Response>} { success: boolean, message: string }
 */
const approveBooking = async (req, res) => {
  const bookingId = req.body?.bookingId;

  if (!bookingId || !isValidObjectId(bookingId)) {
    return res
      .status(400)
      .json({ message: "Valid bookingId is required.", success: false });
  }

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found.", success: false });
    }

    if (booking.status !== "PENDING") {
      return res.status(400).json({
        message: "Only PENDING bookings can be approved.",
        success: false,
      });
    }

    if (booking.resourceType === "INSTRUMENT") {
      const conflict = await hasInstrumentConflict({
        instrumentId: booking.instrument,
        startTime: booking.startTime,
        endTime: booking.endTime,
        excludeBookingId: booking._id,
      });
      if (conflict) {
        return res.status(409).json({
          message: "Time slot already booked",
          success: false,
        });
      }
    }

    if (booking.resourceType === "MATERIAL") {
      const material = await Material.findById(booking.material);
      if (!material) {
        return res
          .status(404)
          .json({ message: "Resource not found", success: false });
      }

      const qty = booking.quantity || 0;
      if (material.reservedQuantity < qty) {
        return res.status(409).json({
          message: "Insufficient stock",
          success: false,
        });
      }

      material.reservedQuantity -= qty;
      material.totalQuantity -= qty;

      if (!ensureMaterialConsistency(material)) {
        return res.status(400).json({
          message: "Stock consistency validation failed.",
          success: false,
        });
      }
      await material.save();
    }

    booking.status = BOOKING_STATUS.APPROVED;
    booking.approvedBy = req.user._id;
    booking.rejectionReason = "";
    await booking.save();

    // If this booking is an extension, bubble up the change to all ancestors.
    if (booking.isExtension && booking.parentBooking) {
      await bubbleUpState(booking.parentBooking, {
        type: booking.resourceType,
        value: booking.resourceType === RESOURCE_TYPES.MATERIAL ? booking.quantity : booking.endTime,
      });
    }

    return res.json({ message: "Booking approved.", success: true });
  } catch (error) {
    console.error("Approve booking error:", error);
    return res
      .status(500)
      .json({ message: "Server error while approving booking.", success: false });
  }
};

/**
 * Admin rejects a pending booking.
 *
 * @param {Object} req.body
 * @param {string} req.body.bookingId
 * @param {string} req.body.rejectionReason
 * @returns {Promise<import("express").Response>} { success: boolean, message: string }
 */
const rejectBooking = async (req, res) => {
  const bookingId = req.body?.bookingId;
  const rejectionReason = req.body?.rejectionReason;

  if (!bookingId || !isValidObjectId(bookingId)) {
    return res
      .status(400)
      .json({ message: "Valid bookingId is required.", success: false });
  }

  if (!rejectionReason || !String(rejectionReason).trim()) {
    return res.status(400).json({
      message: "rejectionReason is required.",
      success: false,
    });
  }

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found.", success: false });
    }

    if (booking.status !== "PENDING") {
      return res.status(400).json({
        message: "Only PENDING bookings can be rejected.",
        success: false,
      });
    }

    if (booking.resourceType === "MATERIAL") {
      const material = await Material.findById(booking.material);
      if (!material) {
        return res
          .status(404)
          .json({ message: "Resource not found", success: false });
      }

      const qty = booking.quantity || 0;
      material.reservedQuantity -= qty;
      material.availableQuantity += qty;

      if (!ensureMaterialConsistency(material)) {
        return res.status(400).json({
          message: "Stock consistency validation failed.",
          success: false,
        });
      }
      await material.save();
    }

    booking.status = BOOKING_STATUS.REJECTED;
    booking.approvedBy = req.user._id;
    booking.rejectionReason = String(rejectionReason).trim();
    await booking.save();

    return res.json({ message: "Booking rejected.", success: true });
  } catch (error) {
    console.error("Reject booking error:", error);
    return res
      .status(500)
      .json({ message: "Server error while rejecting booking.", success: false });
  }
};

/**
 * Lists history for a specific resource (instrument/material).
 * 
 * @param {Object} req.body
 * @param {string} req.body.resourceId
 * @param {string} req.body.resourceType
 * @returns {Promise<import("express").Response>} { success: boolean, bookings: Array, totalCount: number, totalPages: number, page: number }
 */
const getResourceHistory = async (req, res) => {
  const { resourceId, resourceType } = req.body;

  if (!resourceId || !isValidObjectId(resourceId)) {
    return res.status(400).json({ message: "Valid resourceId is required.", success: false });
  }

  try {
    const page = Math.max(1, parseInt(req.body?.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.body?.limit) || 10));
    const skip = (page - 1) * limit;

    const query = resourceType === "INSTRUMENT"
      ? { instrument: resourceId }
      : { material: resourceId };

    const [bookings, totalCount] = await Promise.all([
      Booking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "email name role"),
      Booking.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return res.json({ bookings, totalCount, totalPages, page, success: true });
  } catch (error) {
    console.error("Resource history error:", error);
    return res.status(500).json({ message: "Server error while fetching resource history.", success: false });
  }
};

module.exports = {
  createBooking,
  listBookings,
  cancelBooking,
  extendBooking,
  listPendingBookings,
  approveBooking,
  rejectBooking,
  getResourceHistory,
};

