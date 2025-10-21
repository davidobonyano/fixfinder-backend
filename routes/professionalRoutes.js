const express = require("express");
const {
  createProfessional,
  getProfessionals,
  getProfessionalById,
  updateProfessional,
  deleteProfessional,
  getProfessionalMedia,
  deleteProfessionalMedia,
  uploadProbe,
  replaceProfessionalMedia,
} = require("../controllers/professionalController");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../utils");

const router = express.Router();

router.get("/", getProfessionals);
router.get("/:id", getProfessionalById);
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
router.post("/:id/media/replace", protect, upload.any(), replaceProfessionalMedia);

// probe upload to debug file reception
router.post("/:id/upload-probe", protect, upload.any(), uploadProbe);

module.exports = router;

