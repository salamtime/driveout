import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ContractTemplate from '../components/ContractTemplate';
import ReceiptTemplate from '../components/ReceiptTemplate';
import { decodePublicSharePayload } from '../utils/publicSharePayload';

export default function PublicRentalView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'contract'; // 'contract' or 'receipt'
  const sharedPayload = searchParams.get('payload');
  const isMediaGallery = type === 'opening-media' || type === 'closing-media';
  const mediaPhase = type === 'closing-media' ? 'in' : 'out';

  const [rental, setRental] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);
  const [galleryMedia, setGalleryMedia] = useState([]);

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
          setRental({
            ...decodedPayload.rental,
            bundle: decodedPayload.bundle || null,
          });
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

          setRental(body.rental);

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

        const response = await fetch(`/api/public-rentals/${encodeURIComponent(id)}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        const body = await response.json().catch(() => ({}));

        if (response.ok && hydrateFromBody(body)) {
          return;
        }

        // Fallback for older staging/API mismatches: try client-side lookup by internal id, then contract id.
        const rentalSelect = `
          *,
          quantity_hours,
          quantity_days,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          ),
          extensions:rental_extensions!rental_extensions_rental_id_fkey(*),
          package:app_4c3a7a6153_rental_km_packages!package_id(*)
        `;

        let rentalData = null;

        const byInternalId = await supabase
          .from('app_4c3a7a6153_rentals')
          .select(rentalSelect)
          .eq('id', id)
          .maybeSingle();

        rentalData = byInternalId.data;

        if (!rentalData) {
          const byContractId = await supabase
            .from('app_4c3a7a6153_rentals')
            .select(rentalSelect)
            .eq('rental_id', id)
            .maybeSingle();
          rentalData = byContractId.data;
        }

        if (!rentalData) {
          setError(body?.error || 'Rental not found');
          return;
        }

        setRental(rentalData);

        const { data: settings } = await supabase
          .from('app_settings')
          .select('logo_url, stamp_url')
          .eq('id', 1)
          .maybeSingle();

        if (settings?.logo_url) setLogoUrl(settings.logo_url);
        if (settings?.stamp_url) setStampUrl(settings.stamp_url);

        if (isMediaGallery || type === 'documents') {
          const { data: mediaRows } = await supabase
            .from('app_2f7bf469b0_rental_media')
            .select('*')
            .eq('rental_id', rentalData.id)
            .order('created_at', { ascending: false });

          const sourceRows =
            type === 'documents'
              ? (mediaRows || [])
              : (mediaRows || []).filter((item) => item.phase === mediaPhase);

          setGalleryMedia(sourceRows.map(mapMediaItem));
        }
      } catch (e) {
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id, isMediaGallery, mediaPhase, sharedPayload]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#6b7280', fontSize: 16 }}>Loading document...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Document Not Found</h1>
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

  if (type === 'documents') {
    const decodedBundle =
      rental?.bundle && typeof rental.bundle === 'object'
        ? rental.bundle
        : {};

    const available = {
      contract: decodedBundle.contract ?? Boolean(rental?.signature_url),
      receipt: decodedBundle.receipt ?? Boolean(String(rental?.payment_status || '').toLowerCase() === 'paid'),
      openingMedia: decodedBundle.openingMedia ?? galleryMedia.some((item) => item.phase === 'out'),
      closingMedia: decodedBundle.closingMedia ?? galleryMedia.some((item) => item.phase === 'in'),
    };

    const documentCards = [
      {
        key: 'contract',
        title: 'Contract',
        subtitle: 'Open the signed rental agreement',
        icon: '📄',
        href: buildSharedUrl('contract'),
        visible: available.contract,
      },
      {
        key: 'receipt',
        title: 'Receipt',
        subtitle: 'View the payment receipt',
        icon: '🧾',
        href: buildSharedUrl('receipt'),
        visible: available.receipt,
      },
      {
        key: 'opening-media',
        title: 'Start Media',
        subtitle: 'Browse opening photos and videos',
        icon: '📸',
        href: buildSharedUrl('opening-media'),
        visible: available.openingMedia,
      },
      {
        key: 'closing-media',
        title: 'End Media',
        subtitle: 'Browse return photos and videos',
        icon: '🎥',
        href: buildSharedUrl('closing-media'),
        visible: available.closingMedia,
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
                    Rental Documents
                  </h1>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 15 }}>
                    {rental?.rental_id || 'Rental'} • {rental?.customer_name || 'Customer'}
                  </p>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                {documentCards.length} item{documentCards.length === 1 ? '' : 's'}
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
                      Open
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
                    {type === 'opening-media' ? 'Opening Media' : 'Closing Media'}
                  </h1>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 15 }}>
                    {rental?.rental_id || 'Rental'} • {rental?.customer_name || 'Customer'}
                  </p>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 600 }}>
                {galleryMedia.length} item{galleryMedia.length === 1 ? '' : 's'}
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
                  No media available.
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
                      <span>← Previous</span>
                      <span>Swipe left or right to view all {galleryMedia.length} items</span>
                      <span>Next →</span>
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
                              alt={item.file_name || 'Rental media'}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          )}
                        </div>
                        <div style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: 13, color: '#667085', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                            {item.isVideo ? 'Video' : 'Photo'}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 14, color: '#1f2937', fontWeight: 600, wordBreak: 'break-word' }}>
                            {item.original_filename || item.file_name || 'Media file'}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}
                            >
                              Open full media
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
      <div style={{ maxWidth: 900, margin: '0 auto 16px', display: 'flex', justifyContent: 'flex-end' }} className="no-print">
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 20px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          🖨️ Print / Save PDF
        </button>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {type === 'contract' ? (
          <ContractTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} />
        ) : (
          <ReceiptTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} />
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
