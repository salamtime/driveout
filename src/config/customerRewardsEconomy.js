export const CUSTOMER_REWARDS_CURRENCY = {
  code: 'RIDE',
  label: 'Ride Credits',
  shortLabel: 'credits',
};

export const CUSTOMER_REWARDS_MAD_RATE = 2.5;

export const CUSTOMER_REWARDS_GROUPS = {
  onboarding: 'onboarding',
  social: 'social',
  referral: 'referral',
  loyalty: 'loyalty',
};

export const CUSTOMER_REWARD_GROUPS = {
  savings: 'savings',
  trust: 'trust',
  access: 'access',
};

export const CUSTOMER_REWARDS_MILESTONES = [
  {
    id: 'first_rebate_ready',
    title: 'First rebate ready',
    description: 'Save enough credits to unlock your first rental rebate.',
    creditsRequired: 20,
    rewardId: 'rental_rebate_50',
  },
  {
    id: 'deposit_relief_ready',
    title: 'Deposit relief ready',
    description: 'Reach the point where trust perks can start lowering friction on rentals.',
    creditsRequired: 45,
    rewardId: 'deposit_relief_pass',
  },
  {
    id: 'city_access_ready',
    title: 'City access ready',
    description: 'Stack enough credits to unlock stronger multi-city rewards later.',
    creditsRequired: 80,
    rewardId: 'city_access_pass',
  },
];

export const CUSTOMER_LOYALTY_TIERS = [
  {
    id: 'explorer',
    title: 'Explorer',
    shortLabel: 'Starter tier',
    description: 'Start earning Ride Credits and build your customer trust base.',
    creditsRequired: 0,
    completedRentalsRequired: 0,
    tone: 'violet',
    benefits: [
      'Access Ride Credits missions',
      'Unlock customer reward redemptions',
      'Start building customer trust history',
    ],
  },
  {
    id: 'trusted',
    title: 'Trusted',
    shortLabel: 'Trust tier',
    description: 'Show consistent customer activity and begin unlocking lower-friction rentals.',
    creditsRequired: 20,
    completedRentalsRequired: 1,
    tone: 'emerald',
    benefits: [
      'Better pricing opportunities',
      'Deposit relief can start applying',
      'Priority access to stronger rental perks',
    ],
  },
  {
    id: 'priority',
    title: 'Priority',
    shortLabel: 'Preferred tier',
    description: 'Keep renting well and sharing SaharaX to unlock stronger marketplace treatment.',
    creditsRequired: 50,
    completedRentalsRequired: 2,
    tone: 'amber',
    benefits: [
      'Stronger discount opportunities',
      'Improved city-access benefits',
      'Faster unlock path for future loyalty rewards',
    ],
  },
  {
    id: 'elite',
    title: 'Elite',
    shortLabel: 'Top tier',
    description: 'Top customer loyalty tier for the strongest trust and rental-side advantages.',
    creditsRequired: 90,
    completedRentalsRequired: 4,
    tone: 'sky',
    benefits: [
      'Best future pricing advantages',
      'Lowest-friction deposit profile',
      'Top access to premium city and partner benefits',
    ],
  },
];

