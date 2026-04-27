import React from 'react';
import { Link } from 'react-router-dom';
import i18n from '../../i18n';

const FOOTER_LINKS = [
  { id: 'about', href: '/website#about', label: { en: 'About Us', fr: 'À propos' } },
  { id: 'media', href: '/website#media', label: { en: 'Media', fr: 'Médias' } },
];

const INSTAGRAM_URL = 'https://www.instagram.com/saharax.official?igsh=ZDF6ZzloOHN2c2t1';

const PublicSiteFooter = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <footer className="bg-transparent">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-5 text-center sm:px-6">
        <p className="text-sm font-semibold text-slate-700">SaharaX</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.id}
                to={link.href}
                className="transition hover:text-violet-700"
              >
                {link.label[isFrench ? 'fr' : 'en']}
              </Link>
            ))}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-violet-700"
            >
              Instagram
            </a>
        </div>
      </div>
    </footer>
  );
};

export default PublicSiteFooter;
