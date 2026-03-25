import { authenticateRequest, getBearerToken } from './_lib/auth.js';

const json = (res, status, body) => res.status(status).json(body);

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  try {
    const token = getBearerToken(req);
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

    if (!supabaseUrl) {
      return json(res, 500, { error: 'Missing Supabase URL configuration' });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/apply_late_fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parseBody(req.body)),
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { error: await response.text() };

    return json(res, response.status, payload);
  } catch (error) {
    console.error('apply-late-fee proxy failed:', error);
    return json(res, 500, { error: error.message || 'Late fee proxy failed' });
  }
}
