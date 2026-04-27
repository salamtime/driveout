import React from 'react';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';

const TrustProgressBar = ({ progress = 0, items = [], actionLabel = '', actionTo = '' }) => (
  <div className="rounded-[1.75rem] border border-violet-100 bg-white/92 p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {items.slice(0, 3).map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                item.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {item.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  </div>
);

export default TrustProgressBar;
