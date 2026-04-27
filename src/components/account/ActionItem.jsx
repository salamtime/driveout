import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const ActionItem = ({
  label,
  detail = '',
  to = '',
  state,
  href = '',
  onClick,
  icon: Icon,
  tone = 'amber',
  emphasis = false,
}) => {
  const toneClass = {
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    rose: 'border-rose-100 bg-rose-50 text-rose-900',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    violet: 'border-violet-100 bg-violet-50 text-violet-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-900';
  const emphasisClass = emphasis
    ? 'shadow-[0_16px_34px_rgba(79,70,229,0.14)] hover:-translate-y-1 hover:shadow-[0_20px_38px_rgba(79,70,229,0.18)] active:translate-y-0 active:scale-[0.99]'
    : 'hover:shadow-sm';
  const baseClass = `flex items-center justify-between gap-3 rounded-[1.45rem] border p-4 transition duration-200 ${toneClass} ${emphasisClass}`;

  const content = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className={`mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-2xl bg-white/90 ${emphasis ? 'h-10 w-10 shadow-[0_10px_22px_rgba(79,70,229,0.16)]' : 'h-9 w-9 shadow-sm'}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          {detail ? <p className="mt-1 text-sm opacity-80">{detail}</p> : null}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 opacity-70" />
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={baseClass}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClass} w-full text-left`}>
        {content}
      </button>
    );
  }

  return (
    <Link to={to} state={state} className={baseClass}>
      {content}
    </Link>
  );
};

export default ActionItem;
