import {
  CUSTOMER_LOYALTY_TIERS,
  CUSTOMER_REWARDS,
  CUSTOMER_REWARDS_CURRENCY,
  CUSTOMER_REWARDS_LEDGER_EVENT_TYPES,
  CUSTOMER_REWARDS_MISSIONS,
  getCustomerLoyaltyTierLabel,
  getCustomerRewardById,
  getCustomerRewardGroupLabel,
  getCustomerRewardsMissionById,
  getCustomerRewardsMissionGroupLabel,
  getCustomerNextLoyaltyTier,
  getCustomerRewardsNextMilestone,
} from '../config/customerRewardsEconomy';

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const normalizeLedgerEntry = (entry = {}) => ({
  id: entry.id || `${entry.type || entry.entry_type || 'entry'}-${entry.referenceId || entry.reference_id || Date.now()}`,
  type: entry.type || entry.entry_type || CUSTOMER_REWARDS_LEDGER_EVENT_TYPES.manualAdjustment,
  missionId: entry.missionId || entry.mission_id || null,
  rewardId: entry.rewardId || entry.reward_id || null,
  amount: toNumber(entry.amount),
  createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
  referenceId: entry.referenceId || entry.reference_id || '',
  note: entry.note || '',
  platform: entry.platform || '',
});

const summarizeWallet = (ledger = []) => {
  const entries = Array.isArray(ledger) ? ledger.map(normalizeLedgerEntry) : [];
  const earned = entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const spent = Math.abs(entries.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0));

  return {
    currency: CUSTOMER_REWARDS_CURRENCY,
    balance: earned - spent,
    earned,
    spent,
    entries,
  };
};

const buildMissionProgress = ({ mission, ledger }) => {
  const entries = Array.isArray(ledger) ? ledger.map(normalizeLedgerEntry) : [];
  const missionEntries = entries.filter((entry) => entry.missionId === mission.id && entry.amount > 0);
  const earnedCount = missionEntries.length;
  const earnedCredits = missionEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const capValue = Number(mission?.cap?.value || 0);

  return {
    ...mission,
    earnedCount,
    earnedCredits,
    remainingBeforeCap:
      capValue > 0 && ['per_day', 'per_week', 'per_month', 'lifetime'].includes(mission?.cap?.type)
        ? Math.max(0, capValue - earnedCount)
        : null,
  };
};

const buildWalletProgress = (balance = 0) => {
  const safeBalance = toNumber(balance);
  const nextMilestone = getCustomerRewardsNextMilestone(safeBalance);
  const previousTarget = nextMilestone
    ? CUSTOMER_REWARDS.filter((reward) => toNumber(reward.cost) < toNumber(nextMilestone.creditsRequired))
        .map((reward) => toNumber(reward.cost))
        .sort((left, right) => left - right)
        .pop() || 0
    : CUSTOMER_REWARDS.map((reward) => toNumber(reward.cost)).sort((left, right) => left - right).pop() || 0;
  const target = nextMilestone ? toNumber(nextMilestone.creditsRequired) : safeBalance || previousTarget || 1;
  const span = Math.max(1, target - previousTarget);
  const progress = Math.min(span, Math.max(0, safeBalance - previousTarget));

  return {
    balance: safeBalance,
    nextMilestone,
    percentageToNext: Math.round((progress / span) * 100),
    creditsToNext: nextMilestone ? Math.max(0, target - safeBalance) : 0,
    previousTarget,
    target,
  };
};

const buildMissionBoard = (missionProgress = [], tr = (value) => value) => {
  const groups = new Map();

  missionProgress.forEach((mission) => {
    const groupKey = mission.group || 'rewards';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label: getCustomerRewardsMissionGroupLabel(groupKey, tr),
        missions: [],
        totalCredits: 0,
      });
    }

    const group = groups.get(groupKey);
    group.missions.push({
      ...mission,
      status:
        mission.remainingBeforeCap === 0
          ? 'capped'
          : mission.earnedCount > 0 && mission.cadence === 'once'
            ? 'done'
            : 'available',
    });
    group.totalCredits += toNumber(mission.credits);
  });

  return Array.from(groups.values());
};

const buildRewardCatalog = ({ walletBalance = 0, tr = (value) => value }) => {
  const groups = new Map();

  CUSTOMER_REWARDS.forEach((reward, index) => {
    const groupKey = reward.group || 'rewards';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label: getCustomerRewardGroupLabel(groupKey, tr),
        rewards: [],
      });
    }

    groups.get(groupKey).rewards.push({
      ...reward,
      affordable: walletBalance >= toNumber(reward.cost),
      creditsNeeded: Math.max(0, toNumber(reward.cost) - walletBalance),
      featuredChoice: index === 0,
    });
  });

  return Array.from(groups.values());
};

