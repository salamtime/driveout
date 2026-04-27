import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CarFront, Check, ChevronLeft, ChevronRight, CirclePlus, Info, SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PublicCatalogService from '../services/PublicCatalogService';
import DynamicPricingService from '../services/DynamicPricingService';
import PublicBookingService from '../services/PublicBookingService';
import CustomerExperienceService from '../services/CustomerExperienceService';
import { useAuth } from '../contexts/AuthContext';
import { resolveManagedAccountType } from '../utils/accountType';
import PublicListingCard from '../components/public/PublicListingCard';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import PublicSiteFooter from '../components/public/PublicSiteFooter';
import { buildInstantBookingHref } from '../utils/publicBookingFlow';
import { formatRentalPackageAllowanceLabel } from '../utils/rentalPackageLabels';
import { resolveReturnPath } from '../utils/navigationReturn';
import { markMarketplaceListingRequested } from '../utils/marketplaceRequestCache';

const LAST_OWNER_VEHICLE_ID_KEY = 'saharax_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'saharax_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'saharax_owner_vehicle_ids';

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const getKnownOwnerVehicleCount = (userId = '') => {
  if (typeof window === 'undefined') return 0;

  try {
    const savedCount = Number.parseInt(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId)) || '0',
      10
    );
    const savedIds = JSON.parse(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId)) || '[]'
    );
    const idCount = Array.isArray(savedIds) ? savedIds.map((item) => String(item || '').trim()).filter(Boolean).length : 0;
    const hasLastVehicle = Boolean(
      String(window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, userId)) || '').trim()
    );
    return Math.max(Number.isFinite(savedCount) ? savedCount : 0, idCount, hasLastVehicle ? 1 : 0);
  } catch {
    return 0;
  }
};

const ListVehicleIcon = ({ className = '' }) => (
  <span className={`relative inline-flex ${className}`}>
    <CarFront className="h-full w-full" />
    <span className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
      <CirclePlus className="h-3.5 w-3.5 text-violet-600" />
    </span>
  </span>
);

const CERTIFIED_BADGE_SRC =
  '/images/certified-badge.png';
const SEGWAY_LOGO_SRC = '/images/segway-logo.jpg';
const rentalTypeOptions = [
  { value: 'hourly', label: 'Hourly', labelFr: 'Par heure' },
  { value: 'daily', label: 'Daily', labelFr: 'Par jour' },
];

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizePackageDisplayPrice = (amount) => {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;
  const rounded = Math.round(numericAmount);
  const lastDigit = rounded % 10;
  return lastDigit === 9 ? rounded : rounded + (9 - lastDigit);
};

const isHalfDayPackage = (pkg) => /half[\s-]?day/i.test(String(pkg?.name || '')) || /demi[\s-]?journ/i.test(String(pkg?.name || ''));
const isHalfHourPackage = (pkg) =>
  /half[\s-]?hour/i.test(String(pkg?.name || '')) ||
  /30[\s-]?(min|minute|minutes)/i.test(String(pkg?.name || ''));

const getPackageDisplayName = (pkg, rentalType) => formatRentalPackageAllowanceLabel(pkg, { rentalType });

const getPrimaryHourlyPackages = (packages = []) => {
  const standard = packages.filter((pkg) => !isHalfHourPackage(pkg) && pkg?.kind !== 'unlimited');
  return standard.slice(0, 3);
};

const getPrimaryDailyPackages = (packages = []) => {
  const limited = packages.filter((pkg) => pkg?.kind !== 'unlimited');
  return limited.slice(0, 3);
};

const getHiddenHourlyPackages = (packages = [], primary = []) => {
  const primaryIds = new Set(primary.map((pkg) => String(pkg.id)));
  return packages.filter((pkg) => !primaryIds.has(String(pkg.id)));
};

const getPackageBadgeLabel = (pkg) => {
  const kilometers = Number(pkg?.includedKilometers || 0);
  if ([15, 17].includes(kilometers)) return 'Most popular';
  if (isHalfDayPackage(pkg)) return 'Best value';
  return null;
};

const getSelectedDurationForPackage = (pkg, selectedDurationUnits) =>
  isHalfHourPackage(pkg)
    ? 0.5
    : isHalfDayPackage(pkg)
      ? 4
      : Math.max(1, Number(selectedDurationUnits || pkg?.durationUnits || 1) || 1);

const getEffectivePackagePrice = (listing, pkg, rentalType, selectedDurationUnits, durationUnitPrices) => {
  const basePackagePrice = Number(pkg?.fixedAmount || 0);

  if (isHalfHourPackage(pkg) || isHalfDayPackage(pkg)) {
    return normalizePackageDisplayPrice(basePackagePrice);
  }

  const duration = getSelectedDurationForPackage(pkg, selectedDurationUnits);

  if (pkg?.kind === 'unlimited') {
    if (basePackagePrice > 0) {
      return normalizePackageDisplayPrice(basePackagePrice * duration);
    }

    const unitPrice = Number(durationUnitPrices?.[String(listing.id)]?.[duration] || 0);
    const fallbackUnitPrice = rentalType === 'daily'
      ? Number(listing?.dailyPrice || 0)
      : Number(listing?.hourlyPrice || 0);
    const resolvedUnitPrice = unitPrice > 0 ? unitPrice : fallbackUnitPrice;
    return resolvedUnitPrice > 0 ? normalizePackageDisplayPrice(resolvedUnitPrice * duration) : 0;
  }

  return basePackagePrice > 0 ? normalizePackageDisplayPrice(basePackagePrice * duration) : 0;
};

