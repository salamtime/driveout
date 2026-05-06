import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, PlayCircle, Rocket, TimerReset } from 'lucide-react';

const formatDate = (value) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getTrialDaysRemaining = (trialEndsAt) => {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getStatusMeta = (row, isFrench) => {
  const verificationStatus = String(row?.verificationStatus || 'pending').toLowerCase();
  const subscriptionStatus = String(row?.subscriptionStatus || '').toLowerCase();

  if (subscriptionStatus === 'suspended') {
    return {
      label: isFrench ? 'Suspendu' : 'Suspended',
      className: 'bg-slate-200 text-slate-800',
    };
  }

  if (verificationStatus === 'approved') {
    return {
      label: isFrench ? 'Approuvé' : 'Approved',
      className: 'bg-emerald-100 text-emerald-800',
    };
  }

  if (verificationStatus === 'rejected') {
    return {
      label: isFrench ? 'Rejeté' : 'Rejected',
      className: 'bg-rose-100 text-rose-800',
    };
  }

  if (verificationStatus === 'needs_info') {
    return {
      label: isFrench ? 'Infos requises' : 'Needs Info',
      className: 'bg-sky-100 text-sky-800',
    };
  }

  return {
    label: isFrench ? 'En attente' : 'Pending',
    className: 'bg-amber-100 text-amber-800',
  };
};

const getPlanMeta = (row, isFrench) => {
  const planType = String(row?.planType || '').toLowerCase();

  if (planType === 'pro') {
    return { label: 'Pro', className: 'bg-fuchsia-100 text-fuchsia-800' };
  }

  if (planType === 'growth') {
    return { label: isFrench ? 'Croissance' : 'Growth', className: 'bg-violet-100 text-violet-800' };
  }

  return { label: isFrench ? 'Starter' : 'Starter', className: 'bg-slate-100 text-slate-700' };
};

const getTrialMeta = (row, isFrench) => {
  const subscriptionStatus = String(row?.subscriptionStatus || '').toLowerCase();
  const remainingDays = getTrialDaysRemaining(row?.trialEndsAt);

  if (subscriptionStatus === 'active') {
    return { label: isFrench ? 'Payant' : 'Active plan', className: 'text-emerald-700' };
  }

  if (subscriptionStatus === 'suspended') {
    return { label: isFrench ? 'Suspendu' : 'Suspended', className: 'text-slate-600' };
  }

  if (remainingDays === null) {
    return { label: 'N/A', className: 'text-slate-500' };
  }

  if (remainingDays < 0) {
    return { label: isFrench ? 'Expiré' : 'Expired', className: 'text-rose-700' };
  }

  return {
    label: isFrench ? `${remainingDays} jour(s)` : `${remainingDays} day(s)`,
    className: 'text-amber-700',
  };
};

const getActivityLabel = (row, isFrench) => {
  if (row?.lastActivityAt) {
    return `${isFrench ? 'Actif' : 'Active'} ${formatDate(row.lastActivityAt)}`;
  }

  return isFrench ? 'Jamais actif' : 'No activity';
};

const PlanSelector = ({ currentPlan, onChange, disabled }) => {
  const planOptions = ['starter', 'growth', 'pro'];

  return (
    <div className="flex flex-wrap gap-2">
      {planOptions.map((plan) => {
        const active = currentPlan === plan;
        const label = plan.charAt(0).toUpperCase() + plan.slice(1);

        return (
          <button
            key={plan}
            type="button"
            onClick={() => onChange(plan)}
            disabled={disabled}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

const resolveTenancyMode = (row) =>
  String(row?.tenancy_mode || row?.metadata?.tenancy_mode || 'shared').trim().toLowerCase() || 'shared';

const buildProvisioningDraft = (row) => ({
  tenant_project_ref: row?.tenant_project_ref || '',
  tenant_app_url: row?.tenant_app_url || '',
  tenant_api_url: row?.tenant_api_url || '',
  tenant_anon_key: '',
  tenant_service_role_secret_ref: row?.tenant_service_role_secret_ref || '',
  tenant_database_name: row?.tenant_database_name || '',
  schema_version: row?.tenant_schema_version || 'v1',
  error_message: row?.provisioning_job_error || '',
});

const getProvisioningMissingFields = (draft = {}, tenancyMode = 'shared') => {
  if (tenancyMode !== 'dedicated') {
    return [];
  }
  const missing = [];
  if (!String(draft?.tenant_project_ref || '').trim()) missing.push('tenant_project_ref');
  if (!String(draft?.tenant_app_url || '').trim()) missing.push('tenant_app_url');
  if (!String(draft?.tenant_api_url || '').trim()) missing.push('tenant_api_url');
  if (!String(draft?.tenant_anon_key || '').trim()) missing.push('tenant_anon_key');
  return missing;
};

const getProvisioningFieldLabel = (field, isFrench) => {
  const labels = {
    tenant_project_ref: isFrench ? 'Référence projet' : 'Project reference',
    tenant_app_url: isFrench ? 'URL application' : 'App URL',
    tenant_api_url: isFrench ? 'URL API' : 'API URL',
    tenant_anon_key: isFrench ? 'Clé anon' : 'Anon key',
  };

  return labels[field] || field;
};

const BusinessOwnerSaaSTable = ({
  rows,
  isFrench,
  busyAction,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
  onExtendTrial,
  onActivateSubscription,
  onChangePlan,
  onOpenWorkspace,
  onOpenProfile,
  canManageProvisioning = false,
  onStartProvisioning,
  onCompleteProvisioning,
  onFailProvisioning,
}) => {
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [provisioningDrafts, setProvisioningDrafts] = useState({});
  const [manualProvisioningRowId, setManualProvisioningRowId] = useState(null);

  const normalizedRows = useMemo(() => rows || [], [rows]);

  if (!normalizedRows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)]">
        <p className="text-base font-semibold text-slate-900">
          {isFrench ? 'Aucun business owner trouvé' : 'No business owners found'}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {isFrench ? 'Ajustez les filtres ou la recherche pour voir plus de comptes.' : 'Adjust the filters or search to see more accounts.'}
        </p>
      </div>
    );
  }

  const renderExpandedContent = (row) => {
    const tenantStatus = String(row?.tenant_status || '').toLowerCase();
    const provisioningJobStatus = String(row?.provisioning_job_status || '').toLowerCase();
    const provisioningDraft = provisioningDrafts[row.id] || buildProvisioningDraft(row);
    const tenancyMode = resolveTenancyMode(row);
    const isDedicatedTenant = tenancyMode === 'dedicated';
    const isTenantActive = tenantStatus === 'active';
    const manualProvisioningOpen = manualProvisioningRowId === row.id;
    const missingProvisioningFields = getProvisioningMissingFields(provisioningDraft, tenancyMode);
    const canCompleteProvisioning =
      !busyAction &&
      isDedicatedTenant &&
      Boolean(row?.provisioning_job_id) &&
      !isTenantActive &&
      missingProvisioningFields.length === 0;

    return (
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Créé le' : 'Created at'}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(row.created_at)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Dernière activité' : 'Last activity'}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{row.lastActivityAt ? formatDate(row.lastActivityAt) : 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Facturation' : 'Billing'}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{String(row.billingStatus || 'none').replace('_', ' ')}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Essai jusqu’au' : 'Trial ends'}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{row.trialEndsAt ? formatDate(row.trialEndsAt) : 'N/A'}</div>
            </div>
          </div>

          {row.rejectionReason ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-rose-500">{isFrench ? 'Raison du rejet' : 'Rejection reason'}</div>
              <div className="mt-1 font-medium">{row.rejectionReason}</div>
            </div>
          ) : null}

          {row.suspensionReason ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Raison de la suspension' : 'Suspension reason'}</div>
              <div className="mt-1 font-medium">{row.suspensionReason}</div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Changer de plan' : 'Change plan'}</div>
            <div className="mt-3">
              <PlanSelector currentPlan={String(row.planType || 'starter').toLowerCase()} onChange={(plan) => onChangePlan(row, plan)} disabled={Boolean(busyAction)} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Provisionnement tenant' : 'Tenant provisioning'}</div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Statut tenant' : 'Tenant status'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{tenantStatus || 'provisioning'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Job' : 'Job'}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{provisioningJobStatus || 'queued'}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {isFrench ? 'Mode' : 'Mode'}: <span className="font-medium text-slate-700">{isDedicatedTenant ? 'dedicated' : 'shared'}</span>
              </div>
              {isDedicatedTenant && row?.tenant_project_ref ? (
                <div className="mt-3 text-xs text-slate-500">
                  {isFrench ? 'Projet' : 'Project'}: <span className="font-medium text-slate-700">{row.tenant_project_ref}</span>
                </div>
              ) : null}
              {row?.provisioning_job_error ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {row.provisioning_job_error}
                </div>
              ) : null}
              {!isTenantActive ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
                  {provisioningJobStatus === 'running'
                    ? (isFrench
                      ? 'Le worker de provisionnement prépare cet espace automatiquement.'
                      : 'The provisioning worker is preparing this workspace automatically.')
                    : (isFrench
                      ? (isDedicatedTenant
                        ? 'Démarrez le job automatique. Les champs techniques sont réservés au fallback d’urgence.'
                        : 'Démarrez le job automatique. Les tenants partagés héritent du runtime partagé et ne demandent pas de clés projet dédiées.')
                      : (isDedicatedTenant
                        ? 'Start the automatic job. Technical fields are reserved for emergency fallback only.'
                        : 'Start the automatic job. Shared tenants inherit the shared runtime and do not require dedicated project credentials.'))}
                </div>
              ) : null}
            </div>

            {canManageProvisioning ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2">
                  {!isTenantActive ? (
                    <button
                      type="button"
                      onClick={() => onStartProvisioning(row)}
                      disabled={Boolean(busyAction) || (!row?.provisioning_job_id && !row?.platform_business_account_id) || provisioningJobStatus === 'running'}
                      className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                    >
                      {provisioningJobStatus === 'running'
                        ? (isFrench ? 'Provisionnement en cours' : 'Provisioning in progress')
                        : (isFrench ? 'Démarrer automatiquement' : 'Start automatic provisioning')}
                    </button>
                  ) : null}
                  {isDedicatedTenant ? (
                    <button
                      type="button"
                      onClick={() => setManualProvisioningRowId(manualProvisioningOpen ? null : row.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                    >
                      {manualProvisioningOpen
                        ? (isFrench ? 'Masquer activation d’urgence' : 'Hide emergency activation')
                        : (isFrench ? 'Activation manuelle d’urgence' : 'Emergency manual activation')}
                    </button>
                  ) : null}
                </div>

                {manualProvisioningOpen && isDedicatedTenant ? (
                  <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs font-semibold leading-5 text-amber-800">
                      {isFrench
                        ? 'À utiliser seulement si le worker automatique n’est pas encore configuré.'
                        : 'Use only if the automatic worker is not configured yet.'}
                    </p>
                    <input
                      type="text"
                      value={provisioningDraft.tenant_project_ref}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, tenant_project_ref: event.target.value },
                      }))}
                      placeholder={isFrench ? 'Référence projet tenant' : 'Tenant project ref'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <p className="text-[11px] text-slate-500">
                      {isFrench
                        ? 'Utilisez la référence du projet Supabase ou du tenant privé.'
                        : 'Use the private tenant or Supabase project reference.'}
                    </p>
                    <input
                      type="url"
                      value={provisioningDraft.tenant_app_url}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, tenant_app_url: event.target.value },
                      }))}
                      placeholder={isFrench ? 'URL app tenant' : 'Tenant app URL'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <p className="text-[11px] text-slate-500">
                      {isFrench
                        ? 'URL du workspace privé vers lequel le business owner sera redirigé.'
                        : 'Private workspace URL the business owner will open after provisioning.'}
                    </p>
                    <input
                      type="url"
                      value={provisioningDraft.tenant_api_url}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, tenant_api_url: event.target.value },
                      }))}
                      placeholder={isFrench ? 'URL API tenant' : 'Tenant API URL'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <input
                      type="text"
                      value={provisioningDraft.tenant_anon_key}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, tenant_anon_key: event.target.value },
                      }))}
                      placeholder={isFrench ? 'Clé anon tenant' : 'Tenant anon key'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <input
                      type="text"
                      value={provisioningDraft.tenant_database_name}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, tenant_database_name: event.target.value },
                      }))}
                      placeholder={isFrench ? 'Nom base tenant (optionnel)' : 'Tenant database name (optional)'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <input
                      type="text"
                      value={provisioningDraft.schema_version}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, schema_version: event.target.value },
                      }))}
                      placeholder={isFrench ? 'Version du schéma' : 'Schema version'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                  </div>
                ) : null}

                {manualProvisioningOpen && isDedicatedTenant ? (
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => onCompleteProvisioning(row, provisioningDraft)}
                      disabled={!canCompleteProvisioning}
                      className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {isFrench ? 'Marquer tenant prêt' : 'Complete provisioning'}
                    </button>
                    <input
                      type="text"
                      value={provisioningDraft.error_message}
                      onChange={(event) => setProvisioningDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...provisioningDraft, error_message: event.target.value },
                      }))}
                      placeholder={isFrench ? 'Raison d’échec (optionnelle)' : 'Failure reason (optional)'}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => onFailProvisioning(row, provisioningDraft.error_message || (isFrench ? 'Provisionnement interrompu par admin.' : 'Provisioning stopped by admin.'))}
                      disabled={Boolean(busyAction) || !row?.provisioning_job_id}
                      className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      {isFrench ? 'Marquer en échec' : 'Mark as failed'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => onExtendTrial(row)}
                disabled={Boolean(busyAction)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
              >
                <TimerReset className="h-4 w-4" />
                <span>{isFrench ? 'Ajouter 7 jours' : 'Extend trial +7 days'}</span>
              </button>
              <button
                type="button"
                onClick={() => onActivateSubscription(row)}
                disabled={Boolean(busyAction) || String(row?.subscriptionStatus || '').toLowerCase() === 'active'}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
              >
                <Rocket className="h-4 w-4" />
                <span>{isFrench ? 'Activer abonnement' : 'Activate subscription'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkspace(row)}
                disabled={!row?.tenant_app_url || !isTenantActive}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{isFrench ? 'Ouvrir workspace' : 'Open workspace'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenProfile(row)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <PlayCircle className="h-4 w-4" />
                <span>{isFrench ? 'Voir le profil' : 'View profile'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)]">
      <div className="space-y-3 p-3 md:hidden">
        {normalizedRows.map((row) => {
          const expanded = expandedRowId === row.id;
          const statusMeta = getStatusMeta(row, isFrench);
          const planMeta = getPlanMeta(row, isFrench);
          const trialMeta = getTrialMeta(row, isFrench);
          const verificationStatus = String(row?.verificationStatus || '').toLowerCase();
          const subscriptionStatus = String(row?.subscriptionStatus || '').toLowerCase();
          const canApprove = verificationStatus === 'pending' || verificationStatus === 'needs_info' || verificationStatus === 'rejected';
          const canSuspend = verificationStatus === 'approved' && subscriptionStatus !== 'suspended';
          const canReactivate = subscriptionStatus === 'suspended';
          const ExpanderIcon = expanded ? ChevronDown : ChevronRight;

          return (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.28)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-500 text-lg font-bold text-white">
                  {String(row?.full_name || row?.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">{row.full_name || row.email}</div>
                  <div className="truncate text-xs text-slate-500">{row.email}</div>
                  <div className="truncate text-xs text-slate-400">{row.company_name || (isFrench ? 'Société non renseignée' : 'No company')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedRowId(expanded ? null : row.id)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  <ExpanderIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Statut' : 'Status'}</div>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Plan' : 'Plan'}</div>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${planMeta.className}`}>
                    {planMeta.label}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Essai' : 'Trial'}</div>
                  <div className={`mt-2 text-sm font-semibold ${trialMeta.className}`}>{trialMeta.label}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isFrench ? 'Activité' : 'Activity'}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{row.rentalsCount || 0} {isFrench ? 'locations' : 'rentals'}</div>
                  <div className="mt-1 text-xs text-slate-500">{getActivityLabel(row, isFrench)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {canApprove ? (
                  <button
                    type="button"
                    onClick={() => onApprove(row)}
                    disabled={Boolean(busyAction)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isFrench ? 'Approuver' : 'Approve'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onReject(row)}
                  disabled={Boolean(busyAction)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {isFrench ? 'Rejeter' : 'Reject'}
                </button>
                {canSuspend ? (
                  <button
                    type="button"
                    onClick={() => onSuspend(row)}
                    disabled={Boolean(busyAction)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isFrench ? 'Suspendre' : 'Suspend'}
                  </button>
                ) : null}
                {canReactivate ? (
                  <button
                    type="button"
                    onClick={() => onReactivate(row)}
                    disabled={Boolean(busyAction)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                  >
                    {isFrench ? 'Réactiver' : 'Reactivate'}
                  </button>
                ) : null}
              </div>

              {expanded ? (
                <div className="mt-4 rounded-2xl bg-slate-50/60 p-3">
                  {renderExpandedContent(row)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-12 px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Utilisateur' : 'User'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Statut' : 'Status'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Plan' : 'Plan'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Essai' : 'Trial'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Véhicules' : 'Vehicles'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Activité' : 'Activity'}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">{isFrench ? 'Actions' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {normalizedRows.map((row) => {
              const expanded = expandedRowId === row.id;
              const statusMeta = getStatusMeta(row, isFrench);
              const planMeta = getPlanMeta(row, isFrench);
              const trialMeta = getTrialMeta(row, isFrench);
              const verificationStatus = String(row?.verificationStatus || '').toLowerCase();
              const subscriptionStatus = String(row?.subscriptionStatus || '').toLowerCase();
              const canApprove = verificationStatus === 'pending' || verificationStatus === 'needs_info' || verificationStatus === 'rejected';
              const canSuspend = verificationStatus === 'approved' && subscriptionStatus !== 'suspended';
              const canReactivate = subscriptionStatus === 'suspended';
              const ExpanderIcon = expanded ? ChevronDown : ChevronRight;

              return (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedRowId(expanded ? null : row.id)}
                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                      >
                        <ExpanderIcon className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-500 text-lg font-bold text-white">
                          {String(row?.full_name || row?.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{row.full_name || row.email}</div>
                          <div className="truncate text-xs text-slate-500">{row.email}</div>
                          <div className="truncate text-xs text-slate-400">{row.company_name || (isFrench ? 'Société non renseignée' : 'No company')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${planMeta.className}`}>
                        {planMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      <span className={trialMeta.className}>{trialMeta.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                      {row.vehiclesCount || 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">{row.rentalsCount || 0} {isFrench ? 'locations' : 'rentals'}</div>
                      <div className="text-xs text-slate-500">{getActivityLabel(row, isFrench)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canApprove ? (
                          <button
                            type="button"
                            onClick={() => onApprove(row)}
                            disabled={Boolean(busyAction)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {isFrench ? 'Approuver' : 'Approve'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onReject(row)}
                          disabled={Boolean(busyAction)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                        >
                          {isFrench ? 'Rejeter' : 'Reject'}
                        </button>
                        {canSuspend ? (
                          <button
                            type="button"
                            onClick={() => onSuspend(row)}
                            disabled={Boolean(busyAction)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {isFrench ? 'Suspendre' : 'Suspend'}
                          </button>
                        ) : null}
                        {canReactivate ? (
                          <button
                            type="button"
                            onClick={() => onReactivate(row)}
                            disabled={Boolean(busyAction)}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                          >
                            {isFrench ? 'Réactiver' : 'Reactivate'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>

                  {expanded ? (
                    <tr className="bg-slate-50/60">
                      <td colSpan={8} className="px-4 py-4">
                        {renderExpandedContent(row)}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BusinessOwnerSaaSTable;
