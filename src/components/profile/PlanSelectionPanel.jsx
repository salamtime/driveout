import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, FileBadge2, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { selectBusinessOwnerPlan } from '../../services/UserService';
import { normalizeTenantPlanType } from '../../config/tenantPlans';
import i18n from '../../i18n';

const PLAN_DEFINITIONS = [
  {
    id: 'free',
    title: { en: 'Free', fr: 'Gratuit' },
    eyebrow: { en: 'Current baseline', fr: 'Base actuelle' },
    price: { en: '0 DH / month', fr: '0 DH / mois' },
    summary: {
      en: 'Start light with the core workspace for rentals, fleet, customers, documents, and base rental pricing.',
      fr: "Démarrez léger avec l'espace de base pour locations, flotte, clients, documents et la tarification de base.",
    },
    accent: 'from-white via-slate-50 to-violet-50/60',
    tone: 'border-slate-200',
    features: {
      en: ['Dashboard + rentals', 'Fleet + customers', 'Basic documents', 'Rental pricing management', '5 vehicles', '1 staff account'],
      fr: ['Dashboard + locations', 'Flotte + clients', 'Documents de base', 'Gestion tarifaire location', '5 véhicules', '1 compte staff'],
    },
  },
  {
    id: 'starter',
    title: { en: 'Starter', fr: 'Starter' },
    eyebrow: { en: 'Launch online', fr: 'Lancement en ligne' },
    price: { en: '299 DH / month', fr: '299 DH / mois' },
    summary: {
      en: 'Add calendar, messaging, verification, and public booking essentials.',
      fr: 'Ajoutez calendrier, messagerie, vérification et les essentiels de réservation publique.',
    },
    accent: 'from-white via-violet-50/80 to-indigo-50/50',
    tone: 'border-violet-200',
    features: {
      en: ['Everything in Free', 'Calendar + alerts', 'Messaging + verification', 'Public storefront + online booking', '10 vehicles', '3 staff accounts'],
      fr: ['Tout le Gratuit', 'Calendrier + alertes', 'Messagerie + vérification', 'Vitrine publique + réservation en ligne', '10 véhicules', '3 comptes staff'],
    },
  },
  {
    id: 'growth',
    title: { en: 'Growth', fr: 'Growth' },
    eyebrow: { en: 'Operate at scale', fr: "Opérer à l'échelle" },
    price: { en: '499 DH / month', fr: '499 DH / mois' },
    summary: {
      en: 'Unlock advanced pricing rules, finance, maintenance, OCR, tours, and marketplace operations.',
      fr: 'Débloquez les règles tarifaires avancées, la finance, la maintenance, l’OCR, les tours et les opérations marketplace.',
    },
    accent: 'from-violet-50 via-white to-indigo-50/70',
    tone: 'border-violet-200',
    recommended: true,
    features: {
      en: ['Everything in Starter', 'Pricing + KM packages + fuel rules', 'Finance, fuel, maintenance', 'Tours, tasks, live map, inventory', 'OCR + WhatsApp tools', '30 vehicles / 10 staff'],
      fr: ['Tout le Starter', 'Tarification + packs KM + règles carburant', 'Finance, carburant, maintenance', 'Tours, tâches, live map, inventaire', 'OCR + outils WhatsApp', '30 véhicules / 10 comptes staff'],
    },
  },
  {
    id: 'pro',
    title: { en: 'Pro', fr: 'Pro' },
    eyebrow: { en: 'Full control', fr: 'Contrôle total' },
    price: { en: '899 DH / month', fr: '899 DH / mois' },
    summary: {
      en: 'Advanced roles, website editor, export, reporting, and multilingual storefront.',
      fr: 'Rôles avancés, éditeur de site, export, reporting et vitrine multilingue.',
    },
    accent: 'from-white via-violet-50/70 to-slate-50',
    tone: 'border-violet-200',
    features: {
      en: ['Everything in Growth', 'Website editor', 'Advanced staff roles', 'Project export', 'Advanced reporting', '100 vehicles / 30 staff'],
      fr: ['Tout le Growth', 'Éditeur de site', 'Rôles staff avancés', 'Export projet', 'Reporting avancé', '100 véhicules / 30 comptes staff'],
    },
  },
];

