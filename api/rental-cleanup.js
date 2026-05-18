import { requireOwnerOrAdmin } from './_lib/auth.js';
import { ORGANIZATION_MEMBERS_TABLE } from './_lib/supabase.js';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const SHORT_LINKS_TABLE = process.env.SHORT_LINKS_TABLE || 'short_links';
const PUBLIC_DOCUMENT_SHARES_TABLE = process.env.PUBLIC_DOCUMENT_SHARES_TABLE || 'public_document_shares';
const DOCUMENT_SHARES_BUCKET = process.env.DOCUMENT_SHARES_BUCKET || 'rental-documents';
const DOCUMENT_SHARES_PREFIX = process.env.DOCUMENT_SHARES_PREFIX || 'document-shares';

const json = (res, status, body) => res.status(status).json(body);

const parseRequestBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body;
};

const isMissingRelationError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || error?.details || '').trim().toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
};

const listStoredDocumentShares = async (adminClient) => {
  const { data, error } = await adminClient.storage
    .from(DOCUMENT_SHARES_BUCKET)
    .list(DOCUMENT_SHARES_PREFIX, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    throw new Error(`Failed to list stored document shares: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
};

const deleteTableRowsByRentalId = async (adminClient, tableName, rentalId) => {
  const { data, error } = await adminClient
    .from(tableName)
    .select('id')
    .eq('rental_id', rentalId);

  if (error) {
    if (isMissingRelationError(error)) {
      return { deleted: 0, skipped: true };
    }
    throw new Error(`Failed to load ${tableName} rows for rental cleanup: ${error.message}`);
  }

  const ids = (Array.isArray(data) ? data : []).map((row) => row?.id).filter(Boolean);
  if (!ids.length) {
    return { deleted: 0, skipped: false };
  }

  const { error: deleteError } = await adminClient
    .from(tableName)
    .delete()
    .in('id', ids);

  if (deleteError) {
    throw new Error(`Failed to delete ${tableName} rows for rental cleanup: ${deleteError.message}`);
  }

  return { deleted: ids.length, skipped: false };
};

const deleteStoredShareFilesByRentalId = async (adminClient, rentalId) => {
  const files = await listStoredDocumentShares(adminClient);
  const pathsToDelete = [];

  for (const file of files) {
    const fileName = String(file?.name || '').trim();
    if (!fileName || !fileName.endsWith('.json')) continue;

    const storagePath = `${DOCUMENT_SHARES_PREFIX}/${fileName}`;
    const { data: blob, error: downloadError } = await adminClient.storage
      .from(DOCUMENT_SHARES_BUCKET)
      .download(storagePath);

    if (downloadError || !blob) {
      console.warn('⚠️ RENTAL CLEANUP: Failed to inspect stored share file:', {
        storagePath,
        error: downloadError?.message || 'Missing blob',
      });
      continue;
    }

    try {
      const payload = JSON.parse(await blob.text());
      if (String(payload?.rental_id || '').trim() === rentalId) {
        pathsToDelete.push(storagePath);
      }
    } catch (parseError) {
      console.warn('⚠️ RENTAL CLEANUP: Stored share payload is invalid JSON:', {
        storagePath,
        error: parseError?.message || String(parseError),
      });
    }
  }

  if (!pathsToDelete.length) {
    return { deleted: 0 };
  }

  const { error: removeError } = await adminClient.storage
    .from(DOCUMENT_SHARES_BUCKET)
    .remove(pathsToDelete);

  if (removeError) {
    throw new Error(`Failed to remove stored document share files: ${removeError.message}`);
  }

  return { deleted: pathsToDelete.length };
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const action = String(req.query?.action || '').trim().toLowerCase();
  if (action !== 'delete-linked-artifacts') {
    return json(res, 400, { error: 'Unknown rental cleanup action' });
  }

  const auth = await requireOwnerOrAdmin(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { user, adminClient } = auth;
  const body = parseRequestBody(req);
  const rentalId = String(body?.rentalId || '').trim();
  const organizationId = String(body?.organizationId || '').trim();

  if (!rentalId || !organizationId) {
    return json(res, 400, { error: 'Missing rentalId or organizationId' });
  }

  try {
    const { data: membership, error: membershipError } = await adminClient
      .from(ORGANIZATION_MEMBERS_TABLE)
      .select('id, member_role, membership_status')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .eq('membership_status', 'active')
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership?.id) {
      return json(res, 403, { error: 'You do not have active membership in this workspace.' });
    }

    const { data: rental, error: rentalError } = await adminClient
      .from(RENTALS_TABLE)
      .select('id, organization_id')
      .eq('id', rentalId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (rentalError) {
      throw rentalError;
    }

    if (!rental?.id) {
      return json(res, 404, { error: 'Rental not found in the active workspace.' });
    }

    const [shortLinksResult, publicShareRowsResult, storedShareFilesResult] = await Promise.all([
      deleteTableRowsByRentalId(adminClient, SHORT_LINKS_TABLE, rentalId),
      deleteTableRowsByRentalId(adminClient, PUBLIC_DOCUMENT_SHARES_TABLE, rentalId),
      deleteStoredShareFilesByRentalId(adminClient, rentalId),
    ]);

    return json(res, 200, {
      success: true,
      cleanup: {
        shortLinksDeleted: shortLinksResult.deleted,
        publicShareRowsDeleted: publicShareRowsResult.deleted,
        storedShareFilesDeleted: storedShareFilesResult.deleted,
      },
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Rental cleanup failed' });
  }
}
