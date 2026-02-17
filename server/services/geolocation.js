import axios from 'axios';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const locationCache = new Map();

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^0\.0\.0\.0$/,
  /^localhost$/i
];

function isPrivateIP(ip) {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

export function extractClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.ip;
}

const DEFAULT_LOCATION = {
  lat: 38.9187,
  lng: -77.2311,
  city: 'Tysons',
  region: 'Virginia',
  country: 'United States',
  description: '1850 Towers Crescent Plaza, Tysons, VA 22182'
};

export async function getLocationFromIP(ip) {
  if (!ip || isPrivateIP(ip)) {
    return DEFAULT_LOCATION;
  }

  // Check cache
  const cached = locationCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data } = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 3000
    });

    if (data.status !== 'success') {
      return null;
    }

    const location = {
      lat: data.lat,
      lng: data.lon,
      city: data.city,
      region: data.regionName,
      country: data.country,
      description: `${data.city}, ${data.regionName}, ${data.country}`
    };

    locationCache.set(ip, { data: location, timestamp: Date.now() });
    return location;
  } catch (error) {
    console.error('Geolocation error:', error.message);
    return null;
  }
}
