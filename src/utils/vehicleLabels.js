export const formatVehicleNameWithModel = (vehicle = {}) => {
  const name = vehicle?.name || 'Unknown Vehicle';
  const model = vehicle?.model;

  if (model && String(model).trim() && String(model).trim().toLowerCase() !== String(name).trim().toLowerCase()) {
    return `${name} - ${model}`;
  }

  return name;
};

export const formatVehicleLabel = (vehicle = {}) => {
  const baseLabel = formatVehicleNameWithModel(vehicle);
  return vehicle?.plate_number ? `${baseLabel} (${vehicle.plate_number})` : baseLabel;
};
