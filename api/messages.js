import { authenticateRequest } from './_lib/auth.js';
import { APP_USERS_TABLE, SHARED_MESSAGE_MEDIA_TABLE } from './_lib/supabase.js';
import { handleTelegramAlertsRequest } from './_lib/telegramAlertsHandler.js';
import { handleTelegramOverdueRemindersRequest } from './_lib/telegramOverdueRemindersHandler.js';
import {
  buildThreadKey,
  decorateMessages,
  groupMessagesIntoThreads,
  isSharedMessageThreadsSchemaUnavailable,
  isSharedMessagesSchemaUnavailable,
  MESSAGE_FAMILIES,
  normalizeMessagePriority,
  normalizeIncomingSenderRole,
  normalizeWaitingOn,
  MESSAGE_SENDER_ROLES,
  SHARED_MESSAGES_TABLE,
  SHARED_MESSAGE_THREADS_TABLE,
  MESSAGE_THREAD_TYPES,
} from './_lib/messages.js';

const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const THREAD_EVENTS_TABLE = 'thread_events';
const DEFAULT_MESSAGE_MEDIA_POLICY = {
  messagingPhotoRetentionDays: 7,
};
const DEFAULT_MESSAGE_MEDIA_RETENTION_DAYS = 7;
const DEFAULT_MESSAGE_MAX_ATTACHMENTS = 3;
const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const getAction = (req) => String(req.query?.action || '').trim();

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

const assertString = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
};

const emptyMessagesResponse = (res, extra = {}) =>
  sendJson(res, 200, {
    messages: [],
    threads: [],
    setup_required: true,
    ...extra,
  });

const validateFamily = (family) => MESSAGE_FAMILIES.has(String(family || '').trim().toLowerCase());
const validateThreadType = (threadType) => MESSAGE_THREAD_TYPES.has(String(threadType || '').trim().toLowerCase());
const validateSenderRole = (senderRole) => MESSAGE_SENDER_ROLES.has(String(senderRole || '').trim().toLowerCase());
const DELETABLE_SHARED_MESSAGE_TYPES = new Set([
  'note',
  'message',
  'user_message',
  'admin_message',
  'internal_note',
]);

const isThreadEventsSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('thread_events') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const buildVerificationCanonicalThreadKey = (entityType = '', entityId = '') =>
  ['verification', 'verification', String(entityType || '').trim().toLowerCase() || 'user', String(entityId || '').trim() || 'unknown'].join(':');

const isMissingColumnError = (error) => String(error?.code || '').trim().toUpperCase() === '42703';

const fetchTenantThreadUsers = async (adminClient, userIds = []) => {
  if (!userIds.length) return [];

  let { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, username, full_name, first_name, last_name, avatar_url, profile_picture_url')
    .in('id', userIds);

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

const fetchAuthThreadUsers = async (adminClient, userIds = []) => {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { data, error } = await adminClient.auth.admin.getUserById(String(userId));
        if (error || !data?.user) return [String(userId), null];
        const authUser = data.user;
        const metadata = authUser.user_metadata && typeof authUser.user_metadata === 'object' ? authUser.user_metadata : {};
        return [
          String(userId),
          {
            id: authUser.id,
            email: String(authUser.email || metadata.email || '').trim() || null,
            username: String(metadata.username || '').trim() || null,
            full_name: String(metadata.full_name || metadata.name || '').trim() || null,
            first_name: String(metadata.first_name || '').trim() || null,
            last_name: String(metadata.last_name || '').trim() || null,
            avatar_url: String(metadata.avatar_url || '').trim() || null,
            profile_picture_url: String(metadata.profile_picture_url || '').trim() || null,
          },
        ];
      } catch {
        return [String(userId), null];
      }
    })
  );

  return new Map(entries);
};

const buildThreadUserLookup = async (adminClient, rows = []) => {
  const userIds = [...new Set(
    (rows || [])
      .flatMap((row) => [
        row?.sender_user_id,
        row?.recipient_user_id,
        row?.metadata?.ownerUserId,
        row?.metadata?.owner_id,
        row?.metadata?.customerUserId,
        row?.metadata?.customer_id,
      ])
      .filter(Boolean)
      .map((value) => String(value))
  )];

  if (!userIds.length) return new Map();

  const [tenantRows, authLookup] = await Promise.all([
    fetchTenantThreadUsers(adminClient, userIds),
    fetchAuthThreadUsers(adminClient, userIds),
  ]);

  const lookup = new Map(
    userIds.map((userId) => {
      const tenantRow = (tenantRows || []).find((row) => String(row?.id || '') === String(userId)) || {};
      const authRow = authLookup.get(String(userId)) || {};
      return [
        String(userId),
        {
          id: String(userId),
          email: tenantRow.email || authRow.email || null,
          username: tenantRow.username || authRow.username || null,
          full_name: tenantRow.full_name || authRow.full_name || null,
          first_name: tenantRow.first_name || authRow.first_name || null,
          last_name: tenantRow.last_name || authRow.last_name || null,
          avatar_url: tenantRow.avatar_url || authRow.avatar_url || null,
          profile_picture_url: tenantRow.profile_picture_url || authRow.profile_picture_url || null,
        },
      ];
    })
  );

  const getDisplayName = (user) => {
    if (!user) return '';
    const full = String(user.full_name || '').trim();
    if (full) return full;
    const combined = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return String(combined || user.username || user.email || '').trim();
  };

  return new Map(
    [...lookup.entries()].map(([userId, row]) => [
      String(userId),
      {
        ...row,
        display_name: getDisplayName(row),
        profile_avatar_url: row?.avatar_url || row?.profile_picture_url || null,
      },
    ])
  );
};

