import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Trash2,
  CheckCircle,
  Download,
  AlertCircle,
  Menu,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  FileText,
  Trash,
  RefreshCw,
  Save,
  Pencil,
  MoreHorizontal
} from 'lucide-react';
import {
  getCustomerRentalHistory,
  checkCustomerRentalHistory, 
  deleteCustomer, 
  deleteCustomers,
} from '../services/EnhancedUnifiedCustomerService.js';
import {
  activateBusinessOwnerSubscription,
  approveBusinessOwner,
  changeBusinessOwnerPlan,
  extendBusinessOwnerTrial,
  getUsers,
  promoteExistingUserToStaff,
  reactivateBusinessOwner,
  rejectBusinessOwner,
  requestBusinessOwnerInfo,
  suspendBusinessOwner,
} from '../services/UserService';
import {
  completeTenantProvisioning,
  failTenantProvisioning,
  listBusinessOwnersFromRegistry,
  startTenantProvisioning,
} from '../services/TenantProvisioningAdminService';
import ViewCustomerDetailsDrawer from './admin/ViewCustomerDetailsDrawer';
import AdminModuleHero from './admin/AdminModuleHero';
import BusinessOwnerSaaSTable from './admin/BusinessOwnerSaaSTable';
import { useAuth } from '../contexts/AuthContext';
import { canEditCustomerProfile } from '../utils/permissionHelpers';
import { ALL_PERMISSION_KEYS, DEFAULT_STAFF_PERMISSION_KEYS } from '../utils/permissionCatalog';
import {
  getManagedAccountTypeMeta,
  isPlatformOwnerEmail,
  resolveManagedAccountType,
} from '../utils/accountType';
import {
  ADMIN_EYEBROW_CLASS,
  ADMIN_MAIN_CARD_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
} from '../utils/adminSurfaceStyles';
import i18n from '../i18n';

// Supabase client imported from lib/supabase.js
const APP_ID = '4c3a7a6153'; // Keep this for table naming
const PROFILE_SECTION_CLASS = 'rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-20px_rgba(15,23,42,0.35)] backdrop-blur md:p-6';
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);
const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const buildStaffPermissionsForCustomerPromotion = (role = 'employee') => {
  const normalizedRole = String(role || 'employee').toLowerCase();
  const defaultStaffAccess = new Set(DEFAULT_STAFF_PERMISSION_KEYS);
  return ALL_PERMISSION_KEYS.reduce((acc, permissionKey) => {
    if (normalizedRole === 'admin') {
      acc[permissionKey] = true;
      return acc;
    }

    acc[permissionKey] = defaultStaffAccess.has(permissionKey);

    return acc;
  }, {});
};

