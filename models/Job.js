const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [100, 'Job title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
    maxlength: [1000, 'Job description cannot exceed 1000 characters']
  },
  requirements: {
    type: String,
    trim: true,
    maxlength: [500, 'Requirements cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Service category is required'],
    trim: true
  },
  location: {
    address: {
      type: String,
      required: [true, 'Job address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  budget: {
    min: {
      type: Number,
      required: [true, 'Minimum budget is required'],
      min: [0, 'Budget cannot be negative']
    },
    max: {
      type: Number,
      required: [true, 'Maximum budget is required'],
      min: [0, 'Budget cannot be negative']
    }
  },
  preferredDate: {
    type: Date,
    required: [true, 'Preferred date is required']
  },
  preferredTime: {
    type: String,
    required: [true, 'Preferred time is required'],
    enum: ['Morning (6AM-12PM)', 'Afternoon (12PM-6PM)', 'Evening (6PM-10PM)', 'Flexible']
  },
  urgency: {
    type: String,
    required: [true, 'Urgency level is required'],
    enum: ['Regular', 'Urgent'],
    default: 'Regular'
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  lifecycleState: {
    type: String,
    enum: [
      'posted',
      'offer_pending',
      'chat_open',
      'job_requested',
      'job_accepted',
      'in_progress',
      'completed_by_pro',
      'completed_by_user',
      'closed',
      'cancelled'
    ],
    default: 'posted'
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Client is required']
  },
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    default: null
  },
  media: [{
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    publicId: String
  }],
  applications: [{
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Professional',
      required: true
    },
    proposal: {
      type: String,
      required: true,
      maxlength: [500, 'Proposal cannot exceed 500 characters']
    },
    proposedPrice: {
      type: Number,
      required: true,
      min: [0, 'Proposed price cannot be negative']
    },
    estimatedDuration: {
      type: String,
      required: true
    },
    cvUrl: {
      type: String
    },
    cvPublicId: {
      type: String
    },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Rejected'],
      default: 'Pending'
    },
    appliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  reviews: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [500, 'Review comment cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

// Index for efficient queries
jobSchema.index({ client: 1, status: 1 });
jobSchema.index({ professional: 1, status: 1 });
jobSchema.index({ category: 1, location: 1 });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ 'location.city': 1, 'location.state': 1 });

// Calculate average rating when reviews are added
jobSchema.methods.calculateAverageRating = function() {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    this.totalReviews = 0;
  } else {
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.averageRating = Math.round((totalRating / this.reviews.length) * 10) / 10;
    this.totalReviews = this.reviews.length;
  }
  return this.averageRating;
};

// Virtual for job duration
jobSchema.virtual('duration').get(function() {
  if (this.completedAt && this.createdAt) {
    return Math.ceil((this.completedAt - this.createdAt) / (1000 * 60 * 60 * 24)); // days
  }
  return null;
});

// Ensure virtual fields are serialized
jobSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Job', jobSchema);






