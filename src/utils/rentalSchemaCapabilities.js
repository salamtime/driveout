const RENTALS_OPTIONAL_AUDIT_COLUMNS = Object.freeze([
  'amount_due_override_previous_amount',
]);

const RENTALS_OPTIONAL_VEHICLE_SNAPSHOT_COLUMNS = Object.freeze([
  'selected_vehicle_id_snapshot',
  'selected_vehicle_name_snapshot',
  'selected_vehicle_plate_snapshot',
  'selected_vehicle_model_snapshot',
  'selected_vehicle_selected_by',
  'selected_vehicle_selected_at',
  'plate_number_snapshot',
  'vehicle_name_snapshot',
  'vehicle_model_snapshot',
  'vehicle_label_snapshot',
]);

const RENTALS_OPTIONAL_COLUMN_CAPABILITIES = Object.freeze({
  'audit-columns': RENTALS_OPTIONAL_AUDIT_COLUMNS,
  'vehicle-snapshot-columns': RENTALS_OPTIONAL_VEHICLE_SNAPSHOT_COLUMNS,
});

const RENTALS_OPTIONAL_COLUMN_TO_CAPABILITY = Object.freeze(
  Object.entries(RENTALS_OPTIONAL_COLUMN_CAPABILITIES).reduce((acc, [capability, columns]) => {
    columns.forEach((columnName) => {
      acc[columnName] = capability;
    });
    return acc;
  }, {})
);

export const getRentalsSchemaCapabilityCacheKey = (capability) => {
  if (typeof window === 'undefined') {
    return `rentals-schema:${capability}`;
  }

  return `rentals-schema:${window.location.hostname}:${capability}`;
};

export const readRentalsSchemaCapability = (capability) => {
  try {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(getRentalsSchemaCapabilityCacheKey(capability)) !== 'false';
  } catch (_error) {
    return true;
  }
};

export const persistRentalsSchemaCapability = (capability, supported) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getRentalsSchemaCapabilityCacheKey(capability),
      supported ? 'true' : 'false'
    );
  } catch (_error) {
    // Ignore localStorage access failures.
  }
};

export const isMissingRentalsAuditColumnError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return (
    (code === 'PGRST204' || code === '42703') &&
    RENTALS_OPTIONAL_AUDIT_COLUMNS.some((columnName) => message.includes(columnName))
  );
};

export const isMissingRentalsVehicleSnapshotColumnError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return (
    (code === 'PGRST204' || code === '42703') &&
    RENTALS_OPTIONAL_VEHICLE_SNAPSHOT_COLUMNS.some((columnName) => message.includes(columnName))
  );
};

export const markRentalsAuditColumnsUnsupported = () => {
  persistRentalsSchemaCapability('audit-columns', false);
};

export const markRentalsVehicleSnapshotColumnsUnsupported = () => {
  persistRentalsSchemaCapability('vehicle-snapshot-columns', false);
};

export const isRetryableRentalSchemaError = (error) => {
  const normalizedError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    normalizedError.includes('schema cache') ||
    normalizedError.includes('could not find the') ||
    normalizedError.includes('column') ||
    normalizedError.includes('pgrst')
  );
};

export const getMissingRentalColumnFromError = (error) => {
  const message = `${error?.message || ''}`;
  const directMatch = message.match(/Could not find the '([^']+)' column/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return (
    Object.keys(RENTALS_OPTIONAL_COLUMN_TO_CAPABILITY).find((columnName) => message.includes(columnName)) ||
    null
  );
};

const dropUnsupportedColumnsFromPayload = (payload = {}) => {
  const nextPayload = { ...payload };

  Object.entries(RENTALS_OPTIONAL_COLUMN_CAPABILITIES).forEach(([capability, columns]) => {
    if (readRentalsSchemaCapability(capability) !== false) {
      return;
    }

    columns.forEach((columnName) => {
      if (columnName in nextPayload) {
        delete nextPayload[columnName];
      }
    });
  });

  return nextPayload;
};

export const updateRentalRecordWithSchemaFallback = async ({
  supabase,
  rentalId,
  payload,
  selectClause = '*',
}) => {
  let nextPayload = dropUnsupportedColumnsFromPayload(payload);

  while (true) {
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(nextPayload)
      .eq('id', rentalId)
      .select(selectClause)
      .single();

    if (!error) {
      return { data, error: null };
    }

    if (!isRetryableRentalSchemaError(error)) {
      return { data: null, error };
    }

    const missingColumn = getMissingRentalColumnFromError(error);
    if (!missingColumn || !(missingColumn in nextPayload)) {
      return { data: null, error };
    }

    const capability = RENTALS_OPTIONAL_COLUMN_TO_CAPABILITY[missingColumn];
    if (capability === 'audit-columns') {
      markRentalsAuditColumnsUnsupported();
    } else if (capability === 'vehicle-snapshot-columns') {
      markRentalsVehicleSnapshotColumnsUnsupported();
    }

    const { [missingColumn]: _removed, ...rest } = nextPayload;
    nextPayload = rest;
  }
};
