export const parseAmountDueResolutionMeta = (rentalLike = {}) => {
  const rawReason =
    typeof rentalLike?.amount_due_override_reason === 'string'
      ? rentalLike.amount_due_override_reason.trim()
      : '';
  if (!rawReason || !rawReason.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(rawReason);
    const paymentReceivedNow = Math.max(0, Number(parsed?.paymentReceivedNow || 0) || 0);
    const companyDiscount = Math.max(0, Number(parsed?.companyDiscount || 0) || 0);
    const previousAmount = Math.max(0, Number(rentalLike?.amount_due_override_previous_amount || 0) || 0);
    const newAmount = Math.max(0, Number(rentalLike?.remaining_amount || 0) || 0);
    const note = String(parsed?.note || '').trim();
    const customerFacingNote = String(parsed?.customerFacingNote || '').trim();
    const expectedNewAmount = Math.max(0, previousAmount - paymentReceivedNow - companyDiscount);

    if (paymentReceivedNow <= 0 && companyDiscount <= 0 && !note && !customerFacingNote && previousAmount <= 0 && newAmount <= 0) {
      return null;
    }

    if (previousAmount > 0 && Math.abs(expectedNewAmount - newAmount) > 1) {
      return null;
    }

    return {
      paymentReceivedNow,
      companyDiscount,
      previousAmount,
      newAmount,
      note,
      customerFacingNote,
      editedAt: parsed?.editedAt || null,
      paymentReceivedAt: parsed?.paymentReceivedAt || null,
      paidAt: parsed?.paidAt || null,
      transportFeeEditedAt: parsed?.transportFeeEditedAt || null,
    };
  } catch {
    return null;
  }
};

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getRentalCollectedEntries = (rentalLike = {}) => {
  const amountDueResolutionMeta = parseAmountDueResolutionMeta(rentalLike);
  const entries = [];

  const finalPaidAmount = Math.max(0, parseFloat(rentalLike?.deposit_amount || 0) || 0);
  const amountDueCashComponent = Math.min(
    finalPaidAmount,
    Math.max(0, Number(amountDueResolutionMeta?.paymentReceivedNow || 0) || 0)
  );
  const contractPaidAmount = Math.max(0, finalPaidAmount - amountDueCashComponent);
  const contractPaidAt =
    toValidDate(rentalLike?.payment_date) ||
    toValidDate(rentalLike?.paid_at) ||
    toValidDate(rentalLike?.payment_received_at) ||
    toValidDate(rentalLike?.created_at);
  if (contractPaidAmount > 0 && contractPaidAt) {
    entries.push({
      type: 'contract_payment',
      amount: contractPaidAmount,
      at: contractPaidAt,
    });
  }

  const paymentReceivedNow = amountDueCashComponent;
  const amountDuePaidAt =
    toValidDate(amountDueResolutionMeta?.paymentReceivedAt) ||
    toValidDate(amountDueResolutionMeta?.paidAt) ||
    toValidDate(amountDueResolutionMeta?.editedAt) ||
    toValidDate(amountDueResolutionMeta?.transportFeeEditedAt) ||
    toValidDate(rentalLike?.updated_at) ||
    toValidDate(rentalLike?.completed_at) ||
    toValidDate(rentalLike?.created_at);
  if (paymentReceivedNow > 0 && amountDuePaidAt) {
    entries.push({
      type: 'amount_due_payment',
      amount: paymentReceivedNow,
      at: amountDuePaidAt,
    });
  }

  const seizedSecurityDeposit = Math.max(0, parseFloat(rentalLike?.deposit_deduction_amount || 0) || 0);
  const seizedAt =
    toValidDate(rentalLike?.deposit_returned_at) ||
    toValidDate(rentalLike?.updated_at) ||
    toValidDate(rentalLike?.completed_at);
  if (seizedSecurityDeposit > 0 && seizedAt) {
    entries.push({
      type: 'seized_security_deposit',
      amount: seizedSecurityDeposit,
      at: seizedAt,
    });
  }

  return entries;
};

export const getRentalCollectedAmount = (rentalLike = {}) => {
  return getRentalCollectedEntries(rentalLike).reduce((sum, entry) => sum + entry.amount, 0);
};

export const getRentalCollectedAmountInWindow = (rentalLike = {}, start = null, end = null) => {
  const windowStart = toValidDate(start);
  const windowEnd = toValidDate(end);
  if (!windowStart || !windowEnd) {
    return getRentalCollectedAmount(rentalLike);
  }

  return getRentalCollectedEntries(rentalLike).reduce((sum, entry) => {
    if (!entry?.at) return sum;
    return entry.at >= windowStart && entry.at <= windowEnd ? sum + entry.amount : sum;
  }, 0);
};

export const getRentalCompanyDiscountAmount = (rentalLike = {}) => {
  const amountDueResolutionMeta = parseAmountDueResolutionMeta(rentalLike);
  return Math.max(0, Number(amountDueResolutionMeta?.companyDiscount || 0) || 0);
};

export const MONEY_EPSILON = 0.01;

