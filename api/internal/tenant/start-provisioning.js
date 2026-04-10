import { runProvisioningDriver } from './provisioning-driver.js';

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const assertInternalSecret = (req) => {
  const expectedSecret = String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) {
    return { ok: false, status: 500, error: 'TENANT_PROVISIONING_WEBHOOK_SECRET is not configured' };
  }

  const header = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token || token !== expectedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized provisioning worker request' };
  }

  return { ok: true };
};

const buildCompletionUrl = (req) => {
  const configuredUrl = String(process.env.TENANT_PROVISIONING_COMPLETE_URL || '').trim();
  if (configuredUrl) return configuredUrl;

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim();
  return host ? `${protocol}://${host}/api/internal/tenant/provisioning-complete` : '/api/internal/tenant/provisioning-complete';
};

const buildDefaultDriverUrl = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim();
  return host ? `${protocol}://${host}/api/internal/tenant/provisioning-driver` : '';
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const secretCheck = assertInternalSecret(req);
  if (!secretCheck.ok) {
    sendJson(res, secretCheck.status, { error: secretCheck.error });
    return;
  }

  const jobId = String(req.body?.job?.id || req.body?.job_id || '').trim();
  const tenantId = String(req.body?.tenant?.id || req.body?.tenant_id || '').trim();
  const businessAccountId = String(req.body?.business_account?.id || req.body?.business_account_id || '').trim();

  if (!jobId || !tenantId || !businessAccountId) {
    sendJson(res, 400, {
      error: 'job.id, tenant.id, and business_account.id are required to start tenant provisioning',
    });
    return;
  }

  console.log('start-provisioning triggered', {
    job_id: jobId,
    tenant_id: tenantId,
    business_account_id: businessAccountId,
  });

  const driverBody = {
    ...req.body,
    job_id: jobId,
    tenant_id: tenantId,
    business_account_id: businessAccountId,
    completion_callback_url: buildCompletionUrl(req),
  };

  try {
    const directResult = await runProvisioningDriver({
      body: driverBody,
      headers: req.headers || {},
      skipAuth: true,
    });

    sendJson(res, directResult.status, {
      ...directResult.body,
      job_id: jobId,
      tenant_id: tenantId,
      completion_callback_url: buildCompletionUrl(req),
      driver_mode: 'internal',
    });
    return;
  } catch (internalError) {
    console.error('Internal provisioning driver call failed; falling back to configured driver URL if available.', internalError);
  }

  const driverUrl = String(process.env.TENANT_PROVISIONING_DRIVER_URL || buildDefaultDriverUrl(req)).trim();

  if (!driverUrl) {
    sendJson(res, 501, {
      error: 'Tenant provisioning driver is not configured. Set TENANT_PROVISIONING_DRIVER_URL to the service that creates the isolated Supabase/Vercel workspace.',
      job_id: jobId,
      tenant_id: tenantId,
      business_account_id: businessAccountId,
      completion_callback_url: buildCompletionUrl(req),
    });
    return;
  }

  let response;
  try {
    response = await fetch(driverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim()}`,
      },
      body: JSON.stringify(driverBody),
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error?.message || 'Tenant provisioning driver request failed',
      job_id: jobId,
      tenant_id: tenantId,
      business_account_id: businessAccountId,
    });
    return;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    sendJson(res, response.status, {
      error: payload?.error || payload?.message || `Tenant provisioning driver failed with ${response.status}`,
      details: payload,
    });
    return;
  }

  sendJson(res, 202, {
    status: 'accepted',
    job_id: jobId,
    tenant_id: tenantId,
    driver: payload,
    completion_callback_url: buildCompletionUrl(req),
  });
}
