// Invoice PDF Generator Service
// This service generates PDF invoices for rentals

class InvoicePDFGenerator {
  static async generateInvoice(invoiceData) {
    try {
      console.log('🧾 Generating invoice PDF with data:', invoiceData);
      
      // Create a simple HTML content for the invoice
      const htmlContent = this.generateInvoiceHTML(invoiceData);
      
      // For now, we'll create a simple text-based "PDF" (actually a text file)
      // In a real implementation, you would use a library like jsPDF or Puppeteer
      const blob = new Blob([htmlContent], { type: 'text/html' });
      
      console.log('✅ Invoice PDF generated successfully');
      return blob;
      
    } catch (error) {
      console.error('❌ Error generating invoice PDF:', error);
      throw new Error('Failed to generate invoice PDF: ' + error.message);
    }
  }
  
  static generateInvoiceHTML(invoiceData) {
    const {
      invoiceNumber,
      issueDate,
      rentalId,
      customer,
      rental,
      payment,
      notes,
      specialRequirements
    } = invoiceData;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Invoice ${invoiceNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .invoice-details { margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .section h3 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { font-weight: bold; font-size: 1.2em; color: #2563eb; }
        .footer { margin-top: 30px; text-align: center; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>RENTAL INVOICE</h1>
        <h2>Invoice #${invoiceNumber}</h2>
        <p>Issue Date: ${issueDate}</p>
    </div>
    
    <div class="invoice-details">
        <div class="row">
            <span><strong>Rental ID:</strong> ${rentalId}</span>
            <span><strong>Date:</strong> ${issueDate}</span>
        </div>
    </div>
    
    <div class="section">
        <h3>Customer Information</h3>
        <div class="row"><span><strong>Name:</strong></span><span>${customer.name}</span></div>
        <div class="row"><span><strong>Email:</strong></span><span>${customer.email}</span></div>
        <div class="row"><span><strong>Phone:</strong></span><span>${customer.phone}</span></div>
        <div class="row"><span><strong>Address:</strong></span><span>${customer.address}</span></div>
    </div>
    
    <div class="section">
        <h3>Rental Details</h3>
        <div class="row"><span><strong>Vehicle:</strong></span><span>${rental.vehicle}</span></div>
        <div class="row"><span><strong>Model:</strong></span><span>${rental.model}</span></div>
        <div class="row"><span><strong>Type:</strong></span><span>${rental.type}</span></div>
        <div class="row"><span><strong>Start Date:</strong></span><span>${rental.startDate}</span></div>
        <div class="row"><span><strong>End Date:</strong></span><span>${rental.endDate}</span></div>
        <div class="row"><span><strong>Pickup Location:</strong></span><span>${rental.pickupLocation}</span></div>
        <div class="row"><span><strong>Dropoff Location:</strong></span><span>${rental.dropoffLocation}</span></div>
    </div>
    
    <div class="section">
        <h3>Pricing Breakdown</h3>
        <div class="row"><span><strong>Unit Price:</strong></span><span>${rental.unitPrice} MAD</span></div>
        <div class="row"><span><strong>Quantity:</strong></span><span>${rental.quantity}</span></div>
        <div class="row"><span><strong>Subtotal:</strong></span><span>${rental.subtotal} MAD</span></div>
        <div class="row"><span><strong>Transport Fee:</strong></span><span>${rental.transportFee} MAD</span></div>
        <div class="row total"><span><strong>Total Amount:</strong></span><span>${rental.totalAmount} MAD</span></div>
    </div>
    
    <div class="section">
        <h3>Payment Information</h3>
        <div class="row"><span><strong>Payment Status:</strong></span><span>${payment.status}</span></div>
        <div class="row"><span><strong>Deposit Amount:</strong></span><span>${payment.depositAmount} MAD</span></div>
        <div class="row"><span><strong>Remaining Balance:</strong></span><span>${payment.remaining} MAD</span></div>
        <div class="row"><span><strong>Damage Deposit:</strong></span><span>${payment.damageDeposit} MAD</span></div>
    </div>
    
    ${notes ? `
    <div class="section">
        <h3>Notes</h3>
        <p>${notes}</p>
    </div>
    ` : ''}
    
    ${specialRequirements ? `
    <div class="section">
        <h3>Special Requirements</h3>
        <p>${specialRequirements}</p>
    </div>
    ` : ''}
    
    <div class="footer">
        <p>Thank you for your business!</p>
        <p>This invoice was generated on ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
    `;
  }
}

export default InvoicePDFGenerator;