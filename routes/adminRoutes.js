const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/roleMiddleware");
const { getPendingVerifications, getPendingBookings, getDashboardStats } = require("../controllers/adminController");

const router = express.Router();

router.get("/verifications/pending", protect, requireAdmin, getPendingVerifications);
router.get("/bookings/pending", protect, requireAdmin, getPendingBookings);
router.get("/stats", protect, requireAdmin, getDashboardStats);

module.exports = router;

