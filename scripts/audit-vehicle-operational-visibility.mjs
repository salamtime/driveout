import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env.vercel.prod', override: false });

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !serviceKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const isArchivedLifecycle = (vehicle) => {
  const status = normalizeText(vehicle?.status);
  return (
    status === 'sold' ||
    status === 'disposed' ||
    hasValue(vehicle?.sold_date) ||
    Number(vehicle?.sale_price_mad || 0) > 0 ||
    hasValue(vehicle?.sold_buyer_name) ||
    hasValue(vehicle?.sale_notes) ||
    hasValue(vehicle?.sale_proof_url) ||
    hasValue(vehicle?.sale_proof_name)
  );
};

const isPlaceholder = (vehicle) => {
  const name = normalizeText(vehicle?.name);
  const model = normalizeText(vehicle?.model);
  const plateNumber = normalizeText(vehicle?.plate_number);
  const registrationNumber = normalizeText(vehicle?.registration_number);
  const organizationId = normalizeText(vehicle?.organization_id);
  const vehicleModelId = normalizeText(vehicle?.vehicle_model_id);
  const hasOperationalIdentity =
    hasValue(vehicle?.current_odometer) ||
    hasValue(vehicle?.engine_hours) ||
    hasValue(vehicle?.vehicle_model_id);

  const isUnknownShape =
    name.includes('unknown') ||
    model.includes('unknown') ||
    `${name} ${model}`.includes('unknown unknown');

  const isPlateFreeDraft =
    !plateNumber &&
    !registrationNumber &&
    !organizationId &&
    !vehicleModelId &&
    !hasOperationalIdentity;

  const isBrokenUnknownRecord =
    isUnknownShape &&
    !organizationId &&
    !vehicleModelId &&
    !hasOperationalIdentity;

  return isPlateFreeDraft || isBrokenUnknownRecord;
};

const { data, error } = await supabase
  .from('saharax_0u4w4d_vehicles')
  .select(
    'id,name,model,status,plate_number,registration_number,organization_id,vehicle_model_id,current_odometer,engine_hours,sold_date,sale_price_mad,sold_buyer_name,sale_notes,sale_proof_url,sale_proof_name,created_at,updated_at'
  )
  .order('id', { ascending: false });

if (error) throw error;

const rows = data || [];
const placeholderCandidates = rows.filter(isPlaceholder);
const archivedButOperationalStatus = rows.filter(
  (vehicle) => isArchivedLifecycle(vehicle) && ['available', 'scheduled', 'rented', 'tour'].includes(normalizeText(vehicle?.status))
);

const placeholderIds = placeholderCandidates.map((vehicle) => vehicle.id).filter(Boolean);

const [rentals, history, reports, tours, taxes] = placeholderIds.length
  ? await Promise.all([
      supabase.from('app_4c3a7a6153_rentals').select('vehicle_id').in('vehicle_id', placeholderIds),
      supabase.from('rental_vehicle_history').select('vehicle_id').in('vehicle_id', placeholderIds),
      supabase.from('app_4c3a7a6153_vehicle_reports').select('vehicle_id').in('vehicle_id', placeholderIds),
      supabase.from('tour_vehicle_snapshots').select('vehicle_id').in('vehicle_id', placeholderIds),
      supabase.from('saharax_0u4w4d_vehicle_annual_taxes').select('vehicle_id').in('vehicle_id', placeholderIds),
    ])
  : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

const linkedCountsById = new Map(
  placeholderIds.map((id) => [String(id), { rentals: 0, history: 0, reports: 0, tours: 0, taxes: 0 }])
);

for (const row of rentals.data || []) linkedCountsById.get(String(row.vehicle_id)).rentals += 1;
for (const row of history.data || []) linkedCountsById.get(String(row.vehicle_id)).history += 1;
for (const row of reports.data || []) linkedCountsById.get(String(row.vehicle_id)).reports += 1;
for (const row of tours.data || []) linkedCountsById.get(String(row.vehicle_id)).tours += 1;
for (const row of taxes.data || []) linkedCountsById.get(String(row.vehicle_id)).taxes += 1;

const placeholderRows = placeholderCandidates.map((vehicle) => ({
  ...vehicle,
  links: linkedCountsById.get(String(vehicle.id)) || { rentals: 0, history: 0, reports: 0, tours: 0, taxes: 0 },
}));

const activePlaceholderRows = placeholderRows.filter((vehicle) => {
  const links = vehicle.links || {};
  return (links.rentals || 0) + (links.history || 0) + (links.reports || 0) + (links.tours || 0) + (links.taxes || 0) === 0;
});

const historicalPlaceholderRows = placeholderRows.filter((vehicle) => !activePlaceholderRows.includes(vehicle));

const result = {
  ok: activePlaceholderRows.length === 0 && archivedButOperationalStatus.length === 0,
  totals: {
    totalVehicles: rows.length,
    placeholderRows: placeholderRows.length,
    activePlaceholderRows: activePlaceholderRows.length,
    historicalPlaceholderRows: historicalPlaceholderRows.length,
    archivedButOperationalStatus: archivedButOperationalStatus.length,
  },
  placeholderRows,
  activePlaceholderRows,
  historicalPlaceholderRows,
  archivedButOperationalStatus,
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
