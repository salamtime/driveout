import { authenticateRequest } from '../_lib/auth.js';
import { AUDIT_LOG_TABLE } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await authenticateRequest(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { user, adminClient } = auth;

  try {
    const payload = {
      ...req.body,
      performed_by: user.id,
    };

    const { data, error } = await adminClient
      .from(AUDIT_LOG_TABLE)
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Audit log insert failed:', error);
      res.status(202).json({
        success: false,
        warning: 'Audit log endpoint is available, but the insert was skipped.',
        details: error.message,
      });
      return;
    }

    res.status(201).json({ success: true, entry: data });
  } catch (error) {
    console.error('Audit log handler failed:', error);
    res.status(202).json({
      success: false,
      warning: 'Audit log endpoint is available, but the insert was skipped.',
      details: error.message,
    });
  }
}
