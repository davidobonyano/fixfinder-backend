const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("❌ Error: MONGO_URI is not defined in environment variables");
      process.exit(1);
    }

    const options = {
      serverSelectionTimeoutMS: 10000, // Timeout after 10s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    console.log("🔌 Attempting to connect to MongoDB...");
    const conn = await mongoose.connect(process.env.MONGO_URI, options);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // More helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      console.error("💡 Troubleshooting:");
      console.error("   1. Check if your IP is whitelisted in MongoDB Atlas");
      console.error("   2. Verify your MONGO_URI connection string is correct");
      console.error("   3. Check if MongoDB Atlas cluster is running (not paused)");
      console.error("   4. Try connecting with 'Allow access from anywhere' (0.0.0.0/0) temporarily");
    } else if (error.message.includes('authentication')) {
      console.error("💡 Authentication failed - check your username and password in MONGO_URI");
    } else if (error.message.includes('timeout')) {
      console.error("💡 Connection timeout - check your network connection and MongoDB Atlas status");
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;
