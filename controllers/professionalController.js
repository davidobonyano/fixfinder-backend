const Professional = require("../models/Professional");
const User = require("../models/User");
const { uploadBufferToCloudinary } = require("../utils");
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');

exports.createProfessional = async (req, res, next) => {
  try {
    console.log('🔍 Creating professional - User ID:', req.user?.id);
    console.log('📝 Request body:', req.body);
    
    const { name, category, city, bio, yearsOfExperience, pricePerHour, languages, certifications, location } = req.body;
    
    if (!name || !category || !city) {
      return res.status(400).json({ message: "name, category, and city are required" });
    }
    
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const professional = await Professional.create({
      user: req.user.id,
      name,
      category,
      city,
      location,
      bio,
      yearsOfExperience,
      pricePerHour,
      languages,
      certifications,
    });
    
    console.log('✅ Professional created:', professional._id);
    res.status(201).json(professional);
  } catch (err) {
    console.error('❌ Professional creation error:', err);
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
    
    // Select specific fields to ensure we get photos and videos
    const pros = await Professional.find(filter)
      .populate('user', 'name email phone profilePicture isVerified')
      .select('name category city location bio yearsOfExperience pricePerHour languages certifications photos videos ratingAvg ratingCount completedJobs isVerified isActive user')
      .sort({ ratingAvg: -1, createdAt: -1 });
    
    console.log('Found professionals:', pros.length);
    console.log('Sample professional photos:', pros[0]?.photos);
    
    res.json({ success: true, professionals: pros });
  } catch (err) {
    next(err);
  }
};

exports.getProfessionalById = async (req, res, next) => {
  try {
    const pro = await Professional.findById(req.params.id)
      .populate('user', 'name email phone isVerified')
      .select('name category city location bio yearsOfExperience pricePerHour languages certifications photos videos photosMeta videosMeta ratingAvg ratingCount completedJobs isVerified isActive');
    if (!pro) return res.status(404).json({ message: "Professional not found" });
    
    console.log('Professional found:', {
      name: pro.name,
      photos: pro.photos,
      videos: pro.videos,
      user: pro.user
    });
    
    res.json({ success: true, data: pro });
  } catch (err) {
    next(err);
  }
};

// Get professional by user id
exports.getProfessionalByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const pro = await Professional.findOne({ user: userId });
    if (!pro) return res.status(404).json({ success: false, message: "Professional not found" });
    res.json({ success: true, data: pro });
  } catch (err) {
    next(err);
  }
};

exports.updateProfessional = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    // Coerce certifications to array of strings if array of objects provided
    if (Array.isArray(updates.certifications)) {
      updates.certifications = updates.certifications.map((c) => {
        if (c && typeof c === 'object') return c.name || '';
        return c;
      }).filter(Boolean);
    }
    // Coerce languages to array of strings
    if (Array.isArray(updates.languages)) {
      updates.languages = updates.languages.map((l) => (typeof l === 'string' ? l : ''))
        .filter(Boolean);
    }
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
    res.json({ success: true, data: pro });
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

