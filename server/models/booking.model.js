const mongoose = require("mongoose");
const { Schema } = mongoose;

const { BOOKING_STATUS, RESOURCE_TYPES } = require("../utils/constants");

const bookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },

    resourceType: {
      type: String,
      required: true,
      enum: Object.values(RESOURCE_TYPES),
    },

    instrument: { type: Schema.Types.ObjectId, ref: "Instrument", default: null },
    material: { type: Schema.Types.ObjectId, ref: "Material", default: null },

    // Instrument fields
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },

    // Material fields
    quantity: { type: Number, default: null, min: 0 },

    // Status flow
    status: { type: String, enum: Object.values(BOOKING_STATUS), default: BOOKING_STATUS.PENDING },

    // Extension support
    parentBooking: { type: Schema.Types.ObjectId, ref: "Booking", default: null },
    isExtension: { type: Boolean, default: false },

    // Approval tracking
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rejectionReason: { type: String, default: "" },
    purpose: { type: String, default: "" },
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);
module.exports = Booking;

