const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Professional = require("../models/Professional");
const { reverseGeocode } = require("../utils/locationService");
const { sendMail } = require("../utils/mailer");

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, latitude, longitude } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    // Handle location if provided
    let locationData = null;
    if (latitude && longitude) {
      try {
        const geocodeData = await reverseGeocode(latitude, longitude);
        locationData = {
          latitude,
          longitude,
          city: geocodeData.city,
          state: geocodeData.state,
          country: geocodeData.country,
          address: geocodeData.address,
          lastUpdated: new Date()
        };
      } catch (geocodeError) {
        console.error('Geocoding error during registration:', geocodeError);
        // Continue without location
      }
    }

    const userData = { name, email, password: hashed, role };
    if (locationData) {
      userData.location = locationData;
    }

    const user = await User.create(userData);
    
    // If user is registering as a professional, create a Professional document
    if (role === 'professional') {
      await Professional.create({
        user: user._id,
        name: name,
        email: email,
        isActive: true,
        // Default values - can be updated later through the professional form
        category: 'General',
        bio: 'Professional profile - please complete your profile',
        hourlyRate: 0,
        location: {
          address: 'Location not set',
          coordinates: { lat: 0, lng: 0 }
        }
      });
      console.log('✅ Professional document created for user:', user._id);
    }
    
    const token = generateToken(user._id);

    return res.status(201).json({ user: user.toSafeJSON(), token });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password, latitude, longitude } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Update location if provided
    if (latitude && longitude) {
      try {
        const geocodeData = await reverseGeocode(latitude, longitude);
        user.location = {
          latitude,
          longitude,
          city: geocodeData.city,
          state: geocodeData.state,
          country: geocodeData.country,
          address: geocodeData.address,
          lastUpdated: new Date()
        };
        await user.save();
      } catch (geocodeError) {
        console.error('Geocoding error during login:', geocodeError);
        // Continue without updating location
      }
    }

    const token = generateToken(user._id);
    return res.json({ user: user.toSafeJSON(), token });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    return res.json({ user: user?.toSafeJSON() });
  } catch (err) {
    next(err);
  }
};

// Forgot Password - Generate reset token and send email
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email (don't select password)
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Set reset token and expiry (1 hour from now)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // Create reset URL - handle comma-separated URLs (for multiple frontends)
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const baseUrl = frontendUrl.includes(',') ? frontendUrl.split(',')[0].trim() : frontendUrl.trim();
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email
    try {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">FixFinder</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
              <p>Hello ${user.name},</p>
              <p>You requested to reset your password for your FixFinder account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
              </div>
              <p style="font-size: 12px; color: #666;">Or copy and paste this link into your browser:</p>
              <p style="font-size: 12px; color: #667eea; word-break: break-all;">${resetUrl}</p>
              <p style="font-size: 12px; color: #666; margin-top: 30px;">This link will expire in 1 hour.</p>
              <p style="font-size: 12px; color: #666;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="font-size: 12px; color: #666; text-align: center;">© ${new Date().getFullYear()} FixFinder. All rights reserved.</p>
            </div>
          </body>
        </html>
      `;

      const text = `
        FixFinder - Password Reset Request
        
        Hello ${user.name},
        
        You requested to reset your password for your FixFinder account.
        
        Click this link to reset your password:
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request this, please ignore this email and your password will remain unchanged.
        
        © ${new Date().getFullYear()} FixFinder. All rights reserved.
      `;

      await sendMail({
        to: user.email,
        subject: "FixFinder - Password Reset Request",
        html,
        text,
      });

      return res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    } catch (emailError) {
      // Always log the reset link to console if email fails (for development/testing)
      console.log('\n🔑 ===== PASSWORD RESET LINK =====');
      console.log(`For user: ${user.email}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log('========================================================\n');
      console.log('💡 You can copy this URL and use it to reset the password.');
      console.log('   The link will work even though email failed to send.\n');
      // If email fails, clear the reset token
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });

      console.error("Error sending password reset email:", emailError);
      
      // Check if it's a configuration error
      if (emailError.message?.includes('not configured')) {
        // In development, still return success with the reset link logged
        if (process.env.NODE_ENV !== 'production') {
          return res.json({ 
            success: true, 
            message: "Password reset link generated. Check server console for the reset URL (email service not configured)." 
          });
        }
        
        return res.status(500).json({ 
          message: "Email service is not configured. Please contact support or check server configuration." 
        });
      }
      
      // For connection timeout or network errors (common on Render/VPS with firewall restrictions)
      if (emailError.code === 'ESOCKET' || emailError.code === 'ETIMEDOUT' || emailError.code === 'ECONNECTION') {
        console.error("Email connection error - likely firewall/network restriction:", {
          code: emailError.code,
          message: emailError.message,
          address: emailError.address,
          port: emailError.port
        });
        
        // Always return success in development, and optionally in production if ALLOW_EMAIL_FAILURES is set
        // The reset link was already logged above - user can copy it from console
        if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_EMAIL_FAILURES === 'true') {
          return res.json({ 
            success: true, 
            message: "Password reset link generated. Due to network restrictions, email couldn't be sent. Please check server console logs for the reset URL, or contact support." 
          });
        }
        
        return res.status(500).json({ 
          message: "Unable to send email due to network restrictions. Please contact support for password reset." 
        });
      }
      
      // For other errors, log details
      console.error("Email service error details:", {
        message: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
        responseCode: emailError.responseCode,
        responseMessage: emailError.responseMessage
      });
      
      // In development, still allow testing even if email fails
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ 
          success: true, 
          message: "Password reset link generated. Check server console for the reset URL." 
        });
      }
      
      return res.status(500).json({ 
        message: "Error sending email. Please try again later or contact support." 
      });
    }
  } catch (err) {
    next(err);
  }
};

// Reset Password - Verify token and update password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token that hasn't expired
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password +resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.passwordUpdatedAt = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ 
      success: true, 
      message: "Password has been reset successfully. You can now login with your new password." 
    });
  } catch (err) {
    next(err);
  }
};




