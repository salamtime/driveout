// Utility functions for formatting data in the Fuel Management System

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('fr-MA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatDateOnly = (date) => {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('fr-MA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
};

export const formatLiters = (amount, fuelType = '') => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'N/A';
  }
  const formatted = parseFloat(amount).toFixed(2);
  return `${formatted}L ${fuelType}`.trim();
};

export const calculateCostPerLiter = (totalCost, amount) => {
  if (!totalCost || !amount || amount === 0) {
    return 0;
  }
  return totalCost / amount;
};

export const formatCostPerLiter = (totalCost, amount) => {
  const costPerLiter = calculateCostPerLiter(totalCost, amount);
  if (costPerLiter === 0) return 'N/A';
  return `${formatCurrency(costPerLiter)}/L`;
};

export const getTransactionTypeBadge = (type) => {
  const badges = {
    refill: {
      text: 'Refill',
      className: 'bg-green-100 text-green-800 border-green-200',
    },
    withdrawal: {
      text: 'Withdrawal',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
    },
  };
  return badges[type?.toLowerCase()] || badges.refill;
};

export const getFuelTypeColor = (fuelType) => {
  const colors = {
    gasoline: 'text-red-600',
    diesel: 'text-yellow-600',
    premium: 'text-purple-600',
  };
  return colors[fuelType?.toLowerCase()] || 'text-gray-600';
};

export const exportToCSV = (data, filename = 'fuel_transactions') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = [
    'Date & Time',
    'Vehicle',
    'Plate Number',
    'Type',
    'Amount (L)',
    'Fuel Type',
    'Cost (MAD)',
    'Cost per Liter (MAD)',
    'Station',
    'Location',
    'Odometer',
    'Notes'
  ];

  const csvContent = [
    headers.join(','),
    ...data.map(transaction => [
      formatDate(transaction.transaction_date),
      transaction.vehicle?.name || 'N/A',
      transaction.vehicle?.plate_number || 'N/A',
      transaction.transaction_type,
      transaction.amount,
      transaction.fuel_type || 'N/A',
      transaction.cost || 'N/A',
      calculateCostPerLiter(transaction.cost, transaction.amount).toFixed(2),
      transaction.fuel_station || 'N/A',
      transaction.location || 'N/A',
      transaction.odometer_reading || 'N/A',
      `"${transaction.notes || ''}"` // Wrap notes in quotes to handle commas
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getQuickDateRanges = () => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  return {
    today: {
      label: 'Today',
      startDate: startOfToday,
      endDate: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1)
    },
    week: {
      label: '7 Days',
      startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: today
    },
    month: {
      label: '30 Days',
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: today
    },
    quarter: {
      label: '90 Days',
      startDate: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000),
      endDate: today
    }
  };
};