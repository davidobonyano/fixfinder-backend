const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const compressImage = async (filePath, maxSizeKB = 500) => {
  try {
    const originalStats = fs.statSync(filePath);
    const originalSizeKB = originalStats.size / 1024;
    
    console.log('Original file size:', originalSizeKB.toFixed(2), 'KB');
    
    // If file is already small enough, return original
    if (originalSizeKB <= maxSizeKB) {
      return { path: filePath, size: originalStats.size };
    }

    // Create compressed version
    const compressedPath = filePath.replace(/(\.[^.]+)$/, '_compressed$1');
    
    // Calculate quality based on size ratio
    const sizeRatio = maxSizeKB / originalSizeKB;
    const quality = Math.max(20, Math.min(90, Math.floor(sizeRatio * 100)));
    
    await sharp(filePath)
      .jpeg({ quality })
      .resize(800, 800, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .toFile(compressedPath);

    const compressedStats = fs.statSync(compressedPath);
    const compressedSizeKB = compressedStats.size / 1024;
    
    console.log('Compressed file size:', compressedSizeKB.toFixed(2), 'KB');
    
    // If still too large, compress more aggressively
    if (compressedSizeKB > maxSizeKB) {
      const aggressiveQuality = Math.max(10, Math.floor(quality * 0.7));
      
      await sharp(filePath)
        .jpeg({ quality: aggressiveQuality })
        .resize(600, 600, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .toFile(compressedPath);
        
      const finalStats = fs.statSync(compressedPath);
      console.log('Final compressed file size:', (finalStats.size / 1024).toFixed(2), 'KB');
    }
    
    // Replace original with compressed version
    fs.unlinkSync(filePath);
    fs.renameSync(compressedPath, filePath);
    
    return { path: filePath, size: fs.statSync(filePath).size };
  } catch (error) {
    console.error('Image compression failed:', error);
    // Return original file if compression fails
    return { path: filePath, size: fs.statSync(filePath).size };
  }
};

const validateImageFile = (file) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!validTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Please upload JPEG, PNG, or WebP images only.');
  }

  if (file.size > maxSize) {
    throw new Error('File too large. Please upload images smaller than 10MB.');
  }

  return true;
};

module.exports = {
  compressImage,
  validateImageFile
};





