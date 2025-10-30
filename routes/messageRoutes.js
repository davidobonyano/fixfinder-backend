const express = require('express');
const router = express.Router();
const {
  getConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  shareLocation,
  stopLocationShare,
  deleteMyMessagesInConversation,
  deleteConversation,
  deleteAllMessagesForMe,
  deleteConversationForMe
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');
const { body } = require('express-validator');
// Media uploads disabled for messaging per requirements
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// Validation middleware
const sendMessageValidation = [
  body('content')
    .not()
    .isEmpty()
    .withMessage('Message content is required'),
  body('messageType')
    .optional()
    .isIn(['text', 'location', 'contact'])
    .withMessage('Invalid message type'),
  body('replyTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid reply message ID')
];

const createConversationValidation = [
  body('otherUserId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('jobId')
    .optional()
    .isMongoId()
    .withMessage('Invalid job ID')
];

// @route   GET /api/messages/conversations
// @desc    Get all conversations for the authenticated user
// @access  Private
router.get('/conversations', protect, getConversations);

// @route   POST /api/messages/conversations
// @desc    Create or get conversation between two users
// @access  Private
router.post('/conversations', protect, createConversationValidation, createOrGetConversation);

// @route   GET /api/messages/conversations/:id
// @desc    Get messages for a conversation
// @access  Private
router.get('/conversations/:id', protect, getMessages);

// @route   POST /api/messages/conversations/:id
// @desc    Send a message to a conversation
// @access  Private
router.post('/conversations/:id', protect, sendMessageValidation, sendMessage);

// @route   POST /api/messages/conversations/:id/read
// @desc    Mark conversation as read
// @access  Private
router.post('/conversations/:id/read', protect, markAsRead);

// @route   PUT /api/messages/:id
// @desc    Edit a message
// @access  Private
router.put('/:id', protect, [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message content must be between 1 and 1000 characters')
], editMessage);

// @route   DELETE /api/messages/:id
// @desc    Delete a message
// @access  Private
router.delete('/:id', protect, deleteMessage);

// @route   DELETE /api/messages/conversations/:id/my-messages
// @desc    Delete all my messages in a conversation
// @access  Private
router.delete('/conversations/:id/my-messages', protect, deleteMyMessagesInConversation);

// @route   DELETE /api/messages/conversations/:id/all-for-me
// @desc    Delete all messages for the authenticated user in a conversation
// @access  Private
router.delete('/conversations/:id/all-for-me', protect, deleteAllMessagesForMe);

// @route   DELETE /api/messages/conversations/:id/for-me
// @desc    Delete entire conversation for the authenticated user
// @access  Private
router.delete('/conversations/:id/for-me', protect, deleteConversationForMe);

// @route   DELETE /api/messages/conversations/:id
// @desc    Delete entire conversation
// @access  Private
router.delete('/conversations/:id', protect, deleteConversation);

// @route   POST /api/messages/conversations/:id/location-share
// @desc    Start sharing location in a conversation
// @access  Private
router.post('/conversations/:id/location-share', protect, [
  body('lat').isNumeric().withMessage('Latitude must be a number'),
  body('lng').isNumeric().withMessage('Longitude must be a number'),
  body('accuracy').optional().isNumeric().withMessage('Accuracy must be a number')
], shareLocation);

// @route   POST /api/messages/conversations/:id/stop-location-share
// @desc    Stop sharing location in a conversation
// @access  Private
router.post('/conversations/:id/stop-location-share', protect, stopLocationShare);

// Dev-only: seed a demo conversation with a mock professional
router.post('/dev/seed-demo-conversation', protect, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Ensure a mock professional exists (use a regular user flagged as professional role)
    let pro = await User.findOne({ email: 'mock.pro@example.com' });
    if (!pro) {
      pro = await User.create({
        name: 'Mock Pro',
        email: 'mock.pro@example.com',
        password: 'MockPro#123',
        role: 'professional'
      });
    }

    // Create conversation if not exists
    let conversation = await Conversation.findOne({
      participants: {
        $all: [
          { user: currentUser._id },
          { user: pro._id }
        ]
      },
      isActive: true
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [
          { user: currentUser._id, userType: 'user' },
          { user: pro._id, userType: 'professional' }
        ]
      });
    }

    // Add a welcome message from the pro
    const message = await Message.create({
      conversation: conversation._id,
      sender: pro._id,
      senderType: 'professional',
      content: { text: 'Hello! This is a demo conversation. How can I help?' },
      messageType: 'text'
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
      $inc: { 'unreadCount.user': 1 }
    });

    res.json({ success: true, data: { conversationId: conversation._id } });
  } catch (e) {
    console.error('Seed demo conversation error:', e);
    res.status(500).json({ success: false, message: 'Server error', error: e.message });
  }
});

module.exports = router;


