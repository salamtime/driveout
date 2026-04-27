import React from 'react';

const ProgressBar = ({ value = 0, tone = 'violet', className = '' }) => {
  const percentage = Math.max(0, Math.min(100, Number(value || 0)));

  const barTone =
    tone === 'emerald'
      ? 'from-emerald-500 to-teal-500'
      : tone === 'pink'
        ? 'from-pink-500 via-fuchsia-500 to-violet-500'
        : 'from-violet-600 to-indigo-500';

  return (
    <div className={`h-3 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${barTone} transition-all duration-700 ease-out`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

export default ProgressBar;

