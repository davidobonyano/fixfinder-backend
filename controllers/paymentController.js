const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const User = require("../models/User");

exports.initializePayment = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ message: "bookingId required" });

    const booking = await Booking.findById(bookingId).populate("professional", "name paystackSubaccount user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (String(booking.customer) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Check if payment already exists
    let payment = await Payment.findOne({ booking: bookingId });
    if (payment && payment.status === "success") {
      return res.status(400).json({ message: "Payment already completed" });
    }

    if (!payment) {
      payment = await Payment.create({
        booking: bookingId,
        customer: req.user.id,
        professional: booking.professional._id,
        amount: booking.price,
        currency: "NGN",
      });
    }

    // Split parameters
    const platformPercent = Number(process.env.PLATFORM_FEE_PERCENT || 10); // default 10%
    const subaccount = booking.professional.paystackSubaccount || null;
    const split = subaccount
      ? { subaccount, bearer: "subaccount", transaction_charge: 0 }
      : null;

    // Paystack initialization (mock for now)
    const paystackData = {
      reference: `fixfinder_${payment._id}_${Date.now()}`,
      access_code: `access_${payment._id}`,
      authorization_url: `https://checkout.paystack.com/${payment._id}`,
      split,
      platform_fee_percent: platformPercent,
    };

    payment.paystackReference = paystackData.reference;
    payment.paystackAccessCode = paystackData.access_code;
    payment.paystackData = paystackData;
    await payment.save();

    res.json({
      paymentId: payment._id,
      amount: payment.amount,
      currency: payment.currency,
      reference: paystackData.reference,
      access_code: paystackData.access_code,
      authorization_url: paystackData.authorization_url,
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ message: "reference required" });

    const payment = await Payment.findOne({ paystackReference: reference });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Mock verification - replace with actual Paystack verification API call
    const isSuccessful = Math.random() > 0.3; // 70% success rate for testing

    if (isSuccessful) {
      payment.status = "success";
      payment.paidAt = new Date();
      await payment.save();

      // Update booking status
      await Booking.findByIdAndUpdate(payment.booking, { status: "confirmed" });

      res.json({ status: "success", payment });
    } else {
      payment.status = "failed";
      await payment.save();
      res.json({ status: "failed", payment });
    }
  } catch (err) {
    next(err);
  }
};

exports.paystackWebhook = async (req, res, next) => {
  try {
    const { event, data } = req.body;

    if (event === "charge.success") {
      const { reference } = data;
      const payment = await Payment.findOne({ paystackReference: reference });
      
      if (payment && payment.status === "pending") {
        payment.status = "success";
        payment.paidAt = new Date();
        payment.paystackData = { ...payment.paystackData, webhookData: data };
        await payment.save();

        // Update booking status
        await Booking.findByIdAndUpdate(payment.booking, { status: "confirmed" });
      }
    }

    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

exports.getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.find({ customer: req.user.id })
      .populate("booking", "date durationMinutes")
      .populate("professional", "name category")
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    next(err);
  }
};
