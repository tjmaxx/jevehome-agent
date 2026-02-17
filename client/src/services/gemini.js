// Client-side Gemini utilities for formatting responses

/**
 * Format map data for display
 */
export function formatMapType(type) {
  const types = {
    map: 'Map View',
    traffic: 'Traffic View',
    places: 'Places Search',
    directions: 'Directions',
    streetview: 'Street View'
  };
  return types[type] || 'Map';
}

/**
 * Extract coordinates from map data
 */
export function getMapCenter(mapData) {
  if (mapData?.center) {
    return mapData.center;
  }
  if (mapData?.position) {
    return mapData.position;
  }
  if (mapData?.markers?.length > 0) {
    return mapData.markers[0].position;
  }
  return null;
}

/**
 * Format direction steps for display
 */
export function formatDirectionSteps(steps) {
  if (!steps) return [];
  return steps.map((step, idx) => ({
    number: idx + 1,
    instruction: step.instruction,
    distance: step.distance,
    duration: step.duration
  }));
}

/**
 * Format place rating as stars
 */
export function formatRating(rating) {
  if (!rating) return '';
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0));
}

/**
 * Format price level
 */
export function formatPriceLevel(level) {
  if (!level) return 'N/A';
  return '$'.repeat(level);
}
