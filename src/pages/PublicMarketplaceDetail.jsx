import React, { useMemo, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarClock, Gauge, MapPin, ShieldCheck, Share2, X } from 'lucide-react';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import PublicSiteFooter from '../components/public/PublicSiteFooter';
import PublicCatalogService from '../services/PublicCatalogService';
import PublicBookingService from '../services/PublicBookingService';
import VerificationService from '../services/VerificationService';
import { useAuth } from '../contexts/AuthContext';
import { buildMarketplaceRequestPath, buildMarketplaceWhatsappShareHref } from '../utils/marketplaceShareLinks';
import { getMarketplaceRequestDisplay, normalizeMarketplaceRequestLifecycleStatus } from '../utils/marketplaceRequestState';
import { getCachedMarketplaceRequestForUsers } from '../utils/marketplaceRequestCache';
import { resolveReturnPath } from '../utils/navigationReturn';

const VERIFIED_BADGE_SRC = '/images/certified-badge.png';

const formatMoney = (value, currency = 'MAD') => {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString() : '0'} ${currency}`;
};

const formatHalfDayWindow = (minHours, maxHours) => {
  const min = Number(minHours || 0);
  const max = Number(maxHours || 0);
  if (min > 0 && max > 0) return `${min}-${max} hours`;
  if (max > 0) return `${max} hours`;
  if (min > 0) return `${min} hours`;
  return '4-5 hours';
};

const getVerificationStatus = (userProfile, user) =>
  String(
    userProfile?.verificationStatus ||
      user?.user_metadata?.verification_status ||
      user?.app_metadata?.verification_status ||
      ''
  )
    .trim()
    .toLowerCase();

const resolveListingOwnerId = (listing) =>
  String(listing?.ownerId || listing?.owner_id || listing?.ownerUserId || listing?.owner_user_id || '')
    .trim();

const PublicMarketplaceDetail = ({ embeddedInAccount = false, accountBasePath = '/account/marketplace' }) => {
  const { listingId } = useParams();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const [listing, setListing] = useState(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const [existingRequestLoading, setExistingRequestLoading] = useState(false);
  const listingOwnerId = resolveListingOwnerId(listing);
  const isOwnerViewingOwnListing = Boolean(user?.id && listingOwnerId && String(user.id) === listingOwnerId);
  const backHref = useMemo(
    () => resolveReturnPath(location, embeddedInAccount ? accountBasePath : '/marketplace'),
    [accountBasePath, embeddedInAccount, location]
  );
  const backLabel = useMemo(() => {
    if (location.state?.from) {
      return 'Back to messages';
    }
    return embeddedInAccount ? 'Back to your marketplace' : 'Back to marketplace';
  }, [embeddedInAccount, location.state]);

  useEffect(() => {
    let active = true;

    const loadListing = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await PublicCatalogService.getListingById(listingId);
        if (!active) return;

        if (!data || data.inventorySource !== 'marketplace') {
          setError('This marketplace listing is not available.');
          return;
        }

        setListing(data);
        setActiveMediaIndex(0);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load this marketplace listing.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadListing();

    return () => {
      active = false;
    };
  }, [listingId]);

  useEffect(() => {
    let active = true;

    const loadVerificationSummary = async () => {
      if (!user?.id) {
        setVerificationSummary(null);
        setVerificationLoading(false);
        return;
      }

      try {
        setVerificationLoading(true);
        const result = await VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true });
        if (active) {
          setVerificationSummary(result?.summary || null);
        }
      } catch {
        if (active) {
          setVerificationSummary(null);
        }
      } finally {
        if (active) {
          setVerificationLoading(false);
        }
      }
    };

    void loadVerificationSummary();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    const loadExistingRequest = async () => {
      if (!user?.id || !listing?.id || isOwnerViewingOwnListing) {
        setExistingRequest(null);
        setExistingRequestLoading(false);
        return;
      }

      try {
        setExistingRequestLoading(true);
        const result = await PublicBookingService.getExistingMarketplaceRequest(
          listing?.sourceId || listing?.id,
          listing?.id
        );
        if (active) {
          setExistingRequest(result || null);
        }
      } catch {
        if (active) {
          setExistingRequest(null);
        }
      } finally {
        if (active) {
          setExistingRequestLoading(false);
        }
      }
    };

    void loadExistingRequest();

    return () => {
      active = false;
    };
  }, [isOwnerViewingOwnListing, listing?.id, user?.id]);

  const galleryMedia = Array.isArray(listing?.media) && listing.media.length > 0
    ? listing.media.filter((item) => String(item?.url || '').trim())
    : [];
  const activeMediaItem = galleryMedia[activeMediaIndex] || null;
  const activeImageUrl = activeMediaItem?.url || listing?.imageUrl || '';
  const returnPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
  const verificationStatus = String(
    verificationSummary?.status || getVerificationStatus(userProfile, user)
  ).trim().toLowerCase();
  const isVerifiedAccount = Boolean(user?.id) && (
    verificationSummary?.complete === true ||
    ['approved', 'verified'].includes(verificationStatus)
  );
  const requestPath = listing
    ? embeddedInAccount
      ? `${accountBasePath}/${listing.id}/request`
      : buildMarketplaceRequestPath(listing.id, { source: 'listing-detail', via: 'primary-cta' })
    : '/marketplace';
  const verificationRedirectState = listing
    ? {
        from: requestPath,
        resumeBookingFlow: 'marketplace_request',
        bookingContext: {
          listingId: listing.id,
          vehicleId: listing.vehicleId || listing.vehiclePublicProfileId || '',
          startDate: '',
          endDate: '',
        },
      }
    : { from: returnPath };
  const trustSignals = useMemo(
    () => [
      listing?.badge ? 'Verified owner' : null,
      galleryMedia.length >= 3 ? 'Real photos' : null,
      listing?.depositAmount ? 'Deposit at pickup' : null,
    ].filter(Boolean),
    [galleryMedia.length, listing?.badge, listing?.depositAmount]
  );
  const vehicleSpecs = [
    listing?.riderCapacity ? `${listing.riderCapacity} ${listing.riderCapacity === 1 ? 'seat' : 'seats'}` : null,
    listing?.powerCcLabel || null,
    listing?.transmission || null,
  ].filter(Boolean);
  const whatsappHref = listing
    ? buildMarketplaceWhatsappShareHref({
        listingId: listing.id,
        title: listing.title,
        dailyPrice: listing.dailyPrice,
        currencyCode: listing.currencyCode || 'MAD',
        locationLabel: listing?.location?.label || listing?.location?.city || '',
        source: 'public-share',
      })
    : '';
  const cachedRequestedState = getCachedMarketplaceRequestForUsers({
    userIds: [
      userProfile?.id || user?.id || '',
      userProfile?.email || user?.email || '',
    ],
    listingId: listing?.sourceId || listing?.id,
  });
  const effectiveExistingRequest = existingRequest || cachedRequestedState || null;
  const existingRequestStatus = normalizeMarketplaceRequestLifecycleStatus(effectiveExistingRequest || '');
  const existingRequestDisplay = effectiveExistingRequest ? getMarketplaceRequestDisplay(existingRequestStatus) : null;
  const shouldShowRequestedState = Boolean(!isOwnerViewingOwnListing && effectiveExistingRequest);
  const existingRequestHref = existingRequest?.id
    ? `/account/messages?requestId=${encodeURIComponent(String(existingRequest.id))}`
    : cachedRequestedState?.requestId
      ? `/account/messages?requestId=${encodeURIComponent(String(cachedRequestedState.requestId))}`
      : '';
  const isResolvingBookingAccess = Boolean(user?.id && !isOwnerViewingOwnListing && (verificationLoading || existingRequestLoading));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fcfbff_0%,#f8fafc_45%,#ffffff_100%)]">
      {!embeddedInAccount ? <PublicSiteChrome current="marketplace" /> : null}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to={backHref}
          className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        {loading ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="h-[420px] animate-pulse rounded-[2rem] bg-white shadow-sm" />
            <div className="h-[420px] animate-pulse rounded-[2rem] bg-white shadow-sm" />
          </div>
        ) : error ? (
          <section className="mt-8 rounded-[2rem] border border-rose-200 bg-rose-50 p-8 text-rose-700">
            <h1 className="text-2xl font-black text-rose-900">Listing unavailable</h1>
            <p className="mt-3">{error}</p>
          </section>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-[0_24px_70px_rgba(79,70,229,0.10)]">
              <div className="relative min-h-[360px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.9),rgba(237,233,254,0.9))]">
                <img
                  src={activeImageUrl}
                  alt={listing.title}
                  className="h-full min-h-[360px] w-full rounded-[2rem] object-contain p-4"
                />
                <div className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm ring-1 ring-violet-100">
                  {listing.badge}
                </div>
                <button
                  type="button"
                  onClick={() => setShowVerificationInfo(true)}
                  className="absolute bottom-5 right-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_14px_34px_rgba(79,70,229,0.18)] ring-1 ring-violet-200 transition hover:scale-[1.03] hover:shadow-[0_18px_42px_rgba(79,70,229,0.22)]"
                  aria-label="Open verified listing information"
                >
                  <img
                    src={VERIFIED_BADGE_SRC}
                    alt="Verified listing"
                    className="h-9 w-9 rounded-full object-cover"
                  />
                </button>
              </div>
              {galleryMedia.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto border-t border-slate-100 p-4">
                  {galleryMedia.slice(0, 8).map((item, index) => (
                    <button
                      key={item.id || item.url || index}
                      type="button"
                      onClick={() => setActiveMediaIndex(index)}
                      className={`h-20 w-28 shrink-0 overflow-hidden rounded-2xl border bg-slate-50 transition ${
                        index === activeMediaIndex
                          ? 'border-violet-400 ring-2 ring-violet-200'
                          : 'border-slate-200 hover:border-violet-200'
                      }`}
                      aria-label={`Show marketplace image ${index + 1}`}
                    >
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  <img
                    src={VERIFIED_BADGE_SRC}
                    alt="Verified"
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  Verified
                </span>
                {trustSignals.map((signal) => (
                  <span
                    key={signal}
                    className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {signal}
                  </span>
                ))}
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">
                {listing.title}
              </h1>
              <p className="mt-3 text-base font-semibold text-slate-600">
                {listing.location?.label || listing.location?.city || 'Morocco'}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-violet-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Price per day</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{listing.dailyPrice ? formatMoney(listing.dailyPrice, listing.currencyCode) : '-'}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Deposit</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {listing.depositAmount ? formatMoney(listing.depositAmount, listing.currencyCode) : '-'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Paid at pickup
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <MapPin className="h-4 w-4 text-violet-600" />
                  <span>{listing.location?.label || listing.location?.city || 'Morocco'}</span>
                </div>
                {vehicleSpecs.length ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <Gauge className="h-4 w-4 text-violet-600" />
                    <span>{vehicleSpecs.join(' • ')}</span>
                  </div>
                ) : null}
              </div>

              <div className={`mt-8 rounded-[1.75rem] p-5 ${
                isOwnerViewingOwnListing
                  ? 'border border-emerald-200 bg-emerald-50'
                  : 'border border-violet-200 bg-violet-50'
              }`}>
                <div className="flex items-start gap-3">
                  <CalendarClock className={`mt-0.5 h-5 w-5 ${isOwnerViewingOwnListing ? 'text-emerald-700' : 'text-violet-700'}`} />
                  <div>
                    <p className={`font-black ${isOwnerViewingOwnListing ? 'text-emerald-900' : 'text-violet-900'}`}>
                      {isOwnerViewingOwnListing ? 'Open owner workspace' : 'Request this vehicle'}
                    </p>
                    <p className={`mt-1 text-sm leading-6 ${isOwnerViewingOwnListing ? 'text-emerald-800' : 'text-violet-800'}`}>
                      {isOwnerViewingOwnListing
                        ? 'You are viewing your own marketplace vehicle. Manage pricing, availability, listing details, and incoming requests from the owner workspace.'
                        : 'Owner will review your request before confirmation.'}
                    </p>
                    {!isOwnerViewingOwnListing ? (
                      <p className="mt-3 text-sm font-semibold text-violet-900">
                        Request → Owner approves → You confirm
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-5">
                <p className="text-sm leading-7 text-slate-700">
                  {listing.description || listing.shortSpec || 'A clean, ready-to-book vehicle for your next ride.'}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {isOwnerViewingOwnListing ? (
                  <Link
                    to={
                      listing?.vehiclePublicProfileId
                        ? `/account/vehicles/${encodeURIComponent(String(listing.vehiclePublicProfileId))}/profile?tab=listing`
                        : accountBasePath
                    }
                    state={{ from: returnPath }}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-sm font-black text-white shadow-[0_18px_40px_rgba(16,185,129,0.24)] transition hover:-translate-y-0.5"
                  >
                    Open owner workspace
                  </Link>
                ) : isResolvingBookingAccess ? (
                  <span className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-slate-100 px-5 py-4 text-sm font-black text-slate-500 shadow-[0_10px_24px_rgba(148,163,184,0.10)]">
                    Checking your booking access...
                  </span>
                ) : shouldShowRequestedState ? (
                  <Link
                    to={existingRequestHref || '#'}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-slate-200 px-5 py-4 text-sm font-black text-slate-700 shadow-[0_10px_24px_rgba(148,163,184,0.16)] transition hover:bg-slate-200"
                  >
                    {existingRequestDisplay?.shortLabel || 'Requested'}
                  </Link>
                ) : (
                  <Link
                    to={isVerifiedAccount ? requestPath : '/account/verification'}
                    state={isVerifiedAccount ? { from: returnPath } : verificationRedirectState}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-sm font-black text-white shadow-[0_18px_40px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5"
                  >
                    {isVerifiedAccount ? 'Request booking' : 'Complete verification'}
                  </Link>
                )}
                {!isOwnerViewingOwnListing && existingRequestHref ? (
                  <Link
                    to={existingRequestHref}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    Open in messages
                  </Link>
                ) : null}
                {!isOwnerViewingOwnListing && !effectiveExistingRequest && whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    <Share2 className="h-4 w-4" />
                    Share on WhatsApp
                  </a>
                ) : null}
              </div>
              {shouldShowRequestedState ? (
                <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                  You already have an open request for this vehicle. Continue from Messenger instead of sending another request.
                </div>
              ) : null}
            </section>
          </div>
        )}
      </main>

      {!embeddedInAccount ? <PublicSiteFooter /> : null}
      {showVerificationInfo ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-4 sm:items-center sm:p-6">
          <div className="w-full max-w-md rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <BadgeCheck className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-lg font-black text-slate-950">Verified listing</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    This vehicle passed listing checks before going live.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVerificationInfo(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="Close verified listing information"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PublicMarketplaceDetail;
