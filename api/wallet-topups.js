import { authenticateRequest, requireOwnerOrAdmin } from './_lib/auth.js';
import { EMAIL_SENDERS, buildAnnouncementEmail, sendResendEmail } from './_lib/email.js';

const WALLET_TOPUPS_TABLE = 'wallet_topups';
const WALLET_ACCOUNTS_TABLE = 'app_wallet_accounts';
const WALLET_TRANSACTIONS_TABLE = 'app_wallet_transactions';

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round(toNumber(value) * 100) / 100;

const normalizeStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'approved') return 'approved';
  if (raw === 'rejected') return 'rejected';
  return 'pending';
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const getAction = (req) => String(req.query?.action || '').trim().toLowerCase();

const buildAppOrigin = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || '').trim() || (host.includes('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : '';
};

const isMissingTableError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist') || message.includes('not found');
};

const insertWalletTransactionWithCompatibility = async (adminClient, payload) => {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await adminClient.from(WALLET_TRANSACTIONS_TABLE).insert([nextPayload]);
    if (!error) return null;

    const message = String(error?.message || error?.details || '');
    const missingColumnMatch = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
    const missingColumn = missingColumnMatch?.[1] || null;

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      const { [missingColumn]: _removed, ...reducedPayload } = nextPayload;
      nextPayload = reducedPayload;
      continue;
    }

    return error;
  }

  return null;
};

const ensureWalletAccount = async (adminClient, userId) => {
  const { data: existingWallet, error: walletError } = await adminClient
    .from(WALLET_ACCOUNTS_TABLE)
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (walletError) throw walletError;
  if (existingWallet) return existingWallet;

  let payload = {
    owner_id: userId,
    owner_type: 'customer',
    current_balance: 0,
    currency_code: 'MAD',
    verification_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await adminClient
      .from(WALLET_ACCOUNTS_TABLE)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (!error && data) return data;

    const message = String(error?.message || error?.details || '');
    const missingColumnMatch = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
    const missingColumn = missingColumnMatch?.[1] || null;
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const { [missingColumn]: _removed, ...reducedPayload } = payload;
      payload = reducedPayload;
      continue;
    }

    if (error) throw error;
  }

  throw new Error('Unable to create wallet account');
};

const sendWalletTopupStatusEmail = async ({ req, topup, nextStatus }) => {
  const recipientEmail = normalizeEmail(topup?.user_email);
  if (!recipientEmail) return;

  const appOrigin = buildAppOrigin(req);
  const walletUrl = appOrigin ? `${appOrigin}/account/revenue` : '';
  const amountLabel = `${roundCurrency(topup?.amount)} MAD`;

  const approved = nextStatus === 'approved';
  const title = approved ? 'Wallet top-up approved' : 'Wallet top-up needs attention';
  const subject = approved ? `Wallet top-up approved • ${amountLabel}` : `Wallet top-up rejected • ${amountLabel}`;
  const messageHtml = approved
    ? `
      <p style="margin:0 0 12px 0;">Your bank transfer proof for <strong>${amountLabel}</strong> has been approved.</p>
      <p style="margin:0;">The funds are now available in your SaharaX wallet.</p>
    `
    : `
      <p style="margin:0 0 12px 0;">Your bank transfer proof for <strong>${amountLabel}</strong> could not be approved yet.</p>
      <p style="margin:0;">${topup?.review_note ? `Reason: <strong>${topup.review_note}</strong>. ` : ''}Please upload a clearer or corrected receipt from your wallet.</p>
    `;

  const emailPayload = buildAnnouncementEmail({
    subject,
    title,
    messageHtml,
    ctaLabel: walletUrl ? (approved ? 'Open wallet' : 'Upload a new receipt') : '',
    ctaUrl: walletUrl,
  });

  await sendResendEmail({
    from: EMAIL_SENDERS.updates,
    to: recipientEmail,
    subject: emailPayload.subject,
    html: emailPayload.html,
    replyTo: 'updates@send.saharax.driveout.io',
  });
};

const mapTopupRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.user_email || '',
  userName: row.user_name || '',
  amount: roundCurrency(row.amount),
  proofUrl: row.proof_url || '',
  proofPath: row.proof_path || '',
  note: row.note || '',
  reviewNote: row.review_note || '',
  status: normalizeStatus(row.status),
  reviewedBy: row.reviewed_by || '',
  reviewedAt: row.reviewed_at || null,
  approvedAt: row.approved_at || null,
  rejectedAt: row.rejected_at || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const auth = await authenticateRequest(req);
    if (auth.error) {
      return sendJson(res, auth.error.status, auth.error.body);
    }

    const { adminClient, user } = auth;
    const { data, error } = await adminClient
      .from(WALLET_TOPUPS_TABLE)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      if (isMissingTableError(error)) {
        return sendJson(res, 200, { topups: [], tableReady: false });
      }
      return sendJson(res, 500, { error: error.message || 'Failed to load wallet top-ups' });
    }

    return sendJson(res, 200, {
      tableReady: true,
      topups: (data || []).map(mapTopupRow),
    });
  }

  if (req.method === 'POST') {
    const auth = await authenticateRequest(req);
    if (auth.error) {
      return sendJson(res, auth.error.status, auth.error.body);
    }

    const { adminClient, user } = auth;
    const body = parseBody(req.body);
    const amount = roundCurrency(body.amount);
    const proofUrl = String(body.proofUrl || '').trim();
    const proofPath = String(body.proofPath || '').trim();
    const note = String(body.note || '').trim();

    if (amount <= 0) {
      return sendJson(res, 400, { error: 'Amount must be greater than zero' });
    }

    if (!proofUrl) {
      return sendJson(res, 400, { error: 'Receipt proof is required' });
    }

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: user.id,
      user_email: normalizeEmail(user.email),
      user_name: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Customer').trim(),
      amount,
      proof_url: proofUrl,
      proof_path: proofPath || null,
      note: note || null,
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await adminClient
      .from(WALLET_TOPUPS_TABLE)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return sendJson(res, 500, { error: 'wallet_topups table is not available yet. Run the latest migration first.' });
      }
      return sendJson(res, 500, { error: error.message || 'Failed to submit wallet top-up' });
    }

    return sendJson(res, 201, {
      ok: true,
      topup: mapTopupRow(data),
    });
  }

  if (req.method === 'PATCH' && getAction(req) === 'review') {
    const auth = await requireOwnerOrAdmin(req);
    if (auth.error) {
      return sendJson(res, auth.error.status, auth.error.body);
    }

    const { adminClient, user } = auth;
    const topupId = String(req.query?.id || '').trim();
    const body = parseBody(req.body);
    const nextStatus = normalizeStatus(body.status);
    const reviewNote = String(body.reviewNote || body.reason || '').trim();

    if (!topupId) {
      return sendJson(res, 400, { error: 'Top-up id is required' });
    }

    if (!['approved', 'rejected'].includes(nextStatus)) {
      return sendJson(res, 400, { error: 'Review status must be approved or rejected' });
    }

    const { data: topupRow, error: topupError } = await adminClient
      .from(WALLET_TOPUPS_TABLE)
      .select('*')
      .eq('id', topupId)
      .maybeSingle();

    if (topupError) {
      if (isMissingTableError(topupError)) {
        return sendJson(res, 500, { error: 'wallet_topups table is not available yet. Run the latest migration first.' });
      }
      return sendJson(res, 500, { error: topupError.message || 'Failed to load top-up' });
    }

    if (!topupRow) {
      return sendJson(res, 404, { error: 'Wallet top-up not found' });
    }

    const currentStatus = normalizeStatus(topupRow.status);
    if (currentStatus === nextStatus) {
      return sendJson(res, 200, { ok: true, topup: mapTopupRow(topupRow) });
    }

    if (currentStatus === 'approved' && nextStatus !== 'approved') {
      return sendJson(res, 409, { error: 'Approved top-ups cannot be changed back' });
    }

    const nowIso = new Date().toISOString();
    let walletAccount = null;

    if (nextStatus === 'approved') {
      walletAccount = await ensureWalletAccount(adminClient, topupRow.user_id);
      const walletId = String(walletAccount?.id || walletAccount?.wallet_id || '').trim();
      const currentBalance = Math.max(0, toNumber(walletAccount?.current_balance ?? walletAccount?.balance ?? walletAccount?.wallet_balance));
      const nextBalance = roundCurrency(currentBalance + toNumber(topupRow.amount));

      const { error: walletError } = await adminClient
        .from(WALLET_ACCOUNTS_TABLE)
        .update({
          current_balance: nextBalance,
          updated_at: nowIso,
        })
        .eq('id', walletId);

      if (walletError) {
        return sendJson(res, 500, { error: walletError.message || 'Failed to credit wallet' });
      }

      const transactionError = await insertWalletTransactionWithCompatibility(adminClient, {
        wallet_account_id: walletId,
        wallet_id: walletId,
        owner_id: topupRow.user_id,
        amount: roundCurrency(topupRow.amount),
        status: 'approved',
        transaction_status: 'approved',
        type: 'wallet_topup',
        transaction_type: 'wallet_topup',
        description: `Wallet top-up approved from bank transfer ${topupId}`,
        notes: reviewNote || 'Bank transfer approved by admin review.',
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (transactionError) {
        return sendJson(res, 500, { error: transactionError.message || 'Failed to create wallet ledger entry' });
      }
    }

    const updatePayload = {
      status: nextStatus,
      review_note: reviewNote || null,
      reviewed_by: String(user.email || user.id || 'admin'),
      reviewed_at: nowIso,
      approved_at: nextStatus === 'approved' ? nowIso : null,
      rejected_at: nextStatus === 'rejected' ? nowIso : null,
      updated_at: nowIso,
      wallet_account_id: nextStatus === 'approved'
        ? String(walletAccount?.id || walletAccount?.wallet_id || topupRow.wallet_account_id || '').trim() || null
        : topupRow.wallet_account_id || null,
    };

    const { data: updatedRow, error: updateError } = await adminClient
      .from(WALLET_TOPUPS_TABLE)
      .update(updatePayload)
      .eq('id', topupId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      return sendJson(res, 500, { error: updateError.message || 'Failed to update top-up review' });
    }

    try {
      await sendWalletTopupStatusEmail({
        req,
        topup: { ...topupRow, ...updatePayload },
        nextStatus,
      });
    } catch (emailError) {
      console.error('Wallet top-up email failed:', emailError);
    }

    return sendJson(res, 200, {
      ok: true,
      topup: mapTopupRow(updatedRow || { ...topupRow, ...updatePayload }),
    });
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}