const planBadgeTone = {
  free: 'border-slate-200 bg-slate-50 text-slate-700',
  starter: 'border-violet-200 bg-violet-50 text-violet-700',
  growth: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  pro: 'border-violet-200 bg-violet-50 text-violet-700',
};

const planRank = ['free', 'starter', 'growth', 'pro'];

const PlanSelectionPanel = ({ embedded = false, onPlanSaved = null }) => {
  const navigate = useNavigate();
  const { userProfile, refreshPermissions } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [submittingPlan, setSubmittingPlan] = useState('');
  const currentPlanType = normalizeTenantPlanType(
    userProfile?.planType || userProfile?.subscriptionPlan || 'free',
    'free'
  );
  const trialEndsAt = userProfile?.trialEndsAt;
  const upgradeRequirements = Array.isArray(userProfile?.upgradeRequirements)
    ? userProfile.upgradeRequirements
    : ['company_ice_number', 'company_legal_form', 'company_registration_city'];
  const complianceLabels = {
    company_ice_number: tr('ICE number', 'Numéro ICE'),
    company_legal_form: tr('Company legal form', 'Forme juridique'),
    company_registration_city: tr('Registration city', "Ville d'immatriculation"),
  };

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
      onPlanSaved?.(planId);
      navigate('/pending-approval', { replace: true });
    } catch (error) {
      alert(error?.message || tr('Unable to save the selected plan right now.', "Impossible d'enregistrer le forfait pour le moment."));
    } finally {
      setSubmittingPlan('');
    }
  };

  return (
    <div className={embedded ? 'rounded-[28px] border border-violet-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-5' : 'min-h-screen bg-[radial-gradient(circle_at_top_left,#eef2ff_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6'}>
      <div className={`mx-auto ${embedded ? 'max-w-none space-y-5' : 'max-w-7xl space-y-6'}`}>
        <div className="overflow-hidden rounded-[32px] border border-violet-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="px-6 py-8 sm:px-8">
            {!embedded ? (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{tr('Back', 'Retour')}</span>
              </button>
            ) : null}
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-500">
              {tr('Subscription setup', 'Configuration abonnement')}
            </p>
            <div className={`mt-4 flex flex-col gap-5 ${embedded ? 'xl:flex-row xl:items-end xl:justify-between' : 'lg:flex-row lg:items-end lg:justify-between'}`}>
              <div className="max-w-3xl">
                <h1 className={`${embedded ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'} font-black tracking-tight text-slate-950`}>
                  {tr('Choose your DriveOut plan', 'Choisissez votre forfait DriveOut')}
                </h1>
                <p className="mt-4 text-base font-medium leading-8 text-slate-500">
                  {tr(
                    'Move from the current tenant baseline into the right operating tier for your business. Pick a plan that matches how much control, automation, and scale you need.',
                    "Passez de la base actuelle du tenant vers le bon niveau d’exploitation pour votre activité. Choisissez le forfait adapté à votre besoin de contrôle, d’automatisation et d’échelle."
                  )}
                </p>
              </div>
              <div className="rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.96))] px-5 py-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  {tr('Current plan', 'Forfait actuel')}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${planBadgeTone[currentPlanType]}`}>
                    {currentPlanType}
                  </span>
                  <p className="text-sm font-semibold text-slate-600">
                    {tr('Current workspace commercial tier', 'Niveau commercial actuel de votre espace')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-violet-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.8),rgba(255,255,255,1))] px-6 py-6 sm:px-8">
            <div className={`grid gap-4 ${embedded ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[1.1fr_0.9fr]'}`}>
              <div className="rounded-[28px] border border-violet-100 bg-white px-5 py-5 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)]">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 text-violet-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-950">
                      {tr('30-day free trial active', 'Essai gratuit de 30 jours actif')}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {trialDaysRemaining === null
                        ? tr('Choose your plan at any time during the trial.', 'Choisissez votre forfait à tout moment pendant la période d’essai.')
                        : tr(`${trialDaysRemaining} day(s) remaining. Choose a plan any time.`, `Il reste ${trialDaysRemaining} jour(s). Choisissez un forfait à tout moment.`)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-amber-200 bg-amber-50/80 px-5 py-5 shadow-[0_12px_30px_-22px_rgba(180,83,9,0.28)]">
                <div className="flex items-start gap-3">
                  <FileBadge2 className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <p className="text-sm font-bold text-slate-950">
                      {tr('Paid activation requires extra company details', "L'activation payante demande plus d'informations société")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {tr(
                        'Before paid activation, we will ask you to complete the remaining company compliance details.',
                        "Avant l'activation payante, nous vous demanderons de compléter les informations société restantes."
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {upgradeRequirements.map((requirement) => (
                        <span
                          key={requirement}
                          className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-800"
                        >
                          {complianceLabels[requirement] || requirement}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`grid gap-6 ${embedded ? 'xl:grid-cols-2' : 'lg:grid-cols-2'}`}>
          {PLAN_DEFINITIONS.map((plan) => {
            const title = isFrench ? plan.title.fr : plan.title.en;
            const eyebrow = isFrench ? plan.eyebrow.fr : plan.eyebrow.en;
            const price = isFrench ? plan.price.fr : plan.price.en;
            const summary = isFrench ? plan.summary.fr : plan.summary.en;
            const features = isFrench ? plan.features.fr : plan.features.en;
            const isSubmitting = submittingPlan === plan.id;
            const isCurrent = currentPlanType === plan.id;
            const isUpgrade = planRank.indexOf(plan.id) > planRank.indexOf(currentPlanType);

            return (
              <section key={plan.id} className={`flex h-full flex-col overflow-hidden rounded-[32px] border bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${isCurrent ? 'border-violet-300 ring-2 ring-violet-100 shadow-[0_18px_44px_rgba(76,29,149,0.12)]' : plan.tone}`}>
                <div className={`bg-gradient-to-br ${plan.accent} px-6 py-6 text-slate-950`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">{eyebrow}</p>
                      <h2 className="mt-3 text-3xl font-black">{title}</h2>
                      <p className="mt-2 text-base font-semibold text-slate-500">{price}</p>
                      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">{summary}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {isCurrent ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                          {tr('Current', 'Actuel')}
                        </span>
                      ) : null}
                      {plan.recommended ? (
                        <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-700 shadow-sm">
                          {tr('Recommended', 'Recommandé')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between px-6 py-6">
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,1))] px-4 py-4 shadow-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
                          <p className="text-sm font-medium text-slate-700">{feature}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-sm">
                      <div className="flex min-h-[5.75rem] flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            {isCurrent ? tr('Current workspace tier', 'Niveau actuel de l’espace') : tr('Upgrade path', 'Parcours de montée en gamme')}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {isCurrent
                              ? tr('This is the plan currently attached to this tenant.', 'C’est le forfait actuellement rattaché à ce tenant.')
                              : isUpgrade
                                ? tr('Upgrade this tenant into this operating tier.', 'Faites évoluer ce tenant vers ce niveau d’exploitation.')
                                : tr('Switch this tenant to a lighter commercial tier.', 'Faites basculer ce tenant vers un niveau commercial plus léger.')}
                          </p>
                        </div>
                        {isCurrent ? (
                          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                            <ShieldCheck className="h-4 w-4" />
                            <span>{tr('Current', 'Actuel')}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    {isCurrent ? (
                      <div className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] border border-slate-200 bg-slate-100 px-5 py-3 text-sm font-bold text-slate-500">
                        <Star className="h-4 w-4" />
                        <span>{tr('Current Plan', 'Forfait actuel')}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={Boolean(submittingPlan)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-violet-700 px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_36px_rgba(109,40,217,0.22)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>{isSubmitting ? tr('Saving...', 'Enregistrement...') : tr('Choose This Plan', 'Choisir ce forfait')}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlanSelectionPanel;
