export const workspacePageShellClass =
  'overflow-hidden rounded-[2rem] border border-violet-200 bg-white p-6 shadow-[0_24px_70px_rgba(91,33,182,0.08)] sm:p-8';

export const workspaceShellClass =
  'rounded-[1.85rem] border border-violet-300 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05),0_0_0_1px_rgba(167,139,250,0.2)] backdrop-blur sm:p-5';

export const workspacePanelClass =
  'rounded-[1.85rem] border border-violet-300 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05),0_0_0_1px_rgba(167,139,250,0.2)]';

export const workspaceInsetPanelClass =
  'rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3';

export const workspaceMetricCardClass =
  'rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(76,29,149,0.05)]';

export const workspaceEmptyStateClass =
  'rounded-[1.75rem] border border-dashed border-slate-200 bg-white/80 p-6';

export const workspaceEyebrowClass =
  'text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500';

export const workspaceTitleClass =
  'mt-2 text-xl font-bold text-slate-950';

export const workspaceSectionDescriptionClass =
  'mt-2 text-sm leading-6 text-slate-600';

export const workspaceLabelClass =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

export const workspaceMetaLabelClass =
  'text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500';

export const workspacePrimaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]';

export const workspacePrimaryButtonStrongClass =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_34px_rgba(79,70,229,0.20)] transition hover:-translate-y-0.5';

export const workspaceSecondaryButtonClass =
  'inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100';

export const workspaceFieldClassName =
  'mt-2 w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100';

export const workspaceFieldLabelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

export const getWorkspaceFocusedSectionClass = (focusedSectionId, sectionId) =>
  focusedSectionId === sectionId
    ? 'ring-2 ring-violet-200 ring-offset-2 ring-offset-white'
    : '';

export const ACCOUNT_WORKSPACE_VISUAL_STANDARD = {
  referencePage: 'My Vehicles',
  rules: [
    'Use violet framed shells for module containers and sticky heroes.',
    'Use uppercase micro-label eyebrows instead of long helper paragraphs.',
    'Use white cards with soft slate inset surfaces for secondary information.',
    'Keep primary actions gradient-violet and secondary actions outlined violet.',
    'Prefer one unified activity/feed area over stacked report sections.',
    'Keep copy short, direct, and secondary to actions and statuses.',
  ],
};
