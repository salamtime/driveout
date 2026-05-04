import businessOwnersHandler from './_lib/businessOwnersHandler.js';
import {
  handleInternalProvisioningComplete,
  handleInternalProvisioningDriver,
  handleInternalProvisioningStart,
} from './_lib/tenantProvisioningInternal.js';
import tenantProvisioningHandler from './_lib/tenantProvisioningHandler.js';
import tenantSessionHandler from './_lib/tenantSessionHandler.js';
import tenantControlsHandler from './_lib/tenantControlsHandler.js';
import tenantAuditHandler from './_lib/tenantAuditHandler.js';
import tenantWorkspaceConfigHandler from './_lib/tenantWorkspaceConfigHandler.js';
import tenantLifecycleHandler from './_lib/tenantLifecycleHandler.js';
import tenantSchemaHandler from './_lib/tenantSchemaHandler.js';

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const action = String(req.query?.action || '').trim().toLowerCase();

  if (resource === 'business-owners') {
    return businessOwnersHandler(req, res);
  }

  if (resource === 'session') {
    return tenantSessionHandler(req, res);
  }

  if (resource === 'workspace-config') {
    return tenantWorkspaceConfigHandler(req, res);
  }

  if (resource === 'controls') {
    return tenantControlsHandler(req, res);
  }

  if (resource === 'audit') {
    return tenantAuditHandler(req, res);
  }

  if (resource === 'lifecycle') {
    return tenantLifecycleHandler(req, res);
  }

  if (resource === 'schema') {
    return tenantSchemaHandler(req, res);
  }

  if (!resource || resource === 'provisioning') {
    if (action === 'internal-start') {
      return handleInternalProvisioningStart(req, res);
    }

    if (action === 'internal-driver') {
      return handleInternalProvisioningDriver(req, res);
    }

    if (action === 'internal-complete') {
      return handleInternalProvisioningComplete(req, res);
    }

    return tenantProvisioningHandler(req, res);
  }

  return json(res, 404, { error: 'Unknown tenant resource' });
}
