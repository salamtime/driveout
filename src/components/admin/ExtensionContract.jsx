/**
 * Extension Contract Component
 * Generates a contract document for rental extensions
 */

import React from 'react';
import { format } from 'date-fns';

const ExtensionContract = ({ rental, extension, originalContract }) => {
  if (!rental || !extension) return null;

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), 'PPpp');
    } catch {
      return dateString;
    }
  };

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const originalEndDate = rental.original_end_date || rental.rental_end_date;
  const newEndDate = rental.rental_end_date;
  const totalWithExtensions = (parseFloat(rental.total_amount) || 0) + (parseFloat(rental.total_extension_price) || 0);

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">RENTAL EXTENSION AGREEMENT</h1>
        <p className="text-sm text-gray-600">Extension Contract #{extension.id?.substring(0, 8)}</p>
        <p className="text-xs text-gray-500 mt-1">Date Issued: {formatDate(extension.requested_at)}</p>
      </div>

      {/* Company Info */}
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold text-gray-800">Your Company Name</h2>
        <p className="text-sm text-gray-600">Address Line 1, City, Country</p>
        <p className="text-sm text-gray-600">Phone: +XXX XXX XXX | Email: info@company.com</p>
      </div>

      {/* Extension Details */}
      <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-600">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Extension Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Original Rental ID:</p>
            <p className="font-medium">{rental.id?.substring(0, 8)}</p>
          </div>
          <div>
            <p className="text-gray-600">Extension Hours:</p>
            <p className="font-medium text-blue-600">{extension.extension_hours} hours</p>
          </div>
          <div>
            <p className="text-gray-600">Original End Date:</p>
            <p className="font-medium">{formatDate(originalEndDate)}</p>
          </div>
          <div>
            <p className="text-gray-600">New End Date:</p>
            <p className="font-medium text-green-600">{formatDate(newEndDate)}</p>
          </div>
        </div>
      </div>

      {/* Customer Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Customer Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Full Name:</p>
            <p className="font-medium">{rental.customer_name}</p>
          </div>
          <div>
            <p className="text-gray-600">Phone:</p>
            <p className="font-medium">{rental.customer_phone}</p>
          </div>
          <div>
            <p className="text-gray-600">Email:</p>
            <p className="font-medium">{rental.customer_email}</p>
          </div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Vehicle Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Vehicle:</p>
            <p className="font-medium">{rental.vehicle?.name} {rental.vehicle?.model}</p>
          </div>
          <div>
            <p className="text-gray-600">Plate Number:</p>
            <p className="font-medium">{rental.vehicle?.plate_number}</p>
          </div>
        </div>
      </div>

      {/* Financial Breakdown */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Financial Details</h3>
        
        {/* Tier Breakdown if available */}
        {extension.tier_breakdown && Array.isArray(extension.tier_breakdown) && extension.tier_breakdown.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm font-medium text-gray-700 mb-2">Extension Price Breakdown:</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">Hours</th>
                  <th className="text-right py-1">Rate/Hour</th>
                  <th className="text-right py-1">Discount</th>
                  <th className="text-right py-1">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {extension.tier_breakdown.map((tier, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-1">{tier.hours_in_tier}h</td>
                    <td className="text-right">{formatPrice(tier.rate_per_hour)}</td>
                    <td className="text-right text-green-600">
                      {tier.discount_percentage ? `${tier.discount_percentage}%` : '-'}
                    </td>
                    <td className="text-right font-medium">{formatPrice(tier.tier_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Original Rental Amount:</span>
            <span className="font-medium">{formatPrice(rental.total_amount)}</span>
          </div>
          <div className="flex justify-between text-blue-600">
            <span className="font-medium">Extension Fee ({extension.extension_hours} hours):</span>
            <span className="font-bold">+{formatPrice(extension.extension_price)}</span>
          </div>
          {rental.extension_count > 1 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>Previous Extensions:</span>
              <span>{formatPrice((rental.total_extension_price || 0) - extension.extension_price)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-gray-300 text-lg">
            <span className="font-bold text-gray-900">New Total Amount:</span>
            <span className="font-bold text-green-600">{formatPrice(totalWithExtensions)}</span>
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Extension Terms & Conditions</h3>
        <div className="text-xs text-gray-700 space-y-2">
          <p>1. This extension agreement is an addendum to the original rental contract dated {formatDate(rental.rental_start_date)}.</p>
          <p>2. All terms and conditions of the original rental agreement remain in full effect unless explicitly modified herein.</p>
          <p>3. The rental period is extended by {extension.extension_hours} hours, with the new return date being {formatDate(newEndDate)}.</p>
          <p>4. The extension fee of {formatPrice(extension.extension_price)} is due immediately upon approval of this extension.</p>
          <p>5. Late return beyond the new end date may result in additional charges as per the original rental agreement.</p>
          <p>6. The customer agrees to maintain the vehicle in the same condition and follow all safety guidelines.</p>
          <p>7. Insurance coverage (if applicable) is extended for the duration of this extension period.</p>
          {extension.notes && <p>8. Additional Notes: {extension.notes}</p>}
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        <div className="border-t-2 border-gray-400 pt-2">
          <p className="text-sm font-medium text-gray-700">Customer Signature</p>
          <p className="text-xs text-gray-500 mt-1">Date: {formatDate(extension.approved_at || new Date())}</p>
        </div>
        <div className="border-t-2 border-gray-400 pt-2">
          <p className="text-sm font-medium text-gray-700">Company Representative</p>
          <p className="text-xs text-gray-500 mt-1">Date: {formatDate(extension.approved_at || new Date())}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
        <p>This is a legally binding extension agreement. Please retain a copy for your records.</p>
        <p className="mt-1">For questions or concerns, contact us at support@company.com</p>
      </div>
    </div>
  );
};

export default ExtensionContract;