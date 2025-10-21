const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

exports.listConversations = async (req, res, next) => {
  try {
    const convos = await Conversation.find({ participants: req.user.id }).sort({ updatedAt: -1 });
    res.json(convos);
  } catch (err) {
    next(err);
  }
};

exports.startConversation = async (req, res, next) => {
  try {
    const { otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ message: "otherUserId required" });
    let convo = await Conversation.findOne({ participants: { $all: [req.user.id, otherUserId] } });
    if (!convo) {
      convo = await Conversation.create({ participants: [req.user.id, otherUserId] });
    }
    res.status(201).json(convo);
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params; // conversation id
    const messages = await Message.find({ conversation: id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params; // conversation id
    const { body } = req.body;
    if (!body) return res.status(400).json({ message: "body required" });
    const msg = await Message.create({ conversation: id, sender: req.user.id, body });
    await Conversation.findByIdAndUpdate(id, { lastMessage: body, lastMessageAt: new Date() });
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
};



