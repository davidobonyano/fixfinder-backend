const Professional = require("../models/Professional");
const { uploadBufferToCloudinary } = require("../utils");

exports.createProfessional = async (req, res, next) => {
  try {
    const { name, category, city, bio, yearsOfExperience, pricePerHour, languages, certifications } = req.body;
    if (!name || !category || !city) {
      return res.status(400).json({ message: "name, category, and city are required" });
    }
    const professional = await Professional.create({
      user: req.user?.id,
      name,
      category,
      city,
      bio,
      yearsOfExperience,
      pricePerHour,
      languages,
      certifications,
    });
    res.status(201).json(professional);
  } catch (err) {
    next(err);
  }
};

exports.getProfessionals = async (req, res, next) => {
  try {
    const { category, city, q, minRating } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (city) filter.city = city;
    if (minRating) filter.ratingAvg = { $gte: Number(minRating) };
    if (q) filter.name = { $regex: q, $options: "i" };
    const pros = await Professional.find(filter).sort({ ratingAvg: -1, createdAt: -1 });
    res.json(pros);
  } catch (err) {
    next(err);
  }
};

exports.getProfessionalById = async (req, res, next) => {
  try {
    const pro = await Professional.findById(req.params.id);
    if (!pro) return res.status(404).json({ message: "Professional not found" });
    res.json(pro);
  } catch (err) {
    next(err);
  }
};

exports.updateProfessional = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    // Handle images/videos if provided via multer
    if (Array.isArray(req.files) && req.files.length) {
      const imageFiles = req.files.filter((f) => (f.mimetype || "").startsWith("image/"));
      const videoFiles = req.files.filter((f) => (f.mimetype || "").startsWith("video/"));

      if (imageFiles.length) {
        const results = await Promise.all(
          imageFiles.map((f) =>
            uploadBufferToCloudinary(f.buffer, { folder: "fixfinder/professionals", resource_type: "image" })
          )
        );
        const urls = results.map((r) => r.secure_url);
        const metas = results.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
        updates.$push = { photos: { $each: urls }, photosMeta: { $each: metas } };
      }

      if (videoFiles.length) {
        const results = await Promise.all(
          videoFiles.map((f) =>
            uploadBufferToCloudinary(f.buffer, { folder: "fixfinder/professionals", resource_type: "video" })
          )
        );
        const urls = results.map((r) => r.secure_url);
        const metas = results.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
        updates.$push = { ...(updates.$push || {}), videos: { $each: urls }, videosMeta: { $each: metas } };
      }
    }
    const pro = await Professional.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!pro) return res.status(404).json({ message: "Professional not found" });
    res.json(pro);
  } catch (err) {
    next(err);
  }
};

exports.deleteProfessional = async (req, res, next) => {
  try {
    const pro = await Professional.findByIdAndDelete(req.params.id);
    if (!pro) return res.status(404).json({ message: "Professional not found" });
    res.json({ message: "Professional deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getProfessionalMedia = async (req, res, next) => {
  try {
    const pro = await Professional.findById(req.params.id).select("photos videos photosMeta videosMeta");
    if (!pro) return res.status(404).json({ message: "Professional not found" });
    res.json({ photos: pro.photos, videos: pro.videos, photosMeta: pro.photosMeta, videosMeta: pro.videosMeta });
  } catch (err) {
    next(err);
  }
};

exports.deleteProfessionalMedia = async (req, res, next) => {
  try {
    const { id } = req.params; // professional id
    const { publicId, type } = req.body; // type: image|video
    if (!publicId || !type) return res.status(400).json({ message: "publicId and type are required" });

    const pro = await Professional.findById(id);
    if (!pro) return res.status(404).json({ message: "Professional not found" });

    // Remove from Cloudinary (best-effort)
    // We won't await here to keep free tier quick; but we can await if desired
    const resourceType = type === "video" ? "video" : "image";
    try {
      const cloudinary = require("../config/cloudinary");
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (e) {}

    // Remove from meta arrays
    const metaField = type === "video" ? "videosMeta" : "photosMeta";
    const urlField = type === "video" ? "videos" : "photos";
    const meta = pro[metaField] || [];
    const removed = meta.find((m) => m.publicId === publicId);
    if (!removed) return res.status(404).json({ message: "Media not found" });

    pro[metaField] = meta.filter((m) => m.publicId !== publicId);
    pro[urlField] = (pro[urlField] || []).filter((u) => u !== removed.url);
    await pro.save();

    res.json({ message: "Media deleted", publicId });
  } catch (err) {
    next(err);
  }
};

exports.uploadProbe = async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const summary = files.map((f) => ({ fieldname: f.fieldname, originalname: f.originalname, mimetype: f.mimetype, size: f.size }));
    res.json({ count: files.length, files: summary });
  } catch (err) {
    next(err);
  }
};

exports.replaceProfessionalMedia = async (req, res, next) => {
  try {
    const { id } = req.params; // professional id
    const { publicId, type } = req.body; // existing media to replace
    if (!publicId || !type) return res.status(400).json({ message: "publicId and type are required" });

    const pro = await Professional.findById(id);
    if (!pro) return res.status(404).json({ message: "Professional not found" });

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: "No files uploaded" });

    const isVideo = type === "video";
    const file = files[0];
    const { uploadBufferToCloudinary } = require("../utils");
    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: "fixfinder/professionals",
      resource_type: isVideo ? "video" : "image",
    });

    // Remove old one from arrays
    const metaField = isVideo ? "videosMeta" : "photosMeta";
    const urlField = isVideo ? "videos" : "photos";
    const meta = pro[metaField] || [];
    const removed = meta.find((m) => m.publicId === publicId);
    if (!removed) return res.status(404).json({ message: "Old media not found" });

    pro[metaField] = meta.filter((m) => m.publicId !== publicId);
    pro[urlField] = (pro[urlField] || []).filter((u) => u !== removed.url);

    // Add the new one
    pro[metaField].push({ url: result.secure_url, publicId: result.public_id });
    pro[urlField].push(result.secure_url);
    await pro.save();

    // best-effort delete of old asset from Cloudinary
    try {
      const cloudinary = require("../config/cloudinary");
      await cloudinary.uploader.destroy(publicId, { resource_type: isVideo ? "video" : "image" });
    } catch (e) {}

    res.json({ message: "Media replaced", url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    next(err);
  }
};

