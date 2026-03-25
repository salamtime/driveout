import { authenticateRequest } from '../../_lib/auth.js';
import { AUDIT_LOG_TABLE } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await authenticateRequest(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { adminClient } = auth;
  const { rentalId } = req.query;

  if (!rentalId) {
    res.status(400).json({ error: 'Rental ID is required' });
    return;
  }

  try {
    const { data, error } = await adminClient
      .from(AUDIT_LOG_TABLE)
      .select('*')
      .eq('rental_id', rentalId)
      .order('performed_at', { ascending: false });

    if (error) {
      console.error('Audit log fetch failed:', error);
      res.status(200).json([]);
      return;
    }

    res.status(200).json(data || []);
  } catch (error) {
    console.error('Audit log fetch handler failed:', error);
    res.status(200).json([]);
  }
}
