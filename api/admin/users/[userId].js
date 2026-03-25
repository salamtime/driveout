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
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }

  try {
    if (req.method === 'PATCH') {
      const { email, password, user_metadata } = req.body || {};
      const updatePayload = {};

      if (email) {
        updatePayload.email = email;
      }

      if (password) {
        updatePayload.password = password;
      }

      if (user_metadata) {
        updatePayload.user_metadata = user_metadata;
      }

      const { data, error } = await adminClient.auth.admin.updateUserById(userId, updatePayload);

      if (error) {
        throw error;
      }

      res.status(200).json({ user: data?.user || null });
      return;
    }

    if (req.method === 'DELETE') {
      const { error } = await adminClient.auth.admin.deleteUser(userId);

      if (error) {
        throw error;
      }

      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Admin request failed' });
  }
}
