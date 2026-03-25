import { authenticateRequest } from '../_lib/auth.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const json = (res, status, body) => res.status(status).json(body);

const generateCode = () =>
  Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) {
      return json(res, auth.error.status, auth.error.body);
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const originalUrl = String(body.originalUrl || '').trim();
    const rentalId = body.rentalId ? String(body.rentalId) : null;
    const documentType = String(body.documentType || 'other').trim() || 'other';

    if (!originalUrl) {
      return json(res, 400, { error: 'Missing originalUrl' });
    }

    const { userClient } = auth;

    const existingQuery = userClient
      .from('url_shortener')
      .select('short_code')
      .eq('original_url', originalUrl)
      .eq('document_type', documentType)
      .limit(1);

    const { data: existingRows, error: existingError } = rentalId
      ? await existingQuery.eq('rental_id', rentalId)
      : await existingQuery.is('rental_id', null);

    if (existingError) {
      return json(res, 500, { error: existingError.message || 'Failed to lookup existing short link' });
    }

    const existingShortCode = existingRows?.[0]?.short_code;
    if (existingShortCode) {
      return json(res, 200, {
        shortCode: existingShortCode,
        shortUrl: `${req.headers.origin || ''}/s/${existingShortCode}`,
      });
    }

    let code = generateCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data: usedRows } = await userClient
        .from('url_shortener')
        .select('id')
        .eq('short_code', code)
        .limit(1);

      if (!usedRows?.length) break;
      code = generateCode();
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    const { error: insertError } = await userClient
      .from('url_shortener')
      .insert({
        original_url: originalUrl,
        short_code: code,
        rental_id: rentalId,
        document_type: documentType,
        expires_at: expires.toISOString(),
        click_count: 0,
      });

    if (insertError) {
      return json(res, 500, { error: insertError.message || 'Failed to create short link' });
    }

    return json(res, 200, {
      shortCode: code,
      shortUrl: `${req.headers.origin || ''}/s/${code}`,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Failed to create short link' });
  }
}
