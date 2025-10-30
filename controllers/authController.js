const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Professional = require("../models/Professional");
const { reverseGeocode } = require("../utils/locationService");

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




