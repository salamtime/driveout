import businessOwnersHandler from './_lib/businessOwnersHandler.js';
import tenantProvisioningHandler from './_lib/tenantProvisioningHandler.js';
import tenantSessionHandler from './_lib/tenantSessionHandler.js';
import tenantWorkspaceConfigHandler from './_lib/tenantWorkspaceConfigHandler.js';

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (resource === 'business-owners') {
    return businessOwnersHandler(req, res);
  }

  if (resource === 'session') {
    return tenantSessionHandler(req, res);
  }

  if (resource === 'workspace-config') {
    return tenantWorkspaceConfigHandler(req, res);
  }

  if (!resource || resource === 'provisioning') {
    return tenantProvisioningHandler(req, res);
  }

  return json(res, 404, { error: 'Unknown tenant resource' });
}
