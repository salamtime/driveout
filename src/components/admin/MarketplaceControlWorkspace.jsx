import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  EyeOff,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Rocket,
  ShieldCheck,
  SquareArrowOutUpRight,
  UserRound,
  XCircle,
} from 'lucide-react';
import MarketplaceAdminService from '../../services/MarketplaceAdminService';
import MarketplaceModerationModal from './MarketplaceModerationModal';
import AdminModuleHero from './AdminModuleHero';
import AdminMobileStatsRow from './AdminMobileStatsRow';
import i18n from '../../i18n';
import { buildAdminMarketplaceListingPath } from '../../utils/marketplaceAdminLinks';

const buildOwnerProfileHref = (row) => {
  const params = new URLSearchParams();
  const resolvedCustomerId = String(
    row?.ownerCustomerId ||
    row?.customerId ||
    row?.customer_id ||
    ''
  ).trim();
  const resolvedAuthUserId = String(
    row?.ownerUserId ||
    row?.owner_user_id ||
    row?.user_id ||
    ''
  ).trim();
  const resolvedEmail = String(row?.ownerEmail || row?.email || '').trim().toLowerCase();
  const marketplaceOwnerId = String(row?.ownerId || row?.owner_id || row?.ownerUserId || '').trim();
  const marketplaceListingId = String(row?.id || '').trim();
  const vehicleProfileId = String(row?.vehiclePublicProfileId || row?.vehicle_public_profile_id || '').trim();
  const ownerName = String(row?.ownerDisplayName || row?.owner_display_name || '').trim();

  if (resolvedCustomerId) params.set('customerId', resolvedCustomerId);
  if (resolvedAuthUserId) params.set('authUserId', resolvedAuthUserId);
  if (resolvedEmail) params.set('email', resolvedEmail);
  if (marketplaceOwnerId) params.set('marketplaceOwnerId', marketplaceOwnerId);
  if (marketplaceListingId) params.set('marketplaceListingId', marketplaceListingId);
  if (vehicleProfileId) params.set('vehicleProfileId', vehicleProfileId);
  if (ownerName) params.set('ownerName', ownerName);

  return `/admin/customers/profile${params.toString() ? `?${params.toString()}` : ''}`;
};

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'live') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'approved') return 'bg-sky-100 text-sky-700';
  if (normalized === 'pending_review' || normalized === 'pending') return 'bg-amber-100 text-amber-700';
  if (normalized === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

const MarketplaceControlWorkspace = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [modalState, setModalState] = useState({ open: false, mode: null, row: null });

  const loadSnapshot = async () => {
    setError('');
    try {
      setLoading(true);
      const result = await MarketplaceAdminService.getSnapshot();
      setSnapshot(result.snapshot);
      setSetupRequired(Boolean(result.setupRequired));
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load marketplace controls.', 'Impossible de charger les controles marketplace.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await MarketplaceAdminService.getSnapshot();
        if (!cancelled) {
          setSnapshot(result.snapshot);
          setSetupRequired(Boolean(result.setupRequired));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || (isFrench ? 'Impossible de charger les controles marketplace.' : 'Unable to load marketplace controls.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isFrench]);

  const runAction = async (row, action, payload = {}) => {
    const actionKey = `${row.id}:${action}`;
    setActionLoading(actionKey);
    setError('');
    setSuccess('');

    try {
      const result = await MarketplaceAdminService.updateListingStatus({
        listingId: row.id,
        action,
        ...payload,
      });
      setSnapshot(result.snapshot);
      setSetupRequired(Boolean(result.setupRequired));
      setSuccess(tr('Marketplace listing updated.', 'Listing marketplace mis a jour.'));
      return true;
    } catch (actionError) {
      setError(actionError?.message || tr('Unable to update this listing.', 'Impossible de mettre a jour ce listing.'));
      return false;
    } finally {
      setActionLoading('');
    }
  };

  const openModal = (row, mode) => setModalState({ open: true, mode, row });
  const closeModal = () => setModalState({ open: false, mode: null, row: null });

  const renderListingActions = (row) => {
    const status = String(row.listingStatus || '').toLowerCase();
    const isBusy = (action) => actionLoading === `${row.id}:${action}`;
    const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60';

    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={buildAdminMarketplaceListingPath(row?.id)}
          className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700`}
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          {tr('Open vehicle', 'Ouvrir le véhicule')}
        </Link>
        {['pending_review', 'pending', 'draft', 'rejected'].includes(status) ? (
          <button
            type="button"
            onClick={() => runAction(row, 'approve')}
            disabled={Boolean(actionLoading)}
            className={`${buttonClass} bg-sky-100 text-sky-700 hover:bg-sky-200`}
          >
            {isBusy('approve') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {tr('Approve', 'Approuver')}
          </button>
        ) : null}
        {!['live', 'unpublished'].includes(status) ? (
          <button
            type="button"
            onClick={() => openModal(row, 'request_changes')}
            disabled={Boolean(actionLoading)}
            className={`${buttonClass} bg-amber-100 text-amber-800 hover:bg-amber-200`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {tr('Request changes', 'Demander des modifications')}
          </button>
        ) : null}
        {status === 'approved' ? (
          <button
            type="button"
            onClick={() => runAction(row, 'publish')}
            disabled={Boolean(actionLoading)}
            className={`${buttonClass} bg-emerald-100 text-emerald-700 hover:bg-emerald-200`}
          >
            {isBusy('publish') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            {tr('Publish', 'Publier')}
          </button>
        ) : null}
        {status === 'live' ? (
          <button
            type="button"
            onClick={() => runAction(row, 'unpublish')}
            disabled={Boolean(actionLoading)}
            className={`${buttonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}
          >
            {isBusy('unpublish') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
            {tr('Unpublish', 'Masquer')}
          </button>
        ) : null}
        {!['live', 'rejected'].includes(status) ? (
          <button
            type="button"
            onClick={() => openModal(row, 'reject')}
            disabled={Boolean(actionLoading)}
            className={`${buttonClass} bg-rose-100 text-rose-700 hover:bg-rose-200`}
          >
            {isBusy('reject') ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            {tr('Reject', 'Refuser')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => openModal(row, 'message_owner')}
          disabled={Boolean(actionLoading)}
          className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700`}
        >
          <UserRound className="h-3.5 w-3.5" />
          {tr('Send review feedback', 'Envoyer le retour')}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="hidden sm:block">
        <AdminModuleHero
          icon={<ClipboardList className="h-6 w-6 text-white" />}
          eyebrow={tr('Marketplace Review', 'Revue marketplace')}
          title={tr('Marketplace moderation and visibility', 'Modération et visibilité marketplace')}
          description={tr(
            'Review the public supply pipeline: drafts, pending review listings, live visibility, and the split between operators and independent owners.',
            'Revoyez le pipeline d’offre publique : brouillons, listings en attente de revue, visibilité en direct et répartition entre opérateurs et propriétaires indépendants.'
          )}
          actions={(
            <button
              type="button"
              onClick={loadSnapshot}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/15"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          )}
          className="overflow-hidden rounded-none"
        />
      </div>

      <div className="sm:hidden px-4 pt-5">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
            {tr('Marketplace Review', 'Revue marketplace')}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              {tr('Marketplace', 'Marketplace')}
            </h1>
            <button
              type="button"
              onClick={loadSnapshot}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {tr('Loading marketplace controls...', 'Chargement des contrôles marketplace...')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {setupRequired ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {tr(
            'Marketplace tables are only partially migrated. Run the marketplace compatibility SQL patch, then refresh this workspace.',
            'Les tables marketplace sont seulement partiellement migrees. Lancez le patch SQL de compatibilite marketplace, puis actualisez cet espace.'
          )}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <AdminMobileStatsRow>
        <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-violet-900">{tr('Total listings', 'Total listings')}</p>
              <p className="mt-2 text-2xl font-bold text-violet-700">{snapshot?.totalListings || 0}</p>
            </div>
            <Globe2 className="h-8 w-8 text-violet-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-900">{tr('Live listings', 'Listings live')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{snapshot?.activeListings || 0}</p>
            </div>
            <BadgeCheck className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">{tr('Pending review', 'En attente de revue')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{snapshot?.pendingReviewListings || 0}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-amber-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{tr('Draft listings', 'Listings brouillon')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-700">{snapshot?.draftListings || 0}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-slate-500" />
          </div>
        </div>
      </AdminMobileStatsRow>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-slate-900">{tr('Review queue', 'File de revue')}</h4>
          <p className="mt-1 text-sm text-slate-600">{tr('The supply items that still need a visibility decision before they feel truly live.', 'Les éléments d’offre qui demandent encore une décision de visibilité avant d’être vraiment live.')}</p>

          <div className="mt-5 rounded-[2rem] bg-slate-100/80 p-4 sm:p-5">
            <div className="space-y-5">
            {(snapshot?.reviewQueue || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {tr('Nothing is waiting in the review queue.', "Rien n'attend dans la file de revue.")}
              </div>
            ) : (
              snapshot.reviewQueue.map((row) => (
                <div key={row.id} className="rounded-[1.6rem] border border-slate-300/70 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(row.listingStatus)}`}>
                      {String(row.listingStatus || '').replace(/_/g, ' ')}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.ownerType === 'operator' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                      {row.ownerType}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{row.bookingMode}</span>
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{row.title}</p>
                  <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-500">
                      {tr('Owner', 'Propriétaire')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-950">{row.ownerDisplayName || '—'}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {[row.cityName, row.areaName].filter(Boolean).join(' • ') || tr('No city set', 'Ville non définie')}
                    </p>
                  </div>
                  {row.shortDescription ? (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{row.shortDescription}</p>
                  ) : null}
                  {row.latestOwnerMessage ? (
                    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">
                        {tr('Latest sent message', 'Dernier message envoyé')}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-sky-900">{row.latestOwnerMessage}</p>
                    </div>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-600">
                    {tr('Price from', 'Prix à partir de')} {row.price || 0} MAD • {tr('Deposit', 'Caution')} {row.depositAmount || 0} MAD
                  </p>
                  {row.rejectionReason ? (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{row.rejectionReason}</p>
                  ) : null}
                  <div className="mt-4">
                    <Link
                      to={buildOwnerProfileHref(row)}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      {tr('Open owner profile', 'Ouvrir le profil propriétaire')}
                    </Link>
                  </div>
                  {renderListingActions(row)}
                </div>
              ))
            )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-slate-900">{tr('Supply mix', 'Répartition de l’offre')}</h4>
            <div className="mt-5 grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-sky-900">{tr('Operator listings', 'Listings opérateur')}</p>
                    <p className="mt-2 text-2xl font-bold text-sky-700">{snapshot?.operatorListings || 0}</p>
                  </div>
                  <Building2 className="h-7 w-7 text-sky-600" />
                </div>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-violet-900">{tr('Owner listings', 'Listings propriétaire')}</p>
                    <p className="mt-2 text-2xl font-bold text-violet-700">{snapshot?.ownerListings || 0}</p>
                  </div>
                  <UserRound className="h-7 w-7 text-violet-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-lg font-semibold text-slate-900">{tr('Live marketplace surface', 'Surface marketplace en direct')}</h4>
            <p className="mt-1 text-sm text-slate-600">{tr('Listings currently contributing to the public marketplace experience.', 'Listings qui alimentent actuellement l’expérience publique marketplace.')}</p>

            <div className="mt-5 rounded-[2rem] bg-slate-100/80 p-4 sm:p-5">
              <div className="space-y-5">
              {(snapshot?.liveRows || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {tr('No live marketplace listings yet.', 'Aucun listing marketplace live pour le moment.')}
                </div>
              ) : (
                snapshot.liveRows.map((row) => (
                  <div key={row.id} className="rounded-[1.6rem] border border-slate-300/70 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {tr('Live', 'Live')}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.ownerType === 'operator' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                        {row.ownerType}
                      </span>
                    </div>
                    <p className="mt-3 font-semibold text-slate-900">{row.title}</p>
                    <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-500">
                        {tr('Owner', 'Propriétaire')}
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-950">{row.ownerDisplayName || '—'}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {tr('Booking mode', 'Mode de réservation')}: {row.bookingMode || '—'}
                      </p>
                    </div>
                    <div className="mt-4">
                      <Link
                        to={buildOwnerProfileHref(row)}
                        className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        {tr('Open owner profile', 'Ouvrir le profil propriétaire')}
                      </Link>
                    </div>
                    {renderListingActions(row)}
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MarketplaceModerationModal
        mode={modalState.mode}
        open={modalState.open}
        loading={Boolean(actionLoading)}
        onClose={closeModal}
        onSubmit={async (payload) => {
          if (!modalState.row || !modalState.mode) return;
          const ok = await runAction(modalState.row, modalState.mode, payload);
          if (ok) closeModal();
        }}
      />
    </div>
  );
};

export default MarketplaceControlWorkspace;
