import tenantAuditHandler from './_lib/tenantAuditHandler.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return tenantAuditHandler(req, res);
}
