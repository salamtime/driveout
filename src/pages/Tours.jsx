import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Image as ImageIcon,
  Instagram,
  MapPin,
  Minus,
  Play,
  Plus,
  Route,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PhoneInputWithCountryCode from '../components/forms/PhoneInputWithCountryCode';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import { useAuth } from '../contexts/AuthContext';
import { fetchTourPackages } from '../services/tourPackageService';

const GLOBAL_TOUR_PRICING_KEY = '__global_tour_pricing__';
const DEFAULT_CITY = 'Tangier';
const MAX_PUBLIC_TOUR_MEDIA_ITEMS = 9;
const MEDIA_PREVIEW_ITEMS = 3;

const getTourBookingReference = (payload = {}) =>
  String(
    payload?.groupId ||
    payload?.rows?.[0]?.rental_id ||
    payload?.rows?.[0]?.id ||
    ''
  ).trim();

const formatDuration = (hours) => {
  const numeric = Number(hours || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Duration set by guide';
  if (numeric === 1) return '1 hour';
  if (numeric % 1 === 0) return `${numeric.toFixed(0)} hours`;
  return `${numeric.toFixed(1)} hours`;
};

const formatMoney = (value) => `${Number(value || 0).toLocaleString('en-MA')} MAD`;

const formatDisplayText = (value, fallback = '') => {
  const text = String(value || fallback || '').trim();
  if (!text) return fallback;

  const isAllLowercase = text === text.toLowerCase();
  if (!isAllLowercase) return text;

  return text.replace(/\b\w/g, (match) => match.toUpperCase());
};

const normalizeVehicleImageUrl = (url) => {
  const source = String(url || '').trim();
  if (!source) return '';
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('/')) return encodeURI(source);
  return encodeURI(`/${source.replace(/^\/+/, '')}`);
};

const normalizeMediaUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return encodeURI(url);
  return encodeURI(`/${url.replace(/^\/+/, '')}`);
};

const isInstagramUrl = (value) => /instagram\.com/i.test(String(value || ''));

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

const modelCapacityLabel = (model) => {
  const min = Number(model?.capacityMin || 0) || 0;
  const max = Number(model?.capacityMax || 0) || 0;
  if (min > 0 && max > 0 && min !== max) return `${min}-${max} riders`;
  const seats = max || min || 1;
  return seats === 1 ? '1 rider' : `${seats} riders`;
};

const modelCardImage = (model) => normalizeVehicleImageUrl(model?.imageUrl);

const getPreferredTourModel = (models = []) =>
  models.find((model) => modelCardImage(model)) || models[0] || null;

const clampRidersToCapacity = (riders, maxCapacity) => {
  const safeMax = Math.max(1, Number(maxCapacity || 1));
  const safeRiders = Math.max(1, Number(riders || 1) || 1);
  return Math.min(safeRiders, safeMax);
};

const getPackagePriceRows = ({ rows = [], packageId, durationHours }) => {
  const duration = normalizeDuration(durationHours);
  const activeRows = rows.filter((row) => row?.is_active !== false && Number(row?.price_mad || 0) > 0);

  const exact = activeRows.filter(
    (row) =>
      String(row.package_id) === String(packageId) &&
      normalizeDuration(row.duration_hours) === duration
  );

  if (exact.length > 0) return exact;

  return activeRows.filter(
    (row) =>
      String(row.package_id) === GLOBAL_TOUR_PRICING_KEY &&
      normalizeDuration(row.duration_hours) === duration
  );
};

