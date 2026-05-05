import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTenantSession } from '../services/TenantRegistryService';
import i18n from '../i18n';

const pageMeta = {
  '/no-workspace': {
    icon: Clock3,
    title: ['Your workspace is not created yet', 'Votre espace n’est pas encore créé'],
    subtitle: ['This workspace still requires manual admin setup before operations can open.', 'Cet espace nécessite encore une configuration manuelle par l’admin avant l’accès aux opérations.'],
  },
  '/workspace-pending': {
    icon: Clock3,
    title: ['Workspace request received', 'Demande d’espace reçue'],
    subtitle: ['We are about to start provisioning your demo workspace.', 'Nous allons démarrer le provisionnement de votre espace de démonstration.'],
  },
  '/workspace-preparing': {
    icon: Loader2,
    title: ['Your workspace is being prepared', 'Votre espace est en préparation'],
    subtitle: ['This usually takes a few moments.', 'Cela prend généralement quelques instants.'],
    spin: true,
  },
  '/workspace-error': {
    icon: AlertCircle,
    title: ['We couldn’t prepare your workspace yet', "Nous n'avons pas encore pu préparer votre espace"],
    subtitle: [
      'Your workspace is not ready yet. Your signup is still saved, and we can retry provisioning automatically as soon as the shared workspace path is available again.',
      "Votre espace n'est pas encore prêt. Votre inscription est bien enregistrée, et nous pourrons relancer automatiquement le provisionnement dès que le parcours d'espace partagé sera de nouveau disponible.",
    ],
  },
  '/workspace-suspended': {
    icon: ShieldAlert,
    title: ['Workspace suspended', 'Espace suspendu'],
    subtitle: ['Please contact support.', 'Veuillez contacter le support.'],
  },
};

