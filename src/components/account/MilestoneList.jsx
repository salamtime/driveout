import React from 'react';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';

const MilestoneList = ({ milestones = [], compact = false }) => (
  <div className={`space-y-3 ${compact ? '' : 'mt-4'}`}>
    {milestones.map((milestone) => (
      <div
        key={milestone.key}
        className={`flex items-center gap-3 rounded-[1.1rem] border px-4 py-3 transition-all duration-500 ${
          milestone.completed
            ? 'border-emerald-200 bg-emerald-50/90 shadow-[0_12px_30px_rgba(16,185,129,0.12)]'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="shrink-0">
          {milestone.completed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Circle className="h-5 w-5 text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-950">{milestone.label}</p>
          <p className="text-xs font-semibold text-slate-500">{milestone.rewardLabel}</p>
        </div>
        {milestone.completed ? (
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            <Sparkles className="h-3 w-3" />
            Done
          </div>
        ) : null}
      </div>
    ))}
  </div>
);

export default MilestoneList;

