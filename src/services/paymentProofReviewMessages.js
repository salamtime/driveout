import * as MessageService from './MessageService';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../utils/messageCenter';

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const formatAmount = (amount, language = 'en') =>
  new Intl.NumberFormat(language === 'fr' ? 'fr-MA' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const resolveCustomerUserId = (row = {}, topup = {}) =>
  String(
    topup.userId ||
      topup.user_id ||
      row.customerUserId ||
      row.userId ||
      row.raw?.customerUserId ||
      row.raw?.userId ||
      row.raw?.user_id ||
      ''
  ).trim();

const resolveCustomerName = (row = {}, topup = {}) =>
  String(
    topup.userName ||
      topup.user_name ||
      row.customerName ||
      row.owner ||
      row.raw?.customerName ||
      row.raw?.userName ||
      row.raw?.user_name ||
      row.raw?.user_email ||
      row.customerEmail ||
      topup.userEmail ||
      ''
  ).trim();

const resolveCustomerEmail = (row = {}, topup = {}) =>
  String(
    topup.userEmail ||
      topup.user_email ||
      row.customerEmail ||
      row.raw?.customerEmail ||
      row.raw?.userEmail ||
      row.raw?.user_email ||
      ''
  ).trim();

const buildDecisionCopy = ({ amountLabel, nextStatus, reviewNote, language }) => {
  const rejected = normalizeStatus(nextStatus) === 'rejected';
  if (language === 'fr') {
    return rejected
      ? `Votre preuve de dépôt portefeuille de ${amountLabel} MAD nécessite un nouveau reçu.${reviewNote ? ` Motif : ${reviewNote}.` : ''} Veuillez téléverser un reçu plus clair depuis votre portefeuille.`
      : `Votre preuve de dépôt portefeuille de ${amountLabel} MAD a été approuvée. Les fonds sont maintenant disponibles dans votre portefeuille DriveOut.`;
  }

  return rejected
    ? `Your wallet deposit proof for ${amountLabel} MAD needs a replacement.${reviewNote ? ` Reason: ${reviewNote}.` : ''} Please upload a clearer receipt from your wallet.`
    : `Your wallet deposit proof for ${amountLabel} MAD was approved. The funds are now available in your DriveOut wallet.`;
};

export const syncWalletTopupReviewMessage = async ({
  row = {},
  topup = {},
  nextStatus = '',
  reviewNote = '',
  language = 'en',
} = {}) => {
  const customerUserId = resolveCustomerUserId(row, topup);
  if (!customerUserId) {
    return { status: 'skipped', reason: 'missing_customer_user_id' };
  }

  const normalizedStatus = normalizeStatus(nextStatus);
  const rejected = normalizedStatus === 'rejected';
  const amount = Number(topup.amount ?? row.amount ?? row.raw?.amount ?? 0) || 0;
  const amountLabel = formatAmount(amount, language);
  const walletTopupId = String(topup.id || row.rawId || row.id || row.raw?.id || '').trim();
  const customerName = resolveCustomerName(row, topup);
  const customerEmail = resolveCustomerEmail(row, topup);
  const subject = rejected
    ? `Wallet deposit needs attention - ${amountLabel} MAD`
    : `Wallet deposit approved - ${amountLabel} MAD`;

  try {
    const ensuredThreadResponse = await MessageService.ensureThreadByContext({
      contextType: 'user',
      contextId: customerUserId,
      family: MESSAGE_FAMILIES.accountTrust,
      threadType: MESSAGE_THREAD_TYPES.accountStatus,
      senderRole: 'admin',
      waitingOn: rejected ? 'customer' : 'none',
      priority: rejected ? 'important' : 'normal',
    });

    const threadKey = String(ensuredThreadResponse?.threadState?.thread_key || '').trim();
    const messageResponse = await MessageService.sendSharedMessage({
      family: MESSAGE_FAMILIES.accountTrust,
      threadType: MESSAGE_THREAD_TYPES.accountStatus,
      ...(threadKey ? { threadKey } : {}),
      entityType: 'user',
      entityId: customerUserId,
      recipientUserId: customerUserId,
      recipientRole: 'customer',
      senderRole: 'admin',
      messageType: 'wallet_topup_review',
      subject,
      body: buildDecisionCopy({
        amountLabel,
        nextStatus: normalizedStatus,
        reviewNote,
        language,
      }),
      waitingOn: rejected ? 'customer' : 'none',
      priority: rejected ? 'important' : 'normal',
      resolved: !rejected,
      metadata: {
        type: 'wallet_topup_review',
        contentType: 'payment_proof',
        walletTopupId,
        paymentProofId: walletTopupId,
        amount,
        status: normalizedStatus,
        reviewNote,
        href: '/account/revenue',
        adminHref: '/admin/verification?tab=payment_proofs',
        customerEmail,
        customerName,
        entityEmail: customerEmail,
        entityName: customerName,
        source: 'wallet_topup_review',
      },
    });

    return {
      status: 'sent',
      threadKey: String(messageResponse?.thread?.thread_key || threadKey || '').trim(),
      message: messageResponse?.message || null,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error?.message || 'Unable to send the customer message update.',
    };
  }
};

export default syncWalletTopupReviewMessage;