const buildStateOnlyThreads = async (adminClient, threadStateRows = [], currentUserId = '') => {
  const userLookup = await buildThreadUserLookup(adminClient, threadStateRows);

  return (threadStateRows || []).map((row) => {
    const sender = userLookup.get(String(row.sender_user_id || '')) || null;
    const recipient = userLookup.get(String(row.recipient_user_id || '')) || null;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const metadataOwner = userLookup.get(String(metadata.ownerUserId || metadata.owner_id || '')) || null;
    const metadataCustomer = userLookup.get(String(metadata.customerUserId || metadata.customer_id || '')) || null;
    const userProfiles = [sender, recipient, metadataOwner, metadataCustomer].reduce((profiles, user) => {
      if (!user?.id) return profiles;
      return {
        ...profiles,
        [String(user.id)]: {
          id: String(user.id),
          name: user.display_name || null,
          email: user.email || null,
          avatarUrl: user.profile_avatar_url || null,
        },
      };
    }, {});
    return {
      id: row.thread_key,
      thread_key: row.thread_key,
      family: row.family,
      thread_type: row.thread_type,
      entity_type: row.entity_type || null,
      entity_id: row.entity_id || null,
      entity_email: recipient?.email || sender?.email || null,
      entity_name: recipient?.display_name || sender?.display_name || null,
      subject:
        row.family === 'marketplace'
          ? 'Marketplace request'
          : row.family === 'verification'
            ? 'Verification review'
            : 'Message thread',
      latest_message: '',
      latest_message_at: row.updated_at || row.created_at || null,
      status: row.resolved_at ? 'read' : 'sent',
      message_count: 0,
      unread_count: 0,
      sender_user_id: row.sender_user_id || null,
      sender_role: row.sender_user_id === currentUserId ? 'customer' : 'system',
      sender_email: sender?.email || null,
      sender_name: sender?.display_name || null,
      sender_avatar_url: sender?.profile_avatar_url || null,
      recipient_user_id: row.recipient_user_id || null,
      recipient_email: recipient?.email || null,
      recipient_name: recipient?.display_name || null,
      recipient_avatar_url: recipient?.profile_avatar_url || null,
      user_profiles: userProfiles,
      metadata: {
        ...metadata,
        stateOnly: true,
      },
      thread_row_id: row.id || null,
      context_type: row.context_type || null,
      context_id: row.context_id || null,
      workflow_status: row.workflow_status || null,
      visibility_scope: row.visibility_scope || null,
      priority: normalizeMessagePriority(row.priority),
      waiting_on: normalizeWaitingOn(row.waiting_on),
      resolved_at: row.resolved_at || null,
      messages: [],
      document_types: [],
      timeline_events: [],
    };
  });
};

const dedupeRowsById = (rows = []) => {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = String(row?.id || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const loadMessagesForThreadStates = async (adminClient, threadStateRows = [], scope = 'self', userId = '', limit = 200) => {
  const threadIds = [...new Set((threadStateRows || []).map((row) => String(row?.id || '').trim()).filter(Boolean))];
  const threadKeys = [...new Set((threadStateRows || []).map((row) => String(row?.thread_key || '').trim()).filter(Boolean))];
  if (!threadIds.length && !threadKeys.length) return [];

  const applyScope = (query) => (
    scope === 'admin'
      ? query
      : query.or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
  );

  const rows = [];

  if (threadIds.length) {
    const { data, error } = await applyScope(
      adminClient
        .from(SHARED_MESSAGES_TABLE)
        .select('*')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(limit)
    );

    if (error) {
      if (isSharedMessagesSchemaUnavailable(error)) return [];
      throw error;
    }

    rows.push(...(data || []));
  }

  if (threadKeys.length) {
    const { data, error } = await applyScope(
      adminClient
        .from(SHARED_MESSAGES_TABLE)
        .select('*')
        .in('thread_key', threadKeys)
        .is('thread_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)
    );

    if (error) {
      if (isSharedMessagesSchemaUnavailable(error)) return dedupeRowsById(rows);
      throw error;
    }

    rows.push(...(data || []));
  }

  return dedupeRowsById(rows);
};

const buildThreadsFromThreadStates = async (adminClient, threadStateRows = [], messageRows = [], currentUserId = '') => {
  const stateThreads = await buildStateOnlyThreads(adminClient, threadStateRows, currentUserId);
  const threadMap = new Map(
    (stateThreads || []).map((thread) => [String(thread?.thread_key || '').trim(), thread])
  );

  (messageRows || []).forEach((row) => {
    const threadKey = String(row?.thread_key || '').trim();
    if (!threadKey || !threadMap.has(threadKey)) return;

    const thread = threadMap.get(threadKey);
    thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
    thread.messages.push(row);
    thread.message_count = Number(thread.message_count || 0) + 1;
    if (row.recipient_user_id === currentUserId && !row.read_at) {
      thread.unread_count = Number(thread.unread_count || 0) + 1;
    }

    const rowMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const rowDocumentType = String(rowMetadata.documentType || rowMetadata.verificationType || '').trim().toLowerCase();
    if (rowDocumentType && !thread.document_types.includes(rowDocumentType)) {
      thread.document_types.push(rowDocumentType);
    }

    thread.user_profiles = {
      ...(thread.user_profiles || {}),
      ...(row.user_profiles || {}),
    };

    const latestAt = new Date(thread.latest_message_at || 0).getTime();
    const rowAt = new Date(row.created_at || 0).getTime();
    if (!latestAt || rowAt >= latestAt) {
      thread.latest_message = String(row.body || '').trim();
      thread.latest_message_at = row.created_at || thread.latest_message_at || null;
      thread.status = row.status || thread.status || 'sent';
      thread.subject = String(row.subject || '').trim() || thread.subject;
      thread.sender_user_id = row.sender_user_id || thread.sender_user_id || null;
      thread.sender_role = row.sender_role || thread.sender_role || 'system';
      thread.sender_email = row.sender_email || thread.sender_email || null;
      thread.sender_name = row.sender_name || thread.sender_name || null;
      thread.sender_avatar_url = row.sender_avatar_url || thread.sender_avatar_url || null;
      thread.recipient_user_id = row.recipient_user_id || thread.recipient_user_id || null;
      thread.recipient_email = row.recipient_email || thread.recipient_email || null;
      thread.recipient_name = row.recipient_name || thread.recipient_name || null;
      thread.recipient_avatar_url = row.recipient_avatar_url || thread.recipient_avatar_url || null;
      thread.entity_email = row.entity_email || thread.entity_email || null;
      thread.entity_name = row.entity_name || thread.entity_name || null;
      thread.entity_avatar_url = row.entity_avatar_url || thread.entity_avatar_url || null;
      thread.metadata = {
        ...(thread.metadata && typeof thread.metadata === 'object' ? thread.metadata : {}),
        ...rowMetadata,
        threadKey,
      };
      thread.priority = normalizeMessagePriority(row.priority || thread.priority);
      thread.waiting_on = normalizeWaitingOn(row.waiting_on) || thread.waiting_on || null;
      thread.resolved_at = row.resolved_at || thread.resolved_at || null;
    }
  });

  return Array.from(threadMap.values())
    .map((thread) => ({
      ...thread,
      messages: [...(thread.messages || [])].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
      metadata: {
        ...(thread.metadata && typeof thread.metadata === 'object' ? thread.metadata : {}),
        ...(String(thread.family || '').trim().toLowerCase() === 'verification'
          ? { documentTypes: thread.document_types || [] }
          : {}),
      },
    }))
    .sort((a, b) => new Date(b.latest_message_at || 0).getTime() - new Date(a.latest_message_at || 0).getTime());
};

const isMissingMessageMediaSchemaError = (error) => {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    message.includes('not found')
  );
};

const cleanupExpiredMessageMedia = async (adminClient, retentionDays = null) => {
  const nowIso = new Date().toISOString();

  let query = adminClient
    .from(SHARED_MESSAGE_MEDIA_TABLE)
    .select('id, bucket, storage_path, thumbnail_url, public_url, expires_at, status')
    .is('deleted_at', null)
    .neq('status', 'expired')
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: true })
    .limit(500);

  if (retentionDays !== null && retentionDays !== undefined) {
    const cutoffIso = new Date(Date.now() - Math.max(1, Number(retentionDays) || 1) * 24 * 60 * 60 * 1000).toISOString();
    query = query.lte('created_at', cutoffIso);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const mediaRows = rows || [];
  if (!mediaRows.length) {
    return {
      expiredRows: 0,
      deletedFiles: 0,
      failedFiles: [],
    };
  }

  const bucketMap = new Map();
  const addPath = (bucket, path) => {
    if (!bucket || !path) return;
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, new Set());
    }
    bucketMap.get(bucket).add(path);
  };

  mediaRows.forEach((row) => {
    addPath(row.bucket, row.storage_path);
  });

  const failedFiles = [];
  let deletedFiles = 0;

  for (const [bucket, paths] of bucketMap.entries()) {
    const pathList = Array.from(paths).filter(Boolean);
    if (!pathList.length) continue;

    const { data: removed, error: removeError } = await adminClient.storage
      .from(bucket)
      .remove(pathList);

    if (removeError) {
      failedFiles.push({ bucket, paths: pathList, error: removeError.message });
      continue;
    }

    deletedFiles += removed?.length || pathList.length;
  }

  const ids = mediaRows.map((row) => row.id);
  const { error: updateError } = await adminClient
    .from(SHARED_MESSAGE_MEDIA_TABLE)
    .update({
      status: 'expired',
      deleted_at: nowIso,
      storage_path: null,
      public_url: null,
      thumbnail_url: null,
    })
    .in('id', ids);

  if (updateError) throw updateError;

  return {
    expiredRows: ids.length,
    deletedFiles,
    failedFiles,
  };
};

