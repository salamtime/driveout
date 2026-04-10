import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, CreditCard, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { selectBusinessOwnerPlan } from '../services/UserService';
import i18n from '../i18n';

const PLAN_DEFINITIONS = [
  {
    id: 'saas',
    title: { en: 'SaaS Only', fr: 'SaaS uniquement' },
    price: { en: '299 DH / month', fr: '299 DH / mois' },
    accent: 'from-slate-950 via-violet-950 to-violet-700',
    features: {
      en: [
        'Fleet + rentals management',
        'Calendar + pricing',
        'Customers',
        'Tasks + alerts',
        'Up to 10 vehicles',
        '3 staff users',
        'Not listed on DriveOut marketplace',
      ],
      fr: [
        'Gestion flotte + locations',
        'Calendrier + tarification',
        'Clients',
        'Tâches + alertes',
        'Jusqu’à 10 véhicules',
        '3 utilisateurs staff',
        'Pas listé sur la marketplace DriveOut',
      ],
    },
  },
  {
    id: 'saas_web',
    title: { en: 'SaaS + Marketplace', fr: 'SaaS + Marketplace' },
    price: { en: '499 DH / month', fr: '499 DH / mois' },
    accent: 'from-violet-700 via-fuchsia-700 to-indigo-700',
    recommended: true,
    features: {
      en: [
        'Everything in SaaS',
        'Listed on DriveOut marketplace',
        'Receive bookings from platform traffic',
        'Up to 30 vehicles',
        '8 staff users',
        '10% commission on marketplace bookings only',
      ],
      fr: [
        'Tout ce qui est inclus dans SaaS',
        'Listé sur la marketplace DriveOut',
        'Recevez des réservations depuis le trafic plateforme',
        'Jusqu’à 30 véhicules',
        '8 utilisateurs staff',
        '10 % de commission uniquement sur les réservations marketplace',
      ],
    },
  },
];

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { userProfile, refreshPermissions } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [submittingPlan, setSubmittingPlan] = useState('');
  const trialEndsAt = userProfile?.trialEndsAt;

  const trialDaysRemaining = useMemo(() => {
    if (!trialEndsAt) return null;
    const diff = new Date(trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }, [trialEndsAt]);

  const handleSelectPlan = async (planId) => {
    try {
      setSubmittingPlan(planId);
      await selectBusinessOwnerPlan(planId);
      await refreshPermissions();
      navigate('/pending-approval', { replace: true });
    } catch (error) {
      alert(error?.message || tr('Unable to save the selected plan right now.', "Impossible d'enregistrer le forfait pour le moment."));
    } finally {
      setSubmittingPlan('');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {tr('Subscription setup', 'Configuration abonnement')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {tr('Choose your DriveOut plan', 'Choisissez votre forfait DriveOut')}
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-medium text-violet-100">
              {tr(
                'Your business owner account is approved. Pick the package that matches how you want to operate.',
                "Votre compte business est approuvé. Choisissez le forfait qui correspond à votre mode d'exploitation."
              )}
            </p>
          </div>

          <div className="space-y-4 px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
              <Sparkles className="h-5 w-5 text-violet-700" />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {tr('30-day free trial active', 'Essai gratuit de 30 jours actif')}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {trialDaysRemaining === null
                    ? tr('Choose your plan at any time during the trial.', 'Choisissez votre forfait à tout moment pendant la période d’essai.')
                    : tr(`${trialDaysRemaining} day(s) remaining. Choose a plan any time.`, `Il reste ${trialDaysRemaining} jour(s). Choisissez un forfait à tout moment.`)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {PLAN_DEFINITIONS.map((plan) => {
            const title = isFrench ? plan.title.fr : plan.title.en;
            const price = isFrench ? plan.price.fr : plan.price.en;
            const features = isFrench ? plan.features.fr : plan.features.en;
            const isSubmitting = submittingPlan === plan.id;

            return (
              <section key={plan.id} className="overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className={`bg-gradient-to-br ${plan.accent} px-6 py-6 text-white`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black">{title}</h2>
                      <p className="mt-2 text-sm font-medium text-white/85">{price}</p>
                    </div>
                    {plan.recommended ? (
                      <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                        {tr('Recommended', 'Recommandé')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 px-6 py-6">
                  <div className="space-y-3">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
                        <p className="text-sm font-medium text-slate-700">{feature}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={Boolean(submittingPlan)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <CreditCard className="h-4 w-4" />
                    <span>{isSubmitting ? tr('Saving...', 'Enregistrement...') : tr('Select Plan', 'Choisir ce forfait')}</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
