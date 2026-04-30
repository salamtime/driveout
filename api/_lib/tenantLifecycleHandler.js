import { getBearerToken, requirePlatformOwnerOrAdmin } from './auth.js';
import { createSupabaseClients, PLATFORM_BUSINESS_ACCOUNTS_TABLE, PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE, PLATFORM_TENANTS_TABLE, PLATFORM_TENANT_PROVISIONING_JOBS_TABLE } from './supabase.js';
import { insertTenantAuditLog } from './tenantAuditLog.js';
import { getTenantDeletionRetentionDays, resolveEffectiveSubscriptionStatus } from './tenantRegistry.js';

const json = (res, status, body) => res.status(status).json(body);

const LIFECYCLE_EVENT_TABLE = 'platform_tenant_events';
const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const SETTINGS_ROW_ID = 1;

const normalizeIso = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const addDaysIso = (value, days) => {
  const base = normalizeIso(value);
  if (!base) return null;
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const latestIso = (...values) => {
  const normalized = values
    .map(normalizeIso)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return normalized[0] || null;
};

const readConfiguredRetentionDays = async (adminClient) => {
  try {
    const { data, error } = await adminClient
      .from(SETTINGS_TABLE)
      .select('tenant_deletion_retention_days')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      const message = String(error?.message || error?.details || '').toLowerCase();
      const code = String(error?.code || '').toLowerCase();
      const isSchemaIssue =
        code === '42703' ||
        code === '42p01' ||
        code === 'pgrst204' ||
        code === 'pgrst205' ||
        message.includes('column') ||
        message.includes('does not exist') ||
        message.includes('schema cache');

      if (!isSchemaIssue) {
        throw error;
      }

      return getTenantDeletionRetentionDays();
    }

    const configured = Number(data?.tenant_deletion_retention_days);
    if (!Number.isFinite(configured) || configured <= 0) {
      return getTenantDeletionRetentionDays();
    }

    return Math.max(1, Math.min(365, Math.floor(configured)));
  } catch {
    return getTenantDeletionRetentionDays();
  }
};

const isAuthorizedCronRequest = (req) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (!cronSecret) return false;
  const token = getBearerToken(req);
  return Boolean(token && token === cronSecret);
};

const loadLifecycleAuth = async (req) => {
  if (isAuthorizedCronRequest(req)) {
    const { adminClient } = createSupabaseClients();
    return {
      adminClient,
      actorUserId: null,
      actorType: 'cron',
    };
  }

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');
  if (auth.error) {
    return { error: auth.error };
  }

  return {
    adminClient: auth.adminClient,
    actorUserId: auth.user?.id || null,
    actorType: 'user',
  };
};

const loadOwnerLastSignInLookup = async (adminClient, businessAccounts = []) => {
  const lookup = new Map();

  await Promise.all((businessAccounts || []).map(async (businessAccount) => {
    const authUserId = String(businessAccount?.auth_user_id || '').trim();
    if (!authUserId) return;

    try {
      const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
      if (error || !data?.user) return;
      lookup.set(authUserId, normalizeIso(data.user.last_sign_in_at || data.user.updated_at || data.user.created_at));
    } catch {
      // Ignore per-user auth lookup failures during lifecycle sweeps.
    }
  }));

  return lookup;
};