export const CUSTOMER_REWARDS_MISSIONS = [
  {
    id: 'daily_visit',
    group: CUSTOMER_REWARDS_GROUPS.loyalty,
    title: 'Daily check-in',
    description: 'Open the app and claim today’s Ride Credits.',
    credits: 1,
    cadence: 'daily',
    cap: { type: 'per_day', value: 1 },
    actionLabel: 'Claim visit',
    actionType: 'claim',
    funLabel: 'Daily spark',
    difficulty: 'easy',
  },
  {
    id: 'complete_profile',
    group: CUSTOMER_REWARDS_GROUPS.onboarding,
    title: 'Complete profile',
    description: 'Finish your customer profile basics so bookings move faster.',
    credits: 5,
    cadence: 'once',
    cap: { type: 'lifetime', value: 1 },
    actionLabel: 'Finish profile',
    actionType: 'complete',
    funLabel: 'Profile ready',
    difficulty: 'easy',
  },
  {
    id: 'first_marketplace_request',
    group: CUSTOMER_REWARDS_GROUPS.onboarding,
    title: 'Send your first marketplace request',
    description: 'Start a real request so conversations with owners can begin.',
    credits: 8,
    cadence: 'once',
    cap: { type: 'lifetime', value: 1 },
    actionLabel: 'Open marketplace',
    actionType: 'open',
    funLabel: 'First move',
    difficulty: 'easy',
  },
  {
    id: 'first_completed_rental',
    group: CUSTOMER_REWARDS_GROUPS.loyalty,
    title: 'Complete your first rental',
    description: 'Finish one rental successfully to start your trust journey.',
    credits: 12,
    cadence: 'once',
    cap: { type: 'lifetime', value: 1 },
    actionLabel: 'Open rentals',
    actionType: 'open',
    funLabel: 'Road unlocked',
    difficulty: 'medium',
  },
  {
    id: 'share_marketplace_link',
    group: CUSTOMER_REWARDS_GROUPS.social,
    title: 'Share on WhatsApp',
    description: 'Send the marketplace link on WhatsApp and bring more traffic into the app.',
    credits: 2,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 3 },
    actionLabel: 'WhatsApp link',
    actionType: 'share',
    funLabel: 'Chat push',
    difficulty: 'easy',
    platform: 'whatsapp',
  },
  {
    id: 'share_instagram',
    group: CUSTOMER_REWARDS_GROUPS.social,
    title: 'Share on Instagram',
    description: 'Post your marketplace link on Instagram and push traffic back here.',
    credits: 3,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'Instagram link',
    actionType: 'share',
    funLabel: 'Story push',
    difficulty: 'easy',
    platform: 'instagram',
  },
  {
    id: 'share_youtube',
    group: CUSTOMER_REWARDS_GROUPS.social,
    title: 'Share on YouTube',
    description: 'Drop your marketplace link into a short video or community post.',
    credits: 4,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'YouTube link',
    actionType: 'share',
    funLabel: 'Video push',
    difficulty: 'medium',
    platform: 'youtube',
  },
  {
    id: 'share_facebook',
    group: CUSTOMER_REWARDS_GROUPS.social,
    title: 'Share on Facebook',
    description: 'Post your marketplace link on Facebook and push quick traffic back here.',
    credits: 3,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'Facebook link',
    actionType: 'share',
    funLabel: 'Feed push',
    difficulty: 'easy',
    platform: 'facebook',
  },
  {
    id: 'share_tiktok',
    group: CUSTOMER_REWARDS_GROUPS.social,
    title: 'Share on TikTok',
    description: 'Share the marketplace through TikTok and drive people back into the app.',
    credits: 4,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 2 },
    actionLabel: 'TikTok link',
    actionType: 'share',
    funLabel: 'Clip push',
    difficulty: 'medium',
    platform: 'tiktok',
  },
  {
    id: 'invite_friend',
    group: CUSTOMER_REWARDS_GROUPS.referral,
    title: 'Invite a friend',
    description: 'Send an invite link to someone who could book through SaharaX.',
    credits: 10,
    cadence: 'repeatable',
    cap: { type: 'per_day', value: 3 },
    actionLabel: 'Invite friend',
    actionType: 'referral',
    funLabel: 'Crew builder',
    difficulty: 'medium',
  },
  {
    id: 'referral_signup',
    group: CUSTOMER_REWARDS_GROUPS.referral,
    title: 'Referral signup',
    description: 'A referred customer signs up using your invite path.',
    credits: 20,
    cadence: 'repeatable',
    cap: { type: 'per_month', value: 10 },
    actionLabel: 'Grow community',
    actionType: 'referral',
    funLabel: 'Big win',
    difficulty: 'hard',
  },
];

