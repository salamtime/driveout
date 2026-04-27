import React from 'react';

const TONE_STYLES = {
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
  danger: 'border-rose-100 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  violet: 'border-violet-100 bg-violet-50 text-violet-700',
};

const StatusChip = ({ label, tone = 'neutral', className = '' }) => (
  <span
    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TONE_STYLES[tone] || TONE_STYLES.neutral} ${className}`}
  >
    {label}
  </span>
);

export default StatusChip;
