const express = require("express");
const { createReview, getReviewsForProfessional, uploadReviewMedia, deleteReviewMedia, verifyReview } = require("../controllers/reviewController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../utils");

const router = express.Router();

router.get("/:id", getReviewsForProfessional); // professional id
router.post("/", protect, createReview);
router.post("/:id/media", protect, upload.any(), uploadReviewMedia); // review id
router.delete("/:id/media", protect, deleteReviewMedia);
router.put("/:id/verify", protect, verifyReview); // simple flag; later restrict to admin

module.exports = router;

