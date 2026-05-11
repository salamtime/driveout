import React from 'react';

const defaultPulseDelays = ['0ms', '160ms', '320ms', '480ms'];

const WorkspaceProgressVisualizer = ({
  progressPercent = 24,
  mode = 'determinate',
  title = '',
  subtitle = '',
  steps = [],
  statusLabel = '',
}) => {
  const normalizedProgress = Math.max(8, Math.min(100, Number(progressPercent) || 0));
  const visibleSteps = Array.isArray(steps) ? steps.slice(0, 4) : [];

  return (
    <div className="rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,243,255,0.92))] p-5 shadow-[0_20px_50px_rgba(76,29,149,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {statusLabel ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-500">{statusLabel}</p>
          ) : null}
          {title ? <p className="mt-2 text-lg font-black text-slate-950">{title}</p> : null}
          {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-inner shadow-violet-100">
          <div className="absolute inset-2 rounded-full border border-violet-100" />
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-3 overflow-hidden rounded-full bg-white/90 ring-1 ring-violet-100">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 transition-all duration-1000 ${
              mode === 'indeterminate' ? 'animate-pulse' : ''
            }`}
            style={{ width: mode === 'indeterminate' ? '72%' : `${normalizedProgress}%` }}
          />
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.0)_35%,rgba(255,255,255,0.65)_50%,rgba(255,255,255,0.0)_65%,transparent_100%)]" />
        </div>

        <div className="mt-4 flex items-center gap-2">
          {defaultPulseDelays.map((delay, index) => (
            <span
              key={delay}
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500/80"
              style={{ animationDelay: delay, animationDuration: '1.2s' }}
            />
          ))}
          <span className="ml-2 text-sm font-semibold text-slate-600">
            {mode === 'indeterminate' ? 'Processing securely…' : `${normalizedProgress}% complete`}
          </span>
        </div>
      </div>

      {visibleSteps.length > 0 ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {visibleSteps.map((step, index) => {
            const complete = step?.complete === true;
            return (
              <div
                key={step?.key || `${index}-${step?.label || 'step'}`}
                className={`rounded-2xl border px-3 py-3 text-sm transition ${
                  complete
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-violet-100 bg-white/90 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
                      complete ? 'bg-emerald-600 text-white' : 'bg-violet-100 text-violet-700'
                    }`}
                  >
                    {complete ? '✓' : index + 1}
                  </span>
                  <span className="font-bold">{step?.label || 'Step'}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default WorkspaceProgressVisualizer;
