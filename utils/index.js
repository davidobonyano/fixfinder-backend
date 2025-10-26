const multer = require("multer");
const { cloudinary } = require("../config/cloudinary");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  cb(null, true); // accept all; rely on Cloudinary's resource_type
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 7, // up to 5 images + 2 videos
  },
});

const uploadBufferToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    console.log('🔍 Cloudinary object:', cloudinary ? 'exists' : 'undefined');
    console.log('🔍 Cloudinary uploader:', cloudinary?.uploader ? 'exists' : 'undefined');
    
    if (!cloudinary || !cloudinary.uploader) {
      return reject(new Error('Cloudinary not properly configured'));
    }
    
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });

module.exports = { upload, uploadBufferToCloudinary };


