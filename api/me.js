import {
  APP_USERS_TABLE,
  ORGANIZATIONS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './_lib/supabase.js';
import { normalizeBillingStatus, normalizePlanType, normalizeSubscriptionStatus } from './_lib/tenantRegistry.js';
import { authenticateRequest } from './_lib/auth.js';

const BASE_PROFILE_FIELDS = 'id, email, username, full_name, first_name, last_name, role, access_enabled, permissions, phone_number, address, date_of_birth, emergency_contact, emergency_phone, preferences, staff_id_documents, whatsapp_notifications, salary_amount, created_at, updated_at, primary_organization_id';
const BUSINESS_OWNER_PROFILE_FIELDS = `${BASE_PROFILE_FIELDS}, verification_status, approved_at, approved_by, rejection_reason, subscription_plan, subscription_status, trial_started_at, trial_ends_at, subscription_started_at, plan_type, billing_status, suspended_at, suspension_reason, plan_changed_at`;

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('column') ||
    details.includes('schema cache')
  );
};

const buildProfileFromAuthUser = (user, profile = null) => {
  const hasProfileField = (field) => Boolean(profile) && Object.prototype.hasOwnProperty.call(profile, field);
  const fromProfile = (field, fallback = null) => (hasProfileField(field) ? profile[field] : fallback);

  return {
    ...(profile || {}),
    id: fromProfile('id', user?.id || null),
    email: fromProfile('email', user?.email || null),
    username: fromProfile('username', user?.user_metadata?.username || null),
    full_name: fromProfile('full_name', user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || null),
    first_name: fromProfile('first_name', user?.user_metadata?.first_name || null),
    last_name: fromProfile('last_name', user?.user_metadata?.last_name || null),
    role: fromProfile('role', user?.user_metadata?.role || user?.app_metadata?.role || 'customer'),
    phone_number: fromProfile('phone_number', user?.user_metadata?.phone || null),
    address: fromProfile('address', user?.user_metadata?.address || null),
    date_of_birth: fromProfile('date_of_birth', user?.user_metadata?.date_of_birth || null),
    emergency_contact: fromProfile('emergency_contact', user?.user_metadata?.emergency_contact || null),
    emergency_phone: fromProfile('emergency_phone', user?.user_metadata?.emergency_phone || null),
    preferences: fromProfile('preferences', user?.user_metadata?.preferences || {}),
    staff_id_documents: fromProfile('staff_id_documents', user?.user_metadata?.staff_id_documents || []),
    verification_status: fromProfile('verification_status', user?.user_metadata?.verification_status || null),
    approved_at: fromProfile('approved_at', user?.user_metadata?.approved_at || null),
    approved_by: fromProfile('approved_by', user?.user_metadata?.approved_by || null),
    rejection_reason: fromProfile('rejection_reason', user?.user_metadata?.rejection_reason || null),
    subscription_plan: fromProfile('subscription_plan', user?.user_metadata?.subscription_plan || null),
    subscription_status: fromProfile('subscription_status', user?.user_metadata?.subscription_status || null),
    plan_type: fromProfile('plan_type', user?.user_metadata?.plan_type || 'starter'),
    billing_status: fromProfile('billing_status', user?.user_metadata?.billing_status || 'none'),
    trial_started_at: fromProfile('trial_started_at', user?.user_metadata?.trial_started_at || null),
    trial_ends_at: fromProfile('trial_ends_at', user?.user_metadata?.trial_ends_at || null),
    subscription_started_at: fromProfile('subscription_started_at', user?.user_metadata?.subscription_started_at || null),
    suspended_at: fromProfile('suspended_at', user?.user_metadata?.suspended_at || null),
    suspension_reason: fromProfile('suspension_reason', user?.user_metadata?.suspension_reason || null),
    plan_changed_at: fromProfile('plan_changed_at', user?.user_metadata?.plan_changed_at || null),
    primary_organization_id: fromProfile('primary_organization_id', null),
    organization_id: fromProfile('organization_id', fromProfile('primary_organization_id', null)),
    organization_name: fromProfile('organization_name', null),
    organization_role: fromProfile('organization_role', null),
    organization_status: fromProfile('organization_status', null),
    is_platform_organization: Boolean(fromProfile('is_platform_organization', false)),
  };
};

