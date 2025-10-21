const mongoose = require("mongoose");

const professionalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    bio: { type: String, trim: true },
    yearsOfExperience: { type: Number, default: 0 },
    pricePerHour: { type: Number, default: 0 },
    languages: [{ type: String }],
    certifications: [{ type: String }],
    photos: [{ type: String }],
    videos: [{ type: String }],
    // store Cloudinary metadata for safer deletes (non-breaking: optional)
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
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    // Paystack subaccount code for revenue split (e.g., ACCT_xxxxx)
    paystackSubaccount: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Professional", professionalSchema);

