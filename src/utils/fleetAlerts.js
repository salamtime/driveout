const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getDaysUntil = (dateValue) => {
  if (!dateValue) return null;
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);
};

export const getFleetAlertsForVehicle = (vehicle) => {
  if (!vehicle) return [];

  const alerts = [];
  const currentOdometer = toNumber(vehicle.current_odometer);
  const nextOilChangeOdometer = toNumber(vehicle.next_oil_change_odometer);
  const oilChangeDateDays = getDaysUntil(vehicle.next_oil_change_due);

  if (currentOdometer !== null && nextOilChangeOdometer !== null) {
    const kmUntilService = nextOilChangeOdometer - currentOdometer;
    if (kmUntilService <= 100) {
      const overdue = kmUntilService <= 0;
      alerts.push({
        id: 'oil_change',
        type: 'oil_change',
        emoji: '🛢️',
        label: overdue ? 'Oil Change Overdue' : 'Oil Change Soon',
        detail: overdue ? `${Math.abs(kmUntilService)} km overdue` : `${kmUntilService} km left`,
        classes: overdue
          ? 'bg-red-50 text-red-800 border-red-200'
          : 'bg-amber-50 text-amber-800 border-amber-200',
      });
    }
  } else if (oilChangeDateDays !== null && oilChangeDateDays <= 30) {
    const overdue = oilChangeDateDays <= 0;
    alerts.push({
      id: 'oil_change_date',
      type: 'oil_change',
      emoji: '🛢️',
      label: overdue ? 'Oil Change Overdue' : 'Oil Change Soon',
      detail: overdue ? `${Math.abs(oilChangeDateDays)} day(s) overdue` : `${oilChangeDateDays} day(s) left`,
      classes: overdue
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-amber-50 text-amber-800 border-amber-200',
    });
  }

  const registrationDays = getDaysUntil(vehicle.registration_expiry_date);
  if (registrationDays !== null && registrationDays <= 30) {
    const expired = registrationDays <= 0;
    alerts.push({
      id: 'registration_expiry',
      type: 'registration_expiry',
      emoji: '📄',
      label: expired ? 'Registration Expired' : 'Registration Expiry',
      detail: expired ? `${Math.abs(registrationDays)} day(s) overdue` : `${registrationDays} day(s) left`,
      classes: expired
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-orange-50 text-orange-800 border-orange-200',
    });
  }

  const insuranceDays = getDaysUntil(vehicle.insurance_expiry_date);
  if (insuranceDays !== null && insuranceDays <= 30) {
    const expired = insuranceDays <= 0;
    alerts.push({
      id: 'insurance_expiry',
      type: 'insurance_expiry',
      emoji: '🛡️',
      label: expired ? 'Insurance Expired' : 'Insurance Expiry',
      detail: expired ? `${Math.abs(insuranceDays)} day(s) overdue` : `${insuranceDays} day(s) left`,
      classes: expired
        ? 'bg-red-50 text-red-800 border-red-200'
        : 'bg-orange-50 text-orange-800 border-orange-200',
    });
  }

  return alerts;
};
