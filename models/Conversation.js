const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userType: {
      type: String,
      enum: ['user', 'professional'],
      required: true
    }
  }],
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  unreadCount: {
    user: {
      type: Number,
      default: 0
    },
    professional: {
      type: Number,
      default: 0
    }
  },
  isArchived: {
    user: {
      type: Boolean,
      default: false
    },
    professional: {
      type: Boolean,
      default: false
    }
  },
  archivedAt: {
    user: Date,
    professional: Date
  },
  hiddenFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }]
}, {
  timestamps: true
});

// Index for efficient queries
conversationSchema.index({ 'participants.user': 1, isActive: 1 });
conversationSchema.index({ job: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Ensure participants array has exactly 2 members
conversationSchema.pre('save', function(next) {
  if (this.participants.length !== 2) {
    return next(new Error('Conversation must have exactly 2 participants'));
  }
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);