const getProvisioningProgressModel = ({ tenantSession, userProfile, tr }) => {
  const workspaceState = String(
    tenantSession?.workspaceState || tenantSession?.workspace_state || ''
  ).trim().toLowerCase();
  const tenant = tenantSession?.tenant || null;
  const tenancyMode = String(
    tenantSession?.tenancyMode || tenantSession?.tenancy_mode || tenant?.tenancyMode || tenant?.tenancy_mode || 'shared'
  ).trim().toLowerCase();
  const provisioningJob = tenantSession?.provisioningJob || null;
  const hasTenantRecord = Boolean(tenant?.id || tenantSession?.tenantId);
  const hasProject = Boolean(tenant?.tenant_project_ref || tenantSession?.tenantProjectRef);
  const hasDomain = Boolean(tenant?.tenant_app_url || tenantSession?.tenantAppUrl);
  const hasOrganization = Boolean(tenant?.organization_id || tenant?.organizationId || tenantSession?.organizationId);
  const modulesPrepared =
    workspaceState === 'tenant_ready' ||
    String(tenant?.tenant_status || '').trim().toLowerCase() === 'active';
  const ready = workspaceState === 'tenant_ready';

  const steps = tenancyMode === 'dedicated'
    ? [
        {
          key: 'account',
          label: tr('Demo account created', 'Compte démo créé'),
          description: tr('Your owner account is active and the onboarding request is saved.', 'Votre compte propriétaire est actif et la demande d’onboarding est enregistrée.'),
          complete: Boolean(userProfile?.email || userProfile?.id),
        },
        {
          key: 'request',
          label: tr('Workspace request accepted', 'Demande d’espace acceptée'),
          description: tr('We created the tenant request and started the provisioning workflow.', 'Nous avons créé la demande tenant et lancé le workflow de provisionnement.'),
          complete: hasTenantRecord,
        },
        {
          key: 'project',
          label: tr('Private database initialized', 'Base de données privée initialisée'),
          description: tr('A dedicated Supabase project is being prepared for your company.', 'Un projet Supabase dédié est en cours de préparation pour votre société.'),
          complete: hasProject,
        },
        {
          key: 'domain',
          label: tr('Workspace domain assigned', 'Domaine de l’espace attribué'),
          description: tr('Your secure workspace URL is being attached to your business.', 'L’URL sécurisée de votre espace est en cours d’attribution à votre activité.'),
          complete: hasDomain,
        },
        {
          key: 'modules',
          label: tr('Modules and permissions prepared', 'Modules et permissions préparés'),
          description: tr('Core modules, owner access, and default permissions are being finalized.', 'Les modules principaux, l’accès propriétaire et les permissions par défaut sont en cours de finalisation.'),
          complete: modulesPrepared,
        },
        {
          key: 'ready',
          label: tr('Workspace ready', 'Espace prêt'),
          description: tr('You will be redirected automatically as soon as your workspace is ready.', 'Vous serez redirigé automatiquement dès que votre espace sera prêt.'),
          complete: ready,
        },
      ]
    : [
        {
          key: 'account',
          label: tr('Demo account created', 'Compte démo créé'),
          description: tr('Your owner account is active and the onboarding request is saved.', 'Votre compte propriétaire est actif et la demande d’onboarding est enregistrée.'),
          complete: Boolean(userProfile?.email || userProfile?.id),
        },
        {
          key: 'request',
          label: tr('Workspace request accepted', 'Demande d’espace acceptée'),
          description: tr('We created the tenant request and started the shared-workspace provisioning workflow.', 'Nous avons créé la demande tenant et lancé le workflow de provisionnement partagé.'),
          complete: hasTenantRecord,
        },
        {
          key: 'organization',
          label: tr('Tenant organization prepared', 'Organisation tenant préparée'),
          description: tr('Your company workspace is being linked to its isolated organization inside the shared platform.', 'Votre espace société est en cours de liaison avec son organisation isolée dans la plateforme partagée.'),
          complete: hasOrganization,
        },
        {
          key: 'domain',
          label: tr('Workspace domain assigned', 'Domaine de l’espace attribué'),
          description: tr('Your secure workspace URL is being attached to your business.', 'L’URL sécurisée de votre espace est en cours d’attribution à votre activité.'),
          complete: hasDomain,
        },
        {
          key: 'modules',
          label: tr('Modules and permissions prepared', 'Modules et permissions préparés'),
          description: tr('Core modules, owner access, and tenant feature access are being finalized.', 'Les modules principaux, l’accès propriétaire et les fonctionnalités tenant sont en cours de finalisation.'),
          complete: modulesPrepared,
        },
        {
          key: 'ready',
          label: tr('Workspace ready', 'Espace prêt'),
          description: tr('You will be redirected automatically as soon as your shared workspace is ready.', 'Vous serez redirigé automatiquement dès que votre espace partagé sera prêt.'),
          complete: ready,
        },
      ];

  const completedCount = steps.filter((step) => step.complete).length;
  const progressPercent = Math.max(8, Math.round((completedCount / steps.length) * 100));
  const activeIndex = steps.findIndex((step) => !step.complete);
  const activeStep = steps[activeIndex === -1 ? steps.length - 1 : activeIndex];

  return {
    steps,
    completedCount,
    totalSteps: steps.length,
    progressPercent,
    activeStep,
    workspaceName: tenantSession?.tenantName || tenant?.tenant_name || tenant?.tenant_slug || '',
    jobStatus: provisioningJob?.job_status || null,
    tenancyMode,
  };
};

