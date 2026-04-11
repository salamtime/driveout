import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (key) => {
  const line = env.split('\n').find((entry) => entry.startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/^"|"$/g, '');
};

const supabaseUrl = get('SUPABASE_URL') || get('VITE_SUPABASE_URL');
const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = get('VITE_SUPABASE_ANON_KEY') || get('SUPABASE_ANON_KEY');
const apiKey =
  serviceRoleKey && serviceRoleKey.includes('nnaymteoxvdnsnhlyvkk')
    ? serviceRoleKey
    : anonKey;

const supabase = createClient(supabaseUrl, apiKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const rentalCode = process.argv[2] || 'RNT-2026-3c6';

const rentalsTable = 'app_4c3a7a6153_rentals';
const vehiclesTable = 'app_4c3a7a6153_vehicles';
const historyTable = 'rental_vehicle_history';
const activityTable = 'saharax_0u4w4d_activity_log';

const { data: rentalRows, error: rentalError } = await supabase
  .from(rentalsTable)
  .select(`
    *,
    vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
      id,
      plate_number,
      name,
      model,
      status
    )
  `)
  .ilike('rental_id', rentalCode);

if (rentalError) {
  console.error(JSON.stringify({ stage: 'rental', error: rentalError }, null, 2));
  process.exit(1);
}

const rental = rentalRows?.[0] || null;

if (!rental) {
  console.log(JSON.stringify({ rental: null, message: 'Rental not found' }, null, 2));
  process.exit(0);
}

const fetchVehicle = async (vehicleId) => {
  if (!vehicleId) return null;
  const { data, error } = await supabase
    .from(vehiclesTable)
    .select('*')
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) {
    return { error };
  }
  return data;
};

const [{ data: historyRows, error: historyError }, { data: activityRows, error: activityError }] =
  await Promise.all([
    supabase
      .from(historyTable)
      .select('*')
      .eq('rental_id', rental.id)
      .order('created_at', { ascending: true }),
    supabase
      .from(activityTable)
      .select('id, action, entity_type, entity_id, details, metadata, created_at, user_name')
      .eq('entity_type', 'rental')
      .eq('entity_id', rental.id)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

const [currentVehicle, previousVehicle] = await Promise.all([
  rental.vehicle || fetchVehicle(rental.vehicle_id),
  fetchVehicle(rental.replacement_previous_vehicle_id),
]);

const { data: matchingPlates, error: matchingPlatesError } = await supabase
  .from(vehiclesTable)
  .select('*')
  .in('plate_number', ['48956', '48957']);

console.log(
  JSON.stringify(
    {
      supabaseUrl,
      usingKeyRole: apiKey === serviceRoleKey ? 'service_role' : 'anon',
      rental,
      currentVehicle,
      previousVehicle,
      matchingPlatesError,
      matchingPlates,
      historyError,
      historyRows,
      activityError,
      activityRows,
    },
    null,
    2,
  ),
);
