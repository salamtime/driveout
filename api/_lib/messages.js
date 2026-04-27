import { APP_USERS_TABLE } from './supabase.js';

export const SHARED_MESSAGES_TABLE = 'shared_messages';
export const SHARED_MESSAGE_THREADS_TABLE = 'shared_message_threads';

export const MESSAGE_PRIORITIES = new Set([
  'normal',
  'important',
  'urgent',
]);

export const MESSAGE_WAITING_ON = new Set([
  'customer',
  'owner',
  'admin',
  'support',
  'none',
]);

export const MESSAGE_FAMILIES = new Set([
  'verification',
  'bookings',
  'tours',
  'marketplace',
  'account_trust',
  'support',
]);

export const MESSAGE_THREAD_TYPES = new Set([
  'verification',
  'verification_document',
  'verification_status',
  'rental_booking',
  'tour_booking',
  'marketplace_customer_request',
  'marketplace_owner_request',
  'marketplace_moderation',
  'account_status',
  'support_case',
]);

export const MESSAGE_SENDER_ROLES = new Set([
  'customer',
  'owner',
  'business_owner',
  'admin',
  'staff',
  'employee',
  'guide',
  'support',
  'system',
]);

export const normalizeIncomingSenderRole = (value, fallback = 'customer') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (MESSAGE_SENDER_ROLES.has(normalized)) return normalized;

  if (['administrator', 'super_admin'].includes(normalized)) return 'admin';
  if (['org_owner', 'organization_owner', 'operator', 'business', 'rental_business'].includes(normalized)) return 'business_owner';
  if (['team_member', 'team', 'staff_member'].includes(normalized)) return 'staff';
  if (['client', 'guest', 'renter'].includes(normalized)) return 'customer';
  if (['helper', 'service'].includes(normalized)) return 'support';
  if (normalized.includes('guide')) return 'guide';
  if (normalized.includes('employee')) return 'employee';
  if (normalized.includes('staff')) return 'staff';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('owner')) return 'owner';

  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  if (MESSAGE_SENDER_ROLES.has(normalizedFallback)) return normalizedFallback;
  return 'customer';
};

const normalizeText = (value) => String(value || '').trim();
const isMissingColumnError = (error) => String(error?.code || '').trim().toUpperCase() === '42703';

export const isSharedMessagesSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('shared_messages') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

export const isSharedMessageThreadsSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('shared_message_threads') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

export const normalizeMessagePriority = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (MESSAGE_PRIORITIES.has(normalized)) return normalized;
  return 'normal';
};

export const normalizeWaitingOn = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (MESSAGE_WAITING_ON.has(normalized)) return normalized;
  return null;
};

export const buildThreadKey = ({
  family,
  threadType,
  entityType,
  entityId,
  recipientUserId,
  senderUserId,
}) => {
  const safeFamily = normalizeText(family).toLowerCase() || 'support';
  const safeThreadType = normalizeText(threadType).toLowerCase() || 'support_case';
  const safeEntityType = normalizeText(entityType).toLowerCase() || 'generic';
  const safeEntityId = normalizeText(entityId) || 'general';
  const safeRecipientId = normalizeText(recipientUserId) || 'unknown';
  const safeSenderId = normalizeText(senderUserId) || 'system';
  return [safeFamily, safeThreadType, safeEntityType, safeEntityId, safeRecipientId, safeSenderId].join(':');
};

const getDisplayName = (user) => {
  if (!user) return '';
  const full = normalizeText(user.full_name);
  if (full) return full;
  const combined = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return normalizeText(combined || user.username || user.email);
};

const fetchTenantUserRows = async (adminClient, userIds = []) => {
  if (!userIds.length) return [];

  let query = adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, username, full_name, first_name, last_name, avatar_url, profile_picture_url')
    .in('id', userIds);

  let { data, error } = await query;

  if (error && isMissingColumnError(error)) {
    ({ data, error } = await adminClient
      .from(APP_USERS_TABLE)
      .select('id, email, username, full_name, first_name, last_name')
      .in('id', userIds));

    if (!error) {
      return (data || []).map((row) => ({
        ...row,
        avatar_url: null,
        profile_picture_url: null,
      }));
    }
  }

  if (error) return [];
  return data || [];
};

const fetchAuthUserLookup = async (adminClient, userIds = []) => {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { data, error } = await adminClient.auth.admin.getUserById(String(userId));
        if (error || !data?.user) return [String(userId), null];
        const user = data.user;
        const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
        return [
          String(userId),
          {
            id: user.id,
            email: normalizeText(user.email || metadata.email),
            username: normalizeText(metadata.username),
            full_name: normalizeText(metadata.full_name || metadata.name),
            first_name: normalizeText(metadata.first_name),
            last_name: normalizeText(metadata.last_name),
            avatar_url: normalizeText(metadata.avatar_url),
            profile_picture_url: normalizeText(metadata.profile_picture_url),
          },
        ];
      } catch {
        return [String(userId), null];
      }
    })
  );

  return new Map(entries);
};

