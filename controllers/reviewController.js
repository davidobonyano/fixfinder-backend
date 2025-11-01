const Review = require("../models/Review");
const Professional = require("../models/Professional");
const { uploadBufferToCloudinary } = require("../utils");

exports.createReview = async (req, res, next) => {
  try {
    const { professional, professionalId, rating, comment, jobId } = req.body;
    let proId = professional || professionalId;
    
    console.log('📝 Creating review - Request body:', { professional, professionalId, rating, comment, jobId });
    console.log('👤 User ID:', req.user?.id);
    
    // If proId looks like a user ID (not a professional ID), try to resolve it
    if (proId && !proId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('⚠️ proId might not be a valid ObjectId, attempting to resolve...');
    }
    
    // Try to resolve professional ID if what we got might be a user ID
    if (proId) {
      // Check if proId is actually a professional document
      const proDoc = await Professional.findById(proId);
      if (!proDoc) {
        // proId might be a user ID, try to find professional by user
        const proByUser = await Professional.findOne({ user: proId });
        if (proByUser) {
          console.log('✅ Resolved professional ID from user ID:', proByUser._id);
          proId = proByUser._id;
        }
      } else {
        console.log('✅ Using provided professional ID:', proId);
      }
    }
    
    if (!proId || !rating) {
      return res.status(400).json({ message: "professional and rating are required" });
    }
    
    console.log('💾 Creating review with professional ID:', proId, 'user ID:', req.user?.id);
    const review = await Review.create({ professional: proId, user: req.user?.id, rating, comment, jobId });
    console.log('✅ Review created:', review._id);

    // Update aggregates
    const stats = await Review.aggregate([
      { $match: { professional: review.professional } },
      { $group: { _id: "$professional", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    if (stats[0]) {
      await Professional.findByIdAndUpdate(review.professional, {
        ratingAvg: stats[0].avg,
        ratingCount: stats[0].count,
      });
    }

    res.status(201).json(review);
  } catch (err) {
    next(err);
  }
};

exports.getReviewsForProfessional = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reviews = await Review.find({ professional: id })
      .populate('user', 'name profilePicture avatarUrl')
      .populate('jobId', 'title')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { reviews } });
  } catch (err) {
    next(err);
  }
};

exports.uploadReviewMedia = async (req, res, next) => {
  try {
    const { id } = req.params; // review id
    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (String(review.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: "No files uploaded" });

    const imageFiles = files.filter((f) => (f.mimetype || "").startsWith("image/"));
    const videoFiles = files.filter((f) => (f.mimetype || "").startsWith("video/"));

    if (imageFiles.length) {
      const results = await Promise.all(
        imageFiles.map((f) => uploadBufferToCloudinary(f.buffer, { folder: "fixfinder/reviews", resource_type: "image" }))
      );
      const urls = results.map((r) => r.secure_url);
      const metas = results.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
      review.photos.push(...urls);
      review.photosMeta.push(...metas);
    }
    if (videoFiles.length) {
      const results = await Promise.all(
        videoFiles.map((f) => uploadBufferToCloudinary(f.buffer, { folder: "fixfinder/reviews", resource_type: "video" }))
      );
      const urls = results.map((r) => r.secure_url);
      const metas = results.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
      review.videos.push(...urls);
      review.videosMeta.push(...metas);
    }
    await review.save();
    res.json(review);
  } catch (err) {
    next(err);
  }
};

exports.deleteReviewMedia = async (req, res, next) => {
  try {
    const { id } = req.params; // review id
    const { publicId, type } = req.body;
    if (!publicId || !type) return res.status(400).json({ message: "publicId and type are required" });
    const review = await Review.findById(id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (String(review.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const metaField = type === "video" ? "videosMeta" : "photosMeta";
    const urlField = type === "video" ? "videos" : "photos";
    const meta = review[metaField] || [];
    const removed = meta.find((m) => m.publicId === publicId);
    if (!removed) return res.status(404).json({ message: "Media not found" });
    review[metaField] = meta.filter((m) => m.publicId !== publicId);
    review[urlField] = (review[urlField] || []).filter((u) => u !== removed.url);
    await review.save();
    try {
      const cloudinary = require("../config/cloudinary");
      await cloudinary.uploader.destroy(publicId, { resource_type: type === "video" ? "video" : "image" });
    } catch (e) {}
    res.json({ message: "Media deleted", publicId });
  } catch (err) {
    next(err);
  }
};

exports.verifyReview = async (req, res, next) => {
  try {
    const { id } = req.params; // review id
    const review = await Review.findByIdAndUpdate(id, { isVerified: true }, { new: true });
    if (!review) return res.status(404).json({ message: "Review not found" });
    res.json(review);
  } catch (err) {
    next(err);
  }
};

