const express = require('express');
const router = express.Router();
const {
  createJob,
  getMyJobs,
  getJobFeed,
  applyToJob,
  acceptApplication,
  completeJob,
  cancelJob,
  getJobDetails,
  createJobRequestInChat,
  acceptJobRequest,
  proMarkCompleted,
  confirmJobCompletion
} = require('../controllers/jobController');
const { protect } = require('../middleware/authMiddleware');
const { body } = require('express-validator');

// Validation middleware
const createJobValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required'),
  body('location.address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  body('location.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('location.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('budget.min')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a positive number'),
  body('budget.max')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a positive number'),
  body('preferredDate')
    .isISO8601()
    .withMessage('Preferred date must be a valid date'),
  body('preferredTime')
    .isIn(['Morning (6AM-12PM)', 'Afternoon (12PM-6PM)', 'Evening (6PM-10PM)', 'Flexible'])
    .withMessage('Invalid preferred time'),
  body('urgency')
    .isIn(['Regular', 'Urgent'])
    .withMessage('Urgency must be either Regular or Urgent')
];

const applyToJobValidation = [
  body('proposal')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Proposal must be between 10 and 500 characters'),
  body('proposedPrice')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Proposed price must be a positive number'),
  body('estimatedDuration')
    .trim()
    .notEmpty()
    .withMessage('Estimated duration is required')
];

// @route   POST /api/jobs
// @desc    Create a new job
// @access  Private (User only)
router.post('/', protect, createJobValidation, createJob);

// @route   GET /api/jobs/my-jobs
// @desc    Get all jobs for the authenticated user
// @access  Private
router.get('/my-jobs', protect, getMyJobs);

// @route   GET /api/jobs/feed
// @desc    Get job feed for professionals
// @access  Private (Professional only)
router.get('/feed', protect, getJobFeed);

// @route   GET /api/jobs/:id
// @desc    Get job details
// @access  Private
router.get('/:id', protect, getJobDetails);

// @route   POST /api/jobs/:id/apply
// @desc    Apply to a job
// @access  Private (Professional only)
router.post('/:id/apply', protect, applyToJobValidation, applyToJob);

// @route   POST /api/jobs/:id/accept/:applicationId
// @desc    Accept a job application
// @access  Private (User only)
router.post('/:id/accept/:applicationId', protect, acceptApplication);

// @route   POST /api/jobs/:id/complete
// @desc    Complete a job
// @access  Private
router.post('/:id/complete', protect, completeJob);

// @route   POST /api/jobs/:id/cancel
// @desc    Cancel a job
// @access  Private
router.post('/:id/cancel', protect, cancelJob);

// Chat-driven lifecycle
// User creates a job request inside chat
router.post('/chat/:conversationId/request', protect, createJobRequestInChat);
// Pro accepts a job request → in_progress
router.post('/:id/accept-request', protect, acceptJobRequest);
// Pro marks completed (awaits confirmation)
router.post('/:id/complete-by-pro', protect, proMarkCompleted);
// User confirms completion → closed + stats
router.post('/:id/confirm-completion', protect, confirmJobCompletion);

module.exports = router;






