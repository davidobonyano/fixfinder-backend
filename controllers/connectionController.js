const Connection = require('../models/Connection');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Professional = require('../models/Professional');

// Send connection request
const sendConnectionRequest = async (req, res) => {
  try {
    console.log('🔍 Connection request received:', req.body);
    console.log('👤 User ID:', req.user.id);
    
    const { professionalId } = req.body;
    const userId = req.user.id;

    // Get user details
    const user = await User.findById(userId).select('name email');
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    console.log('✅ User found:', user.name);

    // Check if professional exists
    const professional = await Professional.findById(professionalId);
    if (!professional) {
      console.log('❌ Professional not found:', professionalId);
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }
    console.log('✅ Professional found:', professional.name);

    // Check if connection request already exists
    const existingRequest = await Connection.findOne({
      requester: userId,
      professional: professionalId,
      status: 'pending'
    });

    if (existingRequest) {
      console.log('⚠️ Connection request already exists');
      return res.status(400).json({
        success: false,
        message: 'Connection request already sent'
      });
    }

    // Check if users are already connected
    const existingConnection = await Connection.findOne({
      $or: [
        { requester: userId, professional: professionalId, status: 'accepted' },
        { requester: professionalId, professional: userId, status: 'accepted' }
      ]
    });

    if (existingConnection) {
      console.log('⚠️ Users are already connected');
      return res.status(400).json({
        success: false,
        message: 'You are already connected with this professional'
      });
    }

    // Create connection request
    const connectionRequest = new Connection({
      requester: userId,
      professional: professionalId,
      status: 'pending'
    });

    await connectionRequest.save();
    console.log('✅ Connection request saved:', connectionRequest._id);

    // Create notification for professional
    const notification = new Notification({
      recipient: professional.user,
      type: 'connection_request',
      title: 'New Connection Request',
      message: `${user.name} wants to connect with you`,
      data: {
        requesterId: userId,
        requesterName: user.name,
        connectionRequestId: connectionRequest._id
      }
    });

    await notification.save();
    console.log('✅ Notification created:', notification._id);

    res.status(201).json({
      success: true,
      message: 'Connection request sent successfully',
      data: {
        requestId: connectionRequest._id
      }
    });

  } catch (error) {
    console.error('❌ Error sending connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Accept connection request
const acceptConnectionRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;
    

    // Get user details
    const user = await User.findById(userId).select('name email');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the connection request
    const connectionRequest = await Connection.findById(requestId)
      .populate('requester', 'name email')
      .populate('professional');

    if (!connectionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }

    // Check if the current user is the professional
    if (connectionRequest.professional.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to accept this request'
      });
    }

    // Update connection status
    connectionRequest.status = 'accepted';
    await connectionRequest.save();

    // Create notification for requester
    const notification = new Notification({
      recipient: connectionRequest.requester._id,
      type: 'connection_accepted',
      title: 'Connection Request Accepted',
      message: `${user.name} has accepted your connection request. You can now chat!`,
      data: {
        professionalId: connectionRequest.professional._id,
        professionalName: user.name,
        connectionRequestId: connectionRequest._id
      }
    });

    await notification.save();

    res.json({
      success: true,
      message: 'Connection request accepted',
      data: {
        connectionId: connectionRequest._id
      }
    });

  } catch (error) {
    console.error('Error accepting connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Reject connection request
const rejectConnectionRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user.id;

    // Find the connection request
    const connectionRequest = await Connection.findById(requestId)
      .populate('requester', 'name email')
      .populate('professional');

    if (!connectionRequest) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }

    // Check if the current user is the professional
    if (connectionRequest.professional.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to reject this request'
      });
    }

    // Update connection status
    connectionRequest.status = 'rejected';
    await connectionRequest.save();

    res.json({
      success: true,
      message: 'Connection request rejected'
    });

  } catch (error) {
    console.error('Error rejecting connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user's outgoing connection requests (requests they sent)
const getUserConnectionRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get pending connection requests sent by this user
    const connectionRequests = await Connection.find({
      requester: userId,
      status: 'pending'
    }).populate('professional', 'name email profilePicture');

    console.log('📋 User connection requests:', connectionRequests.length);

    res.json({
      success: true,
      data: connectionRequests
    });

  } catch (error) {
    console.error('Error fetching user connection requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get connection requests for professional
const getConnectionRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find professional by user ID (if exists)
    const professional = await Professional.findOne({ user: userId });
    
    if (!professional) {
      // If no professional profile exists, return empty array for now
      // This allows the frontend to work before professional dashboard is created
      console.log('📝 No professional profile found for user:', userId, '- returning empty requests');
      return res.json({
        success: true,
        data: []
      });
    }

    // Get pending connection requests
    const connectionRequests = await Connection.find({
      professional: professional._id,
      status: 'pending'
    }).populate('requester', 'name email profilePicture');

    res.json({
      success: true,
      data: {
        requests: connectionRequests
      }
    });

  } catch (error) {
    console.error('Error fetching connection requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all connections (accepted requests)
const getConnections = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all accepted connections where this user is either the requester or the professional
    // First, find the user's professional profile if they are a professional
    const userProfessional = await Professional.findOne({ user: userId });
    
    let query = { requester: userId, status: 'accepted' };
    
    // If user is a professional, also include connections where they are the professional
    if (userProfessional) {
      query = {
        $or: [
          { requester: userId, status: 'accepted' },
          { professional: userProfessional._id, status: 'accepted' }
        ]
      };
    }
    
    const connections = await Connection.find(query)
    .populate('requester', 'name email')
    .populate('professional', 'name email')
    .sort({ createdAt: -1 });

    console.log('🔗 Found connections:', connections.length);

    res.json({
      success: true,
      data: connections
    });

  } catch (error) {
    console.error('Error getting connections:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Remove connection (unfriend)
const removeConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user.id;

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    // Check if user is part of this connection
    if (connection.requester.toString() !== userId && connection.professional.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove this connection'
      });
    }

    await Connection.findByIdAndDelete(connectionId);

    res.json({
      success: true,
      message: 'Connection removed successfully'
    });

  } catch (error) {
    console.error('Error removing connection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  getUserConnectionRequests,
  getConnectionRequests,
  getConnections,
  removeConnection
};


