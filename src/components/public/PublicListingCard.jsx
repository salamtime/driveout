import React from 'react';
import { Link } from 'react-router-dom';

const CERTIFIED_BADGE_SRC =
  '/images/certified-badge.png';

const PublicListingCard = ({ listing }) => {
  const isMarketplace = listing.inventorySource === 'marketplace';
  const primaryHref = listing.detailHref || listing.bookingHref || `/rent/${listing.id}`;
  const riderLabel = listing.riderCapacity === 1 ? '1 rider' : `${listing.riderCapacity} riders`;

  return (
    <Link
      to={primaryHref}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-violet-200/90 bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08),0_24px_52px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(79,70,229,0.12),0_28px_60px_rgba(15,23,42,0.08)]"
    >
      <div className="flex flex-1 flex-col p-4 sm:p-5">
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

        <div className="relative mt-4 h-40 overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,#f8f6ff_0%,#eef2ff_100%)] sm:h-48 lg:h-56">
          {!listing.isAvailable && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/45">
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                Currently unavailable
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.92),rgba(255,255,255,0)_72%)]" />
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="relative z-[1] h-full w-full scale-[1.22] object-contain px-0 py-0 transition duration-500 group-hover:scale-[1.28]"
          />
        </div>

        <div className="mt-5">
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

        <div className="mt-5">
          <span className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition group-hover:translate-y-[-1px]">
            {isMarketplace ? 'View & Request' : 'Book Now'}
          </span>
        </div>
      </div>
    </Link>
  );
};

export default PublicListingCard;