const queueArchiveJobIfNeeded = async ({ adminClient, businessAccountId, tenantId, nowIso }) => {
  const { data: existingJob, error: existingJobError } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .select('*')
    .eq('business_account_id', businessAccountId)
    .eq('tenant_id', tenantId)
    .eq('job_type', 'archive_tenant')
    .in('job_status', ['queued', 'running', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJobError) throw existingJobError;
  if (existingJob?.id) {
    return { queued: false, job: existingJob };
  }

  const { data: archiveJob, error: archiveJobError } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .insert({
      business_account_id: businessAccountId,
      tenant_id: tenantId,
      job_type: 'archive_tenant',
      job_status: 'queued',
      payload: {
        source: 'tenant_lifecycle',
        reason: 'retention_window_elapsed',
        requested_at: nowIso,
      },
      result: {},
    })
    .select('*')
    .single();

  if (archiveJobError) throw archiveJobError;
  return { queued: true, job: archiveJob };
};

export default async function tenantLifecycleHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await loadLifecycleAuth(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, actorUserId, actorType } = auth;
  const dryRun = String(req.query?.dry_run || req.body?.dry_run || '').trim().toLowerCase() === 'true';
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso);
  const retentionDays = await readConfiguredRetentionDays(adminClient);

  try {
    const [businessAccountsResult, subscriptionsResult, tenantsResult] = await Promise.all([
      adminClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      adminClient
        .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (businessAccountsResult.error) throw businessAccountsResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (tenantsResult.error) throw tenantsResult.error;

    const businessAccounts = businessAccountsResult.data || [];
    const subscriptions = subscriptionsResult.data || [];
    const tenants = tenantsResult.data || [];

    const subscriptionMap = new Map(
      subscriptions.map((subscription) => [String(subscription.business_account_id), subscription])
    );
    const tenantMap = new Map(
      tenants.map((tenant) => [String(tenant.business_account_id), tenant])
    );
    const ownerLastSignInLookup = await loadOwnerLastSignInLookup(adminClient, businessAccounts);

    const summary = {
      actorType,
      dryRun,
      retentionDays,
      processed: businessAccounts.length,
      trialsExpired: 0,
      tenantsSuspended: 0,
      archiveJobsQueued: 0,
      inspected: [],
    };

    for (const businessAccount of businessAccounts) {
      const businessAccountId = String(businessAccount?.id || '').trim();
      const subscription = subscriptionMap.get(businessAccountId) || null;
      const tenant = tenantMap.get(businessAccountId) || null;
      if (!subscription || !tenant) continue;

      const authUserId = String(businessAccount?.auth_user_id || '').trim();
      const ownerLastSignInAt = ownerLastSignInLookup.get(authUserId) || null;
      const effectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription, now);
      const trialEndsAt = normalizeIso(subscription.trial_ends_at);
      const tenantStatus = String(tenant.tenant_status || '').trim().toLowerCase();
      const lastActivityAt = latestIso(
        tenant?.metadata?.last_activity_at,
        subscription?.metadata?.last_activity_at,
        businessAccount?.metadata?.last_activity_at,
        ownerLastSignInAt,
        tenant?.updated_at,
        subscription?.updated_at,
        businessAccount?.updated_at
      );
      const retentionBaseAt = latestIso(trialEndsAt, lastActivityAt);
      const deletionEligibleAt = retentionBaseAt ? addDaysIso(retentionBaseAt, retentionDays) : null;

      const inspection = {
        business_account_id: businessAccountId,
        tenant_id: tenant.id,
        subscription_status: subscription.subscription_status,
        effective_subscription_status: effectiveSubscriptionStatus,
        tenant_status: tenantStatus,
        trial_ends_at: trialEndsAt,
        last_activity_at: lastActivityAt,
        deletion_eligible_at: deletionEligibleAt,
      };

      let currentSubscription = subscription;
      let currentTenant = tenant;

      if (
        String(subscription.subscription_status || '').trim().toLowerCase() === 'trial' &&
        effectiveSubscriptionStatus === 'expired' &&
        trialEndsAt
      ) {
        summary.trialsExpired += 1;

        if (!dryRun) {
          const computedDeletionDueAt = deletionEligibleAt;
          const nextMetadata = {
            ...((subscription.metadata && typeof subscription.metadata === 'object') ? subscription.metadata : {}),
            trial_expired_at: nowIso,
            lifecycle_last_run_at: nowIso,
            lifecycle_policy: {
              ...(((subscription.metadata && subscription.metadata.lifecycle_policy) && typeof subscription.metadata.lifecycle_policy === 'object')
                ? subscription.metadata.lifecycle_policy
                : {}),
              deletion_retention_days: retentionDays,
            },
            deletion_due_at: computedDeletionDueAt,
          };

          const { data: updatedSubscription, error: updatedSubscriptionError } = await adminClient
            .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
            .update({
              subscription_status: 'expired',
              metadata: nextMetadata,
            })
            .eq('id', subscription.id)
            .select('*')
            .single();

          if (updatedSubscriptionError) throw updatedSubscriptionError;
          currentSubscription = updatedSubscription;

          await insertTenantAuditLog({
            adminClient,
            businessAccountId,
            tenantId: tenant.id,
            performedBy: actorUserId,
            action: 'expire_tenant_trial',
            metadata: {
              actor_type: actorType,
              trial_ends_at: trialEndsAt,
              effective_at: nowIso,
            },
          });

          await adminClient.from(LIFECYCLE_EVENT_TABLE).insert({
            tenant_id: tenant.id,
            actor_user_id: actorUserId,
            event_type: 'trial_expired',
            payload: {
              business_account_id: businessAccountId,
              effective_at: nowIso,
            },
          });
        }
      }

      const lifecycleSubscriptionStatus = resolveEffectiveSubscriptionStatus(currentSubscription, now);

      if (
        ['expired', 'cancelled'].includes(lifecycleSubscriptionStatus) &&
        tenantStatus === 'active'
      ) {
        summary.tenantsSuspended += 1;

        if (!dryRun) {
          const computedDeletionDueAt = deletionEligibleAt;
          const tenantMetadata = {
            ...((currentTenant.metadata && typeof currentTenant.metadata === 'object') ? currentTenant.metadata : {}),
            lifecycle_suspended_at: nowIso,
            lifecycle_suspension_reason: lifecycleSubscriptionStatus === 'expired'
              ? 'trial_expired'
              : 'subscription_cancelled',
            lifecycle_last_run_at: nowIso,
            lifecycle_policy: {
              ...(((currentTenant.metadata && currentTenant.metadata.lifecycle_policy) && typeof currentTenant.metadata.lifecycle_policy === 'object')
                ? currentTenant.metadata.lifecycle_policy
                : {}),
              deletion_retention_days: retentionDays,
            },
            deletion_due_at: computedDeletionDueAt,
          };

          const { data: suspendedTenant, error: suspendedTenantError } = await adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              tenant_status: 'suspended',
              provisioning_error: lifecycleSubscriptionStatus === 'expired'
                ? 'Trial expired automatically'
                : 'Subscription cancelled automatically',
              metadata: tenantMetadata,
            })
            .eq('id', tenant.id)
            .select('*')
            .single();

          if (suspendedTenantError) throw suspendedTenantError;
          currentTenant = suspendedTenant;

          await insertTenantAuditLog({
            adminClient,
            businessAccountId,
            tenantId: tenant.id,
            performedBy: actorUserId,
            action: 'suspend_tenant_lifecycle',
            metadata: {
              actor_type: actorType,
              reason: lifecycleSubscriptionStatus,
              effective_at: nowIso,
            },
          });

          await adminClient.from(LIFECYCLE_EVENT_TABLE).insert({
            tenant_id: tenant.id,
            actor_user_id: actorUserId,
            event_type: 'suspended',
            payload: {
              business_account_id: businessAccountId,
              reason: lifecycleSubscriptionStatus,
              mode: 'tenant_lifecycle',
            },
          });
        }
      }

      if (
        ['expired', 'cancelled'].includes(lifecycleSubscriptionStatus) &&
        String(currentTenant.tenant_status || '').trim().toLowerCase() === 'suspended' &&
        deletionEligibleAt &&
        new Date(deletionEligibleAt).getTime() <= now.getTime()
      ) {
        if (!dryRun) {
          const queuedArchive = await queueArchiveJobIfNeeded({
            adminClient,
            businessAccountId,
            tenantId: tenant.id,
            nowIso,
          });

          if (queuedArchive.queued) {
            summary.archiveJobsQueued += 1;

            await adminClient
              .from(PLATFORM_TENANTS_TABLE)
              .update({
                metadata: {
                  ...((currentTenant.metadata && typeof currentTenant.metadata === 'object') ? currentTenant.metadata : {}),
                  deletion_scheduled_at: nowIso,
                  deletion_due_at: deletionEligibleAt,
                  deletion_reason: 'retention_window_elapsed',
                  lifecycle_last_run_at: nowIso,
                  lifecycle_policy: {
                    ...(((currentTenant.metadata && currentTenant.metadata.lifecycle_policy) && typeof currentTenant.metadata.lifecycle_policy === 'object')
                      ? currentTenant.metadata.lifecycle_policy
                      : {}),
                    deletion_retention_days: retentionDays,
                  },
                },
              })
              .eq('id', tenant.id);

            await insertTenantAuditLog({
              adminClient,
              businessAccountId,
              tenantId: tenant.id,
              performedBy: actorUserId,
              action: 'schedule_tenant_archive',
              metadata: {
                actor_type: actorType,
                deletion_due_at: deletionEligibleAt,
                archive_job_id: queuedArchive.job.id,
              },
            });

            await adminClient.from(LIFECYCLE_EVENT_TABLE).insert({
              tenant_id: tenant.id,
              actor_user_id: actorUserId,
              event_type: 'archive_scheduled',
              payload: {
                business_account_id: businessAccountId,
                deletion_due_at: deletionEligibleAt,
                archive_job_id: queuedArchive.job.id,
              },
            });
          }
        } else {
          summary.archiveJobsQueued += 1;
        }
      }

      summary.inspected.push(inspection);
    }

    return json(res, 200, summary);
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Failed to run tenant lifecycle automation',
    });
  }
}
