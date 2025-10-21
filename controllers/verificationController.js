const User = require("../models/User");
const { uploadBufferToCloudinary } = require("../utils");

exports.start = async (req, res, next) => {
  try {
    const prompts = ["blink", "turn_left", "turn_right", "say_1234"];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
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

exports.approve = async (req, res, next) => {
  try {
    const { id } = req.params; // user id
    const reviewerId = req.user.id;
    const user = await User.findByIdAndUpdate(
      id,
      { verification: { ...(user?.verification || {}), status: "approved", reviewedAt: new Date(), reviewerId }, isVerified: true },
      { new: true }
    );
    res.json(user?.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { id } = req.params; // user id
    const reviewerId = req.user.id;
    const user = await User.findByIdAndUpdate(
      id,
      { verification: { status: "rejected", reviewedAt: new Date(), reviewerId } },
      { new: true }
    );
    res.json(user?.toSafeJSON());
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
    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};




