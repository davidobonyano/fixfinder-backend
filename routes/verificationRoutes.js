const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { upload } = require("../utils");
const { start, upload: uploadCtrl, status, approve, reject, autoEvaluate } = require("../controllers/verificationController");
const { requireAdmin } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/start", protect, start);
router.post("/upload", protect, upload.any(), uploadCtrl);
router.get("/status", protect, status);
router.post("/auto-evaluate", protect, autoEvaluate);
router.put("/approve/:id", protect, requireAdmin, approve);
router.put("/reject/:id", protect, requireAdmin, reject);

module.exports = router;




