import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import PublicSiteChrome from '../components/public/PublicSiteChrome';

const FALLBACK_CITIES = ['Tangier'];

const Landing = () => {
  useTranslation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedCity, setSelectedCity] = useState('Tangier');
  const cities = FALLBACK_CITIES;
  const experienceOptions = useMemo(
    () => [
      {
        value: 'rent',
        title: tr('Rent', 'Louer'),
      },
      {
        value: 'tours',
        title: tr('Tours', 'Excursions'),
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

  const handleChangeCity = () => {
    const currentIndex = cities.indexOf(selectedCity);
    setSelectedCity(cities[(currentIndex + 1) % cities.length] || selectedCity);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F5F3FF_0%,#ECE9FF_100%)] text-slate-950">
      <PublicSiteChrome current="home" />

      <section className="min-h-[calc(100vh-76px)] px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-[620px] flex-col items-center">
          <div className="text-center">
            <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-[-0.045em] text-slate-950">
              {tr('Choose your experience', 'Choisissez votre expérience')}
            </h1>

            <div className="mt-6 inline-flex items-center justify-center gap-3 text-[15px] font-semibold text-slate-600">
              <span>{`📍 ${selectedCity}`}</span>
              <button
                type="button"
                onClick={handleChangeCity}
                className="rounded-full px-2 py-1 text-violet-700 transition duration-150 ease-out hover:bg-white/60 hover:text-violet-900 active:scale-95"
              >
                {tr('Change', 'Changer')}
              </button>
            </div>
          </div>

          <div className="mt-14 grid w-full gap-5">
            {experienceOptions.map((option) => (
              <Link
                key={option.value}
                to={option.value === 'rent' ? rentHref : toursHref}
                className="group flex min-h-[156px] w-full items-center justify-between rounded-[24px] bg-white p-9 text-left shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.018] hover:shadow-[0_22px_56px_rgba(15,23,42,0.12)] active:translate-y-0 active:scale-[0.982] sm:p-10"
              >
                <span className="text-[42px] font-extrabold leading-none tracking-[-0.045em] text-slate-950 sm:text-[48px]">
                  {option.title}
                </span>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.16)] transition duration-200 ease-out group-hover:translate-x-1 group-hover:scale-[1.04] group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-[0_16px_36px_rgba(124,58,237,0.26)]">
                  <ArrowRight className="h-5 w-5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
