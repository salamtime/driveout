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
    <title>Facture ${invoiceNumber}</title>
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
        <h1>FACTURE DE LOCATION</h1>
        <h2>Facture n°${invoiceNumber}</h2>
        <p>Date d'émission : ${issueDate}</p>
    </div>
    
    <div class="invoice-details">
        <div class="row">
            <span><strong>ID location :</strong> ${rentalId}</span>
            <span><strong>Date :</strong> ${issueDate}</span>
        </div>
    </div>
    
    <div class="section">
        <h3>Informations client</h3>
        <div class="row"><span><strong>Nom :</strong></span><span>${customer.name}</span></div>
        <div class="row"><span><strong>E-mail :</strong></span><span>${customer.email}</span></div>
        <div class="row"><span><strong>Téléphone :</strong></span><span>${customer.phone}</span></div>
        <div class="row"><span><strong>Adresse :</strong></span><span>${customer.address}</span></div>
    </div>
    
    <div class="section">
        <h3>Détails de la location</h3>
        <div class="row"><span><strong>Véhicule :</strong></span><span>${rental.vehicle}</span></div>
        <div class="row"><span><strong>Modèle :</strong></span><span>${rental.model}</span></div>
        <div class="row"><span><strong>Type :</strong></span><span>${rental.type}</span></div>
        <div class="row"><span><strong>Date de début :</strong></span><span>${rental.startDate}</span></div>
        <div class="row"><span><strong>Date de fin :</strong></span><span>${rental.endDate}</span></div>
        <div class="row"><span><strong>Lieu de prise en charge :</strong></span><span>${rental.pickupLocation}</span></div>
        <div class="row"><span><strong>Lieu de restitution :</strong></span><span>${rental.dropoffLocation}</span></div>
    </div>
    
    <div class="section">
        <h3>Détail des prix</h3>
        <div class="row"><span><strong>Prix unitaire :</strong></span><span>${rental.unitPrice} MAD</span></div>
        <div class="row"><span><strong>Quantité :</strong></span><span>${rental.quantity}</span></div>
        <div class="row"><span><strong>Sous-total :</strong></span><span>${rental.subtotal} MAD</span></div>
        <div class="row"><span><strong>Frais de transport :</strong></span><span>${rental.transportFee} MAD</span></div>
        <div class="row total"><span><strong>Montant total :</strong></span><span>${rental.totalAmount} MAD</span></div>
    </div>
    
    <div class="section">
        <h3>Informations de paiement</h3>
        <div class="row"><span><strong>Statut du paiement :</strong></span><span>${payment.status}</span></div>
        <div class="row"><span><strong>Montant de l’acompte :</strong></span><span>${payment.depositAmount} MAD</span></div>
        <div class="row"><span><strong>Solde restant :</strong></span><span>${payment.remaining} MAD</span></div>
        <div class="row"><span><strong>Caution dommages :</strong></span><span>${payment.damageDeposit} MAD</span></div>
    </div>
    
    ${notes ? `
    <div class="section">
        <h3>Notes</h3>
        <p>${notes}</p>
    </div>
    ` : ''}
    
    ${specialRequirements ? `
    <div class="section">
        <h3>Exigences particulières</h3>
        <p>${specialRequirements}</p>
    </div>
    ` : ''}
    
    <div class="footer">
        <p>Merci pour votre confiance !</p>
        <p>Cette facture a été générée le ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
    `;
  }
}

export default InvoicePDFGenerator;
