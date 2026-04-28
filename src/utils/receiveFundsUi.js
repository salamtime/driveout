export const buildStaffDisplayName = (user, fallback = 'Team') => {
  const firstLast = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  const metadataFirstLast = [user?.user_metadata?.first_name, user?.user_metadata?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return String(
    user?.fullName ||
      user?.full_name ||
      user?.display_name ||
      user?.name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.display_name ||
      user?.user_metadata?.name ||
      firstLast ||
      metadataFirstLast ||
      user?.username ||
      user?.email ||
      fallback
  ).trim();
};

export const buildStaffDisplayMap = (users = []) =>
  (Array.isArray(users) ? users : []).reduce((map, user) => {
    const id = String(user?.id || user?.user_id || '').trim();
    if (!id) return map;
    map[id] = buildStaffDisplayName(user);
    return map;
  }, {});

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
      label: buildStaffDisplayName(user, 'Admin'),
      email: String(user?.email || '').trim(),
    }))
    .filter((user) => user.id);
