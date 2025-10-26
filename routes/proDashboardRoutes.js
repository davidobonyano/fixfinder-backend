const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getOverview, getAnalytics } = require('../controllers/proDashboardController');

router.use(protect);

router.get('/overview', getOverview);
router.get('/analytics', getAnalytics);

module.exports = router;






