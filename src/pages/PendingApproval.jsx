import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Clock3, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTenantSession } from '../services/TenantRegistryService';
import i18n from '../i18n';

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

    if (displayStatus === 'approved') {
      void loadTenantSession();
    }

    return () => {
      cancelled = true;
    };
  }, [displayStatus]);

  useEffect(() => {
    if (tenantSession?.workspaceState === 'tenant_ready') {
      if (tenantSession?.tenantAppUrl) {
        window.location.href = tenantSession.tenantAppUrl;
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

    if (displayStatus === 'approved') {
      return {
        icon: Clock3,
        title: tr('Your private business workspace is being prepared', 'Votre espace business privé est en cours de préparation'),
        description: tr(
          'Your account is approved, but access to SaharaX internal operations modules stays blocked while your dedicated tenant workspace is prepared.',
          "Votre compte est approuvé, mais l'accès aux modules internes SaharaX reste bloqué pendant la préparation de votre espace tenant dédié."
        ),
        badge: tr('Provisioning', 'Provisionnement'),
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
  }, [displayStatus, isFrench, rejectionReason, suspensionReason, tr]);

  const Icon = content.icon;
  const statusTone = statusToneMap[displayStatus] || statusToneMap.pending;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {tr('Business Owner Activation', 'Activation propriétaire business')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {tr('DriveOut business access', 'Accès business DriveOut')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium text-violet-100">
              {tr(
                'Your business owner activation is managed by the master owner before operations access is unlocked.',
                "L'activation du compte business est gérée par le propriétaire maître avant le déverrouillage de l'accès opérations."
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

              {displayStatus === 'approved' ? (
                <div className="mt-5 rounded-2xl border border-violet-200 bg-white px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-500">
                    {tr('Provisioning status', 'Statut du provisionnement')}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {tenantSession?.workspaceState === 'provisioning'
                      ? tr('Your tenant workspace is queued for provisioning.', 'Votre espace tenant est en file de provisionnement.')
                      : tr('Your tenant workspace is being prepared.', 'Votre espace tenant est en cours de préparation.')}
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
