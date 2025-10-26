const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Professional = require("../models/Professional");

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, password: hashed, role });
    
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
    const { email, password } = req.body;
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




