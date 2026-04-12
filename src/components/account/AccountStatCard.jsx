import React from 'react';

const AccountStatCard = ({ eyebrow, value, label, tone = 'violet', hint = '' }) => {
  const toneMap = {
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{eyebrow}</p>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${toneMap[tone] || toneMap.violet}`}>
          {tone}
        </span>
      </div>
      {hint ? <p className="mt-4 text-sm leading-6 text-slate-500">{hint}</p> : null}
    </div>
  );
};

export default AccountStatCard;
