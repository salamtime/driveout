export const normalizeAdminRecipients = (users = []) =>
  (Array.isArray(users) ? users : [])
    .filter((user) => {
      const role = String(
        user?.role ||
          user?.app_metadata?.role ||
          user?.user_metadata?.role ||
          ''
      )
        .trim()
        .toLowerCase();
      return role === 'admin' || role === 'owner';
    })
    .map((user) => ({
      id: String(user?.id || '').trim(),
      label: String(
        user?.full_name ||
          user?.name ||
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.username ||
          user?.email ||
          'Admin'
      ).trim(),
      email: String(user?.email || '').trim(),
    }))
    .filter((user) => user.id);
