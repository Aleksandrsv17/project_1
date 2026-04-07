import { Router, Request, Response } from 'express';
import {
  getDirections,
  getDistanceMatrix,
  geocodeAddress,
  reverseGeocode,
  placesAutocomplete,
  getPlaceDetails,
} from './maps.service';

const router = Router();

// POST /v1/maps/directions
router.post('/directions', async (req: Request, res: Response) => {
  const { origin, destination } = req.body;

  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return res.status(400).json({ error: 'origin and destination with latitude/longitude are required' });
  }

  const result = await getDirections(origin, destination);
  if (!result) {
    return res.status(404).json({ error: 'No route found' });
  }

  return res.json(result);
});

// POST /v1/maps/distance
router.post('/distance', async (req: Request, res: Response) => {
  const { origin, destination } = req.body;

  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return res.status(400).json({ error: 'origin and destination with latitude/longitude are required' });
  }

  const result = await getDistanceMatrix(origin, destination);
  if (!result) {
    return res.status(404).json({ error: 'Could not calculate distance' });
  }

  return res.json(result);
});

// GET /v1/maps/geocode?address=...
router.get('/geocode', async (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address) {
    return res.status(400).json({ error: 'address query parameter is required' });
  }

  const result = await geocodeAddress(address);
  if (!result) {
    return res.status(404).json({ error: 'Address not found' });
  }

  return res.json(result);
});

// GET /v1/maps/reverse-geocode?lat=...&lng=...
router.get('/reverse-geocode', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }

  const result = await reverseGeocode(lat, lng);
  if (!result) {
    return res.status(404).json({ error: 'Location not found' });
  }

  return res.json(result);
});

// GET /v1/maps/places/autocomplete?input=...&lat=...&lng=...
router.get('/places/autocomplete', async (req: Request, res: Response) => {
  const input = req.query.input as string;
  if (!input) {
    return res.status(400).json({ error: 'input query parameter is required' });
  }

  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const location = !isNaN(lat) && !isNaN(lng) ? { latitude: lat, longitude: lng } : undefined;

  const predictions = await placesAutocomplete(input, location);
  return res.json({ predictions });
});

// GET /v1/maps/places/:placeId
router.get('/places/:placeId', async (req: Request, res: Response) => {
  const { placeId } = req.params;

  const details = await getPlaceDetails(placeId);
  if (!details) {
    return res.status(404).json({ error: 'Place not found' });
  }

  return res.json(details);
});

export default router;
