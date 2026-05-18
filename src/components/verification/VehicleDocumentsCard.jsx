import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, ShieldAlert } from 'lucide-react';
import VerificationUploadField from './VerificationUploadField';
import VerificationStatusBadge from './VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import {
  VEHICLE_REQUIRED_VERIFICATIONS,
  buildEntityVerificationSummary,
} from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const VehicleDocumentsCard = ({ vehicle, ownerUserId, disabled = false }) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const vehicleId = vehicle?.id;
  const summary = useMemo(() => buildEntityVerificationSummary(requests, 'vehicle'), [requests]);

  const loadRequests = useCallback(async ({ forceRefresh = false } = {}) => {
    if (!vehicleId) return;
    try {
      setLoading(true);
      const result = await VerificationService.getEntityVerificationSummary('vehicle', vehicleId, { forceRefresh });
      setRequests(result.requests || []);
    } catch (error) {
      console.warn('Unable to load vehicle verification summary:', error.message);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const latestByType = summary.latestByType || {};

  return (
    <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
            {tr('Compliance', 'Conformité')}
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <FileCheck2 className="h-5 w-5" />
            </span>
            {tr('Vehicle verification documents', 'Documents de vérification du véhicule')}
          </h3>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
            {tr(
              'Registration and insurance must be approved before the vehicle is treated as verified and listable.',
              'La carte grise et l’assurance doivent être approuvées avant que le véhicule soit considéré vérifié et publiable.'
            )}
          </p>
        </div>
        <VerificationStatusBadge status={summary.status} />
      </div>

      {!vehicleId && (
        <div className="mt-4 flex items-start gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {tr(
            'Save the vehicle first, then submit its legal documents for verification.',
            'Enregistrez d’abord le véhicule, puis envoyez ses documents juridiques pour vérification.'
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {VEHICLE_REQUIRED_VERIFICATIONS.map((verificationType) => (
          <VerificationUploadField
            key={verificationType}
            entityType="vehicle"
            entityId={vehicleId}
            ownerUserId={ownerUserId}
            verificationType={verificationType}
            request={latestByType[verificationType]}
            requiresExpiry={verificationType === 'vehicle_insurance'}
            disabled={disabled || loading || !vehicleId}
            onUploaded={loadRequests}
          />
        ))}
      </div>
    </div>
  );
};

export default VehicleDocumentsCard;
