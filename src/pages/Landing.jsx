import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Instagram, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import i18n from '../i18n';
import PublicSiteChrome from '../components/public/PublicSiteChrome';
import PublicSiteFooter from '../components/public/PublicSiteFooter';
import PublicCatalogService from '../services/PublicCatalogService';
import { preloadTourPackages } from '../services/tourPackageService';
import { shortenUrl } from '../services/UrlShortenerService';
import {
  DEFAULT_STOREFRONT_TENANT_SLUG,
  getCanonicalStorefrontOrigin,
} from '../utils/storefrontHost';

const FALLBACK_CITIES = ['Tangier'];
const preloadRentRoute = () => import('./PublicRentRedirect');
const preloadToursRoute = () => import('./Tours');
const preloadMarketplaceRoute = () => import('./PublicCatalog');
const INSTAGRAM_URL = 'https://www.instagram.com/saharax.official?igsh=ZDF6ZzloOHN2c2t1';

const Landing = () => {
  useTranslation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedCity, setSelectedCity] = useState('Tangier');
  const [isSharing, setIsSharing] = useState(false);
  const warmedFlowsRef = useRef(new Set());
  const cities = FALLBACK_CITIES;
  const experienceOptions = useMemo(
    () => [
      {
        value: 'rent',
        title: tr('Rent', 'Location'),
        summary: tr('Certified fleet booking', 'Réservation flotte certifiée'),
        details: [
          tr('Instant booking', 'Réservation instantanée'),
          tr('Vehicle packages', 'Packages véhicule'),
        ],
      },
      {
        value: 'tours',
        title: tr('Tours', 'Tour'),
        summary: tr('Guided routes and experiences', 'Parcours guidés et expériences'),
        details: [
          tr('Tour Guided', 'Tour guidé'),
          tr('Open tour details', 'Ouvrir les détails'),
        ],
      },
      {
        value: 'marketplace',
        title: tr('Marketplace', 'Marketplace'),
        summary: tr('Private owner listings', 'Annonces de propriétaires privés'),
        details: [
          tr('View and request', 'Voir et demander'),
          tr('Owner responses', 'Réponses propriétaire'),
        ],
      },
    ],
    [isFrench]
  );

  const rentHref = useMemo(
    () => `/rent?city=${encodeURIComponent(selectedCity)}`,
    [selectedCity]
  );
  const toursHref = useMemo(
    () => `/tours?city=${encodeURIComponent(selectedCity)}`,
    [selectedCity]
  );
  const marketplaceHref = useMemo(
    () => `/marketplace?city=${encodeURIComponent(selectedCity)}`,
    [selectedCity]
  );
  const handleChangeCity = () => {
    const currentIndex = cities.indexOf(selectedCity);
    setSelectedCity(cities[(currentIndex + 1) % cities.length] || selectedCity);
  };

  const handleShareExperience = async () => {
    if (isSharing || typeof window === 'undefined') return;

    setIsSharing(true);

    try {
      const shareParams = new URLSearchParams();
      shareParams.set('lang', isFrench ? 'fr' : 'en');
      if (selectedCity) {
        shareParams.set('city', selectedCity);
      }

      const storefrontOrigin = getCanonicalStorefrontOrigin({
        host: window.location.host,
        protocol: window.location.protocol,
        tenantSlug: DEFAULT_STOREFRONT_TENANT_SLUG,
      });
      const fullShareUrl = `${storefrontOrigin}/share/experience${shareParams.toString() ? `?${shareParams.toString()}` : ''}`;
      const shortShareUrl = await shortenUrl(fullShareUrl, null, 'other');
      const shareUrl = shortShareUrl || fullShareUrl;
      const shareTitle = tr('Choose your SaharaX experience', 'Choisissez votre expérience SaharaX');
      const shareText = tr(
        'Rent, tours, and marketplace in one place.',
        'Location, tours et marketplace au même endroit.'
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

  const warmFlow = (flow) => {
    const cacheKey = `${flow}:${selectedCity}`;
    if (warmedFlowsRef.current.has(cacheKey)) return;
    warmedFlowsRef.current.add(cacheKey);

    if (flow === 'rent') {
      void preloadRentRoute();
      void PublicCatalogService.preloadCatalog({
        flow: 'instant',
        source: 'certified_fleet',
        city: selectedCity,
      });
      return;
    }

    if (flow === 'tours') {
      void preloadToursRoute();
      void preloadTourPackages();
      return;
    }

    if (flow === 'marketplace') {
      void preloadMarketplaceRoute();
      void PublicCatalogService.preloadCatalog({
        flow: 'request',
        source: 'marketplace',
        city: selectedCity,
      });
    }
  };

  useEffect(() => {
    void preloadRentRoute();
    void preloadToursRoute();
    void preloadMarketplaceRoute();
    const timer = window.setTimeout(() => {
      warmFlow('rent');
      warmFlow('tours');
      warmFlow('marketplace');
    }, 80);

    return () => window.clearTimeout(timer);
  }, [selectedCity]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F5F3FF_0%,#ECE9FF_100%)] text-slate-950">
      <PublicSiteChrome current="home" />

      <section className="min-h-[calc(100vh-76px)] px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-[620px] flex-col items-center">
          <div className="text-center">
            <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-[-0.045em] text-slate-950">
              {tr('Choose your experience', 'Choisissez votre expérience')}
            </h1>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[15px] font-semibold text-slate-600">
              <span>{`📍 ${selectedCity}`}</span>
              <button
                type="button"
                onClick={handleChangeCity}
                className="rounded-full px-2 py-1 text-violet-700 transition duration-150 ease-out hover:bg-white/60 hover:text-violet-900 active:scale-95"
              >
                {tr('Change', 'Changer')}
              </button>
              <button
                type="button"
                onClick={handleShareExperience}
                disabled={isSharing}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-50/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={tr('Share this page', 'Partager cette page')}
              >
                <Share2 className="h-4 w-4 text-emerald-700" />
                <span>{isSharing ? tr('Preparing...', 'Préparation...') : tr('Share', 'Partager')}</span>
              </button>
            </div>
          </div>

          <div className="mt-14 grid w-full gap-5">
            {experienceOptions.map((option) => (
              <Link
                key={option.value}
                to={
                  option.value === 'rent'
                    ? rentHref
                    : option.value === 'tours'
                      ? toursHref
                      : marketplaceHref
                }
                onMouseEnter={() => warmFlow(option.value)}
                onFocus={() => warmFlow(option.value)}
                onTouchStart={() => warmFlow(option.value)}
                className="group flex min-h-[156px] w-full flex-nowrap items-center justify-between gap-4 rounded-[24px] bg-white p-8 text-left shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.018] hover:shadow-[0_22px_56px_rgba(15,23,42,0.12)] active:translate-y-0 active:scale-[0.982] sm:p-9"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[36px] font-extrabold leading-none tracking-[-0.045em] text-slate-950 sm:text-[44px]">
                    {option.title}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-600 sm:text-[15px]">
                    {option.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 sm:flex-nowrap sm:overflow-x-auto sm:pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {option.details.map((detail) => (
                      <span
                        key={detail}
                        className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out group-hover:translate-x-1 group-hover:scale-[1.04] group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)]">
                  <ArrowRight className="h-5 w-5" />
                </span>
              </Link>
            ))}
          </div>

          <div id="media" className="w-full">
          <section
            id="social"
            className="mt-12 w-full border-t border-violet-100/80 pt-5"
          >
            <p className="text-lg font-semibold text-slate-950">
              {tr('Follow us', 'Suivez-nous')}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <div className="inline-flex items-center gap-2 text-slate-900">
                <Instagram className="h-4 w-4 text-violet-700" />
                <span className="font-medium">Instagram</span>
              </div>
              <span className="text-slate-500">@saharax.official</span>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-violet-700 transition hover:text-violet-800"
              >
                <span>{tr('Open', 'Ouvrir')}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </section>
          </div>
        </div>
      </section>
      <PublicSiteFooter />
    </div>
  );
};

export default Landing;