export const CUSTOMER_REWARDS = [
  {
    id: 'rental_rebate_50',
    title: '50 MAD rental rebate',
    description: 'Use credits to offset part of a future rental payment.',
    cost: 20,
    group: CUSTOMER_REWARD_GROUPS.savings,
    impactLabel: 'Save on rentals',
    redeemLabel: 'Redeem rebate',
    walletGoalLabel: 'Best first reward',
  },
  {
    id: 'deposit_relief_pass',
    title: 'Deposit relief pass',
    description: 'Unlock a future reduced-damage-deposit benefit as trust grows.',
    cost: 45,
    group: CUSTOMER_REWARD_GROUPS.trust,
    impactLabel: 'Lower friction',
    redeemLabel: 'Unlock relief',
    walletGoalLabel: 'Trust reward',
  },
  {
    id: 'city_access_pass',
    title: 'City access pass',
    description: 'Open better access to other cities and stronger rental advantages later.',
    cost: 80,
    group: CUSTOMER_REWARD_GROUPS.access,
    impactLabel: 'Travel advantage',
    redeemLabel: 'Unlock access',
    walletGoalLabel: 'Expansion reward',
  },
  {
    id: 'loyalty_fast_lane',
    title: 'Priority loyalty lane',
    description: 'Reserve a future premium loyalty benefit across the rental journey.',
    cost: 120,
    group: CUSTOMER_REWARD_GROUPS.trust,
    impactLabel: 'Premium treatment',
    redeemLabel: 'Reserve reward',
    walletGoalLabel: 'Future unlock',
    availability: 'future',
  },
].sort((left, right) => Number(left.cost || 0) - Number(right.cost || 0));

export const CUSTOMER_REWARDS_LEDGER_EVENT_TYPES = {
  missionEarned: 'mission_earned',
  rewardRedeemed: 'reward_redeemed',
  manualAdjustment: 'manual_adjustment',
  promotionalGrant: 'promotional_grant',
};

export const CUSTOMER_REWARDS_ANTI_ABUSE_RULES = {
  maxCreditsPerDay: 40,
  maxCreditsPerWeekFromShares: 70,
  maxInvitesPerDay: 3,
  socialMissionCooldownMinutes: 30,
};

export const getCustomerRewardsMissionById = (missionId) =>
  CUSTOMER_REWARDS_MISSIONS.find((mission) => mission.id === missionId) || null;

export const getCustomerRewardById = (rewardId) =>
  CUSTOMER_REWARDS.find((reward) => reward.id === rewardId) || null;

export const getCustomerRewardsNextMilestone = (balance = 0) =>
  CUSTOMER_REWARDS_MILESTONES.find((milestone) => Number(balance || 0) < Number(milestone.creditsRequired || 0)) || null;

export const getCustomerLoyaltyTierById = (tierId) =>
  CUSTOMER_LOYALTY_TIERS.find((tier) => tier.id === tierId) || null;

export const getCustomerNextLoyaltyTier = ({ balance = 0, completedRentals = 0 } = {}) =>
  CUSTOMER_LOYALTY_TIERS.find(
    (tier) =>
      Number(balance || 0) < Number(tier.creditsRequired || 0) ||
      Number(completedRentals || 0) < Number(tier.completedRentalsRequired || 0)
  ) || null;

export const getCustomerLoyaltyTierLabel = (tierId, tr = (value) => value) => {
  switch (tierId) {
    case 'explorer':
      return tr('Explorer', 'Explorateur');
    case 'trusted':
      return tr('Trusted', 'Fiable');
    case 'priority':
      return tr('Priority', 'Priorité');
    case 'elite':
      return tr('Elite', 'Élite');
    default:
      return tr('Customer tier', 'Niveau client');
  }
};

export const getCustomerRewardsMissionGroupLabel = (group, tr = (value) => value) => {
  switch (group) {
    case CUSTOMER_REWARDS_GROUPS.onboarding:
      return tr('Starter tasks', 'Tâches de départ');
    case CUSTOMER_REWARDS_GROUPS.social:
      return tr('Marketing missions', 'Missions marketing');
    case CUSTOMER_REWARDS_GROUPS.referral:
      return tr('Referrals', 'Parrainage');
    case CUSTOMER_REWARDS_GROUPS.loyalty:
      return tr('Loyalty', 'Fidélité');
    default:
      return tr('Rewards', 'Récompenses');
  }
};

export const getCustomerRewardGroupLabel = (group, tr = (value) => value) => {
  switch (group) {
    case CUSTOMER_REWARD_GROUPS.savings:
      return tr('Rental savings', 'Économies location');
    case CUSTOMER_REWARD_GROUPS.trust:
      return tr('Trust perks', 'Avantages confiance');
    case CUSTOMER_REWARD_GROUPS.access:
      return tr('Access perks', 'Avantages accès');
    default:
      return tr('Rewards', 'Récompenses');
  }
};
