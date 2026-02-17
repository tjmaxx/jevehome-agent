import axios from 'axios';

const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const PLACE_PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';

export async function geocode(address) {
  try {
    const response = await axios.get(GEOCODE_URL, {
      params: {
        address,
        key: MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

const typeMapping = {
  hotel: 'lodging',
  restaurant: 'restaurant',
  attraction: 'tourist_attraction',
  gas_station: 'gas_station'
};

export async function searchPlaces(query, location, type) {
  try {
    const params = {
      location: `${location.lat},${location.lng}`,
      radius: 5000,
      keyword: query,
      key: MAPS_API_KEY
    };

    if (type && typeMapping[type]) {
      params.type = typeMapping[type];
    }

    const response = await axios.get(PLACES_URL, { params });

    if (response.data.status === 'OK') {
      return response.data.results.map(place => ({
        placeId: place.place_id,
        name: place.name,
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        },
        rating: place.rating || 0,
        userRatingsTotal: place.user_ratings_total || 0,
        address: place.vicinity,
        priceLevel: place.price_level,
        openNow: place.opening_hours?.open_now,
        photo: place.photos?.[0]?.photo_reference
          ? `${PLACE_PHOTO_URL}?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${MAPS_API_KEY}`
          : null,
        types: place.types
      }));
    }
    return [];
  } catch (error) {
    console.error('Places search error:', error);
    return [];
  }
}

export async function getPlaceDetails(placeId) {
  try {
    const response = await axios.get(PLACE_DETAILS_URL, {
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,website,rating,reviews,photos,opening_hours,price_level,url',
        key: MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK') {
      const place = response.data.result;
      return {
        name: place.name,
        address: place.formatted_address,
        phone: place.formatted_phone_number,
        website: place.website,
        rating: place.rating,
        reviews: place.reviews?.slice(0, 3),
        photos: place.photos?.slice(0, 5).map(p =>
          `${PLACE_PHOTO_URL}?maxwidth=400&photoreference=${p.photo_reference}&key=${MAPS_API_KEY}`
        ),
        openingHours: place.opening_hours?.weekday_text,
        priceLevel: place.price_level,
        googleMapsUrl: place.url
      };
    }
    return null;
  } catch (error) {
    console.error('Place details error:', error);
    return null;
  }
}

export async function getDirections(origin, destination, mode = 'driving') {
  try {
    const response = await axios.get(DIRECTIONS_URL, {
      params: {
        origin,
        destination,
        mode,
        key: MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        distance: leg.distance.text,
        duration: leg.duration.text,
        startLocation: {
          lat: leg.start_location.lat,
          lng: leg.start_location.lng
        },
        endLocation: {
          lat: leg.end_location.lat,
          lng: leg.end_location.lng
        },
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        polyline: route.overview_polyline.points,
        steps: leg.steps.map(step => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
          distance: step.distance.text,
          duration: step.duration.text
        }))
      };
    }
    return null;
  } catch (error) {
    console.error('Directions error:', error);
    return null;
  }
}
