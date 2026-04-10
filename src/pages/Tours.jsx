import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Image as ImageIcon, MapPin, Route, X } from 'lucide-react';
import toast from 'react-hot-toast';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import { fetchTourPackages } from '../services/tourPackageService';

const GLOBAL_TOUR_PRICING_KEY = '__global_tour_pricing__';
const DEFAULT_CITY = 'Tangier';

const formatDuration = (hours) => {
  const numeric = Number(hours || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Duration set by guide';
  if (numeric === 1) return '1 hour';
  if (numeric % 1 === 0) return `${numeric.toFixed(0)} hours`;
  return `${numeric.toFixed(1)} hours`;
};

const formatMoney = (value) => `${Number(value || 0).toLocaleString('en-MA')} MAD`;

const stripLegacyTourRules = (value) => {
  const text = String(value || '');
  const markerIndex = text.indexOf('[tour_package_rules]');
  return (markerIndex === -1 ? text : text.slice(0, markerIndex)).trim();
};

const normalizeDuration = (value) => {
  const duration = Number(value || 0);
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(1)) : 1;
};

const modelLabel = (model) => {
  const name = String(model?.name || '').trim();
  const variant = String(model?.model || '').trim();
  if (name && variant && name.toLowerCase().includes(variant.toLowerCase())) return name;
  return [name, variant].filter(Boolean).join(' ').trim() || 'Selected model';
};

const getPackagePriceRows = ({ rows = [], packageId, durationHours }) => {
  const duration = normalizeDuration(durationHours);
  const exact = rows.filter(
    (row) =>
      String(row.package_id) === String(packageId) &&
      normalizeDuration(row.duration_hours) === duration &&
      Number(row.price_mad || 0) > 0
  );

  if (exact.length > 0) return exact;

  return rows.filter(
    (row) =>
      String(row.package_id) === GLOBAL_TOUR_PRICING_KEY &&
      normalizeDuration(row.duration_hours) === duration &&
      Number(row.price_mad || 0) > 0
  );
};

const buildPublicTour = (pkg, pricingRows, vehicleModels) => {
  const routeStops = Array.isArray(pkg.routeStops) && pkg.routeStops.length > 0
    ? pkg.routeStops
    : [
        { type: 'start', title: pkg.location || 'Base departure', note: 'Safety check', duration_minutes: 0 },
        { type: 'drive', title: pkg.routeLabel || pkg.routeType || 'Guided route', note: formatDuration(pkg.duration), duration_minutes: 0 },
        { type: 'end', title: 'Back to base', note: 'Tour complete', duration_minutes: 0 },
      ];
  const orderedRouteStops = routeStops
    .map((stop, index) => ({ ...stop, sort_order: Number(stop.sort_order || index + 1) }))
    .sort((left, right) => left.sort_order - right.sort_order);

  const priceRows = getPackagePriceRows({
    rows: pricingRows,
    packageId: pkg.id,
    durationHours: pkg.duration,
  });

  const modelOptions = priceRows
    .map((row) => {
      const model = vehicleModels.find((item) => String(item.id) === String(row.vehicle_model_id));
      return {
        modelId: String(row.vehicle_model_id || ''),
        label: modelLabel(model),
        price: Number(row.price_mad || 0),
      };
    })
    .filter((row) => row.modelId && row.price > 0)
    .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));

  const media = [
    ...(pkg.coverImageUrl ? [{ url: pkg.coverImageUrl, caption: pkg.publicTitle || pkg.name }] : []),
    ...(Array.isArray(pkg.mediaGallery) ? pkg.mediaGallery : []),
  ]
    .filter((item) => item?.url)
    .slice(0, 3);

  return {
    ...pkg,
    title: stripLegacyTourRules(pkg.publicTitle) || stripLegacyTourRules(pkg.name),
    summary: stripLegacyTourRules(pkg.publicSummary) || stripLegacyTourRules(pkg.description),
    routeLabel: stripLegacyTourRules(pkg.routeLabel) || stripLegacyTourRules(pkg.routeType) || 'Guided route',
    durationLabel: pkg.durationDisplay || formatDuration(pkg.duration),
    routeStops: orderedRouteStops,
    media,
    highlights: Array.isArray(pkg.publicHighlights)
      ? pkg.publicHighlights.map((highlight) => highlight?.label || highlight).filter(Boolean).slice(0, 4)
      : [],
    stopCount: Number(pkg.stopCount || orderedRouteStops.length || 0),
    difficultyLabel: pkg.difficultyLabel || '',
    modelOptions,
    startingPrice: modelOptions[0]?.price || Number(pkg.default_rate_1h || pkg.default_rate_2h || 0),
  };
};

