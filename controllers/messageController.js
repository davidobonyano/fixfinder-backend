const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Professional = require('../models/Professional');
const Job = require('../models/Job');
const Notification = require('../models/Notification');
const { uploadToCloudinary } = require('../config/cloudinary');
const { validationResult } = require('express-validator');

// @desc    Get or create conversation
// @route   GET /api/messages/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role === 'professional' ? 'professional' : 'user';

    const conversations = await Conversation.find({
      'participants.user': userId,
      isActive: true
    })
    .populate('participants.user', 'name email phone')
    .populate('lastMessage')
    .populate('job', 'title status')
    .sort({ lastMessageAt: -1 });

    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get or create conversation between two users
// @route   POST /api/messages/conversations
// @access  Private
const createOrGetConversation = async (req, res) => {
  try {
    const { otherUserId, jobId } = req.body;
    const userId = req.user.id;
    const userType = req.user.role === 'professional' ? 'professional' : 'user';

    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      participants: {
        $all: [
          { user: userId },
          { user: otherUserId }
        ]
      },
      isActive: true
    })
    .populate('participants.user', 'name email phone')
    .populate('job', 'title status');

    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [
          { user: userId, userType },
          { user: otherUserId, userType: userType === 'professional' ? 'user' : 'professional' }
        ],
        job: jobId || null
      });

      await conversation.save();
      await conversation.populate('participants.user', 'name email phone');
      if (jobId) {
        await conversation.populate('job', 'title status');
      }
    }

    res.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get messages for a conversation
// @route   GET /api/messages/conversations/:id
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;

    // Verify user is part of the conversation
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(
      p => p.user.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this conversation'
      });
    }

    const messages = await Message.find({
      conversation: id,
      isDeleted: false
    })
    .populate('sender', 'name email')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: id,
        sender: { $ne: userId },
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    // Update unread count
    const userType = req.user.role === 'professional' ? 'professional' : 'user';
    await Conversation.findByIdAndUpdate(id, {
      $set: {
        [`unreadCount.${userType}`]: 0
      }
    });

    res.json({
      success: true,
      data: messages.reverse() // Return in chronological order
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Send a message
// @route   POST /api/messages/conversations/:id
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { content, messageType = 'text', replyTo } = req.body;
    const userId = req.user.id;
    const userType = req.user.role === 'professional' ? 'professional' : 'user';

    // Verify user is part of the conversation
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(
      p => p.user.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this conversation'
      });
    }

    // Media uploads disabled (no req.files handling)

    // Create message
    const message = new Message({
      conversation: id,
      sender: userId,
      senderType: userType,
      content: messageType === 'text' ? { text: content?.text || '' } :
               messageType === 'location' ? { location: content?.location } :
               messageType === 'contact' ? { contact: content?.contact } : { text: '' },
      messageType,
      replyTo
    });

    await message.save();

    // Update conversation
    await Conversation.findByIdAndUpdate(id, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
      $inc: {
        [`unreadCount.${userType === 'professional' ? 'user' : 'professional'}`]: 1
      }
    });

    // Populate sender details
    await message.populate('sender', 'name email');
    if (replyTo) {
      await message.populate('replyTo');
    }

    // Create notification for the other participant
    const otherParticipant = conversation.participants.find(
      p => p.user.toString() !== userId
    );

    if (otherParticipant) {
      await Notification.create({
        recipient: otherParticipant.user,
        type: 'new_message',
        title: 'New Message',
        message: `You have a new message from ${req.user.name}`,
        data: {
          conversationId: id,
          messageId: message._id
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Edit a message
// @route   PUT /api/messages/:id
// @access  Private
const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to edit this message'
      });
    }

    // Check if message is not too old (e.g., 24 hours)
    const hoursSinceCreated = (new Date() - message.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) {
      return res.status(400).json({
        success: false,
        message: 'Message is too old to edit'
      });
    }

    message.content.text = content;
    message.isEdited = true;
    message.editedAt = new Date();

    await message.save();

    res.json({
      success: true,
      message: 'Message updated successfully',
      data: message
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete a message
// @route   DELETE /api/messages/:id
// @access  Private
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Mark conversation as read
// @route   POST /api/messages/conversations/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userType = req.user.role === 'professional' ? 'professional' : 'user';

    // Update unread count
    await Conversation.findByIdAndUpdate(id, {
      $set: {
        [`unreadCount.${userType}`]: 0
      }
    });

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: id,
        sender: { $ne: userId },
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'Conversation marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  getConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead
};


