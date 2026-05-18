const normalizeText = (value) => String(value || '').trim().toLowerCase();

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

export const isVehicleLifecycleArchived = (vehicle) => {
  const status = normalizeText(vehicle?.status);
  if (status === 'sold' || status === 'disposed') return true;

  return (
    hasValue(vehicle?.sold_date) ||
    Number(vehicle?.sale_price_mad || 0) > 0 ||
    hasValue(vehicle?.sold_buyer_name) ||
    hasValue(vehicle?.sale_notes) ||
    hasValue(vehicle?.sale_proof_url) ||
    hasValue(vehicle?.sale_proof_name)
  );
};

export const isVehiclePlaceholderRecord = (vehicle) => {
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

export const isOwnerDraftVehicleRecord = (vehicle) =>
  hasValue(vehicle?.owner_user_id) || !hasValue(vehicle?.organization_id);

export const shouldHideVehicleFromOperationalViews = (vehicle) =>
  isOwnerDraftVehicleRecord(vehicle) || isVehiclePlaceholderRecord(vehicle) || isVehicleLifecycleArchived(vehicle);
