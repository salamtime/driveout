import React from 'react';

const ActivityItem = ({ icon: Icon, title, body, timestamp = '', imageUrl = '', badge = '' }) => (
  <div className="flex gap-4 rounded-[1.45rem] border border-slate-200 bg-slate-50/70 p-4">
    {imageUrl ? (
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-[1.15rem] border border-slate-200 bg-white shadow-sm">
        <img src={imageUrl} alt={title || 'Activity'} className="h-full w-full object-cover" />
      </div>
    ) : Icon ? (
      <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
    ) : null}
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        {badge ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600 ring-1 ring-violet-100">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
      {timestamp ? <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{timestamp}</p> : null}
    </div>
  </div>
);

export default ActivityItem;
