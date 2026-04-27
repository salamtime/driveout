import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const RewardToast = ({ reward }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reward?.id) return undefined;
    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [reward?.id]);

  if (!reward?.id || !visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[120] max-w-sm animate-[fade-in_180ms_ease-out] rounded-[1.4rem] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_22px_44px_rgba(91,33,182,0.18)] backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-violet-100 p-2 text-violet-700">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{reward.title || 'Reward unlocked'}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{reward.body}</p>
        </div>
      </div>
    </div>
  );
};

export default RewardToast;