const getSuggestedMission = (missionProgress = []) =>
  [...missionProgress]
    .filter((mission) => mission.remainingBeforeCap !== 0)
    .sort((left, right) => toNumber(right.credits) - toNumber(left.credits))[0] || null;

const getSuggestedReward = (walletBalance = 0) => {
  const rewards = [...CUSTOMER_REWARDS].sort((left, right) => toNumber(left.cost) - toNumber(right.cost));
  return rewards.find((reward) => walletBalance >= toNumber(reward.cost)) || rewards[0] || null;
};

const buildLoyaltySnapshot = ({ walletBalance = 0, completedRentals = 0, tr = (value) => value }) => {
  const safeBalance = toNumber(walletBalance);
  const safeRentals = toNumber(completedRentals);
  const currentTier =
    [...CUSTOMER_LOYALTY_TIERS]
      .reverse()
      .find(
        (tier) =>
          safeBalance >= toNumber(tier.creditsRequired) &&
          safeRentals >= toNumber(tier.completedRentalsRequired)
      ) || CUSTOMER_LOYALTY_TIERS[0];
  const nextTier = getCustomerNextLoyaltyTier({ balance: safeBalance, completedRentals: safeRentals });
  const creditsNeeded = nextTier ? Math.max(0, toNumber(nextTier.creditsRequired) - safeBalance) : 0;
  const rentalsNeeded = nextTier ? Math.max(0, toNumber(nextTier.completedRentalsRequired) - safeRentals) : 0;
  const previousTierCredits = currentTier ? toNumber(currentTier.creditsRequired) : 0;
  const targetCredits = nextTier ? toNumber(nextTier.creditsRequired) : Math.max(safeBalance, previousTierCredits, 1);
  const creditSpan = Math.max(1, targetCredits - previousTierCredits);
  const creditProgress = Math.max(0, Math.min(creditSpan, safeBalance - previousTierCredits));

  return {
    currentTier: currentTier
      ? {
          ...currentTier,
          label: getCustomerLoyaltyTierLabel(currentTier.id, tr),
        }
      : null,
    nextTier: nextTier
      ? {
          ...nextTier,
          label: getCustomerLoyaltyTierLabel(nextTier.id, tr),
        }
      : null,
    creditsNeeded,
    rentalsNeeded,
    percentageToNext: nextTier ? Math.round((creditProgress / creditSpan) * 100) : 100,
    completedRentals: safeRentals,
    benefitsUnlocked: currentTier?.benefits || [],
  };
};

class CustomerRewardsService {
  static getCurrency() {
    return CUSTOMER_REWARDS_CURRENCY;
  }

  static summarizeLedger(ledger = []) {
    return summarizeWallet(ledger);
  }

  static buildWalletSnapshot({ ledger = [], activeRewardIds = [], completedRentals = 0, tr = (value) => value } = {}) {
    const wallet = summarizeWallet(ledger);
    const activeRewards = (Array.isArray(activeRewardIds) ? activeRewardIds : [])
      .map((rewardId) => getCustomerRewardById(rewardId))
      .filter(Boolean);

    const missionProgress = CUSTOMER_REWARDS_MISSIONS.map((mission) => buildMissionProgress({ mission, ledger }));
    const walletProgress = buildWalletProgress(wallet.balance);
    const loyalty = buildLoyaltySnapshot({
      walletBalance: wallet.balance,
      completedRentals,
      tr,
    });

    return {
      wallet,
      walletProgress,
      loyalty,
      activeRewards,
      missionProgress,
      missionBoard: buildMissionBoard(missionProgress),
      suggestedMission: getSuggestedMission(missionProgress),
      suggestedReward: getSuggestedReward(wallet.balance),
      rewardCatalog: buildRewardCatalog({ walletBalance: wallet.balance }),
      availableRewards: CUSTOMER_REWARDS.map((reward) => ({
        ...reward,
        affordable: wallet.balance >= toNumber(reward.cost),
      })),
    };
  }

  static estimateMissionClaim(missionId, currentBalance = 0) {
    const mission = getCustomerRewardsMissionById(missionId);
    if (!mission) return null;

    return {
      mission,
      nextBalance: toNumber(currentBalance) + toNumber(mission.credits),
    };
  }

  static estimateRewardRedemption(rewardId, currentBalance = 0) {
    const reward = getCustomerRewardById(rewardId);
    if (!reward) return null;

    const nextBalance = toNumber(currentBalance) - toNumber(reward.cost);
    return {
      reward,
      affordable: nextBalance >= 0,
      nextBalance,
    };
  }
}

export default CustomerRewardsService;
