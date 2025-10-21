const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional", required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    date: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 15 },
    endAt: { type: Date, required: true },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled"],
      default: "pending",
    },
    notes: { type: String },
    address: { type: String },
    city: { type: String },
  },
  { timestamps: true }
);

// Index to speed up overlap queries
bookingSchema.index({ professional: 1, date: 1, endAt: 1 });

module.exports = mongoose.model("Booking", bookingSchema);


