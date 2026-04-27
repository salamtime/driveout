import {
  BOOST_ANTI_ABUSE_RULES,
  BOOST_CURRENCY,
  BOOST_LEDGER_EVENT_TYPES,
  BOOST_MISSIONS,
  BOOST_REWARDS,
  getBoostMissionById,
  getBoostMissionGroupLabel,
  getBoostNextWalletMilestone,
  getBoostRewardById,
  getBoostRewardGroupLabel,
} from '../config/boostEconomy';

const toNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const normalizeLedgerEntry = (entry = {}) => ({
  id: entry.id || `${entry.type || entry.entry_type || 'entry'}-${entry.referenceId || entry.reference_id || Date.now()}`,
  type: entry.type || entry.entry_type || BOOST_LEDGER_EVENT_TYPES.manualAdjustment,
  missionId: entry.missionId || entry.mission_id || null,
  rewardId: entry.rewardId || entry.reward_id || null,
  amount: toNumber(entry.amount),
  createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
  referenceId: entry.referenceId || entry.reference_id || '',
  note: entry.note || '',
});

const summarizeWallet = (ledger = []) => {
  const entries = Array.isArray(ledger) ? ledger.map(normalizeLedgerEntry) : [];

  const earned = entries
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const spent = Math.abs(
    entries
      .filter((entry) => entry.amount < 0)
      .reduce((sum, entry) => sum + entry.amount, 0)
  );

  return {
    currency: BOOST_CURRENCY,
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
      capValue > 0 && ['per_day', 'per_week', 'per_month', 'lifetime', 'per_vehicle'].includes(mission?.cap?.type)
        ? Math.max(0, capValue - earnedCount)
        : null,
  };
};

const buildWalletProgress = (balance = 0) => {
  const safeBalance = toNumber(balance);
  const nextMilestone = getBoostNextWalletMilestone(safeBalance);
  const previousTarget = nextMilestone
    ? BOOST_REWARDS.filter((reward) => toNumber(reward.cost) < toNumber(nextMilestone.creditsRequired))
        .map((reward) => toNumber(reward.cost))
        .sort((left, right) => left - right)
        .pop() || 0
    : BOOST_REWARDS.map((reward) => toNumber(reward.cost)).sort((left, right) => left - right).pop() || 0;
  const target = nextMilestone ? toNumber(nextMilestone.creditsRequired) : safeBalance || previousTarget || 1;
  const progressSpan = Math.max(1, target - previousTarget);
  const progressValue = Math.min(progressSpan, Math.max(0, safeBalance - previousTarget));

  return {
    balance: safeBalance,
    nextMilestone,
    percentageToNext: Math.round((progressValue / progressSpan) * 100),
    creditsToNext: nextMilestone ? Math.max(0, target - safeBalance) : 0,
    previousTarget,
    target,
  };
};

const buildMissionBoard = (missionProgress = [], tr = (value) => value) => {
  const groups = new Map();

  missionProgress.forEach((mission) => {
    const key = mission.group || 'boost';
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: getBoostMissionGroupLabel(key, tr),
        missions: [],
        totalCredits: 0,
      });
    }

    const group = groups.get(key);
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

  BOOST_REWARDS.forEach((reward, index) => {
    const groupKey = reward.group || 'boost';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        label: getBoostRewardGroupLabel(groupKey, tr),
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
  const sortedRewards = [...BOOST_REWARDS].sort((left, right) => toNumber(left.cost) - toNumber(right.cost));
  return (
    sortedRewards.find((reward) => walletBalance >= toNumber(reward.cost)) ||
    sortedRewards.find((reward) => walletBalance < toNumber(reward.cost)) ||
    null
  );
};

class BoostService {
  static getCurrency() {
    return BOOST_CURRENCY;
  }

  static getEconomyConfig() {
    return {
      currency: BOOST_CURRENCY,
      missions: BOOST_MISSIONS,
      rewards: BOOST_REWARDS,
      antiAbuseRules: BOOST_ANTI_ABUSE_RULES,
      ledgerEventTypes: BOOST_LEDGER_EVENT_TYPES,
    };
  }

  static summarizeLedger(ledger = []) {
    return summarizeWallet(ledger);
  }

  static buildWalletSnapshot({ ledger = [], activeRewardIds = [] } = {}) {
    const wallet = summarizeWallet(ledger);
    const activeRewards = (Array.isArray(activeRewardIds) ? activeRewardIds : [])
      .map((rewardId) => getBoostRewardById(rewardId))
      .filter(Boolean);

    const missionProgress = BOOST_MISSIONS.map((mission) => buildMissionProgress({ mission, ledger }));
    const walletProgress = buildWalletProgress(wallet.balance);
    const suggestedMission = getSuggestedMission(missionProgress);
    const suggestedReward = getSuggestedReward(wallet.balance);

    return {
      wallet,
      walletProgress,
      activeRewards,
      missionProgress,
      missionBoard: buildMissionBoard(missionProgress),
      suggestedMission,
      suggestedReward,
      rewardCatalog: buildRewardCatalog({ walletBalance: wallet.balance }),
      availableRewards: BOOST_REWARDS.map((reward) => ({
        ...reward,
        affordable: wallet.balance >= toNumber(reward.cost),
      })),
    };
  }

  static estimateMissionClaim(missionId, currentBalance = 0) {
    const mission = getBoostMissionById(missionId);
    if (!mission) return null;

    return {
      mission,
      nextBalance: toNumber(currentBalance) + toNumber(mission.credits),
    };
  }

  static estimateRewardRedemption(rewardId, currentBalance = 0) {
    const reward = getBoostRewardById(rewardId);
    if (!reward) return null;

    const nextBalance = toNumber(currentBalance) - toNumber(reward.cost);

    return {
      reward,
      affordable: nextBalance >= 0,
      nextBalance,
    };
  }
}

export default BoostService;
