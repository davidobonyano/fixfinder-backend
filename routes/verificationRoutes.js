const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../utils");
const {
  start,
  upload: uploadCtrl,
  status,
  approve,
  reject,
  autoEvaluate,
  faceStatus,
  startFace,
  setReferenceFace,
  captureFace,
  resetFaceVerification,
} = require("../controllers/verificationController");
const { requireAdmin } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/start", protect, start);
router.post("/upload", protect, upload.any(), uploadCtrl);
router.get("/status", protect, status);
router.post("/auto-evaluate", protect, autoEvaluate);
router.put("/approve/:id", protect, requireAdmin, approve);
router.put("/reject/:id", protect, requireAdmin, reject);
router.get("/face/status", protect, faceStatus);
router.post("/face/start", protect, startFace);
router.post("/face/reference", protect, setReferenceFace);
router.post("/face/capture", protect, upload.single("faceImage"), captureFace);
router.post("/face/reset", protect, resetFaceVerification);

module.exports = router;




