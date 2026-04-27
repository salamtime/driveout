import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock3, ExternalLink, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminMobileStatsRow from '../../components/admin/AdminMobileStatsRow';
import {
  completeTenantProvisioning,
  failTenantProvisioning,
  listTenants,
  reactivateTenant,
  startTenantProvisioning,
  suspendTenant,
} from '../../services/TenantProvisioningService';
import i18n from '../../i18n';

const statusTone = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  provisioning: 'border-violet-200 bg-violet-50 text-violet-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  suspended: 'border-slate-300 bg-slate-100 text-slate-700',
  archived: 'border-slate-300 bg-slate-100 text-slate-700',
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const normalizeUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const buildWorkspaceRows = (businessOwners = []) => businessOwners.map((entry) => {
  const businessAccount = entry?.business_account || {};
  const tenant = entry?.tenant || {};
  const provisioningJob = entry?.provisioning_job || {};
  const status = String(tenant?.tenant_status || (tenant?.id ? 'provisioning' : 'pending')).toLowerCase();

  return {
    id: tenant?.id || businessAccount?.id,
    businessAccount,
    tenant,
    provisioningJob,
    ownerName: businessAccount?.full_name || businessAccount?.email || 'Business owner',
    ownerEmail: businessAccount?.email || '',
    name: tenant?.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Tenant',
    slug: tenant?.tenant_slug || '',
    status,
    createdAt: tenant?.created_at || businessAccount?.created_at,
  };
}).filter((row) => row.id);

const WorkspaceStatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${statusTone[status] || statusTone.pending}`}>
    {status || 'pending'}
  </span>
);

const WorkspaceDrawer = ({ workspace, onClose, onUpdated }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const tenant = workspace?.tenant || {};
  const job = workspace?.provisioningJob || {};
  const status = workspace?.status || 'pending';
  const [draft, setDraft] = useState({
    tenant_project_ref: tenant?.tenant_project_ref || '',
    tenant_api_url: tenant?.tenant_api_url || '',
    tenant_anon_key: tenant?.tenant_anon_key || '',
    tenant_app_url: tenant?.tenant_app_url || '',
    tenant_database_name: tenant?.tenant_database_name || '',
    schema_version: tenant?.schema_version || 'v1',
    error_message: tenant?.provisioning_error || job?.error_message || '',
  });
  const [busy, setBusy] = useState('');
  const [showManualConfig, setShowManualConfig] = useState(false);

  useEffect(() => {
    setDraft({
      tenant_project_ref: tenant?.tenant_project_ref || '',
      tenant_api_url: tenant?.tenant_api_url || '',
      tenant_anon_key: tenant?.tenant_anon_key || '',
      tenant_app_url: tenant?.tenant_app_url || '',
      tenant_database_name: tenant?.tenant_database_name || '',
      schema_version: tenant?.schema_version || 'v1',
      error_message: tenant?.provisioning_error || job?.error_message || '',
    });
  }, [job?.error_message, tenant]);

  if (!workspace) return null;

  const runAction = async (action) => {
    if (!job?.id && !(action === 'start' && workspace?.businessAccount?.id)) {
      alert(tr('No provisioning job is linked to this tenant yet.', 'Aucun job de provisionnement n’est lié à ce tenant.'));
      return;
    }

    try {
      setBusy(action);
      if (action === 'start') {
        await startTenantProvisioning(job?.id || '', workspace?.businessAccount?.id);
      } else if (action === 'complete') {
        const payload = {
          ...draft,
          tenant_api_url: normalizeUrl(draft.tenant_api_url),
          tenant_app_url: normalizeUrl(draft.tenant_app_url),
        };
        const missing = ['tenant_project_ref', 'tenant_api_url', 'tenant_anon_key', 'tenant_app_url']
          .filter((key) => !String(payload[key] || '').trim());
        if (missing.length) {
          alert(tr('Project ref, API URL, anon key, and app URL are required.', 'Référence projet, URL API, clé anon et URL app sont requis.'));
          return;
        }
        await completeTenantProvisioning(job.id, payload);
      } else if (action === 'fail') {
        await failTenantProvisioning(job.id, draft.error_message || 'Provisioning failed');
      } else if (action === 'suspend') {
        await suspendTenant(job.id, draft.error_message || 'Workspace suspended by admin');
      } else if (action === 'reactivate') {
        await reactivateTenant(job.id);
      }
      await onUpdated?.();
    } catch (error) {
          alert(error?.message || tr('Unable to update tenant.', 'Impossible de mettre à jour le tenant.'));
    } finally {
      setBusy('');
    }
  };

  const provisioningDispatch = tenant?.metadata?.provisioning_dispatch || {};
  const automationWasDispatched = Boolean(provisioningDispatch?.dispatched);
  const lastProvisioningUpdate =
    tenant?.metadata?.provisioning_dispatch_at ||
    tenant?.metadata?.provisioning_dispatch_failed_at ||
    tenant?.updated_at ||
    job?.updated_at ||
    job?.started_at ||
    tenant?.provisioning_started_at;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{tr('Tenant', 'Tenant')}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{workspace.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{workspace.ownerEmail}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Overview', 'Aperçu')}</p>
                <p className="mt-2 text-sm font-bold text-slate-950">{workspace.ownerName}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{workspace.slug || tr('Slug not assigned yet', 'Slug pas encore assigné')}</p>
              </div>
              <WorkspaceStatusBadge status={status} />
            </div>
          </section>

          <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Started', 'Démarré')}</span>
              <span className="font-semibold text-slate-950">{formatDate(tenant?.provisioning_started_at || job?.started_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Completed', 'Terminé')}</span>
              <span className="font-semibold text-slate-950">{formatDate(tenant?.provisioning_completed_at || tenant?.provisioned_at || job?.finished_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Last update', 'Dernière mise à jour')}</span>
              <span className="font-semibold text-slate-950">{formatDateTime(lastProvisioningUpdate)}</span>
            </div>
            {(tenant?.provisioning_error || job?.error_message) ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                {tenant?.provisioning_error || job?.error_message}
              </div>
            ) : null}
          </section>

          {status !== 'active' && status !== 'suspended' ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Provisioning pipeline', 'Pipeline de provisionnement')}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {status === 'pending'
                  ? tr('Start the automatic provisioning job. The backend worker will create and connect the private tenant.', 'Démarrez le job automatique. Le worker backend créera et connectera le tenant privé.')
                  : automationWasDispatched
                    ? tr('The worker has been notified. This drawer refreshes automatically; when it finishes, status changes to Active and Open Tenant appears.', 'Le worker a été notifié. Ce panneau se rafraîchit automatiquement; quand il termine, le statut passe à Actif et Ouvrir le tenant apparaît.')
                    : tr('The tenant is queued. Configure TENANT_PROVISIONING_WEBHOOK_URL on the backend to run this automatically.', 'Le tenant est en file. Configurez TENANT_PROVISIONING_WEBHOOK_URL côté backend pour l’exécuter automatiquement.')}
              </p>

              <button
                type="button"
                onClick={() => setShowManualConfig((value) => !value)}
                className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline"
              >
                {showManualConfig ? tr('Hide emergency activation', 'Masquer l’activation d’urgence') : tr('Emergency manual activation', 'Activation manuelle d’urgence')}
              </button>

              {showManualConfig ? (
                <div className="mt-4 grid gap-3 rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-xs font-bold leading-5 text-amber-800">
                    {tr('Use this only while bootstrapping automation. Normal tenant activation should come from the provisioning worker.', 'À utiliser seulement pendant le bootstrap de l’automatisation. L’activation normale doit venir du worker de provisionnement.')}
                  </p>
                  {[
                    ['tenant_project_ref', tr('Project ref', 'Référence projet')],
                    ['tenant_api_url', tr('API URL', 'URL API')],
                    ['tenant_anon_key', tr('Anon key', 'Clé anon')],
                    ['tenant_app_url', tr('App URL', 'URL app')],
                    ['tenant_database_name', tr('Database name', 'Nom base de données')],
                    ['schema_version', tr('Schema version', 'Version schéma')],
                  ].map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
                      <input
                        value={draft[key]}
                        onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {(status === 'failed' || status === 'active') ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Admin note', 'Note admin')}</span>
              <textarea
                value={draft.error_message}
                onChange={(event) => setDraft((prev) => ({ ...prev, error_message: event.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-[22px] border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              />
            </label>
          ) : null}

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            {status === 'pending' || status === 'failed' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('start')} className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                <Clock3 className="mr-2 h-4 w-4" />
                {busy ? tr('Starting...', 'Démarrage...') : status === 'failed' ? tr('Retry automatic provisioning', 'Relancer le provisionnement automatique') : tr('Start automatic provisioning', 'Démarrer le provisionnement automatique')}
              </button>
            ) : null}
            {status === 'provisioning' ? (
              <div className="inline-flex w-full items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {tr('Provisioning in progress', 'Provisionnement en cours')}
              </div>
            ) : null}
            {(status === 'provisioning' || status === 'failed') && showManualConfig ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={!!busy} onClick={() => runAction('complete')} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {tr('Manual activate', 'Activer manuellement')}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('fail')} className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {tr('Mark as failed', 'Marquer échoué')}
                </button>
              </div>
            ) : null}
            {status === 'active' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => window.open(tenant?.tenant_app_url, '_blank', 'noopener,noreferrer')} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr('Open Workspace', 'Ouvrir l’espace')}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('suspend')} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:border-rose-200 hover:text-rose-700 disabled:opacity-60">
                  {tr('Suspend', 'Suspendre')}
                </button>
              </div>
            ) : null}
            {status === 'suspended' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('reactivate')} className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                {tr('Reactivate', 'Réactiver')}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
};

const Workspaces = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listTenants();
      setRows(buildWorkspaceRows(result.businessOwners));
    } catch (error) {
      console.warn('Unable to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!rows.some((row) => row.status === 'provisioning')) return undefined;

    const intervalId = window.setInterval(() => {
      load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [load, rows]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    const nextSelectedWorkspace = rows.find((row) => row.id === selectedWorkspace.id);
    if (nextSelectedWorkspace && nextSelectedWorkspace !== selectedWorkspace) {
      setSelectedWorkspace(nextSelectedWorkspace);
    }
  }, [rows, selectedWorkspace]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!needle) return true;
      return [row.name, row.ownerName, row.ownerEmail, row.slug, row.status].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [rows, search, status]);

  const kpis = useMemo(() => rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {}), [rows]);

  return (
    <div className="min-h-screen bg-slate-50/80">
      <AdminModuleHero
        icon={<Building2 className="h-6 w-6 text-white" />}
        eyebrow={tr('Platform operations', 'Opérations plateforme')}
        title={tr('Tenant', 'Tenant')}
        description={tr('Provision and monitor isolated business tenant workspaces.', 'Provisionnez et surveillez les espaces tenant business isolés.')}
        actions={(
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tr('Refresh', 'Actualiser')}
          </button>
        )}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <AdminMobileStatsRow>
          {[
            ['pending', tr('Pending', 'En attente')],
            ['provisioning', tr('Provisioning', 'Provisionnement')],
            ['active', tr('Active', 'Actifs')],
            ['failed', tr('Failed', 'Échoués')],
          ].map(([key, label]) => (
            <div key={key} className="rounded-[28px] border border-violet-100/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
              <p className="mt-3 text-3xl font-black text-slate-950">{kpis[key] || 0}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Tenant workspaces', 'Espaces tenant')}</p>
            </div>
          ))}
        </AdminMobileStatsRow>

        <section className="rounded-[34px] border border-violet-100 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{tr('Provisioning control', 'Contrôle provisionnement')}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{tr('Tenant workspaces', 'Espaces tenant')}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">{tr('Click a row to manage its isolated workspace.', 'Cliquez une ligne pour gérer son espace isolé.')}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search workspaces...', 'Rechercher...')} className="w-full rounded-2xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
              </label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100">
                {['all', 'pending', 'provisioning', 'active', 'failed', 'suspended'].map((item) => (
                  <option key={item} value={item}>{item === 'all' ? tr('All statuses', 'Tous les statuts') : item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  {[tr('Workspace', 'Espace'), tr('Owner', 'Propriétaire'), tr('Created', 'Créé'), tr('Status', 'Statut')].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-36 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-44 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-5 w-24 rounded-full bg-slate-100" /></td>
                  </tr>
                )) : null}
                {!loading && filteredRows.map((row) => (
                  <tr key={row.id} tabIndex={0} role="button" onClick={() => setSelectedWorkspace(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedWorkspace(row); }} className="cursor-pointer transition hover:bg-violet-50/60 focus:bg-violet-50/70 focus:outline-none">
                    <td className="px-4 py-4">
                      <p className="text-sm font-black text-slate-950">{row.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.slug || '—'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-slate-800">{row.ownerName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-4"><WorkspaceStatusBadge status={row.status} /></td>
                  </tr>
                ))}
                {!loading && !filteredRows.length ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-violet-50 text-violet-700">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-black text-slate-900">{tr('No workspaces yet.', 'Aucun espace pour le moment.')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">{tr('Approved business owners will appear here once a tenant record exists.', 'Les propriétaires business approuvés apparaîtront ici après création du tenant.')}</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <WorkspaceDrawer
        workspace={selectedWorkspace}
        onClose={() => setSelectedWorkspace(null)}
        onUpdated={async () => {
          setSelectedWorkspace(null);
          await load();
        }}
      />
    </div>
  );
};

export default Workspaces;
