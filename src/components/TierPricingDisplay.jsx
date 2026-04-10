import React from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle } from 'lucide-react';
import i18n from '../i18n';

/**
 * TierPricingDisplay Component
 * Displays tier pricing breakdown showing savings compared to standard rates
 * Matches the design from the rental form with green tier rates and crossed-out standard rates
 */
const TierPricingDisplay = ({ breakdown, isMobile = false }) => {
  if (!breakdown) return null;
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  const {
    vehicleName,
    duration,
    standardHourlyRate,
    tierRate,
    standardTotal,
    tierTotal,
    savings,
    savingsPercentage,
    isDiscounted,
    tierDescription,
    isSamePrice
  } = breakdown;

  return (
    <Card className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-gray-900">{tr('Tier Pricing Breakdown', 'Détail tarification par palier')}</h4>
          </div>
          {isDiscounted && (
            <Badge variant="success" className="bg-green-600 text-white">
              {savingsPercentage}% {tr('OFF', 'DE RÉDUCTION')}
            </Badge>
          )}
        </div>

        {/* Vehicle and Duration */}
        <div className="text-sm text-gray-700">
          <span className="font-medium">{vehicleName}</span>
          <span className="mx-2">|</span>
          <span>{duration} {duration !== 1 ? tr('hours', 'heures') : tr('hour', 'heure')}</span>
        </div>

        {/* Pricing Breakdown - Two Column Layout */}
        <div className="grid grid-cols-2 gap-3">
          {/* Your Tier Rate */}
          <div className="bg-white border border-green-200 rounded-lg p-3">
              <div className="text-xs text-gray-600 mb-1">{tr('Your Tier Rate:', 'Votre tarif palier :')}</div>
            <div className="text-lg font-bold text-green-600">
                {tierRate.toFixed(2)} MAD/{tr('hour', 'heure')}
            </div>
          </div>

          {/* Standard Rate */}
          {isDiscounted && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-600 mb-1">{tr('Standard Rate:', 'Tarif standard :')}</div>
              <div className="text-lg font-bold text-gray-400 line-through">
                {standardHourlyRate.toFixed(2)} MAD/{tr('hour', 'heure')}
              </div>
            </div>
          )}
        </div>

        {/* Tier Description */}
        {tierDescription && (
          <div className="text-xs text-gray-500 italic text-center">
            {tierDescription}
          </div>
        )}

        {/* Total Savings */}
        {isDiscounted && savings > 0 && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-2 text-center">
            <div className="text-xs font-medium">{tr('Total Savings', 'Économies totales')}</div>
            <div className="text-lg font-bold">
              {savings.toFixed(2)} MAD
            </div>
            <div className="text-xs opacity-80">
              ({savingsPercentage}% {tr('off', 'de réduction')})
            </div>
          </div>
        )}

        {/* Same Price Message */}
        {isSamePrice && (
          <div className="text-sm text-gray-600 text-center italic">
            {tr('Standard hourly rate applies for this duration', 'Le tarif horaire standard s’applique pour cette durée')}
          </div>
        )}

        {/* Totals Comparison */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500 text-xs">{tr('Your Total', 'Votre total')}</div>
            <div className="font-bold text-green-600">
              {tierTotal.toFixed(2)} MAD
            </div>
          </div>
          {isDiscounted && (
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500 text-xs">{tr('Standard Total', 'Total standard')}</div>
              <div className="font-medium text-gray-500 line-through">
                {standardTotal.toFixed(2)} MAD
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default TierPricingDisplay;
