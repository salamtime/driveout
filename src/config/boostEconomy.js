export const BOOST_CURRENCY = {
  code: 'BOOST',
  label: 'Boost Credits',
  shortLabel: 'credits',
};

export const BOOST_MAD_RATE = 2;

export const BOOST_WALLET_MILESTONES = [
  {
    id: 'first_featured_unlock',
    title: 'First featured unlock',
    description: 'Save enough credits to feature one listing for a full day.',
    creditsRequired: 40,
    rewardId: 'featured_row_24h',
  },
  {
    id: 'highlight_ready',
    title: 'Highlight ready',
    description: 'Keep enough credits in your wallet to add a highlight badge for a week.',
    creditsRequired: 60,
    rewardId: 'highlight_badge_7d',
  },
  {
    id: 'top_boost_ready',
    title: 'Top boost ready',
    description: 'Reach the level where you can push one listing toward the top for two days.',
    creditsRequired: 100,
    rewardId: 'top_boost_48h',
  },
];

export const BOOST_MISSION_GROUPS = {
  onboarding: 'onboarding',
  social: 'social',
  traffic: 'traffic',
  referral: 'referral',
  loyalty: 'loyalty',
};

export const BOOST_REWARD_GROUPS = {
  visibility: 'visibility',
  ranking: 'ranking',
  savings: 'savings',
};

export const BOOST_MISSIONS = [
  {
    id: 'daily_visit',
    group: BOOST_MISSION_GROUPS.loyalty,
    title: 'Daily check-in',
    description: 'Open the app and claim your daily Boost Credits.',
    credits: 1,
    cadence: 'daily',
    cap: { type: 'per_day', value: 1 },
    actionLabel: 'Claim visit',
    actionType: 'claim',
    funLabel: 'Warm-up',
    difficulty: 'easy',
  },
  {
    id: 'complete_vehicle_profile',
    group: BOOST_MISSION_GROUPS.onboarding,
    title: 'Complete vehicle profile',
    description: 'Finish the vehicle profile basics and upload the primary photo.',
    credits: 10,
    cadence: 'once',
    cap: { type: 'lifetime', value: 1 },
    actionLabel: 'Finish profile',
    actionType: 'complete',
    funLabel: 'Garage ready',
    difficulty: 'easy',
  },
  {
    id: 'complete_listing_setup',
    group: BOOST_MISSION_GROUPS.onboarding,
    title: 'Complete listing setup',
    description: 'Finish pricing, deposit, and pickup setup for one vehicle.',
    credits: 10,
    cadence: 'once_per_vehicle',
    cap: { type: 'per_vehicle', value: 1 },
    actionLabel: 'Finish listing',
    actionType: 'complete',
    funLabel: 'Market ready',
    difficulty: 'medium',
  },
  {
    id: 'share_listing_link',
    group: BOOST_MISSION_GROUPS.social,
    title: 'Share your listing link',
    description: 'Share the short link to your published listing.',
    credits: 2,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 3 },
    actionLabel: 'Share link',
    actionType: 'share',
    funLabel: 'Quick share',
    difficulty: 'easy',
    requiresPublishedListing: true,
    creditRule: 'Counted when tracked visits arrive from your link.',
  },
  {
    id: 'share_instagram_story',
    group: BOOST_MISSION_GROUPS.social,
    title: 'Share on Instagram',
    description: 'Post your listing to Instagram and keep your link attached.',
    credits: 3,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'Post story',
    actionType: 'share',
    funLabel: 'Story boost',
    difficulty: 'easy',
    requiresPublishedListing: true,
    platform: 'instagram',
    creditRule: 'Create your tracked link, post it, then earn credits from qualified visits.',
  },
  {
    id: 'share_facebook_post',
    group: BOOST_MISSION_GROUPS.social,
    title: 'Share on Facebook',
    description: 'Share your listing post on Facebook.',
    credits: 3,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'Share post',
    actionType: 'share',
    funLabel: 'Social push',
    difficulty: 'easy',
    requiresPublishedListing: true,
    platform: 'facebook',
    creditRule: 'Create your tracked link, share it on Facebook, then earn credits from qualified visits.',
  },
  {
    id: 'share_tiktok_clip',
    group: BOOST_MISSION_GROUPS.social,
    title: 'Share on TikTok',
    description: 'Post a clip or story with your listing short link.',
    credits: 4,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'Post clip',
    actionType: 'share',
    funLabel: 'Clip boost',
    difficulty: 'medium',
    requiresPublishedListing: true,
    platform: 'tiktok',
    creditRule: 'Create your tracked link, add it to your clip bio or caption flow, then earn credits from qualified visits.',
  },
  {
    id: 'qualified_link_click',
    group: BOOST_MISSION_GROUPS.traffic,
    title: 'Earn qualified clicks',
    description: 'Receive tracked visits on your shared listing links.',
    credits: 1,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 20 },
    actionLabel: 'Track clicks',
    actionType: 'traffic',
    funLabel: 'Traffic spark',
    difficulty: 'medium',
    requiresPublishedListing: true,
    creditRule: 'Each qualified tracked visit adds credits automatically.',
  },
  {
    id: 'invite_friend',
    group: BOOST_MISSION_GROUPS.referral,
    title: 'Invite a friend',
    description: 'Send an invite link to another future owner.',
    credits: 10,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 3 },
    actionLabel: 'Invite owner',
    actionType: 'referral',
    funLabel: 'Crew builder',
    difficulty: 'medium',
    creditRule: 'Credits unlock when the invite starts real owner growth.',
  },
  {
    id: 'referral_signup',
    group: BOOST_MISSION_GROUPS.referral,
    title: 'Referral signup',
    description: 'A referred owner joins through your invite link.',
    credits: 25,
    cadence: 'repeatable',
    cap: { type: 'per_month', value: 10 },
    actionLabel: 'Grow network',
    actionType: 'referral',
    funLabel: 'Big win',
    difficulty: 'hard',
    creditRule: 'The reward lands after a referred owner signs up through your tracked invite.',
  },
];

