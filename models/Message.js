const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'Conversation is required']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  senderType: {
    type: String,
    enum: ['user', 'professional'],
    required: [true, 'Sender type is required']
  },
  content: {
    text: {
      type: String,
      maxlength: [1000, 'Message text cannot exceed 1000 characters']
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number },
      label: { type: String },
      timestamp: { type: Date, default: Date.now }
    },
    contact: {
      name: { type: String },
      phone: { type: String },
      email: { type: String }
    },
    media: [{
      type: {
        type: String,
        enum: ['image', 'video', 'audio', 'document'],
        required: true
      },
      url: {
        type: String,
        required: true
      },
      publicId: String,
      filename: String,
      size: Number
    }]
  },
  messageType: {
    type: String,
    enum: ['text', 'location', 'contact', 'image', 'video', 'audio', 'document', 'system', 'location_share'],
    default: 'text'
  },
  isLocationSharing: {
    type: Boolean,
    default: false
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  jobReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
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
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, createdAt: -1 });

// Virtual for message status
messageSchema.virtual('status').get(function() {
  if (this.isDeleted) return 'deleted';
  if (this.isEdited) return 'edited';
  return 'sent';
});

// Ensure virtual fields are serialized
messageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);