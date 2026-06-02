import { authenticateRequest } from './auth.js';
import { createSupabaseClients } from './supabase.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const DOCUMENT_SHARES_BUCKET = process.env.DOCUMENT_SHARES_BUCKET || 'rental-documents';
const DOCUMENT_SHARES_PREFIX = process.env.DOCUMENT_SHARES_PREFIX || 'document-shares';

const json = (res, status, body) => res.status(status).json(body);

const generateToken = (length = 10) =>
  Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const getRequestOrigin = (req) => {
  const host = req.headers.host || '';
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const proto = req.headers['x-forwarded-proto'] || (isLocalHost ? 'http' : 'https');
  return `${proto}://${host}`;
};

const getShareStoragePath = (token) => `${DOCUMENT_SHARES_PREFIX}/${token}.json`;

const readStoredShare = async (adminClient, token) => {
  const { data, error } = await adminClient.storage
    .from(DOCUMENT_SHARES_BUCKET)
    .download(getShareStoragePath(token));

  if (error || !data) {
    return {
      share: null,
      error: error?.message || 'Shared document not found',
      status: error ? 500 : 404,
    };
  }

  try {
    const raw = await data.text();
    return { share: JSON.parse(raw), error: null, status: 200 };
  } catch (parseError) {
    return {
      share: null,
      error: parseError.message || 'Shared document payload is invalid',
      status: 500,
    };
  }
};

const writeStoredShare = async (adminClient, token, share) => {
  const serialized = new TextEncoder().encode(JSON.stringify(share, null, 2));
  return adminClient.storage
    .from(DOCUMENT_SHARES_BUCKET)
    .upload(getShareStoragePath(token), serialized, {
      contentType: 'application/json',
      upsert: false,
    });
};

const overwriteStoredShare = async (adminClient, token, share) => {
  const serialized = new TextEncoder().encode(JSON.stringify(share, null, 2));
  return adminClient.storage
    .from(DOCUMENT_SHARES_BUCKET)
    .upload(getShareStoragePath(token), serialized, {
      contentType: 'application/json',
      upsert: true,
    });
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { adminClient } = createSupabaseClients();
    const token = String(req.query?.token || '').trim();
    const action = String(req.query?.action || '').trim().toLowerCase();

    if (req.method === 'GET' && token) {
      const { share, error, status } = await readStoredShare(adminClient, token);

      if (error || !share) {
        return json(res, status, { error: error || 'Shared document not found' });
      }

      if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
        return json(res, 410, { error: 'Shared document has expired' });
      }

      overwriteStoredShare(adminClient, token, {
          ...share,
          last_accessed_at: new Date().toISOString(),
          access_count: Number(share.access_count || 0) + 1,
        })
        .then(() => {});

      return json(res, 200, { share });
    }

    if (req.method === 'POST' && action === 'create') {
      const auth = await authenticateRequest(req);

      if (auth.error) {
        return json(res, auth.error.status, auth.error.body);
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const shareType = String(body.shareType || '').trim();
      const payload =
        body.payload && typeof body.payload === 'object'
          ? body.payload
          : (typeof body.payloadEncoded === 'string' && body.payloadEncoded.trim()
            ? { encoded: body.payloadEncoded.trim(), compressed: true }
            : null);
      const rentalId = body.rentalId ? String(body.rentalId) : null;
      const expiresInDays = Number(body.expiresInDays || 7);

      if (!shareType || !payload) {
        return json(res, 400, { error: 'Missing shareType or payload' });
      }

      let shareToken = generateToken();
      let writeError = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(30, expiresInDays)));

        const shareRecord = {
          id: shareToken,
          share_token: shareToken,
          share_type: shareType,
          rental_id: rentalId,
          payload,
          created_by: auth.user.id,
          created_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          access_count: 0,
          last_accessed_at: null,
        };

        const { error } = await writeStoredShare(adminClient, shareToken, shareRecord);
        if (!error) {
          const origin = getRequestOrigin(req);
          return json(res, 200, {
            share: shareRecord,
            token: shareToken,
            url: `${origin}/d/${shareToken}`,
          });
        }

        writeError = error;
        shareToken = generateToken();
      }

      return json(res, 500, { error: writeError?.message || 'Failed to create shared document' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Document share handler failed' });
  }
}
