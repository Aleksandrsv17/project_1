import { Router, Request, Response } from 'express';
import https from 'https';
import { config } from '../../config';
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
  const { origin, destination, language } = req.body;

  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return res.status(400).json({ error: 'origin and destination with latitude/longitude are required' });
  }

  const result = await getDirections(origin, destination, language);
  if (!result) {
    return res.status(404).json({ error: 'No route found' });
  }

  return res.json(result);
});

// POST /v1/maps/distance
router.post('/distance', async (req: Request, res: Response) => {
  const { origin, destination, language } = req.body;

  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) {
    return res.status(400).json({ error: 'origin and destination with latitude/longitude are required' });
  }

  const result = await getDistanceMatrix(origin, destination, language);
  if (!result) {
    return res.status(404).json({ error: 'Could not calculate distance' });
  }

  return res.json(result);
});

// GET /v1/maps/geocode?address=...&language=...
router.get('/geocode', async (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address) {
    return res.status(400).json({ error: 'address query parameter is required' });
  }
  const language = req.query.language as string | undefined;

  const result = await geocodeAddress(address, language);
  if (!result) {
    return res.status(404).json({ error: 'Address not found' });
  }

  return res.json(result);
});

// GET /v1/maps/reverse-geocode?lat=...&lng=...&language=...
router.get('/reverse-geocode', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }
  const language = req.query.language as string | undefined;

  const result = await reverseGeocode(lat, lng, language);
  if (!result) {
    return res.status(404).json({ error: 'Location not found' });
  }

  return res.json(result);
});

// GET /v1/maps/places/autocomplete?input=...&lat=...&lng=...&language=...
router.get('/places/autocomplete', async (req: Request, res: Response) => {
  const input = req.query.input as string;
  if (!input) {
    return res.status(400).json({ error: 'input query parameter is required' });
  }

  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const location = !isNaN(lat) && !isNaN(lng) ? { latitude: lat, longitude: lng } : undefined;
  const language = req.query.language as string | undefined;

  const predictions = await placesAutocomplete(input, location, 50000, language);
  return res.json({ predictions });
});

// GET /v1/maps/places/:placeId?language=...
router.get('/places/:placeId', async (req: Request, res: Response) => {
  const { placeId } = req.params;
  const language = req.query.language as string | undefined;

  const details = await getPlaceDetails(placeId, language);
  if (!details) {
    return res.status(404).json({ error: 'Place not found' });
  }

  return res.json(details);
});

// GET /v1/maps/static-thumb?pickupLat=..&pickupLng=..&destLat=..&destLng=..&width=156&height=156
//
// Proxies Google Static Maps API using the IP-restricted backend key so the
// mobile apps don't have to hit Google directly (their iOS-bundle-restricted
// key cannot authorize Static Maps requests). Returns a PNG.
router.get('/static-thumb', async (req: Request, res: Response) => {
  const pickupLat = parseFloat(String(req.query.pickupLat ?? ''));
  const pickupLng = parseFloat(String(req.query.pickupLng ?? ''));
  const destLat = parseFloat(String(req.query.destLat ?? ''));
  const destLng = parseFloat(String(req.query.destLng ?? ''));
  const width = Math.min(640, Math.max(50, parseInt(String(req.query.width ?? '156'), 10) || 156));
  const height = Math.min(640, Math.max(50, parseInt(String(req.query.height ?? '156'), 10) || 156));
  const scale = req.query.scale === '1' ? 1 : 2;

  if (![pickupLat, pickupLng, destLat, destLng].every((v) => Number.isFinite(v))) {
    return res.status(400).json({ error: 'pickupLat/pickupLng/destLat/destLng required' });
  }

  const key = config.google.mapsApiKey;
  if (!key) {
    return res.status(500).json({ error: 'Maps key not configured' });
  }

  const size = `${Math.round(width / scale)}x${Math.round(height / scale)}`;
  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=${size}` +
    `&scale=${scale}` +
    `&maptype=roadmap` +
    `&style=${encodeURIComponent('feature:poi|visibility:off')}` +
    `&markers=${encodeURIComponent(`color:0x10B981|size:small|${pickupLat},${pickupLng}`)}` +
    `&markers=${encodeURIComponent(`color:0xEF4444|size:small|${destLat},${destLng}`)}` +
    `&path=${encodeURIComponent(`color:0x141414|weight:3|${pickupLat},${pickupLng}|${destLat},${destLng}`)}` +
    `&key=${key}`;

  https
    .get(url, (gres) => {
      // 24h browser/cache friendly — the route between two fixed coords doesn't
      // change. Saves Static Maps quota on repeat views.
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', gres.headers['content-type'] ?? 'image/png');
      res.status(gres.statusCode ?? 200);
      gres.pipe(res);
    })
    .on('error', (e) => {
      res.status(502).json({ error: 'Upstream static-maps fetch failed', detail: String(e?.message ?? e) });
    });
});

export default router;
