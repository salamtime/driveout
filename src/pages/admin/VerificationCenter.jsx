import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, FileCheck2, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import VerificationReviewDrawer from '../../components/verification/VerificationReviewDrawer';
import VerificationStatusBadge from '../../components/verification/VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import {
  VERIFICATION_STATUSES,
  getVerificationLabel,
  getVerificationTypeLabel,
} from '../../utils/verificationStatus';
import i18n from '../../i18n';

const statusTabs = ['all', ...VERIFICATION_STATUSES];

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const VerificationCenter = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const language = isFrench ? 'fr' : 'en';
  const [requests, setRequests] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('pending');
  const [entityType, setEntityType] = useState('all');
  const [verificationType, setVerificationType] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const result = await VerificationService.getVerificationRequests({
        status: 'all',
        entityType,
        verificationType,
        limit: 160,
      });
      setRequests(result.requests || []);
    } catch (error) {
      console.warn('Unable to load verification requests:', error.message);
    } finally {
      setLoading(false);
    }
  }, [entityType, verificationType]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (selectedStatus !== 'all' && request.status !== selectedStatus) return false;
      if (!needle) return true;
      return [
        request.entity_type,
        request.entity_id,
        request.owner_user_id,
        request.verification_type,
        request.file_name,
        request.status,
      ].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [requests, search, selectedStatus]);

  const kpis = useMemo(() => {
    const base = { pending: 0, approved: 0, rejected: 0, expired: 0 };
    requests.forEach((request) => {
      if (base[request.status] !== undefined) base[request.status] += 1;
    });
    return base;
  }, [requests]);

  const openRequest = (request) => setSelectedRequest(request);

  const renderLoadingRows = () => Array.from({ length: 5 }).map((_, index) => (
    <tr key={`loading-${index}`} className="animate-pulse">
      <td className="px-4 py-4"><div className="h-4 w-32 rounded bg-slate-100" /></td>
      <td className="px-4 py-4"><div className="h-4 w-40 rounded bg-slate-100" /></td>
      <td className="px-4 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
      <td className="px-4 py-4"><div className="h-5 w-20 rounded-full bg-slate-100" /></td>
    </tr>
  ));

  return (
    <div className="min-h-screen bg-slate-50/80">
      <AdminModuleHero
        icon={<ShieldCheck className="h-6 w-6 text-white" />}
        eyebrow={tr('Operations', 'Opérations')}
        title={tr('Verification Center', 'Centre de vérification')}
        description={tr(
          'Review owner and vehicle compliance documents from one clean operational queue.',
          'Révisez les documents de conformité propriétaires et véhicules depuis une seule file opérationnelle.'
        )}
        actions={(
          <button
            type="button"
            onClick={loadRequests}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tr('Refresh', 'Actualiser')}
          </button>
        )}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['pending', tr('Pending review', 'En attente'), Clock3],
            ['approved', tr('Verified', 'Vérifiées'), ShieldCheck],
            ['rejected', tr('Needs replacement', 'À remplacer'), FileCheck2],
            ['expired', tr('Expired', 'Expirées'), RefreshCw],
          ].map(([key, label, Icon]) => (
            <div key={key} className="group rounded-[28px] border border-violet-100/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_24px_60px_rgba(79,70,229,0.10)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-black text-slate-950">{kpis[key] || 0}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {key === 'pending'
                  ? tr('Waiting for review', 'En attente de révision')
                  : tr('Current queue state', 'État actuel de la file')}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[34px] border border-violet-100 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">
                {tr('Review queue', 'File de révision')}
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {tr('Compliance documents', 'Documents de conformité')}
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {tr('Open a row to review the document in the side drawer.', 'Ouvrez une ligne pour réviser le document dans le panneau latéral.')}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={tr('Search requests...', 'Rechercher...')}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              >
                {statusTabs.map((status) => (
                  <option key={status} value={status}>
                    {status === 'all' ? tr('All statuses', 'Tous les statuts') : getVerificationLabel(status, language)}
                  </option>
                ))}
              </select>
              <select
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              >
                <option value="all">{tr('All entities', 'Tous les sujets')}</option>
                <option value="user">{tr('Users', 'Utilisateurs')}</option>
                <option value="vehicle">{tr('Vehicles', 'Véhicules')}</option>
              </select>
              <select
                value={verificationType}
                onChange={(event) => setVerificationType(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              >
                <option value="all">{tr('All document types', 'Tous les documents')}</option>
                {['profile_id', 'driver_license', 'vehicle_registration', 'vehicle_insurance', 'proof_of_ownership'].map((type) => (
                  <option key={type} value={type}>{getVerificationTypeLabel(type, language)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-[28px] border border-slate-200 md:block">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    tr('Subject', 'Sujet'),
                    tr('Document', 'Document'),
                    tr('Timeline', 'Calendrier'),
                    tr('Status', 'Statut'),
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading && renderLoadingRows()}
                {!loading && filteredRequests.map((request) => (
                  <tr
                    key={request.id}
                    onClick={() => openRequest(request)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openRequest(request);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${tr('Open verification request', 'Ouvrir la demande de vérification')} ${request.id}`}
                    className="cursor-pointer transition hover:bg-violet-50/60 focus:bg-violet-50/70 focus:outline-none"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black uppercase text-slate-600">
                          {request.entity_type === 'vehicle' ? 'VH' : 'US'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{request.entity_id}</p>
                          <p className="text-xs font-semibold capitalize text-slate-500">{request.entity_type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-slate-800">{getVerificationTypeLabel(request.verification_type, language)}</p>
                      <p className="mt-1 max-w-xs truncate text-xs font-semibold text-slate-500">{request.file_name || tr('Submitted document', 'Document soumis')}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-600">{formatDate(request.created_at)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {request.expires_at ? `${tr('Expires', 'Expire')} ${formatDate(request.expires_at)}` : tr('No expiry', 'Sans expiration')}
                      </p>
                    </td>
                    <td className="px-4 py-4"><VerificationStatusBadge status={request.status} /></td>
                  </tr>
                ))}
                {!loading && !filteredRequests.length && (
                  <tr>
                    <td colSpan="4" className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-violet-50 text-violet-700">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-black text-slate-900">{tr('Queue is clear.', 'La file est vide.')}</p>
                      <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-500">{tr('New owner and vehicle verification documents will appear here when submitted.', 'Les nouveaux documents de vérification propriétaires et véhicules apparaîtront ici après soumission.')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-3 md:hidden">
            {loading && Array.from({ length: 3 }).map((_, index) => (
              <div key={`mobile-loading-${index}`} className="h-32 animate-pulse rounded-[26px] border border-slate-200 bg-slate-50" />
            ))}
            {!loading && filteredRequests.map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => openRequest(request)}
                className="rounded-[26px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{request.entity_id}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{request.entity_type}</p>
                  </div>
                  <VerificationStatusBadge status={request.status} />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-800">{getVerificationTypeLabel(request.verification_type, language)}</p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{request.file_name || tr('Submitted document', 'Document soumis')}</p>
                <p className="mt-3 text-xs font-semibold text-slate-400">{formatDate(request.created_at)}</p>
              </button>
            ))}
            {!loading && !filteredRequests.length && (
              <div className="rounded-[28px] border border-dashed border-violet-200 bg-violet-50/40 p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-white text-violet-700 shadow-sm">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="mt-4 text-base font-black text-slate-900">{tr('Queue is clear.', 'La file est vide.')}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{tr('Submitted documents will appear here.', 'Les documents soumis apparaîtront ici.')}</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <VerificationReviewDrawer
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onUpdated={() => {
          setSelectedRequest(null);
          loadRequests();
        }}
      />
    </div>
  );
};

export default VerificationCenter;
