const User = require("../models/User");
const Booking = require("../models/Booking");
const Professional = require("../models/Professional");
const Job = require("../models/Job");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Review = require("../models/Review");
const Connection = require("../models/Connection");

exports.getPendingVerifications = async (req, res, next) => {
  try {
    const users = await User.find({ "verification.status": "pending" }).select("name email verification createdAt");
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.getPendingBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ status: "pending" })
      .populate("customer", "name email")
      .populate("professional", "name category")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalProfessionals, totalBookings, pendingVerifications, pendingBookings] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "professional" }),
      Booking.countDocuments(),
      User.countDocuments({ "verification.status": "pending" }),
      Booking.countDocuments({ status: "pending" }),
    ]);
    res.json({ totalUsers, totalProfessionals, totalBookings, pendingVerifications, pendingBookings });
  } catch (err) {
    next(err);
  }
};

// Public admin stats endpoint (no auth required)
exports.getPublicAdminStats = async (req, res, next) => {
  try {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const thisWeek = new Date(now.setDate(now.getDate() - 7));
    const thisMonth = new Date(now.setMonth(now.getMonth() - 1));
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // User Statistics
    const [
      totalUsers,
      totalCustomers,
      totalPros,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      verifiedUsers,
      verifiedProfessionals,
      activeUsersLast24h
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "professional" }),
      User.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      User.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      User.countDocuments({ createdAt: { $gte: oneMonthAgo } }),
      User.countDocuments({ "emailVerification.isVerified": true }),
      Professional.countDocuments({ isVerified: true }),
      User.countDocuments({ "presence.lastSeen": { $gte: oneDayAgo } })
    ]);

    // Professional Statistics
    const [
      totalProfessionals,
      activeProfessionals,
      professionalsWithCompleteProfile
    ] = await Promise.all([
      Professional.countDocuments(),
      Professional.countDocuments({ isActive: true }),
      Professional.countDocuments({ 
        description: { $exists: true, $ne: "" },
        services: { $exists: true, $ne: [] }
      })
    ]);

    // Job Statistics
    const [
      totalJobs,
      activeJobs,
      completedJobs,
      cancelledJobs,
      pendingJobs,
      jobsThisWeek,
      jobsThisMonth
    ] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: "In Progress", lifecycleState: { $ne: "closed" } }),
      Job.countDocuments({ status: "Completed" }),
      Job.countDocuments({ 
        $or: [
          { status: "Cancelled" },
          { lifecycleState: "cancelled" }
        ]
      }),
      Job.countDocuments({ status: "Pending" }),
      Job.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      Job.countDocuments({ createdAt: { $gte: oneMonthAgo } })
    ]);

    // Communication Statistics
    const [
      totalConversations,
      totalMessages,
      messagesToday,
      activeConversations
    ] = await Promise.all([
      Conversation.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      Conversation.countDocuments({ 
        updatedAt: { $gte: oneDayAgo }
      })
    ]);

    // Review Statistics
    const [
      totalReviews,
      averageRating,
      reviewsThisMonth
    ] = await Promise.all([
      Review.countDocuments(),
      Review.aggregate([
        { $group: { _id: null, avg: { $avg: "$rating" } } }
      ]).then(result => result[0]?.avg || 0),
      Review.countDocuments({ createdAt: { $gte: oneMonthAgo } })
    ]);

    // Connection Statistics
    const [
      totalConnections,
      connectionRequests,
      connectionsThisWeek
    ] = await Promise.all([
      Connection.countDocuments({ status: "connected" }),
      Connection.countDocuments({ status: "pending" }),
      Connection.countDocuments({ 
        status: "connected",
        createdAt: { $gte: oneWeekAgo }
      })
    ]);

    // Growth Metrics
    const userGrowth = {
      today: newUsersToday,
      thisWeek: newUsersThisWeek,
      thisMonth: newUsersThisMonth,
      total: totalUsers
    };

    const jobGrowth = {
      thisWeek: jobsThisWeek,
      thisMonth: jobsThisMonth,
      total: totalJobs
    };

    // Calculate completion rate
    const completionRate = totalJobs > 0 
      ? ((completedJobs / totalJobs) * 100).toFixed(1)
      : 0;

    // Response time calculation (recent messages)
    const recentMessages = await Message.find({ 
      createdAt: { $gte: oneDayAgo }
    }).sort({ createdAt: -1 }).limit(100).select('createdAt').lean();

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          customers: totalCustomers,
          professionals: totalPros,
          verified: verifiedUsers,
          activeLast24h: activeUsersLast24h,
          growth: userGrowth
        },
        professionals: {
          total: totalProfessionals,
          verified: verifiedProfessionals,
          active: activeProfessionals,
          withCompleteProfile: professionalsWithCompleteProfile
        },
        jobs: {
          total: totalJobs,
          active: activeJobs,
          completed: completedJobs,
          cancelled: cancelledJobs,
          pending: pendingJobs,
          completionRate: parseFloat(completionRate),
          growth: jobGrowth
        },
        communication: {
          conversations: totalConversations,
          messages: totalMessages,
          messagesToday: messagesToday,
          activeConversations: activeConversations
        },
        reviews: {
          total: totalReviews,
          averageRating: parseFloat(averageRating.toFixed(2)),
          thisMonth: reviewsThisMonth
        },
        connections: {
          total: totalConnections,
          pending: connectionRequests,
          thisWeek: connectionsThisWeek
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    next(err);
  }
};

