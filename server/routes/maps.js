import express from 'express';
import { geocode, searchPlaces, getPlaceDetails, getDirections } from '../services/maps.js';

const router = express.Router();

// Geocode an address
router.get('/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    const location = await geocode(address);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(location);
  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search places
router.get('/places', async (req, res) => {
  try {
    const { query, lat, lng, type } = req.query;
    if (!query || !lat || !lng) {
      return res.status(400).json({ error: 'Query, lat, and lng are required' });
    }
    const places = await searchPlaces(query, { lat: parseFloat(lat), lng: parseFloat(lng) }, type);
    res.json(places);
  } catch (error) {
    console.error('Places search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get place details
router.get('/places/:placeId', async (req, res) => {
  try {
    const details = await getPlaceDetails(req.params.placeId);
    if (!details) {
      return res.status(404).json({ error: 'Place not found' });
    }
    res.json(details);
  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get directions
router.get('/directions', async (req, res) => {
  try {
    const { origin, destination, mode } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }
    const directions = await getDirections(origin, destination, mode);
    if (!directions) {
      return res.status(404).json({ error: 'Could not find directions' });
    }
    res.json(directions);
  } catch (error) {
    console.error('Directions error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
