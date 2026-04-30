const mongoose = require("mongoose");
const { Schema } = mongoose;

const instrumentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    lab: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requiresApproval: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Instrument = mongoose.model("Instrument", instrumentSchema);
module.exports = Instrument;

