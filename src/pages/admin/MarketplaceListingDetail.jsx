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
import MessageWidget from '../../components/messages/MessageWidget';
import { useAuth } from '../../contexts/AuthContext';
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

const buildOwnerProfileHref = (detail) => {
  const params = new URLSearchParams();
  const resolvedCustomerId = String(
    detail?.owner?.customerId ||
    detail?.owner?.customer_id ||
    detail?.ownerCustomerId ||
    ''
  ).trim();
  const resolvedAuthUserId = String(
    detail?.owner?.id ||
    detail?.ownerId ||
    detail?.owner_id ||
    detail?.ownerUserId ||
    ''
  ).trim();
  const resolvedEmail = String(detail?.owner?.email || '').trim().toLowerCase();

  if (resolvedCustomerId) params.set('customerId', resolvedCustomerId);
  if (resolvedAuthUserId) params.set('authUserId', resolvedAuthUserId);
  if (resolvedEmail) params.set('email', resolvedEmail);

  return `/admin/customers/profile${params.toString() ? `?${params.toString()}` : ''}`;
};

const MarketplaceListingDetail = () => {
  const { listingId } = useParams();
  const { user, userProfile } = useAuth();
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
  const ownerUserId = String(detail?.owner?.id || detail?.ownerId || detail?.owner_id || detail?.ownerUserId || '').trim();
  const ownerProfileHref = buildOwnerProfileHref(detail);
  const ownerName = detail.owner?.fullName || detail.ownerDisplayName || '—';
  const ownerIdentity = [detail.ownerType, detail.owner?.companyName].filter(Boolean).join(' • ');
  const ownerLocation = [detail.cityName, detail.areaName, detail.countryName].filter(Boolean).join(' • ');
  const adminLabel = String(
    userProfile?.username ||
    userProfile?.fullName ||
    userProfile?.full_name ||
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'Admin'
  ).trim();

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

      <div className="rounded-[2.2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px] xl:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">
              {tr('Marketplace submission', 'Soumission marketplace')}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{detail.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
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
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.6rem] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {tr('Owner', 'Propriétaire')}
                </p>
                <p className="mt-2 text-base font-bold text-slate-950">{ownerName}</p>
                {ownerIdentity ? <p className="mt-1 text-sm font-medium text-slate-500">{ownerIdentity}</p> : null}
              </div>
              <div className="rounded-[1.6rem] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {tr('Location', 'Localisation')}
                </p>
                <p className="mt-2 text-base font-bold text-slate-950">{ownerLocation || '—'}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">{detail.pickupLocationName || detail.pickupAddress || detail.cityName || '—'}</p>
              </div>
              <div className="rounded-[1.6rem] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  {tr('Visibility', 'Visibilité')}
                </p>
                <p className="mt-2 text-base font-bold text-slate-950">{currentListingStatus === 'live' ? tr('Live on marketplace', 'En direct sur marketplace') : tr('Waiting on moderation', 'En attente de modération')}</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {currentListingStatus === 'live'
                    ? tr('Publicly visible right now.', 'Visible publiquement maintenant.')
                    : tr('Still moving through the review pipeline.', 'Encore dans le pipeline de revue.')}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-violet-100 bg-violet-50/60 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-3 text-violet-700 shadow-sm">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-500">
                  {tr('Owner profile', 'Profil propriétaire')}
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">{ownerName}</h2>
                {ownerIdentity ? <p className="mt-1 text-sm font-medium text-slate-500">{ownerIdentity}</p> : null}
              </div>
            </div>
            <div className="mt-5 space-y-3 rounded-[1.5rem] border border-white/70 bg-white/80 px-4 py-4 text-sm text-slate-700">
              <div>
                <span className="font-semibold text-slate-500">{tr('Email', 'Email')}</span>
                <p className="mt-1 font-semibold text-slate-900 break-all">{detail.owner?.email || '—'}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500">{tr('Phone', 'Téléphone')}</span>
                <p className="mt-1 font-semibold text-slate-900">{detail.owner?.phone || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Total listings', 'Total listings')}</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{detail.owner?.totalListings || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Live listings', 'Listings live')}</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{detail.owner?.liveListings || 0}</p>
                </div>
              </div>
              <div className="pt-1">
                <Link
                  to={ownerProfileHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                >
                  <UserRound className="h-4 w-4" />
                  {tr('Open owner profile', 'Ouvrir le profil propriétaire')}
                </Link>
              </div>
            </div>
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
                <p className="mt-1 text-sm text-slate-600">{tr('Listing details and submission data.', 'Détails du listing et données de soumission.')}</p>
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
                <p className="mt-1 text-sm text-slate-600">{tr('Cover image and gallery used for review.', 'Image de couverture et galerie utilisées pour la revue.')}</p>
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
              <Link
                to={ownerProfileHref}
                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
              >
                <UserRound className="h-4 w-4" />
                {tr('Open owner profile', 'Ouvrir le profil propriétaire')}
              </Link>
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
                {tr('Send review feedback', 'Envoyer le retour')}
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

      <MessageWidget
        contextType="listing"
        contextId={String(listingId || detail?.id || '')}
        contextLabel={tr('Listing', 'Listing')}
        contextTitle={detail.title || tr('Marketplace listing', 'Listing marketplace')}
        contextSubtitle={tr('Moderation thread with the owner', 'Fil de modération avec le propriétaire')}
        contextStatus={String(detail.listingStatus || '').replace(/_/g, ' ')}
        family="marketplace"
        threadType="marketplace_moderation"
        currentUserId={user?.id}
        currentUserLabel={adminLabel}
        currentSenderRole="admin"
        isFrench={isFrench}
        tr={tr}
        isAdmin
        allowInternalNotes
        allowThreadStateControls
        replyTarget={ownerUserId ? {
          userId: ownerUserId,
          role: 'owner',
          label: detail.owner?.fullName || detail.ownerDisplayName || '',
          email: detail.owner?.email || '',
        } : null}
        seedThread={{
          id: `marketplace-moderation-${listingId}`,
          thread_key: '',
          family: 'marketplace',
          thread_type: 'marketplace_moderation',
          entity_type: 'listing',
          entity_id: String(listingId || detail?.id || ''),
          subject: detail.title || 'Marketplace listing',
          metadata: {
            adminHref: `/admin/marketplace/${encodeURIComponent(String(listingId || detail?.id || ''))}`,
            href: '/account/marketplace',
          },
          messages: [],
        }}
      />
    </div>
  );
};

export default MarketplaceListingDetail;
