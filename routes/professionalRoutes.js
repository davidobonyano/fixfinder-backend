const express = require("express");
const {
  createProfessional,
  getProfessionals,
  getProfessionalById,
  getProfessionalByUserId,
  updateProfessional,
  deleteProfessional,
  getProfessionalMedia,
  deleteProfessionalMedia,
  uploadProbe,
  replaceProfessionalMedia,
  uploadProfessionalMedia,
  testCloudinary,
  sendProfessionalEmailVerification,
} = require("../controllers/professionalController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../utils");

const router = express.Router();

router.get("/", getProfessionals);
router.get("/:id", getProfessionalById);
router.get("/by-user/:userId", getProfessionalByUserId);
router.post("/", protect, createProfessional);
router.put(
  "/:id",
  protect,
  upload.any(),
  updateProfessional
);
router.delete("/:id", protect, deleteProfessional);

// media helpers
router.get("/:id/media", getProfessionalMedia);
router.delete("/:id/media", protect, deleteProfessionalMedia);
router.post("/:id/media", protect, upload.any(), uploadProfessionalMedia);
router.post("/:id/media/replace", protect, upload.any(), replaceProfessionalMedia);

// probe upload to debug file reception
router.post("/:id/upload-probe", protect, upload.any(), uploadProbe);

// test Cloudinary configuration
router.get("/test-cloudinary", testCloudinary);

// send email verification for professionals
router.post("/send-email-verification", protect, sendProfessionalEmailVerification);

module.exports = router;

