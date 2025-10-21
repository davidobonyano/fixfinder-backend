const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

exports.requireRoles = (...roles) => (req, res, next) => {
  if (!req.userRole) return next();
  if (!roles.includes(req.userRole)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};




