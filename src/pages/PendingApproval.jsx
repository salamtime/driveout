import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Clock3, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTenantSession } from '../services/TenantRegistryService';
import { hasBusinessOwnerRequest, isBusinessOwnerAccountType } from '../utils/accountType';
import { resolveUserEntry } from '../utils/tenantEntryResolver';
import i18n from '../i18n';
import WorkspaceProgressVisualizer from '../components/auth/WorkspaceProgressVisualizer';

const statusToneMap = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-violet-200 bg-violet-50 text-violet-800',
  needs_info: 'border-sky-200 bg-sky-50 text-sky-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  suspended: 'border-slate-300 bg-slate-100 text-slate-800',
};

const PendingApproval = () => {
  const { userProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const verificationStatus = String(userProfile?.verificationStatus || 'pending').toLowerCase();
  const subscriptionStatus = String(userProfile?.subscriptionStatus || '').toLowerCase();
  const accountType = String(userProfile?.accountType || '').trim().toLowerCase();
  const isBusinessOwnerOnboarding =
    isBusinessOwnerAccountType(accountType) ||
    hasBusinessOwnerRequest({
      account_type: userProfile?.accountType,
      verification_status: userProfile?.verificationStatus,
      certification_request_status: userProfile?.verificationStatus,
      subscription_status: userProfile?.subscriptionStatus,
    });
  const displayStatus = subscriptionStatus === 'suspended'
    ? 'suspended'
    : verificationStatus === 'approved'
      ? 'approved'
      : verificationStatus;
  const rejectionReason = String(userProfile?.rejectionReason || '').trim();
  const suspensionReason = String(userProfile?.suspensionReason || '').trim();
  const [tenantSession, setTenantSession] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadTenantSession = async () => {
      try {
        const session = await getTenantSession();
        if (!cancelled) {
          setTenantSession(session);
        }
      } catch {
        if (!cancelled) {
          setTenantSession(null);
        }
      }
    };

    if (isBusinessOwnerOnboarding || displayStatus === 'approved') {
      void loadTenantSession();
    }

    return () => {
      cancelled = true;
    };
  }, [displayStatus, isBusinessOwnerOnboarding]);

  const workspaceState = String(tenantSession?.workspaceState || tenantSession?.workspace_state || '').trim().toLowerCase();
  const showsAutomaticWorkspacePreparation =
    !['rejected', 'needs_info', 'suspended'].includes(displayStatus) &&
    (['pending', 'provisioning', 'tenant_ready', 'no_workspace'].includes(workspaceState) || isBusinessOwnerOnboarding);

  useEffect(() => {
    if (!isBusinessOwnerOnboarding) {
      return undefined;
    }

    if (['tenant_ready', 'failed', 'suspended', 'no_workspace'].includes(workspaceState)) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const session = await getTenantSession();
        if (!cancelled) {
          setTenantSession(session);
        }
      } catch {
        if (!cancelled) {
          setTenantSession((current) => current);
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isBusinessOwnerOnboarding, workspaceState]);

  useEffect(() => {
    if (tenantSession?.workspaceState === 'tenant_ready') {
      const entry = resolveUserEntry({
        approved: true,
        tenantSession,
      });
      if (entry?.target) {
        window.location.href = entry.target;
        return;
      }
      navigate('/business/workspace', { replace: true });
      return;
    }

    if (tenantSession?.workspaceState === 'no_workspace') {
      navigate('/no-workspace', { replace: true });
      return;
    }

    if (tenantSession?.workspaceState === 'pending') {
      navigate('/workspace-pending', { replace: true });
      return;
    }

    if (tenantSession?.workspaceState === 'failed') {
      navigate('/workspace-error', { replace: true });
      return;
    }

    if (tenantSession?.workspaceState === 'suspended') {
      navigate('/workspace-suspended', { replace: true });
      return;
    }

    if (tenantSession?.workspaceState === 'provisioning') {
      navigate('/workspace-preparing', { replace: true });
    }
  }, [navigate, tenantSession?.tenantAppUrl, tenantSession?.workspaceState]);

  const content = useMemo(() => {
    if (displayStatus === 'rejected') {
      return {
        icon: ShieldAlert,
        title: tr('Your application was not approved', "Votre demande n'a pas été approuvée"),
        description: tr(
          'Reason shown below. Contact support if you believe this is a mistake.',
          "La raison est indiquée ci-dessous. Contactez le support si vous pensez qu'il s'agit d'une erreur."
        ),
        badge: tr('Rejected', 'Rejeté'),
      };
    }

    if (displayStatus === 'needs_info') {
      return {
        icon: AlertCircle,
        title: tr('We need more information about your business', "Nous avons besoin de plus d'informations sur votre activité"),
        description: tr(
          'Please contact support or update your profile details with the requested business information.',
          'Veuillez contacter le support ou mettre à jour votre profil avec les informations business demandées.'
        ),
        badge: tr('Needs Info', 'Informations requises'),
      };
    }

    if (displayStatus === 'suspended') {
      return {
        icon: ShieldAlert,
        title: tr('Your workspace is currently suspended', 'Votre espace est actuellement suspendu'),
        description: tr(
          'This business workspace is temporarily restricted. Contact support or the master owner for more information.',
          'Cet espace business est temporairement restreint. Contactez le support ou le propriétaire maître pour plus d’informations.'
        ),
        badge: tr('Suspended', 'Suspendu'),
      };
    }

    if (showsAutomaticWorkspacePreparation || displayStatus === 'approved') {
      return {
        icon: Clock3,
        title: tr('Your workspace is almost ready', 'Votre espace est presque prêt'),
        description: tr(
          'We are finishing your DriveOut workspace automatically. Keep this page open and we will bring you in as soon as everything is ready.',
          "Nous finalisons automatiquement votre espace DriveOut. Gardez cette page ouverte et nous vous y emmènerons dès que tout sera prêt."
        ),
        badge: tr('Workspace setup', 'Configuration de l’espace'),
      };
    }

    return {
      icon: Clock3,
      title: tr('Your account is under review', 'Votre compte est en cours de revue'),
      description: tr(
        'We will notify you by email within 24 hours.',
        'Nous vous informerons par email sous 24 heures.'
      ),
      badge: tr('Pending', 'En attente'),
    };
  }, [displayStatus, isFrench, rejectionReason, showsAutomaticWorkspacePreparation, suspensionReason, tr]);

  const Icon = content.icon;
  const statusTone = statusToneMap[displayStatus] || statusToneMap.pending;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {tr('Business workspace setup', 'Configuration de l’espace business')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {tr('Your DriveOut workspace', 'Votre espace DriveOut')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium text-violet-100">
              {tr(
                'Your workspace is created automatically after signup. We are finishing the setup and will redirect you as soon as it is ready.',
                "Votre espace est créé automatiquement après l’inscription. Nous terminons la configuration et vous redirigerons dès qu’il sera prêt."
              )}
            </p>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-8">
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${statusTone}`}>
              <Icon className="h-4 w-4" />
              <span>{content.badge}</span>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-slate-950">{content.title}</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{content.description}</p>

              {displayStatus === 'rejected' && rejectionReason ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-white px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">
                    {tr('Rejection reason', 'Raison du rejet')}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{rejectionReason}</p>
                </div>
              ) : null}

              {displayStatus === 'suspended' && suspensionReason ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {tr('Suspension reason', 'Raison de la suspension')}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">{suspensionReason}</p>
                </div>
              ) : null}

              {showsAutomaticWorkspacePreparation || displayStatus === 'approved' ? (
                <div className="mt-5 rounded-2xl border border-violet-200 bg-white px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">
                    {tr('Setup status', 'Statut de configuration')}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {tenantSession?.workspaceState === 'tenant_ready'
                      ? tr('Your business workspace is ready. Redirecting now.', 'Votre espace business est prêt. Redirection en cours.')
                      : tenantSession?.workspaceState === 'provisioning'
                        ? tr('Your workspace is currently being prepared.', 'Votre espace est actuellement en cours de préparation.')
                        : tenantSession?.workspaceState === 'pending'
                        ? tr('Your workspace request has been accepted and setup is starting.', 'La demande de votre espace est acceptée et la configuration démarre.')
                          : tr('Your workspace is being prepared automatically. This can take a few minutes on the first setup.', 'Votre espace est en cours de préparation automatique. Cela peut prendre quelques minutes lors de la première configuration.')}
                  </p>
                  {tenantSession?.tenantName ? (
                    <p className="mt-2 text-sm text-slate-500">
                      {tr('Workspace', 'Espace')} : {tenantSession.tenantName}
                    </p>
                  ) : null}
                  {tenantSession?.provisioningJob?.job_status ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {tr('Job status', 'Statut du job')} : {tenantSession.provisioningJob.job_status}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showsAutomaticWorkspacePreparation || displayStatus === 'approved' ? (
                <div className="mt-5">
                  <WorkspaceProgressVisualizer
                    mode={tenantSession?.workspaceState === 'tenant_ready' ? 'indeterminate' : 'determinate'}
                    progressPercent={
                      tenantSession?.workspaceState === 'tenant_ready'
                        ? 100
                        : tenantSession?.workspaceState === 'provisioning'
                          ? 72
                          : tenantSession?.workspaceState === 'pending'
                            ? 32
                            : 18
                    }
                    statusLabel={tr('Behind the scenes', 'En arrière-plan')}
                    title={tr('We are assembling your workspace', 'Nous assemblons votre espace')}
                    subtitle={tr(
                      'Access, modules, and workspace routing are being prepared automatically so you can enter as soon as it is ready.',
                      'Les accès, modules et le routage de l’espace sont préparés automatiquement pour que vous puissiez entrer dès qu’il est prêt.'
                    )}
                    steps={[
                      {
                        key: 'request',
                        label: tr('Request accepted', 'Demande acceptée'),
                        complete: ['pending', 'provisioning', 'tenant_ready'].includes(tenantSession?.workspaceState),
                      },
                      {
                        key: 'workspace',
                        label: tr('Preparing workspace', 'Préparation espace'),
                        complete: ['provisioning', 'tenant_ready'].includes(tenantSession?.workspaceState),
                      },
                      {
                        key: 'modules',
                        label: tr('Loading modules', 'Chargement modules'),
                        complete: tenantSession?.workspaceState === 'tenant_ready',
                      },
                      {
                        key: 'open',
                        label: tr('Opening access', 'Ouverture accès'),
                        complete: false,
                      },
                    ]}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/website"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800"
              >
                {tr('Return to website', 'Retour au site')}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
              >
                {tr('Log out', 'Déconnexion')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
