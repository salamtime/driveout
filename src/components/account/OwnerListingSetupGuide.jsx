import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Circle, Clock3, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const getStatusMeta = (status, tr) => ({
  done: {
    label: tr('Done', 'Terminé'),
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
    dotClassName: 'bg-emerald-500',
  },
  active: {
    label: tr('Next', 'Suivant'),
    className: 'border-violet-200 bg-violet-50 text-violet-700',
    icon: Circle,
    dotClassName: 'bg-violet-500',
  },
  waiting: {
    label: tr('Waiting', 'En attente'),
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: Clock3,
    dotClassName: 'bg-sky-500',
  },
  issue: {
    label: tr('Fix needed', 'À corriger'),
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: AlertTriangle,
    dotClassName: 'bg-amber-500',
  },
  locked: {
    label: tr('Locked', 'Verrouillé'),
    className: 'border-slate-200 bg-slate-50 text-slate-500',
    icon: Lock,
    dotClassName: 'bg-slate-300',
  },
  todo: {
    label: tr('Later', 'Après'),
    className: 'border-slate-200 bg-slate-50 text-slate-500',
    icon: Circle,
    dotClassName: 'bg-slate-300',
  },
}[status] || {
  label: tr('Later', 'Après'),
  className: 'border-slate-200 bg-slate-50 text-slate-500',
  icon: Circle,
  dotClassName: 'bg-slate-300',
});

const getStepTarget = (step) => ({
  to: step?.target?.to || step?.to || '#',
  state: step?.target?.state || step?.state,
});

const OwnerListingSetupGuide = ({
  progress,
  tr = (en) => en,
  onStepClick,
  onStepAction,
  variant = 'full',
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!progress?.currentStep || !Array.isArray(progress?.steps)) {
    return null;
  }

  const currentMeta = getStatusMeta(progress.currentStep.status, tr);
  const currentTarget = getStepTarget(progress.currentStep);

  if (variant === 'compact') {
    return (
      <section className={`rounded-[1.45rem] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_14px_36px_rgba(91,33,182,0.08)] backdrop-blur ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-500">
                {tr('Listing setup', "Configuration de l'annonce")}
              </p>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${currentMeta.className}`}>
                {currentMeta.label}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-black text-slate-950">
              {tr('Step', 'Étape')} {progress.currentStep.stepNumber || progress.currentStepNumber}: {progress.currentStep.title}
            </p>
          </div>

          <div className="hidden min-w-[150px] sm:block">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>{progress.completedSteps}/{progress.totalSteps}</span>
              <span>{progress.progressPercent}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-violet-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-[width] duration-300"
                style={{ width: `${progress.visualProgressPercent}%` }}
              />
            </div>
          </div>

          <Link
            to={currentTarget.to}
            state={currentTarget.state}
            onClick={(event) => {
              if (onStepAction?.(progress.currentStep)) {
                event.preventDefault();
                return;
              }
              onStepClick?.(progress.currentStep);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(91,33,182,0.22)] transition hover:translate-y-[-1px]"
          >
            <span>{progress.currentStep.ctaLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {progress.steps.map((step) => {
            const meta = getStatusMeta(step.status, tr);
            const target = getStepTarget(step);

            return (
              <Link
                key={step.key}
                to={target.to}
                state={target.state}
                onClick={(event) => {
                  if (onStepAction?.(step)) {
                    event.preventDefault();
                    return;
                  }
                  onStepClick?.(step);
                }}
                title={step.title}
                className={`flex h-2 min-w-10 flex-1 rounded-full transition hover:opacity-80 ${meta.dotClassName}`}
              />
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-[1.7rem] border border-violet-200 bg-white p-5 shadow-[0_18px_48px_rgba(91,33,182,0.08)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
            {tr('List your vehicle', 'Listez votre véhicule')}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              {tr('One setup path', 'Un seul parcours')}
            </h2>
            <span className={`mb-1 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${currentMeta.className}`}>
              {currentMeta.label}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600">
            {tr(
              'Finish each step once. We will send you to the exact section that needs attention next.',
              'Terminez chaque étape une fois. Nous vous envoyons directement vers la section qui demande une action.'
            )}
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            {tr('Progress', 'Progression')}
          </p>
          <p className="mt-1 text-3xl font-black text-slate-950">
            {progress.completedSteps}/{progress.totalSteps}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span>{tr('Step progress', 'Progression des étapes')}</span>
          <span>{progress.progressPercent}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-violet-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-[width] duration-300"
            style={{ width: `${progress.visualProgressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-[1.45rem] border border-violet-100 bg-[linear-gradient(135deg,#faf5ff_0%,#ffffff_100%)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              {tr('Next step', 'Prochaine étape')}
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-950">
              {tr('Step', 'Étape')} {progress.currentStep.stepNumber || progress.currentStepNumber}: {progress.currentStep.title}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {progress.currentStep.detail}
            </p>
          </div>

          <Link
            to={currentTarget.to}
            state={currentTarget.state}
            onClick={(event) => {
              if (onStepAction?.(progress.currentStep)) {
                event.preventDefault();
                return;
              }
              onStepClick?.(progress.currentStep);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_34px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
          >
            <span>{progress.currentStep.ctaLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-6">
        {progress.steps.map((step) => {
          const meta = getStatusMeta(step.status, tr);
          const Icon = meta.icon;
          const target = getStepTarget(step);

          return (
            <Link
              key={step.key}
              to={target.to}
              state={target.state}
              onClick={(event) => {
                if (onStepAction?.(step)) {
                  event.preventDefault();
                  return;
                }
                onStepClick?.(step);
              }}
              className="group rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-violet-200 hover:bg-violet-50/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClassName}`} />
                <Icon className="h-4 w-4 text-slate-400 transition group-hover:text-violet-600" />
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                {tr('Step', 'Étape')} {step.stepNumber}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-black text-slate-900">
                {step.title}
              </p>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
      >
        <span>{expanded ? tr('Hide checklist', 'Masquer la checklist') : tr('View full checklist', 'Voir la checklist complète')}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {progress.tasks.map((task) => (
            <div
              key={task.key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                task.done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <CheckCircle2 className={`h-5 w-5 ${task.done ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="text-sm font-bold">{task.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default OwnerListingSetupGuide;