const loadOrganizationContext = async (adminClient, userId, profile) => {
  const primaryOrganizationId = profile?.primary_organization_id || null;

  if (primaryOrganizationId) {
    const [organizationResult, membershipResult] = await Promise.all([
      adminClient
        .from(ORGANIZATIONS_TABLE)
        .select('id, name, organization_status, is_platform_organization')
        .eq('id', primaryOrganizationId)
        .maybeSingle(),
      adminClient
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('member_role, membership_status')
        .eq('organization_id', primaryOrganizationId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (!organizationResult.error && organizationResult.data) {
      return {
        organization_id: organizationResult.data.id,
        organization_name: organizationResult.data.name,
        organization_role: membershipResult.data?.member_role || null,
        organization_status: organizationResult.data.organization_status || membershipResult.data?.membership_status || null,
        is_platform_organization: Boolean(organizationResult.data.is_platform_organization),
      };
    }
  }

  const membershipFallbackResult = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('organization_id, member_role, membership_status, organization:app_organizations(id, name, organization_status, is_platform_organization)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipFallbackResult.error || !membershipFallbackResult.data?.organization_id) {
    return null;
  }

  const organization = membershipFallbackResult.data.organization || null;
  return {
    organization_id: membershipFallbackResult.data.organization_id,
    organization_name: organization?.name || null,
    organization_role: membershipFallbackResult.data.member_role || null,
    organization_status: organization?.organization_status || membershipFallbackResult.data.membership_status || null,
    is_platform_organization: Boolean(organization?.is_platform_organization),
  };
};

const loadProfileWithCompatibility = async (adminClient, userId) => {
  const fullResult = await adminClient
    .from(APP_USERS_TABLE)
    .select(BUSINESS_OWNER_PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();

  if (!fullResult.error) {
    return fullResult;
  }

  if (!isSchemaCompatibilityError(fullResult.error)) {
    return fullResult;
  }

  return adminClient
    .from(APP_USERS_TABLE)
    .select(BASE_PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle();
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const requestUrl = (() => {
    try {
      return new URL(req.url, 'http://localhost');
    } catch {
      return null;
    }
  })();
  const pathResource = requestUrl?.pathname?.split('/').filter(Boolean).pop() || '';
  const resource = String(req.query?.resource || pathResource || '').trim().toLowerCase();

  const auth = await authenticateRequest(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { user, adminClient } = auth;

  try {
    if (req.method === 'GET' && resource === 'profile') {
      const { data, error } = await loadProfileWithCompatibility(adminClient, user.id);

      if (error) {
        throw error;
      }

      const organizationContext = await loadOrganizationContext(adminClient, user.id, data || null);
      res.status(200).json({
        profile: buildProfileFromAuthUser(user, {
          ...(data || {}),
          ...(organizationContext || {}),
        }),
      });
      return;
    }

    if (req.method === 'PATCH' && resource === 'profile') {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(payload, key);
      const explicitUsername = hasOwn('username')
        ? String(payload.username || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '')
        : null;
      const explicitFirstName = hasOwn('first_name') ? String(payload.first_name || '').trim() : null;
      const explicitLastName = hasOwn('last_name') ? String(payload.last_name || '').trim() : null;
      const explicitFullName = hasOwn('full_name') || hasOwn('name')
        ? String(payload.full_name || payload.name || '').trim()
        : null;
      const normalizedFullName = explicitFullName !== null
        ? explicitFullName || null
        : [explicitFirstName, explicitLastName]
            .filter((value) => value !== null && value !== '')
            .join(' ')
            .trim() || null;
      const nowIso = new Date().toISOString();

      const profileUpdate = {
        username: explicitUsername,
        first_name: explicitFirstName,
        last_name: explicitLastName,
        full_name: normalizedFullName || null,
        phone_number: payload.phone || null,
        address: payload.address || null,
        date_of_birth: payload.date_of_birth || null,
        emergency_contact: payload.emergency_contact || null,
        emergency_phone: payload.emergency_phone || null,
        preferences: payload.preferences || {},
        updated_at: nowIso,
      };

      const metadataPatch = {
        ...(user.user_metadata || {}),
        username: explicitUsername,
        first_name: explicitFirstName,
        last_name: explicitLastName,
        full_name: normalizedFullName || null,
        name: normalizedFullName || null,
        phone: payload.phone || null,
        address: payload.address || null,
        date_of_birth: payload.date_of_birth || null,
        emergency_contact: payload.emergency_contact || null,
        emergency_phone: payload.emergency_phone || null,
        preferences: payload.preferences || {},
      };

      const { data: updatedProfile, error: updateError } = await adminClient
        .from(APP_USERS_TABLE)
        .update(profileUpdate)
        .eq('id', user.id)
        .select(BASE_PROFILE_FIELDS)
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProfile) {
        throw new Error('Profile update did not persist');
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: metadataPatch,
      });

      if (authUpdateError) {
        console.warn('Profile metadata update failed after app profile save:', authUpdateError);
      }

      const organizationContext = await loadOrganizationContext(adminClient, user.id, updatedProfile || null);
      const nextUser = {
        ...user,
        user_metadata: metadataPatch,
      };

      res.status(200).json({
        profile: buildProfileFromAuthUser(nextUser, {
          ...updatedProfile,
          ...(organizationContext || {}),
        }),
      });
      return;
    }

    if (req.method === 'PATCH' && resource === 'subscription') {
      const requestedPlan = String(req.body?.subscription_plan || '').trim().toLowerCase();
      const allowedPlans = new Set(['saas', 'saas_web']);

      if (!allowedPlans.has(requestedPlan)) {
        res.status(400).json({ error: 'Invalid subscription plan' });
        return;
      }

      const accountType = String(user.user_metadata?.account_type || user.app_metadata?.account_type || '').trim().toLowerCase();
      if (!['business_owner', 'operator', 'business', 'rental_business'].includes(accountType)) {
        res.status(403).json({ error: 'Business owner access required' });
        return;
      }

      const nowIso = new Date().toISOString();
      const nextUserMetadata = {
        ...(user.user_metadata || {}),
        subscription_plan: requestedPlan,
        subscription_status: 'active',
        plan_type: requestedPlan === 'saas_web' ? 'growth' : 'starter',
        billing_status: 'active',
        subscription_started_at: nowIso,
      };

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: nextUserMetadata,
      });

      if (authUpdateError) {
        throw authUpdateError;
      }

      let profile = null;
      const { data, error } = await adminClient
        .from(APP_USERS_TABLE)
        .update({
          subscription_plan: requestedPlan,
          subscription_status: 'active',
          plan_type: requestedPlan === 'saas_web' ? 'growth' : 'starter',
          billing_status: 'active',
          plan_changed_at: nowIso,
          subscription_started_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', user.id)
        .select('id, subscription_plan, subscription_status, plan_type, billing_status, subscription_started_at, trial_started_at, trial_ends_at, plan_changed_at')
        .single();

      if (error) {
        if (!isSchemaCompatibilityError(error)) {
          throw error;
        }
      } else {
        profile = data || null;
      }

      const { data: businessAccount } = await adminClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (businessAccount?.id) {
        const planType = requestedPlan === 'saas_web' ? 'growth' : 'starter';
        const subscriptionStatus = normalizeSubscriptionStatus('active');
        const billingStatus = normalizeBillingStatus('active');

        await adminClient
          .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
          .upsert(
            {
              business_account_id: businessAccount.id,
              plan_type: normalizePlanType(planType),
              subscription_status: subscriptionStatus,
              billing_status: billingStatus,
              subscription_started_at: nowIso,
              plan_limits: requestedPlan === 'saas_web'
                ? { vehicles: 30, staff_users: 8, marketplace_distribution: true }
                : { vehicles: 10, staff_users: 3, marketplace_distribution: false },
              metadata: { source: 'self_plan_selection', subscription_plan: requestedPlan },
            },
            { onConflict: 'business_account_id' }
          );

        const { data: tenantRecord } = await adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .select('id, tenant_status')
          .eq('business_account_id', businessAccount.id)
          .maybeSingle();

        if (tenantRecord?.id) {
          await adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              metadata: {
                latest_subscription_plan: requestedPlan,
                latest_plan_type: planType,
                activation_source: 'self_plan_selection',
              },
            })
            .eq('id', tenantRecord.id);
        }

        const { data: existingProvisioningJob } = await adminClient
          .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
          .select('id, job_status')
          .eq('business_account_id', businessAccount.id)
          .eq('job_type', 'create_tenant')
          .in('job_status', ['queued', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingProvisioningJob?.id) {
          await adminClient
            .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
            .insert({
              business_account_id: businessAccount.id,
              tenant_id: tenantRecord?.id || null,
              job_type: 'create_tenant',
              job_status: 'queued',
              payload: {
                source: 'self_plan_selection',
                subscription_plan: requestedPlan,
                plan_type: planType,
              },
              result: {},
            });
        }
      }

      const nextUser = {
        ...user,
        user_metadata: nextUserMetadata,
      };

      res.status(200).json({ profile: buildProfileFromAuthUser(nextUser, profile) });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
}
