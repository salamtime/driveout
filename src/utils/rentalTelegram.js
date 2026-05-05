const toSafeNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const buildRentalTelegramVehicleLabel = (rentalLike = {}) => {
  const vehicleLabel = [
    rentalLike?.selected_vehicle_model_snapshot ||
      rentalLike?.vehicle?.model ||
      rentalLike?.vehicle?.name ||
      '',
    rentalLike?.vehicle_plate_number ||
      rentalLike?.vehicle?.plate_number ||
      '',
  ]
    .filter(Boolean)
    .join(' • ');

  return vehicleLabel || `Vehicle #${rentalLike?.vehicle_id || ''}`.trim();
};

export const getInitialPaymentReceivedAmount = (rentalLike = {}) =>
  Math.max(0, toSafeNumber(rentalLike?.deposit_amount));

export const shouldDispatchInitialPaymentReceived = (rentalLike = {}) =>
  getInitialPaymentReceivedAmount(rentalLike) > 0;

export const buildInitialPaymentReceivedTelegramPayload = (rentalLike = {}) => {
  const amountPaid = getInitialPaymentReceivedAmount(rentalLike);
  const remainingAmount = Math.max(0, toSafeNumber(rentalLike?.remaining_amount));

  return {
    id: rentalLike?.id,
    reference: rentalLike?.rental_id || rentalLike?.reference || '',
    vehicle: buildRentalTelegramVehicleLabel(rentalLike),
    customer: rentalLike?.customer_name || '',
    start:
      rentalLike?.rental_start_date ||
      rentalLike?.start_date ||
      rentalLike?.started_at ||
      '',
    end:
      rentalLike?.rental_end_date ||
      rentalLike?.end_date ||
      rentalLike?.actual_end_date ||
      '',
    total: toSafeNumber(rentalLike?.total_amount),
    amountPaid,
    remaining: remainingAmount,
    paymentReceivedNow: amountPaid,
    companyDiscount: 0,
    tenant_id: rentalLike?.tenant_id || '',
    business_account_id: rentalLike?.business_account_id || '',
    tenant_slug: rentalLike?.tenant_slug || '',
  };
};
