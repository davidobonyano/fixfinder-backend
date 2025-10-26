const express = require('express');
const router = express.Router();
const {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  getUserConnectionRequests,
  getConnectionRequests,
  getConnections,
  removeConnection
} = require('../controllers/connectionController');
const { protect } = require('../middleware/authMiddleware');
const Connection = require('../models/Connection');

// All routes require authentication
router.use(protect);

// Send connection request
router.post('/request', sendConnectionRequest);

// Accept connection request
router.post('/accept', acceptConnectionRequest);

// Reject connection request
router.post('/reject', rejectConnectionRequest);

// Get connection requests for professional
router.get('/requests', getConnectionRequests);

// Get user's outgoing connection requests
router.get('/my-requests', getUserConnectionRequests);

// Get all connections (accepted requests)
router.get('/', getConnections);

// Remove connection (unfriend)
router.delete('/:connectionId', removeConnection);

// Cancel a connection request
router.delete('/cancel/:professionalId', protect, async (req, res) => {
  try {
    const { professionalId } = req.params;
    const userId = req.user.id;

    console.log('🚫 Cancel connection request:', { userId, professionalId });

    // Find and delete the pending connection request
    const connectionRequest = await Connection.findOneAndDelete({
      requester: userId,
      professional: professionalId,
      status: 'pending'
    });

    if (!connectionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found or already processed'
      });
    }

    console.log('✅ Connection request cancelled:', connectionRequest._id);

    res.json({
      success: true,
      message: 'Connection request cancelled successfully'
    });
  } catch (error) {
    console.error('❌ Error cancelling connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel connection request'
    });
  }
});

module.exports = router;


