const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    professional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
    photos: [{ type: String }],
    videos: [{ type: String }],
    photosMeta: [
      {
        url: { type: String },
        publicId: { type: String },
      },
    ],
    videosMeta: [
      {
        url: { type: String },
        publicId: { type: String },
      },
    ],
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);

