import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Info, MapPin, Share2, ShieldCheck, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import PublicCatalogService from '../services/PublicCatalogService';
import PublicReviewService from '../services/PublicReviewService';
import DynamicPricingService from '../services/DynamicPricingService';
import { shortenUrl } from '../services/UrlShortenerService';
import { fetchSystemSettings } from '../services/systemSettingsApi';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import PublicSiteFooter from '../components/public/PublicSiteFooter';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import { getDefaultInstantBookingPackage } from '../utils/publicBookingFlow';
import { formatRentalPackageAllowanceLabel } from '../utils/rentalPackageLabels';
import { calculateSimpleRentalPricing } from '../utils/simpleRentalPricing';
import {
  DEFAULT_STOREFRONT_TENANT_SLUG,
  getCanonicalStorefrontOrigin,
} from '../utils/storefrontHost';

const CERTIFIED_BADGE_SRC =
  '/images/certified-badge.png';
const SEGWAY_LOGO_SRC = '/images/segway-icon-card.webp';

const rentalTypeOptions = [
  { value: 'hourly', label: 'Hourly', labelFr: 'Par heure' },
  { value: 'daily', label: 'Daily', labelFr: 'Par jour' },
];

const DetailStat = ({ label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
    <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

const renderPassengerValue = (listing) => {
  if (listing?.riderCapacityLabel) return listing.riderCapacityLabel;
  if (listing?.riderCapacity) {
    return listing.riderCapacity === 1 ? '1 passenger' : `${listing.riderCapacity} passengers`;
  }
  return 'On request';
};

const renderPowerValue = (listing, tr) => {
  if (listing?.powerCcLabel) return listing.powerCcLabel;
  if (listing?.powerCc) return `${listing.powerCc}cc`;
  return tr('On request', 'Sur demande');
};

const getExplicitDurationUnits = (pkg) => Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);

const isHalfDayPackage = (pkg) => {
  const explicitUnits = getExplicitDurationUnits(pkg);
  if (explicitUnits > 0 && explicitUnits !== 4) return false;
  return /half[\s-]?day/i.test(String(pkg?.name || '')) || /demi[\s-]?journ/i.test(String(pkg?.name || ''));
};

const isHalfHourPackage = (pkg) => {
  const explicitUnits = getExplicitDurationUnits(pkg);
  if (explicitUnits > 0 && explicitUnits !== 0.5) return false;
  return /half[\s-]?hour/i.test(String(pkg?.name || '')) ||
    /30[\s-]?(min|minute|minutes)/i.test(String(pkg?.name || ''));
};

const getPackageDurationUnits = (pkg, fallbackDurationUnits = 1) => {
  const explicitUnits = getExplicitDurationUnits(pkg);
  if (Number.isFinite(explicitUnits) && explicitUnits > 0) return explicitUnits;
  if (isHalfHourPackage(pkg)) return 0.5;
  if (isHalfDayPackage(pkg)) return 4;
  return Math.max(1, Number(fallbackDurationUnits || 1) || 1);
};

const isBaseHourlyPackageForDuration = (pkg, requestedDurationUnits = 1) => {
  const explicitUnits = getExplicitDurationUnits(pkg);
  return Number(requestedDurationUnits || 1) === 2 && explicitUnits === 1 && !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg);
};

const getEffectivePackageDurationUnits = (pkg, fallbackDurationUnits = 1, rentalType = 'hourly') => {
  if (rentalType === 'hourly' && isBaseHourlyPackageForDuration(pkg, fallbackDurationUnits)) return 2;
  return getPackageDurationUnits(pkg, fallbackDurationUnits);
};

const packageMatchesDuration = (pkg, requestedDurationUnits = 1, rentalType = 'hourly') => {
  const requestedUnits = Number(requestedDurationUnits || 1) || 1;
  if (rentalType === 'hourly' && isBaseHourlyPackageForDuration(pkg, requestedUnits)) return true;
  return Math.abs(getPackageDurationUnits(pkg, requestedUnits) - requestedUnits) < 0.001;
};

const isFlexibleHourlyPackage = (pkg, requestedDurationUnits = 1) => {
  const explicitUnits = getExplicitDurationUnits(pkg);
  return (
    ((!Number.isFinite(explicitUnits) || explicitUnits <= 0) && !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg)) ||
    isBaseHourlyPackageForDuration(pkg, requestedDurationUnits)
  );
};

const shouldScaleHourlyPackageByDuration = (pkg, rentalType, durationUnits = 1) => {
  if (rentalType !== 'hourly') return false;
  if (isHalfHourPackage(pkg) || isHalfDayPackage(pkg)) return false;
  const explicitUnits = getExplicitDurationUnits(pkg);
  if (Number.isFinite(explicitUnits) && explicitUnits > 0) {
    return isBaseHourlyPackageForDuration(pkg, durationUnits);
  }
  return Number(durationUnits || 0) > 0;
};

