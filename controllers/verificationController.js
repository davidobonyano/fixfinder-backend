const User = require("../models/User");
const Professional = require("../models/Professional");
const { uploadBufferToCloudinary } = require("../utils");

const FACE_PROMPTS = ["blink", "turn_left", "turn_right", "say_1234", "smile", "raise_eyebrows"];
const FACE_MODEL_VERSION = process.env.FACE_API_MODEL_VERSION || "face-api.js@1";
const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.55);

const sanitizeFaceVerification = (payload) => {
  if (!payload) return { status: "not_started" };
  const obj = payload.toObject?.() || payload;
  if (obj?.descriptor) {
    delete obj.descriptor;
  }
  if (obj?.referenceDescriptor) {
    delete obj.referenceDescriptor;
  }
  return obj;
};

const parseDescriptorPayload = (payload, fieldName = "descriptor") => {
  if (payload === undefined || payload === null) {
    throw new Error(`${fieldName} payload is required`);
  }
  let descriptor = payload;
  if (!Array.isArray(descriptor)) {
    try {
      descriptor = JSON.parse(descriptor);
    } catch (err) {
      throw new Error(`Invalid ${fieldName} payload`);
    }
  }
  if (!Array.isArray(descriptor) || descriptor.length === 0) {
    throw new Error(`${fieldName} must be a non-empty numeric array`);
  }
  const normalized = descriptor.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${fieldName} must contain numeric values`);
    }
    return parsed;
  });
  return normalized;
};

const euclideanDistance = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error("Descriptor vectors must be the same length");
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

const syncProfessionalVerification = async (userId, isVerified) => {
  if (!userId) return;
  try {
    const result = await Professional.updateMany(
      { user: userId },
      { isVerified: Boolean(isVerified) }
    );
    const matched =
      typeof result?.matchedCount === "number"
        ? result.matchedCount
        : result?.n;
    if (!matched) {
      console.warn(`⚠️ syncProfessionalVerification: No professional profile found for user ${userId}`);
    }
  } catch (err) {
    console.error(`❌ Failed to sync professional verification for user ${userId}:`, err.message);
  }
};

exports.start = async (req, res, next) => {
  try {
    const prompt = FACE_PROMPTS[Math.floor(Math.random() * FACE_PROMPTS.length)];
    res.json({ prompt });
  } catch (err) {
    next(err);
  }
};

exports.upload = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const files = Array.isArray(req.files) ? req.files : [];
    const findByField = (name) => files.find((f) => f.fieldname === name);

    const updates = { verification: { ...(user.verification?.toObject?.() || user.verification || {}) } };

    const selfie = findByField("selfiePhoto");
    if (selfie) {
      const r = await uploadBufferToCloudinary(selfie.buffer, { folder: `fixfinder/verification/${user._id}`, resource_type: "image" });
      updates.verification.selfieUrl = r.secure_url;
    }
    const idPhoto = findByField("idPhoto");
    if (idPhoto) {
      const r = await uploadBufferToCloudinary(idPhoto.buffer, { folder: `fixfinder/verification/${user._id}`, resource_type: "image" });
      updates.verification.idPhotoUrl = r.secure_url;
    }
    const selfieVideo = findByField("selfieVideo");
    if (selfieVideo) {
      const r = await uploadBufferToCloudinary(selfieVideo.buffer, { folder: `fixfinder/verification/${user._id}`, resource_type: "video" });
      updates.verification.selfieVideoUrl = r.secure_url;
    }

    updates.verification.status = "pending";
    updates.verification.submittedAt = new Date();
    user.set(updates);
    const saved = await user.save();
    res.json(saved.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

exports.status = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user?.verification || { status: "none" });
  } catch (err) {
    next(err);
  }
};

exports.setReferenceFace = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "professional") {
      return res.status(403).json({ message: "Face verification is limited to professional accounts" });
    }

    const { imageUrl, descriptor: descriptorPayload } = req.body || {};
    if (!imageUrl) {
      return res.status(400).json({ message: "imageUrl is required" });
    }

    let descriptor;
    try {
      descriptor = parseDescriptorPayload(descriptorPayload, "descriptor");
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const professional = await Professional.findOne({ user: user._id }).select("photos photosMeta");

    const allowedSources = [];
    if (user.profilePicture) {
      allowedSources.push({
        sourceType: "profile_picture",
        url: user.profilePicture,
        assetId: "profile-picture",
        label: "Profile picture",
      });
    }
    const photos = professional?.photos || [];
    photos.forEach((url, index) => {
      if (!url) return;
      const meta = professional?.photosMeta?.[index];
      allowedSources.push({
        sourceType: "portfolio",
        url,
        assetId: meta?.publicId || `portfolio-${index}`,
        label: meta?.label || meta?.name || `Portfolio photo ${index + 1}`,
      });
    });

    const matchedSource = allowedSources.find((source) => source.url === imageUrl);
    if (!matchedSource) {
      return res.status(400).json({
        message: "Reference must be one of your profile or portfolio images",
      });
    }

    const currentFace = user.faceVerification?.toObject?.() || user.faceVerification || {};
    user.faceVerification = {
      ...currentFace,
      referenceImageUrl: matchedSource.url,
      referenceDescriptor: descriptor,
      referenceSource: {
        sourceType: matchedSource.sourceType,
        assetId: matchedSource.assetId,
        label: matchedSource.label,
      },
      referenceSetAt: new Date(),
      failedAttempts: 0,
      status: currentFace.status === "verified" ? "verified" : "reference_set",
    };

    await user.save();
    const safeUser = user.toSafeJSON();
    res.json({
      success: true,
      message: "Reference photo saved",
      faceVerification: sanitizeFaceVerification(user.faceVerification),
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const { id } = req.params; // user id
    const reviewerId = req.user.id;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verificationPayload = user.verification?.toObject?.() || user.verification || {};
    user.verification = {
      ...verificationPayload,
      status: "approved",
      reviewedAt: new Date(),
      reviewerId,
    };
    user.isVerified = true;

    await user.save();
    await syncProfessionalVerification(user._id, true);

    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { id } = req.params; // user id
    const reviewerId = req.user.id;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verificationPayload = user.verification?.toObject?.() || user.verification || {};
    user.verification = {
      ...verificationPayload,
      status: "rejected",
      reviewedAt: new Date(),
      reviewerId,
    };
    user.isVerified = false;

    await user.save();
    await syncProfessionalVerification(user._id, false);

    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

exports.autoEvaluate = async (req, res, next) => {
  try {
    const { selfieScore, videoDurationMs, hasAudio, frameCount } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const score = Number(selfieScore || 0);
    const duration = Number(videoDurationMs || 0);
    const frames = Number(frameCount || 0);
    const audio = Boolean(hasAudio);

    const durationOk = duration >= 3000 && duration <= 8000;
    const framesOk = frames >= 10; // simple heuristic
    const scoreOk = score >= 0.65; // threshold tweakable
    const audioOk = audio; // require audio present

    user.verification = {
      ...(user.verification || {}),
      selfieScore: score,
      videoDurationMs: duration,
      hasAudio: audio,
      frameCount: frames,
    };

    if (durationOk && framesOk && scoreOk && audioOk) {
      user.verification.status = "approved";
      user.isVerified = true;
    } else {
      user.verification.status = "pending";
    }

    await user.save();
    if (user.isVerified) {
      await syncProfessionalVerification(user._id, true);
    }
    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

exports.faceStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      faceVerification: sanitizeFaceVerification(user.faceVerification),
      emailVerification: user.emailVerification || { isVerified: false },
      isVerified: Boolean(user.isVerified),
    });
  } catch (err) {
    next(err);
  }
};

exports.startFace = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "professional") return res.status(403).json({ message: "Face verification is limited to professional accounts" });

    if (user.faceVerification?.status === "verified") {
      return res.json({
        faceVerification: sanitizeFaceVerification(user.faceVerification),
        prompt: null,
        modelVersion: user.faceVerification?.modelVersion || FACE_MODEL_VERSION,
        alreadyVerified: true,
      });
    }

    const prompt = FACE_PROMPTS[Math.floor(Math.random() * FACE_PROMPTS.length)];
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const currentFace = user.faceVerification?.toObject?.() || user.faceVerification || {};

    user.faceVerification = {
      ...currentFace,
      status: "in_progress",
      prompt,
      promptExpiresAt: expiresAt,
      attempts: (currentFace?.attempts || 0) + 1,
      updatedAt: new Date(),
      modelVersion: FACE_MODEL_VERSION,
    };

    await user.save();
    res.json({
      prompt,
      expiresAt,
      modelVersion: FACE_MODEL_VERSION,
      faceVerification: sanitizeFaceVerification(user.faceVerification),
    });
  } catch (err) {
    next(err);
  }
};

exports.captureFace = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "professional") return res.status(403).json({ message: "Face verification is limited to professional accounts" });

    let descriptor;
    try {
      descriptor = parseDescriptorPayload(req.body.faceDescriptor, "faceDescriptor");
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const referenceDescriptor = user.faceVerification?.referenceDescriptor;
    if (!Array.isArray(referenceDescriptor) || referenceDescriptor.length === 0) {
      return res.status(400).json({
        message: "Select one of your profile or portfolio photos as the reference before running a live check.",
      });
    }

    let matchDistance;
    try {
      matchDistance = euclideanDistance(referenceDescriptor, descriptor);
    } catch (distanceError) {
      console.error("Face descriptor distance error:", distanceError);
      return res.status(400).json({
        message: "Unable to compare captured face to the saved reference. Please reset your reference photo and try again.",
      });
    }

    if (!Number.isFinite(matchDistance)) {
      return res.status(400).json({ message: "Invalid face descriptor distance calculated." });
    }

    if (matchDistance > FACE_MATCH_THRESHOLD) {
      const currentFace = user.faceVerification?.toObject?.() || user.faceVerification || {};
      user.faceVerification = {
        ...currentFace,
        status: "failed",
        lastDistance: matchDistance,
        failedAttempts: (currentFace.failedAttempts || 0) + 1,
        updatedAt: new Date(),
      };
      await user.save();
      return res.status(422).json({
        success: false,
        message: "Face does not match your selected reference photo. Please try again.",
        distance: matchDistance,
        threshold: FACE_MATCH_THRESHOLD,
      });
    }

    let referenceImageUrl = user.faceVerification?.referenceImageUrl;
    if (req.file) {
      const uploadResult = await uploadBufferToCloudinary(req.file.buffer, {
        folder: `fixfinder/verification/${user._id}`,
        resource_type: "image",
        public_id: `face-${Date.now()}`,
        overwrite: true,
      });
      referenceImageUrl = uploadResult.secure_url;
    }

    const detectionScore = req.body.detectionScore ? Number(req.body.detectionScore) : undefined;
    const modelVersion = req.body.modelVersion || FACE_MODEL_VERSION;

    const currentFace = user.faceVerification?.toObject?.() || user.faceVerification || {};
    user.faceVerification = {
      ...currentFace,
      status: "verified",
      descriptor,
      referenceImageUrl,
      lastScore: detectionScore,
      lastDistance: matchDistance,
      failedAttempts: 0,
      modelVersion,
      prompt: null,
      promptExpiresAt: null,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    };
    user.isVerified = true;

    await user.save();
    await syncProfessionalVerification(user._id, true);
    const safeUser = user.toSafeJSON();
    res.json({
      message: "Face verification complete",
      faceVerification: safeUser.faceVerification,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.resetFaceVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "professional") {
      return res.status(403).json({ message: "Face verification is limited to professional accounts" });
    }

    // Reset face verification to initial state
    user.faceVerification = {
      status: "not_started",
      descriptor: undefined,
      referenceImageUrl: undefined,
      referenceDescriptor: undefined,
      referenceSource: undefined,
      referenceSetAt: undefined,
      prompt: undefined,
      promptExpiresAt: undefined,
      attempts: 0,
      lastScore: undefined,
      lastDistance: undefined,
      failedAttempts: 0,
      modelVersion: undefined,
      verifiedAt: undefined,
      updatedAt: new Date(),
    };

    // Reset isVerified if it was only set by face verification
    // Keep it true if email is verified
    if (!user.emailVerification?.isVerified) {
      user.isVerified = false;
      await syncProfessionalVerification(user._id, false);
    }

    await user.save();
    const safeUser = user.toSafeJSON();
    res.json({
      success: true,
      message: "Face verification reset successfully. You can now set a new reference photo and verify again.",
      faceVerification: safeUser.faceVerification,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};




