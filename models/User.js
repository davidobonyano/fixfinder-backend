const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    passwordUpdatedAt: {
      type: Date,
      default: null
    },
    role: {
      type: String,
      enum: ["customer", "professional", "admin"],
      default: "customer",
    },
    avatarUrl: {
      type: String,
    },
    profilePicture: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      address: { type: String, trim: true },
      lastUpdated: { type: Date }
    },
    emailVerification: {
      isVerified: { type: Boolean, default: false },
      token: { type: String },
      tokenExpires: { type: Date },
      verifiedAt: { type: Date }
    },
    phoneVerification: {
      isVerified: { type: Boolean, default: false },
      otp: { type: String },
      otpExpires: { type: Date },
      verifiedAt: { type: Date },
      attempts: { type: Number, default: 0 },
      lastAttempt: { type: Date }
    },
    presence: {
      isOnline: { type: Boolean, default: false },
      lastSeen: { type: Date },
    },
    verification: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },
      selfieUrl: { type: String },
      selfieVideoUrl: { type: String },
      idPhotoUrl: { type: String },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      // auto-eval metrics (client-provided + server heuristics)
      selfieScore: { type: Number },
      videoDurationMs: { type: Number },
      hasAudio: { type: Boolean },
      frameCount: { type: Number },
    },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ getters: true, virtuals: true });
  delete obj.password;
  return obj;
};

// Add 2D sphere index for location queries
userSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

module.exports = mongoose.model("User", userSchema);



