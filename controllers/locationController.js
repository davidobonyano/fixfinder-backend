const User = require('../models/User');
const Professional = require('../models/Professional');
const Job = require('../models/Job');
const { reverseGeocode, calculateDistance, formatDistance } = require('../utils/locationService');
const { snapToLGA } = require('../utils/geo');

/**
 * Save/update user location
 */
const saveLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: 'Latitude and longitude are required' 
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates' 
      });
    }

    // Reverse geocode to get city, state, country
    let locationData;
    try {
      const geocodeData = await reverseGeocode(latitude, longitude);
      locationData = {
        latitude,
        longitude,
        city: geocodeData.city,
        state: geocodeData.state,
        country: geocodeData.country,
        address: geocodeData.address,
        lastUpdated: new Date()
      };
    } catch (geocodeError) {
      console.error('Geocoding error:', geocodeError);
      // Fallback: save coordinates without address
      locationData = {
        latitude,
        longitude,
        lastUpdated: new Date()
      };
    }

    // Update user location
    await User.findByIdAndUpdate(userId, { location: locationData });

    res.json({ 
      success: true, 
      message: 'Location updated successfully',
      location: locationData
    });
  } catch (error) {
    console.error('Save location error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save location' 
    });
  }
};

/**
 * Get my current location
 */
const getMyLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('location');

    res.json({ 
      success: true, 
      location: user.location || null
    });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get location' 
    });
  }
};

/**
 * Find nearby professionals
 */
const findNearbyProfessionals = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 50, radiusMeters, category } = req.query;
    const userId = req.user.id;

    // Get user location
    const user = await User.findById(userId).select('location');
    
    // Use provided coordinates or user's saved location
    let userLat = latitude ? parseFloat(latitude) : user.location?.latitude;
    let userLon = longitude ? parseFloat(longitude) : user.location?.longitude;

    if (!userLat || !userLon) {
      return res.status(400).json({ 
        success: false, 
        message: 'Location not found. Please share your location.' 
      });
    }

    // Build query
    const query = { isActive: true, isVerified: true };
    if (category) {
      query.category = category;
    }

    // Get all professionals
    const professionals = await Professional.find(query)
      .populate('user', 'name profilePicture location')
      .lean();

    // Calculate distances and filter
    const nearby = professionals
      .map(pro => {
        const proLat = pro.location?.coordinates?.lat;
        const proLon = pro.location?.coordinates?.lng;
        
        if (!proLat || !proLon) return null;

        const distance = calculateDistance(userLat, userLon, proLat, proLon);
        
        return {
          ...pro,
          distance,
          distanceFormatted: formatDistance(distance)
        };
      })
      .filter(pro => {
        if (!pro) return false;
        if (radiusMeters) {
          const km = Number(radiusMeters) / 1000;
          return pro.distance <= km;
        }
        return pro.distance <= maxDistance;
      })
      .sort((a, b) => a.distance - b.distance);

    res.json({ 
      success: true, 
      count: nearby.length,
      professionals: nearby,
      myLocation: { latitude: userLat, longitude: userLon }
    });
  } catch (error) {
    console.error('Find nearby professionals error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to find nearby professionals' 
    });
  }
};

/**
 * Find nearby jobs
 */
const findNearbyJobs = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 50, radiusMeters, category } = req.query;
    const userId = req.user.id;

    // Get user location
    const user = await User.findById(userId).select('location');
    
    // Use provided coordinates or user's saved location
    let userLat = latitude ? parseFloat(latitude) : user.location?.latitude;
    let userLon = longitude ? parseFloat(longitude) : user.location?.longitude;

    if (!userLat || !userLon) {
      return res.status(400).json({ 
        success: false, 
        message: 'Location not found. Please share your location.' 
      });
    }

    // Build query
    const query = { status: 'Pending', isActive: true };
    if (category) {
      query.category = category;
    }

    // Get all jobs
    const jobs = await Job.find(query)
      .populate('client', 'name profilePicture location')
      .lean();

    // Calculate distances and filter
    const nearby = jobs
      .map(job => {
        const jobLat = job.location?.coordinates?.lat;
        const jobLon = job.location?.coordinates?.lng;
        
        if (!jobLat || !jobLon) return null;

        const distance = calculateDistance(userLat, userLon, jobLat, jobLon);
        
        return {
          ...job,
          distance,
          distanceFormatted: formatDistance(distance)
        };
      })
      .filter(job => {
        if (!job) return false;
        if (radiusMeters) {
          const km = Number(radiusMeters) / 1000;
          return job.distance <= km;
        }
        return job.distance <= maxDistance;
      })
      .sort((a, b) => a.distance - b.distance);

    res.json({ 
      success: true, 
      count: nearby.length,
      jobs: nearby,
      myLocation: { latitude: userLat, longitude: userLon }
    });
  } catch (error) {
    console.error('Find nearby jobs error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to find nearby jobs' 
    });
  }
};

