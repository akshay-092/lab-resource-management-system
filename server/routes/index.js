const express = require("express");

const userRoutes = require("./user.routes");
const instrumentRoutes = require("./instrument.routes");
const materialRoutes = require("./material.routes");
const bookingRoutes = require("./booking.routes");

const router = express.Router();

router.use("/auth", userRoutes);
router.use("/instruments", instrumentRoutes);
router.use("/materials", materialRoutes);
router.use("/bookings", bookingRoutes);

module.exports = router;
