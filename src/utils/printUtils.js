// Utility functions for printing receipts and contracts
// This approach generates fresh HTML content in a new window (same pattern as WhatsApp sharing)
import { normalizePaymentStatus } from '../config/statusColors';

/**
 * Format currency for display
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

/**
 * Format date for display
 */
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Calculate total rental cost
 */
const calculateTotal = (rentalData) => {
  const basePrice = rentalData?.unit_price || rentalData?.total_amount || 0;
  const overage = rentalData?.overage_charge || 0;
  const extensions = rentalData?.extensions?.reduce((sum, ext) => 
    ext?.status === 'approved' ? sum + (ext?.extension_price || 0) : sum, 0) || 0;
  return basePrice + overage + extensions;
};

const getNormalizedPrintPaymentStatus = (rentalData) =>
  normalizePaymentStatus(rentalData?.payment_status, rentalData?.remaining_amount);

/**
 * Generate receipt HTML for printing
 */
export const generateReceiptHTML = (rentalData, logoUrl, stampUrl) => {
  const total = calculateTotal(rentalData);
  const damageDeposit = parseFloat(rentalData?.damage_deposit || 0);
  const remainingBalance = Math.max(0, total - (rentalData?.deposit_amount || 0));
  const depositReturn = Math.max(0, damageDeposit - remainingBalance);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipt - ${rentalData?.customer_name || 'Customer'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6;
          color: #333;
          background: white;
        }
        @page { 
          margin: 0.5in; 
          size: A4;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        .receipt-container { 
          max-width: 210mm; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { text-align: center; margin-bottom: 30px; }
        .header img { height: 60px; margin-bottom: 15px; }
        .badge { 
          background: #d1fae5; 
          color: #065f46; 
          padding: 8px 16px; 
          border-radius: 20px; 
          display: inline-block;
          margin-bottom: 10px;
        }
        h1 { font-size: 24px; margin-bottom: 5px; }
        .subtitle { color: #666; font-size: 14px; }
        .company-info { color: #999; font-size: 12px; margin-top: 10px; }
        .section { 
          border-top: 1px solid #ddd; 
          border-bottom: 1px solid #ddd; 
          padding: 15px 0; 
          margin: 20px 0; 
        }
        .section h2 { font-size: 18px; margin-bottom: 15px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .field { margin-bottom: 10px; }
        .field-label { font-size: 12px; color: #666; }
        .field-value { font-weight: 500; }
        .info-box { background: #f9fafb; padding: 15px; border-radius: 8px; }
        .breakdown { margin: 20px 0; }
        .breakdown-item { 
          display: flex; 
          justify-content: space-between; 
          padding: 10px 0; 
          border-bottom: 1px solid #eee; 
        }
        .breakdown-item:last-child { border-bottom: none; }
        .total { 
          border-top: 2px solid #333; 
          padding-top: 15px; 
          margin-top: 15px; 
        }
        .total .amount { font-size: 24px; color: #059669; font-weight: bold; }
        .status-box { 
          padding: 20px; 
          border-radius: 8px; 
          text-align: center; 
          margin: 20px 0; 
        }
        .status-paid { background: #d1fae5; border: 1px solid #10b981; }
        .status-pending { background: #fef3c7; border: 1px solid #f59e0b; }
        .deposit-box { 
          background: #f8fafc; 
          border-left: 4px solid #3b82f6; 
          padding: 20px; 
          border-radius: 8px; 
          margin: 20px 0; 
        }
        .footer { 
          border-top: 1px solid #ddd; 
          padding-top: 20px; 
          margin-top: 30px; 
          text-align: center; 
        }
        .verification { 
          display: flex; 
          justify-content: space-between; 
          margin-top: 30px; 
        }
        .note { 
          background: #dbeafe; 
          border: 1px solid #3b82f6; 
          padding: 15px; 
          border-radius: 8px; 
          margin: 20px 0; 
          font-size: 13px; 
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <!-- Header -->
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="SaharaX Rentals">` : ''}
          <div class="badge">💰 PAYMENT RECEIPT</div>
          <h1>PAYMENT CONFIRMATION</h1>
          <p class="subtitle">Financial Document • Not a Legal Contract</p>
          <div class="company-info">
            <p>Ave. Mohammed El Yazidi 43 Sect. 12 Bur. 34-3 Riad Rabat</p>
            <p>contact@saharax.co | +212658888852</p>
          </div>
        </div>

        <!-- Receipt Summary -->
        <div class="section">
          <h2>RECEIPT SUMMARY</h2>
          <div class="grid">
            <div class="field">
              <div class="field-label">Receipt Number</div>
              <div class="field-value">${rentalData?.id || 'N/A'}</div>
            </div>
            <div class="field">
              <div class="field-label">Date Issued</div>
              <div class="field-value">${new Date().toLocaleDateString()}</div>
            </div>
            <div class="field">
              <div class="field-label">Customer Name</div>
              <div class="field-value">${rentalData?.customer_name || 'N/A'}</div>
            </div>
            <div class="field">
              <div class="field-label">Phone</div>
              <div class="field-value">${rentalData?.customer_phone || 'N/A'}</div>
            </div>
          </div>
        </div>

        <!-- Rental Information -->
        <div class="section">
          <h2>Rental Information</h2>
          <div class="info-box">
            <div class="grid">
              <div class="field">
                <div class="field-label">Vehicle</div>
                <div class="field-value">${rentalData?.vehicle?.name || 'Not specified'}</div>
              </div>
              <div class="field">
                <div class="field-label">Rental Period</div>
                <div class="field-value">
                  ${formatDate(rentalData?.rental_start_date)} - ${formatDate(rentalData?.rental_end_date)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Breakdown -->
        <div class="breakdown">
          <h2>Payment Breakdown</h2>
          
          <div class="breakdown-item">
            <div>
              <div style="font-weight: 500;">Base Rental Rate</div>
              <div style="font-size: 12px; color: #666;">
                ${rentalData?.rental_type === 'daily' ? 'Daily' : 
                  rentalData?.rental_type === 'weekly' ? 'Weekly' : 
                  rentalData?.rental_type === 'monthly' ? 'Monthly' : 'Hourly'} Rental
              </div>
            </div>
            <div style="font-weight: 500;">${formatCurrency(rentalData?.unit_price || rentalData?.total_amount || 0)} MAD</div>
          </div>

          ${rentalData?.overage_charge > 0 ? `
          <div class="breakdown-item">
            <div>
              <div style="font-weight: 500;">Kilometer Overage</div>
              <div style="font-size: 12px; color: #666;">
                ${rentalData?.total_distance || 0} km total
              </div>
            </div>
            <div style="font-weight: 500; color: #dc2626;">+${formatCurrency(rentalData?.overage_charge)} MAD</div>
          </div>
          ` : ''}

          ${rentalData?.extensions?.filter(ext => ext?.status === 'approved').length > 0 ? `
          <div class="breakdown-item">
            <div style="font-weight: 500;">Extensions</div>
            <div>
              ${rentalData.extensions
                .filter(ext => ext?.status === 'approved')
                .map(ext => `
                  <div style="font-size: 12px; margin-bottom: 5px;">
                    +${ext?.extension_hours} hours: ${formatCurrency(ext?.extension_price)} MAD
                  </div>
                `).join('')}
            </div>
          </div>
          ` : ''}

          <div class="breakdown-item total">
            <div>
              <div style="font-size: 18px; font-weight: bold;">Grand Total</div>
              <div style="font-size: 12px; color: #666;">All charges included</div>
            </div>
            <div class="amount">${formatCurrency(total)} MAD</div>
          </div>
        </div>

        <!-- Payment Status -->
        <div class="status-box ${getNormalizedPrintPaymentStatus(rentalData) === 'paid' ? 'status-paid' : 'status-pending'}">
          <h3 style="margin-bottom: 15px;">
            ${getNormalizedPrintPaymentStatus(rentalData) === 'paid' ? '✅ PAYMENT STATUS: PAID IN FULL' : '⚠️ PAYMENT STATUS: BALANCE DUE'}
          </h3>
          <div class="grid">
            <div>
              <div style="font-size: 12px; color: #666;">Deposit Paid</div>
              <div style="font-size: 20px; font-weight: bold; color: #059669;">
                ${formatCurrency(rentalData?.deposit_amount || 0)} MAD
              </div>
            </div>
            <div>
              <div style="font-size: 12px; color: #666;">Remaining Balance</div>
              <div style="font-size: 20px; font-weight: bold; color: ${remainingBalance > 0 ? '#dc2626' : '#059669'};">
                ${formatCurrency(remainingBalance)} MAD
              </div>
            </div>
          </div>
          ${getNormalizedPrintPaymentStatus(rentalData) === 'paid' ? `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
            <p style="font-size: 12px;">Payment completed on: ${new Date().toLocaleDateString()}</p>
          </div>
          ` : ''}
        </div>

        <!-- Damage Deposit -->
        ${damageDeposit > 0 ? `
        <div class="deposit-box">
          <h3 style="margin-bottom: 15px;">💰 Damage Deposit Information</h3>
          <div class="breakdown-item">
            <span>Original Damage Deposit:</span>
            <span style="font-weight: bold;">${formatCurrency(damageDeposit)} MAD</span>
          </div>
          ${remainingBalance > 0 ? `
          <div class="breakdown-item" style="color: #dc2626;">
            <span>Less: Unpaid Balance:</span>
            <span style="font-weight: bold;">-${formatCurrency(remainingBalance)} MAD</span>
          </div>
          ` : ''}
          <div class="breakdown-item total">
            <span style="font-weight: bold;">Amount to Return:</span>
            <span style="font-weight: bold; color: #059669; font-size: 18px;">${formatCurrency(depositReturn)} MAD</span>
          </div>
        </div>
        ` : ''}

        <!-- Verification -->
        <div class="verification">
          <div>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Issued by</p>
            <div style="display: flex; align-items: center; gap: 10px;">
              ${stampUrl ? `<img src="${stampUrl}" alt="Stamp" style="height: 60px; opacity: 0.8;">` : ''}
              <div>
                <p style="font-weight: bold;">SaharaX Rentals</p>
                <p style="font-size: 12px; color: #666;">Authorized Representative</p>
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 12px; color: #666;">Verification Code</p>
            <p style="font-family: monospace; font-size: 18px; font-weight: bold;">
              ${rentalData?.id?.slice(-8) || 'VERIFIED'}
            </p>
            <p style="font-size: 10px; color: #999; margin-top: 5px;">Document ID: ${Date.now()}</p>
          </div>
        </div>

        <!-- Note -->
        <div class="note">
          <strong>NOTE:</strong> This is a payment receipt only. For rental terms and conditions, 
          please refer to your signed rental contract.
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>Thank you for choosing SaharaX Rentals. For any questions, contact +212658888852</p>
          <p style="font-size: 11px; color: #999; margin-top: 10px;">
            This receipt is electronically generated and does not require a signature.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate contract HTML for printing
 */
export const generateContractHTML = (rentalData, logoUrl, stampUrl) => {
  // Simplified contract HTML - you can expand this based on ContractTemplate.jsx
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Contract - ${rentalData?.customer_name || 'Customer'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6;
          color: #333;
          background: white;
        }
        @page { 
          margin: 0.5in; 
          size: A4;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        .contract-container { 
          max-width: 210mm; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { font-size: 24px; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        .section h2 { font-size: 18px; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="contract-container">
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="SaharaX Rentals" style="height: 60px; margin-bottom: 15px;">` : ''}
          <h1>RENTAL AGREEMENT</h1>
        </div>
        <div class="section">
          <h2>Contract Details</h2>
          <p><strong>Customer:</strong> ${rentalData?.customer_name || 'N/A'}</p>
          <p><strong>Vehicle:</strong> ${rentalData?.vehicle?.name || 'N/A'}</p>
          <p><strong>Contract ID:</strong> ${rentalData?.id || 'N/A'}</p>
        </div>
        <!-- Add more contract sections as needed -->
      </div>
    </body>
    </html>
  `;
};

/**
 * Harmonic print function that works for both receipt and contract
 * Uses the same approach as WhatsApp sharing - generates fresh HTML in a new window
 */
export const handleHarmonicPrint = (type, data, logoUrl, stampUrl) => {
  try {
    // Create new window
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      alert('Please allow pop-ups to print documents');
      return;
    }
    
    // Generate appropriate HTML
    const printHTML = type === 'receipt' 
      ? generateReceiptHTML(data, logoUrl, stampUrl)
      : generateContractHTML(data, logoUrl, stampUrl);
    
    // Write HTML to new window
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        // Close window after printing (optional)
        // printWindow.close();
      }, 250);
    };
  } catch (error) {
    console.error('Print error:', error);
    alert('Failed to open print window. Please try again.');
  }
};
