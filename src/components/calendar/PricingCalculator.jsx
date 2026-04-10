import React, { useState, useEffect } from 'react';
import { DollarSign, Clock, Calculator, AlertTriangle } from 'lucide-react';
import i18n from '../../i18n';

const PricingCalculator = ({ booking, actualDuration, isOnTour }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [pricing, setPricing] = useState({
    basePrice: 150, // Base price for 4-hour tour
    baseDurationHours: 4,
    overtimeRate: 30, // Per hour overtime rate
    totalPrice: 150,
    extraCharges: 0,
    balance: 0
  });

  useEffect(() => {
    if (actualDuration && actualDuration > pricing.baseDurationHours * 60) {
      // Calculate overtime
      const overtimeMinutes = actualDuration - (pricing.baseDurationHours * 60);
      const overtimeHours = Math.ceil(overtimeMinutes / 60); // Round up to full hours
      const extraCharges = overtimeHours * pricing.overtimeRate;
      const totalPrice = pricing.basePrice + extraCharges;
      
      setPricing(prev => ({
        ...prev,
        extraCharges,
        totalPrice,
        balance: totalPrice - pricing.basePrice // Assuming base price was already paid
      }));
    }
  }, [actualDuration, pricing.basePrice, pricing.baseDurationHours, pricing.overtimeRate]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const hasOvertime = pricing.extraCharges > 0;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="flex items-center">
        <Calculator className="h-5 w-5 text-blue-600 mr-2" />
        <h4 className="font-medium text-gray-900">{tr('Pricing Summary', 'Résumé tarifaire')}</h4>
      </div>

      {/* Base Pricing */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-1" />
            {tr('Base Tour', 'Tour de base')} ({pricing.baseDurationHours}h)
          </div>
          <span className="font-medium text-gray-900">
            {formatCurrency(pricing.basePrice)}
          </span>
        </div>

        {/* Show actual duration if tour is ongoing or completed */}
        {(isOnTour || actualDuration) && (
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {tr('Actual Duration', 'Durée réelle')}
            </div>
            <span className="font-medium text-gray-900">
              {actualDuration ? formatDuration(actualDuration) : tr('In progress...', 'En cours...')}
            </span>
          </div>
        )}

        {/* Overtime charges */}
        {hasOvertime && (
          <>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center text-sm text-orange-600">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {tr('Extra Time Charges', 'Frais de temps supplémentaire')}
                </div>
                <span className="font-medium text-orange-600">
                  {formatCurrency(pricing.extraCharges)}
                </span>
              </div>
            </div>

            {/* Balance due */}
            <div className="bg-orange-50 border border-orange-200 rounded p-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-orange-900">
                  {tr('Additional Balance Due', 'Solde additionnel dû')}
                </span>
                <span className="text-lg font-bold text-orange-900">
                  {formatCurrency(pricing.balance)}
                </span>
              </div>
              <p className="text-xs text-orange-700 mt-1">
                {tr('To be collected after tour completion', 'À encaisser après la fin du tour')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Total */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-900">{tr('Total Amount', 'Montant total')}</span>
          <span className="text-xl font-bold text-blue-600">
            {formatCurrency(pricing.totalPrice)}
          </span>
        </div>
      </div>

      {/* Payment Status */}
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>{tr('Reservation Paid:', 'Réservation payée :')}</span>
          <span className="text-green-600 font-medium">
            {formatCurrency(pricing.basePrice)}
          </span>
        </div>
        {hasOvertime && (
          <div className="flex justify-between">
            <span>{tr('Outstanding Balance:', 'Solde restant :')}</span>
            <span className="text-orange-600 font-medium">
              {formatCurrency(pricing.balance)}
            </span>
          </div>
        )}
      </div>

      {/* Pricing Notes */}
      <div className="text-xs text-gray-500 bg-white rounded p-2">
        <p className="font-medium mb-1">{tr('Pricing Policy:', 'Politique tarifaire :')}</p>
        <ul className="space-y-1">
          <li>• {tr('Base rate:', 'Tarif de base :')} {formatCurrency(pricing.basePrice)} {tr('for', 'pour')} {pricing.baseDurationHours} {tr('hours', 'heures')}</li>
          <li>• {tr('Overtime:', 'Heures supplémentaires :')} {formatCurrency(pricing.overtimeRate)}/{tr('hour', 'heure')} ({tr('rounded up', 'arrondi au supérieur')})</li>
          <li>• {tr('Payment accepted:', 'Paiement accepté :')} {tr('Cash, Card, Transfer', 'Espèces, carte, virement')}</li>
        </ul>
      </div>
    </div>
  );
};

export default PricingCalculator;
