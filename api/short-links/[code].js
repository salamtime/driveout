import { createSupabaseClients } from '../_lib/supabase.js';

const json = (res, status, body) => res.status(status).json(body);
const SHORT_LINKS_TABLE = process.env.SHORT_LINKS_TABLE || 'short_links';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const code = String(req.query?.code || '').trim();
  if (!code) {
    return json(res, 400, { error: 'Missing short code' });
  }

  try {
    const { adminClient } = createSupabaseClients();
    const { data, error } = await adminClient
      .from(SHORT_LINKS_TABLE)
      .select('original_url, expires_at, click_count')
      .eq('short_code', code)
      .maybeSingle();

    if (error) {
      return json(res, 500, { error: error.message || 'Failed to load short link' });
    }

    if (!data) {
      return json(res, 404, { error: 'URL not found or has been deleted' });
    }

    const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
    if (isExpired) {
      return json(res, 410, { error: 'This link has expired' });
    }

    adminClient
      .from(SHORT_LINKS_TABLE)
      .update({
        click_count: Number(data.click_count || 0) + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('short_code', code)
      .then(() => {});

    return json(res, 200, { url: data.original_url });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Failed to resolve short link' });
  }
}
