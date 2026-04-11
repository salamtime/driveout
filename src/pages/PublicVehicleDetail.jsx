import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgePercent, Check, ChevronLeft, ChevronRight, Eye, Info, Share2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import PublicCatalogService from '../services/PublicCatalogService';
import DynamicPricingService from '../services/DynamicPricingService';
import { shortenUrl } from '../services/UrlShortenerService';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import { getDefaultInstantBookingPackage } from '../utils/publicBookingFlow';
import { formatRentalPackageAllowanceLabel } from '../utils/rentalPackageLabels';
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

const isHalfDayPackage = (pkg) => /half[\s-]?day/i.test(String(pkg?.name || '')) || /demi[\s-]?journ/i.test(String(pkg?.name || ''));
const isHalfHourPackage = (pkg) =>
  /half[\s-]?hour/i.test(String(pkg?.name || '')) ||
  /30[\s-]?(min|minute|minutes)/i.test(String(pkg?.name || ''));

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

const formatPackageDisplayName = (pkg, rentalType, tr) => {
  return formatRentalPackageAllowanceLabel(pkg, { rentalType, tr });
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

  const rounded = Math.round(numericAmount);
  const lastDigit = rounded % 10;
  return lastDigit === 9 ? rounded : rounded + (9 - lastDigit);
};