export const BOOST_REWARDS = [
  {
    id: 'featured_row_24h',
    title: 'Featured row for 24h',
    description: 'Place one approved listing in the featured strip for one day.',
    cost: 40,
    group: BOOST_REWARD_GROUPS.visibility,
    durationHours: 24,
    impactLabel: 'High visibility',
    walletGoalLabel: 'Best first redeem',
    redeemLabel: 'Feature listing',
    cashValueMad: 80,
  },
  {
    id: 'highlight_badge_7d',
    title: 'Highlight badge for 7 days',
    description: 'Add a visual highlight badge to one listing for one week.',
    cost: 25,
    group: BOOST_REWARD_GROUPS.visibility,
    durationHours: 24 * 7,
    impactLabel: 'Faster attention',
    walletGoalLabel: 'Easy early win',
    redeemLabel: 'Add highlight',
    cashValueMad: 50,
  },
  {
    id: 'top_boost_48h',
    title: 'Top boost for 48h',
    description: 'Move one listing toward the top of the marketplace for two days.',
    cost: 75,
    group: BOOST_REWARD_GROUPS.ranking,
    durationHours: 48,
    impactLabel: 'Priority ranking',
    walletGoalLabel: 'Power reward',
    redeemLabel: 'Push to top',
    cashValueMad: 150,
  },
  {
    id: 'billing_credit_50',
    title: '50 MAD service credit',
    description: 'Use Boost Credits to offset part of a future paid service.',
    cost: 120,
    group: BOOST_REWARD_GROUPS.savings,
    durationHours: null,
    impactLabel: 'Save real cash',
    walletGoalLabel: 'Later reward',
    redeemLabel: 'Apply credit',
    availability: 'future',
    cashValueMad: 50,
  },
].sort((left, right) => Number(left.cost || 0) - Number(right.cost || 0));

export const BOOST_LEDGER_EVENT_TYPES = {
  missionEarned: 'mission_earned',
  rewardRedeemed: 'reward_redeemed',
  manualAdjustment: 'manual_adjustment',
  promotionalGrant: 'promotional_grant',
};

export const BOOST_ANTI_ABUSE_RULES = {
  maxCreditsPerDay: 60,
  maxCreditsPerWeekFromTraffic: 120,
  qualifiedClickCooldownMinutes: 30,
  requireTrackedShortLink: true,
  requirePublishedListingForSocialMissions: true,
};

export const getBoostMissionById = (missionId) =>
  BOOST_MISSIONS.find((mission) => mission.id === missionId) || null;

export const getBoostRewardById = (rewardId) =>
  BOOST_REWARDS.find((reward) => reward.id === rewardId) || null;

export const getBoostNextWalletMilestone = (balance = 0) =>
  BOOST_WALLET_MILESTONES.find((milestone) => Number(balance || 0) < Number(milestone.creditsRequired || 0)) || null;

export const getBoostMissionGroupLabel = (group, tr = (value) => value) => {
  switch (group) {
    case BOOST_MISSION_GROUPS.onboarding:
      return tr('Setup');
    case BOOST_MISSION_GROUPS.social:
      return tr('Social');
    case BOOST_MISSION_GROUPS.traffic:
      return tr('Traffic');
    case BOOST_MISSION_GROUPS.referral:
      return tr('Referrals');
    case BOOST_MISSION_GROUPS.loyalty:
      return tr('Daily');
    default:
      return tr('Boost');
  }
};

export const getBoostRewardGroupLabel = (group, tr = (value) => value) => {
  switch (group) {
    case BOOST_REWARD_GROUPS.visibility:
      return tr('Visibility');
    case BOOST_REWARD_GROUPS.ranking:
      return tr('Ranking');
    case BOOST_REWARD_GROUPS.savings:
      return tr('Savings');
    default:
      return tr('Boost');
  }
};

export const getBoostRewardValue = (reward) => {
  if (!reward) return 0;
  return Number(reward.cost || 0);
};
