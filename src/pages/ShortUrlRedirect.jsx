import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const ShortUrlRedirect = () => {
  const { code } = useParams();
  const [status, setStatus] = useState('loading');
  const [targetUrl, setTargetUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) { setError('Invalid link'); setStatus('error'); return; }

    fetch(`/api/short-links/${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (!response.ok || !body?.url) {
          setError(body?.error || 'URL not found or has been deleted');
          setStatus('error');
          return;
        }

        setTargetUrl(body.url);
        setStatus('redirecting');

        try { window.location.href = body.url; } catch {}
        try { window.location.replace(body.url); } catch {}
      })
      .catch(() => {
        setError('Failed to open this link');
        setStatus('error');
      });
  }, [code]);

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
            <p style={{ color: '#374151', fontSize: '16px', marginBottom: '16px' }}>Opening document...</p>
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
              Tap here to open
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
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>Link Error</h1>
          <p style={{ color: '#6b7280' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    </div>
  );
};

export default ShortUrlRedirect;
