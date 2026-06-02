import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Camera, FileText, Landmark, Lock, Receipt, Video } from 'lucide-react';
import ContractTemplate from '../components/ContractTemplate';
import ReceiptTemplate from '../components/ReceiptTemplate';
import i18n from '../i18n';
import { decodePublicSharePayload } from '../utils/publicSharePayload';

const pageWrapStyle = {
  background: 'linear-gradient(180deg, #f8f7ff 0%, #f6f8fc 42%, #f8fafc 100%)',
  minHeight: '100vh',
  padding: '16px',
};

const contentWrapStyle = {
  maxWidth: 1040,
  margin: '0 auto',
};

const premiumHeroStyle = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 24,
  border: '1px solid rgba(196,181,253,0.5)',
  background: 'linear-gradient(135deg, rgba(109,40,217,0.14) 0%, rgba(139,92,246,0.1) 28%, rgba(255,255,255,0.96) 68%, rgba(248,250,252,0.96) 100%)',
  boxShadow: '0 20px 60px rgba(76,29,149,0.10)',
  backdropFilter: 'blur(18px)',
};

const premiumHeroInnerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 18,
  flexWrap: 'wrap',
  padding: '24px',
};

const premiumSurfaceStyle = {
  borderRadius: 18,
  border: '1px solid rgba(226,232,240,0.95)',
  background: 'rgba(255,255,255,0.84)',
  boxShadow: '0 16px 40px rgba(15,23,42,0.05)',
};

const inlinePromptStyle = {
  ...premiumSurfaceStyle,
  padding: '16px 18px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.94), rgba(245,243,255,0.92))',
};

const docGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 18,
};

const cardBaseStyle = {
  textDecoration: 'none',
  borderRadius: 18,
  border: '1px solid rgba(226,232,240,0.95)',
  background: '#ffffff',
  boxShadow: '0 16px 38px rgba(15, 23, 42, 0.05)',
  color: '#0f172a',
  display: 'block',
  padding: '22px',
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
};

const publicDocumentShareStyles = `
  .public-share-page,
  .public-share-page * {
    box-sizing: border-box;
  }

  .public-share-title,
  .public-share-meta,
  .public-share-secure-pill,
  .public-share-card-title,
  .public-share-card-subtitle {
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .public-share-page {
      padding: 12px !important;
    }

    .public-share-hero {
      border-radius: 22px !important;
    }

    .public-share-hero-inner {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 18px !important;
      padding: 18px !important;
    }

    .public-share-hero-main {
      width: 100% !important;
      flex: 0 0 auto !important;
      gap: 14px !important;
    }

    .public-share-logo {
      width: 62px !important;
      height: 62px !important;
      border-radius: 18px !important;
      padding: 8px !important;
      flex: 0 0 62px !important;
    }

    .public-share-hero-copy {
      width: calc(100% - 76px) !important;
      min-width: 0 !important;
      flex: 1 1 auto !important;
    }

    .public-share-eyebrow {
      font-size: 11px !important;
      letter-spacing: 0.16em !important;
      line-height: 1.35 !important;
    }

    .public-share-title {
      max-width: 100% !important;
      margin-top: 10px !important;
      font-size: clamp(2rem, 10vw, 2.65rem) !important;
      line-height: 0.98 !important;
      letter-spacing: -0.05em !important;
    }

    .public-share-meta {
      margin-top: 10px !important;
      font-size: 14px !important;
      line-height: 1.45 !important;
    }

    .public-share-secure-pill {
      max-width: 100% !important;
      border-radius: 16px !important;
      padding: 8px 10px !important;
      font-size: 12px !important;
      line-height: 1.35 !important;
      align-items: flex-start !important;
    }

    .public-share-hero-actions {
      width: 100% !important;
      min-width: 0 !important;
      gap: 10px !important;
    }

    .public-share-count-pill {
      align-self: stretch !important;
      width: 100% !important;
      justify-content: center !important;
      text-align: center !important;
      padding: 9px 12px !important;
      font-size: 11px !important;
      letter-spacing: 0.12em !important;
    }

    .public-share-primary-action {
      width: 100% !important;
      min-height: 54px !important;
      border-radius: 18px !important;
      font-size: 15px !important;
    }

    .public-share-body {
      padding: 0 18px 18px !important;
    }

    .public-share-account-prompt {
      flex-direction: column !important;
      align-items: stretch !important;
      padding: 14px !important;
      border-radius: 18px !important;
      gap: 12px !important;
    }

    .public-share-account-actions {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }

    .public-share-account-button {
      width: 100% !important;
      min-height: 38px !important;
      padding: 8px 10px !important;
      font-size: 13px !important;
    }

    .public-share-doc-grid {
      grid-template-columns: 1fr !important;
      gap: 14px !important;
    }

    .public-share-doc-card {
      padding: 18px !important;
      border-radius: 20px !important;
    }

    .public-share-doc-icon {
      width: 52px !important;
      height: 52px !important;
      border-radius: 16px !important;
    }

    .public-share-document-pill {
      padding: 7px 9px !important;
      font-size: 10px !important;
      letter-spacing: 0.12em !important;
    }

    .public-share-card-title {
      margin-top: 16px !important;
      font-size: 28px !important;
      line-height: 1.08 !important;
    }

    .public-share-card-subtitle {
      font-size: 15px !important;
      line-height: 1.45 !important;
    }

    .public-share-open-button {
      width: 100% !important;
      justify-content: center !important;
    }
  }

  @media (max-width: 380px) {
    .public-share-account-actions {
      grid-template-columns: 1fr !important;
    }

    .public-share-hero-main {
      flex-direction: column !important;
    }

    .public-share-hero-copy {
      width: 100% !important;
    }

    .public-share-title {
      font-size: 2rem !important;
    }
  }

  @media print {
    .no-print { display: none !important; }
    body { background: white !important; }
    @page { size: A4; margin: 1cm; }
  }
`;

