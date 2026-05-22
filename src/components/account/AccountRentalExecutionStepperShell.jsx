import React from 'react';
import {
  workspaceEyebrowClass,
  workspacePanelClass,
  workspaceTitleClass,
} from './accountWorkspaceDesignSystem';
import {
  rentalFlowActionDockClass,
} from '../rentals/rentalFlowDesignSystem';

const footerDockClass =
  rentalFlowActionDockClass ||
  'pointer-events-auto fixed bottom-4 left-4 right-4 z-30 rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur';

const STATUS_CARD_TONES = {
  slate: {
    shell: 'border-slate-200 bg-white',
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-950',
    detail: 'text-slate-500',
  },
  violet: {
    shell: 'border-violet-200 bg-violet-50',
    icon: 'bg-violet-100 text-violet-700',
    value: 'text-violet-950',
    detail: 'text-violet-700',
  },
  sky: {
    shell: 'border-sky-200 bg-sky-50',
    icon: 'bg-sky-100 text-sky-700',
    value: 'text-sky-950',
    detail: 'text-sky-700',
  },
  emerald: {
    shell: 'border-emerald-200 bg-emerald-50',
    icon: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-950',
    detail: 'text-emerald-700',
  },
  amber: {
    shell: 'border-amber-200 bg-amber-50',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-950',
    detail: 'text-amber-700',
  },
};

export const AccountRentalExecutionStagePill = ({ label, active = false }) => (
  <span
    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
      active
        ? 'bg-violet-600 text-white shadow-[0_10px_20px_rgba(124,58,237,0.22)]'
        : 'border border-slate-200 bg-white text-slate-500'
    }`}
  >
    {label}
  </span>
);

export const AccountRentalExecutionStatusCard = ({
  eyebrow,
  value,
  detail,
  icon: Icon = null,
  tone = 'slate',
}) => {
  const toneClasses = STATUS_CARD_TONES[tone] || STATUS_CARD_TONES.slate;
  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 shadow-[0_12px_30px_rgba(76,29,149,0.05)] ${toneClasses.shell}`}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClasses.icon}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p> : null}
          <p className={`mt-1 text-sm font-semibold ${toneClasses.value}`}>{value}</p>
          {detail ? <p className={`mt-1 text-xs leading-5 ${toneClasses.detail}`}>{detail}</p> : null}
        </div>
      </div>
    </div>
  );
};

export const AccountRentalExecutionStickyFooter = ({
  progressLabel = '',
  progressValue = '',
  progressValueClassName = 'text-slate-950',
  helper = '',
  secondaryLabel = 'Next',
  secondaryValue = '',
  secondaryValueClassName = 'text-slate-950',
  primaryAction = null,
  secondaryAction = null,
}) => {
  const PrimaryActionIcon = primaryAction?.icon || null;
  const actionValue = secondaryValue || primaryAction?.label || helper || '—';
  const primaryDisabled = Boolean(primaryAction?.disabled);
  const secondaryDisabled = Boolean(secondaryAction?.disabled);
  const primaryClassName = primaryDisabled
    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
    : primaryAction?.tone === 'amber'
      ? 'bg-amber-500 text-white shadow-[0_14px_32px_rgba(245,158,11,0.24)] hover:bg-amber-600'
      : 'bg-violet-700 text-white shadow-[0_14px_32px_rgba(76,29,149,0.24)] hover:bg-violet-800';

  return (
    <div className={footerDockClass}>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-2">
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          {progressLabel ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {progressLabel}
            </p>
          ) : null}
          <p
            className={`light-rental-footer-timer-value mt-2 font-extrabold tabular-nums ${progressValueClassName}`}
            style={{ fontSize: '1.5rem', lineHeight: '0.98', letterSpacing: '-0.04em' }}
          >
            {progressValue || '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {secondaryLabel}
          </p>
          <p
            className={`light-rental-footer-timer-value mt-2 line-clamp-2 font-extrabold ${secondaryValueClassName}`}
            style={{ fontSize: '1.5rem', lineHeight: '0.98', letterSpacing: '-0.04em' }}
          >
            {actionValue}
          </p>
        </div>
      </div>

      {primaryAction?.label ? (
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryDisabled}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-bold transition ${primaryClassName}`}
        >
          {PrimaryActionIcon ? <PrimaryActionIcon className="h-5 w-5" /> : null}
          {primaryAction.label}
        </button>
      ) : null}

      {secondaryAction?.label ? (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          disabled={secondaryDisabled}
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition ${
            secondaryDisabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
              : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
          }`}
        >
          {secondaryAction.label}
        </button>
      ) : null}
    </div>
  );
};

