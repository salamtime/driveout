import { supabase } from '../lib/supabase';
import { TABLE_NAMES } from '../config/tableNames';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  requireCurrentOrganizationId,
} from './OrganizationService';

const TOUR_PACKAGE_MODEL_PRICES_TABLE = TABLE_NAMES.TOUR_PACKAGE_MODEL_PRICES;
export const GLOBAL_TOUR_PRICING_KEY = '__global_tour_pricing__';

const DEFAULT_DURATIONS = [1, 1.5, 2];

const normalizeDuration = (value) => {
  const duration = Number(value || 0);
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(1)) : 1;
};

const createPricingId = () =>
  `tour_price_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeRow = (row = {}) => ({
  id: String(row.id || ''),
  package_id: String(row.package_id || ''),
  vehicle_model_id: row.vehicle_model_id || '',
  duration_hours: normalizeDuration(row.duration_hours),
  price_mad: Number(row.price_mad || 0),
  is_active: row.is_active !== false,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
});

export const TOUR_PRICING_DEFAULT_DURATIONS = DEFAULT_DURATIONS;

export const fetchTourPackageModelPrices = async () => {
  const organizationId = await requireCurrentOrganizationId();
  const { data, error } = await applyOrganizationScope(
    supabase
      .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
      .select('*')
      .eq('is_active', true)
      .order('package_id', { ascending: true })
      .order('vehicle_model_id', { ascending: true })
      .order('duration_hours', { ascending: true }),
    organizationId
  );

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeRow) : [];
};

export const upsertTourPackageModelPrice = async (entry = {}) => {
  const organizationId = await requireCurrentOrganizationId();
  const payload = normalizeRow({
    ...entry,
    id: entry.id || createPricingId(),
  });

  const { data, error } = await supabase
    .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
    .upsert([applyOrganizationMatch(payload, organizationId)], {
      onConflict: 'package_id,vehicle_model_id,duration_hours',
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeRow(data);
};

export const deleteTourPackageModelPrice = async (id) => {
  const organizationId = await requireCurrentOrganizationId();
  const { error } = await supabase
    .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) throw error;
  return true;
};

export const deleteTourPackageModelPricesForModel = async (packageId, vehicleModelId) => {
  const organizationId = await requireCurrentOrganizationId();
  const { error } = await supabase
    .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
    .delete()
    .eq('package_id', packageId)
    .eq('vehicle_model_id', vehicleModelId)
    .eq('organization_id', organizationId);

  if (error) throw error;
  return true;
};

export const buildTourPricingMatrix = (rows = []) => {
  const matrix = new Map();

  rows.forEach((row) => {
    const packageId = String(row.package_id || '');
    const modelId = String(row.vehicle_model_id || '');
    const durationKey = String(normalizeDuration(row.duration_hours));
    const key = `${packageId}::${modelId}`;

    if (!matrix.has(key)) {
      matrix.set(key, {
        package_id: packageId,
        vehicle_model_id: modelId,
        prices: {},
      });
    }

    matrix.get(key).prices[durationKey] = Number(row.price_mad || 0);
  });

  return Array.from(matrix.values());
};

export const getTourPriceForModelAndDuration = ({
  rows = [],
  packageId,
  vehicleModelId,
  durationHours,
}) => {
  const normalizedDuration = String(normalizeDuration(durationHours));

  const exactPackageMatch = rows.find(
    (row) =>
      String(row.package_id) === String(packageId) &&
      String(row.vehicle_model_id) === String(vehicleModelId) &&
      String(normalizeDuration(row.duration_hours)) === normalizedDuration
  );

  if (Number(exactPackageMatch?.price_mad || 0) > 0) {
    return Number(exactPackageMatch.price_mad || 0);
  }

  const globalMatch = rows.find(
    (row) =>
      String(row.package_id) === GLOBAL_TOUR_PRICING_KEY &&
      String(row.vehicle_model_id) === String(vehicleModelId) &&
      String(normalizeDuration(row.duration_hours)) === normalizedDuration
  );

  if (Number(globalMatch?.price_mad || 0) > 0) {
    return Number(globalMatch.price_mad || 0);
  }
  return 0;
};

export const getTourPackageStartingPrice = ({
  rows = [],
  packageId,
  durationHours,
}) => {
  const normalizedDuration = String(normalizeDuration(durationHours));
  const exactPackagePrices = rows
    .filter(
      (row) =>
        String(row.package_id) === String(packageId) &&
        String(normalizeDuration(row.duration_hours)) === normalizedDuration
    )
    .map((row) => Number(row.price_mad || 0))
    .filter((value) => value > 0);

  if (exactPackagePrices.length > 0) return Math.min(...exactPackagePrices);

  const globalPrices = rows
    .filter(
      (row) =>
        String(row.package_id) === GLOBAL_TOUR_PRICING_KEY &&
        String(normalizeDuration(row.duration_hours)) === normalizedDuration
    )
    .map((row) => Number(row.price_mad || 0))
    .filter((value) => value > 0);

  if (globalPrices.length > 0) return Math.min(...globalPrices);
  return 0;
};
