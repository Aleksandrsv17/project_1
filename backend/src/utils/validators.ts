import Joi from 'joi';

// ─── Auth / User validators ──────────────────────────────────────────────────

export const registerSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().pattern(/^\+?[\d\s\-().]{7,20}$/).optional(),
  password: Joi.string().min(8).max(128).required(),
  first_name: Joi.string().min(1).max(100).trim().required(),
  last_name: Joi.string().min(1).max(100).trim().required(),
  role: Joi.string().valid('customer', 'owner', 'chauffeur').default('customer'),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

export const updateUserSchema = Joi.object({
  phone: Joi.string().pattern(/^\+?[\d\s\-().]{7,20}$/).optional(),
  first_name: Joi.string().min(1).max(100).trim().optional(),
  last_name: Joi.string().min(1).max(100).trim().optional(),
  avatar_url: Joi.string().uri().optional(),
}).min(1);

// ─── Vehicle validators ───────────────────────────────────────────────────────

export const createVehicleSchema = Joi.object({
  make: Joi.string().min(1).max(100).trim().required(),
  model: Joi.string().min(1).max(100).trim().required(),
  year: Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).required(),
  license_plate: Joi.string().min(2).max(30).trim().uppercase().required(),
  color: Joi.string().max(50).trim().optional(),
  category: Joi.string().valid('sedan', 'suv', 'luxury', 'sports', 'coupe', 'convertible', 'van', 'truck').required(),
  daily_rate: Joi.number().positive().precision(2).required(),
  hourly_rate: Joi.number().positive().precision(2).optional(),
  chauffeur_available: Joi.boolean().default(false),
  chauffeur_daily_rate: Joi.number().positive().precision(2).optional(),
  deposit_amount: Joi.number().positive().precision(2).default(500),
  max_daily_km: Joi.number().integer().positive().default(300),
  location_city: Joi.string().max(100).trim().optional(),
  location_lat: Joi.number().min(-90).max(90).optional(),
  location_lng: Joi.number().min(-180).max(180).optional(),
  description: Joi.string().max(2000).allow('').optional(),
});

export const updateVehicleSchema = Joi.object({
  make: Joi.string().min(1).max(100).trim().optional(),
  model: Joi.string().min(1).max(100).trim().optional(),
  year: Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).optional(),
  color: Joi.string().max(50).trim().optional(),
  daily_rate: Joi.number().positive().precision(2).optional(),
  hourly_rate: Joi.number().positive().precision(2).optional(),
  chauffeur_available: Joi.boolean().optional(),
  chauffeur_daily_rate: Joi.number().positive().precision(2).optional(),
  deposit_amount: Joi.number().positive().precision(2).optional(),
  max_daily_km: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('active', 'inactive', 'maintenance').optional(),
  location_city: Joi.string().max(100).trim().optional(),
  location_lat: Joi.number().min(-90).max(90).optional(),
  location_lng: Joi.number().min(-180).max(180).optional(),
  description: Joi.string().max(2000).optional(),
}).min(1);

export const vehicleQuerySchema = Joi.object({
  city: Joi.string().optional(),
  category: Joi.string().valid('sedan', 'suv', 'luxury', 'sports', 'coupe', 'convertible', 'van', 'truck').optional(),
  status: Joi.string().valid('pending', 'active', 'inactive', 'maintenance', 'all').optional(),
  min_rate: Joi.number().positive().optional(),
  max_rate: Joi.number().positive().optional(),
  chauffeur: Joi.boolean().optional(),
  page: Joi.number().integer().positive().default(1),
  limit: Joi.number().integer().positive().max(100).default(20),
  sort: Joi.string().valid('daily_rate_asc', 'daily_rate_desc', 'newest').default('newest'),
});

// ─── Booking validators ───────────────────────────────────────────────────────

export const createBookingSchema = Joi.object({
  vehicle_id: Joi.string().uuid().required(),
  chauffeur_id: Joi.string().uuid().optional(),
  type: Joi.string().valid('instant_ride', 'scheduled', 'hourly_rental', 'daily_rental').required(),
  mode: Joi.string().valid('self_drive', 'chauffeur').required(),
  start_time: Joi.date().iso().required(),
  end_time: Joi.date().iso().greater(Joi.ref('start_time')).optional(),
  duration_hours: Joi.number().positive().optional(),
  pickup_address: Joi.string().max(500).optional(),
  pickup_lat: Joi.number().min(-90).max(90).optional(),
  pickup_lng: Joi.number().min(-180).max(180).optional(),
  dropoff_address: Joi.string().max(500).optional(),
  dropoff_lat: Joi.number().min(-90).max(90).optional(),
  dropoff_lng: Joi.number().min(-180).max(180).optional(),
  notes: Joi.string().max(1000).optional(),
});

export const completeBookingSchema = Joi.object({
  extra_km: Joi.number().integer().min(0).max(10000).default(0),
});

export const cancelBookingSchema = Joi.object({
  cancellation_reason: Joi.string().max(500).allow('').default('Cancelled by user'),
});

export const bookingQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'confirmed', 'active', 'completed', 'cancelled').optional(),
  page: Joi.number().integer().positive().default(1),
  limit: Joi.number().integer().positive().max(100).default(20),
});

// ─── Payment validators ───────────────────────────────────────────────────────

export const confirmPaymentSchema = Joi.object({
  payment_intent_id: Joi.string().required(),
  booking_id: Joi.string().uuid().required(),
});

// ─── Chauffeur validators ─────────────────────────────────────────────────────

export const createChauffeurSchema = Joi.object({
  license_number: Joi.string().min(3).max(50).trim().required(),
  license_expiry: Joi.date().iso().min('now').required(),
});

export const updateChauffeurLocationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

// ─── Rating validators ────────────────────────────────────────────────────────

export const createRatingSchema = Joi.object({
  booking_id: Joi.string().uuid().required(),
  ratee_id: Joi.string().uuid().required(),
  score: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).optional(),
  type: Joi.string().valid('vehicle', 'chauffeur', 'customer').required(),
});

// ─── UUID param validator ─────────────────────────────────────────────────────

export const uuidParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// ─── Validation helper ────────────────────────────────────────────────────────

export function validate<T>(
  schema: Joi.ObjectSchema<T>,
  data: unknown
): { value: T; error?: string } {
  const { value, error } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const message = error.details.map((d) => d.message).join('; ');
    return { value, error: message };
  }

  return { value };
}
