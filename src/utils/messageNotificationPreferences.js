const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeFamily = (value = '') => String(value || '').trim().toLowerCase();
const normalizeThreadType = (value = '') => String(value || '').trim().toLowerCase();

export const getMessageNotificationPreferences = ({ userProfile, user, session } = {}) => {
  const preferences =
    userProfile?.preferences ||
    session?.user?.user_metadata?.preferences ||
    user?.user_metadata?.preferences ||
    {};

  const messagingPreferences =
    preferences?.messagingNotifications ||
    preferences?.messageNotifications ||
    preferences?.messaging ||
    {};

  return {
    customerMessages: messagingPreferences.customerMessages !== false,
  };
};

export const isSupportNotificationThread = (thread = {}) => {
  const family = normalizeFamily(thread?.family);
  const threadType = normalizeThreadType(thread?.thread_type || thread?.threadType);

  return family === 'support' || threadType === 'support_case';
};

export const isCustomerNotificationThread = (thread = {}) => {
  if (isSupportNotificationThread(thread)) return false;
  const senderRole = normalizeRole(thread?.sender_role || thread?.senderRole);
  return senderRole === 'customer' || senderRole === 'renter';
};

export const shouldSurfaceMessageThreadNotification = (thread = {}, preferences = {}) => {
  if (isSupportNotificationThread(thread)) return true;
  if (!preferences.customerMessages) return false;
  return isCustomerNotificationThread(thread);
};

const getUnreadCount = (thread = {}) => {
  if (Number.isFinite(Number(thread?.unread_count))) {
    return Number(thread.unread_count);
  }
  return thread?.unread ? 1 : 0;
};

const sortNewestFirst = (threads = []) => (
  [...threads].sort(
    (a, b) =>
      new Date(b?.latest_message_at || b?.at || 0).getTime() -
      new Date(a?.latest_message_at || a?.at || 0).getTime()
  )
);

export const getUnreadMessageThreadBuckets = (threads = [], preferences = {}) => {
  const unreadThreads = (Array.isArray(threads) ? threads : []).filter(
    (thread) => getUnreadCount(thread) > 0
  );

  const supportUnreadThreads = sortNewestFirst(
    unreadThreads.filter((thread) => isSupportNotificationThread(thread))
  );
  const customerUnreadThreads = sortNewestFirst(
    unreadThreads.filter((thread) => isCustomerNotificationThread(thread))
  );

  return {
    supportUnreadThreads,
    customerUnreadThreads,
    visibleUnreadThreads: sortNewestFirst(
      unreadThreads.filter((thread) => shouldSurfaceMessageThreadNotification(thread, preferences))
    ),
    primaryUnreadThread:
      supportUnreadThreads[0] ||
      (preferences.customerMessages ? customerUnreadThreads[0] : null) ||
      null,
  };
};