const getDisplayedIncludedKilometers = (pkg, selectedDurationUnits) => {
  if (pkg?.kind === 'unlimited') return 'Unlimited KM';

  const baseKilometers = Number(pkg?.includedKilometers || 0);
  if (!isHalfDayPackage(pkg) && !isHalfHourPackage(pkg)) {
    return `${baseKilometers * getSelectedDurationForPackage(pkg, selectedDurationUnits)} km`;
  }

  return `${baseKilometers} km`;
};

const groupModelListings = (listings = []) => {
  const grouped = new Map();

  listings.forEach((listing) => {
    const key = [
      listing.vehicleModelId || listing.model || listing.title,
      listing.location?.city || 'city',
    ].join('::');

    const existing = grouped.get(key);

    if (!existing) {
        grouped.set(key, {
          ...listing,
          title: listing.model || listing.title,
          shortSpec: '',
          availableCount: listing.isAvailable ? 1 : 0,
          totalModelCount: 1,
          isAvailable: Boolean(listing.isAvailable),
          detailHref: `/rent/${listing.id}${listing.location?.city ? `?city=${encodeURIComponent(listing.location.city)}` : ''}`,
          bookingHref: buildInstantBookingHref(listing, { city: listing.location?.city }),
        });
      return;
    }

    existing.totalModelCount = (existing.totalModelCount || 1) + 1;
    existing.availableCount += listing.isAvailable ? 1 : 0;
    existing.isAvailable = Boolean(existing.isAvailable || listing.isAvailable);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftModel = String(left.model || left.title || '').toLowerCase();
    const rightModel = String(right.model || right.title || '').toLowerCase();
    return leftModel.localeCompare(rightModel);
  });
};

