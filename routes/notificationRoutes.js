const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationCount,
  createNotification
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');
const { body } = require('express-validator');

// Validation middleware
const createNotificationValidation = [
  body('recipient')
    .isMongoId()
    .withMessage('Invalid recipient ID'),
  body('type')
    .isIn([
      'job_application',
      'job_accepted',
      'job_rejected',
      'job_completed',
      'job_cancelled',
      'new_message',
      'review_received',
      'profile_verified',
      'payment_received',
      'system_announcement',
      'reminder',
      'connection_request',
      'connection_accepted',
      'connection_rejected'
    ])
    .withMessage('Invalid notification type'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level')
];

// @route   GET /api/notifications
// @desc    Get all notifications for user
// @access  Private
router.get('/', protect, getNotifications);

// @route   GET /api/notifications/count
// @desc    Get notification count
// @access  Private
router.get('/count', protect, getNotificationCount);

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', protect, markAsRead);

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', protect, markAllAsRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/:id', protect, deleteNotification);

// @route   POST /api/notifications
// @desc    Create notification (internal use)
// @access  Private (Admin/System)
router.post('/', protect, createNotificationValidation, createNotification);

module.exports = router;






