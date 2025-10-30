const Job = require('../models/Job');
const Connection = require('../models/Connection');
const Review = require('../models/Review');
const Professional = require('../models/Professional');

exports.getOverview = async (req, res) => {
  try {
    const userId = req.user.id;

    const [totalJobs, activeJobs, completedJobs] = await Promise.all([
      Job.countDocuments({ professional: userId }),
      Job.countDocuments({ professional: userId, status: 'in_progress' }),
      Job.countDocuments({ professional: userId, status: 'completed' })
    ]);

    const totalEarningsAgg = await Job.aggregate([
      { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$budget', 0] } } } }
    ]);
    const totalEarnings = totalEarningsAgg[0]?.total || 0;

    const reviewAgg = await Review.aggregate([
      { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId) } },
      { $group: { _id: null, rating: { $avg: { $ifNull: ['$rating', 0] } }, count: { $sum: 1 } } }
    ]);

    const rating = reviewAgg[0]?.rating || 0;
    const reviewCount = reviewAgg[0]?.count || 0;

    res.json({
      success: true,
      data: { totalJobs, activeJobs, completedJobs, totalEarnings, rating, reviewCount }
    });
  } catch (e) {
    console.error('Pro Overview error', e);
    res.status(500).json({ success: false, message: 'Failed to load overview' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Jobs per month (last 6 months)
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setDate(1);

    const [jobsPerMonth, earningsPerMonth, connectionsCount, totalJobs, totalEarnings, reviewStats] = await Promise.all([
      // Jobs per month
      Job.aggregate([
        { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId), createdAt: { $gte: since } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } }
      ]),
      
      // Earnings per month
      Job.aggregate([
        { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId), status: 'completed', updatedAt: { $gte: since } } },
        { $group: { _id: { y: { $year: '$updatedAt' }, m: { $month: '$updatedAt' } }, total: { $sum: { $ifNull: ['$budget', 0] } } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } }
      ]),
      
      // Connections count
      Connection.countDocuments({ $or: [ { requester: userId }, { professional: userId } ], status: 'accepted' }),
      
      // Total jobs
      Job.countDocuments({ professional: userId }),
      
      // Total earnings
      Job.aggregate([
        { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId), status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$budget', 0] } } } }
      ]),
      
      // Review stats
      Review.aggregate([
        { $match: { professional: require('mongoose').Types.ObjectId.createFromHexString(userId) } },
        { $group: { _id: null, averageRating: { $avg: { $ifNull: ['$rating', 0] } }, reviewCount: { $sum: 1 } } }
      ])
    ]);

    const totalEarningsValue = totalEarnings[0]?.total || 0;
    const averageRating = reviewStats[0]?.averageRating || 0;
    const reviewCount = reviewStats[0]?.reviewCount || 0;

    res.json({ 
      success: true, 
      data: { 
        jobsPerMonth, 
        earningsPerMonth, 
        connectionsCount,
        totalJobs,
        totalEarnings: totalEarningsValue,
        averageRating,
        reviewCount
      } 
    });
  } catch (e) {
    console.error('Pro Analytics error', e);
    res.status(500).json({ success: false, message: 'Failed to load analytics' });
  }
};

// List jobs for the professional (by current user)
exports.getMyJobsForPro = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    // Map user -> professional id
    const pro = await Professional.findOne({ user: userId }).select('_id');
    if (!pro) return res.status(404).json({ success: false, message: 'Professional profile not found' });

    const query = { professional: pro._id };
    if (status) query.status = status;

    const jobs = await Job.find(query)
      .populate('client', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    const counts = await Job.aggregate([
      { $match: { professional: pro._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const byStatus = counts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {});

    res.json({ success: true, data: { jobs, counts: byStatus, professionalId: pro._id } });
  } catch (e) {
    console.error('Pro getMyJobs error', e);
    res.status(500).json({ success: false, message: 'Failed to load pro jobs' });
  }
};






