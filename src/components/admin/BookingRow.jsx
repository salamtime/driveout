import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

const BookingRow = memo(({ booking, onStatusChange, onDelete }) => {
  const { t } = useTranslation();

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          {booking.customerName || 'Unknown Customer'}
        </div>
        <div className="text-sm text-gray-500">
          {booking.customerEmail || 'No email'}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {booking.vehicleId || 'N/A'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{formatDate(booking.startDate)}</div>
        <div className="text-sm text-gray-500">{formatDate(booking.endDate)}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(booking.status)}`}>
          {booking.status || 'pending'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        ${booking.totalAmount || '0.00'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <select
          value={booking.status || 'pending'}
          onChange={(e) => onStatusChange(booking.id, e.target.value)}
          className="text-sm border-gray-300 rounded-md mr-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="pending">{t('admin.bookings.pending', 'Pending')}</option>
          <option value="confirmed">{t('admin.bookings.confirmed', 'Confirmed')}</option>
          <option value="completed">{t('admin.bookings.completed', 'Completed')}</option>
          <option value="cancelled">{t('admin.bookings.cancelled', 'Cancelled')}</option>
        </select>
        <button
          onClick={() => onDelete(booking.id)}
          className="text-red-600 hover:text-red-900 ml-2"
        >
          {t('admin.bookings.delete', 'Delete')}
        </button>
      </td>
    </tr>
  );
});

BookingRow.displayName = 'BookingRow';

export default BookingRow;