const mergeThreadState = (threads = [], threadStateRows = []) => {
  const stateMap = new Map(
    (threadStateRows || [])
      .filter((row) => row?.thread_key)
      .map((row) => [String(row.thread_key), row])
  );

  return (threads || []).map((thread) => {
    const state = stateMap.get(String(thread.thread_key || thread.id || ''));
    if (!state) return thread;
    return {
      ...thread,
      thread_row_id: state.id || thread.thread_row_id || null,
      context_type: state.context_type || thread.context_type || null,
      context_id: state.context_id || thread.context_id || null,
      workflow_status: state.workflow_status || thread.workflow_status || null,
      visibility_scope: state.visibility_scope || thread.visibility_scope || null,
      priority: normalizeMessagePriority(state.priority || thread.priority),
      waiting_on: normalizeWaitingOn(state.waiting_on) || thread.waiting_on || null,
      resolved_at: state.resolved_at || thread.resolved_at || null,
      thread_state_updated_at: state.updated_at || null,
    };
  });
};

const loadThreadEvents = async (adminClient, threadIds = []) => {
  const safeThreadIds = [...new Set((threadIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!safeThreadIds.length) return [];

  const { data, error } = await adminClient
    .from(THREAD_EVENTS_TABLE)
    .select('*')
    .in('thread_id', safeThreadIds)
    .order('created_at', { ascending: true });

  if (error) {
    if (isThreadEventsSchemaUnavailable(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
};

const attachThreadEvents = (threads = [], eventRows = []) => {
  const grouped = new Map();
  (eventRows || []).forEach((row) => {
    const key = String(row?.thread_id || '').trim();
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  return (threads || []).map((thread) => {
    const threadId = String(thread?.thread_row_id || '').trim();
    return {
      ...thread,
      timeline_events: grouped.get(threadId) || [],
    };
  });
};

const loadThreadStates = async (adminClient, threadKeys = [], scope = 'self', userId = '') => {
  const safeKeys = [...new Set((threadKeys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!safeKeys.length) return [];

  let query = adminClient
    .from(SHARED_MESSAGE_THREADS_TABLE)
    .select('*')
    .in('thread_key', safeKeys);

  if (scope !== 'admin') {
    query = query.or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isSharedMessageThreadsSchemaUnavailable(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
};

const loadAllVisibleThreadStates = async (adminClient, scope = 'self', userId = '', limit = 200) => {
  let query = adminClient
    .from(SHARED_MESSAGE_THREADS_TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (scope !== 'admin') {
    query = query.or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isSharedMessageThreadsSchemaUnavailable(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
};

const loadThreadStateByContext = async (
  adminClient,
  {
    scope = 'self',
    userId = '',
    family = '',
    threadType = '',
    entityType = '',
    entityId = '',
  } = {}
) => {
  const normalizedEntityType = String(entityType || '').trim().toLowerCase();
  const normalizedEntityId = String(entityId || '').trim();
  if (!normalizedEntityType || !normalizedEntityId) return null;

  const safeFamily = String(family || '').trim().toLowerCase();
  const safeThreadType = String(threadType || '').trim().toLowerCase();
  const rows = await loadAllVisibleThreadStates(adminClient, scope, userId, 200);

  return rows.find((row) => {
    const rowFamily = String(row?.family || '').trim().toLowerCase();
    const rowThreadType = String(row?.thread_type || '').trim().toLowerCase();
    const rowContextType = String(row?.context_type || '').trim().toLowerCase();
    const rowContextId = String(row?.context_id || '').trim();
    const rowEntityType = String(row?.entity_type || '').trim().toLowerCase();
    const rowEntityId = String(row?.entity_id || '').trim();
    const matchesContext =
      (rowContextType === normalizedEntityType && rowContextId === normalizedEntityId) ||
      (rowEntityType === normalizedEntityType && rowEntityId === normalizedEntityId);
    if (!matchesContext) return false;
    if (safeFamily && rowFamily && rowFamily !== safeFamily) return false;
    if (safeThreadType && rowThreadType && rowThreadType !== safeThreadType) return false;
    return true;
  }) || null;
};

const getThreadStateStatus = (row = {}) => String(row?.workflow_status || '').trim().toLowerCase() || 'active';

const threadMatchesRequestFilters = (thread = {}, query = {}) => {
  const requestedThreadKey = String(query.threadKey || '').trim();
  if (requestedThreadKey) {
    return String(thread?.thread_key || thread?.id || '').trim() === requestedThreadKey;
  }

  const requestedFamily = String(query.family || '').trim().toLowerCase();
  if (requestedFamily && requestedFamily !== 'all') {
    if (String(thread?.family || '').trim().toLowerCase() !== requestedFamily) return false;
  }

  const requestedThreadType = String(query.threadType || '').trim().toLowerCase();
  if (requestedThreadType && requestedThreadType !== 'all') {
    if (String(thread?.thread_type || '').trim().toLowerCase() !== requestedThreadType) return false;
  }

  const requestedEntityType = String(query.entityType || '').trim().toLowerCase();
  if (requestedEntityType) {
    const threadEntityType = String(thread?.entity_type || '').trim().toLowerCase();
    const threadContextType = String(thread?.context_type || '').trim().toLowerCase();
    if (threadEntityType !== requestedEntityType && threadContextType !== requestedEntityType) {
      return false;
    }
  }

  const requestedEntityId = String(query.entityId || '').trim();
  if (requestedEntityId) {
    const threadEntityId = String(thread?.entity_id || '').trim();
    const threadContextId = String(thread?.context_id || '').trim();
    if (threadEntityId !== requestedEntityId && threadContextId !== requestedEntityId) {
      return false;
    }
  }

  const requestedContextType = String(query.contextType || '').trim().toLowerCase();
  if (requestedContextType) {
    const threadContextType = String(thread?.context_type || '').trim().toLowerCase();
    const threadEntityType = String(thread?.entity_type || '').trim().toLowerCase();
    if (threadContextType !== requestedContextType && threadEntityType !== requestedContextType) {
      return false;
    }
  }

  const requestedContextId = String(query.contextId || '').trim();
  if (requestedContextId) {
    const threadContextId = String(thread?.context_id || '').trim();
    const threadEntityId = String(thread?.entity_id || '').trim();
    if (threadContextId !== requestedContextId && threadEntityId !== requestedContextId) {
      return false;
    }
  }

  return true;
};

const upsertThreadState = async (adminClient, payload = {}) => {
  const threadKey = String(payload.thread_key || '').trim();
  if (!threadKey) return null;

  const { data, error } = await adminClient
    .from(SHARED_MESSAGE_THREADS_TABLE)
    .upsert({
      ...payload,
      priority: normalizeMessagePriority(payload.priority),
      waiting_on: normalizeWaitingOn(payload.waiting_on),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'thread_key',
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (isSharedMessageThreadsSchemaUnavailable(error)) {
      return null;
    }
    throw error;
  }

  return data || null;
};

const buildCanonicalContextThreadKey = ({
  family = 'support',
  threadType = 'support_case',
  entityType = 'conversation',
  entityId = '',
} = {}) => buildThreadKey({
  family,
  threadType,
  entityType,
  entityId,
  recipientUserId: 'canonical',
  senderUserId: 'canonical',
});

const deriveThreadStateFromMessage = (body = {}, user = {}) => {
  const messageType = String(body.messageType || 'note').trim().toLowerCase();
  const isInternal = Boolean(body?.metadata?.isInternal) || messageType === 'internal_note';
  const senderRole = normalizeIncomingSenderRole(
    body.senderRole,
    user?.user_metadata?.role || user?.app_metadata?.role || 'customer'
  );
  const recipientRole = String(body.recipientRole || '').trim().toLowerCase();

  return {
    priority: normalizeMessagePriority(body.priority),
    waiting_on: isInternal ? normalizeWaitingOn(body.waitingOn) : normalizeWaitingOn(body.waitingOn || recipientRole),
    resolved_at: body.resolved === true ? new Date().toISOString() : null,
    sender_user_id: user.id,
    recipient_user_id: String(body.recipientUserId || '').trim() || user.id,
    sender_role: senderRole,
    recipient_role: recipientRole,
    is_internal: isInternal,
  };
};

const insertSharedMessage = async (adminClient, payload = {}) => {
  const { data, error } = await adminClient
    .from(SHARED_MESSAGES_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (!error) {
    return { data, error: null };
  }

  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === 'PGRST204' || code === '42703' || message.includes('is_internal')) {
    const { is_internal, ...fallbackPayload } = payload;
    return adminClient
      .from(SHARED_MESSAGES_TABLE)
      .insert(fallbackPayload)
      .select('*')
      .single();
  }

  return { data: null, error };
};

const resolveThreadReplyTarget = async (adminClient, threadKey, currentUserId) => {
  const normalizedThreadKey = String(threadKey || '').trim();
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  if (!normalizedThreadKey || !normalizedCurrentUserId) {
    return null;
  }

  const { data, error } = await adminClient
    .from(SHARED_MESSAGES_TABLE)
    .select('sender_user_id, sender_role, recipient_user_id, recipient_role, created_at')
    .eq('thread_key', normalizedThreadKey)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !Array.isArray(data) || !data.length) {
    return null;
  }

  for (const row of data) {
    const senderUserId = String(row?.sender_user_id || '').trim();
    const recipientUserId = String(row?.recipient_user_id || '').trim();

    if (senderUserId === normalizedCurrentUserId && recipientUserId) {
      return {
        recipientUserId,
        recipientRole: String(row?.recipient_role || '').trim().toLowerCase() || null,
      };
    }

    if (recipientUserId === normalizedCurrentUserId && senderUserId) {
      return {
        recipientUserId: senderUserId,
        recipientRole: String(row?.sender_role || '').trim().toLowerCase() || null,
      };
    }
  }

  return null;
};

const normalizeAttachmentPayload = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => ({
      kind: String(attachment?.kind || 'photo').trim().toLowerCase() || 'photo',
      bucket: String(attachment?.bucket || '').trim(),
      storagePath: String(attachment?.storagePath || attachment?.storage_path || '').trim(),
      publicUrl: String(attachment?.publicUrl || attachment?.public_url || '').trim(),
      thumbnailUrl: String(attachment?.thumbnailUrl || attachment?.thumbnail_url || attachment?.publicUrl || attachment?.public_url || '').trim(),
      mimeType: String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase(),
      originalFilename: String(attachment?.originalFilename || attachment?.original_filename || '').trim(),
      fileSize: Math.max(0, Number(attachment?.fileSize || attachment?.file_size || 0) || 0),
      metadata: attachment?.metadata && typeof attachment.metadata === 'object' ? attachment.metadata : {},
    }))
    .filter((attachment) => attachment.bucket && attachment.storagePath && attachment.publicUrl && attachment.mimeType.startsWith('image/'));

const sanitizeInheritedMessageMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== 'object') return {};

  const nextMetadata = { ...metadata };
  delete nextMetadata.attachments;
  delete nextMetadata.replyTo;
  delete nextMetadata.replyToMessageId;
  delete nextMetadata.sendFailed;
  delete nextMetadata.sendFailedMessage;
  delete nextMetadata.autoWelcome;
  delete nextMetadata.event;
  delete nextMetadata.status;
  delete nextMetadata.readOnlyReason;

  return nextMetadata;
};

const isMarketplaceConversationThreadType = (threadType = '') =>
  ['marketplace_owner_request', 'marketplace_customer_request'].includes(
    String(threadType || '').trim().toLowerCase()
  );

const isMarketplaceParticipantRole = (role = '') =>
  ['owner', 'business_owner', 'customer', 'renter'].includes(
    String(role || '').trim().toLowerCase()
  );

const buildMarketplaceThreadHref = (requestId = '', threadType = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return '';
  return String(threadType || '').trim().toLowerCase() === 'marketplace_owner_request'
    ? `/account/vehicles?requestId=${encodeURIComponent(normalizedRequestId)}#requests`
    : `/account/rentals/requests/${encodeURIComponent(normalizedRequestId)}`;
};

const buildMarketplaceMirrorMetadata = (metadata = {}, requestId = '', threadType = '') => ({
  ...sanitizeInheritedMessageMetadata(metadata),
  type: 'marketplace_request',
  requestId: String(requestId || metadata?.requestId || '').trim() || undefined,
  roleContext: String(threadType || '').trim().toLowerCase() === 'marketplace_owner_request' ? 'owner' : 'customer',
  href: buildMarketplaceThreadHref(requestId || metadata?.requestId || '', threadType) || String(metadata?.href || '').trim() || undefined,
  replyEnabled: true,
});

const getMessageMediaRetentionDays = async (adminClient) => {
  const { data, error } = await adminClient
    .from(SETTINGS_TABLE)
    .select('messaging_photo_retention_days')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const errorCode = String(error?.code || '').toLowerCase();
    if (
      errorCode === '42703' ||
      errorCode === '42p01' ||
      errorCode === 'pgrst204' ||
      errorCode === 'pgrst205' ||
      errorMessage.includes('column') && errorMessage.includes('does not exist') ||
      errorMessage.includes('relation') && errorMessage.includes('does not exist')
    ) {
      return DEFAULT_MESSAGE_MEDIA_RETENTION_DAYS;
    }
    throw error;
  }

  return Math.max(1, Math.min(30, Number(data?.messaging_photo_retention_days) || DEFAULT_MESSAGE_MEDIA_RETENTION_DAYS));
};

const getMessagingPolicy = async (adminClient) => {
  const { data, error } = await adminClient
    .from(SETTINGS_TABLE)
    .select('messaging_photo_sharing_enabled, messaging_max_photos_per_message')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const errorCode = String(error?.code || '').toLowerCase();
    if (
      errorCode === '42703' ||
      errorCode === '42p01' ||
      errorCode === 'pgrst204' ||
      errorCode === 'pgrst205' ||
      errorMessage.includes('column') && errorMessage.includes('does not exist') ||
      errorMessage.includes('relation') && errorMessage.includes('does not exist')
    ) {
      return {
        messagingPhotoSharingEnabled: true,
        messagingMaxPhotosPerMessage: DEFAULT_MESSAGE_MAX_ATTACHMENTS,
      };
    }
    throw error;
  }

  return {
    messagingPhotoSharingEnabled: data?.messaging_photo_sharing_enabled !== false,
    messagingMaxPhotosPerMessage: Math.max(
      1,
      Math.min(10, Number(data?.messaging_max_photos_per_message) || DEFAULT_MESSAGE_MAX_ATTACHMENTS)
    ),
  };
};

const attachUploadedMedia = async (adminClient, messageRow, attachments = []) => {
  const normalizedAttachments = normalizeAttachmentPayload(attachments);
  if (!normalizedAttachments.length) {
    return [];
  }

  const retentionDays = await getMessageMediaRetentionDays(adminClient);
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const insertRows = normalizedAttachments.map((attachment) => ({
    message_id: messageRow.id,
    thread_key: messageRow.thread_key,
    family: messageRow.family,
    sender_user_id: messageRow.sender_user_id,
    recipient_user_id: messageRow.recipient_user_id,
    bucket: attachment.bucket,
    storage_path: attachment.storagePath,
    public_url: attachment.publicUrl,
    thumbnail_url: attachment.thumbnailUrl || attachment.publicUrl,
    mime_type: attachment.mimeType,
    original_filename: attachment.originalFilename || null,
    file_size: attachment.fileSize || null,
    metadata: attachment.metadata || {},
    status: 'active',
    expires_at: expiresAt,
  }));

  const { data, error } = await adminClient
    .from(SHARED_MESSAGE_MEDIA_TABLE)
    .insert(insertRows)
    .select('*');

  if (error) {
    if (isSharedMessagesSchemaUnavailable(error)) {
      return normalizedAttachments.map((attachment) => ({
        ...attachment,
        expiresAt,
        status: 'active',
      }));
    }
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    kind: 'photo',
    bucket: row.bucket,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    thumbnailUrl: row.thumbnail_url || row.public_url,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    fileSize: row.file_size,
    status: row.status,
    expiresAt: row.expires_at,
  }));
};

const validateIncomingAttachments = async (adminClient, attachments = []) => {
  const normalizedAttachments = normalizeAttachmentPayload(attachments);
  if (!normalizedAttachments.length) {
    return [];
  }

  const policy = await getMessagingPolicy(adminClient);
  if (normalizedAttachments.length > policy.messagingMaxPhotosPerMessage) {
    throw new Error(`You can attach up to ${policy.messagingMaxPhotosPerMessage} photo(s) per message`);
  }

  normalizedAttachments.forEach((attachment) => {
    if (!attachment.mimeType.startsWith('image/')) {
      throw new Error('Only image attachments are allowed');
    }
    if (attachment.fileSize > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new Error('Chat photos must stay under 5 MB after optimization');
    }
  });

  return normalizedAttachments;
};

const loadExistingThreadMessage = async (adminClient, threadKey) => {
  const normalizedThreadKey = String(threadKey || '').trim();
  if (!normalizedThreadKey) return null;

  const { data, error } = await adminClient
    .from(SHARED_MESSAGES_TABLE)
    .select('*')
    .eq('thread_key', normalizedThreadKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isSharedMessagesSchemaUnavailable(error)) return null;
    throw error;
  }

  return data || null;
};

const getAccessScope = async (adminClient, user) => {
  try {
    const { data: profile } = await adminClient
      .from(APP_USERS_TABLE)
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const effectiveRole = String(profile?.role || user?.user_metadata?.role || user?.app_metadata?.role || '').trim().toLowerCase();
    const accountType = String(
      user?.user_metadata?.account_type ||
      user?.app_metadata?.account_type ||
      ''
    ).trim().toLowerCase();
    if (
      effectiveRole === 'admin' ||
      effectiveRole === 'owner' ||
      effectiveRole === 'business_owner' ||
      accountType === 'owner' ||
      accountType === 'individual_owner' ||
      accountType === 'operator' ||
      accountType === 'business'
    ) {
      return 'admin';
    }
  } catch {
    // fall through to self scope
  }

  return 'self';
};

const handleGet = async (req, res) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user } = auth;
  const scope = await getAccessScope(adminClient, user);

  const allThreadStateRows = await loadAllVisibleThreadStates(adminClient, scope, user.id, Number(req.query.limit || 200));
  const filteredThreadStateRows = (allThreadStateRows || [])
    .filter((row) => getThreadStateStatus(row) !== 'merged')
    .filter((row) => threadMatchesRequestFilters(row, req.query));
  const rawMessages = await loadMessagesForThreadStates(
    adminClient,
    filteredThreadStateRows,
    scope,
    user.id,
    Number(req.query.limit || 200)
  );
  const decorated = await decorateMessages(adminClient, rawMessages || []);
  const mergedThreads = await buildThreadsFromThreadStates(adminClient, filteredThreadStateRows, decorated, user.id);
  const threadEvents = await loadThreadEvents(
    adminClient,
    mergedThreads.map((thread) => thread?.thread_row_id).filter(Boolean)
  );
  const threads = attachThreadEvents(mergedThreads, threadEvents)
    .filter((thread) => threadMatchesRequestFilters(thread, req.query));
  return sendJson(res, 200, { messages: decorated, threads, scope });
};

const handlePost = async (req, res) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user } = auth;
  const body = parseBody(req.body);
  const action = getAction(req);
  const scope = await getAccessScope(adminClient, user);

  if (action === 'cleanup-media') {
    if (scope !== 'admin') {
      return sendJson(res, 403, { error: 'Only admin can clean up message media' });
    }

    try {
      const safeDays = Math.max(
        1,
        Math.min(
          30,
          Number(body?.retentionDays) || DEFAULT_MESSAGE_MEDIA_POLICY.messagingPhotoRetentionDays
        )
      );
      const result = await cleanupExpiredMessageMedia(adminClient, safeDays);
      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (isMissingMessageMediaSchemaError(error)) {
        return sendJson(res, 200, {
          ok: true,
          expiredRows: 0,
          deletedFiles: 0,
          failedFiles: [],
          warning: 'Shared message media schema is not available yet. Run create_shared_message_media.sql.',
        });
      }
      return sendJson(res, 500, { error: error.message || 'Message media cleanup failed' });
    }
  }

  const requestedThreadKey = String(body.threadKey || '').trim();
  const existingThreadStateRows = requestedThreadKey
    ? await loadThreadStates(adminClient, [requestedThreadKey], scope, user.id)
    : [];
  const existingThreadState = existingThreadStateRows[0] || null;
  const existingThreadMessage = requestedThreadKey
    ? await loadExistingThreadMessage(adminClient, requestedThreadKey)
    : null;

  const family = assertString(existingThreadState?.family || existingThreadMessage?.family || body.family, 'family').toLowerCase();
  const requestedThreadType = assertString(existingThreadState?.thread_type || existingThreadMessage?.thread_type || body.threadType, 'threadType').toLowerCase();
  const incomingAttachments = await validateIncomingAttachments(adminClient, body.attachments);
  const rawMessageBody = String(body.body || '').trim();
  const messageBody = rawMessageBody || (incomingAttachments.length ? 'Photo attachment' : '');
  const senderRole = normalizeIncomingSenderRole(
    body.senderRole,
    user?.user_metadata?.role || user?.app_metadata?.role || 'customer'
  );
  let recipientUserId = String(body.recipientUserId || '').trim();
  let recipientRole = String(body.recipientRole || '').trim().toLowerCase() || null;

  if (!validateFamily(family)) {
    return sendJson(res, 400, { error: 'Invalid family' });
  }
  if (!validateThreadType(requestedThreadType)) {
    return sendJson(res, 400, { error: 'Invalid threadType' });
  }
  if (!validateSenderRole(senderRole)) {
    return sendJson(res, 400, { error: 'Invalid senderRole' });
  }
  if (!messageBody) {
    return sendJson(res, 400, { error: 'body or attachments are required' });
  }
  if (family === 'marketplace' && isMarketplaceConversationThreadType(requestedThreadType) && !isMarketplaceParticipantRole(senderRole)) {
    return sendJson(res, 403, {
      error: 'Marketplace renter-owner threads are read-only for admin and staff. Use the moderation thread instead.',
    });
  }
  if (family === 'marketplace' && requestedThreadType === MESSAGE_THREAD_TYPES.marketplaceModeration && senderRole === 'owner') {
    return sendJson(res, 403, {
      error: 'Listing review threads are read-only for owners until admin responds or approval is granted.',
    });
  }

  const explicitEntityType = String(existingThreadMessage?.entity_type || body.entityType || '').trim() || null;
  const explicitEntityId = String(existingThreadMessage?.entity_id || body.entityId || '').trim() || null;
  const existingContextThreadState = existingThreadState || (!requestedThreadKey && explicitEntityType && explicitEntityId
    ? await loadThreadStateByContext(adminClient, {
        scope,
        userId: user.id,
        family,
        threadType: requestedThreadType,
        entityType: explicitEntityType,
        entityId: explicitEntityId,
      })
    : null);

  if (requestedThreadKey) {
    const resolvedReplyTarget = await resolveThreadReplyTarget(adminClient, requestedThreadKey, user.id);
    if (resolvedReplyTarget?.recipientUserId) {
      recipientUserId = resolvedReplyTarget.recipientUserId;
      recipientRole = resolvedReplyTarget.recipientRole || recipientRole;
    }
  }

  if (!requestedThreadKey && existingContextThreadState) {
    const senderUserId = String(existingContextThreadState?.sender_user_id || '').trim();
    const recipientStateUserId = String(existingContextThreadState?.recipient_user_id || '').trim();
    const currentUserId = String(user.id || '').trim();

    if (!recipientUserId) {
      if (senderUserId && senderUserId !== currentUserId) {
        recipientUserId = senderUserId;
        recipientRole = String(existingContextThreadState?.sender_role || '').trim().toLowerCase() || recipientRole;
      } else if (recipientStateUserId && recipientStateUserId !== currentUserId) {
        recipientUserId = recipientStateUserId;
        recipientRole = String(existingContextThreadState?.recipient_role || '').trim().toLowerCase() || recipientRole;
      }
    }
  }

  if (!recipientUserId) {
    return sendJson(res, 400, { error: 'recipientUserId is required' });
  }

  if (!existingContextThreadState?.thread_key || !existingContextThreadState?.id) {
    return sendJson(res, 409, {
      error: 'Canonical thread not found for this context. Threads must be created from the source workflow before messages can be sent.',
    });
  }

  const resolvedEntityType = explicitEntityType;
  const resolvedEntityId = explicitEntityId;
  const threadType = String(existingContextThreadState?.thread_type || (family === 'verification' ? 'verification' : requestedThreadType)).trim().toLowerCase();
  const threadKey = String(existingContextThreadState?.thread_key || requestedThreadKey || '').trim();
  const threadId = String(existingContextThreadState?.id || '').trim();

  const insertPayload = {
    thread_id: threadId,
    thread_key: threadKey,
    family,
    thread_type: threadType,
    entity_type: resolvedEntityType,
    entity_id: resolvedEntityId,
    message_type: String(body.messageType || 'note').trim().toLowerCase(),
    subject: String(existingThreadMessage?.subject || body.subject || '').trim() || null,
    body: messageBody,
    sender_user_id: user.id,
    sender_role: senderRole,
    recipient_user_id: recipientUserId,
    recipient_role: recipientRole,
    metadata: {
      ...sanitizeInheritedMessageMetadata(
        existingThreadMessage?.metadata && typeof existingThreadMessage.metadata === 'object'
          ? existingThreadMessage.metadata
          : {}
      ),
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      ...(
        family === 'verification'
          ? {
              type: body?.metadata?.type || 'verification',
              threadKey,
            }
          : {}
      ),
      ...(
        family === 'marketplace'
          ? {
              requestId: String(
                body?.metadata?.requestId ||
                existingThreadMessage?.metadata?.requestId ||
                existingThreadMessage?.entity_id ||
                body.entityId ||
                ''
              ).trim() || undefined,
              type: 'marketplace_request',
            }
          : {}
      ),
      ...(incomingAttachments.length
        ? {
            attachments: incomingAttachments.map((attachment) => ({
              kind: attachment.kind,
              bucket: attachment.bucket,
              storagePath: attachment.storagePath,
              publicUrl: attachment.publicUrl,
              thumbnailUrl: attachment.thumbnailUrl || attachment.publicUrl,
              mimeType: attachment.mimeType,
              originalFilename: attachment.originalFilename || null,
              fileSize: attachment.fileSize || null,
            })),
          }
        : {}),
    },
    is_internal: deriveThreadStateFromMessage(body, user).is_internal,
    status: 'sent',
  };

  const derivedState = deriveThreadStateFromMessage(body, user);
  const { data, error } = await insertSharedMessage(adminClient, insertPayload);

  if (error) {
    if (isSharedMessagesSchemaUnavailable(error)) {
      return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
    }
    return sendJson(res, 500, { error: error.message });
  }

  try {
    let savedAttachments = [];
    if (incomingAttachments.length) {
      savedAttachments = await attachUploadedMedia(adminClient, data, incomingAttachments);
      if (savedAttachments.length) {
        const nextMetadata = {
          ...(data?.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
          attachments: savedAttachments,
        };

        const { data: updatedMessage, error: updateMessageError } = await adminClient
          .from(SHARED_MESSAGES_TABLE)
          .update({ metadata: nextMetadata })
          .eq('id', data.id)
          .select('*')
          .single();

        if (updateMessageError) {
          throw updateMessageError;
        }

        data.metadata = updatedMessage?.metadata || nextMetadata;
      }
    }

    await upsertThreadState(adminClient, {
      thread_key: threadKey,
      family: existingContextThreadState.family || family,
      thread_type: existingContextThreadState.thread_type || threadType,
      entity_type: existingContextThreadState.entity_type || resolvedEntityType,
      entity_id: existingContextThreadState.entity_id || resolvedEntityId,
      context_type: existingContextThreadState.context_type || null,
      context_id: existingContextThreadState.context_id || null,
      sender_user_id: existingContextThreadState.sender_user_id || user.id,
      recipient_user_id: existingContextThreadState.recipient_user_id || recipientUserId,
      priority: body.priority || existingThreadState?.priority || 'normal',
      waiting_on: derivedState.is_internal
        ? (body.waitingOn || existingThreadState?.waiting_on || null)
        : (body.waitingOn || derivedState.waiting_on || existingThreadState?.waiting_on || null),
      resolved_at: derivedState.is_internal
        ? (Object.prototype.hasOwnProperty.call(body, 'resolved')
          ? (body.resolved ? new Date().toISOString() : null)
          : existingThreadState?.resolved_at || null)
        : null,
      workflow_status: existingContextThreadState.workflow_status || null,
      visibility_scope: existingContextThreadState.visibility_scope || null,
      metadata: existingContextThreadState.metadata || {},
    });
  } catch (threadStateError) {
    return sendJson(res, 500, { error: threadStateError.message });
  }

  const [message] = await decorateMessages(adminClient, [data]);
  const threadStateRows = await loadThreadStates(adminClient, [threadKey], 'admin', user.id);
  const threadMessages = await loadMessagesForThreadStates(adminClient, threadStateRows, 'admin', user.id, 200);
  const decoratedThreadMessages = await decorateMessages(adminClient, threadMessages || []);
  const [thread] = await buildThreadsFromThreadStates(adminClient, threadStateRows, decoratedThreadMessages, user.id);
  return sendJson(res, 201, { message, thread });
};

const handlePatch = async (req, res) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user } = auth;
  const scope = await getAccessScope(adminClient, user);
  const action = getAction(req);

  if (!['mark-read', 'archive-thread', 'restore-thread', 'update-thread-state', 'ensure-thread', 'delete-message', 'delete-thread'].includes(action)) {
    return sendJson(res, 400, { error: 'Unsupported messages action' });
  }

  const body = parseBody(req.body);
  const threadKey = ['delete-message', 'ensure-thread'].includes(action)
    ? String(body.threadKey || '').trim()
    : assertString(body.threadKey, 'threadKey');

  let updatePayload = {};
  let updateQuery = null;

  if (action === 'delete-message') {
    const messageId = assertString(body.messageId, 'messageId');
    const { data: messageRow, error: messageLookupError } = await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .select('id, thread_key, sender_user_id, message_type')
      .eq('id', messageId)
      .maybeSingle();

    if (messageLookupError) {
      if (isSharedMessagesSchemaUnavailable(messageLookupError)) {
        return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
      }
      return sendJson(res, 500, { error: messageLookupError.message });
    }

    if (!messageRow) {
      return sendJson(res, 404, { error: 'Message not found' });
    }

    const senderUserId = String(messageRow.sender_user_id || '').trim();
    if (!senderUserId || senderUserId !== String(user.id || '').trim()) {
      return sendJson(res, 403, { error: 'You can only delete your own messages' });
    }

    const messageType = String(messageRow.message_type || '').trim().toLowerCase();
    if (!DELETABLE_SHARED_MESSAGE_TYPES.has(messageType)) {
      return sendJson(res, 400, { error: 'This message cannot be deleted' });
    }

    const { error: deleteError } = await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .delete()
      .eq('id', messageId)
      .eq('sender_user_id', user.id);

    if (deleteError) {
      if (isSharedMessagesSchemaUnavailable(deleteError)) {
        return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
      }
      return sendJson(res, 500, { error: deleteError.message });
    }

    return sendJson(res, 200, {
      ok: true,
      messageId,
      threadKey: String(messageRow.thread_key || '').trim() || threadKey || null,
    });
  }

  if (action === 'delete-thread') {
    const normalizedThreadKey = String(threadKey || '').trim();
    const threadStateRows = await loadThreadStates(adminClient, [normalizedThreadKey], scope, user.id);
    const threadState = threadStateRows[0] || null;

    const { data: threadMessages, error: lookupError } = await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .select('id, sender_user_id, recipient_user_id')
      .eq('thread_key', normalizedThreadKey);

    if (lookupError) {
      if (isSharedMessagesSchemaUnavailable(lookupError)) {
        return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
      }
      return sendJson(res, 500, { error: lookupError.message });
    }

    const messages = Array.isArray(threadMessages) ? threadMessages : [];
    const normalizedUserId = String(user.id || '').trim();
    const hasAccess = scope === 'admin'
      || Boolean(
        (threadState && [threadState.sender_user_id, threadState.recipient_user_id].map((value) => String(value || '').trim()).includes(normalizedUserId))
        || messages.some((row) => [row.sender_user_id, row.recipient_user_id].map((value) => String(value || '').trim()).includes(normalizedUserId))
      );

    if (!hasAccess) {
      return sendJson(res, 403, { error: 'You do not have permission to delete this thread' });
    }

    if (messages.length) {
      const { error: deleteMessagesError } = await adminClient
        .from(SHARED_MESSAGES_TABLE)
        .delete()
        .eq('thread_key', normalizedThreadKey);

      if (deleteMessagesError) {
        if (isSharedMessagesSchemaUnavailable(deleteMessagesError)) {
          return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
        }
        return sendJson(res, 500, { error: deleteMessagesError.message });
      }
    }

    const { error: deleteThreadStateError } = await adminClient
      .from(SHARED_MESSAGE_THREADS_TABLE)
      .delete()
      .eq('thread_key', normalizedThreadKey);

    if (deleteThreadStateError && !isSharedMessageThreadsSchemaUnavailable(deleteThreadStateError)) {
      return sendJson(res, 500, { error: deleteThreadStateError.message });
    }

    return sendJson(res, 200, {
      ok: true,
      threadKey: normalizedThreadKey,
      deletedMessages: messages.length,
    });
  }

  if (action === 'ensure-thread') {
    const normalizedContextType = String(body.contextType || '').trim().toLowerCase();
    const normalizedContextId = String(body.contextId || '').trim();
    if (!normalizedContextType || !normalizedContextId) {
      return sendJson(res, 400, { error: 'contextType and contextId are required' });
    }

    const family = String(
      body.family ||
      (normalizedContextType === 'rental' ? 'bookings' : 'support')
    ).trim().toLowerCase();
    const threadType = String(
      body.threadType ||
      (normalizedContextType === 'rental' ? 'rental_booking' : 'support_case')
    ).trim().toLowerCase();
    const waitingOn = normalizeWaitingOn(
      body.waitingOn ||
      (String(body.senderRole || '').trim().toLowerCase() === 'owner' ? 'customer' : normalizedContextType === 'rental' ? 'owner' : 'none')
    );

    const existingState = await loadThreadStateByContext(adminClient, {
      scope,
      userId: user.id,
      family,
      threadType,
      entityType: normalizedContextType,
      entityId: normalizedContextId,
    });

    if (existingState?.thread_key) {
      return sendJson(res, 200, { ok: true, threadState: existingState, created: false });
    }
    return sendJson(res, 409, {
      ok: false,
      created: false,
      error: 'Canonical thread not found for this context. Threads must be created from the source workflow.',
    });
  }

  if (action === 'mark-read') {
    updatePayload = { read_at: new Date().toISOString(), status: 'read' };
    updateQuery = adminClient
      .from(SHARED_MESSAGES_TABLE)
      .update(updatePayload)
      .eq('thread_key', threadKey);
    if (scope !== 'admin') {
      updateQuery = updateQuery.eq('recipient_user_id', user.id).is('read_at', null);
    }
  }

  if (action === 'archive-thread') {
    updatePayload = { status: 'archived' };
    updateQuery = adminClient
      .from(SHARED_MESSAGES_TABLE)
      .update(updatePayload)
      .eq('thread_key', threadKey);
  }

  if (action === 'restore-thread') {
    updatePayload = { status: 'read' };
    updateQuery = adminClient
      .from(SHARED_MESSAGES_TABLE)
      .update(updatePayload)
      .eq('thread_key', threadKey);
  }

  if (action === 'update-thread-state') {
    if (scope !== 'admin') {
      return sendJson(res, 403, { error: 'Only admin can update thread state' });
    }

    const updates = {};
    if ('priority' in body) {
      updates.priority = normalizeMessagePriority(body.priority);
    }
    if ('waitingOn' in body) {
      updates.waiting_on = normalizeWaitingOn(body.waitingOn);
    }
    if ('resolved' in body) {
      updates.resolved_at = body.resolved ? new Date().toISOString() : null;
    }

    const existingStateRows = await loadThreadStates(adminClient, [threadKey], 'admin', user.id);
    const existingState = existingStateRows[0] || null;
    const seedMessageResponse = await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .select('thread_key, family, thread_type, entity_type, entity_id, sender_user_id, recipient_user_id')
      .eq('thread_key', threadKey)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (seedMessageResponse.error) {
      return sendJson(res, 500, { error: seedMessageResponse.error.message });
    }

    const seedMessage = seedMessageResponse.data;
    if (!seedMessage && !existingState) {
      return sendJson(res, 404, { error: 'Thread state seed not found' });
    }

    try {
      const state = await upsertThreadState(adminClient, {
        thread_key: threadKey,
        family: existingState?.family || seedMessage?.family || 'support',
        thread_type: existingState?.thread_type || seedMessage?.thread_type || 'support_case',
        entity_type: existingState?.entity_type || seedMessage?.entity_type || null,
        entity_id: existingState?.entity_id || seedMessage?.entity_id || null,
        sender_user_id: existingState?.sender_user_id || seedMessage?.sender_user_id || user.id,
        recipient_user_id: existingState?.recipient_user_id || seedMessage?.recipient_user_id || user.id,
        priority: updates.priority || existingState?.priority || 'normal',
        waiting_on: Object.prototype.hasOwnProperty.call(updates, 'waiting_on')
          ? updates.waiting_on
          : existingState?.waiting_on || null,
        resolved_at: Object.prototype.hasOwnProperty.call(updates, 'resolved_at')
          ? updates.resolved_at
          : existingState?.resolved_at || null,
      });
      return sendJson(res, 200, { ok: true, threadState: state });
    } catch (stateError) {
      if (isSharedMessageThreadsSchemaUnavailable(stateError)) {
        return sendJson(res, 200, { ok: true, warning: 'Shared message thread state schema is not available yet.' });
      }
      return sendJson(res, 500, { error: stateError.message });
    }
  }

  const { error } = await updateQuery;

  if (error) {
    if (isSharedMessagesSchemaUnavailable(error)) {
      return sendJson(res, 500, { error: 'Shared messages schema is not available yet. Run create_shared_messages.sql.' });
    }
    return sendJson(res, 500, { error: error.message });
  }

  return sendJson(res, 200, { ok: true });
};

export default async function handler(req, res) {
  try {
    const action = getAction(req);
    if (action === 'telegram-alerts') return handleTelegramAlertsRequest(req, res);
    if (action === 'telegram-overdue-reminders') return handleTelegramOverdueRemindersRequest(req, res);
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Messages request failed' });
  }
}
