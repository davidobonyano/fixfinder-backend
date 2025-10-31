/**
 * Location Service - Geocoding utilities using OpenStreetMap Nominatim API (free, no key required)
 * Alternative: OpenCage API (requires API key)
 */

/**
 * Reverse geocode coordinates to address details
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {Promise<{city: string, state: string, country: string, address: string}>}
 */
const reverseGeocode = async (latitude, longitude) => {
  try {
    // Using Nominatim (OpenStreetMap) - free, no API key needed
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    );
    
    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();
    
    if (!data || !data.address) {
      throw new Error('Invalid geocoding response');
    }

    const address = data.address;
    
    // Extract city, state, country
    const city = address.city || address.town || address.village || address.municipality || '';
    const state = address.state || address.region || '';
    const country = address.country || '';
    const fullAddress = data.display_name || `${city}, ${state}`;

    return {
      city,
      state,
      country,
      address: fullAddress,
      postalCode: address.postcode || '',
      county: address.county || ''
    };
  } catch (error) {
    console.error('Reverse geocode error:', error);
    throw error;
  }
};

/**
 * Forward geocode - convert address/city to coordinates
 * @param {string} query 
 * @returns {Promise<{latitude: number, longitude: number, city: string, state: string, country: string}>}
 */
const forwardGeocode = async (query) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`
    );
    
    if (!response.ok) {
      throw new Error('Forward geocoding failed');
    }

    const data = await response.json();
    
    if (!data || !data[0]) {
      throw new Error('No results found');
    }

    const result = data[0];
    const address = result.address || {};
    
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    const city = address.city || address.town || address.village || address.municipality || '';
    const state = address.state || address.region || '';
    const country = address.country || '';

    return {
      latitude,
      longitude,
      city,
      state,
      country,
      address: result.display_name,
      postalCode: address.postcode || '',
      county: address.county || ''
    };
  } catch (error) {
    console.error('Forward geocode error:', error);
    throw error;
  }
};

/**
 * Autocomplete addresses for search
 * @param {string} query 
 * @returns {Promise<Array>}
 */
const autocompleteAddress = async (query) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`
    );
    
    if (!response.ok) {
      throw new Error('Autocomplete failed');
    }

    const data = await response.json();
    
    return data.map(item => ({
      label: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      city: item.address?.city || item.address?.town || item.address?.village || '',
      state: item.address?.state || item.address?.region || '',
      country: item.address?.country || ''
    }));
  } catch (error) {
    console.error('Autocomplete error:', error);
    return [];
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Find nearby entities within a radius
 * @param {number} userLat 
 * @param {number} userLon 
 * @param {Array} entities Array of entities with latitude/longitude
 * @param {number} maxDistance Max distance in km
 * @returns {Array} Sorted by distance
 */
const findNearby = (userLat, userLon, entities, maxDistance = 50) => {
  return entities
    .map(entity => {
      const distance = calculateDistance(
        userLat,
        userLon,
        entity.latitude || entity.location?.coordinates?.lat,
        entity.longitude || entity.location?.coordinates?.lng
      );
      return { ...entity, distance };
    })
    .filter(entity => entity.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Format distance for display
 * @param {number} distanceKm 
 * @returns {string}
 */
const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
};

/**
 * Validate coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {boolean}
 */
const isValidCoordinates = (latitude, longitude) => {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
};

module.exports = {
  reverseGeocode,
  forwardGeocode,
  autocompleteAddress,
  calculateDistance,
  findNearby,
  formatDistance,
  isValidCoordinates
};














