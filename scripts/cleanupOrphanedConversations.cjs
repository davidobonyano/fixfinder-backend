// scripts/cleanupOrphanedConversations.cjs
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Professional = require('../models/Professional');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fixfinder';

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB.');

  const conversations = await Conversation.find({});
  let cleaned = 0;
  let deleted = 0;

  for (const convo of conversations) {
    let validParticipants = [];

    for (const p of convo.participants) {
      if (!p.user || !p.userType) continue;

      if (p.userType === 'user') {
        const exists = await User.exists({ _id: p.user });
        if (exists) validParticipants.push(p);
        else console.log(`❌ User not found for participant in conversation ${convo._id}`);
      } else if (p.userType === 'professional') {
        const exists = await Professional.exists({ _id: p.user });
        if (exists) validParticipants.push(p);
        else console.log(`❌ Pro not found for participant in conversation ${convo._id}`);
      }
    }

    if (validParticipants.length < 2) {
      await Conversation.deleteOne({ _id: convo._id });
      console.log(`🗑️ Deleted conversation ${convo._id} (not enough valid participants)`);
      deleted++;
    } else if (validParticipants.length !== convo.participants.length) {
      convo.participants = validParticipants;
      await convo.save();
      console.log(`🧹 Cleaned participants in conversation ${convo._id}`);
      cleaned++;
    }
  }

  console.log(`\nDone! Cleaned ${cleaned} conversations, deleted ${deleted}.`);
  mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
