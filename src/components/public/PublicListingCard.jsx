import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isTerminalMarketplaceRequestStatus } from '../../utils/marketplaceRequestState';

const CERTIFIED_BADGE_SRC =
  '/images/certified-badge.png';

const resolveListingOwnerId = (listing) =>
  String(listing?.ownerId || listing?.owner_id || listing?.ownerUserId || listing?.owner_user_id || '')
    .trim();

const resolveListingOwnerName = (listing) =>
  String(
    listing?.ownerDisplayName ||
    listing?.owner_display_name ||
    listing?.ownerName ||
    listing?.owner_name ||
    ''
  ).trim();

const PublicListingCard = ({
  listing,
  embeddedInAccount = false,
  accountBasePath = '/account/marketplace',
  existingRequest = null,
  ownerListingCount = 0,
  ownerReviewSummary = null,
}) => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const effectiveUserId = String(userProfile?.id || user?.id || '').trim();
  const isMarketplace = listing.inventorySource === 'marketplace';
  const listingOwnerId = resolveListingOwnerId(listing);
  const listingOwnerName = resolveListingOwnerName(listing);
  const isOwnerViewingOwnListing = Boolean(
    isMarketplace &&
    effectiveUserId &&
    listingOwnerId &&
    effectiveUserId === listingOwnerId
  );
  const activeExistingRequest = isTerminalMarketplaceRequestStatus(existingRequest) ? null : existingRequest;
  const showRequestedState = Boolean(isMarketplace && !isOwnerViewingOwnListing && activeExistingRequest);
  const canBrowseOwnerListings = Boolean(isMarketplace && listingOwnerId && ownerListingCount > 1);
  const ownerAverageRating = Number(ownerReviewSummary?.averageRating || 0);
  const ownerReviewCount = Number(ownerReviewSummary?.totalReviews || 0);
  const showOwnerReviewSummary = Boolean(isMarketplace && ownerReviewCount > 0 && ownerAverageRating > 0);
  const ownerPrimaryPrice = listing.dailyPrice || listing.halfDayPrice || 0;
  const ownerPrimaryLabel = listing.dailyPrice
    ? '/ day'
    : listing.halfDayPrice
      ? '/ half-day'
      : 'from';
  const primaryHref = useMemo(() => {
    if (isMarketplace && embeddedInAccount) {
      return `${accountBasePath}/${listing.id}`;
    }
    return listing.detailHref || listing.bookingHref || `/rent/${listing.id}`;
  }, [accountBasePath, embeddedInAccount, isMarketplace, listing.bookingHref, listing.detailHref, listing.id]);
  const riderLabel = listing.riderCapacity === 1 ? '1 rider' : `${listing.riderCapacity} riders`;
  const marketplaceLocationLabel = [listing.location?.city || listing.location?.label, riderLabel].filter(Boolean).join(' • ');
  const specLabel = [listing.powerCcLabel, listing.transmission].filter(Boolean).join(' • ');
  const showVerifiedBadge = listing.badge === 'Certified Fleet' || Boolean(listing.isVerified || listing.verifiedOwner || listing.verifiedListing);
  const showVehicleDocumentsBadge = Boolean(listing.vehicleDocumentsVerified);
  const listingTitle = [listing.brand, listing.model].filter(Boolean).join(' ').trim() || listing.title || 'Marketplace listing';

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${listingTitle}`}
      onClick={() => navigate(primaryHref)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(primaryHref);
        }
      }}
      className="group relative flex h-full cursor-pointer touch-manipulation flex-col overflow-hidden rounded-[28px] border border-violet-200/90 bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08),0_24px_52px_rgba(15,23,42,0.05)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.018] hover:shadow-[0_18px_38px_rgba(79,70,229,0.12),0_28px_60px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.982]"
    >
      <div className={`relative z-[2] flex flex-1 flex-col ${isMarketplace ? 'p-5 sm:p-6' : 'p-4 sm:p-5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.75rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2rem]">
              {listingTitle}
            </h3>
            {isMarketplace && listingOwnerName ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-500 sm:text-base">
                  by {listingOwnerName}
                </p>
                {showOwnerReviewSummary ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {ownerAverageRating.toFixed(1)} · {ownerReviewCount}
                  </span>
                ) : null}
              </div>
            ) : null}
            {isMarketplace ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {showVerifiedBadge ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <img
                      src={CERTIFIED_BADGE_SRC}
                      alt="Verified"
                      className="h-3.5 w-3.5 rounded-full object-cover"
                    />
                    Verified owner
                  </span>
                ) : null}
                {showVehicleDocumentsBadge ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Documents verified
                  </span>
                ) : null}
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {isOwnerViewingOwnListing ? 'Your listing' : 'Approval required'}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">
                {listing.isAvailable ? 'Ready to ride now' : 'Currently unavailable'}
              </p>
            )}
          </div>
          {showVerifiedBadge ? (
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-violet-100 sm:h-12 sm:w-12">
              <img
                src={CERTIFIED_BADGE_SRC}
                alt="Verified listing"
                className="h-7 w-7 object-contain sm:h-8 sm:w-8"
              />
            </span>
          ) : null}
        </div>

        <div className={`relative mt-4 overflow-hidden ${isMarketplace ? 'h-52 sm:h-60 lg:h-64' : 'h-40 rounded-[24px] bg-[linear-gradient(180deg,#f8f6ff_0%,#eef2ff_100%)] sm:h-48 lg:h-56'}`}>
          {!listing.isAvailable && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/45">
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                Currently unavailable
              </span>
            </div>
          )}
          {!isMarketplace ? (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.92),rgba(255,255,255,0)_72%)]" />
          ) : null}
          <img
            src={listing.imageUrl}
            alt={listingTitle}
            className={`relative z-[1] h-full w-full object-contain transition duration-500 ${
              isMarketplace ? 'scale-[1.14] px-0 py-0 sm:scale-[1.18]' : 'scale-[1.22] px-0 py-0 group-hover:scale-[1.28]'
            }`}
          />
        </div>

        <div className={isMarketplace ? 'mt-6' : 'mt-5'}>
          <div>
            <div>
              <p className="text-3xl font-black leading-none text-slate-950 sm:text-4xl">
                {(isMarketplace ? ownerPrimaryPrice : listing.priceFrom) || 0} {listing.currencyCode}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {isMarketplace ? ownerPrimaryLabel : listing.hourlyPrice ? '/ hour' : listing.dailyPrice ? '/ day' : 'from'}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm font-medium text-slate-600">
            <p>
              {isMarketplace
                ? marketplaceLocationLabel
                : [listing.riderCapacity ? riderLabel : null, listing.location?.city || listing.location?.label].filter(Boolean).join(' • ')}
            </p>
            {isMarketplace && specLabel ? (
              <p className="text-slate-500">{specLabel}</p>
            ) : null}
          </div>
        </div>

        <div className={isMarketplace ? 'mt-6' : 'mt-5'}>
          <span className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${
            showRequestedState
              ? 'border border-slate-300 bg-slate-200 text-slate-700 shadow-[0_10px_24px_rgba(148,163,184,0.12)]'
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] group-hover:translate-y-[-1px]'
          }`}>
            {isMarketplace ? (isOwnerViewingOwnListing ? 'Open owner workspace' : showRequestedState ? 'Requested' : 'Request') : 'Book Now'}
          </span>
          {canBrowseOwnerListings ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const next = new URLSearchParams();
                next.set('owner', listingOwnerId);
                if (listingOwnerName) next.set('ownerName', listingOwnerName);
                navigate(`/marketplace?${next.toString()}`);
              }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              {listingOwnerName
                ? `Other listings from ${listingOwnerName}`
                : `Other listings from this owner`}
            </button>
          ) : null}
        </div>
      </div>

    </div>
  );
};

export default PublicListingCard;
