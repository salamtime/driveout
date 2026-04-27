import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, PlayCircle } from 'lucide-react';
import i18n from '../../i18n';

const getDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getTimerTone = (startDate, endDate, now) => {
  const startedAtTime = startDate?.getTime?.() ?? NaN;
  const plannedEndTime = endDate?.getTime?.() ?? NaN;
  const durationMs = plannedEndTime - startedAtTime;

  if (!Number.isFinite(startedAtTime) || !Number.isFinite(plannedEndTime) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      valueClass: 'text-emerald-600',
      badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      labelClass: 'text-emerald-500',
      expired: false,
    };
  }

  const elapsedMs = Math.max(0, now - startedAtTime);
  const progress = elapsedMs / durationMs;

  if (progress >= 1) {
    return {
      valueClass: 'text-red-600',
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: true,
    };
  }

  if (progress >= 0.75) {
    return {
      valueClass: 'text-red-600',
      badgeClass: 'border border-red-200 bg-red-50 text-red-700',
      labelClass: 'text-red-500',
      expired: false,
    };
  }

  if (progress >= 0.45) {
    return {
      valueClass: 'text-amber-600',
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      labelClass: 'text-amber-500',
      expired: false,
    };
  }

  return {
    valueClass: 'text-emerald-600',
    badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    labelClass: 'text-emerald-500',
    expired: false,
  };
};

const CustomerRentalTimer = ({ rental, variant = 'compact' }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const statusKey = String(rental?.status || '').toLowerCase();
  const isLiveRental = ['active', 'ready_to_finish'].includes(statusKey);

  const startDate = useMemo(
    () => getDateValue(rental?.startedAt || rental?.startDate),
    [rental?.startedAt, rental?.startDate]
  );
  const endDate = useMemo(
    () => getDateValue(rental?.endDate),
    [rental?.endDate]
  );

  useEffect(() => {
    if (!isLiveRental || !startDate) return undefined;

    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isLiveRental, startDate?.getTime?.()]);

  if (!isLiveRental || !startDate) return null;

  const elapsedMs = Math.max(0, currentTime - startDate.getTime());
  const remainingMs = endDate ? endDate.getTime() - currentTime : null;
  const timeRemaining = remainingMs === null ? null : remainingMs <= 0 ? tr('Expired', 'Expirée') : formatDuration(remainingMs);
  const tone = getTimerTone(startDate, endDate, currentTime);

  if (variant === 'panel') {
    return (
      <section className="rounded-[1.5rem] border border-violet-100 bg-[linear-gradient(135deg,_rgba(255,255,255,1)_0%,_rgba(245,243,255,0.92)_100%)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Live rental timer', 'Minuteur location')}</p>
            <h3 className="mt-2 text-sm font-bold text-slate-900">{tr('Time elapsed', 'Temps écoulé')}</h3>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone.badgeClass}`}>
            {statusKey === 'ready_to_finish' ? tr('Ready to return', 'Prête au retour') : tr('Active', 'Active')}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <PlayCircle className="h-4 w-4" />
              {tr('Elapsed', 'Écoulé')}
            </div>
            <p className={`mt-3 font-mono text-3xl font-extrabold tracking-[-0.04em] ${tone.valueClass}`}>
              {formatDuration(elapsedMs)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <Clock3 className="h-4 w-4" />
              {tr('Remaining', 'Restant')}
            </div>
            <p className={`mt-3 font-mono text-3xl font-extrabold tracking-[-0.04em] ${timeRemaining === tr('Expired', 'Expirée') ? 'text-red-600' : 'text-blue-600'}`}>
              {timeRemaining || 'N/A'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${tone.badgeClass}`}>
        <PlayCircle className="h-3.5 w-3.5" />
        {tr('Elapsed', 'Écoulé')} • {formatDuration(elapsedMs)}
      </span>
      <span className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold ${timeRemaining === tr('Expired', 'Expirée') ? 'text-red-600' : 'text-slate-600'}`}>
        <Clock3 className="h-3.5 w-3.5" />
        {tr('Remaining', 'Restant')} • {timeRemaining || 'N/A'}
      </span>
    </div>
  );
};

export default CustomerRentalTimer;
