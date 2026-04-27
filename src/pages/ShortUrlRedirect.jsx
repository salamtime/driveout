import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import i18n from '../i18n';

const SHARE_ATTRIBUTION_KEY = 'saharax_share_attribution';

const ShortUrlRedirect = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { code } = useParams();
  const normalizedCode = (() => {
    if (!code) return null;
    const match = String(code).match(/[A-Za-z0-9]{6}/);
    return match ? match[0] : null;
  })();
  const [status, setStatus] = useState('loading');
  const [targetUrl, setTargetUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!normalizedCode) { setError(tr('Invalid link', 'Lien invalide')); setStatus('error'); return; }

    fetch(`/api/growth-links?code=${encodeURIComponent(normalizedCode)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (response.ok && body?.url) {
          try {
            window.localStorage.setItem(
              SHARE_ATTRIBUTION_KEY,
              JSON.stringify({
                code: body.code,
                type: body.type,
                createdAt: new Date().toISOString(),
              })
            );
          } catch {}

          setTargetUrl(body.url);
          setStatus('redirecting');

          try { window.location.href = body.url; } catch {}
          try { window.location.replace(body.url); } catch {}
          return;
        }

        fetch(`/api/public-links?resource=short-links&code=${encodeURIComponent(normalizedCode)}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        })
          .then(async (legacyResponse) => {
            const legacyBody = await legacyResponse.json().catch(() => ({}));

            if (!legacyResponse.ok || !legacyBody?.url) {
              setError(legacyBody?.error || body?.error || tr('URL not found or has been deleted', "URL introuvable ou supprimée"));
              setStatus('error');
              return;
            }

            setTargetUrl(legacyBody.url);
            setStatus('redirecting');

            try { window.location.href = legacyBody.url; } catch {}
            try { window.location.replace(legacyBody.url); } catch {}
          })
          .catch(() => {
            setError(tr('Failed to open this link', "Impossible d'ouvrir ce lien"));
            setStatus('error');
          });
      })
      .catch(() => {
        setError(tr('Failed to open this link', "Impossible d'ouvrir ce lien"));
        setStatus('error');
      });
  }, [normalizedCode, isFrench]);

  if (status === 'redirecting' && targetUrl) {
    return (
      <html>
        <head>
          {/* Meta refresh as fallback for Safari/mobile */}
          <meta httpEquiv="refresh" content={`0;url=${targetUrl}`} />
        </head>
        <body style={{ fontFamily: 'sans-serif', textAlign: 'center', paddingTop: '40px', background: '#f9fafb' }}>
          <div style={{ maxWidth: '400px', margin: '0 auto', padding: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#374151', fontSize: '16px', marginBottom: '16px' }}>{tr('Opening document...', 'Ouverture du document...')}</p>
            <a
              href={targetUrl}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: '#2563eb',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              {tr('Tap here to open', 'Appuyez ici pour ouvrir')}
            </a>
          </div>
        </body>
      </html>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>{tr('Link Error', 'Erreur de lien')}</h1>
          <p style={{ color: '#6b7280' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
        <p style={{ color: '#6b7280' }}>{tr('Loading...', 'Chargement...')}</p>
      </div>
    </div>
  );
};

export default ShortUrlRedirect;
