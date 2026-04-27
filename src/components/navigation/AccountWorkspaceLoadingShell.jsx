import React from 'react';

const AccountWorkspaceLoadingShell = ({ cardCount = 2, showStatsRow = true, showHeader = true }) => (
  <div className="space-y-6">
    {showHeader ? (
      <section className="rounded-[1.75rem] border border-violet-100 bg-white/95 p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)] backdrop-blur sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-28 animate-pulse rounded-full bg-violet-100" />
            <div className="mt-3 h-10 w-56 animate-pulse rounded-2xl bg-slate-100" />
            <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-11 w-36 animate-pulse rounded-2xl bg-violet-100" />
        </div>
      </section>
    ) : null}

    {showStatsRow ? (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
          >
            <div className="h-3 w-20 animate-pulse rounded-full bg-violet-100" />
            <div className="mt-4 h-8 w-16 animate-pulse rounded-2xl bg-slate-100" />
            <div className="mt-4 h-4 w-40 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </section>
    ) : null}

    <section className="space-y-4">
      {Array.from({ length: cardCount }).map((_, index) => (
        <div
          key={index}
          className="rounded-[1.85rem] border border-violet-300 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05),0_0_0_1px_rgba(167,139,250,0.2)]"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="h-28 w-36 animate-pulse rounded-[1.5rem] border border-slate-200 bg-slate-100" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <div className="h-8 w-28 animate-pulse rounded-full bg-violet-100" />
                  <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="mt-4 h-8 w-56 max-w-full animate-pulse rounded-2xl bg-slate-100" />
                <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-slate-100" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="h-8 w-32 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-8 w-32 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-8 w-32 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 lg:min-w-[320px]">
              <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-10 w-32 animate-pulse rounded-2xl bg-violet-100" />
                <div className="h-10 w-28 animate-pulse rounded-2xl bg-slate-200" />
                <div className="h-10 w-36 animate-pulse rounded-2xl bg-emerald-100" />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
                  <div className="mt-3 h-5 w-32 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div>
                  <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
                  <div className="mt-3 h-5 w-32 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="h-3 w-24 animate-pulse rounded-full bg-emerald-100" />
              <div className="mt-4 h-6 w-32 animate-pulse rounded-full bg-emerald-100" />
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
              <div className="h-3 w-28 animate-pulse rounded-full bg-sky-100" />
              <div className="mt-4 h-6 w-36 animate-pulse rounded-full bg-sky-100" />
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="h-3 w-28 animate-pulse rounded-full bg-violet-100" />
              <div className="mt-4 h-6 w-36 animate-pulse rounded-full bg-violet-100" />
            </div>
          </div>
        </div>
      ))}
    </section>
  </div>
);

export default AccountWorkspaceLoadingShell;
