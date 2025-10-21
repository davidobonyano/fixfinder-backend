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
app.use(rateLimit(15 * 60 * 1000, 100)); // 100 requests per 15 minutes

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

const PORT = process.env.PORT || 5000;

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
    socket.on("sendMessage", (messageData) => {
      const { conversationId, ...message } = messageData;
      socket.to(conversationId).emit("newMessage", message);
      console.log(`Message sent in conversation ${conversationId}`);
    });

    // Handle typing indicators
    socket.on("typing", (data) => {
      const { conversationId, userId, userName } = data;
      socket.to(conversationId).emit("typing", { conversationId, userId, userName });
    });

    // Handle message read receipts
    socket.on("messageRead", (data) => {
      const { conversationId, messageId, readAt } = data;
      socket.to(conversationId).emit("messageRead", { conversationId, messageId, readAt });
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User ${socket.userId} disconnected`);
      try {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(socket.userId, { $set: { 'presence.isOnline': false, 'presence.lastSeen': lastSeen } });
        io.emit('presence:update', { userId: socket.userId, isOnline: false, lastSeen });
      } catch (e) {}
    });
  });
} catch (e) {
  console.log("Socket.IO init skipped", e?.message);
}