const SHARE_ITEM_META = {
  contract: {
    icon: FileText,
    title: { en: 'Contract', fr: 'Contrat' },
    subtitle: { en: 'Open the signed rental agreement for this booking.', fr: 'Ouvrir le contrat signé pour cette réservation.' },
    accent: {
      tint: 'linear-gradient(135deg, rgba(15,23,42,0.08), rgba(71,85,105,0.04))',
      border: 'rgba(148,163,184,0.28)',
      color: '#0f172a',
    },
  },
  receipt: {
    icon: Receipt,
    title: { en: 'Receipt', fr: 'Reçu' },
    subtitle: { en: 'View the payment receipt and booking record.', fr: 'Voir le reçu de paiement et le récapitulatif de réservation.' },
    accent: {
      tint: 'linear-gradient(135deg, rgba(124,58,237,0.14), rgba(16,185,129,0.08))',
      border: 'rgba(167,139,250,0.34)',
      color: '#6d28d9',
    },
  },
  'opening-media': {
    icon: Camera,
    title: { en: 'Opening Media', fr: 'Media de depart' },
    subtitle: { en: 'Browse opening photos and videos', fr: 'Parcourir les photos et videos de depart' },
    accent: {
      tint: 'linear-gradient(135deg, rgba(14,165,233,0.14), rgba(99,102,241,0.08))',
      border: 'rgba(125,211,252,0.38)',
      color: '#0284c7',
    },
  },
  'closing-media': {
    icon: Video,
    title: { en: 'Closing Media', fr: 'Media de retour' },
    subtitle: { en: 'Browse return photos and videos', fr: 'Parcourir les photos et videos de retour' },
    accent: {
      tint: 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(124,58,237,0.08))',
      border: 'rgba(253,186,116,0.38)',
      color: '#ea580c',
    },
  },
  'banking-info': {
    icon: Landmark,
    title: { en: 'Banking Info', fr: 'Informations bancaires' },
    subtitle: { en: 'Open bank transfer instructions', fr: 'Ouvrir les instructions de virement' },
    accent: {
      tint: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(20,184,166,0.08))',
      border: 'rgba(110,231,183,0.38)',
      color: '#059669',
    },
  },
};

const PUBLIC_PROMPT_BUTTON = {
  padding: '10px 16px',
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

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

const normalizePublicDocumentSettings = (settings = {}) => ({
  ...settings,
  logoUrl: settings?.logoUrl || settings?.logo_url || null,
  stampUrl: settings?.stampUrl || settings?.stamp_url || null,
});

const normalizeShareErrorMessage = (value, fallback = 'Shared document not found') => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.message || value.error || value.code || fallback;
  }
  return String(value);
};

