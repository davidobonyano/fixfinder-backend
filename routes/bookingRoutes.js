const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createBooking, getMyBookings, getProfessionalBookings, updateBookingStatus, getAvailability } = require("../controllers/bookingController");

const router = express.Router();

router.post("/", protect, createBooking);
router.get("/me", protect, getMyBookings);
router.get("/professional/:id", protect, getProfessionalBookings);
router.put("/:id/status", protect, updateBookingStatus);
router.get("/availability/:id", getAvailability);

module.exports = router;


