import crypto from 'crypto';
import { getProvisioningAutomationConfig } from './provisioningAutomationConfig.js';
import { normalizeTenantSchemaVersion } from './tenantSchemaRelease.js';

const SUPABASE_MANAGEMENT_API_BASE = 'https://api.supabase.com/v1';
const VERCEL_API_BASE = 'https://api.vercel.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeSlugSegment = (value, fallback = 'tenant') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
};

const sanitizeProjectName = (value) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9 -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60);

  return normalized || 'DriveOut Tenant';
};

const maskValue = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return '********';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const createDbPassword = () => crypto.randomBytes(24).toString('base64url');

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const supabaseManagementRequest = async ({ method = 'GET', path, body }) => {
  const config = getProvisioningAutomationConfig();
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.supabaseManagementToken}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readResponse(response);
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Supabase Management API failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const vercelRequest = async ({ method = 'GET', path, body }) => {
  const config = getProvisioningAutomationConfig();
  const response = await fetch(`${VERCEL_API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.vercelAccessToken}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readResponse(response);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error || `Vercel API failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const buildAutomaticTenantSlug = ({ companyName, email, fallbackPrefix = 'tenant' }) => {
  const base =
    sanitizeSlugSegment(companyName) ||
    sanitizeSlugSegment(String(email || '').split('@')[0]) ||
    fallbackPrefix;

  return base.slice(0, 48);
};

export const buildAutomaticTenantDomain = ({ tenantSlug }) => {
  const config = getProvisioningAutomationConfig();
  const slug = sanitizeSlugSegment(tenantSlug);
  return `https://${slug}.${config.tenantRootDomain}`;
};

export const getSupabaseOrganizations = async () => {
  const data = await supabaseManagementRequest({ path: '/organizations' });
  return Array.isArray(data) ? data : [];
};

export const resolveSupabaseOrganizationSlug = async () => {
  const config = getProvisioningAutomationConfig();
  if (config.supabaseOrganizationSlug) {
    return config.supabaseOrganizationSlug;
  }

  const organizations = await getSupabaseOrganizations();
  if (organizations.length === 1) {
    return String(organizations[0]?.slug || '').trim();
  }

  if (organizations.length === 0) {
    throw new Error('No Supabase organizations available for the provisioning token');
  }

  throw new Error('Multiple Supabase organizations are visible. Set SUPABASE_ORGANIZATION_SLUG explicitly.');
};

export const createSupabaseTenantProject = async ({
  companyName,
  tenantSlug,
}) => {
  const config = getProvisioningAutomationConfig();
  const organizationSlug = await resolveSupabaseOrganizationSlug();
  const name = sanitizeProjectName(companyName || tenantSlug);
  const dbPassword = createDbPassword();

  const baseBody = {
    name,
    db_pass: dbPassword,
    organization_slug: organizationSlug,
    region: config.supabaseProjectRegion,
  };

  const requestedInstanceSize = String(config.supabaseProjectInstanceSize || '').trim();
  const withInstanceSize = requestedInstanceSize
    ? {
        ...baseBody,
        desired_instance_size: requestedInstanceSize,
      }
    : baseBody;

  let project;
  try {
    project = await supabaseManagementRequest({
      method: 'POST',
      path: '/projects',
      body: withInstanceSize,
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const shouldRetryWithoutInstanceSize =
      requestedInstanceSize &&
      message.includes('instance size') &&
      message.includes('free plan');

    if (!shouldRetryWithoutInstanceSize) {
      throw error;
    }

    project = await supabaseManagementRequest({
      method: 'POST',
      path: '/projects',
      body: baseBody,
    });
  }

  return {
    project,
    dbPassword,
    organizationSlug,
  };
};

export const getSupabaseProject = async (projectRef) => (
  supabaseManagementRequest({
    path: `/projects/${encodeURIComponent(projectRef)}`,
  })
);

export const waitForSupabaseProjectReady = async (
  projectRef,
  {
    timeoutMs = 15 * 60 * 1000,
    intervalMs = 15 * 1000,
  } = {}
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const project = await getSupabaseProject(projectRef);
    const status = String(project?.status || '').trim().toUpperCase();

    if (status === 'ACTIVE_HEALTHY') {
      return project;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for Supabase project ${projectRef} to become ACTIVE_HEALTHY`);
};

export const getSupabaseProjectApiKeys = async (projectRef, { reveal = true } = {}) => {
  const response = await supabaseManagementRequest({
    path: `/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=${reveal ? 'true' : 'false'}`,
  });

  return Array.isArray(response) ? response : [];
};

export const getSupabaseLegacyAnonKey = async (projectRef) => {
  const keys = await getSupabaseProjectApiKeys(projectRef, { reveal: true });

  const preferred =
    keys.find((entry) => String(entry?.name || '').toLowerCase().includes('anon')) ||
    keys.find((entry) => String(entry?.type || '').toLowerCase() === 'legacy');

  const apiKey = String(preferred?.api_key || '').trim();
  if (!apiKey) {
    throw new Error(`No usable anon/publishable API key found for Supabase project ${projectRef}`);
  }

  return apiKey;
};

export const getVercelProjectDomain = async (domain) => {
  const config = getProvisioningAutomationConfig();
  const encodedDomain = encodeURIComponent(domain);
  const encodedProject = encodeURIComponent(config.vercelProjectName);
  const query = `?slug=${encodeURIComponent(config.vercelTeamSlug)}`;

  return vercelRequest({
    path: `/v9/projects/${encodedProject}/domains/${encodedDomain}${query}`,
  });
};

export const ensureWildcardDomainReady = async () => {
  const config = getProvisioningAutomationConfig();
  const wildcardDomain = `*.${config.tenantRootDomain}`;
  const domain = await getVercelProjectDomain(wildcardDomain);

  return {
    name: domain?.name || wildcardDomain,
    verified: domain?.verified === true,
    projectId: domain?.projectId || null,
  };
};

export const buildAutomaticTenantWorkspace = async ({
  tenantName,
  tenantSlug,
}) => {
  const slug = sanitizeSlugSegment(tenantSlug || tenantName);
  const domainInfo = await ensureWildcardDomainReady();
  const { project, dbPassword, organizationSlug } = await createSupabaseTenantProject({
    companyName: tenantName,
    tenantSlug: slug,
  });

  const projectRef = String(project?.ref || '').trim();
  if (!projectRef) {
    throw new Error('Supabase project creation did not return a project ref');
  }

  const activeProject = await waitForSupabaseProjectReady(projectRef);
  const anonKey = await getSupabaseLegacyAnonKey(projectRef);
  const tenantAppUrl = buildAutomaticTenantDomain({ tenantSlug: slug });

  return {
    tenantSlug: slug,
    tenantName,
    tenantProjectRef: projectRef,
    tenantApiUrl: `https://${projectRef}.supabase.co`,
    tenantAnonKey: anonKey,
    tenantAppUrl,
    tenantDatabaseName: 'postgres',
    schemaVersion: normalizeTenantSchemaVersion(),
    dbPassword,
    organizationSlug,
    supabaseProjectStatus: activeProject?.status || project?.status || null,
    wildcardDomainReady: domainInfo.verified === true,
  };
};

export const getTenantAutomationWorkerStatus = () => {
  const config = getProvisioningAutomationConfig();
  return {
    mode: 'automatic',
    project: config.vercelProjectName,
    teamSlug: config.vercelTeamSlug,
    rootDomain: config.tenantRootDomain,
    signupMode: config.tenantSignupMode,
    trialDays: config.tenantTrialDays,
    deletionRetentionDays: config.tenantDeletionRetentionDays,
    supabaseOrganizationSlug: config.supabaseOrganizationSlug || null,
    supabaseProjectRegion: config.supabaseProjectRegion,
    supabaseProjectInstanceSize: config.supabaseProjectInstanceSize,
    secrets: {
      supabaseManagementToken: maskValue(config.supabaseManagementToken),
      vercelAccessToken: maskValue(config.vercelAccessToken),
    },
  };
};
