const mongoose = require("mongoose");
const { ALLOWED_UNITS } = require("../utils/constants");
const { Schema } = mongoose;

const materialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    unit: {
      type: String,
      enum: ALLOWED_UNITS,
      default: ALLOWED_UNITS[ALLOWED_UNITS.length - 1],
      required: true,
    },
    totalQuantity: { type: Number, required: true, min: 0 },
    availableQuantity: { type: Number, required: true, min: 0 },
    reservedQuantity: { type: Number, required: true, min: 0 },
    requiresApproval: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Material = mongoose.model("Material", materialSchema);
module.exports = Material;
