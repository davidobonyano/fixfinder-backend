const Job = require('../models/Job');
const User = require('../models/User');
const Professional = require('../models/Professional');
const Notification = require('../models/Notification');
const { uploadToCloudinary } = require('../config/cloudinary');
const { validationResult } = require('express-validator');
const { calculateDistance } = require('../utils/locationService');

// @desc    Create a new job
// @route   POST /api/jobs
// @access  Private (User only)
const createJob = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      category,
      location,
      budget,
      preferredDate,
      preferredTime,
      urgency,
      media
    } = req.body;

    // Create job
    const job = new Job({
      title,
      description,
      category,
      location,
      budget,
      preferredDate,
      preferredTime,
      urgency,
      client: req.user.id,
      media: media || []
    });

    await job.save();

    // Populate client details
    await job.populate('client', 'name email phone');

    // Notify relevant professionals about new job
    await notifyRelevantProfessionals(job);

    res.status(201).json({
      success: true,
      message: 'Job created successfully',
      data: job
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all jobs for a user
// @route   GET /api/jobs/my-jobs
// @access  Private
const getMyJobs = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    let query = { client: userId };
    if (status) {
      query.status = status;
    }

    const jobs = await Job.find(query)
      .populate('professional', 'name category rating location phone')
      .populate('applications.professional', 'name category rating location')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Job.countDocuments(query);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get job feed for professionals
// @route   GET /api/jobs/feed
// @access  Private (Professional only)
const getJobFeed = async (req, res) => {
  try {
    const { q, service, category, city, state, urgency, scope = 'nearby', latitude, longitude, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    // Get professional's details (by professional id or by user id)
    let professional = await Professional.findById(userId);
    if (!professional) {
      professional = await Professional.findOne({ user: userId });
    }
    if (!professional) {
      return res.status(404).json({ success: false, message: 'Professional not found' });
    }

    // Get user location for proximity-based sorting
    const user = await User.findById(userId).select('location');
    let userLat = latitude ? parseFloat(latitude) : user.location?.latitude;
    let userLon = longitude ? parseFloat(longitude) : user.location?.longitude;
    
    let query = {
      status: { $in: ['Pending', 'Open'] },
      isActive: { $ne: false },
      client: { $ne: userId }
    };

    // Filter by category ONLY if explicitly provided via query
    const preferredCategory = (service && service.trim()) || (category && category.trim());
    if (preferredCategory) {
      query.category = preferredCategory;
    }

    // Apply search (title/description)
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [{ title: regex }, { description: regex }];
    }

    // Filter by location
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;

    // If scope=all, do not restrict by professional's location by default
    if (scope !== 'all') {
      if (!city && !state) {
        const proCity = professional.location && (professional.location.city || professional.city);
        const proState = professional.location && (professional.location.state || professional.state);
        if (proState) query['location.state'] = proState;
      }
    }

    // Filter by urgency
    if (urgency) query.urgency = urgency;

    // Get all matching jobs
    let jobs = await Job.find(query)
      .populate('client', 'name email phone')
      .lean();

    // Calculate distance and sort by proximity if user has location
    if (userLat && userLon && scope !== 'all') {
      jobs = jobs
        .map(job => {
          const jobLat = job.location?.coordinates?.lat;
          const jobLon = job.location?.coordinates?.lng;
          
          if (jobLat && jobLon) {
            const distance = calculateDistance(userLat, userLon, jobLat, jobLon);
            return { ...job, distance };
          }
          return { ...job, distance: Infinity };
        })
        .sort((a, b) => {
          // Prioritize urgent jobs, then by distance
          if (a.urgency === 'Urgent' && b.urgency !== 'Urgent') return -1;
          if (b.urgency === 'Urgent' && a.urgency !== 'Urgent') return 1;
          return a.distance - b.distance;
        });
    } else {
      // Sort by urgency and date
      jobs.sort((a, b) => {
        if (a.urgency === 'Urgent' && b.urgency !== 'Urgent') return -1;
        if (b.urgency === 'Urgent' && a.urgency !== 'Urgent') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    // Apply pagination
    const total = jobs.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedJobs = jobs.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedJobs,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total
      },
      userLocation: userLat && userLon ? { latitude: userLat, longitude: userLon } : null
    });
  } catch (error) {
    console.error('Get job feed error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Apply to a job
// @route   POST /api/jobs/:id/apply
// @access  Private (Professional only)
const applyToJob = async (req, res) => {
  try {
    const { proposal, proposedPrice, estimatedDuration } = req.body;
    const jobId = req.params.id;
    const professionalId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if already applied
    const existingApplication = job.applications.find(
      app => app.professional.toString() === professionalId
    );

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied to this job'
      });
    }

    // Add application
    job.applications.push({
      professional: professionalId,
      proposal,
      proposedPrice,
      estimatedDuration
    });

    await job.save();

    // Notify client about new application
    await createNotification({
      recipient: job.client,
      type: 'job_application',
      title: 'New Job Application',
      message: `A professional has applied to your job: ${job.title}`,
      data: {
        jobId: job._id,
        professionalId
      }
    }, req);

    res.json({
      success: true,
      message: 'Application submitted successfully'
    });
  } catch (error) {
    console.error('Apply to job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Accept a job application
// @route   POST /api/jobs/:id/accept/:applicationId
// @access  Private (User only)
const acceptApplication = async (req, res) => {
  try {
    const { jobId, applicationId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user owns the job
    if (job.client.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept applications for this job'
      });
    }

    // Find the application
    const application = job.applications.id(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Accept the application
    application.status = 'Accepted';
    job.professional = application.professional;
    job.status = 'In Progress';

    // Reject other applications
    job.applications.forEach(app => {
      if (app._id.toString() !== applicationId) {
        app.status = 'Rejected';
      }
    });

    await job.save();

    // Notify professional about acceptance
    await createNotification({
      recipient: application.professional,
      type: 'job_accepted',
      title: 'Job Application Accepted',
      message: `Your application for "${job.title}" has been accepted!`,
      data: {
        jobId: job._id
      }
    }, req);

    res.json({
      success: true,
      message: 'Application accepted successfully'
    });
  } catch (error) {
    console.error('Accept application error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Complete a job
// @route   POST /api/jobs/:id/complete
// @access  Private
const completeJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check authorization
    const isClient = job.client.toString() === userId;
    const isProfessional = job.professional && job.professional.toString() === userId;

    if (!isClient && !isProfessional) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to complete this job'
      });
    }

    job.status = 'Completed';
    job.completedAt = new Date();
    await job.save();

    // Notify the other party
    const recipientId = isClient ? job.professional : job.client;
    await createNotification({
      recipient: recipientId,
      type: 'job_completed',
      title: 'Job Completed',
      message: `The job "${job.title}" has been marked as completed`,
      data: {
        jobId: job._id
      }
    }, req);

    res.json({
      success: true,
      message: 'Job marked as completed'
    });
  } catch (error) {
    console.error('Complete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Cancel a job
// @route   POST /api/jobs/:id/cancel
// @access  Private
const cancelJob = async (req, res) => {
  try {
    const { reason } = req.body;
    const jobId = req.params.id;
    const userId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check authorization
    const isClient = job.client.toString() === userId;
    const isProfessional = job.professional && job.professional.toString() === userId;

    if (!isClient && !isProfessional) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this job'
      });
    }

    job.status = 'Cancelled';
    job.cancelledAt = new Date();
    job.cancellationReason = reason;
    await job.save();

    // Notify the other party
    const recipientId = isClient ? job.professional : job.client;
    if (recipientId) {
      await createNotification({
        recipient: recipientId,
        type: 'job_cancelled',
        title: 'Job Cancelled',
        message: `The job "${job.title}" has been cancelled`,
        data: {
          jobId: job._id
        }
      }, req);
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get job details
// @route   GET /api/jobs/:id
// @access  Private
const getJobDetails = async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    const job = await Job.findById(jobId)
      .populate('client', 'name email phone')
      .populate('professional', 'name category rating location phone')
      .populate('applications.professional', 'name category rating location');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check authorization
    const isClient = job.client._id.toString() === userId;
    const isProfessional = job.professional && job.professional._id.toString() === userId;
    const hasApplied = job.applications.some(app => 
      app.professional._id.toString() === userId
    );

    if (!isClient && !isProfessional && !hasApplied) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this job'
      });
    }

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function to notify relevant professionals
const notifyRelevantProfessionals = async (job) => {
  try {
    const professionals = await Professional.find({
      category: job.category,
      'serviceAreas': {
        $in: [job.location.city, job.location.state]
      },
      isActive: true
    }).select('_id');

    const notifications = professionals.map(professional => ({
      recipient: professional._id,
      type: 'job_application',
      title: 'New Job Available',
      message: `A new ${job.category} job is available in ${job.location.city}`,
      data: {
        jobId: job._id
      }
    }));

    await Notification.insertMany(notifications);
  } catch (error) {
    console.error('Notify professionals error:', error);
  }
};

// Helper function to create notification
const createNotification = async (notificationData, req = null) => {
  try {
    const notification = new Notification(notificationData);
    await notification.save();
    
    // Emit Socket.IO notification
    if (req && req.app) {
      const io = req.app.get('io');
      if (io) {
        io.to(notificationData.recipient.toString()).emit('notification:new', notification);
        console.log(`📤 Socket.IO notification emitted to user ${notificationData.recipient}`);
      }
    }
  } catch (error) {
    console.error('Create notification error:', error);
  }
};

module.exports = {
  createJob,
  getMyJobs,
  getJobFeed,
  applyToJob,
  acceptApplication,
  completeJob,
  cancelJob,
  getJobDetails
};






