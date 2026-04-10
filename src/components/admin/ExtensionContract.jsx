/**
 * Extension Contract Component
 * Generates a contract document for rental extensions
 */

import React from 'react';
import { format } from 'date-fns';
import i18n from '../../i18n';

const ExtensionContract = ({ rental, extension, originalContract }) => {
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr('RENTAL EXTENSION AGREEMENT', "CONTRAT DE PROLONGATION DE LOCATION")}</h1>
        <p className="text-sm text-gray-600">{tr('Extension Contract', 'Contrat de prolongation')} #{extension.id?.substring(0, 8)}</p>
        <p className="text-xs text-gray-500 mt-1">{tr('Date Issued:', "Date d'émission :")} {formatDate(extension.requested_at)}</p>
      </div>

      {/* Company Info */}
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold text-gray-800">SaharaX Rentals</h2>
        <p className="text-sm text-gray-600">{tr('Address line, city, country', 'Adresse, ville, pays')}</p>
        <p className="text-sm text-gray-600">{tr('Phone:', 'Téléphone :')} +XXX XXX XXX | Email: info@company.com</p>
      </div>

      {/* Extension Details */}
      <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-600">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">{tr('Extension Summary', "Résumé de la prolongation")}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">{tr('Original Rental ID:', "ID location d'origine :")}</p>
            <p className="font-medium">{rental.id?.substring(0, 8)}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('Extension Hours:', "Heures de prolongation :")}</p>
            <p className="font-medium text-blue-600">{extension.extension_hours} {tr('hours', 'heures')}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('Original End Date:', "Date de fin d'origine :")}</p>
            <p className="font-medium">{formatDate(originalEndDate)}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('New End Date:', 'Nouvelle date de fin :')}</p>
            <p className="font-medium text-green-600">{formatDate(newEndDate)}</p>
          </div>
        </div>
      </div>

      {/* Customer Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">{tr('Customer Information', 'Informations client')}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">{tr('Full Name:', 'Nom complet :')}</p>
            <p className="font-medium">{rental.customer_name}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('Phone:', 'Téléphone :')}</p>
            <p className="font-medium">{rental.customer_phone}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('Email:', 'E-mail :')}</p>
            <p className="font-medium">{rental.customer_email}</p>
          </div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">{tr('Vehicle Information', 'Informations véhicule')}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">{tr('Vehicle:', 'Véhicule :')}</p>
            <p className="font-medium">{rental.vehicle?.name} {rental.vehicle?.model}</p>
          </div>
          <div>
            <p className="text-gray-600">{tr('Plate Number:', 'Numéro de plaque :')}</p>
            <p className="font-medium">{rental.vehicle?.plate_number}</p>
          </div>
        </div>
      </div>

      {/* Financial Breakdown */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">{tr('Financial Details', 'Détails financiers')}</h3>
        
        {/* Tier Breakdown if available */}
        {extension.tier_breakdown && Array.isArray(extension.tier_breakdown) && extension.tier_breakdown.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm font-medium text-gray-700 mb-2">{tr('Extension Price Breakdown:', "Détail du prix de prolongation :")}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1">{tr('Hours', 'Heures')}</th>
                  <th className="text-right py-1">{tr('Rate/Hour', 'Tarif/heure')}</th>
                  <th className="text-right py-1">Discount</th>
                  <th className="text-right py-1">{tr('Subtotal', 'Sous-total')}</th>
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
            <span className="text-gray-600">{tr('Original Rental Amount:', "Montant initial de location :")}</span>
            <span className="font-medium">{formatPrice(rental.total_amount)}</span>
          </div>
          <div className="flex justify-between text-blue-600">
            <span className="font-medium">{tr('Extension Fee', "Frais de prolongation")} ({extension.extension_hours} {tr('hours', 'heures')}) :</span>
            <span className="font-bold">+{formatPrice(extension.extension_price)}</span>
          </div>
          {rental.extension_count > 1 && (
            <div className="flex justify-between text-gray-500 text-xs">
              <span>{tr('Previous Extensions:', 'Prolongations précédentes :')}</span>
              <span>{formatPrice((rental.total_extension_price || 0) - extension.extension_price)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t-2 border-gray-300 text-lg">
            <span className="font-bold text-gray-900">{tr('New Total Amount:', 'Nouveau montant total :')}</span>
            <span className="font-bold text-green-600">{formatPrice(totalWithExtensions)}</span>
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">{tr('Extension Terms & Conditions', 'Conditions générales de prolongation')}</h3>
        <div className="text-xs text-gray-700 space-y-2">
          <p>{tr('1. This extension agreement is an addendum to the original rental contract dated', "1. Ce contrat de prolongation est un avenant au contrat de location initial daté du")} {formatDate(rental.rental_start_date)}.</p>
          <p>{tr('2. All terms and conditions of the original rental agreement remain in full effect unless explicitly modified herein.', "2. Toutes les conditions du contrat de location initial restent pleinement applicables sauf modification explicite dans le présent document.")}</p>
          <p>{tr('3. The rental period is extended by', '3. La période de location est prolongée de')} {extension.extension_hours} {tr('hours', 'heures')}, {tr('with the new return date being', 'avec une nouvelle date de retour fixée au')} {formatDate(newEndDate)}.</p>
          <p>{tr('4. The extension fee of', '4. Les frais de prolongation de')} {formatPrice(extension.extension_price)} {tr('is due immediately upon approval of this extension.', "sont dus immédiatement après l'approbation de cette prolongation.")}</p>
          <p>{tr('5. Late return beyond the new end date may result in additional charges as per the original rental agreement.', "5. Un retour tardif après la nouvelle date de fin peut entraîner des frais supplémentaires conformément au contrat initial.")}</p>
          <p>{tr('6. The customer agrees to maintain the vehicle in the same condition and follow all safety guidelines.', "6. Le client s'engage à conserver le véhicule dans le même état et à respecter toutes les consignes de sécurité.")}</p>
          <p>{tr('7. Insurance coverage (if applicable) is extended for the duration of this extension period.', "7. La couverture d'assurance (si applicable) est prolongée pendant toute la durée de cette prolongation.")}</p>
          {extension.notes && <p>{tr('8. Additional Notes:', '8. Notes supplémentaires :')} {extension.notes}</p>}
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        <div className="border-t-2 border-gray-400 pt-2">
          <p className="text-sm font-medium text-gray-700">{tr('Customer Signature', 'Signature du client')}</p>
          <p className="text-xs text-gray-500 mt-1">{tr('Date:', 'Date :')} {formatDate(extension.approved_at || new Date())}</p>
        </div>
        <div className="border-t-2 border-gray-400 pt-2">
          <p className="text-sm font-medium text-gray-700">{tr('Company Representative', "Représentant de l'entreprise")}</p>
          <p className="text-xs text-gray-500 mt-1">{tr('Date:', 'Date :')} {formatDate(extension.approved_at || new Date())}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
        <p>{tr('This is a legally binding extension agreement. Please retain a copy for your records.', 'Ce contrat de prolongation a une valeur légale. Veuillez en conserver une copie pour vos dossiers.')}</p>
        <p className="mt-1">{tr('For questions or concerns, contact us at support@company.com', 'Pour toute question ou réclamation, contactez-nous à support@company.com')}</p>
      </div>
    </div>
  );
};

export default ExtensionContract;
