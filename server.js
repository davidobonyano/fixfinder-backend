const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorMiddleware");

dotenv.config();
connectDB();

const app = express();
let io = null;


// CORS: allow frontend origin(s) from env FRONTEND_URL (comma-separated)
const allowedOrigins = (process.env.FRONTEND_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json());

// Rate limiting
const { rateLimit } = require("./middleware/rateLimiter");
// Rate limiting - more lenient in development
const isDevelopment = process.env.NODE_ENV !== 'production';
const rateLimitMax = isDevelopment ? 1000 : 100; // 1000 in dev, 100 in production
app.use(rateLimit(15 * 60 * 1000, rateLimitMax));

// Basic request logger for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});


app.get("/", (req, res) => {
  res.send("FixFinder API is running...");
});

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/professionals", require("./routes/professionalRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/verify", require("./routes/verificationRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/connections", require("./routes/connectionRoutes"));
app.use("/api/pro-dashboard", require("./routes/proDashboardRoutes"));
app.use("/api/location", require("./routes/locationRoutes"));

// Error handler
app.use(errorHandler);

// Basic env validation
if (!process.env.JWT_SECRET) {
  console.error("❌ Missing JWT_SECRET in environment");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("❌ Missing MONGO_URI in environment");
  process.exit(1);
}

