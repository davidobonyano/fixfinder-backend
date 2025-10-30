const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const locationController = require('../controllers/locationController');

// All location routes require authentication
router.post('/save', protect, locationController.saveLocation);
router.get('/my-location', protect, locationController.getMyLocation);
router.get('/nearby-professionals', protect, locationController.findNearbyProfessionals);
router.get('/nearby-jobs', protect, locationController.findNearbyJobs);
router.get('/calculate-distance', protect, locationController.calculateDistanceAPI);
// Report wrong location (requires auth)
router.post('/report-issue', protect, locationController.reportIssue);
// Snap coordinates to LGA/state - public for pre-auth flows like Join
router.get('/snap', locationController.snap);

module.exports = router;

