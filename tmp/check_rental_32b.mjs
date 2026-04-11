import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (key) => {
  const line = env.split('\n').find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};

process.env.VITE_SUPABASE_URL = get('VITE_SUPABASE_URL');
process.env.VITE_SUPABASE_ANON_KEY = get('VITE_SUPABASE_ANON_KEY');

const supabase = createClient(get('VITE_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const rentalQuery = await supabase
  .from('app_4c3a7a6153_rentals')
  .select('id,rental_id,rental_type,quantity_days,quantity_hours,unit_price,total_amount,vehicle_id')
  .eq('rental_id', 'RNT-2026-32b')
  .maybeSingle();

if (rentalQuery.error || !rentalQuery.data) {
  console.log(JSON.stringify({ step: 'rental', error: rentalQuery.error }, null, 2));
  process.exit(0);
}

const rental = rentalQuery.data;

const vehicleQuery = await supabase
  .from('saharax_0u4w4d_vehicles')
  .select('id,name,vehicle_model_id')
  .eq('id', rental.vehicle_id)
  .maybeSingle();

const modelQuery = vehicleQuery.data?.vehicle_model_id
  ? await supabase
      .from('saharax_0u4w4d_vehicle_models')
      .select('*')
      .eq('id', vehicleQuery.data.vehicle_model_id)
      .maybeSingle()
  : { data: null, error: null };

const basePriceQuery = vehicleQuery.data?.vehicle_model_id
  ? await supabase
      .from('app_4c3a7a6153_base_prices')
      .select('*')
      .eq('vehicle_model_id', vehicleQuery.data.vehicle_model_id)
      .eq('is_active', true)
      .maybeSingle()
  : { data: null, error: null };

const tierQuery = vehicleQuery.data?.vehicle_model_id
  ? await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', vehicleQuery.data.vehicle_model_id)
      .eq('is_active', true)
  : { data: null, error: null };

const days = Number(rental.quantity_days) || 1;
const tiers = tierQuery.data || [];
const tierMatch = tiers.find((tier) => {
  if (!tier.daily_price_amount) return false;
  const min = tier.min_days ? parseInt(tier.min_days, 10) : 1;
  const max = tier.max_days ? parseInt(tier.max_days, 10) : Infinity;
  return days >= min && days <= max;
});
const dynamicDuration = tierMatch?.daily_price_amount
  ? { price: Number(tierMatch.daily_price_amount), source: 'tier', tierMatched: true }
  : basePriceQuery.data?.daily_price
    ? { price: Number(basePriceQuery.data.daily_price), source: 'base_price', tierMatched: false }
    : modelQuery.data?.daily_price
      ? { price: Number(modelQuery.data.daily_price), source: 'vehicle_model', tierMatched: false }
      : null;

console.log(JSON.stringify({
  rental,
  vehicle: vehicleQuery.data,
  vehicleError: vehicleQuery.error,
  model: modelQuery.data,
  modelError: modelQuery.error,
  basePrice: basePriceQuery.data,
  basePriceError: basePriceQuery.error,
  tiers: tierQuery.data,
  tiersError: tierQuery.error,
  dynamicDuration
}, null, 2));