// Optional env warnings
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.warn("⚠️  CLOUDINARY_CLOUD_NAME not set - file uploads will fail");
}
if (!process.env.MAIL_HOST) {
  console.warn("⚠️  MAIL_HOST not set - email notifications disabled");
}
if (!process.env.PAYSTACK_SECRET_KEY) {
  console.warn("⚠️  PAYSTACK_SECRET_KEY not set - payments will use mock mode");
}

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Socket.IO setup (basic)
try {
  const { Server } = require("socket.io");
  io = new Server(server, {
    cors: { 
      origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
      methods: ["GET", "POST"],
      credentials: true
    },
  });
  const jwt = require("jsonwebtoken");
  const User = require('./models/User');
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) return next(new Error("unauthorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (e) {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", async (socket) => {
    console.log(`User ${socket.userId} connected`);

    // Join user to their own room for notifications
    socket.join(socket.userId);
    console.log(`User ${socket.userId} joined notification room`);

    // Presence: mark online
    try {
      await User.findByIdAndUpdate(socket.userId, { $set: { 'presence.isOnline': true } });
      io.emit('presence:update', { userId: socket.userId, isOnline: true });
    } catch (e) {}
    
    // Join conversation room
    socket.on("join", (conversationId) => {
      socket.join(conversationId);
      console.log(`User ${socket.userId} joined conversation ${conversationId}`);
    });

    // Leave conversation room
    socket.on("leave", (conversationId) => {
      socket.leave(conversationId);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Handle sending messages
    socket.on("send_message", (messageData) => {
      const { conversationId, ...message } = messageData;
      socket.to(conversationId).emit("receive_message", message);
      console.log(`Message sent in conversation ${conversationId}`);
    });

    // Handle typing indicators
    socket.on("user_typing", (data) => {
      const { conversationId, userId, userName } = data;
      socket.to(conversationId).emit("user_typing", { conversationId, userId, userName });
    });

    // Handle message read receipts
    socket.on("message_read", (data) => {
      const { conversationId, messageId, readAt } = data;
      socket.to(conversationId).emit("message_read", { conversationId, messageId, readAt });
    });

    // Handle user status updates
    socket.on("user_status", (data) => {
      const { conversationId, userId, status } = data;
      socket.to(conversationId).emit("user_status", { conversationId, userId, status });
    });

    // Test event handler
    socket.on("test_event", (data) => {
      console.log('Test event received:', data);
      socket.emit("test_response", { message: 'Hello from server', received: data });
    });

    // Handle location sharing (User ↔ Professional)
    socket.on("shareLocation", async (data) => {
      try {
        console.log('Received shareLocation event:', data);
        const { senderId, receiverId, coordinates, conversationId } = data;
        const user = await User.findById(senderId).select('name email role profilePicture avatarUrl');
        console.log('Found user:', user);
        
        // Send location to the RECEIVER only (the person who should see the shared location)
        if (receiverId !== senderId) {
          socket.to(receiverId).emit("locationShared", {
            senderId,
            senderName: user.name,
            senderAvatar: user.profilePicture || user.avatarUrl,
            receiverId,
            coordinates,
            user: { 
              name: user.name, 
              email: user.email, 
              role: user.role,
              profilePicture: user.profilePicture,
              avatarUrl: user.avatarUrl
            },
            timestamp: Date.now()
          });
        }
        
        // Send confirmation to sender that they are now sharing (but don't send location data back)
        socket.emit("locationSharingStarted", {
          senderId,
          receiverId,
          timestamp: Date.now()
        });
        
        console.log(`${user.role} ${senderId} shared location with ${receiverId}`);
      } catch (error) {
        console.error('Error handling location share:', error);
      }
    });

    // Handle location updates (for real-time tracking)
    socket.on("updateLocation", async (data) => {
      try {
        const { userId, lat, lng, receiverId, conversationId } = data;
        const user = await User.findById(userId).select('name email profilePicture avatarUrl');

        // Send updated location to the receiver
        if (receiverId && receiverId !== userId) {
          socket.to(receiverId).emit("locationUpdated", {
            userId,
            lat,
            lng,
            user: { 
              name: user.name, 
              email: user.email,
              profilePicture: user.profilePicture,
              avatarUrl: user.avatarUrl
            },
            timestamp: Date.now()
          });
        }

        // Also broadcast to conversation room if provided
        if (conversationId) {
          socket.to(conversationId).emit("locationUpdated", {
            userId,
            lat,
            lng,
            user: { 
              name: user.name, 
              email: user.email,
              profilePicture: user.profilePicture,
              avatarUrl: user.avatarUrl
            },
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('Error handling location update:', error);
      }
    });

    // Handle stop location sharing
    socket.on("stopLocationShare", async (data) => {
      try {
        const { userId, chatRoom } = data;

        // Notify chat room participants to stop location sharing
        if (chatRoom) {
          io.to(chatRoom).emit("locationStopped", { userId });
        }
        
        // Also notify the specific user that they stopped sharing
        socket.emit("locationSharingStopped", { userId });
        
        console.log(`User ${userId} stopped sharing location`);
      } catch (error) {
        console.error('Error handling stop location share:', error);
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User ${socket.userId} disconnected`);
      try {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(socket.userId, { $set: { 'presence.isOnline': false, 'presence.lastSeen': lastSeen } });
        io.emit('presence:update', { userId: socket.userId, isOnline: false, lastSeen });
        
        // Stop sharing location when user disconnects
        io.emit('stop_location_update', { userId: socket.userId });
      } catch (e) {}
    });

    // Handle message deletion
    socket.on("message_deleted", async (data) => {
      try {
        const { messageId, conversationId } = data;
        console.log('Message deleted:', messageId);
        
        // Broadcast to conversation room
        socket.to(conversationId).emit("message_deleted", {
          messageId,
          conversationId
        });
      } catch (error) {
        console.error('Error handling message deletion:', error);
      }
    });

    // Handle bulk message deletion
    socket.on("messages_deleted", async (data) => {
      try {
        const { messageIds, conversationId } = data;
        console.log('Messages deleted:', messageIds);
        
        // Broadcast to conversation room
        socket.to(conversationId).emit("messages_deleted", {
          messageIds,
          conversationId
        });
      } catch (error) {
        console.error('Error handling bulk message deletion:', error);
      }
    });
  });
  
  // Export io for use in other modules
  app.set('io', io);
} catch (e) {
  console.log("Socket.IO init skipped", e?.message);
}

module.exports = app;
