import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CarFront,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  MessageSquareText,
  ReceiptText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountStatCard from '../../components/account/AccountStatCard';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import { normalizeOwnerRentalHistoryRows } from '../../utils/ownerRentalHistory';

const FILTERS = ['all', 'active', 'upcoming', 'completed', 'cancelled'];

const statusToneClass = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  upcoming: 'border-violet-200 bg-violet-50 text-violet-700',
  completed: 'border-slate-200 bg-slate-100 text-slate-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
};

const formatDateTime = (value, locale) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatMoney = (amount = 0, currencyCode = 'MAD', locale = 'en-MA') =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(amount || 0))} ${currencyCode}`;

const getStatusLabel = (status, tr) => {
  if (status === 'active') return tr('Active', 'Active');
  if (status === 'upcoming') return tr('Upcoming', 'À venir');
  if (status === 'completed') return tr('Completed', 'Terminée');
  if (status === 'cancelled') return tr('Cancelled', 'Annulée');
  return tr('All', 'Tout');
};

const getDepositOutcomeLabel = (outcome, tr) => {
  if (outcome === 'refund_full') return tr('Refunded in full', 'Remboursée en totalité');
  if (outcome === 'hold_partial') return tr('Partially held', 'Partiellement retenue');
  if (outcome === 'hold_full') return tr('Held in full', 'Retenue en totalité');
  return tr('Deposit review pending', 'Revue caution en attente');
};

const getMileageOverageSettlementLabel = (settlement, tr) => {
  if (settlement === 'deduct_deposit') return tr('Deducted from deposit', 'Déduit de la caution');
  if (settlement === 'paid_separately') return tr('Paid separately', 'Payé séparément');
  if (settlement === 'waived') return tr('Waived', 'Annulé');
  if (settlement === 'unpaid') return tr('Unpaid', 'Impayé');
  return tr('Pending review', 'Revue en attente');
};

const getPhotoUrl = (photo = {}) =>
  String(photo?.thumbnailUrl || photo?.publicUrl || '').trim();

const getPhotoFullUrl = (photo = {}) =>
  String(photo?.publicUrl || photo?.thumbnailUrl || '').trim();

const getPhotoLabel = (photo = {}, index = 0) =>
  String(photo?.originalFilename || photo?.id || `Photo ${index + 1}`).trim();

const buildMediaGroups = (row, tr) => {
  const draft = row?.ownerExecution || {};
  return [
    {
      key: 'open-media',
      title: tr('Open media', 'Médias ouverture'),
      detail: tr('Photos captured before the vehicle leaves.', 'Photos prises avant le départ du véhicule.'),
      photos: Array.isArray(draft.handoffPhotos) ? draft.handoffPhotos : [],
    },
    {
      key: 'documents-media',
      title: tr('Registration plus insurance media', 'Médias immatriculation et assurance'),
      detail: tr('Registration and insurance photos captured before handoff.', 'Photos carte grise et assurance prises avant la remise.'),
      photos: Array.isArray(draft.legalDocsPhotos) ? draft.legalDocsPhotos : [],
    },
    {
      key: 'closed-media',
      title: tr('Closed media', 'Médias clôture'),
      detail: tr('Photos captured when the vehicle returns.', 'Photos prises au retour du véhicule.'),
      photos: Array.isArray(draft.returnPhotos) ? draft.returnPhotos : [],
    },
  ].filter((group) => group.photos.length > 0);
};

const AccountRentalHistory = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr-MA' : 'en-MA';
  const tr = useCallback((en, fr) => (isFrench ? fr : en), [isFrench]);
  const currentPath = getCurrentLocationPath(location);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [mediaPreviewRow, setMediaPreviewRow] = useState(null);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const result = await BusinessMarketplaceService.getOwnerRequests(user.id, 'all', { forceRefresh: true });
      if (result?.error && !result?.setupRequired) {
        throw result.error;
      }
      setRows(normalizeOwnerRentalHistoryRows(result?.requests || []));
    } catch (historyError) {
      console.warn('Failed to load owner rental history:', historyError);
      setError(historyError?.message || tr('Unable to load rental history right now.', "Impossible de charger l'historique pour le moment."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tr, user?.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const counts = useMemo(
    () =>
      FILTERS.reduce((acc, filter) => {
        acc[filter] = filter === 'all' ? rows.length : rows.filter((row) => row.status === filter).length;
        return acc;
      }, {}),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeFilter !== 'all' && row.status !== activeFilter) return false;
      if (!normalizedQuery) return true;
      return [
        row.customerName,
        row.customerEmail,
        row.vehicleName,
        row.reference,
        row.cityName,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [activeFilter, query, rows]);

  const completedRows = rows.filter((row) => row.status === 'completed');
  const activeRows = rows.filter((row) => row.status === 'active');
  const totalOwnerPayout = completedRows.reduce((sum, row) => sum + Number(row.ownerPayoutAmount || 0), 0);
  const totalExtraMileageAmount = completedRows.reduce((sum, row) => sum + Number(row.mileageOverage?.amount || 0), 0);
  const latestCompleted = completedRows[0] || null;
  const mediaPreviewGroups = useMemo(
    () => buildMediaGroups(mediaPreviewRow, tr),
    [mediaPreviewRow, tr]
  );

  return (
    <div className="space-y-6">
      <AccountWorkspaceHero
        eyebrow={tr('History', 'Historique')}
        title={tr('Rental history', 'Historique des locations')}
        description={tr(
          'Every vehicle you rented out, with receipts, contracts, media counts, and the shared chat in one clean timeline.',
          'Tous les véhicules que vous avez loués, avec reçus, contrats, médias et discussion partagée dans une timeline claire.'
        )}
        aside={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/account/overview"
              state={{ from: currentPath }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <ArrowLeft className="h-4 w-4" />
              {tr('Back home', "Retour à l'accueil")}
            </Link>
            <button
              type="button"
              onClick={() => void loadHistory({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          </div>
        }
      />

      <section className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex snap-x snap-mandatory gap-3">
          <AccountStatCard
            compact
            eyebrow={tr('Completed', 'Terminées')}
            value={completedRows.length}
            label={latestCompleted ? latestCompleted.vehicleName : tr('No closed rentals yet', 'Aucune location clôturée')}
            tone="slate"
          />
          <AccountStatCard
            compact
            eyebrow={tr('Active', 'Actives')}
            value={activeRows.length}
            label={tr('Live or return flow rentals', 'Locations en cours ou retour')}
            tone="emerald"
          />
          <AccountStatCard
            compact
            eyebrow={tr('Owner payout', 'Paiement propriétaire')}
            value={formatMoney(totalOwnerPayout, 'MAD', locale)}
            label={tr('From completed rentals', 'Depuis les locations terminées')}
            tone="violet"
          />
          <AccountStatCard
            compact
            eyebrow={tr('Extra mileage', 'Kilométrage extra')}
            value={formatMoney(totalExtraMileageAmount, 'MAD', locale)}
            label={tr('Recorded on closed rentals', 'Enregistré sur locations clôturées')}
            tone="amber"
          />
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr('Search customer, vehicle, or reference', 'Rechercher client, véhicule ou référence')}
              className="min-h-[52px] w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                  activeFilter === filter
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                }`}
              >
                {getStatusLabel(filter, tr)}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeFilter === filter ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[filter] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 grid gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-[1.5rem] bg-slate-100" />
            ))}
          </div>
        ) : filteredRows.length ? (
          <div className="mt-5 grid gap-3">
            {filteredRows.map((row) => (
              <article
                key={row.id}
                className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#fff,rgba(248,250,252,0.72))] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-500">
                      {row.coverImageUrl ? (
                        <img src={row.coverImageUrl} alt={row.vehicleName} className="h-full w-full object-cover" />
                      ) : (
                        <CarFront className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${statusToneClass[row.status] || statusToneClass.upcoming}`}>
                          {getStatusLabel(row.status, tr)}
                        </span>
                        {row.reference ? (
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
                            {row.reference}
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-2 truncate text-lg font-semibold tracking-[-0.01em] text-slate-950">
                        {row.customerName}
                      </h2>
                      <p className="mt-1 truncate text-sm font-bold text-slate-600">
                        {row.vehicleName}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[30rem]">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Schedule', 'Planning')}</p>
                      <p className="mt-1 font-bold text-slate-900">{formatDateTime(row.requestedStartAt || row.primaryDate, locale)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Payout', 'Paiement')}</p>
                      <p className="mt-1 font-bold text-emerald-700">{formatMoney(row.ownerPayoutAmount, row.currencyCode, locale)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Extra mileage', 'Kilométrage extra')}</p>
                      <p className={`mt-1 font-bold ${row.mileageOverage ? 'text-amber-700' : 'text-slate-400'}`}>
                        {row.mileageOverage
                          ? `${formatMoney(row.mileageOverage.amount, row.mileageOverage.currencyCode || row.currencyCode, locale)} · ${row.mileageOverage.extraKm} km`
                          : tr('None', 'Aucun')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Media', 'Médias')}</p>
                      <p className="mt-1 font-bold text-slate-900">
                        {row.totalMediaCount} · {tr('Open', 'Ouverture')} {row.mediaCounts.open} · {tr('Closed', 'Clôture')} {row.mediaCounts.closed}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      {row.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-violet-600" />}
                      {row.status === 'completed'
                        ? `${tr('Completed', 'Terminée')} ${formatDateTime(row.completedAt || row.primaryDate, locale)}`
                        : `${tr('Updated', 'Mise à jour')} ${formatDateTime(row.primaryDate, locale)}`}
                    </span>
                    <span>·</span>
                    <span>{getDepositOutcomeLabel(row.depositOutcome, tr)}</span>
                    {row.mileageOverage ? (
                      <>
                        <span>·</span>
                        <span>
                          {tr('Extra mileage', 'Kilométrage extra')} {getMileageOverageSettlementLabel(row.mileageOverage.settlement, tr)}
                        </span>
                      </>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {row.receiptUrl ? (
                      <a
                        href={row.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(79,70,229,0.18)] transition hover:-translate-y-0.5"
                      >
                        <ReceiptText className="h-4 w-4" />
                        {tr('Open receipt', 'Ouvrir reçu')}
                      </a>
                    ) : null}
                    {row.contractUrl ? (
                      <a
                        href={row.contractUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <FileText className="h-4 w-4" />
                        {tr('Open contract', 'Ouvrir contrat')}
                      </a>
                    ) : null}
                    {row.totalMediaCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setMediaPreviewRow(row)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <Camera className="h-4 w-4" />
                        {tr('Open media', 'Ouvrir médias')}
                      </button>
                    ) : null}
                    <Link
                      to={row.chatHref}
                      state={{ from: currentPath }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <MessageSquareText className="h-4 w-4" />
                      {tr('Chat', 'Chat')}
                    </Link>
                    <Link
                      to={row.detailsHref}
                      state={{ from: currentPath, ownerOperationRequest: row.rawRequest }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      {tr('Details', 'Détails')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
              <History className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950">{tr('No rental history found', 'Aucun historique trouvé')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
              {tr(
                'Completed rentals, active handoffs, receipts, and chats will appear here as soon as your vehicles start moving.',
                'Les locations terminées, remises actives, reçus et chats apparaîtront ici dès que vos véhicules commencent à bouger.'
              )}
            </p>
          </div>
        )}
      </section>

      {mediaPreviewRow ? (
        <div
          className="fixed inset-0 z-[120] flex items-end bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Rental media preview', 'Aperçu médias location')}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMediaPreviewRow(null);
            }
          }}
        >
          <div className="max-h-[88dvh] w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600">
                  {tr('Rental media', 'Médias location')}
                </p>
                <h2 className="mt-1 truncate text-xl font-bold tracking-[-0.01em] text-slate-950">
                  {mediaPreviewRow.customerName}
                </h2>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">
                  {mediaPreviewRow.vehicleName} · {mediaPreviewRow.totalMediaCount} {tr('photos', 'photos')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMediaPreviewRow(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                aria-label={tr('Close media preview', 'Fermer aperçu médias')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(88dvh-7rem)] overflow-y-auto px-5 py-5">
              {mediaPreviewGroups.length ? (
                <div className="space-y-5">
                  {mediaPreviewGroups.map((group) => (
                    <section key={group.key} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                            {group.title}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {group.detail}
                          </p>
                        </div>
                        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                          {group.photos.length} {tr('photos', 'photos')}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                        {group.photos.map((photo, index) => {
                          const previewUrl = getPhotoUrl(photo);
                          const fullUrl = getPhotoFullUrl(photo);
                          return (
                            <a
                              key={`${group.key}-${photo.id || index}`}
                              href={fullUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="group overflow-hidden rounded-[1.25rem] border border-white bg-white shadow-[0_12px_26px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-violet-200"
                            >
                              <div className="aspect-[4/3] bg-slate-100">
                                {previewUrl ? (
                                  <img
                                    src={previewUrl}
                                    alt={getPhotoLabel(photo, index)}
                                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                                    <Camera className="h-6 w-6" />
                                  </div>
                                )}
                              </div>
                              <div className="px-3 py-2">
                                <p className="truncate text-xs font-bold text-slate-600">
                                  {getPhotoLabel(photo, index)}
                                </p>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <Camera className="mx-auto h-7 w-7 text-slate-400" />
                  <p className="mt-3 text-sm font-bold text-slate-600">
                    {tr('No media saved for this rental yet.', "Aucun média enregistré pour cette location.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountRentalHistory;
