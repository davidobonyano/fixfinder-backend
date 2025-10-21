const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const { sendMail } = require("../utils/mailer");
const User = require("../models/User");
const Professional = require("../models/Professional");

exports.createBooking = async (req, res, next) => {
  try {
    const { professional, service, date, durationMinutes, price, notes, address, city } = req.body;
    if (!professional || !date || !durationMinutes || price == null) {
      return res.status(400).json({ message: "professional, date, durationMinutes, price are required" });
    }
    const start = new Date(date);
    const end = new Date(start.getTime() + Number(durationMinutes) * 60000);
    const data = {
      customer: req.user.id,
      professional,
      date: start,
      endAt: end,
      durationMinutes,
      price,
      notes,
      address,
      city,
    };
    if (service && mongoose.Types.ObjectId.isValid(service)) {
      data.service = service;
    }
    // Overlap check: existing bookings where (start < newEnd) and (end > newStart)
    const overlapping = await Booking.findOne({
      professional,
      status: { $in: ["pending", "confirmed"] },
      date: { $lt: end },
      endAt: { $gt: start },
    });
    if (overlapping) {
      return res.status(409).json({ message: "Time slot not available" });
    }

    const booking = await Booking.create(data);
    try {
      const customer = await User.findById(req.user.id);
      const pro = await Professional.findById(professional);
      await sendMail({
        to: customer?.email,
        subject: "Booking Created",
        html: `<p>Your booking with ${pro?.name} on ${start.toISOString()} for ${durationMinutes} minutes was created.</p>`,
      });
    } catch (e) {}
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
};

exports.getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ customer: req.user.id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
};

exports.getAvailability = async (req, res, next) => {
  try {
    const { id } = req.params; // professional id
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ message: "date query param (YYYY-MM-DD) required" });
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const bookings = await Booking.find({
      professional: id,
      status: { $in: ["pending", "confirmed"] },
      date: { $lte: dayEnd },
      endAt: { $gte: dayStart },
    }).sort({ date: 1 });

    res.json({ date, bookings });
  } catch (err) {
    next(err);
  }
};

exports.getProfessionalBookings = async (req, res, next) => {
  try {
    const { id } = req.params; // professional id
    const bookings = await Booking.find({ professional: id }).sort({ date: 1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
};

exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { id } = req.params; // booking id
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "completed", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const booking = await Booking.findByIdAndUpdate(id, { status }, { new: true });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    try {
      const customer = await User.findById(booking.customer);
      await sendMail({
        to: customer?.email,
        subject: `Booking ${status}`,
        html: `<p>Your booking is now ${status}.</p>`,
      });
    } catch (e) {}
    res.json(booking);
  } catch (err) {
    next(err);
  }
};


