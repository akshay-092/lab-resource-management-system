const express = require("express");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireAdmin, requireUser } = require("../middlewares/role.middleware");
const {
  approveBooking,
  cancelBooking,
  createBooking,
  extendBooking,
  listBookings,
  listPendingBookings,
  rejectBooking,
  getResourceHistory,
} = require("../controllers/booking.controllers");

const router = express.Router();

router.use(requireAuth);

/* User APIs */

// POST /api/bookings/create
router.post("/create", requireUser, createBooking);
// POST /api/bookings/list
router.post("/list", listBookings);
// POST /api/bookings/cancel
router.post("/cancel", requireUser, cancelBooking);
// POST /api/bookings/extend
router.post("/extend", requireUser, extendBooking);
// POST /api/bookings/resource-history
router.post("/resource-history", getResourceHistory);

/* Admin approval APIs */

// POST /api/bookings/pending
router.post("/pending", requireAdmin, listPendingBookings);
// POST /api/bookings/approve
router.post("/approve", requireAdmin, approveBooking);
// POST /api/bookings/reject
router.post("/reject", requireAdmin, rejectBooking);

module.exports = router;

