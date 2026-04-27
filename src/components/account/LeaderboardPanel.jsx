import React from 'react';
import { Crown, Medal, TrendingUp } from 'lucide-react';
import WeeklyCountdown from './WeeklyCountdown';

const rankTone = {
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-slate-100 text-slate-700',
  3: 'bg-orange-100 text-orange-700',
};

const LeaderboardPanel = ({
  eyebrow,
  title,
  leaderboard,
  emptyBody = 'No positions yet this week.',
}) => {
  const top = leaderboard?.top || [];
  const userRank = leaderboard?.userRank || null;
  const nextTarget = leaderboard?.nextTarget || null;

  return (
    <section className="rounded-[2rem] border border-violet-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f5f3ff_100%)] p-5 shadow-[0_18px_42px_rgba(91,33,182,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">{eyebrow}</p>
          ) : null}
          <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
          {nextTarget?.label ? (
            <p className="mt-2 text-sm font-semibold text-slate-600">{nextTarget.label}</p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-slate-600">Weekly competition updates live here.</p>
          )}
        </div>
        <WeeklyCountdown weekEnd={leaderboard?.weekEnd} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4">
          {top.length ? (
            <div className="space-y-3">
              {top.map((entry) => (
                <div key={`${entry.userId}-${entry.rank}`} className="flex items-center gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${rankTone[entry.rank] || 'bg-violet-100 text-violet-700'}`}>
                    {entry.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">{entry.displayName}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {entry.score} · {entry.secondaryScore}
                    </p>
                  </div>
                  {entry.rank === 1 ? <Crown className="h-4 w-4 text-amber-500" /> : <Medal className="h-4 w-4 text-slate-400" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.45rem] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
              {emptyBody}
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-white/70 bg-white/90 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">Your position</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-slate-950">
                {userRank?.rank ? `#${userRank.rank}` : '—'}
              </p>
              <p className="text-sm font-semibold text-slate-500">
                {userRank
                  ? `Score ${userRank.score} · Secondary ${userRank.secondaryScore}`
                  : 'Not ranked yet this week'}
              </p>
            </div>
          </div>
          {userRank?.badge?.title ? (
            <div className="mt-4 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
              {userRank.badge.title}
            </div>
          ) : null}
          {nextTarget?.label ? (
            <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Next target</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{nextTarget.label}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default LeaderboardPanel;
