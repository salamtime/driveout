import React, { useEffect, useMemo, useState } from 'react';
import { TimerReset } from 'lucide-react';

const formatCountdown = (ms) => {
  const safe = Math.max(0, Number(ms || 0));
  const totalSeconds = Math.floor(safe / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const WeeklyCountdown = ({ weekEnd, label = 'Weekly reset', className = '' }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const countdown = useMemo(() => {
    const end = weekEnd ? new Date(weekEnd).getTime() : 0;
    if (!end) return '—';
    return formatCountdown(end - now);
  }, [now, weekEnd]);

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-600 ${className}`.trim()}>
      <TimerReset className="h-3.5 w-3.5 text-violet-600" />
      <span>{label}</span>
      <span className="text-slate-950">{countdown}</span>
    </div>
  );
};

export default WeeklyCountdown;

