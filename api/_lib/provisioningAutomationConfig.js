const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getRequiredEnv = (key) => {
  const value = String(process.env[key] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const maskSecret = (value = '') => {
  const secret = String(value || '').trim();
  if (!secret) return '';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
};

export const getProvisioningAutomationConfig = () => {
  const supabaseManagementToken = getRequiredEnv('SUPABASE_MANAGEMENT_TOKEN');
  const vercelAccessToken = getRequiredEnv('VERCEL_ACCESS_TOKEN');

  return {
    supabaseManagementToken,
    vercelAccessToken,
    supabaseOrganizationSlug: String(process.env.SUPABASE_ORGANIZATION_SLUG || '').trim(),
    supabaseProjectRegion: String(process.env.SUPABASE_PROJECT_REGION || 'us-east-1').trim(),
    supabaseProjectInstanceSize: String(process.env.SUPABASE_PROJECT_INSTANCE_SIZE || '').trim(),
    vercelTeamSlug: String(process.env.VERCEL_TEAM_SLUG || '').trim(),
    vercelProjectName: String(process.env.VERCEL_PROJECT_NAME || 'rental-system-frontend').trim(),
    tenantRootDomain: String(process.env.TENANT_ROOT_DOMAIN || 'driveout.io').trim(),
    tenantSubdomainMode: String(process.env.TENANT_SUBDOMAIN_MODE || 'wildcard').trim().toLowerCase(),
    tenantSignupMode: String(process.env.TENANT_SIGNUP_MODE || 'automatic').trim().toLowerCase(),
    tenantTrialDays: toPositiveInteger(process.env.TENANT_TRIAL_DAYS, 30),
    tenantDeletionRetentionDays: toPositiveInteger(process.env.TENANT_DELETION_RETENTION_DAYS, 90),
    tenantAutoProvisioningEnabled: toBoolean(process.env.TENANT_AUTO_PROVISIONING_ENABLED, true),
  };
};

export const getProvisioningAutomationConfigStatus = () => {
  try {
    const config = getProvisioningAutomationConfig();
    return {
      configured: true,
      supabaseOrganizationSlug: config.supabaseOrganizationSlug,
      supabaseProjectRegion: config.supabaseProjectRegion,
      supabaseProjectInstanceSize: config.supabaseProjectInstanceSize,
      vercelTeamSlug: config.vercelTeamSlug,
      vercelProjectName: config.vercelProjectName,
      tenantRootDomain: config.tenantRootDomain,
      tenantSubdomainMode: config.tenantSubdomainMode,
      tenantSignupMode: config.tenantSignupMode,
      tenantTrialDays: config.tenantTrialDays,
      tenantDeletionRetentionDays: config.tenantDeletionRetentionDays,
      tenantAutoProvisioningEnabled: config.tenantAutoProvisioningEnabled,
      secrets: {
        supabaseManagementToken: maskSecret(config.supabaseManagementToken),
        vercelAccessToken: maskSecret(config.vercelAccessToken),
      },
    };
  } catch (error) {
    return {
      configured: false,
      error: error.message,
    };
  }
};
