export const GROWTH_SHARE_TYPES = {
  rewards: 'rewards',
  boost: 'boost',
};

export const GROWTH_SHORT_CODE_LENGTH = 6;
export const GROWTH_CLICK_DEDUPE_HOURS = 6;

export const REWARDS_MAD_RATE = 2.5;
export const BOOST_MAD_RATE = 2;

export const REWARDS_LEDGER_EVENT_TYPES = {
  milestoneEarned: 'milestone_earned',
  signupBonus: 'signup_bonus',
};

export const BOOST_LEDGER_EVENT_TYPES_PHASE2 = {
  clickEarned: 'click_earned',
  milestoneEarned: 'milestone_earned',
  bookingEarned: 'booking_earned',
};

export const REWARDS_MILESTONES = [
  {
    key: 'rewards_click_1',
    metric: 'clicks',
    threshold: 1,
    credits: 5,
    label: '1 click',
    rewardLabel: '+5 credits',
  },
  {
    key: 'rewards_click_3',
    metric: 'clicks',
    threshold: 3,
    credits: 15,
    label: '3 clicks',
    rewardLabel: '+15 credits',
  },
  {
    key: 'rewards_click_10',
    metric: 'clicks',
    threshold: 10,
    credits: 40,
    label: '10 clicks',
    rewardLabel: '+40 credits',
  },
  {
    key: 'rewards_signup_1',
    metric: 'signups',
    threshold: 1,
    credits: 50,
    label: '1 signup',
    rewardLabel: '+50 credits',
  },
  {
    key: 'rewards_first_signup_bonus',
    metric: 'signups',
    threshold: 1,
    credits: 100,
    label: 'First signup bonus',
    rewardLabel: '+100 credits',
    globalOnce: true,
  },
];

export const BOOST_MILESTONES = [
  {
    key: 'boost_click_1',
    metric: 'clicks',
    threshold: 1,
    credits: 3,
    label: '1 visit',
    rewardLabel: '+3 boost credits',
    handledByEvent: true,
  },
  {
    key: 'boost_click_5',
    metric: 'clicks',
    threshold: 5,
    credits: 15,
    label: '5 visits',
    rewardLabel: '+15 boost credits',
  },
  {
    key: 'boost_click_15',
    metric: 'clicks',
    threshold: 15,
    credits: 50,
    label: '15 visits',
    rewardLabel: '+50 boost credits',
  },
  {
    key: 'boost_booking_1',
    metric: 'bookings',
    threshold: 1,
    credits: 100,
    label: '1 booking',
    rewardLabel: '+100 boost credits',
  },
];

export const getRewardsTier = (clicks = 0) => {
  const total = Number(clicks || 0);
  if (total >= 50) return { id: 'elite', title: 'Elite' };
  if (total >= 10) return { id: 'trusted', title: 'Trusted' };
  return { id: 'explorer', title: 'Explorer' };
};

export const getBoostTier = (clicks = 0) => {
  const total = Number(clicks || 0);
  if (total >= 50) return { id: 'top_promoter', title: 'Top Promoter' };
  if (total >= 10) return { id: 'growing', title: 'Growing' };
  return { id: 'starter', title: 'Starter' };
};

export const getNextIncompleteMilestone = (milestones = []) =>
  milestones.find((milestone) => !milestone.completed) || null;