const OverviewStep = ({ step }) => (
  <div
    className={`rounded-2xl border px-4 py-3 ${
      step.done
        ? 'border-emerald-200 bg-emerald-50'
        : step.active
          ? 'border-violet-200 bg-violet-50'
          : 'border-slate-200 bg-white'
    }`}
  >
    <p className={`text-sm font-semibold ${step.done || step.active ? 'text-slate-950' : 'text-slate-600'}`}>
      {step.label}
    </p>
  </div>
);

const AccountRentalExecutionStepperShell = ({
  variant = 'stepper',
  badge = '',
  badgeTone = '',
  customerLabel = '',
  title = '',
  description = '',
  metaLine = '',
  moneyPanel = null,
  summaryPanel = null,
  progressLabel = '',
  progressValue = '',
  progressHint = '',
  progressPercent = 0,
  statusTitle = '',
  statusNote = '',
  stagePills = [],
  overviewSteps = [],
  statusCards = [],
  children = null,
  footer = null,
}) => {
  const hasHeader = Boolean(badge || customerLabel || title || description || metaLine || moneyPanel);

  if (variant === 'rentalDetails') {
    return (
      <div className="relative overflow-visible">
        {hasHeader ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {badge || customerLabel ? (
                <div className="flex flex-wrap items-center gap-2">
                  {badge ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeTone}`}>{badge}</span> : null}
                  {customerLabel ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {customerLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {title ? <p className={`${workspaceEyebrowClass} mt-4`}>Rental workflow</p> : null}
              {title ? <h3 className={workspaceTitleClass}>{title}</h3> : null}
              {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
              {metaLine ? <p className="mt-3 text-sm font-semibold text-slate-700">{metaLine}</p> : null}
            </div>
            {moneyPanel ? (
              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-[250px]">
                {moneyPanel}
              </div>
            ) : null}
          </div>
        ) : null}

        {summaryPanel ? <div className={hasHeader ? 'mt-5' : ''}>{summaryPanel}</div> : null}

        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {progressLabel ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{progressLabel}</p> : null}
              {progressHint ? <p className="mt-1 text-sm text-slate-600">{progressHint}</p> : null}
            </div>
            {progressValue ? <p className="text-sm font-bold text-slate-950">{progressValue}</p> : null}
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(Number(progressPercent || 0))))}%` }}
            />
          </div>
        </div>

        <div className="mt-5">
          {children}
        </div>

        {footer}
      </div>
    );
  }

  return (
  <div className={`${workspacePanelClass} relative overflow-visible`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {badge ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeTone}`}>{badge}</span> : null}
          {customerLabel ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {customerLabel}
            </span>
          ) : null}
        </div>
        <p className={`${workspaceEyebrowClass} mt-4`}>Rental workflow</p>
        <h3 className={workspaceTitleClass}>{title}</h3>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
        {metaLine ? <p className="mt-3 text-sm font-semibold text-slate-700">{metaLine}</p> : null}
      </div>
      {moneyPanel ? (
        <div className="w-full rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-[250px]">
          {moneyPanel}
        </div>
      ) : null}
    </div>

    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
      <div className="rounded-[1.5rem] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-[0_18px_40px_rgba(109,40,217,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            {progressLabel ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{progressLabel}</p> : null}
            {progressValue ? <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{progressValue}</p> : null}
            {progressHint ? <p className="mt-2 text-sm text-slate-600">{progressHint}</p> : null}
          </div>
          <div className="rounded-full border border-violet-200 bg-white/90 px-3 py-1 text-xs font-semibold text-violet-700">
            {Math.max(0, Math.min(100, Math.round(Number(progressPercent || 0))))}%
          </div>
        </div>
        <div className="mt-4 h-3 rounded-full bg-white shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, Math.round(Number(progressPercent || 0))))}%` }}
          />
        </div>
        {overviewSteps.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {overviewSteps.map((step) => (
              <OverviewStep key={step.key || step.label} step={step} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status rail</p>
        {statusTitle ? <p className="mt-2 text-lg font-bold text-slate-950">{statusTitle}</p> : null}
        {statusNote ? <p className="mt-1 text-sm text-slate-600">{statusNote}</p> : null}
        {stagePills.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {stagePills.map((pill) => (
              <AccountRentalExecutionStagePill key={pill.label} label={pill.label} active={pill.active} />
            ))}
          </div>
        ) : null}
      </div>
    </div>

    {statusCards.length ? (
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statusCards.map((card) => (
          <AccountRentalExecutionStatusCard
            key={`${card.eyebrow}-${card.value}`}
            eyebrow={card.eyebrow}
            value={card.value}
            detail={card.detail}
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </div>
    ) : null}

    <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-white/90 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)] sm:p-5">
      {children}
    </div>

    {footer}
  </div>
  );
};

export default AccountRentalExecutionStepperShell;