/**
 * Calculate distance between two points
 */
const calculateDistanceAPI = async (req, res) => {
  try {
    const { lat1, lon1, lat2, lon2 } = req.query;

    if (!lat1 || !lon1 || !lat2 || !lon2) {
      return res.status(400).json({ 
        success: false, 
        message: 'All coordinates are required' 
      });
    }

    const distance = calculateDistance(
      parseFloat(lat1),
      parseFloat(lon1),
      parseFloat(lat2),
      parseFloat(lon2)
    );

    res.json({ 
      success: true, 
      distance,
      distanceFormatted: formatDistance(distance)
    });
  } catch (error) {
    console.error('Calculate distance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to calculate distance' 
    });
  }
};

/**
 * Report wrong location (optionally auto-retry and update)
 */
const reportIssue = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { message, latitude, longitude, retry } = req.body || {};
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('[Location Report]', { userId, message, latitude, longitude, retry });

    if (retry && typeof latitude === 'number' && typeof longitude === 'number') {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      let snapped = null;
      try {
        snapped = snapToLGA(lat, lon);
      } catch (e) {}
      if (!snapped) {
        try {
          const geocodeData = await reverseGeocode(lat, lon);
          snapped = {
            lga: geocodeData.city || geocodeData.town || geocodeData.village || geocodeData.municipality,
            state: geocodeData.state || geocodeData.region,
            country: geocodeData.country,
            address: geocodeData.address
          };
        } catch (e) {
          snapped = null;
        }
      }

      if (snapped?.country && String(snapped.country).toLowerCase() !== 'nigeria') {
        return res.json({ success: true, data: { updated: false, reason: 'Non-Nigeria location' } });
      }

      const user = await User.findById(userId);
      if (user) {
        user.location = {
          ...(user.location || {}),
          latitude: lat,
          longitude: lon,
          city: snapped?.lga || user.location?.city,
          state: snapped?.state || user.location?.state,
          country: 'Nigeria',
          address: snapped?.address || user.location?.address,
          lastUpdated: new Date()
        };
        await user.save();
        return res.json({ success: true, data: { updated: true, location: user.location } });
      }
    }

    return res.json({ success: true, data: { reported: true } });
  } catch (error) {
    console.error('Report issue error:', error);
    res.status(500).json({ success: false, message: 'Failed to report issue' });
  }
};

module.exports = {
  saveLocation,
  getMyLocation,
  findNearbyProfessionals,
  findNearbyJobs,
  calculateDistanceAPI,
  reportIssue,
  async snap(req, res) {
    try {
      const { latitude, longitude } = req.query;
      if (!latitude || !longitude) {
        return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
      }
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const snapped = snapToLGA(lat, lon);
      if (snapped && (snapped.lga || snapped.state)) {
        return res.json({ success: true, data: { lga: snapped.lga || null, state: snapped.state || null } });
      }
      // Fallback to server-side reverse geocode when polygon data isn't available
      try {
        const addr = await reverseGeocode(lat, lon);
        return res.json({ success: true, data: { lga: addr.city || null, state: addr.state || null } });
      } catch {
        return res.json({ success: true, data: null });
      }
    } catch (e) {
      console.error('Snap error:', e);
      res.status(500).json({ success: false, message: 'Failed to snap location' });
    }
  }
};