const getTourStartingPrice = ({ rows = [], packageId, durationHours, pkg }) => {
  const duration = normalizeDuration(durationHours);
  const activeRows = rows.filter((row) => row?.is_active !== false && Number(row?.price_mad || 0) > 0);

  const exactPackageRows = activeRows.filter(
    (row) => String(row.package_id) === String(packageId) && normalizeDuration(row.duration_hours) === duration
  );
  if (exactPackageRows.length > 0) {
    return Math.min(...exactPackageRows.map((row) => Number(row.price_mad || 0)).filter((price) => price > 0));
  }

  const exactGlobalRows = activeRows.filter(
    (row) => String(row.package_id) === GLOBAL_TOUR_PRICING_KEY && normalizeDuration(row.duration_hours) === duration
  );
  if (exactGlobalRows.length > 0) {
    return Math.min(...exactGlobalRows.map((row) => Number(row.price_mad || 0)).filter((price) => price > 0));
  }

  const anyPackageRows = activeRows.filter((row) => String(row.package_id) === String(packageId));
  if (anyPackageRows.length > 0) {
    return Math.min(...anyPackageRows.map((row) => Number(row.price_mad || 0)).filter((price) => price > 0));
  }

  const anyGlobalRows = activeRows.filter((row) => String(row.package_id) === GLOBAL_TOUR_PRICING_KEY);
  if (anyGlobalRows.length > 0) {
    return Math.min(...anyGlobalRows.map((row) => Number(row.price_mad || 0)).filter((price) => price > 0));
  }

  const packageDefaults = [
    Number(pkg?.default_rate_1h || 0),
    Number(pkg?.default_rate_2h || 0),
    Number(pkg?.vip_rate_1h || 0),
    Number(pkg?.vip_rate_2h || 0),
  ].filter((price) => price > 0);

  if (packageDefaults.length > 0) {
    return Math.min(...packageDefaults);
  }

  return 0;
};

