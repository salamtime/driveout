import React from 'react';

const toneMap = {
  explorer: 'border-violet-200 bg-violet-50 text-violet-700',
  trusted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  elite: 'border-amber-200 bg-amber-50 text-amber-700',
  starter: 'border-violet-200 bg-violet-50 text-violet-700',
  growing: 'border-sky-200 bg-sky-50 text-sky-700',
  top_promoter: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

const TierBadge = ({ tier, className = '' }) => {
  if (!tier?.title) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${toneMap[tier.id] || toneMap.explorer} ${className}`}
    >
      {tier.title}
    </span>
  );
};

export default TierBadge;

