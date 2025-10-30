const fs = require('fs');
const path = require('path');

let lgaGeojson = null;

function loadNigeriaLGA() {
  if (lgaGeojson) return lgaGeojson;
  // Try common filenames
  const candidates = [
    path.join(__dirname, 'data', 'nigeria_lgas.geo.json'),
    path.join(__dirname, 'data', 'nigeria_lgas.geojson')
  ];
  const filePath = candidates.find(p => fs.existsSync(p));
  if (!filePath) {
    console.warn('Nigeria LGA GeoJSON not found at', candidates.join(' | '), '- snapping will be skipped.');
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    lgaGeojson = JSON.parse(content);
    return lgaGeojson;
  } catch (e) {
    console.error('Failed to load LGA GeoJSON:', e.message);
    return null;
  }
}

// Ray-casting algorithm for point in polygon
function isPointInPolygon(point, polygon) {
  const [x, y] = point; // [lon, lat]
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(point, multiPolyCoords) {
  // multiPolyCoords: Array of polygons, where each polygon is array of linear rings
  for (const polygon of multiPolyCoords) {
    // polygon[0] is the outer ring
    if (isPointInPolygon(point, polygon[0])) return true;
  }
  return false;
}

function snapToLGA(lat, lon) {
  const data = loadNigeriaLGA();
  if (!data) return null;
  const pt = [lon, lat];
  const features = data.features || [];
  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      const coords = geom.coordinates; // [ [ [lon,lat], ... ] ]
      if (isPointInPolygon(pt, coords[0])) {
        return mapProperties(feature.properties);
      }
    } else if (geom.type === 'MultiPolygon') {
      const coords = geom.coordinates; // [ [ [ [lon,lat], ... ] ], ... ]
      if (pointInMultiPolygon(pt, coords)) {
        return mapProperties(feature.properties);
      }
    }
  }
  return null;
}

function mapProperties(props = {}) {
  // Try common naming schemes for ADM2 (LGA) and ADM1 (State)
  const lga = props.LGA_NAME || props.ADM2_EN || props.NAME_2 || props.ADM2_NAME || props.ADM2_NAME || props.ADM2 || null;
  const state = props.STATE_NAME || props.ADM1_EN || props.NAME_1 || props.ADM1_NAME || props.ADM1 || null;
  return { lga, state, properties: props };
}

module.exports = { loadNigeriaLGA, snapToLGA };