export const buildUserLookup = async (adminClient, rows = []) => {
  const userIds = [...new Set(
    rows.flatMap((row) => [
      row.sender_user_id,
      row.recipient_user_id,
      row.entity_type === 'user' ? row.entity_id : null,
      row?.metadata?.ownerUserId,
      row?.metadata?.owner_id,
      row?.metadata?.customerUserId,
      row?.metadata?.customer_id,
    ].filter(Boolean).map((value) => String(value)))
  )];

  if (!userIds.length) return new Map();

  const [tenantRows, authLookup] = await Promise.all([
    fetchTenantUserRows(adminClient, userIds),
    fetchAuthUserLookup(adminClient, userIds),
  ]);

  const tenantLookup = new Map((tenantRows || []).map((row) => [String(row.id), row]));

  return new Map(
    userIds.map((userId) => {
      const tenantRow = tenantLookup.get(String(userId)) || {};
      const authRow = authLookup.get(String(userId)) || {};
      const merged = {
        id: String(userId),
        email: tenantRow.email || authRow.email || null,
        username: tenantRow.username || authRow.username || null,
        full_name: tenantRow.full_name || authRow.full_name || null,
        first_name: tenantRow.first_name || authRow.first_name || null,
        last_name: tenantRow.last_name || authRow.last_name || null,
        avatar_url: tenantRow.avatar_url || authRow.avatar_url || null,
        profile_picture_url: tenantRow.profile_picture_url || authRow.profile_picture_url || null,
      };

      return [String(userId), merged];
    })
  );
};

const buildPublicUserProfile = (user) => {
  if (!user?.id) return null;
  return {
    id: String(user.id),
    name: getDisplayName(user) || null,
    email: user.email || null,
    avatarUrl: user.avatar_url || user.profile_picture_url || null,
  };
};

const mergeUserProfile = (profiles, user) => {
  const profile = buildPublicUserProfile(user);
  if (!profile?.id) return profiles;
  return {
    ...profiles,
    [profile.id]: {
      ...(profiles?.[profile.id] || {}),
      ...profile,
    },
  };
};

export const decorateMessages = async (adminClient, rows = []) => {
  const userLookup = await buildUserLookup(adminClient, rows);

  return rows.map((row) => {
    const sender = userLookup.get(String(row.sender_user_id || '')) || null;
    const recipient = userLookup.get(String(row.recipient_user_id || '')) || null;
    const entityUser = row.entity_type === 'user'
      ? userLookup.get(String(row.entity_id || '')) || null
      : null;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const metadataOwner = userLookup.get(String(metadata.ownerUserId || metadata.owner_id || '')) || null;
    const metadataCustomer = userLookup.get(String(metadata.customerUserId || metadata.customer_id || '')) || null;
    const entityEmail =
      entityUser?.email ||
      recipient?.email ||
      sender?.email ||
      normalizeText(metadata.entityEmail || metadata.ownerEmail || metadata.customerEmail || metadata.email) ||
      null;
    const entityName =
      getDisplayName(entityUser) ||
      getDisplayName(recipient) ||
      getDisplayName(sender) ||
      normalizeText(metadata.entityName || metadata.ownerName || metadata.customerName || metadata.name) ||
      null;

    return {
      ...row,
      sender_email: sender?.email || null,
      sender_name: getDisplayName(sender) || null,
      recipient_email: recipient?.email || null,
      recipient_name: getDisplayName(recipient) || null,
      entity_email: entityEmail,
      entity_name: entityName,
      sender_avatar_url: sender?.avatar_url || sender?.profile_picture_url || null,
      recipient_avatar_url: recipient?.avatar_url || recipient?.profile_picture_url || null,
      entity_avatar_url:
        entityUser?.avatar_url ||
        entityUser?.profile_picture_url ||
        null,
      user_profiles: [sender, recipient, entityUser, metadataOwner, metadataCustomer].reduce(
        (profiles, user) => mergeUserProfile(profiles, user),
        {}
      ),
    };
  });
};

const mergeThreadUserProfiles = (threadProfiles = {}, rowProfiles = {}) => {
  const merged = { ...(threadProfiles || {}) };
  Object.entries(rowProfiles || {}).forEach(([userId, profile]) => {
    if (!userId || !profile) return;
    merged[String(userId)] = {
      ...(merged[String(userId)] || {}),
      ...profile,
    };
  });
  return merged;
};

