import React from 'react';

const AccountStatCard = ({ eyebrow, value, label, tone = 'violet', hint = '', compact = false, className = '' }) => {
  const toneMap = {
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };

  return (
    <div
      className={`flex h-full flex-col rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.05)] ${
        compact
          ? 'min-h-[9.25rem] min-w-[15.5rem] snap-start p-4'
          : 'min-h-[11.5rem] p-5'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${toneMap[tone] || toneMap.violet}`}>
          {eyebrow}
        </span>
      </div>

      <div className={`${compact ? 'mt-4' : 'mt-5'} flex flex-1 flex-col justify-between`}>
        <div>
          <p className={`${compact ? 'text-2xl' : 'text-3xl'} font-black tracking-tight text-slate-950`}>{value}</p>
          <p className={`mt-2 ${compact ? 'max-w-[12rem] text-[13px] leading-5' : 'max-w-[11rem] text-sm leading-6'} font-medium text-slate-600`}>
            {label}
          </p>
        </div>

        {hint ? <p className={`${compact ? 'mt-3 text-[13px] leading-5' : 'mt-4 text-sm leading-6'} text-slate-500`}>{hint}</p> : null}
      </div>
    </div>
  );
};

export default AccountStatCard;
