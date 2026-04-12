import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, X } from 'lucide-react';

const CERTIFIED_BADGE_SRC =
  '/images/certified-badge.png';

const PublicListingCard = ({ listing }) => {
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const isMarketplace = listing.inventorySource === 'marketplace';
  const primaryHref = listing.detailHref || listing.bookingHref || `/rent/${listing.id}`;
  const riderLabel = listing.riderCapacity === 1 ? '1 rider' : `${listing.riderCapacity} riders`;

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-violet-200/90 bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08),0_24px_52px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(79,70,229,0.12),0_28px_60px_rgba(15,23,42,0.08)]"
    >
      <Link
        to={primaryHref}
        aria-label={`Open ${listing.title}`}
        className="absolute inset-0 z-[1] rounded-[28px]"
      />

      <div className={`relative z-[2] flex flex-1 flex-col ${isMarketplace ? 'p-5 sm:p-6' : 'p-4 sm:p-5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.75rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2rem]">
              {listing.title}
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm">
              {isMarketplace
                ? 'Owner approval required'
                : listing.isAvailable ? 'Ready to ride now' : 'Currently unavailable'}
            </p>
          </div>
          {listing.badge === 'Certified Fleet' ? (
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-violet-100 sm:h-12 sm:w-12">
              <img
                src={CERTIFIED_BADGE_SRC}
                alt="Certified fleet"
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
            alt={listing.title}
            className={`relative z-[1] h-full w-full object-contain transition duration-500 group-hover:scale-[1.04] ${
              isMarketplace ? 'scale-[1.14] px-0 py-0 sm:scale-[1.18]' : 'scale-[1.22] px-0 py-0 group-hover:scale-[1.28]'
            }`}
          />
          {isMarketplace ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowVerificationInfo((current) => !current);
              }}
              className="absolute bottom-3 right-3 z-[3] inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_12px_30px_rgba(79,70,229,0.16)] ring-1 ring-violet-200 transition hover:scale-[1.03] hover:shadow-[0_16px_36px_rgba(79,70,229,0.2)]"
              aria-label="Open verified listing information"
            >
              <img
                src={CERTIFIED_BADGE_SRC}
                alt="Verified listing"
                className="h-8 w-8 rounded-full object-cover"
              />
            </button>
          ) : null}
        </div>

        <div className={isMarketplace ? 'mt-6' : 'mt-5'}>
          <div>
            <div>
              <p className="text-3xl font-black leading-none text-slate-950 sm:text-4xl">
                {listing.priceFrom || 0} {listing.currencyCode}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {listing.hourlyPrice ? '/ hour' : listing.dailyPrice ? '/ day' : 'from'}
              </p>
            </div>
          </div>

          {listing.isAvailable ? (
            <div className="mt-3">
              <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100 sm:px-3 sm:text-xs">
                {isMarketplace ? 'Request listing' : 'Available now'}
              </span>
            </div>
          ) : null}

          <div className="mt-4 text-sm font-medium text-slate-600">
            {[listing.riderCapacity ? riderLabel : null, listing.location?.city || listing.location?.label].filter(Boolean).join(' • ')}
          </div>
        </div>

        <div className={isMarketplace ? 'mt-6' : 'mt-5'}>
          <span className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition group-hover:translate-y-[-1px]">
            {isMarketplace ? 'View & Request' : 'Book Now'}
          </span>
        </div>
      </div>

      {isMarketplace && showVerificationInfo ? (
        <div className="absolute inset-x-4 bottom-4 z-[4] rounded-[1.35rem] border border-violet-100 bg-white/98 p-4 shadow-[0_18px_44px_rgba(79,70,229,0.18)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-slate-950">Verified listing</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Owner profile, pricing, and marketplace review were checked before this listing went live.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowVerificationInfo(false);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              aria-label="Close verified listing information"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PublicListingCard;
