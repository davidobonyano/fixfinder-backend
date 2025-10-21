const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { initializePayment, verifyPayment, paystackWebhook, getPaymentHistory } = require("../controllers/paymentController");

const router = express.Router();

// Webhook (no auth required - Paystack calls this)
router.post("/webhook", paystackWebhook);

// Protected routes
router.post("/initialize", protect, initializePayment);
router.post("/verify", protect, verifyPayment);
router.get("/history", protect, getPaymentHistory);

module.exports = router;

