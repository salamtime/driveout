import React, { useState } from 'react';
import { X, Calendar, Car, Fuel, DollarSign, FileText, Image as ImageIcon, Truck, Database, Download, User, History } from 'lucide-react';
import { formatVehicleLabel } from '../../utils/vehicleLabels';
import { getFuelTransactionVisual } from '../../utils/fuelVisuals';
import i18n from '../../i18n';

const TransactionDetailsModal = ({ isOpen, onClose, transaction, modalType = 'vehicle' }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [imageError, setImageError] = useState(false);

  if (!isOpen || !transaction) return null;

  // Helper function to download image
  const handleDownloadImage = (url) => {
    if (!url) {
      console.error('❌ No URL provided for download');
      return;
    }
    
    // Open in new tab and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `invoice_${transaction.id || 'unknown'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Format time
  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Calculate price per liter
  const calculatePricePerLiter = () => {
    const amount = parseFloat(transaction.amount || transaction.liters || transaction.liters_added || 0);
    const cost = parseFloat(transaction.cost || transaction.total_cost || 0);
    
    if (amount > 0) {
      return (cost / amount).toFixed(2);
    }
    return transaction.price_per_liter || transaction.unit_price || '0.00';
  };

  // Get vehicle name
  const getVehicleName = () => {
    if (transaction.vehicle_name) return transaction.vehicle_name;
    if (transaction.saharax_0u4w4d_vehicles) {
      return formatVehicleLabel(transaction.saharax_0u4w4d_vehicles);
    }
    return 'N/A';
  };

  // Get quantity
  const getQuantity = () => {
    return transaction.amount || transaction.liters || transaction.liters_added || 0;
  };

  // Get total cost
  const getTotalCost = () => {
    return transaction.cost || transaction.total_cost || 0;
  };

  // Get date
  const getDate = () => {
    return transaction.transaction_date || transaction.refill_date || transaction.created_at;
  };

  // Get invoice URL - STANDARDIZED to use ONLY invoice_image
  const getInvoiceUrl = () => {
    const imageData = transaction.receipt_media || transaction.invoice_image;

    if (!imageData) {
      return null;
    }

    // Handle JSONB object format
    if (typeof imageData === 'object') {
      // Any saved object with inline data should render directly.
      if (imageData.data) {
        return imageData.data;
      }
      
      // Any saved object with a URL should render directly.
      if (imageData.url) {
        return imageData.url;
      }
    }

    // Handle legacy string URL (for backward compatibility)
    if (typeof imageData === 'string') {
      return imageData;
    }

    return null;
  };

  // Render invoice image
  const renderInvoiceImage = () => {
    const imageUrl = getInvoiceUrl();
    
    if (!imageUrl) {
      return (
        <div className="text-gray-500 text-sm">
          {transaction.transaction_type === 'vehicle_refill' ? 'No receipt or fuel photo uploaded' : 'No invoice image uploaded'}
        </div>
      );
    }

    return (
      <div className="mt-2">
        {!imageError ? (
          <img
            src={imageUrl}
            alt="Invoice"
            className="max-w-full h-48 object-contain rounded border cursor-pointer hover:opacity-90 transition-opacity"
            onError={() => {
              setImageError(true);
            }}
            onClick={() => window.open(imageUrl, '_blank')}
          />
        ) : (
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded border">
            <div className="text-center text-gray-500">
              <ImageIcon className="mx-auto h-12 w-12 mb-2" />
              <p className="text-sm">Preview not available</p>
              <p className="text-xs mt-1 break-all px-4">Click download to view</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Get appropriate icon based on modal type
  const getIcon = () => {
    if (modalType === 'tank') {
      return <Database className="h-5 w-5 text-blue-600" />;
    }
    return <Car className="h-5 w-5 text-blue-600" />;
  };

  // Get modal title based on type
  const getTitle = () => {
    if (transaction.transaction_type === 'withdrawal') return tr('Transfer Details', 'Détails du transfert');
    if (transaction.transaction_type === 'rental_opening_level') return tr('Rental Opening Fuel', "Carburant d'ouverture de location");
    if (transaction.transaction_type === 'rental_closing_level') return tr('Rental Return Fuel', 'Carburant au retour de location');
    if (transaction.transaction_type === 'manual_adjustment') return tr('Manual Fuel Adjustment', 'Ajustement manuel du carburant');
    if (modalType === 'tank') return tr('Tank In Details', "Détails d'entrée cuve");
    return tr('Direct Fill Details', 'Détails du remplissage direct');
  };

  const getMediaLabel = () => {
    if (transaction.transaction_type === 'vehicle_refill') return tr('Receipt / Fuel Photo', 'Reçu / photo carburant');
    if (transaction.transaction_type === 'tank_refill') return tr('Invoice Image', 'Image de facture');
    return tr('Attachment', 'Pièce jointe');
  };

  const invoiceUrl = getInvoiceUrl();
  const transactionVisual = getFuelTransactionVisual(transaction.transaction_type);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {getIcon()}
            <span>{transactionVisual.emoji}</span>
            {getTitle()}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Date */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{tr('Date', 'Date')}</p>
              <p className="text-sm text-gray-900">{formatDate(getDate())}</p>
            </div>
          </div>

          {/* Vehicle or Tank */}
          {modalType === 'tank' ? (
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{tr('Target Tank', 'Cuve cible')}</p>
                <p className="text-sm text-gray-900">{tr('Main Storage Tank', 'Cuve de stockage principale')}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Car className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{tr('Vehicle', 'Véhicule')}</p>
                <p className="text-sm text-gray-900">{getVehicleName()}</p>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="flex items-start gap-3">
            <Fuel className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{tr('Quantity', 'Quantité')}</p>
              <p className="text-sm text-gray-900">{getQuantity()} L</p>
            </div>
          </div>

          {/* Price per Liter */}
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{tr('Price per Liter', 'Prix par litre')}</p>
              <p className="text-sm text-gray-900">{calculatePricePerLiter()} MAD</p>
            </div>
          </div>

          {/* Total Cost */}
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{tr('Total Cost', 'Coût total')}</p>
              <p className="text-sm text-gray-900 font-semibold">{getTotalCost()} MAD</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{tr('Performed By', 'Effectué par')}</p>
              <p className="text-sm text-gray-900">{transaction.performed_by_name || transaction.filled_by || tr('System', 'Système')}</p>
            </div>
          </div>

          {(transaction.fuel_lines_before !== null && transaction.fuel_lines_before !== undefined) ||
          (transaction.fuel_lines_after !== null && transaction.fuel_lines_after !== undefined) ? (
            <div className="flex items-start gap-3">
              <History className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{tr('Fuel State Change', "Changement de niveau carburant")}</p>
                <p className="text-sm text-gray-900">
                  {transaction.fuel_lines_before ?? '—'}/8 lines {'->'} {transaction.fuel_lines_after ?? '—'}/8 lines
                </p>
              </div>
            </div>
          ) : null}

          {/* Media */}
          {(transaction.transaction_type !== 'withdrawal' || invoiceUrl) && (
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">{getMediaLabel()}</p>
                {invoiceUrl && (
                  <button
                    onClick={() => handleDownloadImage(invoiceUrl)}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    {tr('Download', 'Télécharger')}
                  </button>
                )}
              </div>
              {renderInvoiceImage()}
            </div>
          </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500">
              {tr('Created', 'Créé')} : {formatDate(transaction.created_at)}, {formatTime(transaction.created_at)}
            </p>
            {transaction.id && (
              <p className="text-xs text-gray-500 mt-1">
                {tr('Transaction ID', 'ID transaction')} : {transaction.transaction_id || `refill-${transaction.id}`}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsModal;