const normalizeMediaDuration = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const formatMediaDuration = (seconds) => {
  const totalSeconds = normalizeMediaDuration(seconds);
  if (!totalSeconds) return '';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (mins <= 0) return `0:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const normalizeMediaItem = (item, fallbackCaption = '') => {
  const source = typeof item === 'object' && item !== null ? item : {};
  const rawType = String(source.type || source.provider || '').toLowerCase();
  const externalUrl = String(
    source.externalUrl || source.external_url || source.instagramUrl || source.instagram_url || ''
  ).trim();
  const rawUrl = String(source.url || '').trim();
  const thumbnailUrl = normalizeMediaUrl(
    source.thumbnail || source.thumbnail_url || source.previewUrl || source.preview_url || source.poster || ''
  );
  const isInstagram = rawType === 'instagram' || isInstagramUrl(rawUrl) || isInstagramUrl(externalUrl);
  const type = isInstagram ? 'instagram' : rawType === 'video' ? 'video' : 'image';
  const primaryUrl = isInstagram ? '' : normalizeMediaUrl(rawUrl);
  const caption = String(source.caption || fallbackCaption || '').trim();

  return {
    id: String(source.id || `${type}-${primaryUrl || externalUrl || caption}`).trim(),
    type,
    url: primaryUrl,
    caption,
    thumbnailUrl: thumbnailUrl || (type === 'image' ? primaryUrl : ''),
    externalUrl: isInstagram ? (externalUrl || rawUrl) : '',
    duration: normalizeMediaDuration(source.duration),
  };
};

const rankMediaItem = (item) => {
  if (item.type === 'image') return 0;
  if (item.type === 'video') return 1;
  return 2;
};

const buildPublicTour = (pkg, pricingRows, vehicleModels) => {
  const hasCustomRouteStops = Array.isArray(pkg.routeStops) && pkg.routeStops.length > 0;
  const routeStops = hasCustomRouteStops
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
        imageUrl: modelCardImage(model),
        capacityMin: Number(model?.capacity_min || 0) || 0,
        capacityMax: Number(model?.capacity_max || 0) || 1,
      };
    })
    .filter((row) => row.modelId && row.price > 0)
    .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));

  const normalizedMedia = [
    ...(pkg.coverImageUrl ? [{ url: pkg.coverImageUrl, caption: pkg.publicTitle || pkg.name, type: 'image' }] : []),
    ...(Array.isArray(pkg.mediaGallery) ? pkg.mediaGallery : []),
  ]
    .map((item) => normalizeMediaItem(item, pkg.publicTitle || pkg.name))
    .filter((item) => item.url || item.thumbnailUrl || item.externalUrl)
    .filter((item, index, items) => items.findIndex((candidate) => {
      const currentKey = `${item.type}:${item.url || item.externalUrl || item.thumbnailUrl}`;
      const candidateKey = `${candidate.type}:${candidate.url || candidate.externalUrl || candidate.thumbnailUrl}`;
      return currentKey === candidateKey;
    }) === index);

  const uploadedImages = normalizedMedia.filter((item) => item.type === 'image');
  const uploadedVideos = normalizedMedia.filter((item) => item.type === 'video');
  const instagramItems = normalizedMedia.filter((item) => item.type === 'instagram').slice(0, 3);
  const media = [...uploadedImages, ...uploadedVideos, ...instagramItems].slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS);

  return {
    ...pkg,
    title: formatDisplayText(stripLegacyTourRules(pkg.publicTitle) || stripLegacyTourRules(pkg.name), 'Tour Package'),
    summary: stripLegacyTourRules(pkg.publicSummary) || stripLegacyTourRules(pkg.description),
    routeLabel: formatDisplayText(stripLegacyTourRules(pkg.routeLabel) || stripLegacyTourRules(pkg.routeType), 'Guided route'),
    routeType: formatDisplayText(pkg.routeType, 'Route'),
    durationLabel: pkg.durationDisplay || formatDuration(pkg.duration),
    routeStops: orderedRouteStops,
    hasCustomRouteStops,
    media,
    highlights: Array.isArray(pkg.publicHighlights)
      ? pkg.publicHighlights.map((highlight) => highlight?.label || highlight).filter(Boolean).slice(0, 4)
      : [],
    stopCount: Number(pkg.stopCount || orderedRouteStops.length || 0),
    difficultyLabel: pkg.difficultyLabel || '',
    modelOptions,
    startingPrice: getTourStartingPrice({
      rows: pricingRows,
      packageId: pkg.id,
      durationHours: pkg.duration,
      pkg,
    }),
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

const TourMediaItem = ({ item, title, active = false, compact = false, onClick }) => {
  const thumbnail = item.thumbnailUrl || item.url;
  const isVideo = item.type === 'video';
  const isInstagram = item.type === 'instagram';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden border bg-slate-100 text-left transition duration-150 hover:scale-[1.03] ${
        compact
          ? 'h-16 w-16 rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
          : 'h-20 w-20 rounded-[18px] shadow-[0_12px_28px_rgba(15,23,42,0.10)]'
      } ${
        active ? 'border-violet-400 ring-2 ring-violet-100' : 'border-white/90 hover:border-violet-200'
      }`}
      aria-label={isInstagram ? `Open Instagram for ${title}` : `Open media for ${title}`}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={item.caption || title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center ${isInstagram ? 'bg-[linear-gradient(180deg,#fde7ff_0%,#ede9fe_100%)]' : 'bg-slate-200'}`}>
          {isInstagram ? <Instagram className="h-5 w-5 text-violet-700" /> : <ImageIcon className="h-5 w-5 text-slate-500" />}
        </div>
      )}

      {isVideo ? <div className="absolute inset-0 bg-slate-950/28" /> : null}
      {isInstagram ? <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent" /> : null}

      {isVideo ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/88 shadow-[0_8px_18px_rgba(15,23,42,0.15)]">
              <Play className="ml-0.5 h-4 w-4 fill-slate-950 text-slate-950" />
            </span>
          </span>
          {item.duration ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/78 px-2 py-1 text-[10px] font-black text-white">
              {formatMediaDuration(item.duration)}
            </span>
          ) : null}
        </>
      ) : null}

      {isInstagram ? (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/92 shadow-sm">
          <Instagram className="h-3.5 w-3.5 text-violet-700" />
        </span>
      ) : null}
    </button>
  );
};

const TourMediaPreviewStrip = ({ media = [], title, onOpenPreview }) => {
  const previewItems = media.slice(0, MEDIA_PREVIEW_ITEMS);
  if (previewItems.length === 0) return null;
  const firstModalIndex = media.findIndex((item) => item.type !== 'instagram');
  const modalStartIndex = firstModalIndex >= 0 ? firstModalIndex : 0;

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-violet-100 bg-white/92 px-3 py-3 shadow-[0_14px_34px_rgba(79,70,229,0.08)]">
      <div className="flex items-center gap-2">
        {previewItems.map((item, index) => (
          <TourMediaItem
            key={`${item.type}-${item.url || item.externalUrl || item.thumbnailUrl}-${index}`}
            item={item}
            title={title}
            compact
            onClick={(event) => {
              event.stopPropagation();
              if (item.type === 'instagram' && item.externalUrl) {
                window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
                return;
              }
              onOpenPreview?.(index);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (previewItems.every((item) => item.type === 'instagram')) {
            const firstInstagram = previewItems.find((item) => item.externalUrl);
            if (firstInstagram?.externalUrl) {
              window.open(firstInstagram.externalUrl, '_blank', 'noopener,noreferrer');
              return;
            }
          }
          onOpenPreview?.(modalStartIndex);
        }}
        className="ml-auto inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
      >
        View media
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const TourModelPicker = ({
  models = [],
  activeModelId,
  selectedCounts = {},
  maxQuads = 1,
  onSelectModel,
  onIncrease,
  onDecrease,
}) => {
  const activeIndex = Math.max(0, models.findIndex((model) => String(model.modelId) === String(activeModelId)));
  const activeModel = models[activeIndex] || models[0] || null;
  const [touchStart, setTouchStart] = useState(null);

  if (!activeModel) return null;

  const handleSwipeEnd = (clientX) => {
    if (touchStart === null) return;
    const delta = clientX - touchStart;
    if (Math.abs(delta) < 35) {
      setTouchStart(null);
      return;
    }
    const nextIndex = delta < 0 ? Math.min(models.length - 1, activeIndex + 1) : Math.max(0, activeIndex - 1);
    onSelectModel?.(models[nextIndex]?.modelId);
    setTouchStart(null);
  };

  return (
    <div className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(79,70,229,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">Choose ATV model</p>
          <p className="mt-1 text-sm font-medium text-slate-500">Swipe left or right to browse models.</p>
        </div>
        <div className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
          {Object.values(selectedCounts).reduce((sum, count) => sum + Number(count || 0), 0)} / {maxQuads} ATVs
        </div>
      </div>

      <div
        className="mt-4 overflow-hidden rounded-[24px] border border-violet-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8f6ff_100%)]"
        onTouchStart={(event) => setTouchStart(event.touches?.[0]?.clientX ?? null)}
        onTouchEnd={(event) => handleSwipeEnd(event.changedTouches?.[0]?.clientX ?? touchStart)}
      >
        <div className="relative">
          {activeModel.imageUrl ? (
            <img src={activeModel.imageUrl} alt={activeModel.label} className="h-40 w-full object-cover sm:h-44" />
          ) : (
            <div className="flex h-40 w-full items-center justify-center bg-[linear-gradient(180deg,#faf7ff_0%,#f3efff_100%)] text-center sm:h-44">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-500">ATV Model</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">Add the model image in Fleet Management</p>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <p className="text-xl font-black tracking-tight">{activeModel.label}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]">
              <span className="rounded-full bg-white/18 px-2.5 py-1 backdrop-blur">{modelCapacityLabel(activeModel)}</span>
              <span className="rounded-full bg-white/18 px-2.5 py-1 backdrop-blur">{formatMoney(activeModel.price)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectModel?.(models[Math.max(0, activeIndex - 1)]?.modelId)}
            disabled={activeIndex === 0}
            className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous model"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelectModel?.(models[Math.min(models.length - 1, activeIndex + 1)]?.modelId)}
            disabled={activeIndex === models.length - 1}
            className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next model"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">{activeModel.label}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">Tap plus to add this model to the booking mix.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDecrease?.(activeModel.modelId)}
              disabled={Number(selectedCounts?.[activeModel.modelId] || 0) <= 0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Remove ${activeModel.label}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="min-w-[56px] rounded-full bg-violet-700 px-4 py-2 text-center text-sm font-black text-white">
              {Number(selectedCounts?.[activeModel.modelId] || 0)}
            </div>
            <button
              type="button"
              onClick={() => onIncrease?.(activeModel.modelId)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
              aria-label={`Add ${activeModel.label}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {models.map((model, index) => (
          <button
            key={model.modelId}
            type="button"
            onClick={() => onSelectModel?.(model.modelId)}
            className={`h-2.5 rounded-full transition ${index === activeIndex ? 'w-6 bg-violet-600' : 'w-2.5 bg-slate-200 hover:bg-slate-300'}`}
            aria-label={`Show ${model.label}`}
          />
        ))}
      </div>
    </div>
  );
};

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

