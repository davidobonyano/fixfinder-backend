const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadToCloudinary } = require('../config/cloudinary');
const upload = require('../config/cloudinary').upload;
const User = require('../models/User');
const { compressImage, validateImageFile } = require('../utils/imageCompression');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { sendEmail } = require('../utils/mailer');
const { sendSMS } = require('../utils/smsService');

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.user.id;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/profile-picture
// @desc    Upload profile picture
// @access  Private
router.post('/profile-picture', protect, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Validate image file
    try {
      validateImageFile(req.file);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Compress image (pass file path, not the file object)
    const compressedFile = await compressImage(req.file.path, 500); // 500KB max for profile pics

    // Upload to Cloudinary
    const result = await uploadToCloudinary(compressedFile.path, 'profile-pictures');

    // Update user profile picture
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        profilePicture: result.secure_url,
        avatarUrl: result.secure_url // Keep both for compatibility
      },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        profilePicture: user.profilePicture,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/users/profile-picture
// @desc    Remove profile picture
// @access  Private
router.delete('/profile-picture', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        profilePicture: null,
        avatarUrl: null
      },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile picture removed successfully',
      data: {
        profilePicture: user.profilePicture,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    console.error('Remove profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await User.findByIdAndUpdate(userId, { 
      password: hashedNewPassword,
      passwordUpdatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/send-email-verification
// @desc    Send email verification
// @access  Private
router.post('/send-email-verification', protect, async (req, res) => {
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
    
    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email - FixFinder',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Verify Your Email Address</h2>
          <p>Hello ${user.name},</p>
          <p>Please click the button below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `
    });

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('Send email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/verify-email
// @desc    Verify email with token
// @access  Private
router.post('/verify-email', protect, [
  body('token')
    .notEmpty()
    .withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.body;
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

    if (!user.emailVerification.token || user.emailVerification.token !== token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    if (user.emailVerification.tokenExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired'
      });
    }

    // Verify email
    await User.findByIdAndUpdate(userId, {
      'emailVerification.isVerified': true,
      'emailVerification.verifiedAt': new Date(),
      'emailVerification.token': null,
      'emailVerification.tokenExpires': null
    });

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/send-phone-verification
// @desc    Send phone verification OTP
// @access  Private
router.post('/send-phone-verification', protect, [
  body('phone')
    .isMobilePhone('en-NG')
    .withMessage('Please provide a valid Nigerian phone number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if phone is already verified
    if (user.phoneVerification.isVerified && user.phone === phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is already verified'
      });
    }

    // Check rate limiting (max 3 attempts per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.phoneVerification.lastAttempt && user.phoneVerification.lastAttempt > oneHourAgo && user.phoneVerification.attempts >= 3) {
      return res.status(429).json({
        success: false,
        message: 'Too many verification attempts. Please try again in an hour.'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with OTP
    await User.findByIdAndUpdate(userId, {
      phone: phone,
      'phoneVerification.otp': otp,
      'phoneVerification.otpExpires': otpExpires,
      'phoneVerification.attempts': user.phoneVerification.attempts + 1,
      'phoneVerification.lastAttempt': new Date()
    });

    // Send SMS with OTP
    try {
      const smsMessage = `Your FixFinder verification code is: ${otp}. This code expires in 10 minutes.`;
      await sendSMS(phone, smsMessage);
      
      res.json({
        success: true,
        message: 'Verification code sent successfully',
        // In development, also return OTP for testing
        ...(process.env.NODE_ENV !== 'production' && { otp })
      });
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      
      // Still return success but log the error
      res.json({
        success: true,
        message: 'Verification code generated (SMS may not have been sent)',
        // In development, return OTP for testing
        ...(process.env.NODE_ENV !== 'production' && { 
          otp,
          smsError: smsError.message 
        })
      });
    }
  } catch (error) {
    console.error('Send phone verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/users/verify-phone
// @desc    Verify phone with OTP
// @access  Private
router.post('/verify-phone', protect, [
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { otp } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.phoneVerification.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is already verified'
      });
    }

    if (!user.phoneVerification.otp || user.phoneVerification.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    if (user.phoneVerification.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired'
      });
    }

    // Verify phone
    await User.findByIdAndUpdate(userId, {
      'phoneVerification.isVerified': true,
      'phoneVerification.verifiedAt': new Date(),
      'phoneVerification.otp': null,
      'phoneVerification.otpExpires': null,
      'phoneVerification.attempts': 0
    });

    res.json({
      success: true,
      message: 'Phone number verified successfully'
    });
  } catch (error) {
    console.error('Verify phone error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/users/delete-account
// @desc    Delete user account and all associated data
// @access  Private
router.delete('/delete-account', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete all user-related data
    await Promise.all([
      // Delete user's jobs
      require('../models/Job').deleteMany({ 
        $or: [{ client: userId }, { professional: userId }] 
      }),
      
      // Delete user's messages and conversations
      require('../models/Message').deleteMany({ sender: userId }),
      require('../models/Conversation').deleteMany({ 
        'participants.user': userId 
      }),
      
      // Delete user's reviews
      require('../models/Review').deleteMany({ 
        $or: [{ user: userId }, { professional: userId }] 
      }),
      
      // Delete user's notifications
      require('../models/Notification').deleteMany({ 
        $or: [{ recipient: userId }, { sender: userId }] 
      }),
      
      // Delete user's professional profile if exists
      require('../models/Professional').deleteOne({ user: userId }),
      
      // Delete user's bookings
      require('../models/Booking').deleteMany({ 
        $or: [{ client: userId }, { professional: userId }] 
      }),
      
      // Delete user's payments
      require('../models/Payment').deleteMany({ 
        $or: [{ client: userId }, { professional: userId }] 
      })
    ]);

    // Finally, delete the user account
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Account and all associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

