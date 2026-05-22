export const rentalFlowMobileFooterButtonBaseClass =
  'min-h-[52px] rounded-2xl px-4 py-3 text-xs font-semibold shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition-all';

export const rentalFlowMobileFooterSecondaryClass =
  `${rentalFlowMobileFooterButtonBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

export const rentalFlowMobileFooterPrimaryClass =
  `${rentalFlowMobileFooterButtonBaseClass} border border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:border-violet-700`;

export const rentalFlowMobileFooterSuccessClass =
  `${rentalFlowMobileFooterButtonBaseClass} border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700`;

export const rentalFlowMobileFooterDisabledClass =
  `${rentalFlowMobileFooterButtonBaseClass} border border-slate-200 bg-slate-100 text-slate-400 shadow-none`;

export const rentalFlowActionDockClass =
  'pointer-events-auto fixed bottom-4 left-4 right-4 z-30 rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur lg:left-[calc(50vw+9.5rem)] lg:right-auto lg:w-[min(72rem,calc(100vw-21rem))] lg:-translate-x-1/2';

export const rentalFlowStickyFooterDockClass =
  'fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]';

export const rentalFlowStickyFooterDockCompactClass =
  'fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full';

export const RENTAL_FLOW_VISUAL_STANDARD = {
  goal: 'Use the same exact light-rental stepper language across admin and account surfaces.',
  rules: [
    'Use the floating violet-framed action dock for all stepper next actions.',
    'Keep mobile footer actions as pill buttons with one primary action and clear secondary/disabled states.',
    'Preserve the white surface, soft violet border, and blurred dock shell between admin and website flows.',
    'Reuse these tokens for owner ready-to-start and ready-to-finish instead of reintroducing page-specific variants.',
  ],
};