const RouteRoadmap = ({ stops = [] }) => (
  <div className="rounded-[24px] border border-violet-100 bg-violet-50/50 p-5">
    <div className="space-y-4">
      {stops.map((stop, index) => (
        <div key={`${stop.id || stop.title || stop.kind}-${index}`} className="grid grid-cols-[24px_1fr] gap-4">
          <div className="flex flex-col items-center">
            <div className={`h-4 w-4 rounded-full ${index === 0 || index === stops.length - 1 ? 'bg-violet-700' : 'bg-white ring-4 ring-violet-200'}`} />
            {index < stops.length - 1 && <div className="mt-2 h-full min-h-8 w-px bg-violet-200" />}
          </div>
          <div className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-950">{stop.title || 'Route point'}</p>
              {Number(stop.duration_minutes || 0) > 0 && (
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700">
                  {stop.duration_minutes} min
                </span>
              )}
            </div>
            {stop.note ? <p className="mt-1 text-sm font-medium text-slate-500">{stop.note}</p> : null}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const LoadingTours = () => (
  <div className="space-y-5">
    {[0, 1, 2].map((item) => (
      <div key={item} className="rounded-[32px] border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(79,70,229,0.07)]">
        <div className="animate-pulse space-y-5">
          <div className="h-3 w-32 rounded-full bg-violet-100" />
          <div className="h-9 w-2/3 rounded-full bg-slate-100" />
          <div className="h-4 w-full max-w-xl rounded-full bg-slate-100" />
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded-full bg-violet-100" />
            <div className="h-8 w-24 rounded-full bg-slate-100" />
            <div className="h-8 w-24 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const ToursMessageState = ({ title, message, actionLabel, onAction, secondaryTo, secondaryLabel }) => (
  <div className="rounded-[32px] border border-dashed border-violet-200 bg-white p-12 text-center shadow-[0_18px_45px_rgba(79,70,229,0.07)]">
    <Route className="mx-auto h-8 w-8 text-violet-500" />
    <h2 className="mt-4 text-2xl font-black text-slate-950">{title}</h2>
    {message ? <p className="mx-auto mt-3 max-w-md text-sm font-medium text-slate-500">{message}</p> : null}
    {(actionLabel || secondaryTo) ? (
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-[0_18px_35px_rgba(124,58,237,0.18)] transition hover:bg-violet-800"
          >
            {actionLabel}
          </button>
        ) : null}
        {secondaryTo ? (
          <Link
            to={secondaryTo}
            className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    ) : null}
  </div>
);

const MediaModal = ({ tour, onClose }) => {
  if (!tour) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-[32px] bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-600">Preview</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{tour.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="Close media preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {tour.media.map((item, index) => (
            <figure key={`${item.url}-${index}`} className="overflow-hidden rounded-[24px] border border-slate-100 bg-slate-50">
              {item.type === 'video' ? (
                <video src={item.url} controls className="h-72 w-full bg-slate-950 object-cover" />
              ) : (
                <img src={item.url} alt={item.caption || tour.title} className="h-72 w-full object-cover" />
              )}
              {item.caption ? <figcaption className="px-4 py-3 text-sm font-semibold text-slate-600">{item.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
};

const Tours = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedCity = searchParams.get('city') || DEFAULT_CITY;
  const [packages, setPackages] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [mediaTour, setMediaTour] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    date: '',
    time: '',
    quadCount: 1,
    ridersCount: 1,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPackages = async () => {
      setLoading(true);
      setLoadError('');
      const result = await fetchTourPackages();
      if (!mounted) return;

      if (result.error) {
        setLoadError(result.error.message || 'Could not load tours');
        setPackages([]);
        setPricingRows([]);
        setVehicleModels([]);
      } else {
        setPackages(result.data || []);
        setPricingRows(result.pricingRows || []);
        setVehicleModels(result.vehicleModels || []);
      }
      setLoading(false);
    };

    loadPackages();
    return () => {
      mounted = false;
    };
  }, [reloadToken]);

  const tours = useMemo(() => {
    return packages
      .filter((pkg) => pkg.is_active !== false && pkg.websiteVisible === true)
      .map((pkg) => buildPublicTour(pkg, pricingRows, vehicleModels))
      .sort((left, right) => Number(left.displayOrder || 0) - Number(right.displayOrder || 0) || left.title.localeCompare(right.title));
  }, [packages, pricingRows, vehicleModels]);

  const selectedTour = tours.find((tour) => String(tour.id) === String(selectedPackageId)) || null;
  const selectedModel = selectedTour?.modelOptions.find((model) => String(model.modelId) === String(selectedModelId)) || selectedTour?.modelOptions[0] || null;
  const totalPrice = Number(selectedModel?.price || 0) * Number(bookingForm.quadCount || 1);

  useEffect(() => {
    if (!selectedTour) return;
    if (!selectedModelId && selectedTour.modelOptions[0]?.modelId) {
      setSelectedModelId(selectedTour.modelOptions[0].modelId);
    }
  }, [selectedTour, selectedModelId]);

  const updateBooking = (field, value) => {
    setBookingForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'quadCount' ? { ridersCount: Math.max(Number(value || 1), Number(current.ridersCount || 1)) } : {}),
    }));
  };

  const toggleTourSelection = (tour) => {
    const isSelected = String(selectedPackageId) === String(tour.id);
    setSelectedPackageId(isSelected ? '' : tour.id);
    setSelectedModelId(isSelected ? '' : tour.modelOptions[0]?.modelId || '');
  };

  const handleSubmit = async () => {
    if (!selectedTour || !selectedModel) {
      toast.error('Choose a tour package first');
      return;
    }
    if (!bookingForm.date || !bookingForm.time || !bookingForm.customerName.trim() || !bookingForm.customerPhone.trim()) {
      toast.error('Add date, time, name, and phone');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/tour-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicBooking: true,
          packageId: selectedTour.id,
          vehicleModelId: selectedModel.modelId,
          vehicleModelLabel: selectedModel.label,
          date: bookingForm.date,
          time: bookingForm.time,
          quadCount: Number(bookingForm.quadCount || 1),
          ridersCount: Number(bookingForm.ridersCount || bookingForm.quadCount || 1),
          customerName: bookingForm.customerName,
          customerPhone: bookingForm.customerPhone,
          customerEmail: bookingForm.customerEmail,
          notes: bookingForm.notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not book this tour');

      toast.success('Tour request sent');
      setBookingForm({
        date: '',
        time: '',
        quadCount: 1,
        ridersCount: 1,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        notes: '',
      });
    } catch (error) {
      toast.error(error.message || 'Could not book this tour');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)]">
      <PublicSiteChrome current="tours" />

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-8 sm:px-6 lg:pt-12">
        <button
          type="button"
          onClick={() => navigate('/website')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-white text-slate-600 shadow-sm transition hover:bg-violet-50"
          title="Back to website"
          aria-label="Back to website"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="mt-10 text-center">
          <h1 className="text-[44px] font-black leading-[0.95] tracking-tight text-slate-950 sm:text-6xl">
            Choose your tour
          </h1>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-white/80 px-5 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-violet-100">
            <MapPin className="h-4 w-4 text-violet-700" />
            {selectedCity}
            <Link to="/website" className="text-violet-700 transition hover:text-violet-900">Change</Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        {loading ? (
          <LoadingTours />
        ) : loadError ? (
          <ToursMessageState
            title="Tours could not load"
            message="Please try again in a moment."
            actionLabel="Retry"
            onAction={() => setReloadToken((current) => current + 1)}
            secondaryTo={`/rent?city=${encodeURIComponent(selectedCity)}`}
            secondaryLabel="View rentals"
          />
        ) : tours.length === 0 ? (
          <ToursMessageState
            title="No tours available right now."
            message="You can still browse the rental fleet while new guided routes are prepared."
            secondaryTo={`/rent?city=${encodeURIComponent(selectedCity)}`}
            secondaryLabel="View rentals"
          />
        ) : (
          <div className="space-y-5">
            {tours.map((tour) => {
              const selected = String(selectedPackageId) === String(tour.id);
              const available = tour.modelOptions.length > 0;

              return (
                <article
                  key={tour.id}
                  onClick={() => toggleTourSelection(tour)}
                  className={`cursor-pointer rounded-[32px] border bg-white p-6 shadow-[0_18px_45px_rgba(79,70,229,0.07)] transition duration-150 hover:scale-[1.005] hover:shadow-[0_22px_58px_rgba(79,70,229,0.12)] ${
                    selected ? 'border-violet-400 ring-4 ring-violet-100' : 'border-violet-100'
                  }`}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">{tour.routeLabel}</p>
                      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{tour.title}</h2>
                      {tour.summary ? <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">{tour.summary}</p> : null}
                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700">{tour.durationLabel}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black capitalize text-slate-700">{tour.routeType}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{tour.stopCount} stops</span>
                        {tour.difficultyLabel ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{tour.difficultyLabel}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-left lg:text-right">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">From</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">{available ? formatMoney(tour.startingPrice) : 'Pricing pending'}</p>
                      {tour.media.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMediaTour(tour);
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                          >
                            <ImageIcon className="h-4 w-4" />
                            View media
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {selected && (
                    <div className="mt-6 grid gap-5 border-t border-violet-100 pt-6 lg:grid-cols-[1fr_420px]">
                      <div className="space-y-4">
                        <RouteRoadmap stops={tour.routeStops} />
                        {tour.highlights.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {tour.highlights.map((highlight) => (
                              <span key={highlight} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-violet-100">
                                {highlight}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-[28px] border border-violet-100 bg-violet-50/60 p-5">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">Book now</p>
                        <div className="mt-4 space-y-3">
                          {available ? (
                            <select
                              value={selectedModelId}
                              onChange={(event) => setSelectedModelId(event.target.value)}
                              className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-violet-300"
                            >
                              {tour.modelOptions.map((model) => (
                                <option key={model.modelId} value={model.modelId}>
                                  {model.label} · {formatMoney(model.price)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                              Pricing is not ready for this package yet.
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <input type="date" value={bookingForm.date} onChange={(event) => updateBooking('date', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" />
                            <input type="time" value={bookingForm.time} onChange={(event) => updateBooking('time', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input type="number" min="1" max={tour.maxQuads || 12} value={bookingForm.quadCount} onChange={(event) => updateBooking('quadCount', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Quads" />
                            <input type="number" min="1" value={bookingForm.ridersCount} onChange={(event) => updateBooking('ridersCount', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Riders" />
                          </div>
                          <input value={bookingForm.customerName} onChange={(event) => updateBooking('customerName', event.target.value)} className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Full name" />
                          <input value={bookingForm.customerPhone} onChange={(event) => updateBooking('customerPhone', event.target.value)} className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="WhatsApp phone" />
                          <input type="email" value={bookingForm.customerEmail} onChange={(event) => updateBooking('customerEmail', event.target.value)} className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Email optional" />
                        </div>

                        <div className="mt-5 rounded-2xl bg-white px-4 py-4">
                          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Total</p>
                          <p className="mt-1 text-3xl font-black text-slate-950">{formatMoney(totalPrice)}</p>
                        </div>

                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={!available || submitting}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-700 px-5 py-4 text-sm font-black text-white shadow-[0_18px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {submitting ? 'Sending...' : 'Book now'}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>

      <MediaModal tour={mediaTour} onClose={() => setMediaTour(null)} />
    </div>
  );
};

export default Tours;
