import { geocode, searchPlaces, getDirections, getPlaceDetails } from './maps.js';

export const tools = [
  {
    name: "show_map",
    description: "Display a map centered on a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "Address or place name" },
        zoom: { type: "number", description: "Zoom level 1-20, default 14" }
      },
      required: ["location"]
    }
  },
  {
    name: "show_traffic",
    description: "Show traffic conditions for an area",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "Address or place name" },
        radius: { type: "number", description: "Radius in miles, default 5" }
      },
      required: ["location"]
    }
  },
  {
    name: "search_places",
    description: "Search for places like hotels, restaurants, attractions, gas stations",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query like 'italian restaurants' or 'hotels'" },
        location: { type: "string", description: "Location to search near. If omitted, uses the user's current location." },
        type: { type: "string", enum: ["hotel", "restaurant", "attraction", "gas_station"], description: "Type of place" },
        minRating: { type: "number", description: "Minimum star rating 1-5" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_directions",
    description: "Get directions between two locations",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Starting location" },
        destination: { type: "string", description: "Ending location" },
        mode: { type: "string", enum: ["driving", "walking", "transit", "bicycling"], description: "Travel mode, default driving" }
      },
      required: ["origin", "destination"]
    }
  },
  {
    name: "show_street_view",
    description: "Show street view panorama for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "Address or place name" }
      },
      required: ["location"]
    }
  },
  {
    name: "get_user_location",
    description: "Get the user's approximate location based on their IP address. Use this when the user asks about things 'near me', 'nearby', 'closest to me', etc.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

export async function executeFunctionCall(name, args, userLocation = null) {
  try {
    switch (name) {
      case 'show_map': {
        const coords = await geocode(args.location);
        if (!coords) {
          return { error: `Could not find location: ${args.location}` };
        }
        return {
          success: true,
          message: `Showing map of ${args.location}`,
          mapData: {
            type: 'map',
            center: coords,
            zoom: args.zoom || 14,
            markers: [{
              position: coords,
              title: args.location
            }]
          }
        };
      }

      case 'show_traffic': {
        const coords = await geocode(args.location);
        if (!coords) {
          return { error: `Could not find location: ${args.location}` };
        }
        return {
          success: true,
          message: `Showing traffic around ${args.location}`,
          mapData: {
            type: 'traffic',
            center: coords,
            zoom: args.radius ? Math.max(10, 14 - Math.floor(args.radius / 3)) : 13,
            trafficEnabled: true
          }
        };
      }

      case 'search_places': {
        // Default to user's location if no location specified
        let coords;
        if (args.location) {
          coords = await geocode(args.location);
          if (!coords) {
            return { error: `Could not find location: ${args.location}` };
          }
        } else if (userLocation) {
          coords = { lat: userLocation.lat, lng: userLocation.lng };
          args.location = userLocation.description;
        } else {
          return { error: 'No location specified and user location unavailable. Please provide a location.' };
        }

        const places = await searchPlaces(args.query, coords, args.type);

        // Filter by rating if specified
        let filteredPlaces = places;
        if (args.minRating) {
          filteredPlaces = places.filter(p => p.rating >= args.minRating);
        }

        const markers = filteredPlaces.slice(0, 10).map((place, idx) => ({
          position: place.location,
          title: place.name,
          label: String(idx + 1),
          info: {
            name: place.name,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            address: place.address,
            priceLevel: place.priceLevel,
            openNow: place.openNow,
            placeId: place.placeId,
            photo: place.photo
          }
        }));

        return {
          success: true,
          places: filteredPlaces.slice(0, 10).map(p => ({
            name: p.name,
            rating: p.rating,
            address: p.address,
            priceLevel: p.priceLevel ? '$'.repeat(p.priceLevel) : 'N/A',
            openNow: p.openNow
          })),
          message: `Found ${filteredPlaces.length} places matching "${args.query}" near ${args.location}`,
          mapData: {
            type: 'places',
            center: coords,
            zoom: 14,
            markers,
            places: filteredPlaces.slice(0, 10)
          }
        };
      }

      case 'get_directions': {
        const directions = await getDirections(
          args.origin,
          args.destination,
          args.mode || 'driving'
        );

        if (!directions) {
          return { error: `Could not get directions from ${args.origin} to ${args.destination}` };
        }

        return {
          success: true,
          message: `Directions from ${args.origin} to ${args.destination}: ${directions.distance}, ${directions.duration}`,
          distance: directions.distance,
          duration: directions.duration,
          steps: directions.steps,
          mapData: {
            type: 'directions',
            origin: directions.startLocation,
            destination: directions.endLocation,
            center: {
              lat: (directions.startLocation.lat + directions.endLocation.lat) / 2,
              lng: (directions.startLocation.lng + directions.endLocation.lng) / 2
            },
            zoom: 12,
            polyline: directions.polyline,
            markers: [
              { position: directions.startLocation, title: args.origin, label: 'A' },
              { position: directions.endLocation, title: args.destination, label: 'B' }
            ]
          }
        };
      }

      case 'show_street_view': {
        const coords = await geocode(args.location);
        if (!coords) {
          return { error: `Could not find location: ${args.location}` };
        }
        return {
          success: true,
          message: `Showing street view of ${args.location}`,
          mapData: {
            type: 'streetview',
            position: coords,
            heading: 0,
            pitch: 0
          }
        };
      }

      case 'get_user_location': {
        if (!userLocation) {
          return {
            success: false,
            message: 'Unable to determine user location. Location services unavailable.'
          };
        }
        return {
          success: true,
          message: `User is located near ${userLocation.description}`,
          location: userLocation,
          mapData: {
            type: 'map',
            center: { lat: userLocation.lat, lng: userLocation.lng },
            zoom: 13,
            markers: [{
              position: { lat: userLocation.lat, lng: userLocation.lng },
              title: `Your location: ${userLocation.description}`
            }]
          }
        };
      }

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (error) {
    console.error(`Error executing ${name}:`, error);
    return { error: error.message };
  }
}