export default function PublicDocumentShare() {
  const { token } = useParams();
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const language = share?.payload?.language === 'en' ? 'en' : 'fr';
  const isFrench = language === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/public-links?resource=document-shares&token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.share) {
          if (!cancelled) {
            setError(normalizeShareErrorMessage(body?.error));
          }
          return;
        }

        const nextShare = body.share;
        const rawPayload = nextShare?.payload || {};
        let resolvedPayload = rawPayload?.compressed && rawPayload?.encoded
          ? (await decodePublicSharePayload(rawPayload.encoded))
          : rawPayload;

        if (
          !cancelled &&
          ['contract', 'receipt'].includes(String(nextShare?.share_type || '').toLowerCase()) &&
          !resolvedPayload?.rental &&
          (resolvedPayload?.rentalLookupId || resolvedPayload?.rentalId)
        ) {
          const lookupId = resolvedPayload?.rentalLookupId || resolvedPayload?.rentalId;
          const rentalBody = await fetchPublicRentalPreview(lookupId);

          const baseRental = rentalBody.rental;
          const baseVehicleReport =
            baseRental?.vehicleReport ||
            baseRental?.vehicle_report ||
            null;
          const overrideVehicleReport =
            resolvedPayload?.overrides?.vehicleReport ||
            resolvedPayload?.overrides?.vehicle_report ||
            null;
          const baseMaintenance = baseVehicleReport?.maintenance || null;
          const overrideMaintenance = overrideVehicleReport?.maintenance || null;
          const mergedMaintenance = (baseMaintenance || overrideMaintenance)
            ? {
                ...(baseMaintenance || {}),
                ...(overrideMaintenance || {}),
                parts: Array.isArray(overrideMaintenance?.parts) && overrideMaintenance.parts.length > 0
                  ? overrideMaintenance.parts
                  : (baseMaintenance?.parts || []),
                parts_used: Array.isArray(overrideMaintenance?.parts_used) && overrideMaintenance.parts_used.length > 0
                  ? overrideMaintenance.parts_used
                  : (baseMaintenance?.parts_used || baseMaintenance?.parts || []),
              }
            : null;
          const linkedVehicleReport = (baseVehicleReport || overrideVehicleReport)
            ? {
                ...(baseVehicleReport || {}),
                ...(overrideVehicleReport || {}),
                maintenance: mergedMaintenance,
              }
            : null;

          resolvedPayload = {
            ...resolvedPayload,
            rental: {
              ...baseRental,
              ...(resolvedPayload?.overrides || {}),
              vehicleReport: linkedVehicleReport,
              vehicle_report: linkedVehicleReport,
            },
            settings: normalizePublicDocumentSettings({
              ...(rentalBody?.settings || {}),
              ...(resolvedPayload?.settings || {}),
            }),
          };
        }

        if (!cancelled) {
          setShare({
            ...nextShare,
            payload: resolvedPayload
              ? {
                  ...resolvedPayload,
                  settings: normalizePublicDocumentSettings(resolvedPayload?.settings || {}),
                }
              : {},
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(normalizeShareErrorMessage(err, 'Failed to load shared document'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (token) {
      load();
    } else {
      setLoading(false);
      setError('Invalid shared link');
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  const payload = share?.payload || {};
  const rental = payload?.rental || null;
  const normalizedSettings = normalizePublicDocumentSettings(payload?.settings || {});
  const isDriveOutMarketplaceDocument = Boolean(
    rental?.is_driveout_marketplace_document ||
    rental?.source_type === 'driveout_marketplace' ||
    rental?.source_context === 'driveout_marketplace_request' ||
    rental?.contract_document_mode === 'driveout_marketplace_no_pricing' ||
    rental?.marketplace_request_id ||
    rental?.marketplace_request_reference ||
    payload?.source?.type === 'driveout_marketplace' ||
    String(rental?.document_brand || rental?.company_name || rental?.company_legal_name || '').trim().toLowerCase().includes('driveout') ||
    String(normalizedSettings.logoUrl || '').trim().toLowerCase().includes('driveout')
  );
  const normalizedLogoUrl = String(normalizedSettings.logoUrl || '').trim();
  const normalizedLogoKey = normalizedLogoUrl.toLowerCase();
  const isLegacySaharaXLogo =
    normalizedLogoKey.includes('saharax') ||
    (normalizedLogoKey.includes('/assets/logo.jpg') && !normalizedLogoKey.includes('driveout')) ||
    normalizedLogoKey === 'logo.jpg';
  const logoUrl = isDriveOutMarketplaceDocument
    ? (normalizedLogoUrl && !isLegacySaharaXLogo ? normalizedLogoUrl : '/assets/driveout-mark.svg')
    : (normalizedLogoUrl || '/assets/logo.jpg');
  const stampUrl = isDriveOutMarketplaceDocument ? '' : (normalizedSettings.stampUrl || '/assets/stamp.png');
  const documentBrandName = isDriveOutMarketplaceDocument ? 'DriveOut' : 'SaharaX';
  const printablePdfUrl = payload?.pdfUrl || null;
  const accountPrompt = (
    <div style={inlinePromptStyle} className="no-print public-share-account-prompt">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
            {tr('Need history, messages, or follow-up?', 'Besoin de l’historique, des messages ou du suivi ?')}
          </div>
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: '#64748b', lineHeight: 1.35 }}>
            {tr('Sign in after reviewing these shared items.', 'Connectez-vous après avoir consulté les éléments partagés.')}
          </div>
        </div>
      </div>
      <div className="public-share-account-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="/login" className="public-share-account-button" style={{ ...PUBLIC_PROMPT_BUTTON, background: '#4f46e5', color: '#fff' }}>
          {tr('Sign in', 'Se connecter')}
        </a>
        <a href="/register" className="public-share-account-button" style={{ ...PUBLIC_PROMPT_BUTTON, background: '#fff', color: '#334155', border: '1px solid #cbd5e1' }}>
          {tr('Create account', 'Créer un compte')}
        </a>
      </div>
    </div>
  );

  const hubItems = useMemo(() => {
    if (share?.share_type !== 'hub') return [];
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.filter((item) => item?.key && item?.url);
  }, [payload?.items, share?.share_type]);

  if (loading) {
    return renderDocumentLoadingShell(tr);
  }

  if (error || !share) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>{tr('Link Error', 'Erreur de lien')}</h1>
          <p style={{ color: '#6b7280' }}>{normalizeShareErrorMessage(error, tr('Shared document not found', 'Document partage introuvable'))}</p>
        </div>
      </div>
    );
  }

  if (share.share_type === 'hub') {
    const secureLabel = tr('Secure access • Private link', 'Accès sécurisé • Lien privé');
    const availableLabel = tr(`${hubItems.length} documents available`, `${hubItems.length} documents disponibles`);
    const getHubItemHref = (item) => {
      if (item?.key === 'contract' && item?.kind === 'preview' && item?.url) {
        return item.url;
      }

      if (item?.key === 'contract' && share?.rental_id) {
        const params = new URLSearchParams({
          type: 'contract',
          lang: language,
        });

        return `/view/rental/${encodeURIComponent(share.rental_id)}?${params.toString()}`;
      }

      return item?.url || '#';
    };

    return (
      <div style={pageWrapStyle} className="public-share-page">
        <div style={contentWrapStyle}>
          <div style={premiumHeroStyle} className="public-share-hero">
            <div style={premiumHeroInnerStyle} className="public-share-hero-inner">
              <div className="public-share-hero-main" style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minWidth: 0, flex: 1 }}>
                <img
                  className="public-share-logo"
                  src={logoUrl || (isDriveOutMarketplaceDocument ? '/assets/driveout-mark.svg' : '/assets/logo.jpg')}
                  alt={documentBrandName}
                  style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 20, background: '#fff', border: '1px solid rgba(226,232,240,0.9)', padding: 10, boxShadow: '0 12px 28px rgba(15,23,42,0.06)' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="public-share-hero-copy" style={{ minWidth: 0, flex: 1 }}>
                  <div className="public-share-eyebrow" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7c3aed' }}>
                    {tr('Shared Rental Access', 'Accès partagé location')}
                  </div>
                  <h1 className="public-share-title" style={{ margin: '8px 0 0', fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a' }}>
                    {tr('Rental Documents', 'Documents de location')}
                  </h1>
                  <p className="public-share-meta" style={{ margin: '10px 0 0', color: '#475569', fontSize: 15, fontWeight: 600 }}>
                    {[payload?.rentalId || tr('Booking', 'Réservation'), payload?.customerName || tr('Customer', 'Client')].filter(Boolean).join(' • ')}
                  </p>
                  <div className="public-share-secure-pill" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(196,181,253,0.45)', color: '#5b21b6', fontSize: 13, fontWeight: 700 }}>
                    <Lock size={14} />
                    <span>{secureLabel}</span>
                  </div>
                </div>
              </div>
              <div className="public-share-hero-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, minWidth: 220 }}>
                <div className="public-share-count-pill" style={{ alignSelf: 'flex-end', padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(196,181,253,0.45)', color: '#6d28d9', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {availableLabel}
                </div>
              </div>
            </div>

            <div className="public-share-body" style={{ padding: '0 24px 24px' }}>
              <div style={docGridStyle} className="public-share-doc-grid">
                {hubItems.map((item) => {
                  const meta = SHARE_ITEM_META[item.key] || SHARE_ITEM_META.receipt;
                  const Icon = meta.icon || FileText;
                  return (
                    <a
                      className="public-share-doc-card"
                      key={item.key}
                      href={getHubItemHref(item)}
                      style={cardBaseStyle}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.transform = 'translateY(-3px)';
                        event.currentTarget.style.boxShadow = '0 22px 42px rgba(15,23,42,0.08)';
                        event.currentTarget.style.borderColor = 'rgba(167,139,250,0.55)';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.transform = 'translateY(0)';
                        event.currentTarget.style.boxShadow = '0 16px 38px rgba(15, 23, 42, 0.05)';
                        event.currentTarget.style.borderColor = 'rgba(226,232,240,0.95)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <div className="public-share-doc-icon" style={{ width: 58, height: 58, borderRadius: 18, background: meta.accent?.tint || 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(59,130,246,0.08))', border: `1px solid ${meta.accent?.border || 'rgba(196,181,253,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)' }}>
                          <Icon size={24} color={meta.accent?.color || '#5b21b6'} />
                        </div>
                        <div className="public-share-document-pill" style={{ padding: '8px 10px', borderRadius: 999, background: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          {tr('Document', 'Document')}
                        </div>
                      </div>
                      <div className="public-share-card-title" style={{ marginTop: 18, fontSize: 24, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.02em' }}>
                        {isFrench ? meta.title.fr : meta.title.en}
                      </div>
                      <div className="public-share-card-subtitle" style={{ marginTop: 10, color: '#64748b', lineHeight: 1.5, fontSize: 15 }}>
                        {isFrench ? meta.subtitle.fr : meta.subtitle.en}
                      </div>
                      <div style={{ marginTop: 18 }}>
                        <span className="public-share-open-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid rgba(226,232,240,0.95)', color: '#0f172a', fontSize: 14, fontWeight: 800 }}>
                          {tr('Open document', 'Ouvrir le document')}
                          <ArrowRight size={16} />
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
              <div style={{ marginTop: 16 }}>
                {accountPrompt}
              </div>
            </div>
          </div>
        </div>
        <style>{publicDocumentShareStyles}</style>
      </div>
    );
  }

  return (
    <div style={pageWrapStyle} className="public-share-page">
      <div style={{ maxWidth: 980, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} className="no-print">
        <div>
          <div style={{ color: '#6366f1', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {tr('Shared document', 'Document partagé')}
          </div>
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800 }}>
            {share.share_type === 'contract' ? tr('Rental Contract', 'Contrat de location') : tr('Rental Receipt', 'Reçu de location')}
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
                gap: 8,
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
              gap: 8,
            }}
          >
            {printablePdfUrl
              ? tr('📄 Print exact PDF', '📄 Imprimer le PDF exact')
              : tr('🖨️ Print / Save PDF', '🖨️ Imprimer / enregistrer en PDF')}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {share.share_type === 'contract' ? (
          <ContractTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} language={language} />
        ) : (
          <ReceiptTemplate
            rental={rental}
            logoUrl={logoUrl}
            stampUrl={stampUrl}
            bookingGraceMinutes={rental?.booking_grace_period_minutes || 120}
            language={language}
          />
        )}
        <div style={{ marginTop: 16 }}>
          {accountPrompt}
        </div>
      </div>

      <style>{publicDocumentShareStyles}</style>
    </div>
  );
}
