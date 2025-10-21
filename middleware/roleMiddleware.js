const User = require("../models/User");

exports.requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Not authorized" });
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    next();
  } catch (err) {
    next(err);
  }
};