const getCustomerStaffEmail = (customer) => {
  if (!customer) return '';

  const directEmail = String(customer.email || customer.customer_email || '').trim();
  if (directEmail) return directEmail;

  const rentalEmail = (customer.rentalHistory || [])
    .map((rental) => rental?.customer_email || rental?.email)
    .find((email) => String(email || '').trim());

  return String(rentalEmail || '').trim();
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildAuthCustomerId = (authUserId) => `cust_auth_${String(authUserId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;

const isExternalAuthAccount = (authUser) => {
  const role = String(authUser?.role || authUser?.user_metadata?.role || '').toLowerCase();
  const accountType = String(authUser?.account_type || authUser?.user_metadata?.account_type || 'customer').toLowerCase();

  if (['owner', 'admin', 'manager', 'employee', 'guide', 'mechanic', 'staff'].includes(role)) {
    return false;
  }

  return !accountType || ['customer', 'individual_owner', 'private_owner', 'list_my_vehicle', 'operator', 'business_owner', 'business', 'rental_business'].includes(accountType);
};

const buildCustomerRowFromAuthUser = (authUser) => {
  const authEmail = normalizeEmail(authUser?.email);
  const authUserId = String(authUser?.id || '').trim();
  const accountType = String(authUser?.account_type || authUser?.user_metadata?.account_type || 'customer').toLowerCase();
  const dataSource = accountType === 'customer' ? 'gmail_signup' : 'owner_signup';
  const fullName =
    String(authUser?.full_name || authUser?.name || authUser?.user_metadata?.full_name || authUser?.email || 'Customer').trim();
  const nowLike = authUser?.updated_at || authUser?.created_at || new Date().toISOString();

  return {
    id: buildAuthCustomerId(authUserId),
    full_name: fullName,
    email: authEmail || authUser?.email || '',
    phone: authUser?.phone_number || authUser?.user_metadata?.phone || null,
    data_source: dataSource,
    customer_type: 'app_account',
    initial_scan_complete: false,
    created_at: authUser?.created_at || nowLike,
    updated_at: nowLike,
    account_type: accountType,
    verification_status: String(authUser?.verification_status || authUser?.user_metadata?.verification_status || 'pending').toLowerCase(),
    subscription_plan: String(authUser?.subscription_plan || authUser?.user_metadata?.subscription_plan || '').toLowerCase(),
    subscription_status: String(authUser?.subscription_status || authUser?.user_metadata?.subscription_status || '').toLowerCase(),
    plan_type: String(authUser?.plan_type || authUser?.user_metadata?.plan_type || 'starter').toLowerCase(),
    billing_status: String(authUser?.billing_status || authUser?.user_metadata?.billing_status || 'none').toLowerCase(),
    trial_started_at: authUser?.trial_started_at || authUser?.user_metadata?.trial_started_at || null,
    trial_ends_at: authUser?.trial_ends_at || authUser?.user_metadata?.trial_ends_at || null,
    subscription_started_at: authUser?.subscription_started_at || authUser?.user_metadata?.subscription_started_at || null,
    suspended_at: authUser?.suspended_at || authUser?.user_metadata?.suspended_at || null,
    suspension_reason: authUser?.suspension_reason || authUser?.user_metadata?.suspension_reason || '',
    last_sign_in_at: authUser?.last_sign_in_at || null,
    scan_metadata: {
      auth_user_id: authUserId || null,
      auth_email: authEmail || authUser?.email || null,
      contact_email: authEmail || authUser?.email || null,
      account_source: dataSource,
      account_type: accountType,
      verification_status: String(authUser?.verification_status || authUser?.user_metadata?.verification_status || 'pending').toLowerCase(),
      subscription_plan: String(authUser?.subscription_plan || authUser?.user_metadata?.subscription_plan || '').toLowerCase() || null,
      subscription_status: String(authUser?.subscription_status || authUser?.user_metadata?.subscription_status || '').toLowerCase() || null,
      plan_type: String(authUser?.plan_type || authUser?.user_metadata?.plan_type || 'starter').toLowerCase(),
      billing_status: String(authUser?.billing_status || authUser?.user_metadata?.billing_status || 'none').toLowerCase(),
      company_name: authUser?.company_name || '',
      service_area: authUser?.service_area || '',
      recovered_from_admin_auth_list: true,
      last_auth_sync_at: nowLike,
    },
  };
};

const mergeCustomersWithRecoveredAuthAccounts = (customers, authUsers) => {
  const existingCustomers = Array.isArray(customers) ? customers : [];
  const externalAuthUsers = Array.isArray(authUsers) ? authUsers.filter(isExternalAuthAccount) : [];

  const byAuthUserId = new Map();
  const byEmail = new Map();
  const authUsersById = new Map(externalAuthUsers.map((authUser) => [String(authUser?.id || '').trim(), authUser]));
  const authUsersByEmail = new Map(
    externalAuthUsers
      .map((authUser) => [normalizeEmail(authUser?.email), authUser])
      .filter(([email]) => Boolean(email))
  );

  const enrichedCustomers = existingCustomers.map((customer) => {
    const authUserId = String(customer?.scan_metadata?.auth_user_id || '').trim();
    const email = normalizeEmail(customer?.email || customer?.customer_email);
    const matchingAuthUser = (authUserId && authUsersById.get(authUserId)) || (email && authUsersByEmail.get(email)) || null;
    const enrichedCustomer = enrichCustomerWithAuthAccount(customer, matchingAuthUser);

    if (authUserId) byAuthUserId.set(authUserId, enrichedCustomer);
    if (email) byEmail.set(email, enrichedCustomer);

    return enrichedCustomer;
  });

  const recoveredCustomers = [];

  externalAuthUsers.forEach((authUser) => {
    const authUserId = String(authUser?.id || '').trim();
    const authEmail = normalizeEmail(authUser?.email);
    if (!authUserId) return;
    if (byAuthUserId.has(authUserId)) return;
    if (authEmail && byEmail.has(authEmail)) return;

    recoveredCustomers.push(buildCustomerRowFromAuthUser(authUser));
  });

  return [...recoveredCustomers, ...enrichedCustomers];
};

const buildProvisioningPayload = (payload = {}) => {
  const tenancyMode = String(
    payload?.tenancy_mode ||
    payload?.tenancyMode ||
    payload?.tenant?.tenancy_mode ||
    payload?.tenant?.tenancyMode ||
    'shared'
  ).trim().toLowerCase();
  const tenantProjectRef = String(payload?.tenant_project_ref || '').trim();
  const tenantAppUrl = normalizeUrl(payload?.tenant_app_url || '');
  const tenantApiUrl = normalizeUrl(
    payload?.tenant_api_url || (tenantProjectRef ? `${tenantProjectRef}.supabase.co` : '')
  );
  const tenantAnonKey = String(payload?.tenant_anon_key || '').trim();
  const tenantDatabaseName = String(payload?.tenant_database_name || '').trim();
  const tenantServiceRoleSecretRef = String(payload?.tenant_service_role_secret_ref || '').trim();
  const schemaVersion = String(payload?.schema_version || 'v1').trim() || 'v1';

  return {
    tenancy_mode: tenancyMode,
    tenant_project_ref: tenancyMode === 'dedicated' ? tenantProjectRef : '',
    tenant_app_url: tenantAppUrl,
    tenant_api_url: tenancyMode === 'dedicated' ? tenantApiUrl : '',
    tenant_anon_key: tenancyMode === 'dedicated' ? tenantAnonKey : '',
    tenant_database_name: tenantDatabaseName,
    tenant_service_role_secret_ref: tenantServiceRoleSecretRef,
    schema_version: schemaVersion,
  };
};

const resolveCustomerTenancyMode = (customer, tenant = null) =>
  String(
    tenant?.tenancy_mode ||
    tenant?.tenancyMode ||
    customer?.tenancy_mode ||
    customer?.tenancyMode ||
    customer?.scan_metadata?.tenancy_mode ||
    customer?.scan_metadata?.tenancyMode ||
    'shared'
  ).trim().toLowerCase();

const buildCustomerRowFromBusinessRegistry = (registryEntry) => {
  const businessAccount = registryEntry?.business_account || {};
  const subscription = registryEntry?.subscription || {};
  const tenant = registryEntry?.tenant || {};
  const provisioningJob = registryEntry?.provisioning_job || {};
  const authUserId = String(businessAccount?.auth_user_id || '').trim();
  const email = normalizeEmail(businessAccount?.email);
  const createdAt = businessAccount?.created_at || tenant?.created_at || new Date().toISOString();
  const updatedAt = businessAccount?.updated_at || tenant?.updated_at || createdAt;

  return applyBusinessOwnerProvisioningStateToCustomer({
    id: `biz_registry_${String(businessAccount?.id || authUserId || email || 'unknown').replace(/[^a-zA-Z0-9]/g, '')}`,
    full_name: businessAccount?.full_name || businessAccount?.email || 'Business Owner',
    email: businessAccount?.email || '',
    phone: businessAccount?.phone || null,
    data_source: 'platform_business_registry',
    customer_type: 'app_account',
    initial_scan_complete: false,
    created_at: createdAt,
    updated_at: updatedAt,
    account_type: String(businessAccount?.account_type || 'business_owner').toLowerCase(),
    company_name: businessAccount?.company_name || '',
    verification_status: String(businessAccount?.approval_status || businessAccount?.application_status || 'pending').toLowerCase(),
    subscription_plan: '',
    subscription_status: String(subscription?.subscription_status || '').toLowerCase(),
    plan_type: String(subscription?.plan_type || 'starter').toLowerCase(),
    billing_status: String(subscription?.billing_status || 'none').toLowerCase(),
    trial_started_at: subscription?.trial_started_at || null,
    trial_ends_at: subscription?.trial_ends_at || null,
    subscription_started_at: subscription?.subscription_started_at || null,
    suspended_at: subscription?.suspended_at || null,
    suspension_reason: businessAccount?.rejection_reason || '',
    last_sign_in_at: null,
    scan_metadata: {
      auth_user_id: authUserId || null,
      auth_email: email || businessAccount?.email || null,
      contact_email: email || businessAccount?.email || null,
      account_source: 'platform_business_registry',
      account_type: String(businessAccount?.account_type || 'business_owner').toLowerCase(),
      verification_status: String(businessAccount?.approval_status || businessAccount?.application_status || 'pending').toLowerCase(),
      subscription_status: String(subscription?.subscription_status || '').toLowerCase() || null,
      plan_type: String(subscription?.plan_type || 'starter').toLowerCase(),
      billing_status: String(subscription?.billing_status || 'none').toLowerCase(),
      company_name: businessAccount?.company_name || '',
      platform_business_account_id: businessAccount?.id || null,
      registry_only_row: true,
    },
  }, {
    businessAccount,
    tenant,
    provisioningJob,
  });
};

const enrichCustomerWithBusinessRegistry = (customer, registryEntry) => {
  if (!customer || !registryEntry) return customer;

  const businessAccount = registryEntry?.business_account || {};
  const subscription = registryEntry?.subscription || {};
  const nextCustomer = {
    ...customer,
    email: customer?.email || businessAccount?.email || '',
    full_name: customer?.full_name || businessAccount?.full_name || businessAccount?.email || 'Business Owner',
    phone: customer?.phone || businessAccount?.phone || null,
    company_name: customer?.company_name || businessAccount?.company_name || '',
    account_type: String(businessAccount?.account_type || customer?.account_type || 'business_owner').toLowerCase(),
    verification_status: String(
      businessAccount?.approval_status ||
      businessAccount?.application_status ||
      customer?.verification_status ||
      customer?.scan_metadata?.verification_status ||
      'pending'
    ).toLowerCase(),
    subscription_status: String(subscription?.subscription_status || customer?.subscription_status || customer?.scan_metadata?.subscription_status || '').toLowerCase(),
    plan_type: String(subscription?.plan_type || customer?.plan_type || customer?.scan_metadata?.plan_type || 'starter').toLowerCase(),
    billing_status: String(subscription?.billing_status || customer?.billing_status || customer?.scan_metadata?.billing_status || 'none').toLowerCase(),
    trial_started_at: subscription?.trial_started_at || customer?.trial_started_at || customer?.scan_metadata?.trial_started_at || null,
    trial_ends_at: subscription?.trial_ends_at || customer?.trial_ends_at || customer?.scan_metadata?.trial_ends_at || null,
    subscription_started_at: subscription?.subscription_started_at || customer?.subscription_started_at || customer?.scan_metadata?.subscription_started_at || null,
    suspended_at: subscription?.suspended_at || customer?.suspended_at || customer?.scan_metadata?.suspended_at || null,
    scan_metadata: {
      ...(customer?.scan_metadata || {}),
      auth_user_id: getBusinessOwnerAuthUserId(customer) || String(businessAccount?.auth_user_id || '').trim() || null,
      auth_email: normalizeEmail(customer?.email || customer?.scan_metadata?.auth_email || businessAccount?.email) || businessAccount?.email || null,
      account_type: String(businessAccount?.account_type || customer?.account_type || 'business_owner').toLowerCase(),
      verification_status: String(businessAccount?.approval_status || businessAccount?.application_status || customer?.verification_status || customer?.scan_metadata?.verification_status || 'pending').toLowerCase(),
      subscription_status: String(subscription?.subscription_status || customer?.subscription_status || customer?.scan_metadata?.subscription_status || '').toLowerCase() || null,
      plan_type: String(subscription?.plan_type || customer?.plan_type || customer?.scan_metadata?.plan_type || 'starter').toLowerCase(),
      billing_status: String(subscription?.billing_status || customer?.billing_status || customer?.scan_metadata?.billing_status || 'none').toLowerCase(),
      company_name: customer?.company_name || businessAccount?.company_name || '',
      platform_business_account_id: businessAccount?.id || customer?.scan_metadata?.platform_business_account_id || null,
    },
  };

  return applyBusinessOwnerProvisioningStateToCustomer(nextCustomer, {
    businessAccount,
    tenant: registryEntry?.tenant || null,
    provisioningJob: registryEntry?.provisioning_job || null,
  });
};

const mergeCustomersWithBusinessRegistry = (customers, registryEntries) => {
  const existingCustomers = Array.isArray(customers) ? customers : [];
  const registryItems = Array.isArray(registryEntries) ? registryEntries : [];
  if (!registryItems.length) {
    return existingCustomers;
  }

  const byAuthUserId = new Map();
  const byEmail = new Map();
  const byBusinessAccountId = new Map();

  const enrichedCustomers = existingCustomers.map((customer) => {
    const authUserId = String(customer?.scan_metadata?.auth_user_id || '').trim();
    const email = normalizeEmail(customer?.email || customer?.customer_email || customer?.scan_metadata?.auth_email);
    const businessAccountId = String(customer?.platform_business_account_id || customer?.scan_metadata?.platform_business_account_id || '').trim();

    const matchingRegistry =
      (businessAccountId && registryItems.find((entry) => String(entry?.business_account?.id || '').trim() === businessAccountId)) ||
      (authUserId && registryItems.find((entry) => String(entry?.business_account?.auth_user_id || '').trim() === authUserId)) ||
      (email && registryItems.find((entry) => normalizeEmail(entry?.business_account?.email) === email)) ||
      null;

    const nextCustomer = enrichCustomerWithBusinessRegistry(customer, matchingRegistry);

    if (authUserId) byAuthUserId.set(authUserId, nextCustomer);
    if (email) byEmail.set(email, nextCustomer);
    if (businessAccountId) byBusinessAccountId.set(businessAccountId, nextCustomer);

    return nextCustomer;
  });

  const recoveredBusinessOwners = [];

  registryItems.forEach((entry) => {
    const businessAccountId = String(entry?.business_account?.id || '').trim();
    const authUserId = String(entry?.business_account?.auth_user_id || '').trim();
    const email = normalizeEmail(entry?.business_account?.email);

    if ((businessAccountId && byBusinessAccountId.has(businessAccountId)) || (authUserId && byAuthUserId.has(authUserId)) || (email && byEmail.has(email))) {
      return;
    }

    recoveredBusinessOwners.push(buildCustomerRowFromBusinessRegistry(entry));
  });

  return [...recoveredBusinessOwners, ...enrichedCustomers];
};

const persistRecoveredAuthAccounts = async (recoveredCustomers) => {
  const rowsToPersist = Array.isArray(recoveredCustomers)
    ? recoveredCustomers.filter((customer) => customer?.id && customer?.scan_metadata?.recovered_from_admin_auth_list)
    : [];

  if (!rowsToPersist.length) {
    return;
  }

  const buildFallbackRows = (rows, columnsToDrop = []) =>
    rows.map((customer) => {
      const nextCustomer = { ...customer };

      columnsToDrop.forEach((columnName) => {
        delete nextCustomer[columnName];
      });

      if (columnsToDrop.includes('account_type')) {
        nextCustomer.scan_metadata = {
          ...(nextCustomer.scan_metadata || {}),
          account_type: customer.account_type || nextCustomer?.scan_metadata?.account_type || 'customer',
        };
      }

      if (columnsToDrop.includes('scan_metadata')) {
        delete nextCustomer.scan_metadata;
      }

      return nextCustomer;
    });

  const attemptUpsert = async (rows) =>
    supabase
      .from(`app_${APP_ID}_customers`)
      .upsert(rows, { onConflict: 'id' });

  const fallbackStrategies = [
    [],
    ['account_type'],
    ['account_type', 'scan_metadata'],
    ['scan_metadata'],
  ];

  let lastError = null;

  for (const droppedColumns of fallbackStrategies) {
    const payload = droppedColumns.length ? buildFallbackRows(rowsToPersist, droppedColumns) : rowsToPersist;
    const result = await attemptUpsert(payload);

    if (!result.error) {
      return;
    }

    lastError = result.error;

    const schemaMessage = String(result.error?.message || '').toLowerCase();
    const schemaDetails = String(result.error?.details || '').toLowerCase();
    const schemaCode = String(result.error?.code || '').toUpperCase();
    const isSchemaCompatibilityProblem =
      schemaCode === 'PGRST204' ||
      schemaCode === '42703' ||
      schemaCode === '400' ||
      schemaMessage.includes('schema cache') ||
      schemaMessage.includes('column') ||
      schemaDetails.includes('schema cache');

    if (!isSchemaCompatibilityProblem) {
      throw result.error;
    }
  }

  if (lastError) {
    throw lastError;
  }
};

const isCustomerAppAccount = (customer) => {
  const source = String(customer?.data_source || customer?.scan_metadata?.account_source || '').toLowerCase();
  return Boolean(customer?.scan_metadata?.auth_user_id) || source === 'gmail_signup' || customer?.customer_type === 'app_account';
};

const getExternalAccountType = (customer) => resolveManagedAccountType(customer);

const getExternalAccountTypeMeta = (accountType, isFrench) =>
  getManagedAccountTypeMeta(accountType, (en, fr) => (isFrench ? fr : en));

const getBusinessOwnerAuthUserId = (customer) =>
  String(
    customer?.scan_metadata?.auth_user_id ||
    customer?.auth_user_id ||
    ''
  ).trim();

const getBusinessOwnerVerificationStatus = (customer) =>
  String(
    customer?.verification_status ||
    customer?.scan_metadata?.verification_status ||
    'pending'
  ).trim().toLowerCase();

const getBusinessOwnerSubscriptionPlan = (customer) =>
  String(
    customer?.subscription_plan ||
    customer?.scan_metadata?.subscription_plan ||
    ''
  ).trim().toLowerCase();

const getBusinessOwnerPlanType = (customer) =>
  String(
    customer?.plan_type ||
    customer?.scan_metadata?.plan_type ||
    (getBusinessOwnerSubscriptionPlan(customer) === 'saas_web' ? 'growth' : 'starter')
  ).trim().toLowerCase();

const getBusinessOwnerBillingStatus = (customer) =>
  String(
    customer?.billing_status ||
    customer?.scan_metadata?.billing_status ||
    'none'
  ).trim().toLowerCase();

const getBusinessOwnerSuspendedAt = (customer) =>
  customer?.suspended_at || customer?.scan_metadata?.suspended_at || null;

const getBusinessOwnerSuspensionReason = (customer) =>
  String(
    customer?.suspension_reason ||
    customer?.scan_metadata?.suspension_reason ||
    ''
  ).trim();

const getBusinessOwnerTrialDaysRemaining = (customer) => {
  const trialEndsAt = customer?.trial_ends_at || customer?.scan_metadata?.trial_ends_at || null;
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getBusinessOwnerEffectiveSaaSState = (customer) => {
  const verificationStatus = getBusinessOwnerVerificationStatus(customer);
  const subscriptionStatus = String(customer?.subscription_status || customer?.scan_metadata?.subscription_status || '').toLowerCase();
  const trialDaysRemaining = getBusinessOwnerTrialDaysRemaining(customer);

  if (verificationStatus === 'rejected') return 'rejected';
  if (verificationStatus === 'needs_info') return 'needs_info';
  if (verificationStatus !== 'approved') return 'pending';
  if (subscriptionStatus === 'suspended') return 'suspended';
  if (subscriptionStatus === 'active') return 'active_subscription';
  if (trialDaysRemaining !== null && trialDaysRemaining < 0) return 'expired';
  if (subscriptionStatus === 'trial') return 'on_trial';
  return 'active_subscription';
};

const applyBusinessOwnerProvisioningStateToCustomer = (customer, provisioning = {}) => {
  if (!customer) return customer;

  const tenant = provisioning?.tenant || {};
  const provisioningJob = provisioning?.provisioningJob || provisioning?.job || {};
  const businessAccount = provisioning?.businessAccount || {};
  const tenancyMode = resolveCustomerTenancyMode(customer, tenant);
  const dedicatedInfrastructure = tenancyMode === 'dedicated';

  return {
    ...customer,
    tenancy_mode: tenancyMode,
    tenant_status: tenant?.tenant_status || customer?.tenant_status || null,
    tenant_app_url: tenant?.tenant_app_url || customer?.tenant_app_url || null,
    tenant_api_url: dedicatedInfrastructure ? (tenant?.tenant_api_url || customer?.tenant_api_url || null) : null,
    tenant_project_ref: dedicatedInfrastructure ? (tenant?.tenant_project_ref || customer?.tenant_project_ref || null) : null,
    tenant_database_name: dedicatedInfrastructure ? (tenant?.tenant_database_name || customer?.tenant_database_name || null) : null,
    tenant_schema_version: tenant?.schema_version || customer?.tenant_schema_version || null,
    platform_business_account_id: businessAccount?.id || customer?.platform_business_account_id || null,
    provisioning_job_id: provisioningJob?.id || customer?.provisioning_job_id || null,
    provisioning_job_status: provisioningJob?.job_status || customer?.provisioning_job_status || null,
    provisioning_job_error: provisioningJob?.error_message || customer?.provisioning_job_error || null,
    provisioning_job_type: provisioningJob?.job_type || customer?.provisioning_job_type || null,
    scan_metadata: {
      ...(customer?.scan_metadata || {}),
      tenancy_mode: tenancyMode,
      platform_business_account_id: businessAccount?.id || customer?.scan_metadata?.platform_business_account_id || null,
      tenant_status: tenant?.tenant_status || customer?.scan_metadata?.tenant_status || null,
      tenant_app_url: tenant?.tenant_app_url || customer?.scan_metadata?.tenant_app_url || null,
      tenant_api_url: dedicatedInfrastructure ? (tenant?.tenant_api_url || customer?.scan_metadata?.tenant_api_url || null) : null,
      tenant_project_ref: dedicatedInfrastructure ? (tenant?.tenant_project_ref || customer?.scan_metadata?.tenant_project_ref || null) : null,
      tenant_database_name: dedicatedInfrastructure ? (tenant?.tenant_database_name || customer?.scan_metadata?.tenant_database_name || null) : null,
      tenant_schema_version: tenant?.schema_version || customer?.scan_metadata?.tenant_schema_version || null,
      provisioning_job_id: provisioningJob?.id || customer?.scan_metadata?.provisioning_job_id || null,
      provisioning_job_status: provisioningJob?.job_status || customer?.scan_metadata?.provisioning_job_status || null,
      provisioning_job_error: provisioningJob?.error_message || customer?.scan_metadata?.provisioning_job_error || null,
      provisioning_job_type: provisioningJob?.job_type || customer?.scan_metadata?.provisioning_job_type || null,
    },
  };
};

const getBusinessOwnerStatusMeta = (status, isFrench) => {
  const normalized = String(status || 'pending').toLowerCase();

  if (normalized === 'approved') {
    return {
      label: isFrench ? 'Approuvé' : 'Approved',
      badgeClass: 'bg-emerald-100 text-emerald-800',
    };
  }

  if (normalized === 'rejected') {
    return {
      label: isFrench ? 'Rejeté' : 'Rejected',
      badgeClass: 'bg-rose-100 text-rose-800',
    };
  }

  if (normalized === 'needs_info') {
    return {
      label: isFrench ? 'Infos requises' : 'Needs Info',
      badgeClass: 'bg-sky-100 text-sky-800',
    };
  }

  return {
    label: isFrench ? 'En attente' : 'Pending',
    badgeClass: 'bg-slate-100 text-slate-700',
  };
};

const getBusinessOwnerPlanMeta = (plan, isFrench) => {
  const normalized = String(plan || '').toLowerCase();

  if (normalized === 'saas_web') {
    return {
      label: isFrench ? 'SaaS + Marketplace' : 'SaaS + Marketplace',
      badgeClass: 'bg-violet-100 text-violet-800',
    };
  }

  if (normalized === 'saas') {
    return {
      label: isFrench ? 'SaaS uniquement' : 'SaaS Only',
      badgeClass: 'bg-slate-100 text-slate-800',
    };
  }

  if (normalized === 'free_trial') {
    return {
      label: isFrench ? 'Essai gratuit' : 'Free Trial',
      badgeClass: 'bg-emerald-100 text-emerald-800',
    };
  }

  return {
    label: isFrench ? 'Aucun forfait' : 'No Plan',
    badgeClass: 'bg-slate-100 text-slate-700',
  };
};

const enrichCustomerWithAuthAccount = (customer, authUser) => {
  if (!authUser) {
    return customer;
  }

  const authEmail = normalizeEmail(authUser?.email);
  const accountType = String(authUser?.account_type || authUser?.user_metadata?.account_type || customer?.account_type || 'customer').toLowerCase();
  const verificationStatus = String(authUser?.verification_status || authUser?.user_metadata?.verification_status || customer?.verification_status || 'pending').toLowerCase();
  const subscriptionPlan = String(authUser?.subscription_plan || authUser?.user_metadata?.subscription_plan || customer?.subscription_plan || '').toLowerCase();
  const subscriptionStatus = String(authUser?.subscription_status || authUser?.user_metadata?.subscription_status || customer?.subscription_status || '').toLowerCase();
  const planType = String(authUser?.plan_type || authUser?.user_metadata?.plan_type || customer?.plan_type || (subscriptionPlan === 'saas_web' ? 'growth' : 'starter')).toLowerCase();
  const billingStatus = String(authUser?.billing_status || authUser?.user_metadata?.billing_status || customer?.billing_status || 'none').toLowerCase();
  const companyName = authUser?.company_name || authUser?.user_metadata?.company_name || customer?.company_name || '';

  return {
    ...customer,
    email: customer?.email || authUser?.email || '',
    phone: customer?.phone || authUser?.phone_number || authUser?.user_metadata?.phone || null,
    account_type: accountType,
    company_name: companyName,
    verification_status: verificationStatus,
    approved_at: authUser?.approved_at || authUser?.user_metadata?.approved_at || customer?.approved_at || null,
    approved_by: authUser?.approved_by || authUser?.user_metadata?.approved_by || customer?.approved_by || null,
    rejection_reason: authUser?.rejection_reason || authUser?.user_metadata?.rejection_reason || customer?.rejection_reason || '',
    subscription_plan: subscriptionPlan,
    subscription_status: subscriptionStatus,
    plan_type: planType,
    billing_status: billingStatus,
    trial_started_at: authUser?.trial_started_at || authUser?.user_metadata?.trial_started_at || customer?.trial_started_at || null,
    trial_ends_at: authUser?.trial_ends_at || authUser?.user_metadata?.trial_ends_at || customer?.trial_ends_at || null,
    subscription_started_at: authUser?.subscription_started_at || authUser?.user_metadata?.subscription_started_at || customer?.subscription_started_at || null,
    suspended_at: authUser?.suspended_at || authUser?.user_metadata?.suspended_at || customer?.suspended_at || null,
    suspension_reason: authUser?.suspension_reason || authUser?.user_metadata?.suspension_reason || customer?.suspension_reason || '',
    last_sign_in_at: authUser?.last_sign_in_at || customer?.last_sign_in_at || null,
    scan_metadata: {
      ...(customer?.scan_metadata || {}),
      auth_user_id: getBusinessOwnerAuthUserId(customer) || String(authUser?.id || '').trim() || null,
      auth_email: authEmail || customer?.scan_metadata?.auth_email || null,
      account_type: accountType,
      verification_status: verificationStatus,
      subscription_plan: subscriptionPlan || null,
      subscription_status: subscriptionStatus || null,
      plan_type: planType || 'starter',
      billing_status: billingStatus || 'none',
      company_name: companyName,
    },
  };
};

const applyBusinessOwnerStateToCustomer = (customer, updates = {}) => {
  if (!customer) return customer;

  const nextVerificationStatus = String(
    updates.verification_status ||
    customer.verification_status ||
    customer.scan_metadata?.verification_status ||
    'pending'
  ).toLowerCase();
  const nextSubscriptionPlan = String(
    updates.subscription_plan ||
    customer.subscription_plan ||
    customer.scan_metadata?.subscription_plan ||
    ''
  ).toLowerCase();
  const nextSubscriptionStatus = String(
    updates.subscription_status ||
    customer.subscription_status ||
    customer.scan_metadata?.subscription_status ||
    ''
  ).toLowerCase();
  const nextPlanType = String(
    updates.plan_type ||
    customer.plan_type ||
    customer.scan_metadata?.plan_type ||
    (nextSubscriptionPlan === 'saas_web' ? 'growth' : 'starter')
  ).toLowerCase();
  const nextBillingStatus = String(
    updates.billing_status ||
    customer.billing_status ||
    customer.scan_metadata?.billing_status ||
    'none'
  ).toLowerCase();

  return {
    ...customer,
    ...updates,
    verification_status: nextVerificationStatus,
    subscription_plan: nextSubscriptionPlan,
    subscription_status: nextSubscriptionStatus,
    plan_type: nextPlanType,
    billing_status: nextBillingStatus,
    approved_at: updates.approved_at !== undefined ? updates.approved_at : customer.approved_at,
    approved_by: updates.approved_by !== undefined ? updates.approved_by : customer.approved_by,
    rejection_reason: updates.rejection_reason !== undefined ? updates.rejection_reason : customer.rejection_reason,
    trial_started_at: updates.trial_started_at !== undefined ? updates.trial_started_at : customer.trial_started_at,
    trial_ends_at: updates.trial_ends_at !== undefined ? updates.trial_ends_at : customer.trial_ends_at,
    subscription_started_at: updates.subscription_started_at !== undefined ? updates.subscription_started_at : customer.subscription_started_at,
    suspended_at: updates.suspended_at !== undefined ? updates.suspended_at : customer.suspended_at,
    suspension_reason: updates.suspension_reason !== undefined ? updates.suspension_reason : customer.suspension_reason,
    plan_changed_at: updates.plan_changed_at !== undefined ? updates.plan_changed_at : customer.plan_changed_at,
    scan_metadata: {
      ...(customer.scan_metadata || {}),
      verification_status: nextVerificationStatus,
      subscription_plan: nextSubscriptionPlan || null,
      subscription_status: nextSubscriptionStatus || null,
      plan_type: nextPlanType || 'starter',
      billing_status: nextBillingStatus || 'none',
      approved_at: updates.approved_at !== undefined ? updates.approved_at : customer.scan_metadata?.approved_at || customer.approved_at || null,
      approved_by: updates.approved_by !== undefined ? updates.approved_by : customer.scan_metadata?.approved_by || customer.approved_by || null,
      rejection_reason: updates.rejection_reason !== undefined ? updates.rejection_reason : customer.scan_metadata?.rejection_reason || customer.rejection_reason || '',
      trial_started_at: updates.trial_started_at !== undefined ? updates.trial_started_at : customer.scan_metadata?.trial_started_at || customer.trial_started_at || null,
      trial_ends_at: updates.trial_ends_at !== undefined ? updates.trial_ends_at : customer.scan_metadata?.trial_ends_at || customer.trial_ends_at || null,
      subscription_started_at: updates.subscription_started_at !== undefined ? updates.subscription_started_at : customer.scan_metadata?.subscription_started_at || customer.subscription_started_at || null,
      suspended_at: updates.suspended_at !== undefined ? updates.suspended_at : customer.scan_metadata?.suspended_at || customer.suspended_at || null,
      suspension_reason: updates.suspension_reason !== undefined ? updates.suspension_reason : customer.scan_metadata?.suspension_reason || customer.suspension_reason || '',
      plan_changed_at: updates.plan_changed_at !== undefined ? updates.plan_changed_at : customer.scan_metadata?.plan_changed_at || customer.plan_changed_at || null,
    },
  };
};

const getUnifiedApprovalStatus = (customer) => {
  if (getExternalAccountType(customer) === 'business_owner') {
    return getBusinessOwnerVerificationStatus(customer);
  }

  return null;
};

const getUnifiedAccessStatus = (customer) => {
  return String(customer?.status || 'Inactive').trim().toLowerCase() === 'active' ? 'active' : 'inactive';
};

const getUnifiedStatusMeta = (customer, isFrench) => {
  if (getExternalAccountType(customer) === 'business_owner') {
    const saasState = getBusinessOwnerEffectiveSaaSState(customer);

    if (saasState === 'active_subscription') {
      return {
        label: isFrench ? 'Workspace actif' : 'Workspace active',
        badgeClass: 'bg-emerald-100 text-emerald-800',
      };
    }

    if (saasState === 'on_trial') {
      return {
        label: isFrench ? 'En essai' : 'On trial',
        badgeClass: 'bg-indigo-100 text-indigo-800',
      };
    }

    if (saasState === 'suspended') {
      return {
        label: isFrench ? 'Suspendu' : 'Suspended',
        badgeClass: 'bg-slate-200 text-slate-800',
      };
    }

    if (saasState === 'expired') {
      return {
        label: isFrench ? 'Expiré' : 'Expired',
        badgeClass: 'bg-slate-100 text-slate-700',
      };
    }

    if (saasState === 'rejected') {
      return {
        label: isFrench ? 'Rejeté' : 'Rejected',
        badgeClass: 'bg-rose-100 text-rose-800',
      };
    }

    if (saasState === 'needs_info') {
      return {
        label: isFrench ? 'Infos requises' : 'Needs Info',
        badgeClass: 'bg-sky-100 text-sky-800',
      };
    }

    return {
      label: isFrench ? 'En attente' : 'Pending approval',
      badgeClass: 'bg-slate-100 text-slate-700',
    };
  }

  const accessStatus = getUnifiedAccessStatus(customer);
  if (accessStatus === 'active') {
    return {
      label: isFrench ? 'Actif' : 'Active',
      badgeClass: 'bg-emerald-100 text-emerald-800',
    };
  }

  return {
    label: isFrench ? 'Inactif' : 'Inactive',
    badgeClass: 'bg-slate-100 text-slate-700',
  };
};

const matchesStatusFilter = (customer, statusFilter) => {
  if (statusFilter === 'All') {
    return true;
  }

  const normalizedFilter = String(statusFilter || '').trim().toLowerCase();
  const approvalStatus = getUnifiedApprovalStatus(customer);
  const accessStatus = getUnifiedAccessStatus(customer);
  const saasState = getExternalAccountType(customer) === 'business_owner'
    ? getBusinessOwnerEffectiveSaaSState(customer)
    : null;

  if (['pending', 'approved', 'rejected', 'needs_info'].includes(normalizedFilter)) {
    return approvalStatus === normalizedFilter;
  }

  if (['on_trial', 'active_subscription', 'expired', 'suspended'].includes(normalizedFilter)) {
    return saasState === normalizedFilter;
  }

  if (normalizedFilter === 'active') {
    return accessStatus === 'active';
  }

  if (normalizedFilter === 'inactive') {
    return accessStatus === 'inactive';
  }

  return true;
};

const matchesQuickFilter = (customer, quickFilter) => {
  if (quickFilter === 'all') {
    return true;
  }

  if (quickFilter === 'pending_approvals') {
    const approvalStatus = getUnifiedApprovalStatus(customer);
    return approvalStatus === 'pending' || approvalStatus === 'needs_info';
  }

  if (quickFilter === 'no_listings') {
    return Number(customer?.listingsCount || 0) === 0;
  }

  if (quickFilter === 'no_rentals') {
    return Number(customer?.totalRentals || 0) === 0;
  }

  if (quickFilter === 'inactive_users') {
    return getUnifiedAccessStatus(customer) === 'inactive';
  }

  return true;
};

const STAFF_ROLE_OPTIONS = [
  {
    value: 'employee',
    label: { en: 'Employee', fr: 'Employe' },
    description: {
      en: 'Dashboard, rentals, tours, fuel logs, tasks, and calendar.',
      fr: 'Tableau de bord, locations, tours, carburant, taches et calendrier.',
    },
  },
  {
    value: 'guide',
    label: { en: 'Guide', fr: 'Guide' },
    description: {
      en: 'Tour operations with the same core workspace access.',
      fr: 'Operations tours avec le meme acces principal.',
    },
  },
  {
    value: 'admin',
    label: { en: 'Admin', fr: 'Admin' },
    description: {
      en: 'Full admin workspace access and controls.',
      fr: 'Acces complet a l espace admin et a ses controles.',
    },
  },
];

const getRawCustomerDocumentValue = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return '';

    if (
      (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
      (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmedValue);
        if (typeof parsed === 'string') return parsed.trim();
        if (parsed?.url) return String(parsed.url).trim();
        if (Array.isArray(parsed) && parsed[0]) {
          return getRawCustomerDocumentValue(parsed[0]);
        }
      } catch (error) {
        console.warn('Unable to parse customer document payload:', error);
      }
    }

    return trimmedValue;
  }

  if (typeof value === 'object') {
    return String(value.url || value.path || value.publicUrl || '').trim();
  }

  return '';
};

const CUSTOMER_DOCUMENT_FALLBACK_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#f3f4f6"/>
    <rect x="140" y="120" width="520" height="360" rx="24" fill="#ffffff" stroke="#d1d5db" stroke-width="6"/>
    <text x="400" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#374151">Document Preview</text>
    <text x="400" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#6b7280">Image unavailable</text>
  </svg>
`)}`;

const getCustomerStorageLocation = (value) => {
  const rawValue = getRawCustomerDocumentValue(value);
  if (!rawValue) return null;

  const inferBucketFromPath = (storagePath) => {
    const cleanedPath = storagePath.replace(/^\/+/, '');
    const bucketName = (
      cleanedPath.startsWith('customers_ocr/') ||
      cleanedPath.startsWith('second_drivers_ocr/')
    )
      ? 'rental-documents'
      : 'id_scans';

    return { bucketName, storagePath: cleanedPath };
  };

  if (
    !rawValue.startsWith('http://') &&
    !rawValue.startsWith('https://') &&
    !rawValue.startsWith('blob:') &&
    !rawValue.startsWith('data:')
  ) {
    return inferBucketFromPath(rawValue);
  }

  try {
    const parsedUrl = new URL(rawValue);
    const match = parsedUrl.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (!match) return null;

    return {
      bucketName: match[1],
      storagePath: decodeURIComponent(match[2])
    };
  } catch (error) {
    return null;
  }
};

const normalizeCustomerDocumentUrl = (value) => {
  const rawValue = getRawCustomerDocumentValue(value);
  if (!rawValue) return '';

  if (
    rawValue.startsWith('http://') ||
    rawValue.startsWith('https://') ||
    rawValue.startsWith('blob:') ||
    rawValue.startsWith('data:') ||
    rawValue.startsWith('/')
  ) {
    return rawValue;
  }

  const location = getCustomerStorageLocation(rawValue);
  if (!location) return rawValue;

  const { data } = supabase.storage.from(location.bucketName).getPublicUrl(location.storagePath);
  return data?.publicUrl || rawValue;
};

const getSignedCustomerDocumentUrl = async (value) => {
  const rawValue = getRawCustomerDocumentValue(value);
  if (!rawValue) return '';

  if (
    rawValue.startsWith('blob:') ||
    rawValue.startsWith('data:') ||
    rawValue.startsWith('/')
  ) {
    return rawValue;
  }

  const location = getCustomerStorageLocation(value);
  if (!location) {
    if (
      rawValue.startsWith('http://') ||
      rawValue.startsWith('https://')
    ) {
      return rawValue;
    }
    return normalizeCustomerDocumentUrl(value);
  }

  if (
    location.bucketName === 'rental-documents' &&
    (
      location.storagePath.startsWith('customers_ocr/') ||
      location.storagePath.startsWith('second_drivers_ocr/')
    )
  ) {
    return normalizeCustomerDocumentUrl(value);
  }

  try {
    const { data, error } = await supabase.storage
      .from(location.bucketName)
      .createSignedUrl(location.storagePath, 3600);

    if (error || !data?.signedUrl) {
      return normalizeCustomerDocumentUrl(value);
    }

    return data.signedUrl;
  } catch (error) {
    console.warn('Unable to create signed customer document URL:', error);
    return normalizeCustomerDocumentUrl(value);
  }
};

const collectCustomerStorageLocations = (...values) => {
  const uniqueLocations = new Map();

  values.flat().forEach((value) => {
    const location = getCustomerStorageLocation(value);
    if (location?.bucketName && location?.storagePath) {
      uniqueLocations.set(
        `${location.bucketName}:${location.storagePath}`,
        location
      );
    }
  });

  return Array.from(uniqueLocations.values());
};

const getCustomerDocumentKind = (value) => {
  const normalizedUrl = normalizeCustomerDocumentUrl(value);
  const lowerUrl = normalizedUrl.toLowerCase();

  if (lowerUrl.startsWith('data:application/pdf') || lowerUrl.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'image';
};

const CustomerPhoneInput = ({
  value,
  onChange,
  error,
  disabled = false,
  label = 'Phone',
  required = false
}) => {
  const countryCodes = [
    { code: '+212', flag: '🇲🇦', name: 'Morocco', pattern: /^\+212\s?\d{9}$/, example: '+212 6XX XXX XXX', digits: 9 },
    { code: '+33', flag: '🇫🇷', name: 'France', pattern: /^\+33\s?\d{9}$/, example: '+33 1 XX XX XX XX', digits: 9 },
    { code: '+34', flag: '🇪🇸', name: 'Spain', pattern: /^\+34\s?\d{9}$/, example: '+34 6XX XXX XXX', digits: 9 },
    { code: '+32', flag: '🇧🇪', name: 'Belgium', pattern: /^\+32\s?\d{8,9}$/, example: '+32 4XX XX XX XX', digits: 9 },
    { code: '+31', flag: '🇳🇱', name: 'Netherlands', pattern: /^\+31\s?\d{9}$/, example: '+31 6 XXXX XXXX', digits: 9 },
    { code: '+351', flag: '🇵🇹', name: 'Portugal', pattern: /^\+351\s?\d{9}$/, example: '+351 9XX XXX XXX', digits: 9 },
    { code: '+41', flag: '🇨🇭', name: 'Switzerland', pattern: /^\+41\s?\d{9}$/, example: '+41 7X XXX XX XX', digits: 9 },
    { code: '+353', flag: '🇮🇪', name: 'Ireland', pattern: /^\+353\s?\d{9}$/, example: '+353 8X XXX XXXX', digits: 9 },
    { code: '+44', flag: '🇬🇧', name: 'United Kingdom', pattern: /^\+44\s?\d{10}$/, example: '+44 7XXX XXX XXX', digits: 10 },
    { code: '+49', flag: '🇩🇪', name: 'Germany', pattern: /^\+49\s?\d{10,11}$/, example: '+49 1XX XXX XXXX', digits: 10 },
    { code: '+39', flag: '🇮🇹', name: 'Italy', pattern: /^\+39\s?\d{9,10}$/, example: '+39 3XX XXX XXXX', digits: 9 },
    { code: '+1', flag: '🇺🇸', name: 'United States / Canada', pattern: /^\+1\s?\d{10}$/, example: '+1 XXX XXX XXXX', digits: 10 },
    { code: '+90', flag: '🇹🇷', name: 'Turkey', pattern: /^\+90\s?\d{10}$/, example: '+90 5XX XXX XXXX', digits: 10 },
    { code: '+971', flag: '🇦🇪', name: 'United Arab Emirates', pattern: /^\+971\s?\d{9}$/, example: '+971 5X XXX XXXX', digits: 9 },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', pattern: /^\+966\s?\d{9}$/, example: '+966 5X XXX XXXX', digits: 9 },
    { code: '+974', flag: '🇶🇦', name: 'Qatar', pattern: /^\+974\s?\d{8}$/, example: '+974 XXXX XXXX', digits: 8 },
    { code: '+965', flag: '🇰🇼', name: 'Kuwait', pattern: /^\+965\s?\d{8}$/, example: '+965 XXXX XXXX', digits: 8 },
    { code: '+973', flag: '🇧🇭', name: 'Bahrain', pattern: /^\+973\s?\d{8}$/, example: '+973 XXXX XXXX', digits: 8 },
    { code: '+968', flag: '🇴🇲', name: 'Oman', pattern: /^\+968\s?\d{8}$/, example: '+968 XXXX XXXX', digits: 8 },
    { code: '+213', flag: '🇩🇿', name: 'Algeria', pattern: /^\+213\s?\d{9}$/, example: '+213 5XX XX XX XX', digits: 9 },
    { code: '+216', flag: '🇹🇳', name: 'Tunisia', pattern: /^\+216\s?\d{8}$/, example: '+216 XX XXX XXX', digits: 8 },
    { code: '+20', flag: '🇪🇬', name: 'Egypt', pattern: /^\+20\s?\d{10}$/, example: '+20 1XX XXX XXXX', digits: 10 },
    { code: '+221', flag: '🇸🇳', name: 'Senegal', pattern: /^\+221\s?\d{9}$/, example: '+221 7X XXX XX XX', digits: 9 },
    { code: '+234', flag: '🇳🇬', name: 'Nigeria', pattern: /^\+234\s?\d{10}$/, example: '+234 8XX XXX XXXX', digits: 10 },
    { code: '+91', flag: '🇮🇳', name: 'India', pattern: /^\+91\s?\d{10}$/, example: '+91 XXXXX XXXXX', digits: 10 },
    { code: '+92', flag: '🇵🇰', name: 'Pakistan', pattern: /^\+92\s?\d{10}$/, example: '+92 3XX XXX XXXX', digits: 10 },
    { code: '+86', flag: '🇨🇳', name: 'China', pattern: /^\+86\s?\d{11}$/, example: '+86 1XX XXXX XXXX', digits: 11 },
  ];

  const [countryCode, setCountryCode] = useState('+212');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [validationError, setValidationError] = useState('');
  const [whatsAppLink, setWhatsAppLink] = useState('');
  const [isWhatsAppAvailable, setIsWhatsAppAvailable] = useState(false);
  const dropdownRef = useRef(null);

  const getCountryConfig = useCallback((code) => {
    return countryCodes.find((country) => country.code === code) || countryCodes[0];
  }, []);

  const validatePhoneNumber = useCallback((fullNumber, countryConfig) => {
    if (!fullNumber) {
      setValidationError('');
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const digitsOnly = fullNumber.replace(/\D/g, '');
    const expectedDigits = countryConfig.digits;

    if (!fullNumber.startsWith('+')) {
      setValidationError(`Le numéro de téléphone doit commencer par l'indicatif du pays (ex. ${countryConfig.code})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!fullNumber.startsWith(countryConfig.code)) {
      setValidationError(`Le numéro doit commencer par ${countryConfig.code} pour ${countryConfig.name}`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const numberWithoutCountryCode = digitsOnly.replace(countryConfig.code.replace('+', ''), '');

    if (numberWithoutCountryCode.length < expectedDigits) {
      setValidationError(`Les numéros ${countryConfig.name} doivent contenir ${expectedDigits} chiffres (actuellement ${numberWithoutCountryCode.length})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (numberWithoutCountryCode.length > expectedDigits) {
      setValidationError(`Les numéros ${countryConfig.name} doivent contenir exactement ${expectedDigits} chiffres (actuellement ${numberWithoutCountryCode.length})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!countryConfig.pattern.test(fullNumber.replace(/\s/g, ''))) {
      setValidationError(`Format de numéro ${countryConfig.name} invalide. Exemple : ${countryConfig.example}`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const cleanNumber = fullNumber.replace(/\s/g, '').replace('+', '');
    setWhatsAppLink(`https://wa.me/${cleanNumber}`);
    setIsWhatsAppAvailable(true);
    setValidationError('');
    return true;
  }, []);

  useEffect(() => {
    if (!value) {
      setPhoneNumber('');
      setCountryCode('+212');
      setValidationError('');
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return;
    }

    const matchedCode = countryCodes.find((country) => String(value).startsWith(country.code));
    if (matchedCode) {
      setCountryCode(matchedCode.code);
      const numberPart = String(value).replace(matchedCode.code, '').trim();
      setPhoneNumber(numberPart);
      validatePhoneNumber(String(value), matchedCode);
      return;
    }

    if (String(value).startsWith('+')) {
      const plusIndex = String(value).indexOf('+');
      const spaceIndex = String(value).indexOf(' ', plusIndex);
      if (spaceIndex > -1) {
        const possibleCode = String(value).substring(plusIndex, spaceIndex);
        const countryConfig = getCountryConfig(possibleCode);
        setCountryCode(possibleCode);
        setPhoneNumber(String(value).substring(spaceIndex).trim());
        validatePhoneNumber(String(value), countryConfig);
        return;
      }
    }

    setPhoneNumber(String(value));
    validatePhoneNumber(String(value), getCountryConfig(countryCode));
  }, [countryCode, getCountryConfig, validatePhoneNumber, value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePhoneChange = (event) => {
    const input = event.target.value;

    if (input.startsWith('0') && countryCode === '+212') {
      const moroccanNumber = input.substring(1);
      const formatted = `+212 ${moroccanNumber}`;
      setPhoneNumber(moroccanNumber);
      onChange(formatted);
      return;
    }

    if (input.startsWith('+')) {
      setPhoneNumber(input);
      onChange(input);
      return;
    }

    const digits = input.replace(/\D/g, '');
    const formatted = digits.length > 0 ? `${countryCode} ${digits}` : '';
    setPhoneNumber(digits);
    onChange(formatted);
  };

  const handleCountryCodeChange = (newCode) => {
    setCountryCode(newCode);

    if (phoneNumber) {
      onChange(`${newCode} ${phoneNumber.replace(/^\+\d+\s*/, '')}`);
    }

    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  const filteredCountries = countryCodes.filter((country) =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.code.includes(searchTerm)
  );

  const selectedCountry = getCountryConfig(countryCode);
  const displayError = validationError || error;

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        {label}{required ? ' *' : ''}
      </label>
      <div className="relative flex items-stretch rounded-lg border border-slate-200 bg-white">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
            disabled={disabled}
            className={`flex h-full min-h-[48px] items-center gap-3 border-r border-slate-200 bg-slate-50 px-4 text-slate-900 transition-colors hover:bg-slate-100 ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className="text-lg">{selectedCountry.flag}</span>
            <span className="text-base font-semibold">{selectedCountry.code}</span>
            <ChevronDown className={`h-4 w-4 text-slate-700 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && !disabled && (
            <div className="absolute left-0 top-full z-20 mt-2 max-h-80 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 p-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search country..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-64">
                {filteredCountries.length > 0 ? (
                  filteredCountries.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => handleCountryCodeChange(country.code)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-violet-50 last:border-b-0"
                    >
                      <span className="text-xl">{country.flag}</span>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-slate-900">{country.name}</div>
                        <div className="text-sm text-slate-500">{country.code} ({country.digits} digits)</div>
                      </div>
                      {countryCode === country.code && (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm font-medium text-slate-500">
                    No countries found. Try typing the country name or code.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder={selectedCountry.code === '+212' ? '6XX XXX XXX' : 'Phone number'}
            disabled={disabled}
            className={`min-h-[48px] w-full px-4 py-3 pl-11 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              displayError ? 'text-red-600 placeholder:text-red-300' : 'placeholder:text-slate-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>

      <div className="mt-2 space-y-1">
        {displayError && (
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="text-xs font-medium text-red-500">{displayError}</p>
          </div>
        )}

        {isWhatsAppAvailable && !displayError && value && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <p className="text-xs text-green-600">
              Valid {selectedCountry.name} number
              {whatsAppLink ? (
                <>
                  {' • '}
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    WhatsApp available
                  </a>
                </>
              ) : null}
            </p>
          </div>
        )}

        {!displayError && (
          <p className="text-xs font-medium text-slate-500">
            {selectedCountry.code === '+212'
              ? 'Moroccan format: +212 6XX XXX XXX (9 digits)'
              : `Format: ${selectedCountry.example} (${selectedCountry.digits} digits)`}
          </p>
        )}
      </div>
    </div>
  );
};

// ================ FIXED IMAGE GALLERY WITH WORKING ENLARGE ================
const ImageGallery = ({ images, title, emptyMessage = "No images", gridLayout = true }) => {
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [resolvedImageUrls, setResolvedImageUrls] = React.useState({});
  const [failedImageKeys, setFailedImageKeys] = React.useState({});
  const sourceImages = Array.isArray(images) ? images : [];

  const validImages = React.useMemo(() => (
    sourceImages
      .map(img => {
        const originalUrl = typeof img === 'string' ? img : img?.url;
        const normalizedUrl = normalizeCustomerDocumentUrl(originalUrl);
        const storageLocation = getCustomerStorageLocation(originalUrl);
        const documentKind = typeof img === 'string'
          ? getCustomerDocumentKind(originalUrl)
          : (img?.documentKind || getCustomerDocumentKind(originalUrl));
        const cacheKey = `${typeof img === 'string' ? title : (img?.label || title)}::${originalUrl || normalizedUrl}`;

        return {
          ...(typeof img === 'string' ? { url: normalizedUrl } : img),
          originalUrl,
          url: normalizedUrl,
          documentKind,
          cacheKey,
          requiresSignedUrl: Boolean(storageLocation),
          bucketName: storageLocation?.bucketName || null,
        };
      })
      .filter(img => {
        const url = img?.url;
        return url && (
          url.startsWith('http') ||
          url.startsWith('/') ||
          url.startsWith('blob:') ||
          url.startsWith('data:')
        );
      })
  ), [sourceImages, title]);

  const validImagesSignature = React.useMemo(
    () => validImages.map((img) => `${img.cacheKey}:${img.originalUrl || img.url}`).join('|'),
    [validImages]
  );

  React.useEffect(() => {
    let isActive = true;

    const resolveStorageUrls = async () => {
      const nextResolvedEntries = await Promise.all(
        validImages.map(async (img) => {
          if (!getCustomerStorageLocation(img.originalUrl || img.url)) {
            return [img.cacheKey, img.url];
          }

          const resolvedUrl = await getSignedCustomerDocumentUrl(img.originalUrl || img.url);
          return [img.cacheKey, resolvedUrl || img.url];
        })
      );

      if (!isActive) return;

      setResolvedImageUrls(prev => {
        const nextMap = { ...prev };
        nextResolvedEntries.forEach(([cacheKey, resolvedUrl]) => {
          nextMap[cacheKey] = resolvedUrl;
        });
        return nextMap;
      });

      setFailedImageKeys(prev => {
        const nextMap = { ...prev };
        nextResolvedEntries.forEach(([cacheKey, resolvedUrl]) => {
          if (resolvedUrl) {
            delete nextMap[cacheKey];
          }
        });
        return nextMap;
      });
    };

    resolveStorageUrls();

    return () => {
      isActive = false;
    };
  }, [validImages, validImagesSignature]);

  if (sourceImages.length === 0) {
    return (
      <div className="text-center py-8">
        {React.isValidElement(emptyMessage) ? (
          emptyMessage
        ) : (
          <>
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500">{emptyMessage}</p>
          </>
        )}
      </div>
    );
  }

  const handleImageClick = (imageUrl, imageLabel, documentKind = 'image') => {
    if (documentKind === 'pdf') {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setSelectedImage({ url: imageUrl, label: imageLabel, documentKind });
  };

  if (validImages.length === 0) {
    return <p className="text-gray-500 italic py-4">{tr('No valid images', 'Aucune image valide')}</p>;
  }

  // Close modal
  const closeModal = () => {
    setSelectedImage(null);
  };
  
  return (
    <>
      <div className={gridLayout ? "grid grid-cols-2 md:grid-cols-4 gap-4" : "space-y-6"}>
        {validImages.map((img, index) => {
          const imageUrl = resolvedImageUrls[img.cacheKey] || (img.requiresSignedUrl ? '' : img.url);
          const imageLabel = typeof img === 'string' ? `${title} ${index + 1}` : img.label || `${title} ${index + 1}`;
          const isFallback = img.isFallback;
          const isPdf = img.documentKind === 'pdf';
          const hasFailed = Boolean(failedImageKeys[img.cacheKey]);
          const isResolving = img.requiresSignedUrl && !resolvedImageUrls[img.cacheKey];
          
          return (
            <div key={index} className="relative group">
              <div
                className={`${gridLayout ? 'aspect-square' : 'aspect-video'} bg-gray-50 border ${isFallback ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'} rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${isResolving ? 'cursor-wait' : 'cursor-pointer'}`}
                onClick={() => {
                  if (isResolving) return;
                  handleImageClick(imageUrl, imageLabel, img.documentKind);
                }}
              >
                {isPdf ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-red-50">
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-sm font-semibold text-gray-800">{tr('PDF Document', 'Document PDF')}</div>
                    <div className="text-xs text-gray-500 mt-1">{tr('Tap to open', 'Touchez pour ouvrir')}</div>
                  </div>
                ) : isResolving ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-gray-100">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 mb-3"></div>
                    <div className="text-sm font-semibold text-gray-800">{tr('Loading document', 'Chargement du document')}</div>
                    <div className="text-xs text-gray-500 mt-1">{tr('Preparing secure preview', "Préparation de l'aperçu sécurisé")}</div>
                  </div>
                ) : hasFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-gray-100">
                    <div className="text-4xl mb-3">🪪</div>
                    <div className="text-sm font-semibold text-gray-800">{tr('Document unavailable', 'Document indisponible')}</div>
                    <div className="text-xs text-gray-500 mt-1">{tr('Preview unavailable', 'Aperçu indisponible')}</div>
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt={imageLabel}
                    className="w-full h-full object-contain p-1 hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                    onError={(e) => {
                      console.error('Image failed to load:', imageUrl);
                      e.target.onerror = null;
                      setFailedImageKeys(prev => ({ ...prev, [img.cacheKey]: true }));
                      e.target.src = CUSTOMER_DOCUMENT_FALLBACK_SVG;
                    }}
                  />
                )}
                {!gridLayout && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                )}
                
                {/* Enlarge icon overlay */}
                <div className="absolute top-2 right-2 bg-white/80 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
              <div className={`mt-2 ${gridLayout ? 'text-center' : ''}`}>
                <div className={`text-xs ${isFallback ? 'text-yellow-600' : 'text-gray-600'} font-medium`}>
                  📄 {imageLabel}
                </div>
                {!gridLayout && (
                  <div className="text-xs text-gray-400 mt-1">
                    {isFallback
                      ? tr('Sample document', 'Document exemple')
                      : isResolving
                        ? tr('Loading secure preview', "Chargement de l'aperçu sécurisé")
                        : isPdf
                          ? tr('Tap to open', 'Touchez pour ouvrir')
                          : tr('Click to enlarge', 'Cliquer pour agrandir')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* ENLARGE MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black bg-opacity-90 transition-opacity"
            onClick={closeModal}
          ></div>
          
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="inline-block align-bottom bg-transparent rounded-lg text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="relative">
                <div className="bg-transparent">
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      className="text-white hover:text-gray-300 focus:outline-none"
                      onClick={closeModal}
                    >
                      <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                <div className="bg-white rounded-lg p-1 overflow-hidden">
                  {selectedImage.documentKind === 'pdf' ? (
                    <iframe
                      src={selectedImage.url}
                      title={selectedImage.label}
                      className="w-full h-[80vh] rounded"
                    />
                  ) : (
                    <img 
                      src={selectedImage.url} 
                      alt={selectedImage.label}
                      className="max-w-full max-h-[80vh] object-contain mx-auto rounded"
                      onError={(e) => {
                        console.error('Modal image failed to load:', selectedImage.url);
                        e.target.onerror = null;
                        e.target.src = CUSTOMER_DOCUMENT_FALLBACK_SVG;
                      }}
                    />
                  )}
                </div>
                  
                  <div className="mt-4 text-center">
                    <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
                      {selectedImage.label}
                    </p>
                    <div className="mt-2 flex justify-center space-x-4">
                      <button
                        onClick={() => window.open(selectedImage.url, '_blank')}
                        className="text-white hover:text-blue-300 text-sm flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {isFrenchLocale() ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab'}
                      </button>
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = selectedImage.url;
                          link.download = selectedImage.label.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="text-white hover:text-blue-300 text-sm flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {tr('Download', 'Télécharger')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const MemoizedImageGallery = React.memo(ImageGallery);

// Mobile Customer Card Component
const MobileCustomerCard = ({ customer, onView, onDelete, isSelected, onSelect, canSelect, canDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const avatarPalette = getCustomerAvatarPalette(customer);
  const isFrench = isFrenchLocale();
  const accountTypeMeta = getExternalAccountTypeMeta(customer.externalAccountType, isFrench);
  
  return (
    <article
      className="cursor-pointer rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition hover:border-slate-300 hover:bg-slate-50/50"
      onClick={() => onView(customer)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {canSelect && (
            <div className="pt-1">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(customer.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
            </div>
          )}
          <div className="flex-shrink-0">
            <div className={`h-12 w-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-sm ${avatarPalette}`}>
              {getInitial(customer.full_name)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {customer.full_name || (isFrench ? 'Client inconnu' : 'Unknown Customer')}
                </h3>
                {customer.isBanned && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">
                      {isFrench ? 'Banni' : 'Banned'}
                    </span>
                    {customer.banNote && (
                      <span className="truncate text-xs text-rose-700">
                        {customer.banNote}
                      </span>
                    )}
                  </div>
                )}
                {customer.isAppAccount && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                      {isFrench ? 'Compte app' : 'App account'}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${accountTypeMeta.badgeClass}`}>
                    {accountTypeMeta.label}
                  </span>
                </div>
                {!customer.isBanned && customer.hasActiveAlertNote && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                      {isFrench ? 'Alerte' : 'Warning'}
                    </span>
                    {customer.activeAlertNote && (
                      <span className="truncate text-xs text-rose-700">
                        {customer.activeAlertNote}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className={`ml-2 flex-shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                customer.status === 'Active' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {customer.status === 'Active'
                  ? (isFrench ? 'Actif' : 'Active')
                  : customer.status === 'Inactive'
                    ? (isFrench ? 'Inactif' : 'Inactive')
                    : customer.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center">
                <Mail className="w-3 h-3 mr-1" />
                {customer.email || (isFrench ? 'Pas d’email' : 'No email')}
              </span>
              <span className="inline-flex items-center">
                <Phone className="w-3 h-3 mr-1" />
                {customer.phone || (isFrench ? 'Pas de téléphone' : 'No phone')}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center text-slate-500">
                <CreditCard className="w-3 h-3 mr-1" />
                {formatCurrency(customer.totalSpent)}
              </span>
              <span className="inline-flex items-center text-slate-500">
                <Calendar className="w-3 h-3 mr-1" />
                {formatDate(customer.created_at)}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="ml-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 transition hover:bg-slate-100"
        >
          {expanded ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
        </button>
      </div>
      
      {expanded && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{isFrench ? 'Nationalité' : 'Nationality'}</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">{customer.nationality || (isFrench ? 'N/D' : 'N/A')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{isFrench ? 'Total locations' : 'Total Rentals'}</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">{customer.totalRentals || 0}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">ID client</span>
              <p className="mt-1 truncate font-mono text-xs text-slate-600">{customer.id}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-end space-x-2">
            {canDelete && customer.totalRentals === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(customer);
                }}
                className="flex items-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                <Trash className="w-4 h-4 mr-1" />
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
};

const BusinessOwnerCard = ({
  customer,
  onApprove,
  onReject,
  onRequestInfo,
  busyAction,
}) => {
  const isFrench = isFrenchLocale();
  const authUserId = getBusinessOwnerAuthUserId(customer);
  const status = getBusinessOwnerVerificationStatus(customer);
  const statusMeta = getBusinessOwnerStatusMeta(status, isFrench);
  const planMeta = getBusinessOwnerPlanMeta(getBusinessOwnerSubscriptionPlan(customer), isFrench);
  const initials = getInitial(customer.full_name);
  const companyName = String(customer.company_name || customer.scan_metadata?.company_name || '').trim();
  const canApprove = ['pending', 'needs_info'].includes(status);
  const canRequestInfo = status !== 'approved';
  const canReject = status !== 'rejected';
  const missingAuthAccount = !authUserId;

  return (
    <article className={ADMIN_MAIN_CARD_CLASS}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm ${getCustomerAvatarPalette(customer)}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{customer.full_name || (isFrench ? 'Compte business' : 'Business account')}</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${planMeta.badgeClass}`}>
              {planMeta.label}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-600">{customer.email || (isFrench ? 'Email non disponible' : 'Email unavailable')}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{isFrench ? 'Entreprise' : 'Company'}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{companyName || (isFrench ? 'Non renseigné' : 'Not provided')}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{isFrench ? 'Créé le' : 'Created at'}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(customer.created_at)}</p>
            </div>
          </div>
          {status === 'rejected' && customer.rejection_reason ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">{isFrench ? 'Raison du rejet' : 'Rejection reason'}</p>
              <p className="mt-1 text-sm font-medium text-rose-900">{customer.rejection_reason}</p>
            </div>
          ) : null}
          {missingAuthAccount ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-700">
              {isFrench ? "Ce compte n'est pas encore lié à un utilisateur auth récupérable." : 'This account is not linked to a recoverable auth user yet.'}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {canApprove ? (
          <button
            type="button"
            onClick={() => onApprove(customer)}
            disabled={Boolean(busyAction) || missingAuthAccount}
            className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === `approve:${customer.id}` ? (isFrench ? 'Approbation...' : 'Approving...') : (isFrench ? 'Approuver' : 'Approve')}
          </button>
        ) : null}
        {canRequestInfo ? (
          <button
            type="button"
            onClick={() => onRequestInfo(customer)}
            disabled={Boolean(busyAction) || missingAuthAccount}
            className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === `info:${customer.id}` ? (isFrench ? 'Mise à jour...' : 'Updating...') : (isFrench ? 'Demander des infos' : 'Request Info')}
          </button>
        ) : null}
        {canReject ? (
          <button
            type="button"
            onClick={() => onReject(customer)}
            disabled={Boolean(busyAction) || missingAuthAccount}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFrench ? 'Rejeter' : 'Reject'}
          </button>
        ) : null}
      </div>
    </article>
  );
};

const CustomerRowActionMenu = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!actions?.length) {
    return null;
  }

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={tr('More actions', 'Plus d’actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]"
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm font-medium transition ${
                action.tone === 'danger'
                  ? 'text-rose-700 hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-50'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// Helper functions moved outside component for reuse
const getInitial = (name) => {
  return name ? name.charAt(0).toUpperCase() : '?';
};

const CUSTOMER_AVATAR_PALETTES = [
  'bg-gradient-to-br from-violet-400 to-violet-500',
  'bg-gradient-to-br from-fuchsia-400 to-pink-500',
  'bg-gradient-to-br from-sky-400 to-blue-500',
  'bg-gradient-to-br from-emerald-400 to-teal-500',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-rose-400 to-red-500',
  'bg-gradient-to-br from-cyan-400 to-indigo-500',
  'bg-gradient-to-br from-lime-400 to-green-500',
];

const getCustomerAvatarPalette = (customer) => {
  const identitySeed = String(customer?.id || customer?.full_name || customer?.email || 'customer');
  const hash = identitySeed.split('').reduce((total, character) => total + character.charCodeAt(0), 0);
  return CUSTOMER_AVATAR_PALETTES[hash % CUSTOMER_AVATAR_PALETTES.length];
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0).replace('MAD', 'MAD');
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatFullDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const CustomerManagementDashboard = () => {
  const isFrench = isFrenchLocale();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canAccessBusinessOwnerRegistry = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    return Boolean(user?.id) && (role === 'owner' || isPlatformOwnerEmail(user?.email) || hasPermission('User & Role Management'));
  }, [hasPermission, user?.email, user?.id, user?.role]);
  const canCurrentUserEditCustomerProfile = canEditCustomerProfile(user);
  const canCurrentUserManageBan = String(user?.role || '').toLowerCase() === 'owner' || hasPermission('Customer Management');
  const [customers, setCustomers] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [marketplaceVehicleProfiles, setMarketplaceVehicleProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [nationalityFilter, setNationalityFilter] = useState('All');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState('all');
  
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  const [fullPageViewOpen, setFullPageViewOpen] = useState(false);
  const [detailedCustomer, setDetailedCustomer] = useState(null);
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showCustomersWithoutRentalsReview, setShowCustomersWithoutRentalsReview] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [bulkDeleteConfirmationText, setBulkDeleteConfirmationText] = useState('');
  const [promotingCustomerToStaff, setPromotingCustomerToStaff] = useState(false);
  const [staffRoleModalOpen, setStaffRoleModalOpen] = useState(false);
  const [pendingStaffRole, setPendingStaffRole] = useState('employee');
  const [staffPromotionSuccessOpen, setStaffPromotionSuccessOpen] = useState(false);
  const [businessOwnerActionLoading, setBusinessOwnerActionLoading] = useState('');
  const [tenantProvisioningJobs, setTenantProvisioningJobs] = useState([]);
  const [businessOwnerRejectModalOpen, setBusinessOwnerRejectModalOpen] = useState(false);
  const [pendingBusinessOwner, setPendingBusinessOwner] = useState(null);
  const [businessOwnerRejectReason, setBusinessOwnerRejectReason] = useState('');
  const [bulkRejectModalOpen, setBulkRejectModalOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [customerProfileNote, setCustomerProfileNote] = useState('');
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);
  const [customerNoteHistory, setCustomerNoteHistory] = useState([]);
  const [customerBanNote, setCustomerBanNote] = useState('');
  const [savingCustomerBan, setSavingCustomerBan] = useState(false);
  const [uploadingCustomerScan, setUploadingCustomerScan] = useState(false);
  
  // Mobile-specific state
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const customerScanInputRef = useRef(null);
  const customerNoteTextareaRef = useRef(null);
  const customerBanTextareaRef = useRef(null);
  const customerAlertCheckboxRef = useRef(null);
  const selectedCustomerId = selectedCustomer?.id || null;
  const openRentalFromHistory = useCallback((rentalId) => {
    if (!rentalId) return;
    navigate(`/admin/rentals/${rentalId}`);
  }, [navigate]);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Helper function to check if a value is empty
  const isEmpty = (value) => {
    return value === null || value === undefined || value === '' || value === 'N/A';
  };

  // Helper function to display field only if it has value
  const renderField = (label, value, formatFn = null) => {
    if (isEmpty(value)) return null;
    
    let displayValue = value;
    if (formatFn) {
      displayValue = formatFn(value);
    }
    
    return (
      <div className="col-span-1">
        <span className="font-medium text-gray-600">{label}:</span>
        <p className="text-gray-900 break-words mt-1">{displayValue}</p>
      </div>
    );
  };

  // ENHANCED: Get all customer images from various sources
  const getAllCustomerImages = (customer, customerRentals = []) => {
    const images = [];
    const existingUrls = new Set();
    const pushImage = (imageData) => {
      const normalizedUrl = normalizeCustomerDocumentUrl(imageData?.url);
      if (!normalizedUrl || existingUrls.has(normalizedUrl)) return;

      existingUrls.add(normalizedUrl);
      images.push({
        ...imageData,
        url: normalizedUrl,
        documentKind: imageData.documentKind || getCustomerDocumentKind(normalizedUrl)
      });
    };
    
    // 1. Main ID scan from database
    if (customer?.id_scan_url && getRawCustomerDocumentValue(customer.id_scan_url) !== '') {
      pushImage({
        url: customer.id_scan_url,
        type: 'ID Document Scan',
        source: 'id_scan_url',
        label: 'ID Document Scan',
        isCustomerImage: true,
        isFallback: false,
        uploadedAt: customer.updated_at || customer.created_at
      });
    }

    // 2. Customer's customer_id_image field
    if (customer?.customer_id_image && getRawCustomerDocumentValue(customer.customer_id_image) !== '') {
      pushImage({
        url: customer.customer_id_image,
        type: 'ID Document',
        source: 'customer_id_image',
        label: 'ID Document',
        isCustomerImage: true,
        isFallback: false,
        uploadedAt: customer.updated_at || customer.created_at
      });
    }

    // 3. Additional ID scan history from scan metadata
    if (Array.isArray(customer?.scan_metadata?.id_scan_history)) {
      customer.scan_metadata.id_scan_history.forEach((url, index) => {
        if (getRawCustomerDocumentValue(url) !== '') {
          pushImage({
            url,
            type: 'ID Document Scan',
            source: 'scan_metadata.id_scan_history',
            label: `Previous ID Scan ${index + 1}`,
            isCustomerImage: true,
            isFallback: false,
            uploadedAt: customer.updated_at || customer.created_at
          });
        }
      });
    }

    // 4. Keep existing rental image logic but add null checks
    if (customerRentals && customerRentals.length > 0) {
      customerRentals.forEach(rental => {
        if (rental.customer_id_image && getRawCustomerDocumentValue(rental.customer_id_image) !== '') {
          pushImage({
            url: rental.customer_id_image,
            type: 'ID from Rental',
            source: 'rental',
            label: `ID from Rental ${formatDate(rental.created_at)}`,
            isCustomerImage: false,
            isFallback: false,
            uploadedAt: rental.created_at
          });
        }
      });
    }

    // 5. Fallback - use license number
    if (images.length === 0 && customer?.licence_number) {
      pushImage({
        url: '',
        type: 'Fallback',
        source: 'fallback',
        label: `License: ${customer.licence_number}`,
        isCustomerImage: true,
        isFallback: true
      });
    }

    return images;
  };

  // NEW: Get additional documents (extra_images) separately from ID documents
  const getAdditionalDocuments = (customer, customerRentals = []) => {
    const additionalDocs = [];
    
    // From customer.extra_images
    if (customer?.extra_images && Array.isArray(customer.extra_images)) {
      customer.extra_images.forEach((url, index) => {
        if (getRawCustomerDocumentValue(url) !== '') {
          additionalDocs.push({
            url: normalizeCustomerDocumentUrl(url),
            type: 'Additional Document',
            label: `Additional Document ${index + 1}`,
            isCustomerImage: true,
            uploadedAt: customer.updated_at || customer.created_at,
            documentKind: getCustomerDocumentKind(url)
          });
        }
      });
    }
    
    // From rental history additional documents (if any)
    if (customerRentals && customerRentals.length > 0) {
      customerRentals.forEach(rental => {
        if (rental.extra_images && Array.isArray(rental.extra_images)) {
          rental.extra_images.forEach((url, index) => {
            const normalizedUrl = normalizeCustomerDocumentUrl(url);
            if (normalizedUrl && !additionalDocs.some(doc => doc.url === normalizedUrl)) {
              additionalDocs.push({
                url: normalizedUrl,
                type: 'Additional Document',
                label: `Rental Additional Doc ${index + 1}`,
                isCustomerImage: false,
                uploadedAt: rental.created_at,
                documentKind: getCustomerDocumentKind(url)
              });
            }
          });
        }
      });
    }
    
    return additionalDocs;
  };

  const headerCheckboxRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [customersResponse, authUsers] = await Promise.all([
        supabase
          .from(`app_${APP_ID}_customers`)
          .select('*')
          .order('created_at', { ascending: false }),
        getUsers().catch((authUsersError) => {
          console.warn('Unable to load auth users for customer reconciliation:', authUsersError);
          return [];
        }),
      ]);

      if (customersResponse.error) {
        throw new Error(`Le chargement des clients a échoué : ${customersResponse.error.message}`);
      }

      let mergedCustomers = mergeCustomersWithRecoveredAuthAccounts(customersResponse.data || [], authUsers);

      if (canAccessBusinessOwnerRegistry) {
        try {
          const registryBusinessOwners = await listBusinessOwnersFromRegistry();
          const registryJobs = Array.isArray(registryBusinessOwners)
            ? registryBusinessOwners
                .map((entry) => {
                  const job = entry?.provisioning_job;
                  if (!job?.id) return null;
                  return {
                    ...job,
                    business_account: entry?.business_account || null,
                    tenant: entry?.tenant || null,
                  };
                })
                .filter(Boolean)
            : [];
          setTenantProvisioningJobs(registryJobs);
          mergedCustomers = mergeCustomersWithBusinessRegistry(mergedCustomers, registryBusinessOwners);
        } catch (tenantProvisioningError) {
          console.error('❌ Unable to load tenant provisioning jobs:', tenantProvisioningError);
          setTenantProvisioningJobs([]);
        }
      } else {
        setTenantProvisioningJobs([]);
      }

      setCustomers(mergedCustomers);
      setLoading(false);

      // Keep recovered auth accounts visible in-memory even when the legacy
      // customer table is behind the current schema. Persisting them from the
      // browser causes noisy 400s against older environments and does not block
      // the management flow, so we intentionally skip the client-side backfill.

      scheduleBackgroundTask(async () => {
        try {
          const [rentalsResponse, marketplaceListingsResponse, marketplaceVehicleProfilesResponse] = await Promise.all([
            supabase
              .from(`app_${APP_ID}_rentals`)
              .select('id, customer_id, rental_status, total_amount, created_at'),
            supabase
              .from('app_marketplace_listings')
              .select('id, owner_id, vehicle_public_profile_id, listing_status, created_at')
              .order('created_at', { ascending: false }),
            supabase
              .from('app_vehicle_public_profiles')
              .select('id, owner_id, created_at')
              .order('created_at', { ascending: false }),
          ]);

          if (rentalsResponse.error) {
            setRentals([]);
          } else {
            setRentals(rentalsResponse.data || []);
          }

          if (marketplaceListingsResponse.error) {
            setMarketplaceListings([]);
          } else {
            setMarketplaceListings(marketplaceListingsResponse.data || []);
          }

          if (marketplaceVehicleProfilesResponse.error) {
            setMarketplaceVehicleProfiles([]);
          } else {
            setMarketplaceVehicleProfiles(marketplaceVehicleProfilesResponse.data || []);
          }
        } catch (backgroundError) {
          console.error("❌ Exception loading customer rental aggregates:", backgroundError);
          setRentals([]);
          setMarketplaceListings([]);
          setMarketplaceVehicleProfiles([]);
        }
      });
      
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
      setCustomers([]);
      setRentals([]);
      setMarketplaceListings([]);
      setMarketplaceVehicleProfiles([]);
      setTenantProvisioningJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // This useEffect replaces the openFullPageView function
  useEffect(() => {
    const loadDetailedCustomerData = async () => {
      if (!fullPageViewOpen || !selectedCustomerId) {
        setProfileLoading(false);
        setDetailedCustomer(null);
        setCustomerProfileNote('');
        setCustomerNoteHistory([]);
        setCustomerBanNote('');
        if (customerAlertCheckboxRef.current) {
          customerAlertCheckboxRef.current.checked = false;
        }
        return;
      }

      setProfileLoading(true);
      setError(null);

      try {
        const targetCustomerId = selectedCustomerId;
        const fallbackCustomer = customers.find((customer) => customer.id === targetCustomerId) || null;
        
        // Fetch complete customer record from database (single source of truth)
        const { data: fullCustomer, error: customerError } = await supabase
          .from(`app_${APP_ID}_customers`)
          .select('*')
          .eq('id', targetCustomerId)
          .single();

        if (customerError) {
          if (!fallbackCustomer) {
            throw customerError;
          }
        }

        // Fetch rental history separately
        const historyResult = customerError
          ? { success: true, data: [] }
          : await getCustomerRentalHistory(targetCustomerId);
        const rentalHistory = historyResult.success ? historyResult.data : [];

        // Create comprehensive data object with all fields
        const dataToShow = {
          ...(fullCustomer || fallbackCustomer || {}),
          rentalHistory,
          formattedFields: {
            created_at: formatDate((fullCustomer || fallbackCustomer)?.created_at),
            updated_at: formatDate((fullCustomer || fallbackCustomer)?.updated_at),
            last_scan_at: formatDate((fullCustomer || fallbackCustomer)?.last_scan_at),
            date_of_birth: formatFullDate((fullCustomer || fallbackCustomer)?.date_of_birth),
            licence_issue_date: formatFullDate((fullCustomer || fallbackCustomer)?.licence_issue_date),
            licence_expiry_date: formatFullDate((fullCustomer || fallbackCustomer)?.licence_expiry_date),
            expiry_date: formatFullDate((fullCustomer || fallbackCustomer)?.expiry_date),
            issue_date: formatFullDate((fullCustomer || fallbackCustomer)?.issue_date),
          }
        };
        
        const resolvedCustomer = fullCustomer || fallbackCustomer || {};

        setDetailedCustomer(dataToShow);
        setCustomerProfileNote(resolvedCustomer?.scan_metadata?.admin_note || '');
        setCustomerNoteHistory(Array.isArray(resolvedCustomer?.scan_metadata?.staff_notes_history) ? resolvedCustomer.scan_metadata.staff_notes_history : []);
        setCustomerBanNote(resolvedCustomer?.scan_metadata?.ban_note || '');
        if (customerNoteTextareaRef.current) {
          customerNoteTextareaRef.current.value = resolvedCustomer?.scan_metadata?.admin_note || '';
        }
        if (customerBanTextareaRef.current) {
          customerBanTextareaRef.current.value = resolvedCustomer?.scan_metadata?.ban_note || '';
        }
        if (customerAlertCheckboxRef.current) {
          customerAlertCheckboxRef.current.checked = Boolean(resolvedCustomer?.scan_metadata?.show_admin_note_alert);
        }
        
      } catch (err) {
        console.error("❌ Error loading complete customer data:", err);
        setError(`Impossible de charger le profil client : ${err.message}`);
      } finally {
        setProfileLoading(false);
      }
    };

    loadDetailedCustomerData();
  }, [fullPageViewOpen, selectedCustomerId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, nationalityFilter, quickFilter, accountTypeFilter]);

  const hasScannedIdentityData = Boolean(
    detailedCustomer?.initial_scan_complete ||
    String(detailedCustomer?.data_source || '').toLowerCase().includes('ocr') ||
    Array.isArray(detailedCustomer?.scan_metadata?.id_scan_history) && detailedCustomer.scan_metadata.id_scan_history.length > 0
  );

  const lockedIdentityFieldNames = hasScannedIdentityData
    ? ['full_name', 'nationality', 'date_of_birth', 'licence_number']
    : [];

  const handleEditCustomer = async () => {
    try {
      setActionLoading(true);
      setError(null);

      if (!canCurrentUserEditCustomerProfile) {
        throw new Error("Vous n'avez pas la permission de modifier les profils clients.");
      }

      const targetCustomerId = detailedCustomer?.id || selectedCustomer?.id;
      if (!targetCustomerId) {
        throw new Error("Aucun client sélectionné pour la modification.");
      }

      const safeEditPayload = {
        ...editFormData,
        updated_at: new Date().toISOString()
      };

      if (hasScannedIdentityData) {
        lockedIdentityFieldNames.forEach((fieldName) => {
          delete safeEditPayload[fieldName];
        });
      }

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update(safeEditPayload)
        .eq('id', targetCustomerId)
        .select('*')
        .single();

      if (error) throw error;

      setEditModalOpen(false);
      setEditFormData({});
      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        rentalHistory: prev.rentalHistory || []
      } : prev);
      setSelectedCustomer(prev => prev ? { ...prev, ...data } : prev);
      setCustomers(prev => prev.map(customer =>
        customer.id === targetCustomerId
          ? { ...customer, ...data }
          : customer
      ));
      await fetchData();
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      setActionLoading(true);
      setError(null);

      if (user?.role !== 'owner') {
        alert('Only owners can delete customers or linked rentals.');
        return;
      }

      const customerToDelete = selectedCustomer;
      const historyCheck = await checkCustomerRentalHistory(customerToDelete.id);

      if (!historyCheck.success) {
        throw new Error(historyCheck.error || "Impossible de vérifier l'historique de location du client.");
      }

      if (historyCheck.hasHistory) {
        setDeleteModalOpen(false);
        setDeleteConfirmationText('');
        alert(
          `Impossible de supprimer ${customerToDelete.full_name} car ce client est encore lié à une ou plusieurs locations. Supprimez d'abord les enregistrements de location liés en toute sécurité, puis retirez le profil client.`
        );
        return;
      }

      const result = await deleteCustomer(customerToDelete.id);

      if (result.success) {
        setDeleteModalOpen(false);
        setDeleteConfirmationText('');
        setSelectedCustomer(null);
        await fetchData();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setNationalityFilter('All');
    setAccountTypeFilter('all');
  };

  const handleSaveCustomerNote = async () => {
    if (!detailedCustomer?.id) return;

    try {
      setSavingCustomerNote(true);
      const trimmedNote = (customerNoteTextareaRef.current?.value ?? customerProfileNote ?? '').trim();
      const customerAlertEnabled = Boolean(customerAlertCheckboxRef.current?.checked);
      const existingHistory = Array.isArray(detailedCustomer.scan_metadata?.staff_notes_history)
        ? detailedCustomer.scan_metadata.staff_notes_history
        : [];
      const latestNote = existingHistory[0];
      const shouldAppendHistory = trimmedNote && (
        !latestNote ||
        latestNote.note_text !== trimmedNote ||
        Boolean(latestNote.is_alert) !== Boolean(customerAlertEnabled)
      );
      const nextHistory = shouldAppendHistory
        ? [
            {
              id: `staff_note_${Date.now()}`,
              note_text: trimmedNote,
              is_alert: Boolean(customerAlertEnabled),
              created_at: new Date().toISOString(),
              created_by: user?.id || null,
              created_by_name: user?.full_name || user?.name || user?.email || user?.role || 'Staff',
            },
            ...existingHistory,
          ]
        : existingHistory;
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        admin_note: trimmedNote,
        show_admin_note_alert: Boolean(customerAlertEnabled && trimmedNote),
        staff_notes_history: nextHistory
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);
      setCustomerProfileNote(trimmedNote);
      setCustomerNoteHistory(nextHistory);
    } catch (err) {
      console.error('❌ Error saving customer note:', err);
      setError(`Impossible d'enregistrer la note client : ${err.message}`);
    } finally {
      setSavingCustomerNote(false);
    }
  };

  const handleDeleteCustomerNote = async (noteId) => {
    if (!detailedCustomer?.id || !noteId) return;

    try {
      setSavingCustomerNote(true);
      const existingHistory = Array.isArray(detailedCustomer.scan_metadata?.staff_notes_history)
        ? detailedCustomer.scan_metadata.staff_notes_history
        : [];
      const nextHistory = existingHistory.filter((note) => note?.id !== noteId);
      const nextLatestNote = nextHistory[0] || null;
      const nextAdminNote = nextLatestNote?.note_text || '';
      const nextAlertEnabled = Boolean(nextLatestNote?.is_alert && nextAdminNote);
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        admin_note: nextAdminNote,
        show_admin_note_alert: nextAlertEnabled,
        staff_notes_history: nextHistory,
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);
      setCustomerProfileNote(nextAdminNote);
      setCustomerNoteHistory(nextHistory);
      if (customerNoteTextareaRef.current) {
        customerNoteTextareaRef.current.value = nextAdminNote;
      }
      if (customerAlertCheckboxRef.current) {
        customerAlertCheckboxRef.current.checked = nextAlertEnabled;
      }
    } catch (err) {
      console.error('❌ Error deleting customer note:', err);
      setError(`Impossible de supprimer la note client : ${err.message}`);
    } finally {
      setSavingCustomerNote(false);
    }
  };

  const handleToggleCustomerBan = async (nextBanned) => {
    if (!detailedCustomer?.id) return;
    if (!nextBanned && !canCurrentUserManageBan) {
      setError('Seul un administrateur ou le propriétaire peut retirer un bannissement client.');
      return;
    }

    try {
      setSavingCustomerBan(true);
      const nextBanNote = customerBanTextareaRef.current?.value ?? customerBanNote;
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        is_banned: nextBanned,
        ban_note: nextBanNote
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);
      setCustomerBanNote(nextBanNote);

      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? {
              ...customer,
              ...data,
              scan_metadata: nextScanMetadata
            }
          : customer
      ));
    } catch (err) {
      console.error('❌ Error updating customer ban status:', err);
      setError(`Impossible de mettre à jour le statut de bannissement du client : ${err.message}`);
    } finally {
      setSavingCustomerBan(false);
    }
  };

  const handleSaveCustomerBanNote = async () => {
    if (!detailedCustomer?.id) return;

    try {
      setSavingCustomerBan(true);
      const nextBanNote = (customerBanTextareaRef.current?.value ?? customerBanNote ?? '').trim();
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        is_banned: Boolean(detailedCustomer.scan_metadata?.is_banned),
        ban_note: nextBanNote
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);
      setCustomerBanNote(nextBanNote);
      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? {
              ...customer,
              ...data,
              scan_metadata: nextScanMetadata
            }
          : customer
      ));
    } catch (err) {
      console.error('❌ Error saving customer ban note:', err);
      setError(`Impossible d'enregistrer la note de bannissement du client : ${err.message}`);
    } finally {
      setSavingCustomerBan(false);
    }
  };

  const handleUploadCustomerScan = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !detailedCustomer?.id) return;

    try {
      setUploadingCustomerScan(true);
      setError(null);

      const fileExtension = file.name.split('.').pop() || 'jpg';
      const filePath = `${detailedCustomer.id}/manual_id_scan_${Date.now()}.${fileExtension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('id_scans')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('id_scans')
        .getPublicUrl(uploadData.path);

      const existingHistory = Array.isArray(detailedCustomer.scan_metadata?.id_scan_history)
        ? detailedCustomer.scan_metadata.id_scan_history
        : [];
      const previousPrimaryScan = normalizeCustomerDocumentUrl(detailedCustomer.id_scan_url);
      const nextHistory = [
        ...existingHistory.map(url => normalizeCustomerDocumentUrl(url)).filter(Boolean),
        ...(previousPrimaryScan && previousPrimaryScan !== publicUrl ? [previousPrimaryScan] : [])
      ].filter((url, index, array) => array.indexOf(url) === index);

      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        id_scan_history: nextHistory
      };

      const { data, error: updateError } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          id_scan_url: publicUrl,
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        rentalHistory: prev.rentalHistory || [],
        scan_metadata: nextScanMetadata,
        id_scan_url: publicUrl
      } : prev);

      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? {
              ...customer,
              ...data,
              scan_metadata: nextScanMetadata,
              id_scan_url: publicUrl
            }
          : customer
      ));
    } catch (err) {
      console.error('❌ Error uploading new customer scan:', err);
      setError(`Impossible de téléverser un nouveau scan d'identité : ${err.message}`);
    } finally {
      if (event.target) {
        event.target.value = '';
      }
      setUploadingCustomerScan(false);
    }
  };

  const aggregatedData = useMemo(() => {
    const rentalsByCustomerId = new Map();
    rentals.forEach(rental => {
      if (!rental.customer_id) return;
      if (!rentalsByCustomerId.has(rental.customer_id)) {
        rentalsByCustomerId.set(rental.customer_id, []);
      }
      rentalsByCustomerId.get(rental.customer_id).push(rental);
    });

    const listingsByOwnerId = new Map();
    marketplaceListings.forEach((listing) => {
      const ownerId = String(listing?.owner_id || '').trim();
      if (!ownerId) return;
      if (!listingsByOwnerId.has(ownerId)) {
        listingsByOwnerId.set(ownerId, []);
      }
      listingsByOwnerId.get(ownerId).push(listing);
    });

    const vehiclesByOwnerId = new Map();
    marketplaceVehicleProfiles.forEach((profile) => {
      const ownerId = String(profile?.owner_id || '').trim();
      if (!ownerId) return;
      if (!vehiclesByOwnerId.has(ownerId)) {
        vehiclesByOwnerId.set(ownerId, []);
      }
      vehiclesByOwnerId.get(ownerId).push(profile);
    });

    const consolidatedProfiles = customers.map(customer => {
      const customerRentals = rentalsByCustomerId.get(customer.id) || [];
      const totalSpent = customerRentals.reduce((sum, rental) => sum + (rental.total_amount || 0), 0);
      const activeRentals = customerRentals.filter(r => String(r.rental_status || '').toLowerCase() === 'active').length;
      const authUserId = getBusinessOwnerAuthUserId(customer);
      const ownerLookupKeys = [...new Set([
        String(authUserId || '').trim(),
        String(customer?.id || '').trim(),
      ].filter(Boolean))];
      const listingRows = ownerLookupKeys.flatMap((ownerKey) => listingsByOwnerId.get(ownerKey) || []);
      const vehicleRows = ownerLookupKeys.flatMap((ownerKey) => vehiclesByOwnerId.get(ownerKey) || []);
      const listingsCount = listingRows.length;
      const vehiclesCount = vehicleRows.length;
      const liveListingsCount = listingRows.filter((row) => String(row?.listing_status || '').trim().toLowerCase() === 'live').length;
      const externalAccountType = resolveManagedAccountType({
        ...customer,
        listingsCount,
        vehiclesCount,
        liveListingsCount,
      });
      const accessStatus = activeRentals > 0 ? 'Active' : 'Inactive';
      const lastRentalActivityAt = customerRentals.reduce((latest, rental) => {
        const candidate = rental?.created_at ? new Date(rental.created_at).getTime() : 0;
        return candidate > latest ? candidate : latest;
      }, 0);
      const lastListingActivityAt = listingRows.reduce((latest, listing) => {
        const candidate = listing?.created_at ? new Date(listing.created_at).getTime() : 0;
        return candidate > latest ? candidate : latest;
      }, 0);
      const lastVehicleActivityAt = vehicleRows.reduce((latest, profile) => {
        const candidate = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
        return candidate > latest ? candidate : latest;
      }, 0);
      const lastSignInAt = customer?.last_sign_in_at ? new Date(customer.last_sign_in_at).getTime() : 0;
      const lastActivityTimestamp = Math.max(lastRentalActivityAt, lastListingActivityAt, lastVehicleActivityAt, lastSignInAt);

      return {
        ...customer,
        totalRentals: customerRentals.length,
        activeRentals,
        totalSpent,
        status: accessStatus,
        accessStatus,
        approvalStatus: getUnifiedApprovalStatus(customer),
        unifiedStatusMeta: getUnifiedStatusMeta({ ...customer, status: accessStatus }, isFrench),
        externalAccountType,
        isAppAccount: isCustomerAppAccount(customer),
        isBanned: Boolean(customer.scan_metadata?.is_banned),
        banNote: customer.scan_metadata?.ban_note || '',
        hasActiveAlertNote: Boolean(customer.scan_metadata?.show_admin_note_alert && customer.scan_metadata?.admin_note),
        activeAlertNote: customer.scan_metadata?.admin_note || '',
        listingsCount,
        vehiclesCount,
        liveListingsCount,
        auth_user_id: authUserId || null,
        planType: getBusinessOwnerPlanType(customer),
        billingStatus: getBusinessOwnerBillingStatus(customer),
        lastActivityAt: lastActivityTimestamp > 0 ? new Date(lastActivityTimestamp).toISOString() : null,
      };
    });

    const tabScopedCustomers = consolidatedProfiles.filter((customer) => {
      return accountTypeFilter === 'all' || customer.externalAccountType === accountTypeFilter;
    });

    const quickFilterCounts = {
      pendingApprovals: tabScopedCustomers.filter((customer) => matchesQuickFilter(customer, 'pending_approvals')).length,
      noListings: tabScopedCustomers.filter((customer) => matchesQuickFilter(customer, 'no_listings')).length,
      noRentals: tabScopedCustomers.filter((customer) => matchesQuickFilter(customer, 'no_rentals')).length,
      inactiveUsers: tabScopedCustomers.filter((customer) => matchesQuickFilter(customer, 'inactive_users')).length,
    };

    let filteredCustomers = tabScopedCustomers.filter(customer => {
      const matchesSearch = !searchTerm ||
        (customer.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = matchesStatusFilter(customer, statusFilter);
      const matchesNationality = nationalityFilter === 'All' ||
        (customer.nationality || '').toLowerCase() === nationalityFilter.toLowerCase();
      const matchesQuick = matchesQuickFilter(customer, quickFilter);
      return matchesSearch && matchesStatus && matchesNationality && matchesQuick;
    });

    filteredCustomers.sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return bTime - aTime;
    });

    const totalUniqueCustomers = consolidatedProfiles.length;
    const totalActiveRentals = rentals.filter(rental => String(rental.rental_status || '').toLowerCase() === 'active').length;
    const totalRevenue = rentals.reduce((sum, rental) => sum + (rental.total_amount || 0), 0);
    const accountTypeCounts = consolidatedProfiles.reduce((acc, customer) => {
      const key = customer.externalAccountType || 'customer';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { customer: 0, private_owner: 0, business_owner: 0 });

    return {
      customers: filteredCustomers,
      summary: {
        totalCustomers: totalUniqueCustomers,
        totalActiveRentals,
        totalRevenue,
        customerAccounts: accountTypeCounts.customer || 0,
        privateOwners: accountTypeCounts.private_owner || 0,
        businessOwners: accountTypeCounts.business_owner || 0,
      }
      ,
      quickFilterCounts
    };
  }, [customers, rentals, marketplaceListings, marketplaceVehicleProfiles, searchTerm, statusFilter, nationalityFilter, accountTypeFilter, quickFilter, isFrench]);

  const availableNationalities = useMemo(() => {
    const nationalities = customers
      .map(customer => customer.nationality)
      .filter(nationality => nationality && nationality.trim() !== '')
      .filter((nationality, index, arr) => arr.indexOf(nationality) === index)
      .sort();
    return nationalities;
  }, [customers]);

  const totalPages = Math.max(1, Math.ceil(aggregatedData.customers.length / itemsPerPage));
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return aggregatedData.customers.slice(startIndex, startIndex + itemsPerPage);
  }, [aggregatedData.customers, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, nationalityFilter, accountTypeFilter, quickFilter]);

  const handleApproveBusinessOwner = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) {
      alert(tr('This business owner is missing an auth account link.', "Ce propriétaire business n'a pas de liaison auth."));
      return;
    }

    try {
      setBusinessOwnerActionLoading(`approve:${customer.id}`);
      const response = await approveBusinessOwner(authUserId);
      const nextBusinessOwnerState = {
        verification_status: response?.user?.user_metadata?.verification_status || response?.profile?.verification_status || 'approved',
        approved_at: response?.user?.user_metadata?.approved_at || response?.profile?.approved_at || new Date().toISOString(),
        approved_by: response?.user?.user_metadata?.approved_by || response?.profile?.approved_by || null,
        rejection_reason: response?.user?.user_metadata?.rejection_reason || response?.profile?.rejection_reason || '',
        subscription_plan: response?.user?.user_metadata?.subscription_plan || response?.profile?.subscription_plan || 'free_trial',
        subscription_status: response?.user?.user_metadata?.subscription_status || response?.profile?.subscription_status || 'trial',
        trial_started_at: response?.user?.user_metadata?.trial_started_at || response?.profile?.trial_started_at || null,
        trial_ends_at: response?.user?.user_metadata?.trial_ends_at || response?.profile?.trial_ends_at || null,
        subscription_started_at: response?.user?.user_metadata?.subscription_started_at || response?.profile?.subscription_started_at || null,
      };

      setCustomers((prev) =>
        prev.map((entry) =>
          entry?.id === customer.id
            ? applyBusinessOwnerStateToCustomer(entry, nextBusinessOwnerState)
            : entry
        )
      );

      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer((prev) => prev ? applyBusinessOwnerStateToCustomer(prev, nextBusinessOwnerState) : prev);
      }

    } catch (err) {
      alert(err?.message || tr('Unable to approve this business owner right now.', "Impossible d'approuver ce propriétaire business pour le moment."));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleRequestBusinessOwnerInfo = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) {
      alert(tr('This business owner is missing an auth account link.', "Ce propriétaire business n'a pas de liaison auth."));
      return;
    }

    try {
      setBusinessOwnerActionLoading(`info:${customer.id}`);
      const response = await requestBusinessOwnerInfo(authUserId);
      const nextBusinessOwnerState = {
        verification_status: response?.user?.user_metadata?.verification_status || response?.profile?.verification_status || 'needs_info',
      };

      setCustomers((prev) =>
        prev.map((entry) =>
          entry?.id === customer.id
            ? applyBusinessOwnerStateToCustomer(entry, nextBusinessOwnerState)
            : entry
        )
      );

      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer((prev) => prev ? applyBusinessOwnerStateToCustomer(prev, nextBusinessOwnerState) : prev);
      }

    } catch (err) {
      alert(err?.message || tr('Unable to request more information right now.', "Impossible de demander plus d'informations pour le moment."));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const applyBusinessOwnerServerResponse = (customerId, response, fallbackUpdates = {}) => {
    const nextBusinessOwnerState = {
      verification_status: response?.user?.user_metadata?.verification_status || response?.profile?.verification_status || fallbackUpdates.verification_status || 'pending',
      approved_at: response?.user?.user_metadata?.approved_at || response?.profile?.approved_at || fallbackUpdates.approved_at || null,
      approved_by: response?.user?.user_metadata?.approved_by || response?.profile?.approved_by || fallbackUpdates.approved_by || null,
      rejection_reason: response?.user?.user_metadata?.rejection_reason || response?.profile?.rejection_reason || fallbackUpdates.rejection_reason || '',
      subscription_plan: response?.user?.user_metadata?.subscription_plan || response?.profile?.subscription_plan || fallbackUpdates.subscription_plan || '',
      subscription_status: response?.user?.user_metadata?.subscription_status || response?.profile?.subscription_status || fallbackUpdates.subscription_status || '',
      plan_type: response?.user?.user_metadata?.plan_type || response?.profile?.plan_type || fallbackUpdates.plan_type || 'starter',
      billing_status: response?.user?.user_metadata?.billing_status || response?.profile?.billing_status || fallbackUpdates.billing_status || 'none',
      trial_started_at: response?.user?.user_metadata?.trial_started_at || response?.profile?.trial_started_at || fallbackUpdates.trial_started_at || null,
      trial_ends_at: response?.user?.user_metadata?.trial_ends_at || response?.profile?.trial_ends_at || fallbackUpdates.trial_ends_at || null,
      subscription_started_at: response?.user?.user_metadata?.subscription_started_at || response?.profile?.subscription_started_at || fallbackUpdates.subscription_started_at || null,
      suspended_at: response?.user?.user_metadata?.suspended_at || response?.profile?.suspended_at || fallbackUpdates.suspended_at || null,
      suspension_reason: response?.user?.user_metadata?.suspension_reason || response?.profile?.suspension_reason || fallbackUpdates.suspension_reason || '',
      plan_changed_at: response?.user?.user_metadata?.plan_changed_at || response?.profile?.plan_changed_at || fallbackUpdates.plan_changed_at || null,
    };
    const provisioningState = {
      tenant: response?.tenant || null,
      provisioningJob: response?.provisioning_job || null,
      businessAccount: response?.business_account || null,
    };

    setCustomers((prev) =>
      prev.map((entry) =>
        entry?.id === customerId
          ? applyBusinessOwnerProvisioningStateToCustomer(
              applyBusinessOwnerStateToCustomer(entry, nextBusinessOwnerState),
              provisioningState
            )
          : entry
      )
    );

    if (selectedCustomer?.id === customerId) {
      setSelectedCustomer((prev) => prev
        ? applyBusinessOwnerProvisioningStateToCustomer(
            applyBusinessOwnerStateToCustomer(prev, nextBusinessOwnerState),
            provisioningState
          )
        : prev);
    }

    if (response?.provisioning_job?.id) {
      setTenantProvisioningJobs((prev) => {
        const nextJobs = Array.isArray(prev) ? [...prev] : [];
        const nextJob = {
          ...(response?.provisioning_job || {}),
          tenant: response?.tenant || null,
          business_account: response?.business_account || null,
        };
        const existingIndex = nextJobs.findIndex((job) => job?.id === nextJob.id);
        if (existingIndex >= 0) {
          nextJobs[existingIndex] = nextJob;
        } else {
          nextJobs.unshift(nextJob);
        }
        return nextJobs;
      });
    }
  };

  const openRejectBusinessOwnerModal = (customer) => {
    setPendingBusinessOwner(customer);
    setBusinessOwnerRejectReason('');
    setBusinessOwnerRejectModalOpen(true);
  };

  const confirmRejectBusinessOwner = async () => {
    const authUserId = getBusinessOwnerAuthUserId(pendingBusinessOwner);
    if (!authUserId) {
      setBusinessOwnerRejectModalOpen(false);
      return;
    }

    if (!String(businessOwnerRejectReason || '').trim()) {
      return;
    }

    try {
      setBusinessOwnerActionLoading(`reject:${pendingBusinessOwner.id}`);
      const response = await rejectBusinessOwner(authUserId, businessOwnerRejectReason);
      const nextBusinessOwnerState = {
        verification_status: response?.user?.user_metadata?.verification_status || response?.profile?.verification_status || 'rejected',
        rejection_reason: businessOwnerRejectReason,
      };

      setCustomers((prev) =>
        prev.map((entry) =>
          entry?.id === pendingBusinessOwner.id
            ? applyBusinessOwnerStateToCustomer(entry, nextBusinessOwnerState)
            : entry
        )
      );

      if (selectedCustomer?.id === pendingBusinessOwner.id) {
        setSelectedCustomer((prev) => prev ? applyBusinessOwnerStateToCustomer(prev, nextBusinessOwnerState) : prev);
      }

      setBusinessOwnerRejectModalOpen(false);
      setPendingBusinessOwner(null);
      setBusinessOwnerRejectReason('');
    } catch (err) {
      alert(err?.message || tr('Unable to reject this business owner right now.', "Impossible de rejeter ce propriétaire business pour le moment."));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleSuspendBusinessOwner = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) return;

    try {
      setBusinessOwnerActionLoading(`suspend:${customer.id}`);
      const response = await suspendBusinessOwner(authUserId, tr('Suspended from Customer Management.', 'Suspendu depuis la gestion clients.'));
      applyBusinessOwnerServerResponse(customer.id, response, {
        verification_status: 'approved',
        subscription_status: 'suspended',
      });
    } catch (error) {
      alert(error?.message || tr('Unable to suspend this business owner right now.', 'Impossible de suspendre ce business owner pour le moment.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleReactivateBusinessOwner = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) return;

    try {
      setBusinessOwnerActionLoading(`reactivate:${customer.id}`);
      const response = await reactivateBusinessOwner(authUserId);
      applyBusinessOwnerServerResponse(customer.id, response, {
        verification_status: 'approved',
        subscription_status: 'active',
        suspended_at: null,
        suspension_reason: '',
      });
    } catch (error) {
      alert(error?.message || tr('Unable to reactivate this business owner right now.', 'Impossible de réactiver ce business owner pour le moment.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleExtendBusinessOwnerTrial = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) return;

    try {
      setBusinessOwnerActionLoading(`extend:${customer.id}`);
      const response = await extendBusinessOwnerTrial(authUserId);
      applyBusinessOwnerServerResponse(customer.id, response, {
        verification_status: 'approved',
        subscription_status: 'trial',
      });
    } catch (error) {
      alert(error?.message || tr('Unable to extend this trial right now.', "Impossible d'étendre cet essai pour le moment."));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleActivateBusinessOwnerSubscription = async (customer) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) return;

    try {
      setBusinessOwnerActionLoading(`activate:${customer.id}`);
      const response = await activateBusinessOwnerSubscription(authUserId);
      applyBusinessOwnerServerResponse(customer.id, response, {
        verification_status: 'approved',
        subscription_status: 'active',
        billing_status: 'active',
      });
    } catch (error) {
      alert(error?.message || tr('Unable to activate this subscription right now.', "Impossible d'activer cet abonnement pour le moment."));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleChangeBusinessOwnerPlan = async (customer, planType) => {
    const authUserId = getBusinessOwnerAuthUserId(customer);
    if (!authUserId) return;

    try {
      setBusinessOwnerActionLoading(`plan:${customer.id}`);
      const response = await changeBusinessOwnerPlan(authUserId, planType);
      applyBusinessOwnerServerResponse(customer.id, response, {
        verification_status: 'approved',
        plan_type: planType,
      });
    } catch (error) {
      alert(error?.message || tr('Unable to change this plan right now.', 'Impossible de changer ce forfait pour le moment.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleOpenBusinessOwnerWorkspace = (customer) => {
    const tenantStatus = String(customer?.tenant_status || customer?.scan_metadata?.tenant_status || '').trim().toLowerCase();
    const tenantAppUrl = String(customer?.tenant_app_url || customer?.scan_metadata?.tenant_app_url || '').trim();
    if (tenantStatus === 'active' && tenantAppUrl) {
      window.open(tenantAppUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    alert(tr('Workspace is not active yet.', "L'espace workspace n'est pas encore actif."));
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchData();
  }, [canAccessBusinessOwnerRegistry, user?.id, user?.role]);

  const customersWithoutRentals = useMemo(() => {
    return aggregatedData.customers.filter(c => c.totalRentals === 0);
  }, [aggregatedData.customers]);

  const selectedRows = useMemo(() => (
    aggregatedData.customers.filter((customer) => selectedCustomerIds.includes(customer.id))
  ), [aggregatedData.customers, selectedCustomerIds]);

  const selectedBusinessOwnerRows = useMemo(() => (
    selectedRows.filter((customer) => customer.externalAccountType === 'business_owner')
  ), [selectedRows]);

  const businessOwnerRows = useMemo(() => (
    paginatedCustomers
      .filter((customer) => customer.externalAccountType === 'business_owner')
      .map((customer) => {
        const authUserId = getBusinessOwnerAuthUserId(customer);
        const normalizedEmail = normalizeEmail(customer?.email || customer?.scan_metadata?.auth_email);
        const provisioningJob = tenantProvisioningJobs.find((job) => {
          const jobAuthUserId = String(job?.business_account?.auth_user_id || '').trim();
          const jobEmail = normalizeEmail(job?.business_account?.email);
          return (authUserId && jobAuthUserId === authUserId) || (normalizedEmail && jobEmail === normalizedEmail);
        }) || null;
        const tenant = provisioningJob?.tenant || null;

        return {
          ...applyBusinessOwnerProvisioningStateToCustomer(customer, {
            tenant,
            provisioningJob,
            businessAccount: provisioningJob?.business_account || null,
          }),
        verificationStatus: getBusinessOwnerVerificationStatus(customer),
        subscriptionStatus: String(customer.subscription_status || customer.scan_metadata?.subscription_status || '').toLowerCase(),
        planType: getBusinessOwnerPlanType(customer),
        billingStatus: getBusinessOwnerBillingStatus(customer),
        trialEndsAt: customer.trial_ends_at || customer.scan_metadata?.trial_ends_at || null,
        rejectionReason: customer.rejection_reason || '',
        suspensionReason: getBusinessOwnerSuspensionReason(customer),
        company_name: customer.company_name || customer.scan_metadata?.company_name || '',
        };
      })
  ), [paginatedCustomers, tenantProvisioningJobs]);

  const handleStartTenantProvisioning = async (customer) => {
    const jobId = String(customer?.provisioning_job_id || customer?.scan_metadata?.provisioning_job_id || '').trim();
    const businessAccountId = String(customer?.platform_business_account_id || customer?.scan_metadata?.platform_business_account_id || '').trim();
    if (!jobId && !businessAccountId) {
      alert(tr('No provisioning job is linked to this business owner yet.', 'Aucun job de provisionnement n’est encore lié à ce business owner.'));
      return;
    }

    try {
      setBusinessOwnerActionLoading(`tenant-start:${customer.id}`);
      const response = await startTenantProvisioning(jobId, businessAccountId);
      setTenantProvisioningJobs((prev) => prev.map((job) => job.id === response?.job?.id ? { ...job, ...response.job, tenant: response?.tenant || job.tenant } : job));
      setCustomers((prev) => prev.map((entry) => entry?.id === customer.id ? applyBusinessOwnerProvisioningStateToCustomer(entry, { job: response?.job, tenant: response?.tenant }) : entry));
    } catch (error) {
      alert(error?.message || tr('Unable to start tenant provisioning right now.', 'Impossible de démarrer le provisionnement du tenant pour le moment.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleFailTenantProvisioning = async (customer, errorMessage) => {
    const jobId = String(customer?.provisioning_job_id || customer?.scan_metadata?.provisioning_job_id || '').trim();
    if (!jobId) {
      alert(tr('No provisioning job is linked to this business owner yet.', 'Aucun job de provisionnement n’est encore lié à ce business owner.'));
      return;
    }

    try {
      setBusinessOwnerActionLoading(`tenant-fail:${customer.id}`);
      const response = await failTenantProvisioning(jobId, errorMessage);
      setTenantProvisioningJobs((prev) => prev.map((job) => job.id === response?.job?.id ? { ...job, ...response.job, tenant: response?.tenant || job.tenant } : job));
      setCustomers((prev) => prev.map((entry) => entry?.id === customer.id ? applyBusinessOwnerProvisioningStateToCustomer(entry, { job: response?.job, tenant: response?.tenant }) : entry));
    } catch (error) {
      alert(error?.message || tr('Unable to mark this tenant provisioning as failed.', 'Impossible de marquer ce provisionnement tenant comme échoué.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const handleCompleteTenantProvisioning = async (customer, payload) => {
    const jobId = String(customer?.provisioning_job_id || customer?.scan_metadata?.provisioning_job_id || '').trim();
    if (!jobId) {
      alert(tr('No provisioning job is linked to this business owner yet.', 'Aucun job de provisionnement n’est encore lié à ce business owner.'));
      return;
    }

    const normalizedPayload = buildProvisioningPayload({
      ...payload,
      tenancy_mode: resolveCustomerTenancyMode(customer),
    });
    const missingFields = resolveCustomerTenancyMode(customer) === 'dedicated'
      ? [
          ['tenant_project_ref', normalizedPayload.tenant_project_ref],
          ['tenant_app_url', normalizedPayload.tenant_app_url],
          ['tenant_api_url', normalizedPayload.tenant_api_url],
          ['tenant_anon_key', normalizedPayload.tenant_anon_key],
        ].filter(([, value]) => !String(value || '').trim())
      : [];

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(([field]) => {
        if (field === 'tenant_project_ref') return tr('project reference', 'référence projet');
        if (field === 'tenant_app_url') return tr('app URL', 'URL app');
        if (field === 'tenant_api_url') return tr('API URL', 'URL API');
        if (field === 'tenant_anon_key') return tr('anon key', 'clé anon');
        return field;
      });

      alert(
        tr(
          `Complete provisioning requires: ${fieldLabels.join(', ')}.`,
          `Le provisionnement complet nécessite : ${fieldLabels.join(', ')}.`
        )
      );
      return;
    }

    try {
      setBusinessOwnerActionLoading(`tenant-complete:${customer.id}`);
      const response = await completeTenantProvisioning(jobId, normalizedPayload);
      setTenantProvisioningJobs((prev) => prev.map((job) => job.id === response?.job?.id ? { ...job, ...response.job, tenant: response?.tenant || job.tenant } : job));
      setCustomers((prev) => prev.map((entry) => entry?.id === customer.id ? applyBusinessOwnerProvisioningStateToCustomer(entry, { job: response?.job, tenant: response?.tenant }) : entry));
    } catch (error) {
      alert(error?.message || tr('Unable to complete this tenant provisioning right now.', 'Impossible de terminer ce provisionnement tenant pour le moment.'));
    } finally {
      setBusinessOwnerActionLoading('');
    }
  };

  const eligibleForSelectionCount = useMemo(() => {
    return customersWithoutRentals.length;
  }, [customersWithoutRentals]);

  const detailedCustomerIdImages = useMemo(() => {
    if (!detailedCustomer) return [];
    return getAllCustomerImages(detailedCustomer, detailedCustomer.rentalHistory || []);
  }, [
    detailedCustomer?.id,
    detailedCustomer?.id_scan_url,
    detailedCustomer?.customer_id_image,
    JSON.stringify(detailedCustomer?.extra_images || []),
    JSON.stringify(detailedCustomer?.scan_metadata?.id_scan_history || []),
    JSON.stringify(
      (detailedCustomer?.rentalHistory || []).map((rental) => ({
        id: rental?.id,
        customer_id_image: rental?.customer_id_image,
      }))
    ),
  ]);

  const detailedCustomerAdditionalDocs = useMemo(() => {
    if (!detailedCustomer) return [];
    return getAdditionalDocuments(detailedCustomer, detailedCustomer.rentalHistory || []);
  }, [
    detailedCustomer?.id,
    JSON.stringify(detailedCustomer?.extra_images || []),
    JSON.stringify(
      (detailedCustomer?.rentalHistory || []).map((rental) => ({
        id: rental?.id,
        extra_images: rental?.extra_images || [],
      }))
    ),
  ]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = selectedCustomerIds.length;
      const pageCount = paginatedCustomers.length;
      headerCheckboxRef.current.checked = pageCount > 0 && selectedCount > 0 && selectedCount === pageCount;
      headerCheckboxRef.current.indeterminate = selectedCount > 0 && selectedCount < pageCount;
    }
  }, [selectedCustomerIds, paginatedCustomers]);

  const openViewModal = (customer) => {
    setSelectedCustomer(customer);
    setViewModalOpen(true);
  };

  const openAdminCustomerProfile = (customer) => {
    if (!customer) return;

    const params = new URLSearchParams();
    const resolvedCustomerId = String(customer?.id || '').trim();
    const resolvedAuthUserId = String(
      customer?.scan_metadata?.auth_user_id ||
      customer?.auth_user_id ||
      customer?.booked_by_user_id ||
      ''
    ).trim();
    const resolvedEmail = normalizeEmail(
      customer?.email ||
      customer?.customer_email ||
      customer?.scan_metadata?.auth_email
    );

    if (resolvedCustomerId) params.set('customerId', resolvedCustomerId);
    if (resolvedAuthUserId) params.set('authUserId', resolvedAuthUserId);
    if (resolvedEmail) params.set('email', resolvedEmail);

    navigate(`/admin/customers/profile${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const openFullPageView = (customer) => {
    openAdminCustomerProfile(customer);
  };

  const openEditModal = (customer) => {
    if (!canCurrentUserEditCustomerProfile) {
      return;
    }

    setSelectedCustomer(customer);
    setEditFormData({
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      nationality: customer.nationality || '',
      address: customer.address || '',
      date_of_birth: customer.date_of_birth || '',
      licence_number: customer.licence_number || '',
      id_number: customer.id_number || '',
      place_of_birth: customer.place_of_birth || ''
    });
    setEditModalOpen(true);
  };

  const openDeleteModal = (customer) => {
    setSelectedCustomer(customer);
    setDeleteConfirmationText('');
    setDeleteModalOpen(true);
  };

  const handleSelectCustomer = (customerId) => {
    setSelectedCustomerIds(prev =>
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleQuickDisableCustomer = async (customer) => {
    if (!customer?.id) return;

    try {
      setActionLoading(true);
      const nextScanMetadata = {
        ...(customer.scan_metadata || {}),
        is_banned: true,
        ban_note: customer.scan_metadata?.ban_note || tr('Disabled from Customer Management.', 'Désactivé depuis la gestion clients.'),
      };

      const { data, error: updateError } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customer.id)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      setCustomers((prev) =>
        prev.map((entry) =>
          entry.id === customer.id
            ? {
                ...entry,
                ...data,
                scan_metadata: nextScanMetadata,
              }
            : entry
        )
      );
    } catch (disableError) {
      alert(disableError?.message || tr('Unable to disable this account right now.', 'Impossible de désactiver ce compte pour le moment.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    const selectedBusinessOwners = aggregatedData.customers.filter((customer) => {
      const isSelected = selectedCustomerIds.includes(customer.id);
      const isBusinessOwner = customer.externalAccountType === 'business_owner';
      const approvalStatus = getUnifiedApprovalStatus(customer);
      return isSelected && isBusinessOwner && ['pending', 'needs_info', 'rejected'].includes(String(approvalStatus || '').toLowerCase());
    });

    if (!selectedBusinessOwners.length) {
      return;
    }

    try {
      setActionLoading(true);
      for (const customer of selectedBusinessOwners) {
        // eslint-disable-next-line no-await-in-loop
        await handleApproveBusinessOwner(customer);
      }
      setSelectedCustomerIds([]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDisable = async () => {
    const selectedRows = aggregatedData.customers.filter((customer) => selectedCustomerIds.includes(customer.id));
    if (!selectedRows.length) {
      return;
    }

    try {
      setActionLoading(true);
      for (const customer of selectedRows) {
        // eslint-disable-next-line no-await-in-loop
        await handleQuickDisableCustomer(customer);
      }
      setSelectedCustomerIds([]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkReject = async () => {
    if (!String(bulkRejectReason || '').trim()) {
      return;
    }

    const selectedBusinessOwners = aggregatedData.customers.filter((customer) => {
      const isSelected = selectedCustomerIds.includes(customer.id);
      return isSelected && customer.externalAccountType === 'business_owner';
    });

    if (!selectedBusinessOwners.length) {
      setBulkRejectModalOpen(false);
      setBulkRejectReason('');
      return;
    }

    try {
      setActionLoading(true);
      for (const customer of selectedBusinessOwners) {
        const authUserId = getBusinessOwnerAuthUserId(customer);
        if (!authUserId) continue;
        // eslint-disable-next-line no-await-in-loop
        const response = await rejectBusinessOwner(authUserId, bulkRejectReason);
        const nextBusinessOwnerState = {
          verification_status: response?.user?.user_metadata?.verification_status || response?.profile?.verification_status || 'rejected',
          rejection_reason: bulkRejectReason,
        };

        setCustomers((prev) =>
          prev.map((entry) =>
            entry?.id === customer.id
              ? applyBusinessOwnerStateToCustomer(entry, nextBusinessOwnerState)
              : entry
          )
        );
      }

      setSelectedCustomerIds([]);
      setBulkRejectModalOpen(false);
      setBulkRejectReason('');
    } catch (bulkRejectError) {
      alert(bulkRejectError?.message || tr('Unable to reject the selected business owners right now.', 'Impossible de rejeter les business owners sélectionnés pour le moment.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allEligibleIds = paginatedCustomers.map(c => c.id);
      setSelectedCustomerIds(allEligibleIds);
    } else {
      setSelectedCustomerIds([]);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      setActionLoading(true);
      
      // Filter out customers with rental history
      const customersToDelete = aggregatedData.customers.filter(c => 
        selectedCustomerIds.includes(c.id) && c.totalRentals === 0
      );
      
      const customersWithHistory = aggregatedData.customers.filter(c => 
        selectedCustomerIds.includes(c.id) && c.totalRentals > 0
      );
      
      // Only delete customers without rental history
      const idsToDelete = customersToDelete.map(c => c.id);
      
      if (idsToDelete.length === 0) {
        alert('None of the selected customers can be deleted because they all have rental history.');
        setShowBulkDeleteModal(false);
        setActionLoading(false);
        return;
      }
      
      const result = await deleteCustomers(idsToDelete);
      
      if (result.success) {
        // Build informative message
        let message = `${idsToDelete.length} client(s) supprimé(s) avec succès.`;
        
        if (customersWithHistory.length > 0) {
          const skippedNames = customersWithHistory.map(c => c.full_name).join(', ');
          message += `\n\n${customersWithHistory.length} customer(s) could not be deleted due to rental history:\n${skippedNames}`;
        }
        
        alert(message);
        setShowBulkDeleteModal(false);
        setBulkDeleteConfirmationText('');
        setSelectedCustomerIds([]);
        await fetchData();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      alert(`Erreur lors de la suppression des clients : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const cleanupCustomersWithoutRentals = async () => {
    try {
      setActionLoading(true);
      setError(null);

      if (customersWithoutRentals.length === 0) {
        alert(isFrench ? 'Aucun client sans location à examiner.' : 'There are no customers without rentals to review.');
        return;
      }

      const confirmed = window.confirm(
        isFrench
          ? `Supprimer ${customersWithoutRentals.length} client(s) sans location ? Cette action peut supprimer de vrais comptes clients qui n’ont simplement pas encore réservé.`
          : `Delete ${customersWithoutRentals.length} customer(s) without rentals? This may remove legitimate customer signups that simply have not booked yet.`
      );

      if (!confirmed) {
        return;
      }

      const allLocations = customersWithoutRentals.flatMap((customer) =>
        collectCustomerStorageLocations(
          customer.id_scan_url,
          customer.customer_id_image,
          customer.extra_images
        )
      );

      const locationsByBucket = allLocations.reduce((accumulator, location) => {
        if (!accumulator[location.bucketName]) {
          accumulator[location.bucketName] = [];
        }
        accumulator[location.bucketName].push(location.storagePath);
        return accumulator;
      }, {});

      await Promise.all(
        Object.entries(locationsByBucket).map(async ([bucketName, storagePaths]) => {
          const uniquePaths = Array.from(new Set(storagePaths));
          if (uniquePaths.length === 0) return;
          const { error: storageError } = await supabase.storage
            .from(bucketName)
            .remove(uniquePaths);

          if (storageError) {
            console.warn(`Impossible de supprimer certains fichiers clients sans location depuis ${bucketName} :`, storageError);
          }
        })
      );

      const customerIds = customersWithoutRentals.map((customer) => customer.id);
      const result = await deleteCustomers(customerIds);

      if (!result.success) {
        throw new Error(result.error || 'Impossible de supprimer les clients sans location');
      }

      alert(
        isFrench
          ? `${customerIds.length} client(s) sans location supprimé(s).`
          : `${customerIds.length} customer(s) without rentals deleted.`
      );
      setSelectedCustomerIds([]);
      setShowCustomersWithoutRentalsReview(false);
      await fetchData();
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
      alert(isFrench ? `Erreur lors de la suppression des clients sans location : ${err.message}` : `Error deleting customers without rentals: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCustomerAsStaff = async () => {
    if (user?.role !== 'owner') {
      alert(tr('Only owners can add customers as staff members.', 'Seuls les propriétaires peuvent ajouter des clients comme membres du personnel.'));
      return;
    }

    const customerStaffEmail = getCustomerStaffEmail(detailedCustomer);

    if (!customerStaffEmail) {
      alert(tr('This customer needs an email or Gmail account before they can be added as staff.', 'Ce client doit avoir un email ou un compte Gmail avant de pouvoir être ajouté comme membre du personnel.'));
      return;
    }

    setPendingStaffRole('employee');
    setStaffRoleModalOpen(true);
  };

  const confirmAddCustomerAsStaff = async () => {
    if (!detailedCustomer) return;

    const customerStaffEmail = getCustomerStaffEmail(detailedCustomer);
    if (!customerStaffEmail) {
      setStaffRoleModalOpen(false);
      return;
    }

    const normalizedRole = String(pendingStaffRole || 'employee').trim().toLowerCase();
    const allowedRoles = ['employee', 'guide', 'admin'];
    if (!allowedRoles.includes(normalizedRole)) {
      return;
    }

    setPromotingCustomerToStaff(true);
    try {
      setStaffRoleModalOpen(false);
      const permissions = buildStaffPermissionsForCustomerPromotion(normalizedRole);
      const { user: promotedUser } = await promoteExistingUserToStaff(
        customerStaffEmail,
        detailedCustomer.full_name || detailedCustomer.raw_name || customerStaffEmail,
        normalizedRole,
        {
          phone_number: detailedCustomer.phone || null,
          permissions,
          source_customer_id: detailedCustomer.id,
        }
      );

      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        staff_user_id: promotedUser?.id || null,
        staff_role: normalizedRole,
        staff_promoted_at: new Date().toISOString(),
        staff_promoted_by: user?.id || null,
        staff_promoted_by_name: user?.full_name || user?.name || user?.email || 'Owner',
      };

      await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', detailedCustomer.id);

      setDetailedCustomer(prev => prev ? { ...prev, scan_metadata: nextScanMetadata } : prev);
      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? { ...customer, scan_metadata: nextScanMetadata }
          : customer
      ));

      setStaffPromotionSuccessOpen(true);
    } catch (err) {
      console.error('❌ Failed to add customer as staff:', err);
      alert(
        err?.message ||
        tr(
          'Unable to add this customer as staff. Check the email and try again.',
          'Impossible d’ajouter ce client comme membre du personnel. Vérifiez l’email et réessayez.'
        )
      );
    } finally {
      setPromotingCustomerToStaff(false);
    }
  };

  // Mobile action handlers
  const handleMobileDelete = (customer) => {
    if (user?.role !== 'owner') {
      alert('Only owners can delete customers or linked rentals.');
      return;
    }
    openDeleteModal(customer);
  };

  if (loading && !fullPageViewOpen) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          className="w-full"
          eyebrow={tr('Customer Management', 'Gestion clients')}
          title={tr('Customer Management', 'Gestion clients')}
          description={tr('Preparing the customer workspace...', 'Préparation de l’espace clients...')}
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">{tr('Loading dashboard...', 'Chargement du tableau de bord...')}</p>
              <p className="mt-2 text-sm text-slate-500">{tr('Preparing customer records and profile data.', 'Préparation des fiches clients et des données de profil.')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fullPageViewOpen) {
    if (profileLoading || !detailedCustomer) {
      return (
        <div className="min-h-screen bg-gray-50">
          <AdminModuleHero
            className="w-full"
            eyebrow={tr('Customer Management', 'Gestion clients')}
            title={tr('Customer Profile', 'Profil client')}
            description={tr('Preparing the customer profile...', 'Préparation du profil client...')}
          />
          <div className="max-w-7xl mx-auto p-6">
            <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-4 text-4xl animate-spin">⏳</div>
                <p className="text-base font-medium text-slate-700">{tr('Loading customer profile...', 'Chargement du profil client...')}</p>
                <p className="mt-2 text-sm text-slate-500">{tr('Preparing documents, history, and profile details.', 'Préparation des documents, de l’historique et des détails du profil.')}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const idImages = detailedCustomerIdImages;
    const hasRealImages = idImages.some(img => img.isCustomerImage && !img.isFallback);
    const customerStaffEmail = getCustomerStaffEmail(detailedCustomer);
    const isCustomerStaffMember = Boolean(
      detailedCustomer?.scan_metadata?.staff_user_id ||
      detailedCustomer?.scan_metadata?.staff_role
    );
    
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <div className="mb-8">
            <div className="mb-6 flex items-center">
              <button
                onClick={() => setFullPageViewOpen(false)}
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 px-4 py-2 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
              </button>
            </div>
            <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                      {tr('Customer Profile', 'Profil client')}
                    </span>
                    {detailedCustomer?.scan_metadata?.show_admin_note_alert && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">
                        🚨 {tr('Active Alert Note', 'Alerte note active')}
                      </span>
                    )}
                    {detailedCustomer.scan_metadata?.is_banned && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-800">
                        {tr('Restricted', 'Restreint')}
                      </span>
                    )}
                    {isCustomerStaffMember && (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                        {tr('Staff member', 'Membre du personnel')}
                        {detailedCustomer?.scan_metadata?.staff_role ? ` · ${detailedCustomer.scan_metadata.staff_role}` : ''}
                      </span>
                    )}
                    {isCustomerAppAccount(detailedCustomer) && (
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
                        {tr('App account', 'Compte app')}
                      </span>
                    )}
                  </div>
                  <div>
                    <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                      {detailedCustomer.full_name || detailedCustomer.raw_name || tr('Unknown customer', 'Client inconnu')}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {tr('Complete customer profile, note history, alerts, rental history, and linked documents.', 'Profil client complet, historique des notes, alertes, historique des locations et documents liés.')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                      <span className={ADMIN_EYEBROW_CLASS}>{tr('Phone', 'Téléphone')}</span>
                      <div className="mt-1 font-semibold text-slate-800">{detailedCustomer.phone || tr('Not provided', 'Non renseigné')}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                      <span className={ADMIN_EYEBROW_CLASS}>Email</span>
                      <div className="mt-1 font-semibold text-slate-800">{customerStaffEmail || tr('Not provided', 'Non renseigné')}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                      <span className={ADMIN_EYEBROW_CLASS}>{tr('Rentals', 'Locations')}</span>
                      <div className="mt-1 font-semibold text-slate-800">{(detailedCustomer.rentalHistory || []).length}</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {user?.role === 'owner' && (
                    <button
                      type="button"
                      onClick={isCustomerStaffMember ? () => navigate('/admin/users') : handleAddCustomerAsStaff}
                      disabled={promotingCustomerToStaff || (!isCustomerStaffMember && !customerStaffEmail)}
                      title={!isCustomerStaffMember && !customerStaffEmail ? tr('This customer needs an email before they can be added as staff.', 'Ce client doit avoir un email avant de pouvoir être ajouté au personnel.') : undefined}
                      className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isCustomerStaffMember
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : customerStaffEmail
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {promotingCustomerToStaff
                        ? tr('Adding...', 'Ajout...')
                        : isCustomerStaffMember
                          ? tr('Open staff profile', 'Ouvrir le profil personnel')
                          : customerStaffEmail
                            ? tr('Add as staff', 'Ajouter au personnel')
                            : tr('Needs email to add staff', 'Email requis pour ajouter')}
                    </button>
                  )}
                  {canCurrentUserEditCustomerProfile && (
                    <button
                      onClick={() => openEditModal(detailedCustomer)}
                      className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {tr('Edit Profile', 'Modifier le profil')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {detailedCustomer?.scan_metadata?.show_admin_note_alert && detailedCustomer?.scan_metadata?.admin_note && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚨</span>
                <h2 className="text-base font-semibold text-amber-900">{tr('Active Rental Alert Note', "Note d'alerte location active")}</h2>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-amber-800">
                {detailedCustomer.scan_metadata.admin_note}
              </p>
            </div>
          )}

          {detailedCustomer.scan_metadata?.is_banned && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-red-900">{tr('Banned Customer', 'Client banni')}</h2>
                  <p className="text-sm text-red-700 mt-1">
                    {tr('This customer should not be allowed to rent until the team has reviewed the profile note below.', "Ce client ne doit pas être autorisé à louer tant que l'équipe n'a pas examiné la note de profil ci-dessous.")}
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                  {tr('Rental Block', 'Blocage location')}
                </span>
              </div>
              {detailedCustomer.scan_metadata?.ban_note && (
                <p className="mt-3 text-sm text-red-800">
                  {detailedCustomer.scan_metadata.ban_note}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-1 space-y-6">
              {/* ENHANCED ID Document Scans Section */}
              <div className={PROFILE_SECTION_CLASS}>
                <div className="flex justify-between items-center mb-4 md:mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">{tr('ID Document Scans', "Scans des documents d'identité")}</h2>
                  <span className={`text-xs px-2 py-1 rounded-full ${hasRealImages ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {idImages.length} {tr(idImages.length !== 1 ? 'documents' : 'document', idImages.length !== 1 ? 'documents' : 'document')}
                  </span>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 md:p-4">
                  <input
                    ref={customerScanInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadCustomerScan}
                  />
                  <MemoizedImageGallery 
                    images={idImages}
                    title={tr('ID Document', "Document d'identité")}
                    emptyMessage={
                      <div className="text-center py-6 md:py-8">
                        <div className="mx-auto w-10 h-10 md:w-12 md:h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                          <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 font-medium">{tr('No ID scan uploaded', "Aucun scan d'identité téléversé")}</p>
                        <p className="text-gray-400 text-xs md:text-sm mt-1">{tr('Upload ID documents for verification', "Téléversez les documents d'identité pour vérification")}</p>
                      </div>
                    }
                    gridLayout={false}
                  />
                </div>
                
                {/* Status indicator */}
                <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full mr-2 ${hasRealImages ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                      <span className="text-xs md:text-sm text-gray-600">
                        {hasRealImages ? tr('ID documents verified', "Documents d'identité vérifiés") : tr('Identity verification pending', "Vérification d'identité en attente")}
                      </span>
                    </div>
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                      onClick={() => customerScanInputRef.current?.click()}
                      disabled={uploadingCustomerScan}
                    >
                      {uploadingCustomerScan ? tr('Uploading...', 'Téléversement...') : tr('+ Upload New', '+ Téléverser un nouveau')}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Additional Documents */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Additional Documents', 'Documents supplémentaires')}</h2>
                {(() => {
                  return detailedCustomerAdditionalDocs.length > 0 ? (
                    <MemoizedImageGallery 
                      images={detailedCustomerAdditionalDocs}
                      title={tr('Additional Document', 'Document supplémentaire')}
                      emptyMessage={tr('No additional documents', 'Aucun document supplémentaire')}
                      gridLayout={false}
                    />
                  ) : (
                    <div className="bg-gray-100 rounded-lg p-6 md:p-8 text-center">
                      <div className="mx-auto w-10 h-10 md:w-12 md:h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm md:text-base">{tr('No additional documents', 'Aucun document supplémentaire')}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {/* Personal Information */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Personal Information', 'Informations personnelles')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField(tr('Full Name', 'Nom complet'), detailedCustomer.full_name)}
                  {renderField(tr('Customer ID', 'ID client'), detailedCustomer.id)}
                  {renderField(tr('First Name', 'Prénom'), detailedCustomer.first_name || detailedCustomer.given_name)}
                  {renderField(tr('Last Name', 'Nom'), detailedCustomer.last_name || detailedCustomer.family_name)}
                  {renderField(tr('Middle Name', 'Deuxième prénom'), detailedCustomer.middle_name)}
                  {renderField(tr('Given Name', 'Nom donné'), detailedCustomer.given_name)}
                  {renderField(tr('Family Name', 'Nom de famille'), detailedCustomer.family_name)}
                  {renderField(tr('Raw Name', 'Nom brut'), detailedCustomer.raw_name)}
                  {renderField(tr('Date of Birth', 'Date de naissance'), detailedCustomer.date_of_birth, formatFullDate)}
                  {renderField(tr('Place of Birth', 'Lieu de naissance'), detailedCustomer.place_of_birth)}
                  {renderField(tr('Nationality', 'Nationalité'), detailedCustomer.nationality)}
                  {renderField(tr('Country', 'Pays'), detailedCustomer.country)}
                  {renderField(tr('Gender', 'Genre'), detailedCustomer.gender)}
                  {renderField(tr('City', 'Ville'), detailedCustomer.city)}
                  {renderField(tr('Postal Code', 'Code postal'), detailedCustomer.postal_code)}
                  {renderField(tr('Customer Type', 'Type de client'), detailedCustomer.customer_type)}
                </div>
                {!detailedCustomer.full_name && 
                 !detailedCustomer.first_name && 
                 !detailedCustomer.last_name && 
                 !detailedCustomer.date_of_birth && 
                 !detailedCustomer.nationality && 
                 !detailedCustomer.place_of_birth && 
                 !detailedCustomer.country && 
                 !detailedCustomer.gender && 
                 !detailedCustomer.city && 
                 !detailedCustomer.postal_code && 
                 !detailedCustomer.customer_type && (
                  <p className="text-gray-500 text-sm">{tr('No personal information available.', 'Aucune information personnelle disponible.')}</p>
                )}
              </div>

              {/* Contact & Legal Information */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Contact & Legal Information', 'Informations de contact et légales')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField(tr('Email', 'Email'), detailedCustomer.email)}
                  {renderField(tr('Phone', 'Téléphone'), detailedCustomer.phone)}
                  {renderField(tr('Address', 'Adresse'), detailedCustomer.address)}
                  {renderField(tr('Secondary Address', 'Adresse secondaire'), detailedCustomer.secondary_address)}
                  {renderField(tr('License Number', 'Numéro de permis'), detailedCustomer.licence_number)}
                  {renderField(tr('ID Number', "Numéro d'identité"), detailedCustomer.id_number)}
                  {renderField(tr('Secondary ID Number', "Numéro d'identité secondaire"), detailedCustomer.secondary_id_number)}
                  {renderField(tr('Document Number', 'Numéro du document'), detailedCustomer.document_number)}
                </div>
                {!detailedCustomer.email && 
                 !detailedCustomer.phone && 
                 !detailedCustomer.address && 
                 !detailedCustomer.secondary_address && 
                 !detailedCustomer.licence_number && 
                 !detailedCustomer.id_number && 
                 !detailedCustomer.secondary_id_number && 
                 !detailedCustomer.document_number && (
                  <p className="text-gray-500 text-sm">{tr('No contact or legal information available.', 'Aucune information de contact ou légale disponible.')}</p>
                )}
              </div>

              {/* Document & License Information */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Document & License Information', 'Informations document et permis')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField(tr('Document Type', 'Type de document'), detailedCustomer.document_type)}
                  {renderField(tr('License Class', 'Catégorie de permis'), detailedCustomer.license_class)}
                  {renderField(tr('Issue Date', "Date d'émission"), detailedCustomer.issue_date || detailedCustomer.licence_issue_date, formatFullDate)}
                  {renderField(tr('Expiry Date', "Date d'expiration"), detailedCustomer.expiry_date || detailedCustomer.licence_expiry_date, formatFullDate)}
                  {renderField(tr('Issuing Authority', 'Autorité émettrice'), detailedCustomer.issuing_authority)}
                  {renderField(tr('MRZ', 'MRZ'), detailedCustomer.mrz)}
                  {renderField(tr('Confidence Estimate', 'Estimation de confiance'), detailedCustomer.confidence_estimate, (v) => `${(v * 100).toFixed(1)}%`)}
                  {renderField(tr('Scan Confidence', 'Confiance du scan'), detailedCustomer.scan_confidence, (v) => `${(v * 100).toFixed(1)}%`)}
                  {renderField(tr('Initial Scan Complete', 'Scan initial terminé'), detailedCustomer.initial_scan_complete, (v) => v ? tr('Yes', 'Oui') : tr('No', 'Non'))}
                  {renderField(tr('Data Source', 'Source des données'), detailedCustomer.data_source)}
                  {renderField(tr('Created By', 'Créé par'), detailedCustomer.created_by)}
                  {renderField(tr('Last Scan At', 'Dernier scan le'), detailedCustomer.last_scan_at, formatDate)}
                </div>
                {!detailedCustomer.document_type && 
                 !detailedCustomer.license_class && 
                 !detailedCustomer.issue_date && 
                 !detailedCustomer.licence_issue_date && 
                 !detailedCustomer.expiry_date && 
                 !detailedCustomer.licence_expiry_date && 
                 !detailedCustomer.issuing_authority && 
                 !detailedCustomer.mrz && 
                 detailedCustomer.confidence_estimate === null && 
                 detailedCustomer.scan_confidence === null && 
                 detailedCustomer.initial_scan_complete === null && 
                 !detailedCustomer.data_source && 
                 !detailedCustomer.created_by && 
                 !detailedCustomer.last_scan_at && (
                  <p className="text-gray-500 text-sm">{tr('No document or license information available.', 'Aucune information de document ou de permis disponible.')}</p>
                )}
              </div>

              {/* System Information */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('System Information', 'Informations système')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField(tr('Created At', 'Créé le'), detailedCustomer.created_at, formatDate)}
                  {renderField(tr('Updated At', 'Mis à jour le'), detailedCustomer.updated_at, formatDate)}
                </div>
                {!detailedCustomer.created_at && !detailedCustomer.updated_at && (
                  <p className="text-gray-500 text-sm">{tr('No system information available.', 'Aucune information système disponible.')}</p>
                )}
              </div>

              <div className={PROFILE_SECTION_CLASS}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{tr('Rental Restriction', 'Restriction de location')}</h2>
                    <p className="text-sm text-gray-500 mt-1">{tr('Flag this customer as banned and save the reason for staff.', 'Signalez ce client comme banni et enregistrez la raison pour le personnel.')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {detailedCustomer.scan_metadata?.is_banned ? (
                      <button
                        onClick={handleSaveCustomerBanNote}
                        disabled={savingCustomerBan}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {savingCustomerBan ? tr('Saving...', 'Enregistrement...') : tr('Save Ban Note', 'Enregistrer la note de bannissement')}
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleToggleCustomerBan(!detailedCustomer.scan_metadata?.is_banned)}
                      disabled={savingCustomerBan || (detailedCustomer.scan_metadata?.is_banned && !canCurrentUserManageBan)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                        detailedCustomer.scan_metadata?.is_banned
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {savingCustomerBan
                        ? tr('Saving...', 'Enregistrement...')
                        : detailedCustomer.scan_metadata?.is_banned
                          ? tr('Remove Ban', 'Retirer le bannissement')
                          : tr('Mark as Banned', 'Marquer comme banni')}
                    </button>
                  </div>
                </div>
                {detailedCustomer.scan_metadata?.is_banned && !canCurrentUserManageBan ? (
                  <p className="mb-3 text-xs font-medium text-slate-500">
                    {tr('Only an admin or owner can remove this ban.', 'Seul un administrateur ou le propriétaire peut retirer ce bannissement.')}
                  </p>
                ) : null}
                <textarea
                  key={`ban-note-${selectedCustomerId || 'none'}-${detailedCustomer?.updated_at || 'draft'}`}
                  ref={customerBanTextareaRef}
                  defaultValue={customerBanNote}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder={tr('Explain why this customer is banned or should be monitored closely...', 'Expliquez pourquoi ce client est banni ou doit être surveillé attentivement...')}
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{tr('Internal Notes', 'Notes internes')}</h2>
                    <p className="text-sm text-gray-500 mt-1">{tr('Write manual internal notes and optionally show the latest one when creating a rental.', "Rédigez des notes internes manuelles et affichez éventuellement la plus récente lors de la création d'une location.")}</p>
                  </div>
                  <button
                    onClick={handleSaveCustomerNote}
                    disabled={savingCustomerNote}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {savingCustomerNote ? tr('Saving...', 'Enregistrement...') : tr('Save Note', 'Enregistrer la note')}
                  </button>
                </div>
                <textarea
                  key={`profile-note-${selectedCustomerId || 'none'}-${detailedCustomer?.updated_at || 'draft'}`}
                  ref={customerNoteTextareaRef}
                  defaultValue={customerProfileNote}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder={tr('Add a manual internal note about this customer...', 'Ajouter une note interne manuelle à propos de ce client...')}
                />
                <label
                  className="mt-3 flex items-center gap-3 text-sm font-medium text-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    key={`profile-note-alert-${selectedCustomerId || 'none'}-${detailedCustomer?.updated_at || 'draft'}`}
                    ref={customerAlertCheckboxRef}
                    type="checkbox"
                    onClick={(e) => e.stopPropagation()}
                    defaultChecked={Boolean(detailedCustomer?.scan_metadata?.show_admin_note_alert)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {tr('Show this note as a rental alert pop-up when the customer is selected', "Afficher cette note comme pop-up d'alerte location lorsque le client est sélectionné")}
                </label>
                {customerNoteHistory.length > 0 && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{tr('Staff Note History', 'Historique des notes du personnel')}</h3>
                    <div className="mt-3 space-y-3">
                      {customerNoteHistory.slice(0, 5).map((note) => (
                        <div key={note.id || `${note.created_at}-${note.note_text}`} className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500">
                                {note.created_by_name || tr('Team', 'Équipe')} • {formatDate(note.created_at)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {note.is_alert && (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                                  {tr('Rental Alert', 'Alerte location')}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomerNote(note.id)}
                                disabled={savingCustomerNote}
                                className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                {tr('Delete', 'Supprimer')}
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{note.note_text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Rental History */}
              <div className={PROFILE_SECTION_CLASS}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{tr('Rental History', 'Historique des locations')} ({(detailedCustomer.rentalHistory || []).length} {tr('rentals', 'locations')})</h2>
                {(detailedCustomer.rentalHistory || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">{tr('No rental history available.', 'Aucun historique de location disponible.')}</p>
                ) : (
                  <div className="space-y-3">
                    {(detailedCustomer.rentalHistory || []).map((r) => {
                      const amount = r.total_amount ?? r.amount ?? 0;
                      const status = r.rental_status || r.status;
                      const bookedDate = r.created_at;
                      const isImpounded = Boolean(r.is_impounded);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openRentalFromHistory(r.id)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition-all duration-200 hover:border-violet-200 hover:bg-white hover:shadow-[0_12px_24px_-20px_rgba(79,70,229,0.45)] focus:outline-none focus:ring-2 focus:ring-violet-200"
                        >
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                            <div>
                              <p className="font-medium text-gray-900">{r.vehicle?.name || tr('Unknown vehicle', 'Véhicule inconnu')}</p>
                              <div className="mt-1 flex items-center gap-2 text-xs md:text-sm text-violet-700 break-all">
                                {r.rental_id ? `${tr('Rental', 'Location')} #${r.rental_id}` : `${tr('Rental', 'Location')} : ${r.id?.slice(0, 8)}...`}
                                <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                  {tr('Tap to open', 'Appuyer pour ouvrir')}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`self-start px-2 py-1 text-xs font-semibold rounded-full ${
                                status === 'active' ? 'bg-green-100 text-green-800' : 
                                status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                                'bg-gray-100 text-gray-800'
                              }`}>{status || 'N/A'}</span>
                              {isImpounded && (
                                <span className="self-start rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                                  🚨 {tr('Impounded', 'En fourrière')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs md:text-sm text-gray-600">
                            <div><span className="font-medium">{tr('Start:', 'Début :')}</span> {formatDate(r.rental_start_date)}</div>
                            <div><span className="font-medium">{tr('End:', 'Fin :')}</span> {formatDate(r.rental_end_date)}</div>
                            <div><span className="font-medium">{tr('Amount:', 'Montant :')}</span> {formatCurrency(amount)}</div>
                            <div><span className="font-medium">{tr('Booked On:', 'Réservé le :')}</span> {formatDate(bookedDate)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {editModalOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex min-h-screen items-center justify-center px-4 py-6 text-center">
                <div
                  className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                  onClick={() => {
                    if (!actionLoading) {
                      setEditModalOpen(false);
                    }
                  }}
                />

                <div className="relative inline-block w-full max-w-2xl overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl transition-all">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <h3 className="text-xl font-semibold text-slate-900">{tr('Edit Customer Profile', 'Modifier le profil client')}</h3>
                    <p className="mt-1 text-sm text-slate-500">{tr('Update personal information directly from the customer profile.', 'Mettez à jour les informations personnelles directement depuis le profil client.')}</p>
                  </div>

                  <div className="max-h-[80vh] overflow-y-auto px-6 py-5 space-y-5">
                    {hasScannedIdentityData && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {tr('This customer was created from a scanned identity document. Name, nationality, date of birth, and license number are locked. Contact details like phone, email, and address can still be updated.', "Ce client a été créé à partir d'une pièce d'identité scannée. Le nom, la nationalité, la date de naissance et le numéro de permis sont verrouillés. Les coordonnées comme le téléphone, l'e-mail et l'adresse peuvent toujours être mises à jour.")}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Full Name', 'Nom complet')}</label>
                        <input
                          type="text"
                          value={editFormData.full_name || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, full_name: e.target.value }))}
                          disabled={hasScannedIdentityData}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Email', 'Email')}</label>
                        <input
                          type="email"
                          value={editFormData.email || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </div>
                    </div>

                    <CustomerPhoneInput
                      label={tr('Phone', 'Téléphone')}
                      value={editFormData.phone || ''}
                      onChange={(nextValue) => setEditFormData(prev => ({ ...prev, phone: nextValue }))}
                      disabled={actionLoading}
                    />

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Nationality', 'Nationalité')}</label>
                        <input
                          type="text"
                          value={editFormData.nationality || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, nationality: e.target.value }))}
                          disabled={hasScannedIdentityData}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Place of Birth', 'Lieu de naissance')}</label>
                        <input
                          type="text"
                          value={editFormData.place_of_birth || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, place_of_birth: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Date of Birth', 'Date de naissance')}</label>
                        <input
                          type="date"
                          value={editFormData.date_of_birth || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                          disabled={hasScannedIdentityData}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('License Number', 'Numéro de permis')}</label>
                        <input
                          type="text"
                          value={editFormData.licence_number || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, licence_number: e.target.value }))}
                          disabled={hasScannedIdentityData}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('ID Number', "Numéro d'identité")}</label>
                        <input
                          type="text"
                          value={editFormData.id_number || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, id_number: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">{tr('Address', 'Adresse')}</label>
                        <input
                          type="text"
                          value={editFormData.address || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, address: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setEditModalOpen(false)}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleEditCustomer}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {actionLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <AdminModuleHero
        className="w-full"
        icon={<Users className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Gestion des clients' : 'Customer Management'}
        title={isFrench ? 'Vue d’ensemble des clients' : 'Customer Overview'}
        description={isFrench ? 'Gérez les profils clients, les notes, l’historique des locations et les alertes depuis un espace unifié.' : 'Manage customer profiles, notes, rental history, and alerts from one unified workspace.'}
        actions={
          <div className={ADMIN_OUTLINE_BUTTON_CLASS}>
            <User className="h-4 w-4" />
            {aggregatedData.summary.totalCustomers} {isFrench ? (aggregatedData.summary.totalCustomers === 1 ? 'client' : 'clients') : `customer${aggregatedData.summary.totalCustomers === 1 ? '' : 's'}`}
          </div>
        }
      />

      <div className="mt-6 grid gap-6 px-4 sm:px-6 lg:px-8">
        <section className={ADMIN_MAIN_CARD_CLASS}>
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-900">{isFrench ? 'Types de comptes' : 'Account types'}</h2>
            <p className="text-sm text-slate-500">
              {isFrench
                ? 'Filtrez, modérez et gérez les comptes sans quitter la page.'
                : 'Filter, moderate, and manage accounts without leaving the page.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: isFrench ? 'Tous les comptes' : 'All Accounts', count: aggregatedData.summary.totalCustomers, activeClass: 'bg-slate-950 text-white' },
              { key: 'customer', label: isFrench ? 'Clients' : 'Customers', count: aggregatedData.summary.customerAccounts, activeClass: 'bg-violet-600 text-white' },
              { key: 'private_owner', label: isFrench ? 'Propriétaires privés' : 'Private Owners', count: aggregatedData.summary.privateOwners, activeClass: 'bg-violet-600 text-white' },
              { key: 'business_owner', label: isFrench ? 'Propriétaires business' : 'Business Owners', count: aggregatedData.summary.businessOwners, activeClass: 'bg-violet-600 text-white' },
            ].map((option) => {
              const active = accountTypeFilter === option.key;
              const countClass = active ? 'bg-white/20 text-white' : 'bg-white text-slate-600';

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setAccountTypeFilter(option.key)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    active
                      ? option.activeClass
                      : 'border border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{option.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${countClass}`}>
                    {option.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Mobile: Filter Toggle Button */}
        {isMobile && (
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="flex w-full items-center justify-between rounded-[28px] border border-slate-200 bg-white px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
          >
            <span className="flex items-center text-sm font-medium text-slate-700">
              <Filter className="w-4 h-4 mr-2" />
              {isFrench ? 'Filtres et recherche' : 'Filters & Search'}
            </span>
            {showMobileFilters ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
          </button>
        )}

        <section className={`${ADMIN_MAIN_CARD_CLASS} ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{isFrench ? 'Recherche et filtres' : 'Search and filters'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isFrench ? 'Affinez la liste par statut, nationalité ou activité.' : 'Refine the list by status, nationality, or activity.'}
            </p>
          </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  id="customerSearch"
                  name="customerSearch"
                  placeholder={isFrench ? 'Rechercher par nom ou email...' : 'Search by name or email...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </div>
              <select
                id="statusFilter"
                name="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                <option value="All">{isFrench ? 'Tous les statuts' : 'All Statuses'}</option>
                <option value="pending">{isFrench ? 'En attente' : 'Pending approval'}</option>
                <option value="approved">{isFrench ? 'Approuvé' : 'Approved'}</option>
                <option value="rejected">{isFrench ? 'Rejeté' : 'Rejected'}</option>
                <option value="needs_info">{isFrench ? 'Infos requises' : 'Needs Info'}</option>
                <option value="on_trial">{isFrench ? 'En essai' : 'On trial'}</option>
                <option value="active_subscription">{isFrench ? 'Abonnement actif' : 'Active subscription'}</option>
                <option value="expired">{isFrench ? 'Expiré' : 'Expired'}</option>
                <option value="suspended">{isFrench ? 'Suspendu' : 'Suspended'}</option>
                <option value="active">{isFrench ? 'Actif' : 'Active'}</option>
                <option value="inactive">{isFrench ? 'Inactif' : 'Inactive'}</option>
              </select>
              <select
                id="nationalityFilter"
                name="nationalityFilter"
                value={nationalityFilter}
                onChange={(e) => setNationalityFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                <option value="All">{isFrench ? 'Toutes les nationalités' : 'All Nationalities'}</option>
                {availableNationalities.map(nat => (
                  <option key={nat} value={nat}>{nat}</option>
                ))}
              </select>
              <button
                onClick={clearFilters}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {isFrench ? 'Réinitialiser' : 'Reset'}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { key: 'pending_approvals', label: isFrench ? 'Approvals en attente' : 'Pending approvals', count: aggregatedData.quickFilterCounts.pendingApprovals },
                { key: 'no_listings', label: isFrench ? 'Sans annonces' : 'No listings', count: aggregatedData.quickFilterCounts.noListings },
                { key: 'no_rentals', label: isFrench ? 'Sans locations' : 'No rentals', count: aggregatedData.quickFilterCounts.noRentals },
                { key: 'inactive_users', label: isFrench ? 'Inactifs' : 'Inactive users', count: aggregatedData.quickFilterCounts.inactiveUsers },
              ].map((filterOption) => {
                const active = quickFilter === filterOption.key;
                const filterCountClass = active ? 'bg-white/20 text-white' : 'bg-white text-slate-600';

                return (
                  <button
                    key={filterOption.key}
                    type="button"
                    onClick={() => setQuickFilter((prev) => prev === filterOption.key ? 'all' : filterOption.key)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{filterOption.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${filterCountClass}`}>
                      {filterOption.count}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setShowCustomersWithoutRentalsReview(true)}
                disabled={actionLoading || eligibleForSelectionCount === 0}
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Users className="mr-2 h-4 w-4" />
                {isFrench ? 'Examiner avant suppression' : 'Review before delete'}
              </button>
            </div>
        </section>

        {selectedRows.length > 0 && (
          <section className={ADMIN_MAIN_CARD_CLASS}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedRows.length} {isFrench ? 'compte(s) sélectionné(s)' : 'selected account(s)'}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedBusinessOwnerRows.length} {isFrench ? 'business owner(s)' : 'business owner(s)'} · {selectedRows.length - selectedBusinessOwnerRows.length} {isFrench ? 'autres comptes' : 'other accounts'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  disabled={actionLoading || selectedBusinessOwnerRows.length === 0}
                  className="inline-flex items-center rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFrench ? 'Approuver la sélection' : 'Approve selected'}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkRejectModalOpen(true)}
                  disabled={actionLoading || selectedBusinessOwnerRows.length === 0}
                  className="inline-flex items-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFrench ? 'Rejeter la sélection' : 'Reject selected'}
                </button>
                <button
                  type="button"
                  onClick={handleBulkDisable}
                  disabled={actionLoading}
                  className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFrench ? 'Désactiver la sélection' : 'Disable selected'}
                </button>
              </div>
            </div>
          </section>
        )}

        {accountTypeFilter === 'business_owner' ? (
          <div className="space-y-4">
            <div className={ADMIN_MAIN_CARD_CLASS}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">
                    {isFrench ? 'Contrôle SaaS business owner' : 'Business Owner SaaS Control'}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    {isFrench ? 'Activation, plans, essais et cycle de vie' : 'Activation, plans, trials, and lifecycle'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isFrench
                      ? "Gérez l'approbation, la suspension, les essais et les forfaits depuis un tableau de contrôle compact."
                      : 'Manage approval, suspension, trial access, and plans from one compact control table.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-700">
                  {businessOwnerRows.length} {isFrench ? 'ligne(s) visible(s)' : 'visible row(s)'}
                </div>
              </div>
            </div>

            <BusinessOwnerSaaSTable
              rows={businessOwnerRows}
              isFrench={isFrench}
              busyAction={businessOwnerActionLoading || (actionLoading ? 'bulk' : '')}
              onApprove={handleApproveBusinessOwner}
              onReject={openRejectBusinessOwnerModal}
              onSuspend={handleSuspendBusinessOwner}
              onReactivate={handleReactivateBusinessOwner}
              onExtendTrial={handleExtendBusinessOwnerTrial}
              onActivateSubscription={handleActivateBusinessOwnerSubscription}
              onChangePlan={handleChangeBusinessOwnerPlan}
              onOpenWorkspace={handleOpenBusinessOwnerWorkspace}
              onOpenProfile={openFullPageView}
              canManageProvisioning={canAccessBusinessOwnerRegistry}
              onStartProvisioning={handleStartTenantProvisioning}
              onCompleteProvisioning={handleCompleteTenantProvisioning}
              onFailProvisioning={handleFailTenantProvisioning}
            />
          </div>
        ) : !isMobile ? (
          <div className="relative overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/90">
                  <tr>
                    <th scope="col" className="p-4 text-left w-12">
                      <input
                        type="checkbox"
                        ref={headerCheckboxRef}
                        onChange={handleSelectAll}
                        disabled={paginatedCustomers.length === 0}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Utilisateur' : 'User'}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Type' : 'Type'}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Contact' : 'Contact'}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Statut' : 'Status'}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Activité' : 'Activity'}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {isFrench ? 'Actions' : 'Actions'}
                    </th>
                    <th scope="col" className="hidden">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <Users className="w-12 h-12 text-slate-300 mb-3" />
                          <p className="font-semibold text-slate-600">{isFrench ? 'Aucun client trouvé' : 'No customers found'}</p>
                          <p className="mt-1 text-sm text-slate-400">{isFrench ? 'Essayez d’ajuster vos filtres ou votre recherche' : 'Try adjusting your filters or search terms'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <tr
                        key={customer.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        onClick={() => openFullPageView(customer)}
                      >
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedCustomerIds.includes(customer.id)}
                            onChange={() => handleSelectCustomer(customer.id)}
                            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className={`h-10 w-10 rounded-full text-white flex items-center justify-center font-bold shadow-sm ${getCustomerAvatarPalette(customer)}`}>
                                {getInitial(customer.full_name)}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {customer.full_name || (isFrench ? 'Client inconnu' : 'Unknown Customer')}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {customer.nationality || (isFrench ? 'Pas de pays' : 'No nationality')} · {formatDate(customer.created_at)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getExternalAccountTypeMeta(customer.externalAccountType, isFrench).badgeClass}`}>
                            {getExternalAccountTypeMeta(customer.externalAccountType, isFrench).label}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-medium text-slate-900">{customer.email || (isFrench ? 'Pas d’email' : 'No email')}</div>
                          <div className="text-xs text-slate-500">{customer.phone || (isFrench ? 'Pas de téléphone' : 'No phone')}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col items-start gap-1.5">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${customer.unifiedStatusMeta.badgeClass}`}>
                              {customer.unifiedStatusMeta.label}
                            </span>
                            {customer.isBanned ? (
                              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                                {isFrench ? 'Désactivé' : 'Disabled'}
                              </span>
                            ) : null}
                            {customer.hasActiveAlertNote ? (
                              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                {isFrench ? 'Alerte' : 'Flagged'}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1.5 text-xs text-slate-600">
                            <div className="font-semibold text-slate-900">
                              {customer.listingsCount || 0} {isFrench ? 'annonces' : 'listings'}
                            </div>
                            <div>
                              {customer.totalRentals} {isFrench ? 'locations' : 'rentals'}
                            </div>
                            <div>
                              {customer.lastActivityAt
                                ? `${isFrench ? 'Dernière activité' : 'Last active'} ${formatDate(customer.lastActivityAt)}`
                                : (isFrench ? 'Aucune activité' : 'No activity')}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            {customer.externalAccountType === 'business_owner' && ['pending', 'needs_info', 'rejected'].includes(String(customer.approvalStatus || '').toLowerCase()) ? (
                              <button
                                type="button"
                                onClick={() => handleApproveBusinessOwner(customer)}
                                disabled={Boolean(businessOwnerActionLoading)}
                                className="rounded-2xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {isFrench ? 'Approuver' : 'Approve'}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => openFullPageView(customer)}
                              className="rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              {isFrench ? 'Voir' : 'View'}
                            </button>

                            <CustomerRowActionMenu
                              actions={[
                                customer.externalAccountType === 'business_owner' && String(customer.approvalStatus || '').toLowerCase() !== 'rejected'
                                  ? {
                                      key: 'reject',
                                      label: 'Reject',
                                      tone: 'danger',
                                      disabled: Boolean(businessOwnerActionLoading),
                                      onClick: () => openRejectBusinessOwnerModal(customer),
                                    }
                                  : null,
                                customer.externalAccountType === 'business_owner' && String(customer.approvalStatus || '').toLowerCase() !== 'approved'
                                  ? {
                                      key: 'request-info',
                                      label: 'Request info',
                                      disabled: Boolean(businessOwnerActionLoading),
                                      onClick: () => handleRequestBusinessOwnerInfo(customer),
                                    }
                                  : null,
                                customer.externalAccountType === 'business_owner' && String(customer.approvalStatus || '').toLowerCase() === 'approved'
                                  ? {
                                      key: 'suspend',
                                      label: 'Suspend account',
                                      disabled: Boolean(businessOwnerActionLoading),
                                      onClick: () => handleSuspendBusinessOwner(customer),
                                    }
                                  : null,
                                customer.externalAccountType === 'private_owner'
                                  ? {
                                      key: 'view-listings',
                                      label: 'View listings',
                                      onClick: () => navigate('/admin/marketplace'),
                                    }
                                  : null,
                                customer.externalAccountType !== 'business_owner'
                                  ? {
                                      key: 'disable',
                                      label: 'Disable',
                                      disabled: actionLoading,
                                      onClick: () => handleQuickDisableCustomer(customer),
                                    }
                                  : null,
                                user?.role === 'owner' && customer.totalRentals === 0
                                  ? {
                                      key: 'delete',
                                      label: 'Delete',
                                      tone: 'danger',
                                      onClick: () => openDeleteModal(customer),
                                    }
                                  : null,
                              ].filter(Boolean)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Mobile: Card View */
          <div className="space-y-3">
            {paginatedCustomers.length === 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col items-center">
                  <Users className="mb-3 h-16 w-16 text-slate-300" />
                  <p className="text-lg font-semibold text-slate-600">{isFrench ? 'Aucun client trouvé' : 'No customers found'}</p>
                  <p className="mt-1 text-sm text-slate-400">{isFrench ? 'Essayez d’ajuster vos filtres ou votre recherche' : 'Try adjusting your filters or search terms'}</p>
                </div>
              </div>
            ) : (
              paginatedCustomers.map((customer) => (
                <MobileCustomerCard
                  key={customer.id}
                  customer={customer}
                  onView={openFullPageView}
                  onDelete={handleMobileDelete}
                  isSelected={selectedCustomerIds.includes(customer.id)}
                  onSelect={handleSelectCustomer}
                  canSelect={customer.totalRentals === 0}
                  canDelete={user?.role === 'owner'}
                />
              ))
            )}
          </div>
        )}

        {aggregatedData.customers.length > 0 && (
          <div className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:px-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-600">
                {isFrench ? 'Affichage de ' : 'Showing '}<span className="font-semibold text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span>{isFrench ? ' à ' : ' to '}
                <span className="font-semibold text-slate-900">{Math.min(currentPage * itemsPerPage, aggregatedData.customers.length)}</span> {isFrench ? 'sur ' : 'of '}
                <span className="font-semibold text-slate-900">{aggregatedData.customers.length}</span> {isFrench ? 'clients' : 'customers'}
              </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                <span>{isFrench ? 'Par page' : 'Per page'}</span>
                <select
                  value={itemsPerPage}
                  onChange={(event) => {
                    setItemsPerPage(Number(event.target.value) || 12);
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  {[12, 24, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                  currentPage === 1
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                    : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                }`}
              >
                {isFrench ? 'Précédent' : 'Previous'}
              </button>
              <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2 text-sm font-semibold text-slate-700">
                {isFrench ? `Page ${currentPage} sur ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                  currentPage === totalPages
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                    : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                }`}
              >
                {isFrench ? 'Suivant' : 'Next'}
              </button>
            </div>
            </div>
          </div>
        )}

        {/* View Customer Details Drawer */}
        {viewModalOpen && selectedCustomer && (
          <ViewCustomerDetailsDrawer
            isOpen={viewModalOpen}
            onClose={() => setViewModalOpen(false)}
            customerId={selectedCustomer.id}
          />
        )}

        {showCustomersWithoutRentalsReview && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center px-4 py-8">
              <button
                type="button"
                aria-label={isFrench ? 'Fermer' : 'Close'}
                className="fixed inset-0 bg-slate-900/60"
                onClick={() => setShowCustomersWithoutRentalsReview(false)}
              />

              <div className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                    {isFrench ? 'À examiner' : 'Review first'}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {isFrench ? 'Clients sans location' : 'Customers without rentals'}
                  </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {isFrench
                        ? 'Ces clients n’ont aucune location liée dans la liste actuelle. Ils peuvent être de vrais comptes clients qui n’ont pas encore réservé, donc vérifiez-les avant toute suppression.'
                        : 'These customers have no linked rentals in the current list. They may be legitimate customer signups who have not booked yet, so review them before deleting anything.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomersWithoutRentalsReview(false)}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 md:p-6">
                  {customersWithoutRentals.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                      <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        {isFrench ? 'Aucun client sans location trouvé.' : 'No customers without rentals found.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customersWithoutRentals.map((customer) => (
                        <div
                          key={customer.id}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${getCustomerAvatarPalette(customer)}`}>
                              {getInitial(customer.full_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {customer.full_name || (isFrench ? 'Client inconnu' : 'Unknown customer')}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" />
                                  {customer.email || (isFrench ? 'Pas d’email' : 'No email')}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" />
                                  {customer.phone || (isFrench ? 'Pas de téléphone' : 'No phone')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                              {isFrench ? '0 location' : '0 rentals'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                              {isFrench ? 'Inscrit ' : 'Joined '}{formatDate(customer.created_at)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openFullPageView(customer)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              {isFrench ? 'Voir le profil' : 'View profile'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                  <p className="text-xs leading-5 text-slate-500">
                    {isFrench
                      ? 'La suppression reste disponible, mais seulement après cette vérification.'
                      : 'Deletion is still available, but only after this review step.'}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowCustomersWithoutRentalsReview(false)}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isFrench ? 'Fermer' : 'Close'}
                    </button>
                    <button
                      type="button"
                      onClick={cleanupCustomersWithoutRentals}
                      disabled={actionLoading || customersWithoutRentals.length === 0}
                      className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {actionLoading
                        ? (isFrench ? 'Suppression...' : 'Deleting...')
                        : (isFrench ? `Supprimer après examen (${customersWithoutRentals.length})` : `Delete after review (${customersWithoutRentals.length})`)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 bg-slate-950/60 transition-opacity"
                onClick={() => setDeleteModalOpen(false)}
              ></div>

              <div className="inline-block transform overflow-hidden rounded-[28px] border border-slate-200 bg-white text-left align-bottom shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 sm:mx-0 sm:h-10 sm:w-10">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg font-semibold leading-6 text-slate-900">
                        Supprimer le client
                      </h3>
                      <div className="mt-2">
                        {selectedCustomer?.totalRentals > 0 ? (
                          <>
                            <p className="text-sm text-slate-500">
                              Êtes-vous sûr de vouloir supprimer <span className="font-semibold">{selectedCustomer?.full_name}</span> ?
                            </p>
                            <p className="mt-2 text-sm font-semibold text-rose-700">
                              Ce client est lié à {selectedCustomer.totalRentals} location{selectedCustomer.totalRentals === 1 ? '' : 's'}.
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              La suppression du client est bloquée tant que des locations liées existent encore. Cela protège la maintenance, la finance, le carburant, les médias et les autres enregistrements liés aux locations contre une suppression inattendue.
                            </p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
                              Propriétaire uniquement
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-slate-500">
                              Êtes-vous sûr de vouloir supprimer <span className="font-semibold">{selectedCustomer?.full_name}</span> ?
                              Cette action est irréversible et supprimera définitivement toutes les données du client.
                            </p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
                              Propriétaire uniquement
                            </p>
                          </>
                        )}
                        <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                            Tapez `delete` pour confirmer
                          </p>
                          <p className="mt-1 text-sm text-rose-700">
                            Copiez le mot <span className="font-bold">delete</span> et collez-le ci-dessous pour continuer.
                          </p>
                          <input
                            type="text"
                            value={deleteConfirmationText}
                            onChange={(e) => setDeleteConfirmationText(e.target.value)}
                            placeholder="Tapez delete"
                            className="mt-3 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-white px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    onClick={handleDeleteCustomer}
                    disabled={
                      actionLoading ||
                      selectedCustomer?.totalRentals > 0 ||
                      deleteConfirmationText.trim().toLowerCase() !== 'delete'
                    }
                    className="inline-flex w-full justify-center rounded-2xl border border-transparent bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:ml-3 sm:w-auto disabled:opacity-50"
                  >
                    {selectedCustomer?.totalRentals > 0 ? 'Lié à une location' : actionLoading ? 'Suppression...' : 'Supprimer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setDeleteConfirmationText('');
                    }}
                    disabled={actionLoading}
                    className="mt-3 inline-flex w-full justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 sm:mt-0 sm:ml-3 sm:w-auto disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 bg-slate-950/60 transition-opacity"
                onClick={() => setShowBulkDeleteModal(false)}
              ></div>

              <div className="inline-block transform overflow-hidden rounded-[28px] border border-slate-200 bg-white text-left align-bottom shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 sm:mx-0 sm:h-10 sm:w-10">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg font-semibold leading-6 text-slate-900">
                        Supprimer plusieurs clients
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-slate-500">
                          Êtes-vous sûr de vouloir supprimer les clients sélectionnés ?
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          <span className="font-semibold">Remarque :</span> Seuls les clients sans historique de location peuvent être supprimés. Les clients ayant des locations existantes seront ignorés automatiquement.
                        </p>
                        <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                            Tapez `delete` pour confirmer
                          </p>
                          <p className="mt-1 text-sm text-rose-700">
                            Copiez le mot <span className="font-bold">delete</span> et collez-le ci-dessous pour continuer.
                          </p>
                          <input
                            type="text"
                            value={bulkDeleteConfirmationText}
                            onChange={(e) => setBulkDeleteConfirmationText(e.target.value)}
                            placeholder="Tapez delete"
                            className="mt-3 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-white px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    onClick={confirmBulkDelete}
                    disabled={actionLoading || bulkDeleteConfirmationText.trim().toLowerCase() !== 'delete'}
                    className="inline-flex w-full justify-center rounded-2xl border border-transparent bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:ml-3 sm:w-auto disabled:opacity-50"
                  >
                    {actionLoading ? 'Suppression...' : 'Supprimer la sélection'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkDeleteModal(false);
                      setBulkDeleteConfirmationText('');
                    }}
                    disabled={actionLoading}
                    className="mt-3 inline-flex w-full justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 sm:mt-0 sm:ml-3 sm:w-auto disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {staffRoleModalOpen && detailedCustomer && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_32px_90px_-35px_rgba(15,23,42,0.5)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                  {tr('Add Staff Member', 'Ajouter un membre du personnel')}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {tr('Choose the staff role', 'Choisissez le role du personnel')}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tr(
                    `Select how ${detailedCustomer.full_name || detailedCustomer.email || 'this user'} should access the workspace.`,
                    `Selectionnez comment ${detailedCustomer.full_name || detailedCustomer.email || 'cet utilisateur'} doit acceder a l espace.`
                  )}
                </p>
              </div>

              <div className="space-y-3 px-6 py-5">
                {STAFF_ROLE_OPTIONS.map((roleOption) => {
                  const isActive = pendingStaffRole === roleOption.value;
                  return (
                    <button
                      key={roleOption.value}
                      type="button"
                      onClick={() => setPendingStaffRole(roleOption.value)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                        isActive
                          ? 'border-violet-300 bg-violet-50 shadow-[0_12px_30px_-24px_rgba(124,58,237,0.65)]'
                          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-slate-900">
                            {isFrench ? roleOption.label.fr : roleOption.label.en}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {isFrench ? roleOption.description.fr : roleOption.description.en}
                          </p>
                        </div>
                        <div
                          className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border ${
                            isActive
                              ? 'border-violet-500 bg-violet-500 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isActive ? <CheckCircle className="h-3.5 w-3.5" /> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStaffRoleModalOpen(false)}
                  disabled={promotingCustomerToStaff}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={confirmAddCustomerAsStaff}
                  disabled={promotingCustomerToStaff}
                  className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
                >
                  {promotingCustomerToStaff ? tr('Adding...', 'Ajout...') : tr('Add Staff Member', 'Ajouter le personnel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {staffPromotionSuccessOpen && detailedCustomer && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_32px_90px_-35px_rgba(15,23,42,0.5)]">
              <div className="px-6 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-900">
                  {tr('Customer added as staff', 'Client ajoute au personnel')}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tr(
                    'The account is ready. You can stay on this profile or open User Management to review permissions.',
                    'Le compte est pret. Vous pouvez rester sur ce profil ou ouvrir la gestion des utilisateurs pour verifier les autorisations.'
                  )}
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStaffPromotionSuccessOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  {tr('Stay here', 'Rester ici')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffPromotionSuccessOpen(false);
                    navigate('/admin/users');
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  {tr('Open User Management', 'Ouvrir la gestion des utilisateurs')}
                </button>
              </div>
            </div>
          </div>
        )}

        {businessOwnerRejectModalOpen && pendingBusinessOwner && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_32px_90px_-35px_rgba(15,23,42,0.5)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                  {isFrench ? 'Rejeter le business owner' : 'Reject Business Owner'}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {pendingBusinessOwner.full_name || pendingBusinessOwner.email || (isFrench ? 'Compte business' : 'Business account')}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {isFrench
                    ? 'Expliquez clairement pourquoi cet accès business est refusé.'
                    : 'Explain clearly why this business access request is being rejected.'}
                </p>
              </div>

              <div className="px-6 py-5">
                <label htmlFor="business-owner-reject-reason" className="mb-2 block text-sm font-semibold text-slate-700">
                  {isFrench ? 'Raison du rejet' : 'Rejection reason'}
                </label>
                <textarea
                  id="business-owner-reject-reason"
                  value={businessOwnerRejectReason}
                  onChange={(event) => setBusinessOwnerRejectReason(event.target.value)}
                  placeholder={isFrench ? 'Décrivez la raison du rejet...' : 'Describe the reason for rejection...'}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBusinessOwnerRejectModalOpen(false);
                    setPendingBusinessOwner(null);
                    setBusinessOwnerRejectReason('');
                  }}
                  disabled={Boolean(businessOwnerActionLoading)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={confirmRejectBusinessOwner}
                  disabled={Boolean(businessOwnerActionLoading) || !String(businessOwnerRejectReason || '').trim()}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                >
                  {businessOwnerActionLoading === `reject:${pendingBusinessOwner.id}`
                    ? (isFrench ? 'Rejet...' : 'Rejecting...')
                    : (isFrench ? 'Confirmer le rejet' : 'Confirm rejection')}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkRejectModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_32px_90px_-35px_rgba(15,23,42,0.5)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                  {isFrench ? 'Rejet groupé' : 'Bulk rejection'}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  {isFrench ? 'Rejeter les business owners sélectionnés' : 'Reject selected business owners'}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedBusinessOwnerRows.length} {isFrench ? 'compte(s) business seront mis à jour avec cette raison.' : 'business account(s) will be updated with this reason.'}
                </p>
              </div>

              <div className="px-6 py-5">
                <label htmlFor="bulk-business-owner-reject-reason" className="mb-2 block text-sm font-semibold text-slate-700">
                  {isFrench ? 'Raison du rejet' : 'Rejection reason'}
                </label>
                <textarea
                  id="bulk-business-owner-reject-reason"
                  value={bulkRejectReason}
                  onChange={(event) => setBulkRejectReason(event.target.value)}
                  placeholder={isFrench ? 'Décrivez la raison du rejet...' : 'Describe the reason for rejection...'}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBulkRejectModalOpen(false);
                    setBulkRejectReason('');
                  }}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="button"
                  onClick={handleBulkReject}
                  disabled={actionLoading || !String(bulkRejectReason || '').trim()}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
                >
                  {actionLoading
                    ? (isFrench ? 'Rejet...' : 'Rejecting...')
                    : (isFrench ? 'Confirmer le rejet groupé' : 'Confirm bulk rejection')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add custom animation styles */}
      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default CustomerManagementDashboard;