const TourVideoPlayer = ({ item, title }) => (
  <video
    src={item.url}
    poster={item.thumbnailUrl || undefined}
    controls
    muted
    playsInline
    preload="metadata"
    className="h-full w-full bg-slate-950 object-cover"
    aria-label={item.caption || title}
  />
);

const MediaModal = ({ tour, initialIndex = 0, onClose }) => {
  if (!tour) return null;
  const safeIndex = Math.min(Math.max(initialIndex, 0), Math.max(tour.media.length - 1, 0));
  const [activeIndex, setActiveIndex] = useState(safeIndex);
  const activeItem = tour.media[activeIndex] || tour.media[0] || null;

  useEffect(() => {
    setActiveIndex(safeIndex);
  }, [safeIndex, tour?.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
        return;
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => Math.min(current + 1, Math.max(tour.media.length - 1, 0)));
      }
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, tour.media.length]);

  if (!activeItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/48 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-[32px] bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.24)] transition duration-200 animate-[fadeIn_.18s_ease]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-600">Media</p>
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

        <div className="mt-5 rounded-[28px] border border-slate-100 bg-slate-50 p-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] bg-slate-950">
            {activeItem.type === 'video' ? (
              <TourVideoPlayer item={activeItem} title={tour.title} />
            ) : activeItem.type === 'instagram' ? (
              <div className="relative flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#0f172a_0%,#312e81_100%)]">
                {activeItem.thumbnailUrl ? (
                  <img src={activeItem.thumbnailUrl} alt={activeItem.caption || tour.title} className="absolute inset-0 h-full w-full object-cover opacity-70" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />
                <div className="relative z-10 max-w-md px-6 text-center text-white">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/92 text-violet-700 shadow-lg">
                    <Instagram className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-2xl font-black">Instagram preview</p>
                  <p className="mt-2 text-sm font-medium text-white/80">
                    Social proof stays lightweight here. Open the full post in Instagram.
                  </p>
                  <button
                    type="button"
                    onClick={() => activeItem.externalUrl && window.open(activeItem.externalUrl, '_blank', 'noopener,noreferrer')}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-white/90"
                  >
                    View on Instagram
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <img src={activeItem.url} alt={activeItem.caption || tour.title} className="h-full w-full object-cover" />
            )}

            {tour.media.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => Math.max(current - 1, 0))}
                  disabled={activeIndex === 0}
                  className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous media"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => Math.min(current + 1, tour.media.length - 1))}
                  disabled={activeIndex === tour.media.length - 1}
                  className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next media"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-950">{activeItem.caption || tour.title}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              {activeItem.type === 'instagram' ? 'Instagram' : activeItem.type === 'video' ? 'Video' : 'Photo'}
            </p>
          </div>
          {activeItem.type === 'instagram' && activeItem.externalUrl ? (
            <button
              type="button"
              onClick={() => window.open(activeItem.externalUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700 transition hover:bg-violet-100"
            >
              View on Instagram
              <ExternalLink className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3">
            {tour.media.map((item, index) => (
              <TourMediaItem
                key={`${item.type}-${item.url || item.externalUrl || item.thumbnailUrl}-${index}`}
                item={item}
                title={tour.title}
                active={index === activeIndex}
                onClick={() => {
                  if (item.type === 'instagram' && item.externalUrl) {
                    window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  setActiveIndex(index);
                }}
              />
            ))}
          </div>
        </div>

        {tour.media.length > 1 ? (
          <div className="mt-4 flex justify-center">
            <div className="flex gap-2">
              {tour.media.map((item, index) => (
                <button
                  key={`${item.type}-dot-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-2.5 rounded-full transition ${index === activeIndex ? 'w-6 bg-violet-600' : 'w-2.5 bg-slate-200 hover:bg-slate-300'}`}
                  aria-label={`Show media ${index + 1}`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const Tours = () => {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
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
  const [activeModelId, setActiveModelId] = useState('');
  const [showAllTours, setShowAllTours] = useState(false);
  const [mediaTour, setMediaTour] = useState(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [bookingForm, setBookingForm] = useState({
    date: '',
    time: '',
    ridersCount: 1,
    selectedModelCounts: {},
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);

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
  const preferredSelectedTourModel = selectedTour ? getPreferredTourModel(selectedTour.modelOptions) : null;
  const activeModel =
    selectedTour?.modelOptions.find((model) => String(model.modelId) === String(activeModelId)) ||
    preferredSelectedTourModel ||
    null;
  const selectedModelMix = selectedTour
    ? selectedTour.modelOptions
      .map((model) => ({
        ...model,
        count: Math.max(0, Number(bookingForm.selectedModelCounts?.[model.modelId] || 0)),
      }))
      .filter((model) => model.count > 0)
    : [];
  const selectedQuadCount = selectedModelMix.reduce((sum, model) => sum + Number(model.count || 0), 0);
  const maxRiderCapacity = Math.max(
    1,
    selectedModelMix.reduce((sum, model) => sum + (Math.max(1, Number(model.capacityMax || model.capacityMin || 1)) * Number(model.count || 0)), 0) || 1
  );
  const totalPrice = selectedModelMix.reduce((sum, model) => sum + (Number(model.price || 0) * Number(model.count || 0)), 0);
  const selectedModelSummary = selectedModelMix.map((model) => `${model.count} × ${model.label}`).join(' · ');
  const visibleTours = showAllTours ? tours : tours.slice(0, 2);
  const hiddenToursCount = Math.max(0, tours.length - visibleTours.length);

  useEffect(() => {
    if (!selectedTour) return;
    if (!activeModelId && preferredSelectedTourModel?.modelId) {
      setActiveModelId(preferredSelectedTourModel.modelId);
    }
  }, [selectedTour, activeModelId, preferredSelectedTourModel]);

  useEffect(() => {
    setBookingForm((current) => ({
      ...current,
      ridersCount: clampRidersToCapacity(current.ridersCount, maxRiderCapacity),
    }));
  }, [maxRiderCapacity]);

  const updateBooking = (field, value) => {
    setBookingForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const toggleTourSelection = (tour) => {
    const isSelected = String(selectedPackageId) === String(tour.id);
    const preferredModel = getPreferredTourModel(tour.modelOptions);
    setSelectedPackageId(isSelected ? '' : tour.id);
    setActiveModelId(isSelected ? '' : preferredModel?.modelId || '');
    setBookingSuccess(null);
    setBookingForm((current) => ({
      ...current,
      ridersCount: 1,
      selectedModelCounts: isSelected
        ? {}
        : preferredModel?.modelId
          ? { [preferredModel.modelId]: 1 }
          : {},
    }));
  };

  const handleSelectActiveModel = (modelId) => {
    if (!modelId) return;
    setActiveModelId(modelId);
  };

  const handleIncreaseModel = (modelId) => {
    if (!selectedTour || !modelId) return;
    setActiveModelId(modelId);
    setBookingForm((current) => {
      const currentCounts = current.selectedModelCounts || {};
      const totalCount = Object.values(currentCounts).reduce((sum, count) => sum + Number(count || 0), 0);
      if (totalCount >= Number(selectedTour.maxQuads || 1)) return current;

      return {
        ...current,
        selectedModelCounts: {
          ...currentCounts,
          [modelId]: Number(currentCounts[modelId] || 0) + 1,
        },
      };
    });
  };

  const handleDecreaseModel = (modelId) => {
    if (!modelId) return;
    setBookingForm((current) => {
      const currentCounts = current.selectedModelCounts || {};
      const nextValue = Math.max(0, Number(currentCounts[modelId] || 0) - 1);
      const nextCounts = { ...currentCounts };

      if (nextValue <= 0) {
        delete nextCounts[modelId];
      } else {
        nextCounts[modelId] = nextValue;
      }

      return {
        ...current,
        selectedModelCounts: nextCounts,
      };
    });
  };

  const openMediaPreview = (tour, index = 0) => {
    setMediaTour(tour);
    setMediaIndex(index);
  };

  const handleSubmit = async () => {
    if (!selectedTour || selectedModelMix.length === 0) {
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
          vehicleModelId: activeModel?.modelId || selectedModelMix[0]?.modelId || '',
          vehicleModelLabel: activeModel?.label || selectedModelMix[0]?.label || '',
          selectedModelMix: selectedModelMix.map((model) => ({
            modelId: model.modelId,
            label: model.label,
            count: Number(model.count || 0),
          })),
          date: bookingForm.date,
          time: bookingForm.time,
          quadCount: selectedQuadCount,
          ridersCount: clampRidersToCapacity(bookingForm.ridersCount, maxRiderCapacity),
          customerName: bookingForm.customerName,
          customerPhone: bookingForm.customerPhone,
          customerEmail: bookingForm.customerEmail,
          notes: bookingForm.notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not book this tour');

      const reference = getTourBookingReference(payload);
      setBookingSuccess({
        reference,
        groupId: payload?.groupId || '',
        totalAmount,
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
        customerEmail: bookingForm.customerEmail,
        customerPhone: bookingForm.customerPhone,
        customerName: bookingForm.customerName,
        selectedTourTitle: selectedTour.title,
        selectedModelLabel: selectedModelSummary || activeModel?.label || 'Selected ATV mix',
        scheduledDate: bookingForm.date,
        scheduledTime: bookingForm.time,
      });
      toast.success('Tour request sent');
      setBookingForm({
        date: '',
        time: '',
        ridersCount: 1,
        selectedModelCounts: {},
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
            {visibleTours.map((tour) => {
              const selected = String(selectedPackageId) === String(tour.id);
              const hasBookableModelPricing = tour.modelOptions.length > 0;
              const hasVisiblePrice = Number(tour.startingPrice || 0) > 0;
              const routePreview = (tour.hasCustomRouteStops ? tour.routeStops : [])
                .filter((stop) => stop?.title)
                .slice(0, 3)
                .map((stop) => formatDisplayText(stop.title));

              return (
                <article
                  key={tour.id}
                  onClick={() => {
                    if (!selected) {
                      toggleTourSelection(tour);
                    }
                  }}
                  className={`relative cursor-pointer rounded-[32px] border bg-white p-6 shadow-[0_18px_45px_rgba(79,70,229,0.07)] transition duration-150 hover:scale-[1.005] hover:shadow-[0_22px_58px_rgba(79,70,229,0.12)] ${
                    selected ? 'border-violet-400 ring-4 ring-violet-100' : 'border-violet-100'
                  }`}
                >
                  {selected ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleTourSelection(tour);
                      }}
                      className="absolute right-5 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm transition hover:bg-violet-50"
                      aria-label={`Close ${tour.title}`}
                      title="Close"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  ) : null}
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
                      <p className={`mt-2 text-3xl font-black ${hasVisiblePrice ? 'text-slate-950' : 'text-slate-400'}`}>
                        {hasVisiblePrice ? formatMoney(tour.startingPrice) : 'Price on request'}
                      </p>
                      {tour.media.length > 0 ? (
                        <div className="mt-4 lg:ml-auto">
                          <TourMediaPreviewStrip
                            media={tour.media}
                            title={tour.title}
                            onOpenPreview={(index = 0) => openMediaPreview(tour, index)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {routePreview.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {routePreview.map((stopTitle, index) => (
                        <span
                          key={`${tour.id}-preview-stop-${index}`}
                          className="rounded-full border border-violet-100 bg-violet-50/70 px-3 py-1.5 text-xs font-black text-violet-700"
                        >
                          {stopTitle}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {selected && (
                    <div
                      className="mt-6 grid gap-5 border-t border-violet-100 pt-6 lg:grid-cols-[1fr_420px]"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                        {bookingSuccess && String(selectedPackageId) === String(tour.id) ? (
                          <div className="space-y-4">
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">Reservation received</p>
                            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                              <h3 className="text-2xl font-black text-emerald-900">Reservation sent successfully</h3>
                              <p className="mt-3 text-sm font-semibold text-emerald-900">
                                Reference: <span className="font-black">{bookingSuccess.reference || 'Pending reference'}</span>
                              </p>
                              <p className="mt-2 text-sm text-emerald-800">
                                Screenshot this reference as your receipt while our team reviews your tour request.
                              </p>
                            </div>

                            <div className="rounded-[24px] border border-violet-100 bg-white p-4">
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">Reservation details</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Tour</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{bookingSuccess.selectedTourTitle}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Model</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{bookingSuccess.selectedModelLabel}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Departure</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{bookingSuccess.scheduledDate} at {bookingSuccess.scheduledTime}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Estimated total</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{formatMoney(bookingSuccess.totalAmount)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-[24px] border border-violet-100 bg-white p-4">
                              <p className="text-sm font-black text-slate-950">
                                {bookingSuccess.customerEmail
                                  ? 'We will contact you by email and WhatsApp with the next steps for your reservation.'
                                  : 'One of our team members will contact you on WhatsApp with the next steps for your reservation.'}
                              </p>
                              <p className="mt-2 text-sm text-slate-500">
                                Your request is already visible to our operations team in Tours & Bookings.
                              </p>
                            </div>

                            {!isAuthenticated ? (
                              <div className="rounded-[24px] border border-violet-100 bg-white p-4">
                                <p className="text-sm font-black text-slate-950">Create an account to keep your future reservations in one place.</p>
                                <p className="mt-2 text-sm text-slate-500">
                                  Sign up with the same contact details to manage your profile and access your reservation history as soon as it is available in your customer space.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                  <Link
                                    to="/register"
                                    state={{ from: '/tours' }}
                                    className="rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-[0_18px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-800"
                                  >
                                    Create account
                                  </Link>
                                  <Link
                                    to="/login"
                                    state={{ from: '/tours' }}
                                    className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
                                  >
                                    Log in
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                <Link
                                  to="/customer/profile"
                                  className="rounded-full border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
                                >
                                  Go to profile
                                </Link>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => setBookingSuccess(null)}
                                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                              >
                                Book another time
                              </button>
                              <Link
                                to="/website"
                                className="rounded-full bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-[0_18px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-800"
                              >
                                Back to website
                              </Link>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">Book now</p>
                            <div className="mt-4 space-y-3">
                              {hasBookableModelPricing ? (
                                <>
                                  <TourModelPicker
                                    models={tour.modelOptions}
                                    activeModelId={activeModelId}
                                    selectedCounts={bookingForm.selectedModelCounts}
                                    maxQuads={tour.maxQuads || 1}
                                    onSelectModel={handleSelectActiveModel}
                                    onIncrease={handleIncreaseModel}
                                    onDecrease={handleDecreaseModel}
                                  />
                                  <div className="rounded-2xl border border-violet-100 bg-white px-4 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Selected ATVs</p>
                                      <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                                        {selectedQuadCount} / {tour.maxQuads || 1}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm font-black text-slate-950">
                                      {selectedModelSummary || 'Choose at least one ATV model to continue.'}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                                  Final model pricing is not configured yet for booking.
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                <input type="date" value={bookingForm.date} onChange={(event) => updateBooking('date', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" />
                                <input type="time" value={bookingForm.time} onChange={(event) => updateBooking('time', event.target.value)} className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" />
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3">
                                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">ATVs</span>
                                  <p className="mt-2 text-sm font-black text-slate-900">{selectedQuadCount || 0}</p>
                                </div>
                                <label className="rounded-2xl border border-violet-100 bg-white px-4 py-3">
                                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Riders</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max={maxRiderCapacity}
                                    value={bookingForm.ridersCount}
                                    onChange={(event) => updateBooking('ridersCount', clampRidersToCapacity(event.target.value, maxRiderCapacity))}
                                    className="mt-2 w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
                                  />
                                </label>
                              </div>
                              <input value={bookingForm.customerName} onChange={(event) => updateBooking('customerName', event.target.value)} className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Full name" />
                              <div className="rounded-2xl border border-violet-100 bg-white px-1 py-1">
                                <PhoneInputWithCountryCode
                                  value={bookingForm.customerPhone}
                                  onChange={(value) => updateBooking('customerPhone', value)}
                                  label="WhatsApp phone"
                                />
                              </div>
                              <input type="email" value={bookingForm.customerEmail} onChange={(event) => updateBooking('customerEmail', event.target.value)} className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-300" placeholder="Email optional" />
                            </div>

                            <div className="mt-5 rounded-2xl bg-white px-4 py-4">
                              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Total</p>
                              <p className="mt-1 text-3xl font-black text-slate-950">{formatMoney(totalPrice)}</p>
                            </div>

                            <button
                              type="button"
                              onClick={handleSubmit}
                              disabled={!hasBookableModelPricing || submitting || selectedQuadCount <= 0}
                              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-700 px-5 py-4 text-sm font-black text-white shadow-[0_18px_35px_rgba(124,58,237,0.22)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              {submitting ? 'Sending...' : 'Book now'}
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {hiddenToursCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllTours((current) => !current)}
                className="text-sm font-semibold text-violet-700"
              >
                {showAllTours ? 'See fewer options' : 'See more options'}
              </button>
            ) : null}
          </div>
        )}
      </main>

      <MediaModal tour={mediaTour} initialIndex={mediaIndex} onClose={() => setMediaTour(null)} />
    </div>
  );
};

export default Tours;
