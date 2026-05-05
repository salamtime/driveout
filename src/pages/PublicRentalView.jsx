import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ContractTemplate from '../components/ContractTemplate';
import ReceiptTemplate from '../components/ReceiptTemplate';
import { normalizePaymentStatus } from '../config/statusColors';
import { decodePublicSharePayload } from '../utils/publicSharePayload';
import DynamicPricingService from '../services/DynamicPricingService';
import i18n from '../i18n';

const documentShellPageStyle = {
  minHeight: '100vh',
  background: '#f8fafc',
  padding: '24px 16px 48px',
};

const documentShellHeaderStyle = {
  maxWidth: 960,
  margin: '0 auto',
  border: '1px solid #e2e8f0',
  borderRadius: 28,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.06)',
  padding: '24px',
};

const documentShellCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 24,
  background: '#ffffff',
  boxShadow: '0 16px 38px rgba(15, 23, 42, 0.05)',
  padding: '20px 22px',
};

const renderDocumentLoadingShell = (tr) => (
  <div style={documentShellPageStyle}>
    <div style={documentShellHeaderStyle}>
      <div style={{ height: 12, width: 140, borderRadius: 999, background: '#e2e8f0' }} />
      <div style={{ height: 40, width: 'min(320px, 72%)', borderRadius: 18, background: '#f1f5f9', marginTop: 14 }} />
      <div style={{ height: 16, width: 'min(460px, 92%)', borderRadius: 999, background: '#f1f5f9', marginTop: 14 }} />
    </div>
    <div style={{ maxWidth: 960, margin: '20px auto 0', display: 'grid', gap: 16 }}>
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} style={documentShellCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ height: 18, width: 116, borderRadius: 999, background: '#f1f5f9' }} />
              <div style={{ height: 28, width: 'min(280px, 85%)', borderRadius: 16, background: '#f1f5f9', marginTop: 14 }} />
              <div style={{ height: 15, width: 'min(420px, 92%)', borderRadius: 999, background: '#f8fafc', marginTop: 12 }} />
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 18, background: '#f1f5f9' }} />
          </div>
        </div>
      ))}
    </div>
    <p style={{ maxWidth: 960, margin: '14px auto 0', color: '#64748b', fontSize: 14, fontWeight: 600 }}>
      {tr('Preparing rental documents...', 'Préparation des documents de location...')}
    </p>
  </div>
);

const hasRecordedReturnFuel = (rental) => {
  return rental?.end_fuel_level !== null && rental?.end_fuel_level !== undefined ||
    String(rental?.rental_status || '').toLowerCase() === 'completed';
};

const getEffectiveFuelChargeAmount = ({ rental }) => {
  if (!rental?.fuel_charge_enabled || !hasRecordedReturnFuel(rental)) {
    return 0;
  }

  return parseFloat(rental?.fuel_charge || 0) || 0;
};

const getCorrectedDisplayedPaidAmount = ({ rental }) => {
  const rawPaidAmount = parseFloat(rental?.deposit_amount || 0) || 0;
  const effectiveFuelCharge = getEffectiveFuelChargeAmount({ rental });
  const rawFuelCharge = parseFloat(rental?.fuel_charge || 0) || 0;
  const staleFuelCharge = Math.max(0, rawFuelCharge - effectiveFuelCharge);

  return Math.max(0, rawPaidAmount - staleFuelCharge);
};

const fetchPublicRentalPreview = async (lookupId) => {
  const encodedLookupId = encodeURIComponent(lookupId);
  const endpoints = [
    `/api/public-rentals/${encodedLookupId}`,
    `/api/public-links?resource=public-rental&id=${encodedLookupId}`,
  ];

  let lastBody = {};

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    lastBody = body;

    if (response.ok && body?.rental) {
      return body;
    }
  }

  throw new Error(lastBody?.error || 'Failed to load shared rental preview');
};

