import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Gauge, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import PublicCatalogService from '../services/PublicCatalogService';

const formatMoney = (value, currency = 'MAD') => {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toLocaleString() : '0'} ${currency}`;
};

const PublicMarketplaceDetail = () => {
  const { listingId } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fcfbff_0%,#f8fafc_45%,#ffffff_100%)]">
      <PublicSiteChrome current="marketplace" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-900">
          <ArrowLeft className="h-4 w-4" />
          Back to marketplace
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
                  src={listing.imageUrl}
                  alt={listing.title}
                  className="h-full min-h-[360px] w-full object-contain p-4"
                />
                <div className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-violet-700 shadow-sm ring-1 ring-violet-100">
                  {listing.badge}
                </div>
              </div>
              {Array.isArray(listing.media) && listing.media.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto border-t border-slate-100 p-4">
                  {listing.media.slice(0, 8).map((item, index) => (
                    <div key={item.id || item.url || index} className="h-20 w-28 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                  Request only
                </span>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-violet-700">
                  Marketplace
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">
                {listing.title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {listing.description || listing.shortSpec}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-violet-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Hourly</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{listing.hourlyPrice ? formatMoney(listing.hourlyPrice, listing.currencyCode) : '-'}</p>
                </div>
                <div className="rounded-3xl bg-emerald-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Daily</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{listing.dailyPrice ? formatMoney(listing.dailyPrice, listing.currencyCode) : '-'}</p>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <MapPin className="h-4 w-4 text-violet-600" />
                  <span>{listing.location?.label || listing.location?.city || 'Morocco'}</span>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <UserRound className="h-4 w-4 text-violet-600" />
                  <span>{listing.ownerDisplayName || listing.ownerLabel}</span>
                </div>
                {listing.depositAmount ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>Security deposit: {formatMoney(listing.depositAmount, listing.currencyCode)}</span>
                  </div>
                ) : null}
                {[listing.riderCapacity ? `${listing.riderCapacity} seats` : null, listing.powerCcLabel, listing.transmission].filter(Boolean).length ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <Gauge className="h-4 w-4 text-violet-600" />
                    <span>{[listing.riderCapacity ? `${listing.riderCapacity} seats` : null, listing.powerCcLabel, listing.transmission].filter(Boolean).join(' • ')}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <p className="font-black text-amber-900">Owner review required</p>
                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      Send a request first. The owner or operator will accept, decline, or counter-offer before this becomes a confirmed rental.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                to={`/marketplace/${listing.id}/request`}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-sm font-black text-white shadow-[0_18px_40px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5"
              >
                Request booking
              </Link>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicMarketplaceDetail;
