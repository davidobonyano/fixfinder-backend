const User = require("../models/User");
const Booking = require("../models/Booking");

exports.getPendingVerifications = async (req, res, next) => {
  try {
    const users = await User.find({ "verification.status": "pending" }).select("name email verification createdAt");
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.getPendingBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ status: "pending" })
      .populate("customer", "name email")
      .populate("professional", "name category")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalProfessionals, totalBookings, pendingVerifications, pendingBookings] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "professional" }),
      Booking.countDocuments(),
      User.countDocuments({ "verification.status": "pending" }),
      Booking.countDocuments({ status: "pending" }),
    ]);
    res.json({ totalUsers, totalProfessionals, totalBookings, pendingVerifications, pendingBookings });
  } catch (err) {
    next(err);
  }
};