const getDurationOptionsForPackages = (packages = [], rentalType = 'hourly') => {
  const sortedOptions = Array.from(
    new Set(
      [
        ...packages.map((pkg) => getPackageDurationUnits(pkg, rentalType === 'hourly' ? 1 : 1)),
        ...(rentalType === 'hourly' ? [2] : []),
      ]
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ).sort((left, right) => left - right);

  if (sortedOptions.length > 0) return sortedOptions;
  return rentalType === 'hourly' ? [1] : [1];
};
const PACKAGE_QUERY_KEYS = [
  'packageId',
  'packageName',
  'packageAmount',
  'packageKind',
  'includedKilometers',
  'extraKmRate',
];

const clearPackageSearchParams = (params) => {
  PACKAGE_QUERY_KEYS.forEach((key) => params.delete(key));
};

const setCanonicalDurationAndPackageParams = (params, durationUnits, packageId = null) => {
  params.delete('durationUnits');
  clearPackageSearchParams(params);
  params.set('durationUnits', String(durationUnits));
  if (packageId !== null && packageId !== undefined && packageId !== '') {
    params.set('packageId', String(packageId));
  }
};

const formatPackageDisplayName = (pkg, rentalType, tr, fallbackDurationUnits = 1) => {
  const durationUnits = getEffectivePackageDurationUnits(pkg, fallbackDurationUnits, rentalType);
  const baseKilometers = Number(pkg?.includedKilometers || 0);
  const includedKilometers = shouldScaleHourlyPackageByDuration(pkg, rentalType, durationUnits) && baseKilometers > 0
    ? Math.round(baseKilometers * Math.max(1, Number(durationUnits || 1) || 1))
    : baseKilometers;
  const displayPackage = {
    ...pkg,
    durationUnits,
    duration_units: durationUnits,
    ...(includedKilometers ? { includedKilometers } : {}),
  };
  return formatRentalPackageAllowanceLabel(displayPackage, { rentalType, tr, fallbackDurationUnits });
};

const formatTripDurationLabel = (units, rentalType, tr) => {
  const safeUnits = Math.max(rentalType === 'hourly' ? 0.5 : 1, Number(units || 1));
  if (rentalType === 'daily') {
    return safeUnits === 1
      ? tr('1 day trip', 'Trajet de 1 jour')
      : tr(`${safeUnits} day trip`, `Trajet de ${safeUnits} jours`);
  }

  if (safeUnits === 0.5) return tr('30 min trip', 'Trajet de 30 min');
  return safeUnits === 1
    ? tr('1 hour trip', 'Trajet de 1 heure')
    : tr(`${safeUnits} hour trip`, `Trajet de ${safeUnits} heures`);
};

const sortPublicPackages = (
  packages,
  rentalType,
  selectedDurationUnits = 1,
  hasInteractedWithDuration = false
) => {
  const getRank = (pkg) => {
    if (rentalType === 'hourly') {
      if (isHalfHourPackage(pkg)) {
        return hasInteractedWithDuration && Number(selectedDurationUnits || 1) >= 1 ? 3 : 0;
      }
      if (Number(pkg?.includedKilometers || 0) > 0 && !isHalfDayPackage(pkg)) return 1;
      if (isHalfDayPackage(pkg)) return 2;
      if (pkg?.kind === 'unlimited') return 3;
      return 2;
    }

    if (pkg?.kind === 'unlimited') return 98;
    if (isHalfDayPackage(pkg)) return 97;
    return Math.max(0, Number(pkg?.includedKilometers || 0));
  };

  return [...packages].sort((a, b) => {
    const rankDiff = getRank(a) - getRank(b);
    if (rankDiff !== 0) return rankDiff;

    if (rentalType === 'hourly') {
      const hourlyKmDiff = Number(a?.includedKilometers || 0) - Number(b?.includedKilometers || 0);
      if (hourlyKmDiff !== 0) return hourlyKmDiff;
    } else {
      if (a?.kind === 'unlimited' && b?.kind !== 'unlimited') return 1;
      if (b?.kind === 'unlimited' && a?.kind !== 'unlimited') return -1;

      const dailyKmDiff = Number(a?.includedKilometers || 0) - Number(b?.includedKilometers || 0);
      if (dailyKmDiff !== 0) return dailyKmDiff;
    }

    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
};

const isPromoPackage = (pkg, rentalType) =>
  rentalType === 'hourly' && [15, 17].includes(Number(pkg?.includedKilometers || 0));

const normalizePackageDisplayPrice = (amount) => {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;
  return Math.round(numericAmount);
};

const getTripBadge = (pkg, rentalType, tr) => {
  if (!pkg) return null;
  const includedKilometers = Number(pkg?.includedKilometers || 0);

  if (rentalType === 'hourly' && [15, 17].includes(includedKilometers)) {
    return {
      label: tr('Most popular', 'Le plus populaire'),
      icon: '🔥',
      className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    };
  }

  if (isHalfDayPackage(pkg) || pkg?.kind === 'unlimited') {
    return {
      label: tr('Best value', 'Meilleur rapport'),
      icon: '⭐',
      className: 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200',
    };
  }

  return null;
};

const getPackageFuelChargeEnabled = (pkg) => {
  const rawValue = pkg?.fuelChargeEnabled ?? pkg?.fuel_charge_enabled ?? false;

  if (typeof rawValue === 'string') {
    const normalizedValue = rawValue.trim().toLowerCase();
    return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
  }

  if (typeof rawValue === 'number') {
    return rawValue === 1;
  }

  return rawValue === true;
};

const TripCard = ({
  badge,
  duration,
  price,
  currencyCode,
  includedDistance,
  benefit,
  selected,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative w-full rounded-2xl bg-white px-4 py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 ${
      selected
        ? 'scale-[1.02] border-2 border-black bg-[#FAFAFA]'
        : 'border border-slate-200 hover:border-slate-300'
    }`}
  >
    {selected ? (
      <span className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white">
        <Check className="h-4 w-4" />
      </span>
    ) : null}

    {badge ? (
      <span className={`inline-flex rounded-full px-2 py-1 text-[12px] font-semibold ${badge.className}`}>
        {badge.icon} {badge.label}
      </span>
    ) : (
      <span className="inline-flex h-6" aria-hidden="true" />
    )}

    <div className="mt-3">
      <p className="text-sm font-bold text-slate-900">{duration}</p>
      <p className="mt-1 text-[2rem] font-black leading-none tracking-tight text-slate-950">
        {price} <span className="text-base font-bold">{currencyCode}</span>
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">{includedDistance}</p>
      {benefit ? <p className="mt-1 text-xs font-medium text-slate-500">{benefit}</p> : null}
    </div>
  </button>
);

const buildVehicleChoices = (listings = [], city) => {
  const grouped = new Map();
  const normalizedCity = String(city || '').toLowerCase();
  const genericUnknownKeys = new Set(['unknown', 'unknownmodel', 'vehicle', 'unknownvehicle']);

  listings.forEach((item) => {
    if (!item || item.inventorySource !== 'certified_fleet') return;
    if (normalizedCity && String(item.location?.city || '').toLowerCase() !== normalizedCity) return;

    const modelKey = String(item.model || item.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    if (genericUnknownKeys.has(modelKey)) return;

    const key = String(item.model || item.title || item.id);
    if (!grouped.has(key)) {
      grouped.set(key, item);
    }
  });

  const getOrder = (item) => {
    const model = String(item.model || item.title || '').toUpperCase();
    if (model === 'AT6') return 0;
    if (model === 'AT5') return 1;
    return 99;
  };

  return Array.from(grouped.values()).sort((left, right) => {
    const orderDiff = getOrder(left) - getOrder(right);
    if (orderDiff !== 0) return orderDiff;
    return String(left.model || left.title || '').localeCompare(String(right.model || right.title || ''));
  });
};

const PublicVehicleDetail = () => {
  useTranslation();
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [listing, setListing] = useState(null);
  const [vehicleChoices, setVehicleChoices] = useState([]);
  const [activeVehicleId, setActiveVehicleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCertifiedInfo, setShowCertifiedInfo] = useState(false);
  const [activeConditionInfo, setActiveConditionInfo] = useState(null);
  const [durationUnitPrices, setDurationUnitPrices] = useState({});
  const [selectedDurationUnits, setSelectedDurationUnits] = useState(() => {
    const requestedUnits = Number(searchParams.get('durationUnits') || 1) || 1;
    return requestedUnits === 0.5 ? 0.5 : Math.max(1, requestedUnits);
  });
  const [hasInteractedWithDuration, setHasInteractedWithDuration] = useState(false);
  const [showVehicleDetails, setShowVehicleDetails] = useState(false);
  const [ownerReviewSummary, setOwnerReviewSummary] = useState(null);
  const [showMorePackages, setShowMorePackages] = useState(false);
  const [expandedPackageId, setExpandedPackageId] = useState(null);
  const [focusedPackageId, setFocusedPackageId] = useState(null);
  const [activeTripDetailsId, setActiveTripDetailsId] = useState(null);
  const [showConditions, setShowConditions] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(60);
  const [vehicleDirection, setVehicleDirection] = useState(0);
  const [vehicleTransitioning, setVehicleTransitioning] = useState(false);
  const touchStartXRef = useRef(null);
  const lastAutoSearchStringRef = useRef('');
  const cityOverride = searchParams.get('city') || '';
  const rentalType = searchParams.get('rentalType') || 'hourly';
  const selectedPackageId = searchParams.get('packageId') || null;
  const durationUnitsParam = searchParams.get('durationUnits') || '';
  const currentSearchString = searchParams.toString();

  useEffect(() => {
    let active = true;

    const loadTimingSettings = async () => {
      try {
        const settings = await fetchSystemSettings();
        if (!active) return;
        setGracePeriodMinutes(Number(settings?.rentalGracePeriodMinutes || settings?.rental_grace_period_minutes || 60) || 60);
      } catch {
        if (!active) return;
        setGracePeriodMinutes(60);
      }
    };

    loadTimingSettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const canonicalOrigin = getCanonicalStorefrontOrigin({
      host: window.location.host,
      protocol: window.location.protocol,
      tenantSlug: DEFAULT_STOREFRONT_TENANT_SLUG,
    });

    if (canonicalOrigin && canonicalOrigin !== window.location.origin) {
      window.location.replace(`${canonicalOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadListing = async () => {
      setLoading(true);
      setError('');

      try {
        PublicCatalogService.clearCache();
        const nextListing = await PublicCatalogService.getListingById(listingId, cityOverride);
        if (!active) return;

        if (!nextListing) {
          setError(tr('This listing could not be found.', 'Cette annonce est introuvable.'));
          return;
        }

        const catalog = await PublicCatalogService.getCatalog({
          flow: 'instant',
          source: 'certified_fleet',
          city: cityOverride || nextListing.location?.city || 'Tangier',
        });
        if (!active) return;

        const nextChoices = buildVehicleChoices(catalog.listings || [], cityOverride || nextListing.location?.city || 'Tangier');
        const ensuredChoices = nextChoices.some((item) => String(item.id) === String(nextListing.id))
          ? nextChoices
          : [nextListing, ...nextChoices];

        const at6Default = ensuredChoices.find((item) => String(item.model || item.title || '').toUpperCase() === 'AT6');
        setVehicleChoices(ensuredChoices);
        setActiveVehicleId(at6Default?.id || nextListing.id);
        setListing(nextListing);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || tr('Failed to load listing details.', "Impossible de charger les détails de l'annonce."));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadListing();

    return () => {
      active = false;
    };
  }, [cityOverride, listingId]);

  const currentListing = useMemo(
    () => vehicleChoices.find((item) => String(item.id) === String(activeVehicleId)) || listing,
    [activeVehicleId, listing, vehicleChoices]
  );

  const packageCards = useMemo(() => {
    if (!currentListing) return [];

    const configuredPackages = Array.isArray(currentListing?.packageCatalog?.[rentalType])
      ? currentListing.packageCatalog[rentalType]
      : [];
    return sortPublicPackages(
      configuredPackages,
      rentalType,
      selectedDurationUnits,
      hasInteractedWithDuration
    );
  }, [currentListing, hasInteractedWithDuration, rentalType, selectedDurationUnits]);

  useEffect(() => {
    let cancelled = false;

    const loadDurationUnitPrices = async () => {
      const hasHourlySource = rentalType === 'hourly' && currentListing?.sourceId;
      const hasDailySource = rentalType === 'daily' && currentListing?.vehicleModelId;

      if (!hasHourlySource && !hasDailySource) {
        setDurationUnitPrices({});
        return;
      }

      try {
        const durations = rentalType === 'hourly' ? [1, 2, 3, 4] : [1, 2, 3];
        const priceRows = await Promise.all(
          durations.map(async (units) => {
            if (rentalType === 'daily') {
              const pricing = await DynamicPricingService.getPricingForDuration(currentListing.vehicleModelId, units);
              return [units, Number(pricing?.price || 0)];
            }

            const price = await DynamicPricingService.getDynamicPrice(currentListing.sourceId, 'hourly', units);
            return [units, Number(price || 0)];
          })
        );

        if (!cancelled) {
          setDurationUnitPrices(Object.fromEntries(priceRows));
        }
      } catch (_error) {
        if (!cancelled) {
          setDurationUnitPrices({});
        }
      }
    };

    loadDurationUnitPrices();

    return () => {
      cancelled = true;
    };
  }, [currentListing?.sourceId, currentListing?.vehicleModelId, rentalType]);

  const selectedPackage = useMemo(
    () => packageCards.find((pkg) => String(pkg.id) === String(selectedPackageId)) || null,
    [packageCards, selectedPackageId]
  );
  const durationOptions = useMemo(
    () => getDurationOptionsForPackages(packageCards, rentalType),
    [packageCards, rentalType]
  );
  const replaceSearchParamsIfChanged = (nextParams) => {
    const nextString = nextParams.toString();
    if (!nextString || nextString === currentSearchString) return;
    if (lastAutoSearchStringRef.current === nextString) return;
    lastAutoSearchStringRef.current = nextString;
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (lastAutoSearchStringRef.current === currentSearchString) {
      lastAutoSearchStringRef.current = '';
    }
  }, [currentSearchString]);

  const normalizedSelectedDurationUnits = useMemo(() => {
    const rawUnits = durationUnitsParam
      ? (Number(durationUnitsParam || 1) || 1)
      : (
          selectedPackage
            ? getPackageDurationUnits(selectedPackage, Number(selectedDurationUnits || 1) || 1)
            : (Number(selectedDurationUnits || 1) || 1)
        );

    if (durationOptions.includes(rawUnits)) return rawUnits;
    if (durationOptions.length > 0) return durationOptions[0];
    return rawUnits === 0.5 ? 0.5 : Math.max(1, rawUnits);
  }, [durationOptions, durationUnitsParam, selectedDurationUnits, selectedPackage]);

  useEffect(() => {
    if (Math.abs(Number(selectedDurationUnits || 1) - normalizedSelectedDurationUnits) < 0.001) return;
    if (durationOptions.length > 0 && !durationOptions.includes(Number(selectedDurationUnits || 1))) {
      setHasInteractedWithDuration(false);
    }
    setSelectedDurationUnits(normalizedSelectedDurationUnits);
  }, [durationOptions, normalizedSelectedDurationUnits, selectedDurationUnits]);

  useEffect(() => {
    if (!packageCards.length) return;

    const hasValidSelectedPackage = packageCards.some(
      (pkg) =>
        String(pkg.id) === String(selectedPackageId) &&
        packageMatchesDuration(pkg, normalizedSelectedDurationUnits, rentalType)
    );
    if (selectedPackageId && hasValidSelectedPackage) return;

    const next = new URLSearchParams(currentSearchString);
    const defaultPackage = getDefaultInstantBookingPackage(currentListing, rentalType, normalizedSelectedDurationUnits);
    if (!defaultPackage) {
      setCanonicalDurationAndPackageParams(next, normalizedSelectedDurationUnits);
      replaceSearchParamsIfChanged(next);
      return;
    }
    setCanonicalDurationAndPackageParams(
      next,
      getEffectivePackageDurationUnits(defaultPackage, normalizedSelectedDurationUnits, rentalType),
      defaultPackage.id
    );
    replaceSearchParamsIfChanged(next);
  }, [currentListing, currentSearchString, normalizedSelectedDurationUnits, packageCards, rentalType, selectedPackageId]);

  const getSelectedDurationForPackage = (pkg) =>
    getEffectivePackageDurationUnits(pkg, normalizedSelectedDurationUnits, rentalType);

  const getEffectivePackagePrice = (pkg) => {
    const basePackagePrice = Number(pkg?.fixedAmount || 0);

    if (isHalfHourPackage(pkg)) {
      return normalizePackageDisplayPrice(basePackagePrice);
    }

    if (isHalfDayPackage(pkg)) {
      return normalizePackageDisplayPrice(basePackagePrice);
    }

    const duration = getSelectedDurationForPackage(pkg);
    if (pkg.kind === 'unlimited' && basePackagePrice > 0) {
      const durationMultiplier = shouldScaleHourlyPackageByDuration(pkg, rentalType, duration)
        ? Math.max(1, Number(duration || 1) || 1)
        : 1;
      return normalizePackageDisplayPrice(basePackagePrice * durationMultiplier);
    }

    if (pkg.kind === 'unlimited') {
      const unitPrice = Number(durationUnitPrices[duration] || 0);
      const fallbackUnitPrice = rentalType === 'daily'
        ? Number(currentListing?.dailyPrice || 0)
        : Number(currentListing?.hourlyPrice || 0);
      const resolvedUnitPrice = unitPrice > 0 ? unitPrice : fallbackUnitPrice;
      return resolvedUnitPrice > 0 ? normalizePackageDisplayPrice(resolvedUnitPrice) : 0;
    }

    if (
      shouldScaleHourlyPackageByDuration(pkg, rentalType, duration) ||
      (rentalType === 'hourly' && isFlexibleHourlyPackage(pkg, duration))
    ) {
      const durationMultiplier = Math.max(1, Number(duration || 1) || 1);
      return basePackagePrice > 0 ? Math.round(basePackagePrice * durationMultiplier) : 0;
    }

    return basePackagePrice > 0 ? normalizePackageDisplayPrice(basePackagePrice) : 0;
  };

  const getEffectiveIncludedKilometers = (pkg) => {
    const baseKilometers = Number(pkg?.includedKilometers || 0);
    if (!Number.isFinite(baseKilometers) || baseKilometers <= 0) return 0;

    const duration = getSelectedDurationForPackage(pkg);
    if (!shouldScaleHourlyPackageByDuration(pkg, rentalType, duration)) return baseKilometers;

    return Math.round(baseKilometers * Math.max(1, Number(duration || 1) || 1));
  };

  const getDisplayedIncludedKilometers = (pkg) => {
    const includedKilometers = getEffectiveIncludedKilometers(pkg);
    if (includedKilometers <= 0 && pkg.kind === 'unlimited') return tr('Unlimited KM', 'Km illimités');

    return `${includedKilometers} km`;
  };

  const getTripDurationLabel = (pkg) => formatTripDurationLabel(getSelectedDurationForPackage(pkg), rentalType, tr);
  const listingIncludedKm = selectedPackage
    ? getEffectiveIncludedKilometers(selectedPackage)
    : Number(currentListing?.includedKm ?? 0) || 0;
  const listingExtraKmRate = Number(selectedPackage?.extraKmRate ?? currentListing?.extraKmRate ?? 0) || 0;
  const listingDistanceRule = listingIncludedKm > 0
    ? listingExtraKmRate > 0
      ? tr(
          `${listingIncludedKm} km included • ${listingExtraKmRate} MAD/km extra`,
          `${listingIncludedKm} km inclus • ${listingExtraKmRate} MAD/km extra`
        )
      : tr(`${listingIncludedKm} km included`, `${listingIncludedKm} km inclus`)
    : tr('Unlimited kilometers', 'Kilomètres illimités');

  const showDurationSelector = true;
  const displayBrand = currentListing?.brand || 'Segway';
  const displayModel = currentListing?.model || currentListing?.title || 'AT6';
  const ownerDisplayName = String(
    currentListing?.ownerDisplayName ||
    currentListing?.owner_display_name ||
    currentListing?.ownerName ||
    currentListing?.owner_name ||
    ''
  ).trim();
  const ownerUserId = String(
    currentListing?.ownerId ||
    currentListing?.owner_id ||
    currentListing?.ownerUserId ||
    currentListing?.owner_user_id ||
    ''
  ).trim();
  const ownerAverageRating = Number(ownerReviewSummary?.averageRating || 0);
  const ownerReviewCount = Number(ownerReviewSummary?.totalReviews || 0);
  const riderSummary = currentListing?.riderCapacity === 1
    ? tr('1 rider', '1 rider')
    : tr(`${currentListing?.riderCapacity || 0} riders`, `${currentListing?.riderCapacity || 0} riders`);
  const powerSummary = renderPowerValue(currentListing, tr);
  const vehicleSummaryLine = `${riderSummary} • ${powerSummary} • ${tr('Certified', 'Certifié')}`;

  const durationScopedPackageCards = useMemo(
    () => packageCards.filter((pkg) => packageMatchesDuration(pkg, normalizedSelectedDurationUnits, rentalType)),
    [normalizedSelectedDurationUnits, packageCards, rentalType]
  );

  const primaryPackageCards = useMemo(() => {
    const standardPackages = durationScopedPackageCards.filter((pkg) => pkg.kind !== 'unlimited');
    const preferredPackages = standardPackages.length > 0 ? standardPackages : durationScopedPackageCards;
    return preferredPackages.slice(0, 3);
  }, [durationScopedPackageCards]);

  const hiddenPackageCards = useMemo(() => {
    const excludedIds = new Set();

    const primaryIds = new Set(primaryPackageCards.map((pkg) => String(pkg.id)));
    return durationScopedPackageCards.filter((pkg) => {
      const packageId = String(pkg.id);
      if (primaryIds.has(packageId)) return false;
      if (excludedIds.has(packageId)) return false;
      return true;
    });
  }, [durationScopedPackageCards, primaryPackageCards]);

  const visiblePackageCards = useMemo(() => {
    if (showMorePackages) {
      return [...primaryPackageCards, ...hiddenPackageCards];
    }

    if (selectedPackage && hiddenPackageCards.some((pkg) => String(pkg.id) === String(selectedPackage.id))) {
      return [...primaryPackageCards, selectedPackage];
    }

    return primaryPackageCards;
  }, [hiddenPackageCards, primaryPackageCards, selectedPackage, showMorePackages]);

  const activeTripDetails = useMemo(
    () => packageCards.find((pkg) => String(pkg.id) === String(activeTripDetailsId)) || null,
    [activeTripDetailsId, packageCards]
  );
  const activeFuelLineCharge = rentalType === 'daily'
    ? Number(currentListing?.fuelLineChargeDaily || 0) || 0
    : Number(currentListing?.fuelLineChargeHourly || 0) || 0;

  useEffect(() => {
    setShowMorePackages(false);
    setExpandedPackageId(null);
    setFocusedPackageId(null);
    setActiveTripDetailsId(null);
  }, [rentalType]);

  const activeProvider = useMemo(() => {
    return PublicCatalogService.getCertifiedFleetProviderByCity(currentListing?.location?.city || 'Tangier');
  }, [currentListing?.location?.city]);

  const switchVehicle = (nextVehicleId) => {
    if (!nextVehicleId || String(nextVehicleId) === String(activeVehicleId)) return;
    const nextListing = vehicleChoices.find((item) => String(item.id) === String(nextVehicleId));
    const nextPackages = Array.isArray(nextListing?.packageCatalog?.[rentalType]) ? nextListing.packageCatalog[rentalType] : [];
    const nextDurationOptions = getDurationOptionsForPackages(nextPackages, rentalType);
    const keepCurrentDuration = nextDurationOptions.includes(Number(selectedDurationUnits || 1));
    const currentIndex = vehicleChoices.findIndex((item) => String(item.id) === String(activeVehicleId));
    const nextIndex = vehicleChoices.findIndex((item) => String(item.id) === String(nextVehicleId));
    setVehicleDirection(nextIndex > currentIndex ? 1 : -1);
    setVehicleTransitioning(true);
    setActiveVehicleId(nextVehicleId);
    setShowVehicleDetails(false);
    setShowMorePackages(false);
    setExpandedPackageId(null);
    setFocusedPackageId(null);
    setActiveTripDetailsId(null);
    const nextSearch = new URLSearchParams(currentSearchString);
    if (!keepCurrentDuration) {
      const fallbackUnits = nextDurationOptions[0] || 1;
      setCanonicalDurationAndPackageParams(nextSearch, fallbackUnits);
      setSelectedDurationUnits(fallbackUnits);
      setHasInteractedWithDuration(false);
    } else {
      clearPackageSearchParams(nextSearch);
    }
    if (nextSearch.toString() !== currentSearchString) {
      setSearchParams(nextSearch, { replace: true });
    }
    window.setTimeout(() => setVehicleTransitioning(false), 220);
  };

  const switchVehicleByOffset = (offset) => {
    if (vehicleChoices.length <= 1) return;
    const currentIndex = vehicleChoices.findIndex((item) => String(item.id) === String(activeVehicleId));
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= vehicleChoices.length) return;
    switchVehicle(vehicleChoices[nextIndex].id);
  };

  const activeVehicleIndex = vehicleChoices.findIndex((item) => String(item.id) === String(activeVehicleId));
  const canSwitchVehicles = vehicleChoices.length > 1;
  const canGoPreviousVehicle = activeVehicleIndex > 0;
  const canGoNextVehicle = activeVehicleIndex >= 0 && activeVehicleIndex < vehicleChoices.length - 1;

  const updateRentalType = (value) => {
    if (value === rentalType) return;

    const nextPackages = Array.isArray(currentListing?.packageCatalog?.[value])
      ? currentListing.packageCatalog[value]
      : [];
    const nextDurationOptions = getDurationOptionsForPackages(nextPackages, value);
    const currentUnits = Number(selectedDurationUnits || 1) || 1;
    const fallbackUnits = nextDurationOptions.includes(currentUnits)
      ? currentUnits
      : (nextDurationOptions[0] || 1);

    const next = new URLSearchParams(currentSearchString);
    next.set('rentalType', value);
    setCanonicalDurationAndPackageParams(next, fallbackUnits);
    setHasInteractedWithDuration(false);
    setSelectedDurationUnits(fallbackUnits);
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleSelectPackage = (pkg) => {
    setFocusedPackageId(null);
    setActiveTripDetailsId(pkg.id);
    const next = new URLSearchParams(currentSearchString);
    next.set('rentalType', rentalType);
    setCanonicalDurationAndPackageParams(next, getSelectedDurationForPackage(pkg), pkg.id);
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleSelectDurationUnits = (units) => {
    const safeUnits = Math.max(units === 0.5 ? 0.5 : 1, Number(units || 1));
    setHasInteractedWithDuration(true);
    setSelectedDurationUnits(safeUnits);
    const next = new URLSearchParams(currentSearchString);
    next.set('rentalType', rentalType);
    const nextDurationPackage = packageCards.find((pkg) => packageMatchesDuration(pkg, safeUnits, rentalType)) || null;
    setCanonicalDurationAndPackageParams(next, safeUnits, nextDurationPackage?.id || null);
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleBookSelectedPackage = () => {
    if (!selectedPackage) return;
    const next = new URLSearchParams();
    next.set('rentalType', rentalType);
    next.set('packageId', selectedPackage.id);
    next.set('packageName', formatPackageDisplayName(selectedPackage, rentalType, tr, getSelectedDurationForPackage(selectedPackage)));
    next.set('packageAmount', String(getEffectivePackagePrice(selectedPackage)));
    next.set('packageKind', selectedPackage.kind || '');
    next.set('durationUnits', String(getSelectedDurationForPackage(selectedPackage)));
    if (currentListing?.location?.city) {
      next.set('city', currentListing.location.city);
    }
    const includedKilometers = getEffectiveIncludedKilometers(selectedPackage);
    if (includedKilometers) {
      next.set('includedKilometers', String(includedKilometers));
    }
    if (selectedPackage.extraKmRate) {
      next.set('extraKmRate', String(selectedPackage.extraKmRate));
    }
    navigate(`/rent/${currentListing.id}/book?${next.toString()}`);
  };

  useEffect(() => {
    let cancelled = false;

    const loadOwnerReviewSummary = async () => {
      if (!ownerUserId) {
        setOwnerReviewSummary(null);
        return;
      }

      try {
        const summary = await PublicReviewService.getOwnerReviewSummary({
          ownerUserId,
          limit: 3,
        });
        if (!cancelled) {
          setOwnerReviewSummary(summary);
        }
      } catch {
        if (!cancelled) {
          setOwnerReviewSummary(null);
        }
      }
    };

    void loadOwnerReviewSummary();
    return () => {
      cancelled = true;
    };
  }, [ownerUserId]);

  const handleShareListing = async () => {
    if (!currentListing || isSharing || typeof window === 'undefined') return;

    setIsSharing(true);

    try {
      const shareParams = new URLSearchParams();
      shareParams.set('rentalType', rentalType);
      shareParams.set('lang', isFrench ? 'fr' : 'en');

      if (selectedDurationUnits) {
        shareParams.set('durationUnits', String(selectedDurationUnits));
      }

      if (currentListing?.location?.city) {
        shareParams.set('city', currentListing.location.city);
      }

      if (selectedPackage) {
        shareParams.set('packageId', String(selectedPackage.id));
        shareParams.set('packageName', formatPackageDisplayName(selectedPackage, rentalType, tr, getSelectedDurationForPackage(selectedPackage)));
        shareParams.set('packageAmount', String(getEffectivePackagePrice(selectedPackage)));
        shareParams.set('packageKind', selectedPackage.kind || '');

        const packageDuration = String(getSelectedDurationForPackage(selectedPackage));
        if (packageDuration) {
          shareParams.set('durationUnits', packageDuration);
        }

        const includedKilometers = getEffectiveIncludedKilometers(selectedPackage);
        if (includedKilometers) {
          shareParams.set('includedKilometers', String(includedKilometers));
        }

        if (selectedPackage.extraKmRate) {
          shareParams.set('extraKmRate', String(selectedPackage.extraKmRate));
        }
      }

      const storefrontOrigin = getCanonicalStorefrontOrigin({
        host: window.location.host,
        protocol: window.location.protocol,
        tenantSlug: DEFAULT_STOREFRONT_TENANT_SLUG,
      });
      const fullShareUrl = `${storefrontOrigin}/share/rent/${encodeURIComponent(currentListing.id)}${shareParams.toString() ? `?${shareParams.toString()}` : ''}`;
      const shortShareUrl = await shortenUrl(fullShareUrl, null, 'other');
      const shareUrl = shortShareUrl || fullShareUrl;
      const shareTitle = `${displayModel} - ${tr('Rent with SaharaX', 'Louez avec SaharaX')}`;
      const shareText = tr(
        'Book this vehicle directly from our certified fleet.',
        'Réservez en direct. Flotte certifiée SaharaX.'
      );

      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(tr('Share link copied', 'Lien de partage copié'));
        return;
      }

      window.prompt(tr('Copy this link', 'Copiez ce lien'), shareUrl);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      toast.error(tr('Unable to create share link', 'Impossible de créer le lien de partage'));
    } finally {
      setIsSharing(false);
    }
  };

  const conditionInfoContent = useMemo(() => ({
    deposit: {
      title: tr('Damage deposit', 'Caution'),
      body: [
        tr('Your deposit is returned at the end of the rental when the vehicle comes back in the same condition.', 'Votre caution est restituée à la fin de la location lorsque le véhicule revient dans le même état.'),
        tr('This deposit covers any damage caused to the vehicle during your rental.', 'Cette caution couvre tout dommage causé au véhicule pendant votre location.'),
        tr('Keep a copy of the vehicle video before departure as your condition record.', "Conservez une copie de la vidéo du véhicule avant le départ comme preuve de l'état."),
        tr('Registration and insurance papers stay under your responsibility during the rental.', "Les papiers d'immatriculation et d'assurance restent sous votre responsabilité pendant la location."),
        tr('Lost papers may lead to a fine of up to 2,000 MAD.', "La perte de ces papiers peut entraîner une amende pouvant aller jusqu'à 2 000 MAD."),
      ],
    },
    license: {
      title: tr('Driver license', 'Permis conducteur'),
      body: [
        tr('A valid car driver license is required to rent this vehicle.', 'Un permis voiture valide est obligatoire pour louer ce véhicule.'),
      ],
    },
    distance: {
      title: tr('Distance rule', 'Règle de distance'),
      body: [
        listingDistanceRule,
        tr('Extra kilometers are calculated from the pickup and return odometer readings.', 'Les kilomètres supplémentaires sont calculés à partir du compteur au départ et au retour.'),
      ],
    },
    insurance: {
      title: tr('Insurance', 'Assurance'),
      body: [
        tr('This vehicle includes RC road insurance only.', 'Ce véhicule comprend uniquement une assurance RC route.'),
        tr('It does not include full damage coverage for the vehicle.', "Elle n'inclut pas une couverture complète des dommages du véhicule."),
        tr('Insurance papers are included with the vehicle and must be returned in good condition.', "Les papiers d'assurance sont inclus avec le véhicule et doivent être restitués en bon état."),
      ],
    },
    fuelDaily: {
      title: tr('Fuel policy', 'Politique carburant'),
      body: [
        tr('You receive the vehicle with a certain fuel level and must return it with the same amount.', "Vous recevez le véhicule avec un certain niveau de carburant et devez le restituer avec le même niveau."),
        tr('If the fuel level is lower at return, a charge of 50 MAD per line will apply.', "Si le niveau de carburant est plus bas au retour, des frais de 50 MAD par ligne s'appliqueront."),
      ],
    },
    city: {
      title: tr('City use policy', "Politique d'utilisation par ville"),
      body: [
        tr('This vehicle is strictly for Tangier city and the surrounding Tangier area only.', 'Ce véhicule est strictement réservé à la ville de Tanger et à la zone de Tanger uniquement.'),
        tr('It is not allowed to take the vehicle to another city.', "Il n'est pas autorisé d'emmener le véhicule dans une autre ville."),
        tr('If you need to go to another city, you must inform a staff member first.', "Si vous devez aller dans une autre ville, vous devez d'abord informer un membre de notre équipe."),
      ],
    },
    longerRental: {
      title: tr('Longer rental', 'Location plus longue'),
      body: [
        tr('Need more days? Contact our staff directly and we will help you arrange a longer rental.', 'Besoin de plus de jours ? Contactez directement notre équipe et nous vous aiderons à organiser une location plus longue.'),
      ],
    },
    longerHourlyRental: {
      title: tr('Longer rental', 'Location plus longue'),
      body: [
        tr('Need more hours? Contact our staff directly and we will help you arrange a longer rental.', 'Besoin de plus d’heures ? Contactez directement notre équipe et nous vous aiderons à organiser une location plus longue.'),
      ],
    },
  }), [isFrench, listingDistanceRule]);

  const conditionsRows = useMemo(() => ([
    {
      key: 'deposit',
      label: tr('Damage deposit', 'Caution'),
      value: `${currentListing?.depositAmount || 0} ${currentListing?.currencyCode || 'MAD'}`,
      infoKey: 'deposit',
    },
    {
      key: 'distance',
      label: tr('Distance', 'Distance'),
      value: listingDistanceRule,
      infoKey: 'distance',
    },
    {
      key: 'pickup',
      label: tr('Pickup', 'Retrait'),
      value: currentListing?.location?.label || '—',
    },
    {
      key: 'license',
      label: tr('Driver license', 'Permis conducteur'),
      value: tr('Car license required', 'Permis voiture requis'),
      infoKey: 'license',
    },
    {
      key: 'insurance',
      label: tr('Insurance', 'Assurance'),
      value: (
        <span className="flex flex-col items-start text-left">
          <span className="font-semibold text-slate-900">RC</span>
          <span className="text-xs font-medium text-slate-500">
            {tr('road coverage only', 'route uniquement')}
          </span>
        </span>
      ),
      infoKey: 'insurance',
    },
    {
      key: 'city',
      label: tr('City', 'Ville'),
      value: currentListing?.location?.city || '—',
      infoKey: 'city',
    },
    {
      key: 'fleet',
      label: tr('Fleet', 'Flotte'),
      value: activeProvider.providerName,
    },
  ]), [currentListing, activeProvider.providerName, isFrench, listingDistanceRule]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)]">
        <PublicSiteChrome current="rent" />
        <div className="px-6 py-10">
          <div className="mx-auto max-w-6xl animate-pulse">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-11 w-11 rounded-2xl bg-white shadow-sm" />
              <div className="h-11 w-40 rounded-full bg-white shadow-sm" />
            </div>
            <div className="mx-auto max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="px-6 pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-3">
                    <div className="h-10 w-32 rounded-2xl bg-slate-100" />
                  </div>
                  <div className="h-16 w-16 rounded-[18px] bg-slate-100" />
                </div>
              </div>
              <div className="mt-4 h-[280px] bg-slate-100 sm:h-[340px]" />
              <div className="space-y-4 p-4 sm:p-6">
                <div className="h-24 rounded-[24px] bg-slate-100" />
                <div className="h-7 w-48 rounded-xl bg-slate-100" />
                <div className="flex gap-3">
                  <div className="h-10 w-24 rounded-full bg-slate-100" />
                  <div className="h-10 w-24 rounded-full bg-slate-100" />
                </div>
                <div className="space-y-3">
                  <div className="h-28 rounded-[24px] bg-slate-100" />
                  <div className="h-28 rounded-[24px] bg-slate-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !currentListing) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)]">
        <PublicSiteChrome current="rent" />
        <div className="px-6 py-14">
          <div className="mx-auto max-w-4xl rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-rose-700">
            <h1 className="text-2xl font-semibold text-rose-900">{tr('Listing unavailable', 'Annonce indisponible')}</h1>
            <p className="mt-3">{error || tr('We could not load this listing.', "Nous n'avons pas pu charger cette annonce.")}</p>
            <Link
              to="/website"
              className="mt-6 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white"
            >
              {tr('Back to browse', 'Retour à la navigation')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)]">
      <PublicSiteChrome current="rent" />
      <div className="px-6 pt-10 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/website')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
            title={tr('Back to browse', 'Retour à la navigation')}
            aria-label={tr('Back to browse', 'Retour à la navigation')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowCertifiedInfo(true)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100 transition hover:border-violet-300 hover:bg-violet-50/40"
            aria-label={tr('Open certified fleet details', 'Ouvrir les détails de la flotte certifiée')}
          >
            <img
              src={CERTIFIED_BADGE_SRC}
              alt={tr('Certified fleet', 'Flotte certifiée')}
              className="h-6 w-6 object-contain"
            />
            <span>{tr(currentListing.badge, 'Flotte certifiée')}</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">
              <Eye className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-[44px] font-black leading-[0.95] tracking-tight text-slate-950 sm:text-6xl">
            {tr('Rent', 'Location')}
          </h1>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-violet-100 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <MapPin className="h-4 w-4 text-violet-700" />
            {currentListing?.location?.city || tr('Tangier', 'Tanger')}
            <Link to="/website" className="text-violet-700 transition hover:text-violet-900">
              {tr('Change', 'Changer')}
            </Link>
            <button
              type="button"
              onClick={handleShareListing}
              disabled={isSharing}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-50/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={tr('Share this vehicle', 'Partager ce véhicule')}
            >
              <Share2 className="h-4 w-4 text-emerald-700" />
              <span>{isSharing ? tr('Preparing...', 'Préparation...') : tr('Share', 'Partager')}</span>
            </button>
          </div>
        </div>

        <section className="mx-auto max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[2rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2.4rem]">
                  {displayModel}
                </p>
                {ownerDisplayName ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-500 sm:text-base">
                      {tr('Listed by', 'Publié par')} {ownerDisplayName}
                    </p>
                    {ownerReviewCount > 0 && ownerAverageRating > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {ownerAverageRating.toFixed(1)} · {ownerReviewCount} {ownerReviewCount === 1 ? tr('review', 'avis') : tr('reviews', 'avis')}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] bg-white shadow-sm sm:h-16 sm:w-16">
                <img
                  src={SEGWAY_LOGO_SRC}
                  alt="Segway"
                  className="h-full w-full rounded-[18px] object-cover"
                />
              </div>
            </div>
          </div>

          <div
            className={`relative h-[280px] overflow-hidden bg-slate-100 transition-all duration-200 ease-out sm:h-[340px] ${
              vehicleTransitioning
                ? vehicleDirection > 0
                  ? '-translate-x-1 opacity-95'
                  : 'translate-x-1 opacity-95'
                : 'translate-x-0 opacity-100'
            }`}
            onTouchStart={(event) => {
              touchStartXRef.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartXRef.current;
              const endX = event.changedTouches[0]?.clientX ?? null;
              touchStartXRef.current = null;
              if (startX === null || endX === null) return;
              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 50) return;
              if (deltaX < 0) {
                switchVehicleByOffset(1);
              } else {
                switchVehicleByOffset(-1);
              }
            }}
          >
            {canSwitchVehicles ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    switchVehicleByOffset(-1);
                  }}
                  disabled={!canGoPreviousVehicle}
                  className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out hover:-translate-y-[calc(50%+2px)] hover:scale-[1.04] hover:bg-violet-600 hover:text-white hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)] disabled:opacity-30 disabled:hover:scale-100 disabled:hover:translate-y-[-50%]"
                  aria-label={tr('Previous vehicle', 'Véhicule précédent')}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    switchVehicleByOffset(1);
                  }}
                  disabled={!canGoNextVehicle}
                  className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out hover:-translate-y-[calc(50%+2px)] hover:scale-[1.04] hover:bg-violet-600 hover:text-white hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)] disabled:opacity-30 disabled:hover:scale-100 disabled:hover:translate-y-[-50%]"
                  aria-label={tr('Next vehicle', 'Véhicule suivant')}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white/75 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white/75 to-transparent" />
              </>
            ) : null}
            <img src={normalizeVehicleImageUrl(currentListing.imageUrl) || '/assets/images/atv-placeholder.jpg'} alt={currentListing.title} className="h-full w-full object-cover transition-all duration-200 ease-out" />
          </div>

          {vehicleChoices.length > 1 ? (
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <div className="flex items-center justify-center gap-2">
                {vehicleChoices.map((vehicle) => {
                  const isActive = String(activeVehicleId) === String(vehicle.id);
                  return (
                    <button
                      key={`dot-${vehicle.id}`}
                      type="button"
                      onClick={() => switchVehicle(vehicle.id)}
                      className={`h-2.5 rounded-full transition-all ${
                        isActive ? 'w-6 bg-violet-600' : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                      }`}
                      aria-label={`${vehicle.model || vehicle.title} ${tr('vehicle', 'véhicule')}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{tr('Swipe to compare vehicles', 'Glissez pour comparer les véhicules')}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          ) : null}

          <div className="space-y-6 p-4 pb-28 sm:p-6 sm:pb-28">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900 sm:text-lg">{vehicleSummaryLine}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVehicleDetails((current) => !current)}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                >
                  {showVehicleDetails ? tr('Hide details ↑', 'Masquer les détails ↑') : tr('View details ↓', 'Voir les détails ↓')}
                </button>
              </div>

              {showVehicleDetails ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailStat label={tr('Brand', 'Marque')} value={displayBrand} />
                    <DetailStat label={tr('Model', 'Modèle')} value={displayModel} />
                    <DetailStat label={tr('Power', 'Puissance')} value={renderPowerValue(currentListing, tr)} />
                    <DetailStat label={tr('Passengers', 'Passagers')} value={renderPassengerValue(currentListing)} />
                  </div>

                  <div className="rounded-[24px] border border-violet-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbf8ff_100%)] p-4 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.12),rgba(255,255,255,0)_72%)]">
                        <img
                          src={CERTIFIED_BADGE_SRC}
                          alt={tr('Certified fleet', 'Flotte certifiée')}
                          className="h-10 w-10 object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
                          {tr('Certified partner', 'Partenaire certifié')}
                        </p>
                        <p className="mt-2 text-base font-semibold leading-tight text-slate-900">
                          {tr('Powered by', 'Propulsé par')} <span className="text-violet-700">{activeProvider.providerName}</span>
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {tr('Verified fleet access', 'Accès flotte vérifiée')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {ownerReviewCount > 0 && ownerAverageRating > 0 ? (
                    <div className="rounded-[24px] border border-amber-100 bg-[linear-gradient(180deg,#fffdf7_0%,#ffffff_100%)] p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600">
                            {tr('Owner rating', 'Note du propriétaire')}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">
                              <Star className="h-4 w-4 fill-current" />
                              {ownerAverageRating.toFixed(1)}
                            </span>
                            <span className="text-sm font-semibold text-slate-600">
                              {ownerReviewCount} {ownerReviewCount === 1 ? tr('review', 'avis') : tr('reviews', 'avis')}
                            </span>
                          </div>
                        </div>
                        {ownerDisplayName ? (
                          <Link
                            to={`/marketplace?owner=${encodeURIComponent(ownerUserId)}${ownerDisplayName ? `&ownerName=${encodeURIComponent(ownerDisplayName)}` : ''}`}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50"
                          >
                            {tr('See owner listings', 'Voir les annonces du propriétaire')}
                          </Link>
                        ) : null}
                      </div>
                      {Array.isArray(ownerReviewSummary?.recentReviews) && ownerReviewSummary.recentReviews.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {ownerReviewSummary.recentReviews.slice(0, 2).map((review) => (
                            <div key={review.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                {Number(review?.rating || 0).toFixed(1)}
                              </div>
                              {review?.comment ? (
                                <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                              ) : (
                                <p className="mt-2 text-sm text-slate-400">
                                  {tr('No written comment for this review.', 'Aucun commentaire écrit pour cet avis.')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setActiveConditionInfo('deposit')}
              className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-slate-950">
                    {tr('Security damage deposit', 'Caution de garantie')}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-emerald-700">
                    {tr('Refundable at return if the vehicle comes back in the same condition.', 'Remboursable au retour si le véhicule revient dans le même état.')}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-black text-emerald-800">
                  {currentListing?.depositAmount || 0} {currentListing?.currencyCode || 'MAD'}
                </span>
                <span className="text-[11px] font-semibold text-emerald-700">{tr('Tap for details', 'Voir détails')}</span>
              </span>
            </button>

            <div className="pt-1">
              <h2 className="text-[1.35rem] font-bold tracking-tight text-slate-950 sm:text-[1.45rem]">
                {tr('Choose your trip length', 'Choisissez la durée du trajet')}
              </h2>
              <p className="mt-3 text-sm font-medium text-slate-500">
                {currentListing.isAvailable
                  ? tr('We calculate the time automatically and keep the best distance match ready for this trip.', 'Nous calculons le temps automatiquement et gardons la meilleure distance adaptée prête pour ce trajet.')
                  : tr('Currently unavailable', 'Actuellement indisponible')}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {rentalTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateRentalType(option.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    rentalType === option.value
                      ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tr(option.label, option.labelFr)}
                </button>
              ))}
            </div>

            {showDurationSelector ? (
              <div className="flex flex-wrap gap-2">
                {durationOptions.map((units) => {
                  const isSelected = units === 0.5
                    ? Boolean(selectedPackage && isHalfHourPackage(selectedPackage))
                    : units === 4
                      ? Boolean(selectedPackage && isHalfDayPackage(selectedPackage))
                      : normalizedSelectedDurationUnits === units && !(selectedPackage && (isHalfHourPackage(selectedPackage) || isHalfDayPackage(selectedPackage)));
                  return (
                    <button
                      key={`${rentalType}-${units}`}
                      type="button"
                      onClick={() => handleSelectDurationUnits(units)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {rentalType === 'hourly' && units === 0.5
                        ? tr('30 min', '30 min')
                        : `${units} ${rentalType === 'daily'
                            ? (units === 1 ? tr('day', 'jour') : tr('days', 'jours'))
                            : (units === 1 ? tr('hour', 'heure') : tr('hours', 'heures'))}`}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setActiveConditionInfo(rentalType === 'daily' ? 'longerRental' : 'longerHourlyRental')}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
                >
                  <Info className="h-3.5 w-3.5" />
                  {rentalType === 'daily' ? tr('More days', 'Plus de jours') : tr('More hours', 'Plus d’heures')}
                </button>
              </div>
            ) : null}

            <div className="space-y-3">
              {visiblePackageCards.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  {rentalType === 'hourly'
                    ? (normalizedSelectedDurationUnits === 0.5
                        ? tr('No 30-minute packages are configured for this vehicle yet.', 'Aucun forfait de 30 minutes n’est encore configuré pour ce véhicule.')
                        : tr(`No ${normalizedSelectedDurationUnits}-hour packages are configured for this vehicle yet.`, `Aucun forfait de ${normalizedSelectedDurationUnits} heures n’est encore configuré pour ce véhicule.`))
                    : tr(`No ${normalizedSelectedDurationUnits}-day packages are configured for this vehicle yet.`, `Aucun forfait de ${normalizedSelectedDurationUnits} jours n’est encore configuré pour ce véhicule.`)}
                </div>
              ) : null}
              {visiblePackageCards.map((pkg) => {
                const isSelected = selectedPackage?.id === pkg.id;
                const badge = getTripBadge(pkg, rentalType, tr);
                const benefit = pkg.extraKmRate
                  ? tr(`${pkg.extraKmRate} MAD/km extra`, `${pkg.extraKmRate} MAD/km extra`)
                  : tr('Fuel, helmet, insurance', 'Carburant, casque, assurance');

                return (
                  <TripCard
                    key={pkg.id}
                    badge={badge}
                    duration={getTripDurationLabel(pkg)}
                    price={getEffectivePackagePrice(pkg)}
                    currencyCode={currentListing.currencyCode}
                    includedDistance={`${getDisplayedIncludedKilometers(pkg)} ${tr('included', 'inclus')}`}
                    benefit={benefit}
                    selected={isSelected}
                    onClick={() => handleSelectPackage(pkg)}
                  />
                );
              })}
            </div>

            {hiddenPackageCards.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMorePackages((current) => !current)}
                className="flex w-full items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-center shadow-sm transition hover:border-violet-300 hover:bg-violet-50/40"
              >
                <span className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
                  {showMorePackages ? tr('Hide options ↑', 'Masquer ↑') : tr('See more options ↓', 'Voir plus ↓')}
                </span>
              </button>
            ) : null}

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setShowConditions((current) => !current)}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <div>
                  <p className="text-base font-semibold text-slate-900">{tr('Rental conditions', 'Conditions de location')}</p>
                  <p className="mt-1 text-sm text-slate-500">{tr('Tap to view the key rules before booking.', 'Touchez pour voir les règles clés avant de réserver.')}</p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {showConditions ? tr('Hide ↑', 'Masquer ↑') : tr('View ↓', 'Voir ↓')}
                </span>
              </button>

              {showConditions ? (
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  {conditionsRows.map((row) => (
                    <div key={row.key} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                          <div className="mt-2 text-base font-semibold text-slate-900">{row.value}</div>
                        </div>
                        {row.infoKey ? (
                          <button
                            type="button"
                            onClick={() => setActiveConditionInfo(row.infoKey)}
                            className="inline-flex shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                            aria-label={`${row.label} ${tr('view', 'voir')}`}
                          >
                            {tr('View', 'Voir')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-3">
          {selectedPackage ? (
            <div className="flex items-center justify-between gap-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {getTripDurationLabel(selectedPackage)} • {getDisplayedIncludedKilometers(selectedPackage)}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {formatPackageDisplayName(selectedPackage, rentalType, tr, getSelectedDurationForPackage(selectedPackage))}
                </p>
              </div>
              <p className="shrink-0 text-2xl font-black tracking-tight text-slate-950">
                {getEffectivePackagePrice(selectedPackage)} {currentListing.currencyCode}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={selectedPackage ? handleBookSelectedPackage : undefined}
            disabled={!selectedPackage}
            className={`flex min-h-[56px] w-full items-center justify-center rounded-[20px] px-5 py-4 text-base font-semibold transition ${
              selectedPackage
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_18px_36px_rgba(91,33,182,0.24)]'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {selectedPackage
              ? `${tr('Continue', 'Continuer')} — ${getEffectivePackagePrice(selectedPackage)} ${currentListing.currencyCode}`
              : tr('Choose a trip ↑', 'Choisissez un trajet ↑')}
          </button>
        </div>
      </div>
      <PublicSiteFooter />
      {activeTripDetails ? (
        (() => {
          const activeTripFuelChargeEnabled = getPackageFuelChargeEnabled(activeTripDetails);
          return (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-4 sm:items-center"
          onClick={() => setActiveTripDetailsId(null)}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {getTripDurationLabel(activeTripDetails)}
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  {getEffectivePackagePrice(activeTripDetails)} {currentListing.currencyCode}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTripDetailsId(null)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span>{tr('Included distance', 'Distance incluse')}</span>
                  <span className="font-semibold text-slate-950">{getDisplayedIncludedKilometers(activeTripDetails)}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span>{tr('Fuel', 'Carburant')}</span>
                  <span className="font-semibold text-slate-950">
                    {activeTripFuelChargeEnabled
                      ? tr('Not included', 'Non inclus')
                      : tr('Included', 'Inclus')}
                  </span>
                </div>
                {activeTripFuelChargeEnabled ? (
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {activeFuelLineCharge > 0
                      ? tr(
                          `Missing fuel will be charged at ${activeFuelLineCharge} MAD per line.`,
                          `Le carburant manquant sera facturé à ${activeFuelLineCharge} MAD par ligne.`
                        )
                      : tr(
                          'Missing fuel may be charged separately at return.',
                          'Le carburant manquant peut être facturé séparément au retour.'
                        )}
                  </p>
                ) : null}
                {activeTripFuelChargeEnabled && activeFuelLineCharge > 0 ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>{tr('Fuel line charge', 'Frais par ligne')}</span>
                    <span className="font-semibold text-slate-950">
                      {activeFuelLineCharge} MAD/{tr('line', 'ligne')}
                    </span>
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>{tr('Helmet', 'Casque')}</span>
                  <span className="font-semibold text-slate-950">{tr('Included', 'Inclus')}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>{tr('Insurance', 'Assurance')}</span>
                  <span className="font-semibold text-slate-950">{tr('Included', 'Inclus')}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span>{tr('Extra km', 'Km supplémentaire')}</span>
                  <span className="font-semibold text-slate-950">
                    {activeTripDetails.extraKmRate ? `${activeTripDetails.extraKmRate} MAD/km` : tr('On request', 'Sur demande')}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>{tr('Late return policy', 'Politique de retard')}</span>
                  <span className="font-semibold text-slate-950">{gracePeriodMinutes} min</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>{tr('Deposit', 'Caution')}</span>
                  <span className="font-semibold text-slate-950">{currentListing.depositAmount || 0} {currentListing.currencyCode}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          );
        })()
      ) : null}
      {showCertifiedInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" onClick={() => setShowCertifiedInfo(false)}>
          <div
            className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={CERTIFIED_BADGE_SRC}
                  alt={tr('Certified fleet', 'Flotte certifiée')}
                  className="h-14 w-14 object-contain"
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{tr('Certified fleet', 'Flotte certifiée')}</p>
                  <p className="mt-1 text-sm text-slate-500">{tr('Why this badge matters', 'Pourquoi ce badge compte')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertifiedInfo(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                aria-label={tr('Close certified fleet information', "Fermer les informations sur la flotte certifiée")}
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Direct booking from our managed fleet', '• Réservation directe depuis notre flotte gérée')}
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Verified pricing and trip rules', '• Tarifs et règles du trajet vérifiés')}
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Pickup support from the local certified partner', '• Assistance de retrait par le partenaire certifié local')}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeConditionInfo ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-4 sm:items-center" onClick={() => setActiveConditionInfo(null)}>
          <div
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">{tr('More info', "Plus d'infos")}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{conditionInfoContent[activeConditionInfo]?.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveConditionInfo(null)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              {(conditionInfoContent[activeConditionInfo]?.body || []).map((line, index) => {
                const isFineLine = line.includes('2,000 MAD') || line.includes('2 000 MAD');
                const isDepositReturnLine = activeConditionInfo === 'deposit' && index === 0;
                if (isDepositReturnLine) {
                  return (
                    <p
                      key={`${activeConditionInfo}-${index}`}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800"
                    >
                      {line}
                    </p>
                  );
                }
                return (
                  <p key={`${activeConditionInfo}-${index}`} className={isFineLine ? 'font-semibold text-slate-900' : ''}>
                    {line}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PublicVehicleDetail;
