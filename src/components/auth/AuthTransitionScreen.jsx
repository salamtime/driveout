import React from 'react';
import { ShieldCheck } from 'lucide-react';
import i18n from '../../i18n';

const AuthTransitionScreen = ({
  title,
  description,
  badge,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#f8f7ff_0%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white/85 shadow-[0_30px_90px_rgba(76,29,149,0.14)] backdrop-blur sm:rounded-[2.25rem] lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_32%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {badge || tr('Saharax Workspace', 'Espace Saharax')}
              </div>

              <div className="mt-8 max-w-xl">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {title || tr('Preparing secure access', 'Préparation de l’accès sécurisé')}
                </h1>
                <p className="mt-4 max-w-lg text-base leading-7 text-violet-100 sm:text-lg">
                  {description || tr('We are loading your SaharaX workspace.', 'Nous préparons votre espace SaharaX.')}
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center bg-white/90 px-6 py-12 sm:px-8 lg:px-10 lg:py-14">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 shadow-inner shadow-violet-100">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
              </div>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Secure transition', 'Transition sécurisée')}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
                {tr(
                  'Please wait a moment while we take you to the right workspace.',
                  'Veuillez patienter pendant que nous vous redirigeons vers le bon espace.'
                )}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AuthTransitionScreen;
