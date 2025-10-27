const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fixfinder', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const findDuplicateConversations = async () => {
  try {
    console.log('🔍 Looking for duplicate conversations...');
    
    // Get all conversations
    const conversations = await Conversation.find({ isActive: true });
    console.log(`📊 Total conversations: ${conversations.length}`);
    
    // Group conversations by participant pairs
    const conversationGroups = new Map();
    
    for (const conv of conversations) {
      if (conv.participants.length === 2) {
        const userIds = conv.participants.map(p => p.user.toString()).sort();
        const key = userIds.join('-');
        
        if (!conversationGroups.has(key)) {
          conversationGroups.set(key, []);
        }
        conversationGroups.get(key).push(conv);
      }
    }
    
    // Find groups with more than one conversation
    const duplicates = [];
    for (const [key, convs] of conversationGroups) {
      if (convs.length > 1) {
        duplicates.push({
          userIds: key.split('-'),
          conversations: convs
        });
      }
    }
    
    console.log(`\n🔍 Found ${duplicates.length} duplicate conversation groups:`);
    
    for (const duplicate of duplicates) {
      console.log(`\n👥 Users: ${duplicate.userIds[0]} and ${duplicate.userIds[1]}`);
      console.log(`📊 ${duplicate.conversations.length} conversations:`);
      
      for (const conv of duplicate.conversations) {
        console.log(`  - ${conv._id} (created: ${conv.createdAt})`);
        console.log(`    Participants: ${conv.participants.map(p => `${p.userType}:${p.user}`).join(', ')}`);
      }
    }
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicate conversations found!');
    }
    
  } catch (error) {
    console.error('❌ Error finding duplicate conversations:', error);
  }
};

const main = async () => {
  await connectDB();
  await findDuplicateConversations();
  await mongoose.connection.close();
  console.log('👋 Database connection closed');
};

// Run the check
main().catch(console.error);
