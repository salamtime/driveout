import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Rocket, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getTenantSession, getTenantWorkspaceLaunchUrl } from '../../services/TenantRegistryService';
import i18n from '../../i18n';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';

const TenantWorkspaceReady = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [tenantSession, setTenantSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const session = await getTenantSession();
        if (cancelled) return;

        if (!session) {
          navigate('/pending-approval', { replace: true });
          return;
        }

        if (session.workspaceState !== 'tenant_ready') {
          if (session.workspaceState === 'expired' || session.workspaceState === 'billing_issue') {
            navigate('/choose-plan', { replace: true });
            return;
          }

          navigate('/pending-approval', { replace: true });
          return;
        }

        setTenantSession(session);
        setError('');
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your workspace status.', "Impossible de charger le statut de votre espace."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const launchUrl = useMemo(() => getTenantWorkspaceLaunchUrl(tenantSession), [tenantSession]);

  useEffect(() => {
    if (!launchUrl) return undefined;

    const timeoutId = window.setTimeout(() => {
      window.location.assign(launchUrl);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [launchUrl]);

  if (loading && !suppressBlockingLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4">
        <div className="text-center">
          <div className="text-4xl">⏳</div>
          <p className="mt-4 text-sm font-semibold text-slate-600">
            {tr('Loading your dedicated workspace...', 'Chargement de votre espace dédié...')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {tr('Private tenant workspace', 'Espace tenant privé')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              {tr('Your isolated workspace is ready', 'Votre espace isolé est prêt')}
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-medium text-violet-100">
              {tr(
                'Your business now runs in its own dedicated workspace and no longer uses SaharaX internal admin data.',
                "Votre activité fonctionne désormais dans son propre espace dédié et n'utilise plus les données internes d'administration SaharaX."
              )}
            </p>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-violet-100 bg-violet-50 p-5">
                <div className="flex items-center gap-3">
                  <Rocket className="h-5 w-5 text-violet-700" />
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-700">
                    {tr('Workspace', 'Espace')}
                  </p>
                </div>
                <p className="mt-4 text-2xl font-black text-slate-950">
                  {tenantSession?.tenantName || tr('Business workspace', 'Espace business')}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {tenantSession?.companyName || tenantSession?.tenantSlug || ''}
                </p>
              </div>

              <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                    {tr('Security boundary', 'Frontière de sécurité')}
                  </p>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  {tr(
                    'This workspace is provisioned separately from SaharaX master operations.',
                    "Cet espace est provisionné séparément des opérations maîtres SaharaX."
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{tr('Plan', 'Forfait')}</p>
                <p className="mt-2 text-sm font-bold capitalize text-slate-900">{tenantSession?.planType || 'starter'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{tr('Tenant status', 'Statut tenant')}</p>
                <p className="mt-2 text-sm font-bold capitalize text-slate-900">{tenantSession?.tenantStatus || 'active'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{tr('Project reference', 'Référence projet')}</p>
                <p className="mt-2 break-all text-sm font-bold text-slate-900">{tenantSession?.tenantProjectRef || '—'}</p>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {launchUrl ? (
                <a
                  href={launchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800"
                >
                  <span>{tr('Open workspace', 'Ouvrir l’espace')}</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <Link
                to="/choose-plan"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
              >
                {tr('Manage plan', 'Gérer le forfait')}
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

export default TenantWorkspaceReady;