// Upload a single media file to professional portfolio
exports.uploadProfessionalMedia = async (req, res, next) => {
  try {
    console.log('🧾 Uploading media for:', req.params.id);
    console.log('📸 Files received:', req.files?.length || 0);
    console.log('📝 Body:', req.body);
    console.log('🔍 Request headers:', req.headers);
    
    const { id } = req.params; // professional id
    console.log('🔍 Looking for professional with ID:', id);
    
    // Check if professional exists
    const pro = await Professional.findById(id);
    if (!pro) {
      console.log('❌ Professional not found with ID:', id);
      return res.status(404).json({ success: false, message: 'Professional not found' });
    }
    console.log('✅ Professional found:', pro._id);

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      console.log('❌ No files received');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = files[0];
    console.log('📄 File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      fieldname: file.fieldname,
      buffer: file.buffer ? 'exists' : 'undefined',
      path: file.path || 'undefined'
    });
    
    const isVideo = (req.body.mediaType || '').toLowerCase() === 'video' || ((file.mimetype || '').startsWith('video/'));
    console.log('🎬 Is video:', isVideo);
    
    console.log('☁️ Uploading to Cloudinary...');
    
    // Handle both memory storage (buffer) and disk storage (path) cases
    let result;
    if (file.buffer) {
      // Memory storage - direct buffer upload
      console.log('📦 Using buffer upload (memory storage)');
      result = await uploadBufferToCloudinary(file.buffer, {
        folder: 'fixfinder/professionals',
        resource_type: isVideo ? 'video' : 'image'
      });
    } else if (file.path) {
      // Disk storage - upload from file path
      console.log('📁 Using file path upload (disk storage)');
      const cloudinary = require('cloudinary').v2;
      result = await cloudinary.uploader.upload(file.path, {
        folder: 'fixfinder/professionals',
        resource_type: isVideo ? 'video' : 'image'
      });
      
      // Clean up the temporary file
      const fs = require('fs');
      try {
        fs.unlinkSync(file.path);
        console.log('🗑️ Temporary file deleted:', file.path);
      } catch (unlinkErr) {
        console.warn('⚠️ Could not delete temporary file:', unlinkErr.message);
      }
    } else {
      throw new Error('File has neither buffer nor path - multer configuration issue');
    }
    console.log('✅ Cloudinary upload successful:', result.public_id);

    const metaField = isVideo ? 'videosMeta' : 'photosMeta';
    const urlField = isVideo ? 'videos' : 'photos';
    
    // Initialize arrays if they don't exist
    if (!pro[metaField]) pro[metaField] = [];
    if (!pro[urlField]) pro[urlField] = [];
    
    pro[metaField].push({ url: result.secure_url, publicId: result.public_id });
    pro[urlField].push(result.secure_url);
    await pro.save();

    console.log('✅ Media uploaded successfully:', result.public_id);
    res.json({ success: true, data: { _id: result.public_id, url: result.secure_url, type: isVideo ? 'video' : 'image' } });
  } catch (err) {
    console.error('❌ Upload error:', err.message);
    console.error('❌ Error stack:', err.stack);
    
    // Handle Cloudinary-specific errors
    if (err.http_code) {
      return res.status(err.http_code).json({ 
        success: false, 
        error: `Cloudinary error: ${err.message}`,
        code: err.http_code 
      });
    }
    
    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        error: 'File too large. Maximum size is 10MB.' 
      });
    }
    
    // Generic server error
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Server error during upload' 
    });
  }
};

exports.uploadProbe = async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const summary = files.map((f) => ({ 
      fieldname: f.fieldname, 
      originalname: f.originalname, 
      mimetype: f.mimetype, 
      size: f.size,
      buffer: f.buffer ? 'exists' : 'undefined',
      path: f.path || 'undefined'
    }));
    console.log('🔍 Upload probe - Files received:', summary);
    console.log('🔍 Request params:', req.params);
    console.log('🔍 Request body:', req.body);
    console.log('🔍 Multer storage type:', files[0]?.buffer ? 'memory' : files[0]?.path ? 'disk' : 'unknown');
    res.json({ count: files.length, files: summary });
  } catch (err) {
    next(err);
  }
};

// Test Cloudinary configuration
exports.testCloudinary = async (req, res, next) => {
  try {
    console.log('🧪 Testing Cloudinary configuration...');
    
    // Check if Cloudinary is configured
    const cloudinary = require('cloudinary').v2;
    const config = cloudinary.config();
    
    console.log('☁️ Cloudinary config:', {
      cloud_name: config.cloud_name,
      api_key: config.api_key ? '***' + config.api_key.slice(-4) : 'Not set',
      api_secret: config.api_secret ? '***' + config.api_secret.slice(-4) : 'Not set'
    });
    
    // Test a simple upload with a small buffer
    const testBuffer = Buffer.from('test');
    const result = await uploadBufferToCloudinary(testBuffer, {
      folder: 'fixfinder/test',
      resource_type: 'image'
    });
    
    console.log('✅ Cloudinary test successful:', result.public_id);
    res.json({ 
      success: true, 
      message: 'Cloudinary configuration is working',
      testUpload: result.public_id 
    });
  } catch (err) {
    console.error('❌ Cloudinary test error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      stack: err.stack 
    });
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

// @route   POST /api/professionals/send-email-verification
// @desc    Send email verification for professional
// @access  Private
const sendProfessionalEmailVerification = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerification.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with verification token
    await User.findByIdAndUpdate(userId, {
      'emailVerification.token': verificationToken,
      'emailVerification.tokenExpires': tokenExpires
    });

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
    
    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify Your Professional Email - FixFinder',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Verify Your Professional Email Address</h2>
            <p>Hello ${user.name},</p>
            <p>Please click the button below to verify your professional email address:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Verify Professional Email
              </a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't request this verification, please ignore this email.</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Send professional email verification error:', emailError);
      
      // If email fails, return the verification URL for manual verification
      return res.json({
        success: true,
        message: 'Email service unavailable. Please use this verification link:',
        verificationUrl: verificationUrl,
        note: 'Email service is currently unavailable. Please copy the verification URL above and open it in your browser to verify your professional email.'
      });
    }

    res.json({
      success: true,
      message: 'Professional verification email sent successfully'
    });
  } catch (error) {
    console.error('Professional email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.sendProfessionalEmailVerification = sendProfessionalEmailVerification;