const WorkspaceStatusPage = ({ status = 'preparing' }) => {
  const { signOut, tenantSession: authTenantSession, userProfile } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const pathKey = status.startsWith('/') ? status : `/workspace-${status}`;
  const meta = pageMeta[pathKey] || pageMeta['/workspace-preparing'];
  const Icon = meta.icon;
  const [tenantSession, setTenantSession] = useState(authTenantSession || null);

  useEffect(() => {
    if (authTenantSession) {
      setTenantSession(authTenantSession);
    }
  }, [authTenantSession]);

  useEffect(() => {
    if (pathKey !== '/workspace-preparing' && pathKey !== '/workspace-pending') {
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const nextSession = await getTenantSession();
        if (!cancelled && nextSession) {
          setTenantSession(nextSession);
        }
      } catch {
        if (!cancelled) {
          setTenantSession((current) => current);
        }
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pathKey]);

  const showProvisioningProgress = pathKey === '/workspace-preparing' || pathKey === '/workspace-pending';
  const progressModel = useMemo(
    () => getProvisioningProgressModel({ tenantSession, userProfile, tr }),
    [tenantSession, tr, userProfile]
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-800 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {showProvisioningProgress ? tr('30-day demo workspace', 'Espace démo 30 jours') : tr('Tenant workspace', 'Espace tenant')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">{isFrench ? meta.title[1] : meta.title[0]}</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium text-violet-100">
              {showProvisioningProgress
                ? tr(
                    'We are preparing your workspace now. Keep this page open and we will redirect you as soon as everything is ready.',
                    'Nous préparons votre espace maintenant. Gardez cette page ouverte et nous vous redirigerons dès que tout sera prêt.'
                  )
                : isFrench
                  ? meta.subtitle[1]
                  : meta.subtitle[0]}
            </p>
          </div>
          <div className="space-y-6 px-6 py-8 text-center sm:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[26px] bg-violet-50 text-violet-700">
              <Icon className={`h-7 w-7 ${meta.spin ? 'animate-spin' : ''}`} />
            </div>

            {showProvisioningProgress ? (
              <div className="space-y-6 text-left">
                <div className="rounded-[28px] border border-violet-200 bg-violet-50/80 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">
                        {tr('Provisioning progress', 'Progression du provisionnement')}
                      </p>
                      <h2 className="mt-2 text-xl font-black text-slate-950">{progressModel.activeStep.label}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{progressModel.activeStep.description}</p>
                    </div>
                    <div className="rounded-full bg-white px-4 py-2 text-sm font-black text-violet-700 shadow-sm">
                      {progressModel.progressPercent}%
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-violet-500 to-indigo-600 transition-all duration-700"
                      style={{ width: `${progressModel.progressPercent}%` }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600">
                    <span>
                      {tr('Completed', 'Terminées')} {progressModel.completedCount}/{progressModel.totalSteps}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">
                      {tr('Usually under 2 minutes', 'Généralement moins de 2 minutes')}
                    </span>
                    {progressModel.workspaceName ? (
                      <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700">
                        {tr('Workspace', 'Espace')} : {progressModel.workspaceName}
                      </span>
                    ) : null}
                    {progressModel.jobStatus ? (
                      <span className="rounded-full bg-white px-3 py-1 font-semibold capitalize text-slate-700">
                        {tr('Job', 'Job')} : {progressModel.jobStatus}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3">
                  {progressModel.steps.map((step, index) => {
                    const isComplete = step.complete;
                    const isActive = progressModel.activeStep.key === step.key && !isComplete;

                    return (
                      <div
                        key={step.key}
                        className={`rounded-[22px] border px-4 py-4 transition ${
                          isComplete
                            ? 'border-emerald-200 bg-emerald-50/70'
                            : isActive
                              ? 'border-violet-200 bg-white shadow-sm'
                              : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                              isComplete
                                ? 'bg-emerald-600 text-white'
                                : isActive
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-white text-slate-400'
                            }`}
                          >
                            {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-black">{index + 1}</span>}
                          </div>
                          <div>
                            <p className={`text-sm font-black ${isComplete || isActive ? 'text-slate-950' : 'text-slate-600'}`}>
                              {step.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{step.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mx-auto max-w-2xl text-center text-sm font-medium leading-6 text-slate-600">
                  {tr(
                    'Your demo workspace stays separate from SaharaX master operations. We only complete the redirect once your tenant workspace is fully ready.',
                    'Votre espace de démonstration reste séparé des opérations maîtres SaharaX. La redirection ne se fait qu’une fois votre espace tenant entièrement prêt.'
                  )}
                </p>
              </div>
            ) : (
              <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600">
                {isFrench
                  ? "Votre compte ne sera pas envoyé vers l'admin principal SaharaX tant que l'espace tenant n'est pas prêt. Aucune donnée n'a été perdue pendant l'échec de provisionnement."
                  : 'Your account will not be sent into the main SaharaX admin while the tenant workspace is not ready. No signup data was lost during this provisioning failure.'}
              </p>
            )}

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/website" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800">
                {isFrench ? 'Retour au site' : 'Return to website'}
              </Link>
              <button type="button" onClick={() => signOut()} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                {isFrench ? 'Déconnexion' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceStatusPage;
