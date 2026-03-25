import React from 'react';

const RentalContract = React.forwardRef(({ rental }, ref) => {
  if (!rental) return null;

  const {
    id,
    customer_name,
    customer_email,
    customer_phone,
    linked_display_id,
    vehicle,
    rental_start_date,
    rental_end_date,
    pickup_location,
    rental_type,
    total_amount,
    deposit_amount,
    remaining_amount,
    damage_deposit,
    payment_status,
    insurance_included,
    helmet_included,
    gear_included,
    contract_signed
  } = rental;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div ref={ref} className="p-8 bg-white text-black font-sans">
      <style>
        {`
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .no-print {
              display: none;
            }
            .page-break {
              page-break-after: always;
            }
          }
        `}
      </style>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b-2 border-black">
          <div>
            <h1 className="text-3xl font-bold">Rental Agreement</h1>
            <p className="text-sm">SaharaX Adventures</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Rental ID: {id}</p>
            <p className="text-sm">Date: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Parties Involved */}
        <div className="my-6">
          <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Parties</h2>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold">Renter (Customer)</h3>
              <p><strong>Name:</strong> {customer_name || 'N/A'}</p>
              <p><strong>Email:</strong> {customer_email || 'N/A'}</p>
              <p><strong>Phone:</strong> {customer_phone || 'N/A'}</p>
              <p><strong>ID/License:</strong> {linked_display_id || 'N/A'}</p>
            </div>
            <div>
              <h3 className="font-semibold">Provider</h3>
              <p><strong>Company:</strong> SaharaX Adventures</p>
              <p><strong>Address:</strong> 123 Desert Road, Merzouga, Morocco</p>
              <p><strong>Phone:</strong> +212 123 456 789</p>
            </div>
          </div>
        </div>

        {/* Vehicle Details */}
        <div className="my-6">
          <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Vehicle Details</h2>
          <div className="grid grid-cols-2 gap-8">
            <p><strong>Vehicle:</strong> {vehicle?.name || 'N/A'}</p>
            <p><strong>Model:</strong> {vehicle?.model || 'N/A'}</p>
            <p><strong>Plate Number:</strong> {vehicle?.plate_number || 'N/A'}</p>
            <p><strong>Type:</strong> {vehicle?.vehicle_type || 'N/A'}</p>
          </div>
        </div>

        {/* Rental Period */}
        <div className="my-6">
          <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Rental Period & Terms</h2>
          <div className="grid grid-cols-2 gap-8">
            <p><strong>Start:</strong> {formatDate(rental_start_date)}</p>
            <p><strong>End:</strong> {formatDate(rental_end_date)}</p>
            <p><strong>Rental Type:</strong> <span className="capitalize">{rental_type || 'N/A'}</span></p>
            <p><strong>Pickup Location:</strong> {pickup_location || 'N/A'}</p>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="my-6">
          <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Financial Summary</h2>
          <table className="w-full">
            <tbody>
              <tr className="border-b">
                <td className="py-2">Total Rental Cost:</td>
                <td className="text-right font-semibold">{total_amount || 0} MAD</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Deposit Paid:</td>
                <td className="text-right">{deposit_amount || 0} MAD</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 font-bold">Remaining Due:</td>
                <td className="text-right font-bold text-red-600">{remaining_amount || 0} MAD</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Damage Deposit (Refundable):</td>
                <td className="text-right">{damage_deposit || 0} MAD</td>
              </tr>
            </tbody>
          </table>
           <p className="text-right mt-2"><strong>Payment Status:</strong> <span className="capitalize">{payment_status || 'Pending'}</span></p>
        </div>
        
        {/* Inclusions */}
        <div className="my-6">
            <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Inclusions & Add-ons</h2>
            <div className="grid grid-cols-3 gap-4">
                <p><strong>Insurance:</strong> {insurance_included ? 'Yes' : 'No'}</p>
                <p><strong>Helmet:</strong> {helmet_included ? 'Yes' : 'No'}</p>
                <p><strong>Gear:</strong> {gear_included ? 'Yes' : 'No'}</p>
            </div>
        </div>

        {/* Terms and Conditions */}
        <div className="my-8 text-xs">
          <h2 className="text-xl font-bold mb-3 border-b border-gray-400 pb-1">Terms & Conditions</h2>
          <p className="mb-2">1. The renter agrees to operate the vehicle in a safe and responsible manner.</p>
          <p className="mb-2">2. Any damage to the vehicle during the rental period is the responsibility of the renter. The damage deposit will be used to cover repair costs.</p>
          <p className="mb-2">3. The vehicle must be returned at the agreed-upon time and location. Late returns will incur additional charges.</p>
          <p className="mb-2">4. SaharaX Adventures is not responsible for any personal injury or loss of property.</p>
        </div>

        {/* Signature Area */}
        <div className="mt-16 pt-8 border-t-2 border-black">
          <div className="grid grid-cols-2 gap-16">
            <div>
              <div className="w-full h-12 border-b border-black"></div>
              <p className="mt-2 text-center">Renter's Signature</p>
            </div>
            <div>
              <div className="w-full h-12 border-b border-black"></div>
              <p className="mt-2 text-center">SaharaX Adventures Agent Signature</p>
            </div>
          </div>
        </div>
         <div className="text-center mt-8 text-sm">
            <p>Contract Status: <strong>{contract_signed ? 'Signed' : 'Not Signed'}</strong></p>
        </div>
      </div>
    </div>
  );
});

export default RentalContract;