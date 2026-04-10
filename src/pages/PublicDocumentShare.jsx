import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ContractTemplate from '../components/ContractTemplate';
import ReceiptTemplate from '../components/ReceiptTemplate';
import i18n from '../i18n';
import { decodePublicSharePayload } from '../utils/publicSharePayload';

const cardBaseStyle = {
  textDecoration: 'none',
  background: '#fff',
  border: '1px solid #dbeafe',
  borderRadius: 16,
  padding: '18px 20px',
  boxShadow: '0 10px 25px rgba(59, 130, 246, 0.08)',
  color: '#0f172a',
  display: 'block',
};

const SHARE_ITEM_META = {
  contract: {
    icon: '📄',
    title: { en: 'Contract', fr: 'Contrat' },
    subtitle: { en: 'Open the signed rental agreement', fr: 'Ouvrir le contrat de location signe' },
  },
  receipt: {
    icon: '🧾',
    title: { en: 'Receipt', fr: 'Recu' },
    subtitle: { en: 'View the payment receipt', fr: 'Voir le recu de paiement' },
  },
  'opening-media': {
    icon: '📸',
    title: { en: 'Opening Media', fr: 'Media de depart' },
    subtitle: { en: 'Browse opening photos and videos', fr: 'Parcourir les photos et videos de depart' },
  },
  'closing-media': {
    icon: '🎥',
    title: { en: 'Closing Media', fr: 'Media de retour' },
    subtitle: { en: 'Browse return photos and videos', fr: 'Parcourir les photos et videos de retour' },
  },
  'banking-info': {
    icon: '🏦',
    title: { en: 'Banking Info', fr: 'Informations bancaires' },
    subtitle: { en: 'Open bank transfer instructions', fr: 'Ouvrir les instructions de virement' },
  },
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
            setError(body?.error || 'Shared document not found');
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
          const rentalResponse = await fetch(`/api/public-rentals/${encodeURIComponent(lookupId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          const rentalBody = await rentalResponse.json().catch(() => ({}));

          if (!rentalResponse.ok || !rentalBody?.rental) {
            throw new Error(rentalBody?.error || 'Failed to load shared rental preview');
          }

          const baseRental = rentalBody.rental;
          const linkedVehicleReport =
            resolvedPayload?.overrides?.vehicleReport ||
            resolvedPayload?.overrides?.vehicle_report ||
            baseRental?.vehicleReport ||
            baseRental?.vehicle_report ||
            null;

          resolvedPayload = {
            ...resolvedPayload,
            rental: {
              ...baseRental,
              ...(resolvedPayload?.overrides || {}),
              vehicleReport: linkedVehicleReport,
              vehicle_report: linkedVehicleReport,
            },
            settings: {
              ...(rentalBody?.settings || {}),
              ...(resolvedPayload?.settings || {}),
            },
          };
        }

        if (!cancelled) {
          setShare({
            ...nextShare,
            payload: resolvedPayload || {},
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load shared document');
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
  const logoUrl = payload?.settings?.logoUrl || null;
  const stampUrl = payload?.settings?.stampUrl || null;
  const printablePdfUrl = payload?.pdfUrl || null;

  const hubItems = useMemo(() => {
    if (share?.share_type !== 'hub') return [];
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.filter((item) => item?.key && item?.url);
  }, [payload?.items, share?.share_type]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#6b7280', fontSize: 16 }}>{tr('Loading shared document...', 'Chargement du document partage...')}</p>
        </div>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>{tr('Link Error', 'Erreur de lien')}</h1>
          <p style={{ color: '#6b7280' }}>{error || tr('Shared document not found', 'Document partage introuvable')}</p>
        </div>
      </div>
    );
  }

  if (share.share_type === 'hub') {
    return (
      <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '16px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px 24px', borderBottom: '3px solid #667eea', flexWrap: 'wrap' }}>
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
                    {payload?.rentalId || tr('Rental', 'Location')} • {payload?.customerName || tr('Customer', 'Client')}
                  </p>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                {hubItems.length} {tr(hubItems.length === 1 ? 'item' : 'items', hubItems.length === 1 ? 'element' : 'elements')}
              </div>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {hubItems.map((item) => {
                  const meta = SHARE_ITEM_META[item.key] || SHARE_ITEM_META.receipt;
                  return (
                    <a key={item.key} href={item.url} target="_blank" rel="noreferrer" style={cardBaseStyle}>
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(59,130,246,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                        <span aria-hidden="true">{meta.icon}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>
                        {tr('Open', 'Ouvrir')}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>
                        {isFrench ? meta.title.fr : meta.title.en}
                      </div>
                      <div style={{ marginTop: 8, color: '#64748b', lineHeight: 1.5 }}>
                        {isFrench ? meta.subtitle.fr : meta.subtitle.en}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '16px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} className="no-print">
        <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
          {tr('Mobile-friendly view', 'Vue mobile lisible')}
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
              {tr('Open PDF', 'Ouvrir le PDF')}
            </a>
          )}
          <button
            onClick={() => window.print()}
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
            {tr('🖨️ Print / Save PDF', '🖨️ Imprimer / enregistrer en PDF')}
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