export const groupMessagesIntoThreads = (rows = [], currentUserId = '') => {
  const groups = new Map();

  rows.forEach((row) => {
    const key =
      normalizeText(row.thread_id) ||
      normalizeText(row.thread_key) ||
      String(row.id);
    const existing = groups.get(key);
    const rowMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const rowDocumentType = normalizeText(rowMetadata.documentType || rowMetadata.verificationType).toLowerCase();

    if (!existing) {
      groups.set(key, {
        id: key,
        thread_key: normalizeText(row.thread_key) || key,
        thread_row_id: normalizeText(row.thread_id) || null,
        family: row.family,
        thread_type: row.thread_type,
        entity_type: row.entity_type || null,
        entity_id: row.entity_id || null,
        entity_email: row.entity_email || null,
        entity_name: row.entity_name || null,
        subject: normalizeText(row.subject) || 'Message thread',
        latest_message: normalizeText(row.body),
        latest_message_at: row.created_at,
        status: row.status || 'sent',
        message_count: 1,
        unread_count:
          row.recipient_user_id === currentUserId && !row.read_at
            ? 1
            : 0,
        sender_user_id: row.sender_user_id || null,
        sender_role: row.sender_role || 'system',
        sender_email: row.sender_email || null,
        sender_name: row.sender_name || null,
        sender_avatar_url: row.sender_avatar_url || null,
        recipient_user_id: row.recipient_user_id || null,
        recipient_email: row.recipient_email || null,
        recipient_name: row.recipient_name || null,
        recipient_avatar_url: row.recipient_avatar_url || null,
        entity_avatar_url: row.entity_avatar_url || null,
        user_profiles: row.user_profiles || {},
        metadata: {
          ...rowMetadata,
          threadKey: normalizeText(row.thread_key) || key,
        },
        priority: normalizeMessagePriority(row.priority),
        waiting_on: normalizeWaitingOn(row.waiting_on),
        resolved_at: row.resolved_at || null,
        messages: [row],
        document_types: rowDocumentType ? [rowDocumentType] : [],
      });
      return;
    }

    existing.messages.push(row);
    existing.message_count += 1;
    existing.user_profiles = mergeThreadUserProfiles(existing.user_profiles, row.user_profiles);
    if (rowDocumentType && !existing.document_types.includes(rowDocumentType)) {
      existing.document_types.push(rowDocumentType);
    }
    if (new Date(row.created_at || 0).getTime() > new Date(existing.latest_message_at || 0).getTime()) {
      existing.latest_message = normalizeText(row.body);
      existing.latest_message_at = row.created_at;
      existing.subject = normalizeText(row.subject) || existing.subject;
      existing.status = row.status || existing.status;
      existing.thread_row_id = normalizeText(row.thread_id) || existing.thread_row_id || null;
      existing.sender_user_id = row.sender_user_id || existing.sender_user_id;
      existing.sender_role = row.sender_role || existing.sender_role;
      existing.sender_email = row.sender_email || existing.sender_email;
      existing.sender_name = row.sender_name || existing.sender_name;
      existing.sender_avatar_url = row.sender_avatar_url || existing.sender_avatar_url || null;
      existing.recipient_avatar_url = row.recipient_avatar_url || existing.recipient_avatar_url || null;
      existing.entity_email = row.entity_email || existing.entity_email;
      existing.entity_name = row.entity_name || existing.entity_name;
      existing.entity_avatar_url = row.entity_avatar_url || existing.entity_avatar_url || null;
      existing.metadata = row.metadata && typeof row.metadata === 'object'
        ? {
            ...row.metadata,
            threadKey: normalizeText(row.thread_key) || existing.thread_key || key,
            documentTypes: existing.document_types,
          }
        : existing.metadata;
      existing.priority = normalizeMessagePriority(row.priority || existing.priority);
      existing.waiting_on = normalizeWaitingOn(row.waiting_on) || existing.waiting_on || null;
      existing.resolved_at = row.resolved_at || existing.resolved_at || null;
    }

    if (row.recipient_user_id === currentUserId && !row.read_at) {
      existing.unread_count += 1;
    }
  });

  return Array.from(groups.values())
    .map((thread) => ({
      ...thread,
      metadata: {
        ...(thread.metadata && typeof thread.metadata === 'object' ? thread.metadata : {}),
        ...(String(thread.family || '').trim().toLowerCase() === 'verification'
          ? { documentTypes: thread.document_types || [] }
          : {}),
      },
      messages: [...thread.messages].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    }))
    .sort((a, b) => new Date(b.latest_message_at || 0).getTime() - new Date(a.latest_message_at || 0).getTime());
};