const hasAmountDueSettlementActivity = (amountDueMeta = null) => (
  Boolean(amountDueMeta) &&
  (
    Math.abs(Number(amountDueMeta?.paymentReceivedNow || 0) || 0) > MONEY_EPSILON ||
    Math.abs(Number(amountDueMeta?.companyDiscount || 0) || 0) > MONEY_EPSILON
  )
);

export const resolveAmountDueCompanyDiscountAmount = ({
  amountDueMeta = null,
  rawBalanceDue = 0,
  storedRemainingAmount = 0,
  depositPaid = 0,
}) => {
  const explicitCompanyDiscountAmount = Math.max(0, Number(amountDueMeta?.companyDiscount || 0) || 0);
  const paymentReceivedNow = Math.max(0, Number(amountDueMeta?.paymentReceivedNow || 0) || 0);
  const inferredCompanyDiscountAmount =
    amountDueMeta &&
    explicitCompanyDiscountAmount <= 0 &&
    paymentReceivedNow <= MONEY_EPSILON &&
    storedRemainingAmount <= MONEY_EPSILON &&
    depositPaid > 0 &&
    rawBalanceDue > MONEY_EPSILON
      ? Math.max(0, rawBalanceDue)
      : 0;

  return {
    explicitCompanyDiscountAmount,
    inferredCompanyDiscountAmount,
    companyDiscountAmount: Math.max(explicitCompanyDiscountAmount, inferredCompanyDiscountAmount),
  };
};

export const resolveAmountDueBalanceState = ({
  amountDueMeta = null,
  rawBalanceDue = 0,
  storedRemainingAmount = 0,
  depositPaid = 0,
}) => {
  const normalizedRawBalanceDue = Math.max(0, Number(rawBalanceDue || 0) || 0);
  const normalizedStoredRemainingAmount = Math.max(0, Number(storedRemainingAmount || 0) || 0);
  const {
    explicitCompanyDiscountAmount,
    inferredCompanyDiscountAmount,
    companyDiscountAmount,
  } = resolveAmountDueCompanyDiscountAmount({
    amountDueMeta,
    rawBalanceDue: normalizedRawBalanceDue,
    storedRemainingAmount: normalizedStoredRemainingAmount,
    depositPaid,
  });
  const hasManualAmountDueOverride = Boolean(amountDueMeta);
  const hasSettlementAdjustment = hasAmountDueSettlementActivity(amountDueMeta);
  const settlementResolvedBalanceDue = Math.max(0, normalizedRawBalanceDue - companyDiscountAmount);
  const settlementStoredIsConsistent =
    Math.abs(normalizedStoredRemainingAmount - settlementResolvedBalanceDue) < MONEY_EPSILON;

  let balanceDue = normalizedRawBalanceDue;
  if (hasManualAmountDueOverride) {
    balanceDue = hasSettlementAdjustment
      ? (settlementStoredIsConsistent ? normalizedStoredRemainingAmount : settlementResolvedBalanceDue)
      : normalizedStoredRemainingAmount;
  }

  const manualAdjustmentOffset = Math.max(
    -settlementResolvedBalanceDue,
    balanceDue - settlementResolvedBalanceDue
  );

  return {
    balanceDue,
    hasManualAmountDueOverride,
    hasSettlementAdjustment,
    settlementResolvedBalanceDue,
    settlementStoredIsConsistent,
    manualAdjustmentOffset,
    explicitCompanyDiscountAmount,
    inferredCompanyDiscountAmount,
    companyDiscountAmount,
  };
};

export const buildAmountDueStateForGrandTotalChange = ({
  rentalLike = {},
  amountDueMeta = null,
  currentGrandTotal = 0,
  nextGrandTotal = 0,
}) => {
  const depositPaid = Math.max(0, Number(rentalLike?.deposit_amount || 0) || 0);
  const storedRemainingAmount = Math.max(0, Number(rentalLike?.remaining_amount || 0) || 0);
  const currentRawBalanceDue = Math.max(0, Number(currentGrandTotal || 0) - depositPaid);
  const currentBalanceState = resolveAmountDueBalanceState({
    amountDueMeta,
    rawBalanceDue: currentRawBalanceDue,
    storedRemainingAmount,
    depositPaid,
  });
  const nextRawBalanceDue = Math.max(0, Number(nextGrandTotal || 0) - depositPaid);
  const nextSettlementResolvedBalanceDue = Math.max(
    0,
    nextRawBalanceDue - currentBalanceState.companyDiscountAmount
  );
  const nextRemainingAmount = Math.max(
    0,
    nextSettlementResolvedBalanceDue + currentBalanceState.manualAdjustmentOffset
  );
  const nextPaymentStatus = nextRemainingAmount <= MONEY_EPSILON
    ? 'paid'
    : (depositPaid > 0 ? 'partial' : 'unpaid');

  return {
    nextRemainingAmount,
    nextPaymentStatus,
    companyDiscountAmount: currentBalanceState.companyDiscountAmount,
    manualAdjustmentOffset: currentBalanceState.manualAdjustmentOffset,
    balanceState: currentBalanceState,
  };
};
