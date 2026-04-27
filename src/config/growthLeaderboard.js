export const LEADERBOARD_TYPES = {
  rewards: 'rewards',
  boost: 'boost',
};

export const LEADERBOARD_BADGES = {
  rewards: {
    title: 'Top Referrer',
    id: 'top_referrer',
  },
  boost: {
    title: 'Top Promoter',
    id: 'top_promoter',
  },
};

export const REWARDS_WEEKLY_PRIZES = [
  { minRank: 1, maxRank: 1, credits: 500, title: 'Rank #1 weekly reward' },
  { minRank: 2, maxRank: 2, credits: 300, title: 'Rank #2 weekly reward' },
  { minRank: 3, maxRank: 3, credits: 200, title: 'Rank #3 weekly reward' },
  { minRank: 4, maxRank: 10, credits: 50, title: 'Top 10 weekly reward' },
];

export const BOOST_WEEKLY_PRIZES = [
  { minRank: 1, maxRank: 1, rewardId: 'featured_row_24h', title: 'Rank #1 featured reward' },
  { minRank: 2, maxRank: 2, rewardId: 'highlight_badge_7d', title: 'Rank #2 highlight reward' },
  { minRank: 3, maxRank: 3, credits: 100, title: 'Rank #3 credit reward' },
  { minRank: 4, maxRank: 10, credits: 30, title: 'Top 10 credit reward' },
];

export const getWeeklyPrizeForRank = (type, rank) => {
  const rules = type === LEADERBOARD_TYPES.boost ? BOOST_WEEKLY_PRIZES : REWARDS_WEEKLY_PRIZES;
  return rules.find((rule) => rank >= rule.minRank && rank <= rule.maxRank) || null;
};

export const getWeekBounds = (baseDate = new Date()) => {
  const current = new Date(baseDate);
  const utcDay = current.getUTCDay();
  const dayOffset = utcDay === 0 ? -6 : 1 - utcDay;
  const weekStart = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + dayOffset,
    0,
    0,
    0,
    0
  ));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return {
    weekStart,
    weekEnd,
  };
};

export const getPreviousWeekBounds = (baseDate = new Date()) => {
  const { weekStart } = getWeekBounds(baseDate);
  const previousStart = new Date(weekStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  const previousEnd = new Date(weekStart);
  return {
    weekStart: previousStart,
    weekEnd: previousEnd,
  };
};

export const getLeaderboardLabel = (type) =>
  type === LEADERBOARD_TYPES.boost ? 'Top Promoters This Week' : 'Top Referrers This Week';

