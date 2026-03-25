import { requireOwner } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const auth = await requireOwner(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { adminClient } = auth;

  try {
    if (req.method === 'GET') {
      const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (error) {
        throw error;
      }

      res.status(200).json({ users: data?.users || [] });
      return;
    }

    if (req.method === 'POST') {
      const { email, password, email_confirm = true, user_metadata = {} } = req.body || {};

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm,
        user_metadata,
      });

      if (error) {
        throw error;
      }

      res.status(201).json({ user: data?.user || null });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Admin request failed' });
  }
}
