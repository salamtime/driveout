import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Car,
  CheckCircle2,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRound,
  WalletCards,
} from 'lucide-react';
import MarketplaceAdminService from '../../services/MarketplaceAdminService';
import MarketplaceModerationModal from '../../components/admin/MarketplaceModerationModal';
import i18n from '../../i18n';

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'live') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'approved') return 'bg-sky-100 text-sky-700';
  if (normalized === 'pending_review' || normalized === 'pending') return 'bg-amber-100 text-amber-700';
  if (normalized === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

const cardClass = 'rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

const moderationTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'changes_requested') return 'bg-amber-100 text-amber-800';
  if (normalized === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

const computeQuality = (detail) => {
  const mediaCount = Array.isArray(detail?.media) ? detail.media.length : 0;
  const checks = [
    [Boolean(detail?.brandName), 10, 'Brand'],
    [Boolean(detail?.modelName), 10, 'Model'],
    [Boolean(detail?.year), 5, 'Year'],
    [Boolean(detail?.cityName), 5, 'City'],
    [Boolean(detail?.shortDescription), 10, 'Short description'],
    [Boolean(detail?.fullDescription), 10, 'Full description'],
    [Boolean(detail?.hourlyPriceAmount || detail?.dailyPriceAmount), 10, 'Pricing'],
    [Boolean(detail?.depositAmount), 5, 'Deposit'],
    [Boolean(detail?.transmission || detail?.seats || detail?.engineCc), 5, 'Specs'],
    [Boolean(detail?.pickupLocationName || detail?.pickupAddress), 5, 'Pickup setup'],
    [Boolean(detail?.workingDays?.length || detail?.workingHours?.start), 5, 'Availability'],
    [detail?.insuranceIncluded !== null && detail?.insuranceIncluded !== undefined, 5, 'Insurance declaration'],
    [mediaCount >= 1, 10, 'At least 1 image'],
    [mediaCount >= 3, 10, 'At least 3 images'],
    [Boolean(detail?.coverImageUrl), 5, 'Cover image'],
  ];

  const score = checks.reduce((sum, [passed, weight]) => sum + (passed ? weight : 0), 0);
  const missing = checks.filter(([passed]) => !passed).map(([, , label]) => label);
  return { score, missing, mediaCount };
};

const MarketplaceListingDetail = () => {
  const { listingId } = useParams();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [modalMode, setModalMode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await MarketplaceAdminService.getListingDetail(listingId);
        if (!cancelled) {
          setDetail(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load listing details.', 'Impossible de charger les details du listing.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (listingId) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [listingId, isFrench]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {tr('Loading marketplace submission...', 'Chargement de la soumission marketplace...')}
        </span>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;
  }

  if (!detail) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{tr('Listing not found.', 'Listing introuvable.')}</div>;
  }

  const media = Array.isArray(detail.media) ? detail.media : [];
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const history = Array.isArray(detail.moderationHistory) ? detail.moderationHistory : [];
  const quality = computeQuality(detail);
  const currentListingStatus = String(detail.listingStatus || '').toLowerCase();

  const reload = async () => {
    const result = await MarketplaceAdminService.getListingDetail(listingId);
    setDetail(result);
  };

  const runAction = async (action, payload = {}) => {
    setActionLoading(action);
    setError('');
    setSuccess('');

    try {
      await MarketplaceAdminService.updateListingStatus({
        listingId,
        action,
        ...payload,
      });
      await reload();
      setSuccess(tr('Marketplace moderation updated.', 'Moderation marketplace mise a jour.'));
      return true;
    } catch (actionError) {
      setError(actionError?.message || tr('Unable to update this listing.', 'Impossible de mettre a jour ce listing.'));
      return false;
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900">
        <ArrowLeft className="h-4 w-4" />
        {tr('Back to marketplace review', 'Retour a la revue marketplace')}
      </Link>

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="rounded-[2rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.18),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#f5f3ff_100%)] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">
              {tr('Marketplace submission', 'Soumission marketplace')}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{detail.title}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {[detail.ownerDisplayName, detail.cityName, detail.areaName].filter(Boolean).join(' • ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ${statusTone(detail.listingStatus)}`}>
              {String(detail.listingStatus || '').replace(/_/g, ' ')}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              {detail.ownerType}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              {detail.bookingMode}
            </span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${moderationTone(detail.moderationStatus)}`}>
              {String(detail.moderationStatus || 'not_reviewed').replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {detail.rejectionReason ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <strong>{tr('Rejection reason:', 'Raison du refus :')}</strong> {detail.rejectionReason}
        </div>
      ) : null}

      {detail.adminNotes ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <strong>{tr('Admin notes:', 'Notes admin :')}</strong> {detail.adminNotes}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Vehicle information', 'Informations vehicule')}</h2>
                <p className="mt-1 text-sm text-slate-600">{tr('Full submission details entered by the owner.', 'Details complets saisis par le proprietaire.')}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Brand', 'Marque')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.brandName || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Model', 'Modele')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.modelName || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Category', 'Categorie')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.categoryCode || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Year', 'Annee')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.year || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Plate / Ref', 'Plaque / Ref')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.plateNumber || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Transmission', 'Transmission')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.transmission || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Seats', 'Places')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.seats || '—'}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Engine CC', 'Cylindree')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{detail.engineCc || '—'}</p></div>
              <div className="md:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Short description', 'Description courte')}</p><p className="mt-2 text-sm text-slate-700">{detail.shortDescription || '—'}</p></div>
              <div className="md:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Full description', 'Description complete')}</p><p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{detail.fullDescription || '—'}</p></div>
              <div className="md:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Availability note', 'Note disponibilite')}</p><p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{detail.availability?.note || '—'}</p></div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Media', 'Medias')}</h2>
                <p className="mt-1 text-sm text-slate-600">{tr('Cover image and submitted gallery.', 'Image couverture et galerie soumise.')}</p>
              </div>
            </div>
            {media.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {tr('No media uploaded yet.', 'Aucun media televerse pour le moment.')}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {media.map((item, index) => (
                  <div key={item.id || item.url || index} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <img src={item.url} alt={item.name || `media-${index + 1}`} className="h-48 w-full object-cover" />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                      <span className="truncate">{item.name || `Image ${index + 1}`}</span>
                      {detail.coverImageUrl === item.url || item.is_cover ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-700">{tr('Cover', 'Couverture')}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Pricing', 'Tarification')}</h2>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between"><span>{tr('Hourly', 'Horaire')}</span><strong>{detail.hourlyPriceAmount || 0} {detail.currencyCode}</strong></div>
              <div className="flex items-center justify-between"><span>{tr('Daily', 'Journalier')}</span><strong>{detail.dailyPriceAmount || 0} {detail.currencyCode}</strong></div>
              <div className="flex items-center justify-between"><span>{tr('Weekly', 'Hebdomadaire')}</span><strong>{detail.weeklyPriceAmount || 0} {detail.currencyCode}</strong></div>
              <div className="flex items-center justify-between"><span>{tr('Security deposit', 'Caution')}</span><strong>{detail.depositAmount || 0} {detail.currencyCode}</strong></div>
              <div className="flex items-center justify-between"><span>{tr('Included KM', 'KM inclus')}</span><strong>{detail.includedKm || 0}</strong></div>
              <div className="flex items-center justify-between"><span>{tr('Extra KM rate', 'Prix KM supp.')}</span><strong>{detail.extraKmRate || 0} {detail.currencyCode}</strong></div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Owner information', 'Informations proprietaire')}</h2>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-700">
              <div><span className="font-semibold text-slate-500">{tr('Full name', 'Nom complet')}</span><p className="mt-1 font-semibold text-slate-900">{detail.owner?.fullName || detail.ownerDisplayName || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Email', 'Email')}</span><p className="mt-1 font-semibold text-slate-900 break-all">{detail.owner?.email || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Phone', 'Telephone')}</span><p className="mt-1 font-semibold text-slate-900">{detail.owner?.phone || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Account type', 'Type de compte')}</span><p className="mt-1 font-semibold text-slate-900">{detail.owner?.accountType || detail.ownerType || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Company', 'Societe')}</span><p className="mt-1 font-semibold text-slate-900">{detail.owner?.companyName || '—'}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Total listings', 'Total listings')}</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{detail.owner?.totalListings || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Live listings', 'Listings live')}</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{detail.owner?.liveListings || 0}</p>
                </div>
              </div>
              <div><span className="font-semibold text-slate-500">{tr('Join date', "Date d'inscription")}</span><p className="mt-1 font-semibold text-slate-900">{detail.owner?.joinDate || '—'}</p></div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Location & quality', 'Lieu et qualite')}</h2>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-700">
              <div><span className="font-semibold text-slate-500">{tr('City', 'Ville')}</span><p className="mt-1 font-semibold text-slate-900">{detail.cityName || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Area', 'Zone')}</span><p className="mt-1 font-semibold text-slate-900">{detail.areaName || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Country', 'Pays')}</span><p className="mt-1 font-semibold text-slate-900">{detail.countryName || '—'}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Quality score', 'Score qualite')}</p>
                    <p className="mt-2 text-2xl font-black text-slate-950">{quality.score}%</p>
                  </div>
                  {quality.score >= 80 ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <ShieldAlert className="h-8 w-8 text-amber-600" />}
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(8, quality.score)}%` }} />
                </div>
                {quality.missing.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {quality.missing.map((item) => (
                      <span key={item} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Review timeline', 'Chronologie revue')}</h2>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-slate-700">
              <div><span className="font-semibold text-slate-500">{tr('Submitted at', 'Soumis le')}</span><p className="mt-1">{detail.submittedAt || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Reviewed at', 'Revise le')}</span><p className="mt-1">{detail.reviewedAt || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Published at', 'Publie le')}</span><p className="mt-1">{detail.publishedAt || '—'}</p></div>
              <div><span className="font-semibold text-slate-500">{tr('Updated at', 'Mis a jour le')}</span><p className="mt-1">{detail.updatedAt || '—'}</p></div>
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">{tr('Moderation actions', 'Actions de moderation')}</h2>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {['pending_review', 'pending', 'draft', 'rejected'].includes(currentListingStatus) ? (
                <button
                  type="button"
                  onClick={() => runAction('approve')}
                  disabled={Boolean(actionLoading)}
                  className="flex w-full items-center justify-center rounded-2xl bg-sky-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                >
                  {actionLoading === 'approve' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : tr('Approve', 'Approuver')}
                </button>
              ) : null}
              {!['live', 'unpublished'].includes(currentListingStatus) ? (
                <button
                  type="button"
                  onClick={() => setModalMode('request_changes')}
                  disabled={Boolean(actionLoading)}
                  className="flex w-full items-center justify-center rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
                >
                  {tr('Request changes', 'Demander des modifications')}
                </button>
              ) : null}
              {!['live', 'rejected'].includes(currentListingStatus) ? (
                <button
                  type="button"
                  onClick={() => setModalMode('reject')}
                  disabled={Boolean(actionLoading)}
                  className="flex w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {tr('Reject', 'Refuser')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setModalMode('message_owner')}
                disabled={Boolean(actionLoading)}
                className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
              >
                {tr('Message owner', 'Message proprietaire')}
              </button>
              {currentListingStatus === 'approved' ? (
                <button
                  type="button"
                  onClick={() => runAction('publish')}
                  disabled={Boolean(actionLoading)}
                  className="flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {tr('Publish', 'Publier')}
                </button>
              ) : null}
              {currentListingStatus === 'approved' ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {tr(
                    'Approved means moderation passed. Publish it to make it visible on the marketplace website.',
                    "Approuvé signifie que la modération est validée. Publiez-le pour le rendre visible sur le site marketplace."
                  )}
                </div>
              ) : null}
              {currentListingStatus === 'live' ? (
                <button
                  type="button"
                  onClick={() => runAction('unpublish')}
                  disabled={Boolean(actionLoading)}
                  className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                >
                  {tr('Unpublish', 'Masquer')}
                </button>
              ) : null}
              <Link to="/admin/marketplace" className="flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                {tr('Back to review queue', 'Retour a la file de revue')}
              </Link>
              {currentListingStatus === 'live' ? (
                <Link to={`/marketplace/marketplace-${detail.id}`} className="flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">
                  {tr('Open public listing', 'Ouvrir le listing public')}
                </Link>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <section className={cardClass}>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">{tr('Moderation history', 'Historique de moderation')}</h2>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {tr('No moderation history yet.', 'Aucun historique de moderation pour le moment.')}
            </div>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(entry.statusAfter || entry.actionType)}`}>
                    {String(entry.actionType || '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{entry.createdAt || '—'}</span>
                </div>
                {entry.reason ? <p className="mt-3 text-sm font-semibold text-slate-900">{entry.reason}</p> : null}
                {entry.feedback ? <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{entry.feedback}</p> : null}
                {entry.suggestions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.suggestions.map((suggestion) => (
                      <span key={suggestion} className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {suggestion}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">{tr('Owner communication', 'Communication proprietaire')}</h2>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {tr('No owner-facing messages yet.', 'Aucun message visible proprietaire pour le moment.')}
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {String(message.messageType || 'message').replace(/_/g, ' ')}
                  </span>
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                    {message.senderType}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{message.createdAt || '—'}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{message.body || '—'}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <MarketplaceModerationModal
        mode={modalMode}
        open={Boolean(modalMode)}
        loading={Boolean(actionLoading)}
        onClose={() => setModalMode(null)}
        onSubmit={async (payload) => {
          if (!modalMode) return;
          const ok = await runAction(modalMode, payload);
          if (ok) setModalMode(null);
        }}
      />
    </div>
  );
};

export default MarketplaceListingDetail;
