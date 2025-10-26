const mongoose = require('mongoose');
const Professional = require('./models/Professional');

mongoose.connect('mongodb://localhost:27017/fixfinder');

async function fixLocations() {
  const pros = await Professional.find({});
  console.log(`Found ${pros.length} professionals`);
  
  for (const pro of pros) {
    let coords = { lat: 6.5244, lng: 3.3792 };
    let addr = 'Lagos, Nigeria';
    
    if (pro.city === 'Ikorodu') {
      coords = { lat: 6.6167, lng: 3.5167 };
      addr = 'Ikorodu, Lagos';
    }
    
    await Professional.findByIdAndUpdate(pro._id, {
      location: { address: addr, coordinates: coords }
    });
    
    console.log(`Updated ${pro.name} in ${pro.city}`);
  }
  
  console.log('Done!');
  mongoose.connection.close();
}

fixLocations();


