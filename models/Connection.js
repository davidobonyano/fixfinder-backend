const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
connectionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for better query performance
connectionSchema.index({ requester: 1, professional: 1 });
connectionSchema.index({ professional: 1, status: 1 });

module.exports = mongoose.model('Connection', connectionSchema);