const buildVehicleChoices = (listings = [], city) => {
  const grouped = new Map();
  const normalizedCity = String(city || '').toLowerCase();

  listings.forEach((item) => {
    if (!item || item.inventorySource !== 'certified_fleet') return;
    if (normalizedCity && String(item.location?.city || '').toLowerCase() !== normalizedCity) return;

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
  const [selectedDurationUnits, setSelectedDurationUnits] = useState(Number(searchParams.get('durationUnits') || 1) || 1);
  const [hasInteractedWithDuration, setHasInteractedWithDuration] = useState(false);
  const [showVehicleDetails, setShowVehicleDetails] = useState(false);
  const [showMorePackages, setShowMorePackages] = useState(false);
  const [expandedPackageId, setExpandedPackageId] = useState(null);
  const [showConditions, setShowConditions] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [vehicleDirection, setVehicleDirection] = useState(0);
  const [vehicleTransitioning, setVehicleTransitioning] = useState(false);
  const touchStartXRef = useRef(null);
  const cityOverride = searchParams.get('city') || '';
  const rentalType = searchParams.get('rentalType') || 'hourly';
  const selectedPackageId = searchParams.get('packageId') || null;
  const durationUnitsParam = searchParams.get('durationUnits') || '';
  const currentSearchString = searchParams.toString();

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
        PublicCatalogService.catalogCache.delete('public-catalog-certified');
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
    const hasUnlimitedPackage = configuredPackages.some((pkg) => pkg?.kind === 'unlimited');
    const defaultUnlimitedAmount = Number(currentListing?.unlimitedRates?.[rentalType] || 0);
    const normalizedPackages = !hasUnlimitedPackage && defaultUnlimitedAmount > 0
      ? [
          ...configuredPackages,
          {
            id: `base-unlimited-${currentListing.id}-${rentalType}`,
            name: tr('Unlimited KM', 'KM illimités'),
            fixedAmount: defaultUnlimitedAmount,
            includedKilometers: null,
            extraKmRate: 0,
            kind: 'unlimited',
            durationUnits: rentalType === 'daily' ? 1 : 1,
          },
        ]
      : configuredPackages;
    return sortPublicPackages(
      normalizedPackages,
      rentalType,
      selectedDurationUnits,
      hasInteractedWithDuration
    );
  }, [currentListing, hasInteractedWithDuration, rentalType, selectedDurationUnits, tr]);

  useEffect(() => {
    const requestedUnits = Number(durationUnitsParam || 1) || 1;
    if (Number(selectedDurationUnits || 1) === requestedUnits) return;
    setSelectedDurationUnits(requestedUnits);
  }, [durationUnitsParam, selectedDurationUnits]);

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
        const durations = [1, 2, 3];
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
  const halfHourPackage = useMemo(
    () => packageCards.find((pkg) => isHalfHourPackage(pkg)) || null,
    [packageCards]
  );
  const standardDurationPackage = useMemo(
    () => packageCards.find((pkg) => !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg)) || null,
    [packageCards]
  );
  const durationOptions = rentalType === 'hourly' ? [0.5, 1, 2, 3] : [1, 2, 3];
  const normalizedSelectedDurationUnits = useMemo(() => {
    const rawUnits = Number(selectedDurationUnits || 1);

    if (selectedPackage && isHalfHourPackage(selectedPackage)) return 0.5;
    if (selectedPackage && isHalfDayPackage(selectedPackage)) return 4;
    if (durationOptions.includes(rawUnits)) return rawUnits;

    return 1;
  }, [durationOptions, selectedDurationUnits, selectedPackage]);

  useEffect(() => {
    if (Number(selectedDurationUnits || 1) === normalizedSelectedDurationUnits) return;
    setSelectedDurationUnits(normalizedSelectedDurationUnits);
  }, [normalizedSelectedDurationUnits, selectedDurationUnits]);

  useEffect(() => {
    if (!packageCards.length) return;

    const hasValidSelectedPackage = packageCards.some((pkg) => String(pkg.id) === String(selectedPackageId));
    if (selectedPackageId && hasValidSelectedPackage) return;

    const defaultPackage = getDefaultInstantBookingPackage(currentListing, rentalType);
    if (!defaultPackage) return;

    const next = new URLSearchParams(searchParams);
    clearPackageSearchParams(next);
    next.set('packageId', String(defaultPackage.id));
    next.set('durationUnits', String(
      isHalfHourPackage(defaultPackage)
        ? 0.5
        : isHalfDayPackage(defaultPackage)
          ? 4
          : Math.max(1, Number(defaultPackage.durationUnits || 1) || 1)
    ));
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  }, [currentListing, currentSearchString, packageCards, rentalType, searchParams, selectedPackageId, setSearchParams]);

  useEffect(() => {
    const normalizedUnits = String(normalizedSelectedDurationUnits);
    if (durationUnitsParam === normalizedUnits) return;

    const next = new URLSearchParams(searchParams);
    next.set('durationUnits', normalizedUnits);
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  }, [currentSearchString, durationUnitsParam, normalizedSelectedDurationUnits, searchParams, setSearchParams]);

  const getSelectedDurationForPackage = (pkg) =>
    isHalfHourPackage(pkg)
      ? 0.5
      : isHalfDayPackage(pkg)
        ? 4
        : Math.max(1, Number(normalizedSelectedDurationUnits || pkg.durationUnits || 1) || 1);

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
      return normalizePackageDisplayPrice(basePackagePrice * duration);
    }

    if (pkg.kind === 'unlimited') {
      const unitPrice = Number(durationUnitPrices[duration] || 0);
      const fallbackUnitPrice = rentalType === 'daily'
        ? Number(currentListing?.dailyPrice || 0)
        : Number(currentListing?.hourlyPrice || 0);
      const resolvedUnitPrice = unitPrice > 0 ? unitPrice : fallbackUnitPrice;
      return resolvedUnitPrice > 0 ? normalizePackageDisplayPrice(resolvedUnitPrice * duration) : 0;
    }

    return basePackagePrice > 0 ? normalizePackageDisplayPrice(basePackagePrice * duration) : 0;
  };

  const getDisplayedIncludedKilometers = (pkg) => {
    if (pkg.kind === 'unlimited') {
      return tr('Unlimited KM', 'Km illimités');
    }

    const baseKilometers = Number(pkg?.includedKilometers || 0);
    if (!isHalfDayPackage(pkg) && !isHalfHourPackage(pkg)) {
      const totalKilometers = baseKilometers * getSelectedDurationForPackage(pkg);
      return `${totalKilometers} km`;
    }

    return `${baseKilometers} km`;
  };

  const showDurationSelector = !(selectedPackage && isHalfDayPackage(selectedPackage));
  const displayBrand = currentListing?.brand || 'Segway';
  const displayModel = currentListing?.model || currentListing?.title || 'AT6';
  const riderSummary = currentListing?.riderCapacity === 1
    ? tr('1 rider', '1 rider')
    : tr(`${currentListing?.riderCapacity || 0} riders`, `${currentListing?.riderCapacity || 0} riders`);
  const powerSummary = renderPowerValue(currentListing, tr);
  const vehicleSummaryLine = `${riderSummary} • ${powerSummary} • ${tr('Certified', 'Certifié')}`;

  const primaryPackageCards = useMemo(() => {
    if (rentalType === 'hourly') {
      return packageCards
        .filter((pkg) => !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg) && pkg.kind !== 'unlimited')
        .slice(0, 3);
    }

    return packageCards
      .filter((pkg) => pkg.kind !== 'unlimited')
      .slice(0, 3);
  }, [packageCards, rentalType]);

  const hiddenPackageCards = useMemo(() => {
    const primaryIds = new Set(primaryPackageCards.map((pkg) => String(pkg.id)));
    return packageCards.filter((pkg) => !primaryIds.has(String(pkg.id)));
  }, [packageCards, primaryPackageCards]);

  const visiblePackageCards = useMemo(() => {
    if (showMorePackages) {
      return [...primaryPackageCards, ...hiddenPackageCards];
    }

    if (selectedPackage && hiddenPackageCards.some((pkg) => String(pkg.id) === String(selectedPackage.id))) {
      return [...primaryPackageCards, selectedPackage];
    }

    return primaryPackageCards;
  }, [hiddenPackageCards, primaryPackageCards, selectedPackage, showMorePackages]);

  useEffect(() => {
    setShowMorePackages(false);
    setExpandedPackageId(null);
  }, [rentalType]);

  const activeProvider = useMemo(() => {
    return PublicCatalogService.getCertifiedFleetProviderByCity(currentListing?.location?.city || 'Tangier');
  }, [currentListing?.location?.city]);

  const switchVehicle = (nextVehicleId) => {
    if (!nextVehicleId || String(nextVehicleId) === String(activeVehicleId)) return;
    const currentIndex = vehicleChoices.findIndex((item) => String(item.id) === String(activeVehicleId));
    const nextIndex = vehicleChoices.findIndex((item) => String(item.id) === String(nextVehicleId));
    setVehicleDirection(nextIndex > currentIndex ? 1 : -1);
    setVehicleTransitioning(true);
    setActiveVehicleId(nextVehicleId);
    setShowVehicleDetails(false);
    setShowMorePackages(false);
    setExpandedPackageId(null);
    const nextSearch = new URLSearchParams(searchParams);
    clearPackageSearchParams(nextSearch);
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
    const next = new URLSearchParams(searchParams);
    next.set('rentalType', value);
    clearPackageSearchParams(next);
    setHasInteractedWithDuration(false);
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleSelectPackage = (pkg) => {
    const next = new URLSearchParams(searchParams);
    next.set('rentalType', rentalType);
    clearPackageSearchParams(next);
    next.set('packageId', pkg.id);
    next.set('durationUnits', String(getSelectedDurationForPackage(pkg)));
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleSelectDurationUnits = (units) => {
    const safeUnits = Math.max(units === 0.5 ? 0.5 : 1, Number(units || 1));
    setHasInteractedWithDuration(true);
    setSelectedDurationUnits(safeUnits);
    const next = new URLSearchParams(searchParams);
    next.set('rentalType', rentalType);
    next.set('durationUnits', String(safeUnits));
    if (rentalType === 'hourly' && safeUnits === 0.5 && halfHourPackage) {
      clearPackageSearchParams(next);
      next.set('packageId', String(halfHourPackage.id));
    } else if (selectedPackage && (isHalfHourPackage(selectedPackage) || isHalfDayPackage(selectedPackage))) {
      if (standardDurationPackage) {
        clearPackageSearchParams(next);
        next.set('packageId', String(standardDurationPackage.id));
      } else {
        clearPackageSearchParams(next);
      }
    }
    if (next.toString() !== currentSearchString) {
      setSearchParams(next, { replace: true });
    }
  };

  const handleBookSelectedPackage = () => {
    if (!selectedPackage) return;
    const next = new URLSearchParams();
    next.set('rentalType', rentalType);
    next.set('packageId', selectedPackage.id);
    next.set('packageName', formatPackageDisplayName(selectedPackage, rentalType, tr));
    next.set('packageAmount', String(getEffectivePackagePrice(selectedPackage)));
    next.set('packageKind', selectedPackage.kind || '');
    next.set('durationUnits', String(getSelectedDurationForPackage(selectedPackage)));
    if (currentListing?.location?.city) {
      next.set('city', currentListing.location.city);
    }
    if (selectedPackage.includedKilometers) {
      next.set('includedKilometers', String(selectedPackage.includedKilometers));
    }
    if (selectedPackage.extraKmRate) {
      next.set('extraKmRate', String(selectedPackage.extraKmRate));
    }
    navigate(`/rent/${currentListing.id}/book?${next.toString()}`);
  };

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
        shareParams.set('packageName', formatPackageDisplayName(selectedPackage, rentalType, tr));
        shareParams.set('packageAmount', String(getEffectivePackagePrice(selectedPackage)));
        shareParams.set('packageKind', selectedPackage.kind || '');

        const packageDuration = String(getSelectedDurationForPackage(selectedPackage));
        if (packageDuration) {
          shareParams.set('durationUnits', packageDuration);
        }

        if (selectedPackage.includedKilometers) {
          shareParams.set('includedKilometers', String(selectedPackage.includedKilometers));
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
  }), [isFrench]);

  const conditionsRows = useMemo(() => ([
    {
      key: 'deposit',
      label: tr('Damage deposit', 'Caution'),
      value: `${currentListing?.depositAmount || 0} ${currentListing?.currencyCode || 'MAD'}`,
      infoKey: 'deposit',
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
  ]), [currentListing, activeProvider.providerName, isFrench]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_40%,#ffffff_100%)]">
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
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_40%,#ffffff_100%)]">
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_40%,#ffffff_100%)]">
      <PublicSiteChrome current="rent" />
      <div className="px-6 py-10">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareListing}
              disabled={isSharing}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={tr('Share this vehicle', 'Partager ce véhicule')}
            >
              <Share2 className="h-4 w-4 text-emerald-700" />
              <span>{isSharing ? tr('Preparing...', 'Préparation...') : tr('Share', 'Partager')}</span>
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
        </div>

        <section className="mx-auto max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[2rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2.4rem]">
                  {displayModel}
                </p>
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
                  className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur transition hover:bg-white disabled:opacity-30"
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
                  className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur transition hover:bg-white disabled:opacity-30"
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
                {tr('Choose your package', 'Choisissez votre forfait')}
              </h2>
              <p className="mt-3 text-sm font-medium text-slate-500">
                {currentListing.isAvailable ? tr('Available now', 'Disponible maintenant') : tr('Currently unavailable', 'Actuellement indisponible')}
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
                    : normalizedSelectedDurationUnits === units && !(selectedPackage && isHalfHourPackage(selectedPackage));
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
              {visiblePackageCards.map((pkg) => {
                const isSelected = selectedPackage?.id === pkg.id;
                const isExpanded = expandedPackageId === pkg.id;
                const label = isPromoPackage(pkg, rentalType)
                  ? tr('Most popular', 'Le plus populaire')
                  : isHalfDayPackage(pkg)
                    ? tr('Best value', 'Meilleur choix')
                    : null;

                return (
                  <div
                    key={pkg.id}
                    onClick={() => handleSelectPackage(pkg)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectPackage(pkg);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    className={`w-full rounded-[24px] border p-4 text-left transition active:scale-[0.98] ${
                      isSelected
                        ? 'border-violet-500 bg-violet-50/60 shadow-[0_18px_40px_rgba(108,92,231,0.12)]'
                        : 'border-slate-200 bg-white shadow-sm hover:border-violet-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatPackageDisplayName(pkg, rentalType, tr)}
                        </p>
                        <p className="mt-3 text-2xl font-black leading-none text-slate-950">
                          {getEffectivePackagePrice(pkg)} {currentListing.currencyCode}
                        </p>
                        {label ? (
                          <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
                            isPromoPackage(pkg, rentalType)
                              ? 'bg-[linear-gradient(135deg,#ef4444_0%,#f97316_100%)] text-white'
                              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          }`}>
                            {isPromoPackage(pkg, rentalType) ? <BadgePercent className="h-3.5 w-3.5" /> : null}
                            {isPromoPackage(pkg, rentalType) ? `🔥 ${label}` : label}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                          {rentalType === 'hourly' ? tr('Hourly', 'Par heure') : tr('Daily', 'Par jour')}
                        </span>
                        {isSelected ? (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm text-slate-600">
                        {tr('Includes: fuel • helmet • insurance', 'Comprend : carburant • casque • assurance')}
                      </p>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedPackageId((current) => (current === pkg.id ? null : pkg.id));
                        }}
                        className="mt-2 text-sm font-semibold text-violet-700"
                      >
                        {isExpanded ? tr('details ↑', 'détails ↑') : tr('details ↓', 'détails ↓')}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span>{tr('Registration', 'Immatriculation')}</span>
                            <span className="font-semibold text-slate-900">{tr('Included', 'Inclus')}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>{tr('RC insurance', 'Assurance RC')}</span>
                            <span className="font-semibold text-slate-900">{tr('Included', 'Inclus')}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>{tr('Helmet', 'Casque')}</span>
                            <span className="font-semibold text-slate-900">{tr('Included', 'Inclus')}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>{tr('Fuel', 'Carburant')}</span>
                            <span className="font-semibold text-slate-900">
                              {rentalType === 'daily' ? tr('Not included', 'Non inclus') : tr('Included', 'Inclus')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>{tr('Included km', 'Km inclus')}</span>
                            <span className="font-semibold text-slate-900">{getDisplayedIncludedKilometers(pkg)}</span>
                          </div>
                          {pkg.kind !== 'unlimited' ? (
                            <div className="flex items-center justify-between gap-3">
                              <span>{tr('Extra km cost', 'Coût km supplémentaire')}</span>
                              <span className="font-semibold text-slate-900">{pkg.extraKmRate} MAD/km</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
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
        <div className="mx-auto max-w-2xl">
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
              : tr('Select a package ↑', 'Sélectionnez un forfait ↑')}
          </button>
        </div>
      </div>
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
                {tr('• Verified pricing and package rules', '• Tarifs et règles de forfait vérifiés')}
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
