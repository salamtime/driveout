import { createSupabaseClients } from './supabase.js';
import { calculateSimpleRentalPricing, DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES } from '../../src/utils/simpleRentalPricing.js';

const json = (res, status, body) => res.status(status).json(body);

const getFallbackPrice = (rentalType, modelType = '') => {
  if (modelType === 'AT5') {
    return rentalType === 'hourly' ? 399 :
      rentalType === 'daily' ? 1499 :
      rentalType === 'weekly' ? 1499 * 7 : 1499;
  }

  if (modelType === 'AT6') {
    return rentalType === 'hourly' ? 599 :
      rentalType === 'daily' ? 1999 :
      rentalType === 'weekly' ? 1999 * 7 : 1999;
  }

  if (modelType === 'AT10') {
    return rentalType === 'hourly' ? 999 :
      rentalType === 'daily' ? 3499 :
      rentalType === 'weekly' ? 3499 * 7 : 3499;
  }

  return rentalType === 'hourly' ? 400 :
    rentalType === 'daily' ? 1500 :
    rentalType === 'weekly' ? 5000 : 1500;
};

const loadVehicleContext = async (adminClient, vehicleId) => {
  const { data: vehicleData, error: vehicleError } = await adminClient
    .from('saharax_0u4w4d_vehicles')
    .select('id, vehicle_model_id')
    .eq('id', vehicleId)
    .single();

  if (vehicleError) throw vehicleError;

  const { data: modelInfo, error: modelError } = await adminClient
    .from('saharax_0u4w4d_vehicle_models')
    .select('id, model, hourly_price, daily_price')
    .eq('id', vehicleData.vehicle_model_id)
    .single();

  if (modelError) throw modelError;

  return { vehicleData, modelInfo };
};

const loadBasePrice = async (adminClient, vehicleModelId) => {
  const { data, error } = await adminClient
    .from('app_4c3a7a6153_base_prices')
    .select('hourly_price, daily_price')
    .eq('vehicle_model_id', vehicleModelId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const loadGracePeriodMinutes = async (adminClient) => {
  try {
    const { data, error } = await adminClient
      .from('app_settings')
      .select('id, rental_grace_period_minutes, rentalGracePeriodMinutes')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES;

    const gracePeriodMinutes = Number(
      data?.rentalGracePeriodMinutes ??
      data?.rental_grace_period_minutes ??
      DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES
    );

    return Number.isFinite(gracePeriodMinutes) ? gracePeriodMinutes : DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES;
  } catch {
    return DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES;
  }
};

const parseQuantity = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export default async function publicPricingHandler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const action = String(req.query?.action || 'vehicle').trim().toLowerCase();
  const rentalType = String(req.query?.rentalType || 'hourly').trim().toLowerCase();
  const quantity = parseQuantity(req.query?.quantity, 1);

  if (!['vehicle', 'duration'].includes(action)) {
    return json(res, 400, { error: 'Invalid pricing action' });
  }

  try {
    const { adminClient } = createSupabaseClients();
    const gracePeriodMinutes = await loadGracePeriodMinutes(adminClient);

    if (action === 'vehicle') {
      const vehicleId = String(req.query?.vehicleId || '').trim();
      if (!vehicleId) {
        return json(res, 400, { error: 'Missing vehicleId' });
      }

      const { vehicleData, modelInfo } = await loadVehicleContext(adminClient, vehicleId);

      const basePrice = await loadBasePrice(adminClient, vehicleData.vehicle_model_id);
      if (basePrice) {
        if (rentalType === 'hourly' && basePrice.hourly_price) {
          const pricing = calculateSimpleRentalPricing({
            startTime: new Date(0),
            endTime: new Date(Number(quantity || 1) * 60 * 60 * 1000),
            gracePeriodMinutes,
            hourlyRate: parseFloat(basePrice.hourly_price) || 0,
            totalKmUsed: 0,
            packages: [],
          });
          return json(res, 200, {
            price: pricing.totalPrice,
            source: 'base_price',
            tierMatched: false,
            billedHours: pricing.billedHours,
            gracePeriodMinutes,
          });
        }

        if ((rentalType === 'daily' || rentalType === 'weekly') && basePrice.daily_price) {
          const dailyPrice = parseFloat(basePrice.daily_price) || 0;
          return json(res, 200, {
            price: rentalType === 'weekly' ? dailyPrice * 7 : dailyPrice,
            source: 'base_price',
            tierMatched: false,
          });
        }
      }

      if (rentalType === 'hourly' && modelInfo?.hourly_price) {
        const pricing = calculateSimpleRentalPricing({
          startTime: new Date(0),
          endTime: new Date(Number(quantity || 1) * 60 * 60 * 1000),
          gracePeriodMinutes,
          hourlyRate: parseFloat(modelInfo.hourly_price) || 0,
          totalKmUsed: 0,
          packages: [],
        });
        return json(res, 200, {
          price: pricing.totalPrice,
          source: 'model',
          tierMatched: false,
          billedHours: pricing.billedHours,
          gracePeriodMinutes,
        });
      }

      if ((rentalType === 'daily' || rentalType === 'weekly') && modelInfo?.daily_price) {
        const dailyPrice = parseFloat(modelInfo.daily_price) || 0;
        return json(res, 200, {
          price: rentalType === 'weekly' ? dailyPrice * 7 : dailyPrice,
          source: 'model',
          tierMatched: false,
        });
      }

      return json(res, 200, {
        price:
          rentalType === 'hourly'
            ? calculateSimpleRentalPricing({
                startTime: new Date(0),
                endTime: new Date(Number(quantity || 1) * 60 * 60 * 1000),
                gracePeriodMinutes,
                hourlyRate: getFallbackPrice('hourly', modelInfo?.model || ''),
              }).totalPrice
            : rentalType === 'weekly'
              ? getFallbackPrice('daily', modelInfo?.model || '') * quantity * 7
              : getFallbackPrice('daily', modelInfo?.model || '') * quantity,
        source: 'fallback',
        tierMatched: false,
        gracePeriodMinutes,
      });
    }

    const vehicleModelId = String(req.query?.vehicleModelId || '').trim();
    if (!vehicleModelId) {
      return json(res, 400, { error: 'Missing vehicleModelId' });
    }

    const { data: modelInfo, error: modelError } = await adminClient
      .from('saharax_0u4w4d_vehicle_models')
      .select('id, model')
      .eq('id', vehicleModelId)
      .maybeSingle();

    if (modelError) throw modelError;

    const basePrice = await loadBasePrice(adminClient, vehicleModelId);
    if (basePrice?.daily_price) {
      return json(res, 200, {
        price: parseFloat(basePrice.daily_price) || 0,
        source: 'base_price',
        tierMatched: false,
      });
    }

    return json(res, 200, {
      price: getFallbackPrice('daily', modelInfo?.model || ''),
      source: 'fallback',
      tierMatched: false,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Failed to load pricing' });
  }
}
