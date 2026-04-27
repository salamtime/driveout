import React from 'react';
import { ChevronDown } from 'lucide-react';

const ExpandableSection = ({ title, eyebrow = '', summary = '', count = null, open = false, onToggle, children }) => (
  <section className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{eyebrow}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          {count !== null ? (
            <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              {count}
            </span>
          ) : null}
        </div>
        {summary ? <p className="mt-2 text-sm text-slate-500">{summary}</p> : null}
      </div>
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition ${open ? 'rotate-180' : ''}`}>
        <ChevronDown className="h-5 w-5" />
      </span>
    </button>

    {open ? <div className="border-t border-slate-100 px-5 py-5">{children}</div> : null}
  </section>
);

export default ExpandableSection;