const getWeekendImpoundEstimatedReleaseDate = (impoundedAt) => {
  const impoundDate = new Date(impoundedAt || '');
  if (Number.isNaN(impoundDate.getTime())) return null;

  const day = impoundDate.getDay();
  let daysToAdd = 0;

  if (day === 5) daysToAdd = 3;
  else if (day === 6) daysToAdd = 2;
  else if (day === 0) daysToAdd = 1;

  if (daysToAdd === 0) return null;

  const estimate = new Date(impoundDate);
  estimate.setDate(estimate.getDate() + daysToAdd);
  return estimate;
};

const getWeekendMinimumEstimatedDays = (impoundedAt) => {
  const impoundDate = new Date(impoundedAt || '');
  if (Number.isNaN(impoundDate.getTime())) return 0;
  const day = impoundDate.getDay();
  if (day === 4 || day === 5) return 3;
  if (day === 6) return 2;
  if (day === 0) return 1;
  return 0;
};

export default function PublicRentalView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'contract'; // 'contract' or 'receipt'
  const documentLanguage = searchParams.get('lang') === 'en' ? 'en' : 'fr';
  const sharedPayload = searchParams.get('payload');
  const explicitPdfUrl = searchParams.get('pdf') || null;
  const isMediaGallery = type === 'opening-media' || type === 'closing-media';
  const mediaPhase = type === 'closing-media' ? 'in' : 'out';
  const isFrench = documentLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  const [rental, setRental] = useState(null);
  const [displayRental, setDisplayRental] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);
  const [galleryMedia, setGalleryMedia] = useState([]);
  const applySharedOverrides = (baseRental, decodedPayload = null) => {
    if (!baseRental) return baseRental;
    const overrides = decodedPayload?.overrides;
    if (!overrides || typeof overrides !== 'object') {
      return {
        ...baseRental,
        bundle: decodedPayload?.bundle || baseRental?.bundle || null,
        sharedLinks: decodedPayload?.links || baseRental?.sharedLinks || null,
      };
    }

    return {
      ...baseRental,
      ...overrides,
      vehicle_report: overrides.vehicle_report ?? overrides.vehicleReport ?? baseRental.vehicle_report,
      vehicleReport: overrides.vehicleReport ?? overrides.vehicle_report ?? baseRental.vehicleReport,
      bundle: decodedPayload?.bundle || baseRental?.bundle || null,
      sharedLinks: decodedPayload?.links || baseRental?.sharedLinks || null,
    };
  };

  const mapMediaItem = (item) => ({
    ...item,
    url: item.url || item.public_url,
    isImage: item.isImage ?? item.file_type?.startsWith('image/'),
    isVideo: item.isVideo ?? item.file_type?.startsWith('video/'),
  });

  useEffect(() => {
    const load = async () => {
      try {
        const decodedPayload = sharedPayload ? await decodePublicSharePayload(sharedPayload) : null;
        if (decodedPayload?.rental) {
          setRental(applySharedOverrides(decodedPayload.rental, decodedPayload));
          if (decodedPayload.settings?.logoUrl) setLogoUrl(decodedPayload.settings.logoUrl);
          if (decodedPayload.settings?.stampUrl) setStampUrl(decodedPayload.settings.stampUrl);

          if (isMediaGallery || type === 'documents') {
            const mappedMedia = (decodedPayload.media || []).map(mapMediaItem);
            setGalleryMedia(mappedMedia);
          }

          setLoading(false);
          return;
        }

        const hydrateFromBody = (body) => {
          if (!body?.rental) return false;

          setRental(applySharedOverrides(body.rental, decodedPayload));

          if (body.settings?.logo_url) setLogoUrl(body.settings.logo_url);
          if (body.settings?.stamp_url) setStampUrl(body.settings.stamp_url);

          if (isMediaGallery || type === 'documents') {
            const sourceRows =
              type === 'documents'
                ? (body.media || [])
                : (body.media || []).filter((item) => item.phase === mediaPhase);

            setGalleryMedia(sourceRows.map(mapMediaItem));
          }

          return true;
        };

        const body = await fetchPublicRentalPreview(id);

        if (hydrateFromBody(body)) {
          return;
        }
        setError(body?.error || tr('Rental not found', 'Location introuvable'));
        return;
      } catch (e) {
        setError(tr('Failed to load document', 'Impossible de charger le document'));
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id, isMediaGallery, mediaPhase, sharedPayload]);

  useEffect(() => {
    let cancelled = false;

    const enrichReceiptRental = async () => {
      if (!rental) {
        setDisplayRental(null);
        return;
      }

      if (type !== 'receipt' || !rental?.is_impounded) {
        setDisplayRental({
          ...rental,
          deposit_amount: getCorrectedDisplayedPaidAmount({ rental }),
          fuel_charge: getEffectiveFuelChargeAmount({ rental }),
        });
        return;
      }

      const plannedEnd = [rental.rental_end_date, rental.actual_end_date]
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((value) => !Number.isNaN(value.getTime()))
        .reduce((latest, current) => (current > latest ? current : latest), null);

      if (!plannedEnd) {
        setDisplayRental(rental);
        return;
      }

      const releaseDate = getWeekendImpoundEstimatedReleaseDate(rental.impounded_at) || new Date();
      const diffMs = releaseDate.getTime() - plannedEnd.getTime();
      const hourMs = 1000 * 60 * 60;
      const dayMs = 1000 * 60 * 60 * 24;

      const liveDiffMs = Date.now() - plannedEnd.getTime();
      const liveDays = liveDiffMs > 0 ? Math.max(1, Math.ceil(liveDiffMs / dayMs)) : 0;
      const liveHours = liveDiffMs > 0 ? Math.max(1, Math.ceil(liveDiffMs / hourMs)) : 0;

      let estimatedDays = diffMs > 0 ? Math.max(1, Math.ceil(diffMs / dayMs)) : 0;
      let estimatedHours = diffMs > 0 ? Math.max(1, Math.ceil(diffMs / hourMs)) : 0;

      const vehicleId = rental?.vehicle_id || rental?.vehicle?.id;
      const vehicleModelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id || rental?.vehicle_model_id;

      let liveRate = Number(rental?.impound_rate || rental?.unit_price || 0);
      let liveRateMode = 'package';
      if (rental?.rental_type === 'daily' && liveDays > 0 && vehicleModelId) {
        const pricing = await DynamicPricingService.getPricingForDuration(vehicleModelId, liveDays);
        liveRate = Math.max(0, Number(pricing?.price || liveRate));
        liveRateMode = pricing?.source === 'base_price' ? 'per_day' : 'package';
      }

      const minimumWeekendDays = getWeekendMinimumEstimatedDays(rental?.impounded_at);
      if (rental?.rental_type === 'daily' && minimumWeekendDays > 0) {
        estimatedDays = Math.max(liveDays, minimumWeekendDays);
        estimatedHours = 0;
      }

      let estimatedRate = liveRate;
      let estimatedRateMode = liveRateMode;
      if (rental?.rental_type === 'daily' && estimatedDays > 0) {
        const pricing = vehicleModelId
          ? await DynamicPricingService.getPricingForDuration(vehicleModelId, estimatedDays)
          : { price: await DynamicPricingService.getDynamicPrice(vehicleId, 'daily', estimatedDays), source: 'vehicle' };
        estimatedRate = Math.max(0, Number(pricing?.price || estimatedRate));
        estimatedRateMode = pricing?.source === 'base_price' ? 'per_day' : 'package';
      }

      const liveTotal = rental?.rental_type === 'daily' && liveRateMode === 'per_day'
        ? liveRate * liveDays
        : liveRate;
      const estimatedTotal = rental?.rental_type === 'daily' && estimatedRateMode === 'per_day'
        ? estimatedRate * estimatedDays
        : estimatedRate;

      if (cancelled) return;

      setDisplayRental({
        ...rental,
        deposit_amount: getCorrectedDisplayedPaidAmount({ rental }),
        fuel_charge: getEffectiveFuelChargeAmount({ rental }),
        impound_charge_days: liveDays,
        impound_charge_hours: liveHours,
        impound_rate: liveRate,
        impound_total: liveTotal,
        impound_live_charge_days: liveDays,
        impound_live_charge_hours: liveHours,
        impound_live_rate: liveRate,
        impound_live_total: liveTotal,
        impound_is_estimate: true,
        impound_estimated_release_at: releaseDate.toISOString(),
        impound_estimate_note: getWeekendImpoundEstimatedReleaseDate(rental?.impounded_at)
          ? 'Weekend estimate assumes the vehicle remains held until Monday before release can happen. It prepares the customer for the added rental days beyond the live charge already running now.'
          : 'Estimate based on the current held time. Final charge may change until the impound is released.',
        impound_estimate_weekend_carry: Boolean(getWeekendImpoundEstimatedReleaseDate(rental?.impounded_at)),
        impound_estimated_days_total: estimatedDays,
        impound_estimated_hours_total: estimatedHours,
        impound_estimated_rate: estimatedRate,
        impound_estimated_total: estimatedTotal,
        impound_estimated_extra_days: Math.max(0, estimatedDays - liveDays),
        impound_estimated_extra_amount: Math.max(
          0,
          rental?.rental_type === 'daily'
            ? Math.max(0, estimatedDays - liveDays) * estimatedRate
            : estimatedTotal - liveTotal
        ),
      });
    };

    enrichReceiptRental();

    return () => {
      cancelled = true;
    };
  }, [rental, type]);

  if (loading) return renderDocumentLoadingShell(tr);

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>{tr('Document Not Found', 'Document introuvable')}</h1>
        <p style={{ color: '#6b7280' }}>{error}</p>
      </div>
    </div>
  );

  const buildSharedUrl = (nextType) => {
    const params = new URLSearchParams();
    params.set('type', nextType);
    if (sharedPayload) {
      params.set('payload', sharedPayload);
    }
    return `/view/rental/${encodeURIComponent(id)}?${params.toString()}`;
  };

  const sharedLinks =
    rental?.sharedLinks && typeof rental.sharedLinks === 'object'
      ? rental.sharedLinks
      : {};
  const accountPrompt = (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.05))',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 16,
        padding: '12px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
      className="no-print"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
            {tr('Need history, messages, or follow-up?', 'Besoin de l’historique, des messages ou du suivi ?')}
          </div>
          <div style={{ marginTop: 3, color: '#64748b', fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>
            {tr('Sign in after reviewing this shared document.', 'Connectez-vous après avoir consulté ce document partagé.')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="/login" style={{ padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#4f46e5', color: '#fff' }}>
          {tr('Sign in', 'Se connecter')}
        </a>
        <a href="/register" style={{ padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: '#334155', border: '1px solid #cbd5e1' }}>
          {tr('Sign up', "S'inscrire")}
        </a>
      </div>
    </div>
  );
  const printablePdfUrl =
    explicitPdfUrl ||
    (type === 'receipt'
      ? (sharedLinks.receiptPdf || null)
      : type === 'contract'
        ? (sharedLinks.contractPdf || null)
        : null);

  if (type === 'documents') {
    const decodedBundle =
      rental?.bundle && typeof rental.bundle === 'object'
        ? rental.bundle
        : {};
    const decodedLinks =
      rental?.sharedLinks && typeof rental.sharedLinks === 'object'
        ? rental.sharedLinks
        : {};
    const normalizedPaymentStatus = normalizePaymentStatus(rental?.payment_status, rental?.remaining_amount);

    const available = {
      contract: decodedBundle.contract ?? Boolean(rental?.signature_url),
      receipt: decodedBundle.receipt ?? Boolean(normalizedPaymentStatus === 'paid'),
      openingMedia: decodedBundle.openingMedia ?? galleryMedia.some((item) => item.phase === 'out'),
      closingMedia: decodedBundle.closingMedia ?? galleryMedia.some((item) => item.phase === 'in'),
    };

    const documentCards = [
      {
        key: 'contract',
        title: tr('Contract', 'Contrat'),
        subtitle: tr('Open the signed rental agreement', 'Ouvrir le contrat de location signe'),
        icon: '📄',
        href: decodedLinks.contract || null,
        visible: available.contract && Boolean(decodedLinks.contract),
      },
      {
        key: 'receipt',
        title: tr('Receipt', 'Recu'),
        subtitle: tr('View the payment receipt', 'Voir le recu de paiement'),
        icon: '🧾',
        href: decodedLinks.receipt || null,
        visible: available.receipt && Boolean(decodedLinks.receipt),
      },
      {
        key: 'opening-media',
        title: tr('Start Media', 'Media de depart'),
        subtitle: tr('Browse opening photos and videos', 'Parcourir les photos et videos de depart'),
        icon: '📸',
        href: decodedLinks.openingMedia || buildSharedUrl('opening-media'),
        visible: available.openingMedia,
      },
      {
        key: 'closing-media',
        title: tr('End Media', 'Media de retour'),
        subtitle: tr('Browse return photos and videos', 'Parcourir les photos et videos de retour'),
        icon: '🎥',
        href: decodedLinks.closingMedia || buildSharedUrl('closing-media'),
        visible: available.closingMedia,
      },
      {
        key: 'banking-info',
        title: tr('Banking Info', 'Informations bancaires'),
        subtitle: tr('Open bank transfer instructions', 'Ouvrir les instructions de virement'),
        icon: '🏦',
        href: decodedLinks.bankingInfo || null,
        visible: Boolean(decodedBundle.bankingInfo && decodedLinks.bankingInfo),
      },
    ].filter((item) => item.visible);

    return (
      <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '16px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 24px',
                borderBottom: '3px solid #667eea',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                <img
                  src={logoUrl || '/assets/logo.jpg'}
                  alt="Company Logo"
                  style={{ width: 96, height: 'auto', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1f2937' }}>
                    {tr('Rental Documents', 'Documents de location')}
                  </h1>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 15 }}>
                    {rental?.rental_id || tr('Rental', 'Location')} • {rental?.customer_name || tr('Customer', 'Client')}
                  </p>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                {documentCards.length} {tr(documentCards.length === 1 ? 'item' : 'items', documentCards.length === 1 ? 'element' : 'elements')}
              </div>
            </div>

            <div style={{ padding: 24 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                }}
              >
                {documentCards.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    style={{
                      textDecoration: 'none',
                      background: '#fff',
                      border: '1px solid #dbeafe',
                      borderRadius: 16,
                      padding: '18px 20px',
                      boxShadow: '0 10px 25px rgba(59, 130, 246, 0.08)',
                      color: '#0f172a',
                      display: 'block',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(59,130,246,0.08))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                      }}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>
                      {tr('Open', 'Ouvrir')}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>
                      {item.title}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: '#64748b' }}>
                      {item.subtitle}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isMediaGallery) {
    return (
      <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '16px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 24px',
                borderBottom: '3px solid #667eea',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                <img
                  src={logoUrl || '/assets/logo.jpg'}
                  alt="Company Logo"
                  style={{ width: 96, height: 'auto', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#1f2937' }}>
                    {type === 'opening-media' ? tr('Opening Media', 'Media de depart') : tr('Closing Media', 'Media de retour')}
                  </h1>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 15 }}>
                    {rental?.rental_id || tr('Rental', 'Location')} • {rental?.customer_name || tr('Customer', 'Client')}
                  </p>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                {galleryMedia.length} {tr(galleryMedia.length === 1 ? 'item' : 'items', galleryMedia.length === 1 ? 'element' : 'elements')}
              </div>
            </div>

            <div style={{ padding: '20px 24px 24px' }}>
              {galleryMedia.length === 0 ? (
                <div
                  style={{
                    borderRadius: 16,
                    border: '1px dashed #cbd5e1',
                    padding: '40px 24px',
                    textAlign: 'center',
                    color: '#64748b',
                    background: '#f8fafc',
                  }}
                >
                  {tr('No media available.', 'Aucun media disponible.')}
                </div>
              ) : (
                <>
                  {galleryMedia.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 14,
                        padding: '10px 14px',
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(124,58,237,0.08))',
                        color: '#4f46e5',
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      <span>{tr('← Previous', '← Precedent')}</span>
                      <span>{tr(`Swipe left or right to view all ${galleryMedia.length} items`, `Glissez a gauche ou a droite pour voir les ${galleryMedia.length} elements`)}</span>
                      <span>{tr('Next →', 'Suivant →')}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 20,
                      overflowX: 'auto',
                      scrollSnapType: 'x proximity',
                      paddingBottom: 8,
                    }}
                  >
                    {galleryMedia.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          minWidth: 'min(82vw, 420px)',
                          flex: '0 0 min(82vw, 420px)',
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 16,
                          overflow: 'hidden',
                          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
                          scrollSnapAlign: 'start',
                        }}
                      >
                        <div style={{ aspectRatio: '4 / 3', background: '#0f172a' }}>
                          {item.isVideo ? (
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                            >
                              <source src={item.url} type={item.file_type || 'video/mp4'} />
                            </video>
                          ) : (
                            <img
                              src={item.url}
                              alt={item.file_name || tr('Rental media', 'Média de location')}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          )}
                        </div>
                        <div style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: 13, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                            {item.isVideo ? tr('Video', 'Vidéo') : tr('Photo', 'Photo')}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 14, color: '#1f2937', fontWeight: 600, wordBreak: 'break-word' }}>
                            {item.original_filename || item.file_name || tr('Media file', 'Fichier média')}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}
                            >
                              {tr('Open full media', 'Ouvrir le média en plein écran')}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 768px) {
            body { margin: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '16px' }}>
      {/* Print button - hidden on print */}
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        }}
        className="no-print"
      >
        <div>
          <div style={{ color: '#6366f1', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {tr('Shared document', 'Document partagé')}
          </div>
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800 }}>
            {type === 'contract' ? tr('Rental Contract', 'Contrat de location') : tr('Rental Receipt', 'Reçu de location')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {printablePdfUrl && (
            <a
              href={printablePdfUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '10px 16px',
                background: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {tr('Open exact PDF', 'Ouvrir le PDF exact')}
            </a>
          )}
          <button
            onClick={() => (printablePdfUrl ? window.open(printablePdfUrl, '_blank', 'noopener,noreferrer') : window.print())}
            style={{
              padding: '10px 20px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {printablePdfUrl
              ? tr('📄 Print exact PDF', '📄 Imprimer le PDF exact')
              : tr('🖨️ Print / Save PDF', '🖨️ Imprimer / enregistrer en PDF')}
          </button>
        </div>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {type === 'contract' ? (
          <ContractTemplate rental={displayRental || rental} logoUrl={logoUrl} stampUrl={stampUrl} language={documentLanguage} />
        ) : (
          <ReceiptTemplate
            rental={displayRental || rental}
            logoUrl={logoUrl}
            stampUrl={stampUrl}
            bookingGraceMinutes={displayRental?.booking_grace_period_minutes || rental?.booking_grace_period_minutes || 120}
            language={documentLanguage}
          />
        )}
        <div style={{ marginTop: 16 }}>
          {accountPrompt}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
