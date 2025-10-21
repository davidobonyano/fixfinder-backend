const Service = require("../models/Service");

exports.createService = async (req, res, next) => {
  try {
    const { name, category, description, basePrice } = req.body;
    if (!name || !category || !description || basePrice == null) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const service = await Service.create({ name, category, description, basePrice });
    res.status(201).json(service);
  } catch (err) {
    next(err);
  }
};

exports.getServices = async (req, res, next) => {
  try {
    const { category, q, isActive } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (typeof isActive !== "undefined") filter.isActive = isActive === "true";
    if (q) filter.name = { $regex: q, $options: "i" };
    const services = await Service.find(filter).sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    next(err);
  }
};

exports.getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (err) {
    next(err);
  }
};

exports.updateService = async (req, res, next) => {
  try {
    const updates = req.body;
    const service = await Service.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json(service);
  } catch (err) {
    next(err);
  }
};

exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Service deleted" });
  } catch (err) {
    next(err);
  }
};



