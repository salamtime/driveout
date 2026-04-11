import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PublicCatalogService from '../services/PublicCatalogService';
import PublicBookingService from '../services/PublicBookingService';
import PhoneInputWithCountryCode from '../components/forms/PhoneInputWithCountryCode';

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const PublicBookingRequest = () => {
  const { listingId } = useParams();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    customerName: userProfile?.fullName || user?.user_metadata?.full_name || '',
    customerEmail: user?.email || '',
    customerPhone: userProfile?.phone || user?.user_metadata?.phone || '',
    startDate: '',
    startTime: '10:00',
    rentalType: 'hourly',
    duration: 2,
    message: '',
  });
  const isMarketplaceRoute = location.pathname.startsWith('/marketplace');
  const detailHref = listing
    ? listing.inventorySource === 'marketplace' || isMarketplaceRoute
      ? `/marketplace/${listing.id}`
      : `/rent/${listing.id}`
    : isMarketplaceRoute ? '/marketplace' : '/rent';
  const browseHref = isMarketplaceRoute ? '/marketplace' : '/rent';
  const translate = (en, fr) => en || fr;

  useEffect(() => {
    let active = true;

    const loadListing = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await PublicCatalogService.getListingById(listingId);
        if (!active) return;
        if (!data) {
          setError('This listing could not be found.');
          return;
        }
        setListing(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || 'Failed to load request listing.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadListing();

    return () => {
      active = false;
    };
  }, [listingId]);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!listing) return;

    setSaving(true);
    setError('');

    try {
      const result = await PublicBookingService.createMarketplaceRequest({
        listing,
        userId: userProfile?.id || user?.id || null,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        startDate: form.startDate,
        startTime: form.startTime,
        duration: form.duration,
        rentalType: form.rentalType,
        message: form.message,
      });

      setSuccess(result);
    } catch (submitError) {
      setError(submitError?.message || 'Unable to send booking request right now.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-14">
        <div className="mx-auto max-w-6xl animate-pulse rounded-[32px] border border-slate-200 bg-white p-8">
          <div className="h-64 rounded-[28px] bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-14">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-rose-700">
          <h1 className="text-2xl font-semibold text-rose-900">Request unavailable</h1>
          <p className="mt-3">{error}</p>
          <Link to={browseHref} className="mt-6 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white">
            Back to browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to={detailHref} className="text-sm font-semibold text-amber-700">
            ← Back to listing
          </Link>
          <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
            {listing.badge}
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="space-y-6">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <img src={listing.imageUrl} alt={listing.title} className="h-64 w-full object-cover" />
              <div className="space-y-4 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">{listing.category}</p>
                  <h1 className="mt-2 text-2xl font-semibold text-slate-900">{listing.title}</h1>
                </div>
                <p className="text-sm leading-6 text-slate-600">{listing.description}</p>
                <div className="rounded-3xl bg-slate-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Booking flow</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Owner review required</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-600">Booking Request</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">Send a marketplace request</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                This creates the pre-booking request layer for marketplace supply. The owner or operator reviews it before it becomes a real booking.
              </p>
            </div>

            {success ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
                <h3 className="text-2xl font-semibold text-emerald-900">Request sent</h3>
                <p className="mt-3 text-sm text-emerald-800">
                  Your request was submitted successfully. Reference: <span className="font-semibold">{success.id}</span>
                </p>
                <div className="mt-5 grid gap-3 rounded-3xl bg-white/70 p-4 text-sm text-emerald-900 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Status</p>
                    <p className="mt-1 font-semibold">Pending owner review</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Requested</p>
                    <p className="mt-1 font-semibold">{formatDateTime(success.requested_start_at)} → {formatDateTime(success.requested_end_at)}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to={browseHref} className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">
                    Back to browse
                  </Link>
                  <Link to="/login" className="rounded-full border border-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-800">
                    Sign in to follow up
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Full name</span>
                    <input value={form.customerName} onChange={(e) => updateField('customerName', e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Email</span>
                    <input type="email" value={form.customerEmail} onChange={(e) => updateField('customerEmail', e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <div>
                    <PhoneInputWithCountryCode
                      value={form.customerPhone}
                      onChange={(value) => updateField('customerPhone', value)}
                      tr={translate}
                      label="Phone"
                    />
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Rental type</span>
                    <select value={form.rentalType} onChange={(e) => updateField('rentalType', e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400">
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Requested start date</span>
                    <input type="date" value={form.startDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => updateField('startDate', e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Requested start time</span>
                    <input type="time" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">{form.rentalType === 'hourly' ? 'Requested hours' : 'Requested days'}</span>
                    <select value={form.duration} onChange={(e) => updateField('duration', Number(e.target.value))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400">
                      {(form.rentalType === 'hourly' ? [1, 2, 3, 4, 6, 8] : [1, 2, 3, 4, 5, 7]).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Message to owner/operator</span>
                    <textarea value={form.message} onChange={(e) => updateField('message', e.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400" placeholder="Pickup preference, experience level, or anything that helps the owner review this request faster." />
                  </label>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-[28px] bg-slate-50 px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Request type</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">Marketplace review flow</p>
                  </div>
                  <button type="submit" disabled={saving} className="rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? 'Sending request...' : 'Send booking request'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default PublicBookingRequest;
