const Job = require('../models/Job');
const User = require('../models/User');
const Professional = require('../models/Professional');
const Notification = require('../models/Notification');
const Conversation = require('../models/Conversation');
const { uploadToCloudinary, cloudinary } = require('../config/cloudinary');
const { uploadBufferToCloudinary } = require('../utils');
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
      requirements,
      category,
      location,
      budget,
      preferredDate,
      preferredTime,
      urgency,
      media
    } = req.body;

    // Normalize multipart dotted fields into nested objects when needed
    const normalizedLocation = location && typeof location === 'object' ? location : {
      address: req.body['location.address'] || undefined,
      city: req.body['location.city'] || undefined,
      state: req.body['location.state'] || undefined,
      coordinates: (req.body['location.coordinates.lat'] && req.body['location.coordinates.lng']) ? {
        lat: Number(req.body['location.coordinates.lat']),
        lng: Number(req.body['location.coordinates.lng'])
      } : undefined
    };
    const normalizedBudget = budget && typeof budget === 'object' ? budget : {
      min: req.body['budget.min'] != null && req.body['budget.min'] !== '' ? Number(req.body['budget.min']) : undefined,
      max: req.body['budget.max'] != null && req.body['budget.max'] !== '' ? Number(req.body['budget.max']) : undefined
    };

    // Create job
    // Handle optional single image upload from multipart
    let finalMedia = [];
    try {
      const file = (Array.isArray(req.files) ? req.files : []).find(f => (f.mimetype || '').startsWith('image/'));
      if (file && file.buffer) {
        let result = null;
        try {
          result = await uploadBufferToCloudinary(file.buffer, {
            folder: 'fixfinder/jobs',
            resource_type: 'image',
            timeout: 60000
          });
        } catch (e1) {
          // Quick retry once on timeout/network glitches
          if (String(e1?.message || '').toLowerCase().includes('timeout')) {
            result = await uploadBufferToCloudinary(file.buffer, {
              folder: 'fixfinder/jobs',
              resource_type: 'image',
              timeout: 60000
            });
          } else {
            throw e1;
          }
        }
        if (result?.secure_url) {
          finalMedia.push({ type: 'image', url: result.secure_url, publicId: result.public_id });
        }
      }
    } catch (e) {
      console.warn('Job image upload skipped:', e?.message || e);
    }

    const job = new Job({
      title,
      description,
      requirements,
      category,
      location: normalizedLocation,
      budget: normalizedBudget,
      preferredDate,
      preferredTime,
      urgency,
      client: req.user.id,
      media: finalMedia.length ? finalMedia : (Array.isArray(media) ? media : [])
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
    const { proposal, proposedPrice, estimatedDuration, cvUrl } = req.body;
    const jobId = req.params.id;
    const professionalUserId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Map current user -> Professional profile
    const pro = await Professional.findOne({ user: professionalUserId }).select('_id');
    if (!pro) {
      return res.status(404).json({ success: false, message: 'Professional profile not found' });
    }

    // Check if already applied
    const existingApplication = job.applications.find(app => app.professional && app.professional.toString() === pro._id.toString());

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied to this job'
      });
    }

    // Handle optional CV file upload (field name: "cv")
    let finalCvUrl = cvUrl || undefined;
    let finalCvPublicId = undefined;
    try {
      const file = (Array.isArray(req.files) ? req.files : [])
        .find(f => String(f.fieldname).toLowerCase() === 'cv');
      if (file && file.buffer) {
        // Validate type and size: PDF only, <= 10MB
        const isPdf = (file.mimetype || '').toLowerCase() === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf');
        const maxBytes = 2 * 1024 * 1024; // 2MB
        if (!isPdf) {
          return res.status(400).json({ success: false, message: 'Invalid CV format. Please upload a PDF file.' });
        }
        if (file.size && file.size > maxBytes) {
          return res.status(400).json({ success: false, message: 'CV file too large. Max 2MB allowed.' });
        }
        // Accept PDFs and docs as raw resource type
        const result = await uploadBufferToCloudinary(file.buffer, {
          folder: 'fixfinder/cv',
          resource_type: 'raw',
          format: 'pdf'
        });
        finalCvUrl = result.secure_url || result.url;
        finalCvPublicId = result.public_id;
      }
    } catch (e) {
      console.warn('CV upload skipped:', e?.message || e);
    }

    // Add application
    job.applications.push({
      professional: pro._id,
      proposal,
      proposedPrice,
      estimatedDuration,
      cvUrl: finalCvUrl,
      cvPublicId: finalCvPublicId
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
        professionalId: pro._id
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

    // Accept the application and set professional
    application.status = 'Accepted';
    job.professional = application.professional;
    // Do NOT start work yet; move lifecycle to chat_open and keep status Pending
    job.lifecycleState = 'chat_open';

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
      message: `Your application for "${job.title}" has been accepted! Open chat to proceed.`,
      data: {
        jobId: job._id
      }
    }, req);

    // Socket: emit job:update to participants
    if (req && req.app) {
      const io = req.app.get('io');
      if (io) {
        if (job.conversation) {
          io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
        }
        try {
          const clientUserId = job.client?.toString();
          let proUserId = null;
          if (job.professional) {
            const proDoc = await Professional.findById(job.professional).select('user');
            proUserId = proDoc?.user ? proDoc.user.toString() : null;
          }
          if (clientUserId) io.to(clientUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
          if (proUserId) io.to(proUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
        } catch (_) {}
      }
    }

    res.json({
      success: true,
      message: 'Application accepted. Open chat to proceed.',
      data: job
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
    let isProfessional = false;
    if (job.professional) {
      const proByUser = await Professional.findOne({ user: userId }).select('_id');
      if (proByUser && job.professional.toString() === proByUser._id.toString()) {
        isProfessional = true;
      }
    }

    if (!isClient && !isProfessional) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this job'
      });
    }

    job.status = 'Cancelled';
    job.cancelledAt = new Date();
    job.cancellationReason = reason;
    job.lifecycleState = 'cancelled';
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

    // Socket: broadcast update to conversation room
    if (req && req.app) {
      const io = req.app.get('io');
      if (io && job.conversation) {
        io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
        // Also emit to user-level rooms for both participants
        try {
          const clientUserId = job.client?.toString();
          let proUserId = null;
          if (job.professional) {
            const proDoc = await Professional.findById(job.professional).select('user');
            proUserId = proDoc?.user ? proDoc.user.toString() : null;
          }
          if (clientUserId) io.to(clientUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
          if (proUserId) io.to(proUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
        } catch (_) {}
      }
    }

    res.json({
      success: true,
      message: 'Job cancelled successfully',
      data: job
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

// @desc    Delete a cancelled job (remove from lists)
// @route   DELETE /api/jobs/:id
// @access  Private (client or assigned pro)
const deleteJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (job.status !== 'Cancelled') return res.status(400).json({ success: false, message: 'Only cancelled jobs can be deleted' });

    // Auth: client or assigned professional user
    let authorized = job.client.toString() === userId;
    if (!authorized && job.professional) {
      const proByUser = await Professional.findOne({ user: userId }).select('_id');
      if (proByUser && job.professional.toString() === proByUser._id.toString()) {
        authorized = true;
      }
    }
    if (!authorized) return res.status(403).json({ success: false, message: 'Not authorized to delete this job' });

    // Clear conversation link if set
    if (job.conversation) {
      await Conversation.findByIdAndUpdate(job.conversation, { $unset: { job: 1 } });
    }

    await Job.deleteOne({ _id: jobId });

    // Emit to conversation and user rooms to clear header chips
    if (req && req.app) {
      const io = req.app.get('io');
      if (io) {
        if (job.conversation) {
          io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job: null });
        }
        try {
          const clientUserId = job.client?.toString();
          let proUserId = null;
          if (job.professional) {
            const proDoc = await Professional.findById(job.professional).select('user');
            proUserId = proDoc?.user ? proDoc.user.toString() : null;
          }
          if (clientUserId) io.to(clientUserId).emit('job:update', { conversationId: job.conversation?.toString(), job: null });
          if (proUserId) io.to(proUserId).emit('job:update', { conversationId: job.conversation?.toString(), job: null });
        } catch (_) {}
      }
    }

    return res.json({ success: true, message: 'Job deleted' });
  } catch (error) {
    console.error('deleteJob error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get job details
// @route   GET /api/jobs/:id
// @access  Private
const getJobDetails = async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    let job = await Job.findById(jobId)
      .populate('client', 'name email phone')
      .populate('professional', 'name category rating location phone user')
      .populate('applications.professional', 'name category rating location user');

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
      app.professional && app.professional._id && app.professional._id.toString() === userId
    );

    if (!isClient && !isProfessional && !hasApplied) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this job'
      });
    }

    // Fallback enrichment: if any application has a missing Professional doc due to legacy user id storage
    const jobObj = job.toObject();
    if (Array.isArray(jobObj.applications)) {
      for (let i = 0; i < jobObj.applications.length; i++) {
        const app = jobObj.applications[i];
        if (!app.professional || (!app.professional.name && !app.professional.user)) {
          // Try map professional by user id equal to stored ObjectId
          try {
            const proDoc = await Professional.findOne({ user: app.professional }).select('name category rating location user');
            if (proDoc) {
              jobObj.applications[i].professional = proDoc.toObject();
            }
          } catch(_) {}
        }
      }
    }

    res.json({
      success: true,
      data: jobObj
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

// ---- Chat-driven lifecycle endpoints ----

// @desc    User creates a job request from inside chat (must specify conversationId)
// @route   POST /api/jobs/chat/:conversationId/request
// @access  Private (User only)
const createJobRequestInChat = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      category,
      location,
      budget,
      preferredDate,
      preferredTime,
      urgency
    } = req.body || {};

    const convo = await Conversation.findById(conversationId).populate('participants.user', 'name');
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const isParticipant = convo.participants.some(p => p.user && p.user._id.toString() === userId);
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Not a participant' });

    // Determine the professional (by user linkage)
    const other = convo.participants.find(p => p.user && p.user._id.toString() !== userId);
    if (!other) return res.status(400).json({ success: false, message: 'Other participant not found' });
    // Find Professional by user id
    let professional = await Professional.findOne({ user: other.user._id });
    if (!professional) return res.status(400).json({ success: false, message: 'Professional profile not found' });

    const job = new Job({
      title,
      description,
      category,
      location,
      budget,
      preferredDate,
      preferredTime,
      urgency,
      client: userId,
      professional: professional._id,
      conversation: conversationId,
      status: 'Pending',
      lifecycleState: 'job_requested'
    });
    await job.save();

    // Link conversation to this job (optional early link)
    await Conversation.findByIdAndUpdate(conversationId, { $set: { job: job._id } });

    await createNotification({
      recipient: professional._id,
      type: 'job_requested',
      title: 'New Job Request',
      message: `Job request: ${title}`,
      data: { jobId: job._id, conversationId }
    }, req);

    // Socket: broadcast update to conversation room
    if (req && req.app) {
      const io = req.app.get('io');
      if (io) {
        if (job.conversation) {
          io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
        }
        // Also emit to user-level rooms for both participants
        try {
          const clientUserId = userId?.toString();
          const proUserId = professional.user?.toString();
          if (clientUserId) io.to(clientUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
          if (proUserId) io.to(proUserId).emit('job:update', { conversationId: job.conversation?.toString(), job });
        } catch (_) {}
      }
    }

    return res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error('createJobRequestInChat error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Pro accepts job request → in_progress
// @route   POST /api/jobs/:id/accept-request
// @access  Private (Professional only)
const acceptJobRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Ensure this pro owns the professional profile linked on job
    const proByUser = await Professional.findOne({ user: userId }).select('_id');
    if (!proByUser || !job.professional || job.professional.toString() !== proByUser._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to accept this job' });
    }

    job.status = 'In Progress';
    job.lifecycleState = 'in_progress';
    await job.save();

    // Ensure conversation link exists
    if (job.conversation) {
      await Conversation.findByIdAndUpdate(job.conversation, { $set: { job: job._id } });
    }

    await createNotification({
      recipient: job.client,
      type: 'job_accepted',
      title: 'Job Accepted',
      message: `Your job "${job.title}" has been accepted and is now in progress`,
      data: { jobId: job._id }
    }, req);

    // Socket: broadcast update to conversation room
    if (req && req.app) {
      const io = req.app.get('io');
      if (io && job.conversation) {
        io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
      }
    }

    return res.json({ success: true, message: 'Job accepted', data: job });
  } catch (error) {
    console.error('acceptJobRequest error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Pro marks job completed (awaits user confirmation)
// @route   POST /api/jobs/:id/complete-by-pro
// @access  Private (Professional only)
const proMarkCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const proByUser = await Professional.findOne({ user: userId }).select('_id');
    if (!proByUser || !job.professional || job.professional.toString() !== proByUser._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to complete this job' });
    }

    job.lifecycleState = 'completed_by_pro';
    await job.save();

    await createNotification({
      recipient: job.client,
      type: 'job_completed_by_pro',
      title: 'Work Completed',
      message: `Pro marked the job "${job.title}" as completed. Please confirm.`,
      data: { jobId: job._id }
    }, req);

    // Socket: broadcast update to conversation room
    if (req && req.app) {
      const io = req.app.get('io');
      if (io && job.conversation) {
        io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
      }
    }

    return res.json({ success: true, message: 'Marked completed by pro', data: job });
  } catch (error) {
    console.error('proMarkCompleted error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    User confirms completion → closed; increments pro stats
// @route   POST /api/jobs/:id/confirm-completion
// @access  Private (User only)
const confirmJobCompletion = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (job.client.toString() !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });

    job.status = 'Completed';
    job.lifecycleState = 'closed';
    job.completedAt = new Date();
    await job.save();

    // Increment professional completion counter
    if (job.professional) {
      await Professional.findByIdAndUpdate(job.professional, { $inc: { completedJobs: 1 } });
    }

    await createNotification({
      recipient: job.professional,
      type: 'job_closed',
      title: 'Job Closed',
      message: `The job "${job.title}" has been confirmed completed.`,
      data: { jobId: job._id }
    }, req);

    // Socket: broadcast update to conversation room
    if (req && req.app) {
      const io = req.app.get('io');
      if (io && job.conversation) {
        io.to(job.conversation.toString()).emit('job:update', { conversationId: job.conversation.toString(), job });
      }
    }

    return res.json({ success: true, message: 'Job confirmed and closed', data: job });
  } catch (error) {
    console.error('confirmJobCompletion error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get a signed CV URL for an application (short-lived)
// @route   GET /api/jobs/:id/applications/:applicationId/cv-url
// @access  Private (job client, pro applicant, assigned pro, or admin)
const getApplicationCvUrl = async (req, res) => {
  try {
    const { id, applicationId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(id)
      .populate('client', '_id')
      .populate('professional', '_id user')
      .populate('applications.professional', '_id user');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const application = job.applications.id(applicationId);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

    // Authorization: job client, assigned professional user, pro who applied, or admin
    let isAuthorized = false;
    if (job.client && job.client._id.toString() === userId) isAuthorized = true;
    // Assigned pro user
    if (!isAuthorized && job.professional) {
      try {
        const proAssigned = await Professional.findById(job.professional._id).select('user');
        if (proAssigned?.user && proAssigned.user.toString() === userId) isAuthorized = true;
      } catch (_) {}
    }
    // Applicant pro user
    if (!isAuthorized && application.professional) {
      try {
        const proApplicant = await Professional.findById(application.professional._id).select('user');
        if (proApplicant?.user && proApplicant.user.toString() === userId) isAuthorized = true;
      } catch (_) {}
    }
    // Admin
    if (!isAuthorized) {
      try {
        const adminUser = await User.findById(userId).select('role');
        if (adminUser && adminUser.role === 'admin') isAuthorized = true;
      } catch (_) {}
    }

    if (!isAuthorized) return res.status(403).json({ success: false, message: 'Not authorized' });

    const publicId = application.cvPublicId;
    const directUrl = application.cvUrl;
    if (!publicId && !directUrl) {
      return res.status(404).json({ success: false, message: 'No CV available for this application' });
    }

    // If publicId exists, generate private (signed) download URL; else fallback to stored URL
    let url = directUrl;
    if (publicId) {
      const expiresAt = Math.floor(Date.now() / 1000) + 120; // 2 minutes
      const baseId = String(publicId).replace(/\.[a-z0-9]+$/i, '');
      // Derive file extension from stored direct url if possible
      let ext = 'pdf';
      try {
        const m = (directUrl || '').match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
        if (m && m[1]) ext = m[1].toLowerCase();
      } catch (_) {}
      // 1) Try signed delivery URL for raw/upload assets, include format
      try {
        url = cloudinary.url(baseId, { resource_type: 'raw', secure: true, sign_url: true, format: ext });
      } catch (e) {
        console.warn('signed delivery url failed:', e?.message || e);
      }
      // 2) Fallback: private download URL (works for private/authenticated), include format
      if (!url) {
        try {
          url = cloudinary.utils.private_download_url(baseId, ext, { resource_type: 'raw', expires_at: expiresAt });
        } catch (e2) {
          console.warn('private_download_url failed:', e2?.message || e2);
        }
      }
      if (!url && !directUrl) {
        return res.status(404).json({ success: false, message: 'CV asset not available' });
      }
      if (!url) url = directUrl; // last resort
    }

    return res.json({ success: true, url });
  } catch (error) {
    console.error('getApplicationCvUrl error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};


// @desc    Admin: delete an application's CV file
// @route   DELETE /api/jobs/:id/applications/:applicationId/cv
// @access  Private (Admin only)
const deleteApplicationCv = async (req, res) => {
  try {
    const { id, applicationId } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    const app = job.applications.id(applicationId);
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    // Destroy on Cloudinary if we have a public id
    if (app.cvPublicId) {
      try {
        await cloudinary.uploader.destroy(app.cvPublicId, { resource_type: 'raw' });
      } catch (e) {
        console.warn('Cloudinary destroy failed for CV:', e?.message || e);
      }
    }

    app.cvUrl = undefined;
    app.cvPublicId = undefined;
    await job.save();

    return res.json({ success: true, message: 'CV removed from application' });
  } catch (error) {
    console.error('deleteApplicationCv error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete a job application and its CV (if any)
// @route   DELETE /api/jobs/:id/applications/:applicationId
// @access  Private (job client or admin)
const deleteJobApplication = async (req, res) => {
  try {
    const { id, applicationId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(id).populate('client', '_id');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Authorization: job client or admin
    let isAuthorized = job.client && job.client._id && job.client._id.toString() === userId;
    if (!isAuthorized) {
      try {
        const user = await User.findById(userId).select('role');
        if (user && user.role === 'admin') isAuthorized = true;
      } catch (_) {}
    }
    if (!isAuthorized) return res.status(403).json({ success: false, message: 'Not authorized' });

    const application = job.applications.id(applicationId);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

    // Remove CV from Cloudinary if present
    if (application.cvPublicId) {
      try {
        await cloudinary.uploader.destroy(application.cvPublicId, { resource_type: 'raw' });
      } catch (e) {
        console.warn('Cloudinary destroy failed for CV during application delete:', e?.message || e);
      }
    }

    // Remove application subdocument and save
    application.deleteOne();
    await job.save();

    return res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    console.error('deleteJobApplication error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
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
  getJobDetails,
  createJobRequestInChat,
  acceptJobRequest,
  proMarkCompleted,
  confirmJobCompletion,
  deleteJob,
  deleteApplicationCv,
  getApplicationCvUrl,
  deleteJobApplication
};