const PublicCatalog = ({ embeddedInAccount = false, accountBasePath = '/account/marketplace' }) => {
  const { i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile, startPrivateOwnerSetup } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState({
    listings: [],
    featuredListings: [],
    filters: {
      brands: [],
      countries: [],
      cities: [],
      areas: [],
      categories: [],
    },
    regionalSummary: {
      defaultCurrency: 'MAD',
      supportedLanguages: ['EN', 'FR', 'AR'],
      countries: [],
      citiesCount: 0,
      areasCount: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCertifiedInfo, setShowCertifiedInfo] = useState(false);
  const [expandedVehicleIds, setExpandedVehicleIds] = useState({});
  const [expandedPackageKeys, setExpandedPackageKeys] = useState({});
  const [showMorePackagesByVehicle, setShowMorePackagesByVehicle] = useState({});
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [rentalType, setRentalType] = useState('hourly');
  const [selectedDurationUnits, setSelectedDurationUnits] = useState(1);
  const [durationUnitPrices, setDurationUnitPrices] = useState({});
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [vehicleDirection, setVehicleDirection] = useState(0);
  const [vehicleTransitioning, setVehicleTransitioning] = useState(false);
  const [showMarketplaceFilters, setShowMarketplaceFilters] = useState(false);
  const [existingMarketplaceRequests, setExistingMarketplaceRequests] = useState({});
  const touchStartXRef = useRef(null);
  const isMarketplacePage = location.pathname.startsWith('/marketplace') || location.pathname.startsWith(accountBasePath);
  const backLink = useMemo(
    () => resolveReturnPath(location, '/website'),
    [location]
  );
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const managedAccountType = resolveManagedAccountType({
    account_type:
      userProfile?.accountType ||
      user?.user_metadata?.account_type ||
      user?.app_metadata?.account_type ||
      '',
    data_source:
      userProfile?.dataSource ||
      user?.user_metadata?.account_source ||
      user?.app_metadata?.account_source ||
      '',
  });
  const knownOwnerVehicleCount = useMemo(() => getKnownOwnerVehicleCount(user?.id), [user?.id]);
  const showListVehicleCta =
    embeddedInAccount &&
    isMarketplacePage &&
    managedAccountType !== 'business_owner' &&
    knownOwnerVehicleCount === 0;

  useEffect(() => {
    let active = true;

    const loadExistingMarketplaceRequests = async () => {
      if (!isMarketplacePage || !(userProfile?.id || user?.id)) {
        setExistingMarketplaceRequests({});
        return;
      }

      try {
        const [publicRows, customerRows] = await Promise.all([
          PublicBookingService.getExistingMarketplaceRequests().catch(() => []),
          user?.id || user?.email
            ? CustomerExperienceService.getCustomerMarketplaceRequests(user).catch(() => [])
            : Promise.resolve([]),
        ]);
        if (!active) return;

        const nextMap = {};
        const rows = [...(Array.isArray(publicRows) ? publicRows : []), ...(Array.isArray(customerRows) ? customerRows : [])];

        rows.forEach((row) => {
          const rawListingId = String(row?.listing_id || '').trim();
          const normalizedListingId = String(row?.listingId || '').trim();
          const vehiclePublicProfileId = String(row?.vehicle_public_profile_id || '').trim();
          const normalizedVehiclePublicProfileId = String(row?.vehiclePublicProfileId || '').trim();

          if (rawListingId) {
            nextMap[rawListingId] = row;
            nextMap[`marketplace-${rawListingId}`] = row;
          }

          if (normalizedListingId) {
            nextMap[normalizedListingId] = row;
            nextMap[`marketplace-${normalizedListingId}`] = row;
          }

          if (vehiclePublicProfileId) {
            nextMap[vehiclePublicProfileId] = row;
          }

          if (normalizedVehiclePublicProfileId) {
            nextMap[normalizedVehiclePublicProfileId] = row;
          }
        });

        const cacheIdentities = [
          userProfile?.id || '',
          user?.id || '',
          userProfile?.email || '',
          user?.email || '',
        ]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean);

        rows.forEach((row) => {
          const cacheListingIds = [
            row?.listing_id,
            row?.listingId,
            row?.vehicle_public_profile_id,
            row?.vehiclePublicProfileId,
            row?.listingId,
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean);

          cacheIdentities.forEach((identity) => {
            cacheListingIds.forEach((listingKey) => {
              markMarketplaceListingRequested({
                userId: identity,
                listingId: listingKey,
                requestId: row?.id,
                status: row?.request_status || row?.requestStatus || 'requested',
              });
            });
          });
        });

        setExistingMarketplaceRequests(nextMap);
      } catch {
        if (active) {
          setExistingMarketplaceRequests({});
        }
      }
    };

    void loadExistingMarketplaceRequests();

    return () => {
      active = false;
    };
  }, [isMarketplacePage, user?.id, userProfile?.id]);

  const filters = useMemo(
    () => ({
      flow: isMarketplacePage ? 'request' : 'instant',
      category: searchParams.get('category') || 'all',
      source: isMarketplacePage ? 'marketplace' : 'certified_fleet',
      brand: searchParams.get('brand') || 'all',
      city: searchParams.get('city') || 'all',
      priceRange: searchParams.get('priceRange') || 'all',
      search: searchParams.get('search') || '',
    }),
    [isMarketplacePage, searchParams]
  );

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setLoading(true);
      setError('');

      try {
        const nextCatalog = await PublicCatalogService.getCatalog(filters);
        if (!active) return;
        setCatalog(nextCatalog);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || 'Failed to load public catalog.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      active = false;
    };
  }, [filters]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleStartOwnerSetup = () => {
    void startPrivateOwnerSetup({ source: 'account_marketplace' });
    navigate('/account/vehicles/new/profile?tab=overview', {
      state: { from: '/account/marketplace' },
    });
  };

  const certifiedCityOptions = useMemo(() => {
    return ['Tangier'];
  }, []);

  const safeCertifiedCityFilter = useMemo(() => {
    if (filters.city === 'all') return 'all';
    return filters.city === 'Tangier' ? 'Tangier' : 'all';
  }, [filters.city]);

  const activeCertifiedFleetProvider = useMemo(() => {
    const city = safeCertifiedCityFilter === 'all' ? 'Tangier' : safeCertifiedCityFilter;
    return PublicCatalogService.getCertifiedFleetProviderByCity(city);
  }, [safeCertifiedCityFilter]);

  const marketplaceListings = useMemo(() => {
    return catalog.listings
      .filter((listing) => listing.inventorySource === 'marketplace')
      .filter((listing) => {
        if (filters.city !== 'all' && String(listing.location?.city || '').toLowerCase() !== String(filters.city).toLowerCase()) {
          return false;
        }
        if (filters.brand !== 'all') {
          const listingType = String(listing.brand || listing.category || '').toLowerCase();
          if (listingType !== String(filters.brand).toLowerCase()) {
            return false;
          }
        }

        const listingPrice = Number(listing.dailyPrice || listing.halfDayPrice || listing.priceFrom || 0);
        if (filters.priceRange === 'under-1000') return listingPrice > 0 && listingPrice < 1000;
        if (filters.priceRange === '1000-2000') return listingPrice >= 1000 && listingPrice <= 2000;
        if (filters.priceRange === '2000-plus') return listingPrice > 2000;
        return true;
      });
  }, [catalog.listings, filters.brand, filters.city, filters.priceRange]);

  const visibleListings = useMemo(() => {
    if (filters.flow !== 'instant') {
      return marketplaceListings;
    }

    const certified = catalog.listings.filter((listing) => listing.inventorySource === 'certified_fleet');
    const previewSeed =
      certified.length > 0
        ? certified
        : catalog.featuredListings
            .filter((listing) => listing.inventorySource === 'certified_fleet')
            .map((listing) => ({
              ...listing,
              location: {
                ...listing.location,
                city: safeCertifiedCityFilter === 'all' ? listing.location?.city : safeCertifiedCityFilter,
                area: safeCertifiedCityFilter === 'all' ? listing.location?.area : safeCertifiedCityFilter,
                label: safeCertifiedCityFilter === 'all' ? listing.location?.label : safeCertifiedCityFilter,
              },
            }));

    return groupModelListings(previewSeed);
  }, [catalog.featuredListings, catalog.listings, marketplaceListings, safeCertifiedCityFilter, filters.flow]);

  const certifiedCitySections = useMemo(() => {
    if (filters.flow !== 'instant') return [];

    const cities = certifiedCityOptions.filter((city) => city !== 'all');
    const certifiedListings = catalog.listings.filter((listing) => listing.inventorySource === 'certified_fleet');
    const featuredCertified = catalog.featuredListings.filter(
      (listing) => listing.inventorySource === 'certified_fleet'
    );

    const sectionCities = safeCertifiedCityFilter === 'all' ? cities : [safeCertifiedCityFilter];

    return sectionCities
      .map((city) => {
        const cityListings = certifiedListings.filter(
          (listing) => (listing.location?.city || '').toLowerCase() === city.toLowerCase()
        );
        const seededListings = cityListings.length > 0
          ? cityListings
          : featuredCertified.map((listing) => ({
              ...listing,
              location: {
                ...listing.location,
                city,
                area: city,
                label: city,
              },
            }));

        return {
          city,
          provider: PublicCatalogService.getCertifiedFleetProviderByCity(city),
          listings: groupModelListings(seededListings),
        };
      })
      .filter((section) => section.listings.length > 0);
  }, [catalog.featuredListings, catalog.listings, certifiedCityOptions, safeCertifiedCityFilter, filters.flow]);

  const renderedCertifiedSections = useMemo(() => {
    if (isMarketplacePage) return [];
    if (safeCertifiedCityFilter === 'all') return certifiedCitySections;

    return [
      {
        city: safeCertifiedCityFilter,
        provider: activeCertifiedFleetProvider,
        listings: visibleListings,
      },
    ].filter((section) => section.listings.length > 0);
  }, [
    activeCertifiedFleetProvider,
    certifiedCitySections,
    safeCertifiedCityFilter,
    isMarketplacePage,
    visibleListings,
  ]);

  const qrVehicleSections = useMemo(() => {
    if (isMarketplacePage) return [];
    return visibleListings.map((listing) => {
      const activePackages = Array.isArray(listing?.packageCatalog?.[rentalType]) ? listing.packageCatalog[rentalType] : [];
      const primaryPackages = rentalType === 'hourly'
        ? getPrimaryHourlyPackages(activePackages)
        : getPrimaryDailyPackages(activePackages);
      const hiddenPackages = getHiddenHourlyPackages(activePackages, primaryPackages);
      return {
        ...listing,
        activePackages,
        primaryPackages,
        hiddenPackages,
      };
    });
  }, [isMarketplacePage, rentalType, visibleListings]);

  useEffect(() => {
    if (isMarketplacePage || qrVehicleSections.length === 0) {
      setSelectedVehicleId(null);
      return;
    }

    if (selectedVehicleId && qrVehicleSections.some((section) => String(section.id) === String(selectedVehicleId))) {
      return;
    }

    const at6First = qrVehicleSections.find((section) => String(section.model || '').toUpperCase() === 'AT6');
    setSelectedVehicleId(at6First?.id || qrVehicleSections[0]?.id || null);
  }, [isMarketplacePage, qrVehicleSections, selectedVehicleId]);

  const activeVehicle = useMemo(
    () => qrVehicleSections.find((section) => String(section.id) === String(selectedVehicleId)) || qrVehicleSections[0] || null,
    [qrVehicleSections, selectedVehicleId]
  );

  const selectedVehicle = useMemo(
    () => qrVehicleSections.find((section) => String(section.id) === String(selectedChoice?.listingId)) || null,
    [qrVehicleSections, selectedChoice?.listingId]
  );

  const selectedPackage = useMemo(() => {
    if (!selectedVehicle || !selectedChoice?.packageId) return null;
    return (selectedVehicle.packageCatalog?.[rentalType] || []).find((pkg) => String(pkg.id) === String(selectedChoice.packageId)) || null;
  }, [rentalType, selectedChoice?.packageId, selectedVehicle]);

  useEffect(() => {
    let cancelled = false;

    const loadDurationPrices = async () => {
      if (isMarketplacePage || qrVehicleSections.length === 0) {
        setDurationUnitPrices({});
        return;
      }

      try {
        const nextEntries = await Promise.all(
          qrVehicleSections.map(async (listing) => {
            const durations = rentalType === 'hourly' ? [1, 2, 3] : [1, 2, 3];
            const priceRows = await Promise.all(
              durations.map(async (units) => {
                if (rentalType === 'daily') {
                  const pricing = await DynamicPricingService.getPricingForDuration(listing.vehicleModelId, units);
                  return [units, Number(pricing?.price || 0)];
                }

                const price = await DynamicPricingService.getDynamicPrice(listing.sourceId, 'hourly', units);
                return [units, Number(price || 0)];
              })
            );
            return [String(listing.id), Object.fromEntries(priceRows)];
          })
        );

        if (!cancelled) {
          setDurationUnitPrices(Object.fromEntries(nextEntries));
        }
      } catch (_error) {
        if (!cancelled) {
          setDurationUnitPrices({});
        }
      }
    };

    loadDurationPrices();

    return () => {
      cancelled = true;
    };
  }, [isMarketplacePage, qrVehicleSections, rentalType]);

  useEffect(() => {
    if (!selectedChoice) return;
    const exists = qrVehicleSections.some((section) =>
      String(section.id) === String(selectedChoice.listingId) &&
      section.activePackages.some((pkg) => String(pkg.id) === String(selectedChoice.packageId))
    );

    if (!exists) {
      setSelectedChoice(null);
    }
  }, [qrVehicleSections, selectedChoice]);

  useEffect(() => {
    if (!selectedChoice || rentalType !== 'hourly') return;

    const matchingVehicle = qrVehicleSections.find((section) => String(section.id) === String(selectedChoice.listingId));
    if (!matchingVehicle) return;

    const matchingPackage = matchingVehicle.activePackages.find((pkg) => String(pkg.id) === String(selectedChoice.packageId));
    if (!matchingPackage) return;

    const shouldBeHalfHour = selectedDurationUnits === 0.5;
    const isSelectedHalfHour = isHalfHourPackage(matchingPackage);

    if (shouldBeHalfHour !== isSelectedHalfHour) {
      setSelectedChoice(null);
    }
  }, [qrVehicleSections, rentalType, selectedChoice, selectedDurationUnits]);

  const marketplaceCityOptions = useMemo(
    () => ['all', ...catalog.filters.cities.filter(Boolean)],
    [catalog.filters.cities]
  );

  const marketplaceVehicleTypeOptions = useMemo(() => {
    const rawOptions = catalog.filters.categories?.length
      ? catalog.filters.categories
      : catalog.filters.brands;

    return ['all', ...(rawOptions || []).filter(Boolean).filter((value) => String(value).toLowerCase() !== 'unknown')];
  }, [catalog.filters.brands, catalog.filters.categories]);

  const marketplacePriceOptions = useMemo(
    () => ([
      { value: 'all', label: tr('All prices', 'Tous les prix') },
      { value: 'under-1000', label: tr('Under 1,000 MAD', 'Moins de 1 000 MAD') },
      { value: '1000-2000', label: tr('1,000–2,000 MAD', '1 000–2 000 MAD') },
      { value: '2000-plus', label: tr('2,000+ MAD', '2 000+ MAD') },
    ]),
    [tr]
  );

  const marketplaceVehicleTypeLabel = useMemo(() => {
    if (filters.brand !== 'all') return filters.brand;
    const firstType = marketplaceVehicleTypeOptions.find((value) => value !== 'all');
    return firstType || tr('Vehicle type', 'Type de véhicule');
  }, [filters.brand, marketplaceVehicleTypeOptions, tr]);

  const marketplaceCityLabel = filters.city === 'all' ? tr('Tangier', 'Tanger') : filters.city;
  const marketplaceResultsLabel = tr(
    `${visibleListings.length} vehicle${visibleListings.length === 1 ? '' : 's'} available`,
    `${visibleListings.length} véhicule${visibleListings.length === 1 ? '' : 's'} disponible${visibleListings.length === 1 ? '' : 's'}`
  );
  const marketplaceHeading = `${marketplaceVehicleTypeLabel} ${tr('in', 'à')} ${marketplaceCityLabel}`;

  const handleSelectPackage = (listing, pkg) => {
    setSelectedChoice({
      listingId: listing.id,
      packageId: pkg.id,
    });
  };

  const switchVehicle = (nextVehicleId) => {
    if (!nextVehicleId || String(nextVehicleId) === String(selectedVehicleId)) return;
    const currentIndex = qrVehicleSections.findIndex((section) => String(section.id) === String(selectedVehicleId));
    const nextIndex = qrVehicleSections.findIndex((section) => String(section.id) === String(nextVehicleId));
    setVehicleDirection(nextIndex > currentIndex ? 1 : -1);
    setVehicleTransitioning(true);
    setSelectedVehicleId(nextVehicleId);
    setSelectedChoice(null);
    setTimeout(() => setVehicleTransitioning(false), 220);
  };

  const switchVehicleByOffset = (offset) => {
    if (!activeVehicle || qrVehicleSections.length <= 1) return;
    const currentIndex = qrVehicleSections.findIndex((section) => String(section.id) === String(activeVehicle.id));
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= qrVehicleSections.length) return;
    switchVehicle(qrVehicleSections[nextIndex].id);
  };

  const handleContinueBooking = () => {
    if (!selectedVehicle || !selectedPackage) return;

    const next = new URLSearchParams();
    next.set('rentalType', rentalType);
    next.set('packageId', selectedPackage.id);
    next.set('packageName', getPackageDisplayName(selectedPackage, rentalType));
    next.set('packageAmount', String(getEffectivePackagePrice(selectedVehicle, selectedPackage, rentalType, selectedDurationUnits, durationUnitPrices)));
    next.set('packageKind', selectedPackage.kind || '');
    next.set('durationUnits', String(getSelectedDurationForPackage(selectedPackage, selectedDurationUnits)));
    if (selectedVehicle.location?.city) {
      next.set('city', selectedVehicle.location.city);
    }
    if (selectedPackage.includedKilometers) {
      next.set('includedKilometers', String(selectedPackage.includedKilometers));
    }
    if (selectedPackage.extraKmRate) {
      next.set('extraKmRate', String(selectedPackage.extraKmRate));
    }

    navigate(`/rent/${selectedVehicle.id}/book?${next.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)]">
      {!embeddedInAccount ? <PublicSiteChrome current={isMarketplacePage ? 'marketplace' : 'rent'} /> : null}
      <main className={`mx-auto ${isMarketplacePage ? 'max-w-7xl' : 'max-w-3xl'} px-4 py-4 sm:px-6 sm:py-6`}>
        <section className="space-y-4">
          {!embeddedInAccount && backLink ? (
            <button
              type="button"
              onClick={() => navigate(backLink)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}

          {isMarketplacePage ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100">
                  {marketplaceCityLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100">
                  {String(marketplaceVehicleTypeLabel).toLowerCase().includes('segway') ? (
                    <img
                      src={SEGWAY_LOGO_SRC}
                      alt={marketplaceVehicleTypeLabel}
                      className="h-5 w-auto object-contain"
                    />
                  ) : null}
                  <span>{marketplaceVehicleTypeLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMarketplaceFilters(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>{tr('Filters', 'Filtres')}</span>
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="mt-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">
                {isMarketplacePage ? 'Marketplace' : 'Certified fleet rentals'}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                {loading
                  ? 'Loading available vehicles...'
                  : isMarketplacePage
                    ? marketplaceHeading
                    : safeCertifiedCityFilter === 'all'
                      ? `${renderedCertifiedSections.length} cities live`
                      : `${visibleListings.length} models ready`}
              </h2>
              {isMarketplacePage && !loading ? (
                <p className="mt-2 text-sm text-slate-500">{marketplaceResultsLabel}</p>
              ) : null}
            </div>
            {showListVehicleCta ? (
              <button
                type="button"
                onClick={handleStartOwnerSetup}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(79,70,229,0.18)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(79,70,229,0.22)] active:translate-y-0 active:scale-[0.99]"
              >
                <ListVehicleIcon className="h-4 w-4" />
                {tr('List your vehicle', 'Louer votre véhicule')}
              </button>
            ) : null}
            {!isMarketplacePage && (
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100">
                  <img
                    src={CERTIFIED_BADGE_SRC}
                    alt="Certified fleet"
                    className="h-6 w-6 object-contain"
                  />
                  <span>Certified Fleet</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowCertifiedInfo(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-violet-700 shadow-sm ring-1 ring-violet-200 transition hover:bg-violet-50"
                  aria-label="What certified fleet means"
                >
                  i
                </button>
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-6 py-8 text-rose-700">
              {error}
            </div>
          ) : loading ? (
            <div className={`grid gap-4 ${isMarketplacePage ? 'grid-cols-1 sm:grid-cols-2 xl:gap-8' : 'grid-cols-2 lg:grid-cols-3 xl:gap-6'}`}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-[290px] animate-pulse rounded-[28px] border border-slate-200 bg-white sm:h-[340px] lg:h-[420px]" />
              ))}
            </div>
          ) : visibleListings.length === 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">{tr('More vehicles coming soon', 'Plus de véhicules bientôt disponibles')}</h3>
              <p className="mt-2 text-slate-600">
                {tr('Try adjusting filters.', 'Essayez d’ajuster les filtres.')}
              </p>
              <button
                type="button"
                onClick={() => setSearchParams({}, { replace: true })}
                className="mt-5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white"
              >
                {tr('Reset filters', 'Réinitialiser les filtres')}
              </button>
            </div>
          ) : (
            <>
              {!isMarketplacePage ? (
                <div className="space-y-6 pb-28">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-400">
                      Tangier • Segway • Certified
                    </p>
                    <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-950 sm:text-[1.5rem]">
                      Choose your ride
                    </h1>
                    <div className="flex flex-wrap gap-3 pt-1">
                      {rentalTypeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setRentalType(option.value);
                            setSelectedDurationUnits(1);
                          }}
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
                    <div className="flex flex-wrap gap-2">
                      {(rentalType === 'hourly' ? [0.5, 1, 2, 3] : [1, 2, 3]).map((units) => {
                        const selected = selectedDurationUnits === units;
                        return (
                          <button
                            key={`${rentalType}-${units}`}
                            type="button"
                            onClick={() => setSelectedDurationUnits(units)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              selected
                                ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {rentalType === 'hourly' && units === 0.5
                              ? '30 min'
                              : `${units} ${rentalType === 'daily'
                                  ? (units === 1 ? 'day' : 'days')
                                  : (units === 1 ? 'hour' : 'hours')}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {qrVehicleSections.length > 1 ? (
                    <div className="space-y-3">
                      <div className="inline-flex w-full rounded-full border border-violet-100 bg-white p-1 shadow-sm">
                        {qrVehicleSections.map((vehicle) => (
                          <button
                            key={vehicle.id}
                            type="button"
                            onClick={() => switchVehicle(vehicle.id)}
                            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                              String(activeVehicle?.id) === String(vehicle.id)
                                ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {vehicle.model || vehicle.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeVehicle ? (() => {
                    const listing = activeVehicle;
                    const activeVehicleIndex = qrVehicleSections.findIndex((section) => String(section.id) === String(listing.id));
                    const canShowVehicleArrows = qrVehicleSections.length > 1;
                    const canGoPreviousVehicle = activeVehicleIndex > 0;
                    const canGoNextVehicle = activeVehicleIndex >= 0 && activeVehicleIndex < qrVehicleSections.length - 1;
                    const isVehicleExpanded = Boolean(expandedVehicleIds[listing.id]);
                    const activePackages = listing.activePackages || [];
                    const halfHourPackage = activePackages.find((pkg) => isHalfHourPackage(pkg)) || null;
                    const durationScopedPrimaryPackages = rentalType === 'hourly' && selectedDurationUnits === 0.5
                      ? (halfHourPackage ? [halfHourPackage] : [])
                      : (listing.primaryPackages || []);
                    const primaryPackages = durationScopedPrimaryPackages;
                    const hiddenPackages = rentalType === 'hourly' && selectedDurationUnits === 0.5
                      ? []
                      : (listing.hiddenPackages || []);
                    const showMorePackages = Boolean(showMorePackagesByVehicle[listing.id]);
                    const packagesToRender = showMorePackages
                      ? [...primaryPackages, ...hiddenPackages]
                      : primaryPackages;

                    return (
                      <section
                        key={listing.id}
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
                        className={`relative select-none rounded-[28px] border border-violet-200 bg-white p-4 shadow-[0_18px_45px_rgba(79,70,229,0.08)] transition-all duration-200 ease-out ${
                          vehicleTransitioning
                            ? vehicleDirection > 0
                              ? '-translate-x-1 opacity-95'
                              : 'translate-x-1 opacity-95'
                            : 'translate-x-0 opacity-100'
                        }`}
                      >
                        {canShowVehicleArrows ? (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                switchVehicleByOffset(-1);
                              }}
                              disabled={!canGoPreviousVehicle}
                              className="absolute left-3 top-32 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.04] hover:bg-violet-600 hover:text-white hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)] disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100"
                              aria-label={tr('Previous vehicle', 'Véhicule précédent')}
                            >
                              <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                switchVehicleByOffset(1);
                              }}
                              disabled={!canGoNextVehicle}
                              className="absolute right-3 top-32 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.04] hover:bg-violet-600 hover:text-white hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)] disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100"
                              aria-label={tr('Next vehicle', 'Véhicule suivant')}
                            >
                              <ChevronRight className="h-5 w-5" />
                            </button>
                          </>
                        ) : null}

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-[1.2rem] font-bold tracking-tight text-slate-950">
                              {listing.model || listing.title}
                            </h2>
                            <p className="mt-2 text-sm font-medium text-slate-500">
                              {(listing.riderCapacity === 1 ? '1 rider' : `${listing.riderCapacity || 0} riders`)} • {listing.isAvailable ? 'Available now' : 'Unavailable'}
                            </p>
                          </div>
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-white shadow-sm">
                            <img
                              src={CERTIFIED_BADGE_SRC}
                              alt="Certified"
                              className="h-6 w-6 object-contain"
                            />
                          </span>
                        </div>

                        <div className="mt-4 h-40 overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,#f8f6ff_0%,#eef2ff_100%)]">
                          <img
                            src={listing.imageUrl}
                            alt={listing.title}
                            className="h-full w-full object-contain scale-[1.12]"
                          />
                        </div>

                        {canShowVehicleArrows ? (
                          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>{tr('Swipe to switch vehicle', 'Glissez pour changer de véhicule')}</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setExpandedVehicleIds((current) => ({ ...current, [listing.id]: !current[listing.id] }))}
                          className="mt-4 text-sm font-semibold text-violet-700"
                        >
                          {isVehicleExpanded ? 'View details ↑' : 'View details ↓'}
                        </button>

                        {isVehicleExpanded ? (
                          <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                            <div className="space-y-2 text-sm text-slate-700">
                              <div className="flex items-center justify-between gap-3">
                                <span>Brand</span>
                                <span className="font-semibold text-slate-900">{listing.brand}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Model</span>
                                <span className="font-semibold text-slate-900">{listing.model}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Power</span>
                                <span className="font-semibold text-slate-900">{listing.powerCcLabel || 'On request'}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span>Passengers</span>
                                <span className="font-semibold text-slate-900">{listing.riderCapacityLabel || 'On request'}</span>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 space-y-3">
                          {packagesToRender.map((pkg) => {
                            const isSelected = selectedChoice?.listingId === listing.id && String(selectedChoice?.packageId) === String(pkg.id);
                            const isExpanded = Boolean(expandedPackageKeys[`${listing.id}:${pkg.id}`]);
                            const badgeLabel = getPackageBadgeLabel(pkg);

                            return (
                              <button
                                key={pkg.id}
                                type="button"
                                onClick={() => handleSelectPackage(listing, pkg)}
                                className={`w-full rounded-[22px] border p-4 text-left transition active:scale-[0.98] ${
                                  isSelected
                                    ? 'border-violet-500 bg-violet-50/70 shadow-[0_18px_40px_rgba(108,92,231,0.12)]'
                                    : 'border-slate-200 bg-white shadow-sm hover:border-violet-300'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{getPackageDisplayName(pkg, rentalType)}</p>
                                    <p className="mt-3 text-2xl font-black leading-none text-slate-950">
                                      {getEffectivePackagePrice(listing, pkg, rentalType, selectedDurationUnits, durationUnitPrices)} {listing.currencyCode}
                                    </p>
                                    {badgeLabel ? (
                                      <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
                                        badgeLabel === 'Most popular'
                                          ? 'bg-[linear-gradient(135deg,#ef4444_0%,#f97316_100%)] text-white'
                                          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                      }`}>
                                        {badgeLabel === 'Most popular' ? <BadgePercent className="h-3.5 w-3.5" /> : null}
                                        {badgeLabel === 'Most popular' ? '🔥 Most popular' : 'Best value'}
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
                                  <p className="text-sm text-slate-600">Includes: fuel • helmet • insurance</p>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const key = `${listing.id}:${pkg.id}`;
                                      setExpandedPackageKeys((current) => ({ ...current, [key]: !current[key] }));
                                    }}
                                    className="mt-2 text-sm font-semibold text-violet-700"
                                  >
                                    {isExpanded ? 'details ↑' : 'details ↓'}
                                  </button>
                                </div>

                                {isExpanded ? (
                                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <span>Registration</span>
                                        <span className="font-semibold text-slate-900">Included</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>Insurance</span>
                                        <span className="font-semibold text-slate-900">RC insurance</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>Helmet</span>
                                        <span className="font-semibold text-slate-900">Included</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>Fuel</span>
                                        <span className="font-semibold text-slate-900">Included</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>Included km</span>
                                        <span className="font-semibold text-slate-900">
                                          {getDisplayedIncludedKilometers(pkg, selectedDurationUnits)}
                                        </span>
                                      </div>
                                      {pkg.kind !== 'unlimited' ? (
                                        <div className="flex items-center justify-between gap-3">
                                          <span>Extra km</span>
                                          <span className="font-semibold text-slate-900">{formatMoney(pkg.extraKmRate)} MAD/km</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>

                        {hiddenPackages.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setShowMorePackagesByVehicle((current) => ({ ...current, [listing.id]: !current[listing.id] }))}
                            className="mt-4 text-sm font-semibold text-violet-700"
                          >
                            {showMorePackages ? 'See fewer options' : 'See more options'}
                          </button>
                        ) : null}
                      </section>
                    );
                  })() : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:gap-8">
                  {visibleListings.map((listing) => (
                    <PublicListingCard
                      key={listing.id}
                      listing={listing}
                      embeddedInAccount={embeddedInAccount}
                      accountBasePath={accountBasePath}
                      existingRequest={
                        existingMarketplaceRequests[String(listing?.sourceId || listing?.id)] ||
                        existingMarketplaceRequests[String(listing?.id || '')] ||
                        null
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {showCertifiedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={CERTIFIED_BADGE_SRC}
                  alt="Certified fleet"
                  className="h-14 w-14 object-contain"
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">Certified fleet</p>
                  <p className="mt-1 text-sm text-slate-500">Why this badge matters</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertifiedInfo(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                aria-label="Close certified fleet information"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                • Direct booking from our managed fleet
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                • Verified pricing and package rules
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                • Pickup support from the local certified partner
              </div>
            </div>
          </div>
        </div>
      )}
      {isMarketplacePage && showMarketplaceFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-4 py-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <p className="text-lg font-semibold text-slate-900">{tr('Filters', 'Filtres')}</p>
              <button
                type="button"
                onClick={() => setShowMarketplaceFilters(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                aria-label={tr('Close filters', 'Fermer les filtres')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('City', 'Ville')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {marketplaceCityOptions.map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setFilter('city', city)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        filters.city === city
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50'
                      }`}
                    >
                      {city === 'all' ? tr('All cities', 'Toutes les villes') : city}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('Vehicle type', 'Type de véhicule')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {marketplaceVehicleTypeOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFilter('brand', type)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        filters.brand === type
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50'
                      }`}
                    >
                      {type === 'all' ? tr('All types', 'Tous les types') : type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('Price range', 'Fourchette de prix')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {marketplacePriceOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilter('priceRange', option.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        filters.priceRange === option.value
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {!embeddedInAccount ? <PublicSiteFooter /> : null}
      {!isMarketplacePage ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              onClick={selectedVehicle && selectedPackage ? handleContinueBooking : undefined}
              disabled={!selectedVehicle || !selectedPackage}
              className={`flex min-h-[56px] w-full items-center justify-center rounded-[20px] px-5 py-4 text-base font-semibold transition ${
                selectedVehicle && selectedPackage
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_18px_36px_rgba(91,33,182,0.24)]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {selectedVehicle && selectedPackage
                ? `Continue — ${getEffectivePackagePrice(selectedVehicle, selectedPackage, rentalType, selectedDurationUnits, durationUnitPrices)} ${selectedVehicle.currencyCode}`
                : 'Select a package ↑'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PublicCatalog;
