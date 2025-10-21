const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listConversations, startConversation, getMessages, sendMessage } = require("../controllers/chatController");

const router = express.Router();

router.get("/conversations", protect, listConversations);
router.post("/conversations", protect, startConversation);
router.get("/conversations/:id/messages", protect, getMessages);
router.post("/conversations/:id/messages", protect, sendMessage);

module.exports = router;



