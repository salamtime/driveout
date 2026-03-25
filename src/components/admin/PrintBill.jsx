import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatMAD } from '../../utils/pricingHelpers';

const PrintBill = ({ rentalData, vehicles, onClose }) => {
  const { t } = useTranslation();
  
  if (!rentalData) return null;

  // Find the selected vehicle details
  const selectedVehicle = vehicles?.find(v => v.id === rentalData.vehicle_id);
  
  // Format dates for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate duration display
  const getDurationDisplay = () => {
    if (!rentalData.rental_start_date || !rentalData.rental_end_date) return 'N/A';
    
    const start = new Date(rentalData.rental_start_date);
    const end = new Date(rentalData.rental_end_date);
    const diffMs = end - start;
    
    if (rentalData.rental_type === 'hourly') {
      const hours = diffMs / (1000 * 60 * 60);
      return `${Math.ceil(hours * 2) / 2} hours`;
    } else {
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return `${days} days`;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Get translated payment status
  const getPaymentStatusText = (status) => {
    switch (status) {
      case 'paid_in_full':
        return t('admin.rentals.paymentStatus.paidInFull');
      case 'partial':
        return t('admin.rentals.paymentStatus.partial');
      case 'refunded':
        return t('admin.rentals.paymentStatus.refunded');
      case 'unpaid':
      default:
        return t('admin.rentals.paymentStatus.unpaid');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        {/* Print styles */}
        <style jsx>{`
          @media print {
            .no-print {
              display: none !important;
            }
            .print-container {
              box-shadow: none !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: none !important;
            }
            body {
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
            }
          }
        `}</style>

        <div className="print-container">
          {/* Header with action buttons */}
          <div className="flex justify-between items-center mb-6 no-print">
            <h2 className="text-xl font-bold text-gray-900">Rental Invoice</h2>
            <div className="flex space-x-2">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          {/* Invoice Header */}
          <div className="border-b-2 border-gray-200 pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">QuadVenture</h1>
                <p className="text-gray-600">ATV Rental Services</p>
                <p className="text-gray-600">Marrakech, Morocco</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">RENTAL INVOICE</h2>
                <p className="text-gray-600">Invoice #: {rentalData.id || 'DRAFT'}</p>
                <p className="text-gray-600">Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Bill To:</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-900">{rentalData.customer_name || 'N/A'}</p>
                {rentalData.customer_email && (
                  <p className="text-gray-600">{rentalData.customer_email}</p>
                )}
                {rentalData.customer_phone && (
                  <p className="text-gray-600">{rentalData.customer_phone}</p>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Rental Details:</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p><span className="font-medium">Vehicle:</span> {selectedVehicle?.model || selectedVehicle?.name || 'N/A'}</p>
                <p><span className="font-medium">Plate:</span> {selectedVehicle?.plate_number || 'N/A'}</p>
                <p><span className="font-medium">Type:</span> {rentalData.rental_type || 'N/A'}</p>
                <p><span className="font-medium">Duration:</span> {getDurationDisplay()}</p>
              </div>
            </div>
          </div>

          {/* Rental Period */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Rental Period:</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-gray-700">Start Date & Time:</p>
                  <p className="text-gray-900">{formatDate(rentalData.rental_start_date)}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">End Date & Time:</p>
                  <p className="text-gray-900">{formatDate(rentalData.rental_end_date)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Location Information */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Location Details:</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-gray-700">Pickup Location:</p>
                  <p className="text-gray-900">{rentalData.pickup_location || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Drop-off Location:</p>
                  <p className="text-gray-900">{rentalData.dropoff_location || rentalData.pickup_location || 'Same as pickup'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* FINAL: Financial Breakdown with complete *_amount field consistency */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Financial Breakdown:</h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Base Rental */}
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rentalData.rental_type === 'hourly' ? 'Hourly' : 'Daily'} Rental 
                      ({rentalData.quantity || 0} {rentalData.rental_type === 'hourly' ? 'hours' : 'days'} × {formatMAD(rentalData.unit_price_mad || 0)})
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatMAD(rentalData.subtotal_mad || 0)}
                    </td>
                  </tr>

                  {/* Transport Fees */}
                  {(rentalData.transport_pickup || rentalData.transport_dropoff) && (
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Transport Services
                        {rentalData.transport_pickup && rentalData.transport_dropoff ? ' (Pickup & Drop-off)' :
                         rentalData.transport_pickup ? ' (Pickup)' : ' (Drop-off)'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatMAD(rentalData.transport_fee_mad || 0)}
                      </td>
                    </tr>
                  )}

                  {/* FINAL: Total Amount - Use total_amount (DB field) */}
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Total Amount
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {formatMAD(rentalData.total_amount || 0)}
                    </td>
                  </tr>

                  {/* FINAL: Deposit Amount - Use deposit_amount (DB field) */}
                  {(rentalData.deposit_amount || 0) > 0 && (
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Deposit Paid
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        -{formatMAD(rentalData.deposit_amount || 0)}
                      </td>
                    </tr>
                  )}

                  {/* FINAL: Damage Deposit - Use damage_deposit (DB field) */}
                  {(rentalData.damage_deposit || 0) > 0 && (
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        Damage Deposit (Security)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatMAD(rentalData.damage_deposit || 0)}
                      </td>
                    </tr>
                  )}

                  {/* FINAL: Remaining Balance - Use remaining_amount (DB computed field) */}
                  <tr className="bg-yellow-50 border-t-2 border-yellow-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {(rentalData.remaining_amount || 0) > 0 ? 'Remaining Balance' : 'Balance'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatMAD(rentalData.remaining_amount || 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Status */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Payment Status:</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  rentalData.payment_status === 'paid_in_full' ? 'bg-green-100 text-green-800' :
                  rentalData.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                  rentalData.payment_status === 'refunded' ? 'bg-gray-100 text-gray-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {getPaymentStatusText(rentalData.payment_status)}
                </span>
                <span className="ml-3 text-gray-600">
                  Status: {rentalData.rental_status || 'Active'}
                </span>
              </div>
            </div>
          </div>

          {/* Services Included */}
          {(rentalData.insurance_included || rentalData.helmet_included || rentalData.gear_included) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Services Included:</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {rentalData.insurance_included && (
                    <div className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-gray-900">Insurance</span>
                    </div>
                  )}
                  {rentalData.helmet_included && (
                    <div className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-gray-900">Helmet</span>
                    </div>
                  )}
                  {rentalData.gear_included && (
                    <div className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-gray-900">Safety Gear</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {rentalData.notes && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Additional Notes:</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-900 whitespace-pre-wrap">{rentalData.notes}</p>
              </div>
            </div>
          )}

          {/* Terms and Conditions */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Terms & Conditions:</h3>
            <div className="text-sm text-gray-600 space-y-2">
              <p>• Rental period starts and ends at the specified times above.</p>
              <p>• Customer is responsible for any damages to the vehicle during the rental period.</p>
              <p>• Damage deposit will be refunded upon return of vehicle in original condition.</p>
              <p>• Late returns may incur additional charges.</p>
              <p>• Customer must have a valid driver's license and be at least 18 years old.</p>
              <p>• QuadVenture reserves the right to inspect the vehicle before and after rental.</p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-6 mt-6 text-center text-sm text-gray-500">
            <p>Thank you for choosing QuadVenture ATV Rentals!</p>
            <p>For questions or support, please contact us.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintBill;