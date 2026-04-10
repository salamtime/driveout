import { createSupabaseClients } from './supabase.js';

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

const findMatchingHourlyPrice = (tiers, hours) => {
  for (const tier of tiers || []) {
    if (tier.min_hours !== null && tier.max_hours !== null && tier.price_amount) {
      const min = parseFloat(tier.min_hours);
      const max = parseFloat(tier.max_hours);

      if (hours >= min && hours <= max) {
        return parseFloat(tier.price_amount);
      }
    }
  }

  return 0;
};

const findMatchingDailyPrice = (tiers, days) => {
  if (days === 1) {
    const oneDayTier = (tiers || []).find((tier) => {
      if (!tier.daily_price_amount) return false;

      const min = tier.min_days ? parseInt(tier.min_days, 10) : null;
      const max = tier.max_days ? parseInt(tier.max_days, 10) : null;
      return min === 1 && max === 1;
    });

    if (oneDayTier) {
      return parseFloat(oneDayTier.daily_price_amount);
    }

    return 0;
  }

  for (const tier of tiers || []) {
    if (tier.daily_price_amount) {
      const min = tier.min_days ? parseInt(tier.min_days, 10) : 1;
      const max = tier.max_days ? parseInt(tier.max_days, 10) : Infinity;

      if (days >= min && days <= max) {
        return parseFloat(tier.daily_price_amount);
      }
    }
  }

  return 0;
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

const loadActiveTiers = async (adminClient, vehicleModelId) => {
  const { data: tiers, error } = await adminClient
    .from('pricing_tiers')
    .select('*')
    .eq('vehicle_model_id', vehicleModelId)
    .eq('is_active', true);

  if (error) throw error;
  return tiers || [];
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

    if (action === 'vehicle') {
      const vehicleId = String(req.query?.vehicleId || '').trim();
      if (!vehicleId) {
        return json(res, 400, { error: 'Missing vehicleId' });
      }

      const { vehicleData, modelInfo } = await loadVehicleContext(adminClient, vehicleId);
      const tiers = await loadActiveTiers(adminClient, vehicleData.vehicle_model_id);

      let price = 0;
      if (rentalType === 'hourly') {
        price = findMatchingHourlyPrice(tiers, quantity);
      } else if (rentalType === 'daily') {
        price = findMatchingDailyPrice(tiers, quantity);
      } else if (rentalType === 'weekly') {
        price = findMatchingDailyPrice(tiers, quantity * 7);
      }

      if (price > 0) {
        return json(res, 200, { price, source: 'tier', tierMatched: true });
      }

      const basePrice = await loadBasePrice(adminClient, vehicleData.vehicle_model_id);
      if (basePrice) {
        if (rentalType === 'hourly' && basePrice.hourly_price) {
          return json(res, 200, { price: parseFloat(basePrice.hourly_price) || 0, source: 'base_price', tierMatched: false });
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
        return json(res, 200, { price: parseFloat(modelInfo.hourly_price) || 0, source: 'model', tierMatched: false });
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
        price: getFallbackPrice(rentalType, modelInfo?.model || ''),
        source: 'fallback',
        tierMatched: false,
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

    const tiers = await loadActiveTiers(adminClient, vehicleModelId);
    const tierPrice = findMatchingDailyPrice(tiers, quantity);
    if (tierPrice > 0) {
      return json(res, 200, { price: tierPrice, source: 'tier', tierMatched: true });
    }

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
