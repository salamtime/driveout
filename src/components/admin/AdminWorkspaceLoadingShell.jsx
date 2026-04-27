import React from 'react';

const AdminWorkspaceLoadingShell = ({
  eyebrow = 'Workspace',
  title = 'Loading Module',
  description = 'Preparing the workspace...',
  statCount = 4,
  cardRows = 2,
}) => (
  <div className="min-h-screen bg-slate-50">
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <section className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
                <div className="h-6 w-6 animate-pulse rounded-xl bg-violet-200" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{eyebrow}</p>
                <div className="mt-2 h-10 w-72 max-w-full animate-pulse rounded-2xl bg-slate-100" />
                <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-11 w-36 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: statCount }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
            >
              <div className="h-3 w-20 animate-pulse rounded-full bg-violet-100" />
              <div className="mt-4 h-8 w-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="mt-4 h-4 w-32 animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {Array.from({ length: cardRows }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
            >
              <div className="h-3 w-32 animate-pulse rounded-full bg-violet-100" />
              <div className="mt-4 h-8 w-56 animate-pulse rounded-2xl bg-slate-100" />
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((__, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="h-28 animate-pulse rounded-[1.35rem] border border-slate-200 bg-slate-50"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm font-medium text-slate-500">{description}</p>
      </section>
    </div>
  </div>
);

export default AdminWorkspaceLoadingShell;
