const mongoose = require('mongoose');
const Professional = require('./models/Professional');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/fixfinder', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateProfessionalsWithLocation() {
  try {
    console.log('🔍 Finding professionals without location coordinates...');
    
    // Find professionals without location coordinates
    const professionals = await Professional.find({
      $or: [
        { 'location.coordinates.lat': { $exists: false } },
        { 'location.coordinates.lng': { $exists: false } },
        { 'location.coordinates.lat': null },
        { 'location.coordinates.lng': null }
      ]
    });

    console.log(`📊 Found ${professionals.length} professionals to update`);

    for (const pro of professionals) {
      // Generate coordinates based on city
      let coordinates = { lat: 6.5244, lng: 3.3792 }; // Default Lagos
      let address = pro.city || 'Lagos';

      // Set coordinates based on city
      switch (pro.city?.toLowerCase()) {
        case 'lagos':
          coordinates = { lat: 6.5244, lng: 3.3792 };
          address = 'Lagos, Nigeria';
          break;
        case 'ikorodu':
          coordinates = { lat: 6.6167, lng: 3.5167 };
          address = 'Ikorodu, Lagos';
          break;
        case 'abuja':
          coordinates = { lat: 9.0765, lng: 7.3986 };
          address = 'Abuja, Nigeria';
          break;
        case 'port harcourt':
          coordinates = { lat: 4.8156, lng: 7.0498 };
          address = 'Port Harcourt, Nigeria';
          break;
        case 'benin':
          coordinates = { lat: 6.3333, lng: 5.6167 };
          address = 'Benin City, Nigeria';
          break;
        default:
          // Add some random variation for professionals in the same city
          const variation = 0.01; // ~1km variation
          coordinates = {
            lat: coordinates.lat + (Math.random() - 0.5) * variation,
            lng: coordinates.lng + (Math.random() - 0.5) * variation
          };
      }

      // Update the professional with location data
      await Professional.findByIdAndUpdate(pro._id, {
        $set: {
          location: {
            address: address,
            coordinates: coordinates
          }
        }
      });

      console.log(`✅ Updated ${pro.name} (${pro.category}) in ${pro.city} with coordinates:`, coordinates);
    }

    console.log('\n🎉 All professionals updated with location coordinates!');
    console.log('Now refresh your frontend to see accurate distances.');
    
  } catch (error) {
    console.error('❌ Error updating professionals:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateProfessionalsWithLocation();


