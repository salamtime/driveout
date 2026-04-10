import React, { useMemo, useState } from 'react';
import { Globe, LayoutTemplate, MapPin, Route, Save, RotateCcw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import websiteContentService from '../../services/WebsiteContentService';
import i18n from '../../i18n';

const sectionTabs = [
  { id: 'landing', labelEn: 'Landing', labelFr: 'Accueil', icon: LayoutTemplate },
  { id: 'rentPage', labelEn: 'Rent a Vehicle', labelFr: 'Louer un véhicule', icon: MapPin },
  { id: 'toursPage', labelEn: 'Book Tour', labelFr: 'Réserver un tour', icon: Route },
];

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100';

const cardClass =
  'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(79,70,229,0.06)]';

const WebsiteEditor = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const [activeTab, setActiveTab] = useState('landing');
  const [content, setContent] = useState(() => websiteContentService.getContent());

  const labels = useMemo(
    () => ({
      landing: {
        eyebrow: isFrench ? 'Badge supérieur' : 'Top eyebrow',
        title: isFrench ? 'Titre principal' : 'Hero title',
        subtitle: isFrench ? 'Sous-titre' : 'Hero subtitle',
        rentTitle: isFrench ? 'Titre carte location' : 'Rent card title',
        rentDescription: isFrench ? 'Description carte location' : 'Rent card description',
        toursTitle: isFrench ? 'Titre carte tours' : 'Tour card title',
        toursDescription: isFrench ? 'Description carte tours' : 'Tour card description',
        cityTitle: isFrench ? 'Titre choix ville' : 'City step title',
        cityDescription: isFrench ? 'Description choix ville' : 'City step description',
        rentPrimaryCta: isFrench ? 'CTA principal location' : 'Primary rental CTA',
        toursPrimaryCta: isFrench ? 'CTA principal tours' : 'Primary tours CTA',
        rentSecondaryCta: isFrench ? 'CTA secondaire location' : 'Secondary rental CTA',
        toursSecondaryCta: isFrench ? 'CTA secondaire tours' : 'Secondary tours CTA',
      },
      rentPage: {
        eyebrow: isFrench ? 'Badge page location' : 'Page eyebrow',
        title: isFrench ? 'Titre page location' : 'Page title',
        subtitle: isFrench ? 'Sous-titre page location' : 'Page subtitle',
        browseEyebrow: isFrench ? 'Badge bloc filtres' : 'Browse eyebrow',
        browseTitle: isFrench ? 'Titre bloc filtres' : 'Browse title',
        searchPlaceholder: isFrench ? 'Placeholder recherche' : 'Search placeholder',
        moreFiltersLabel: isFrench ? 'Libellé plus de filtres' : 'More filters label',
        sourceLabel: isFrench ? 'Libellé source' : 'Source label',
        cityLabel: isFrench ? 'Libellé ville' : 'City label',
        bookingFlowLabel: isFrench ? 'Libellé type de réservation' : 'Booking flow label',
        brandLabel: isFrench ? 'Libellé marque' : 'Brand label',
      },
      toursPage: {
        badge: isFrench ? 'Badge tours' : 'Tours badge',
        title: isFrench ? 'Titre page tours' : 'Page title',
        subtitle: isFrench ? 'Sous-titre page tours' : 'Page subtitle',
        currentCityLabel: isFrench ? 'Libellé ville actuelle' : 'Current city label',
        currentCityDescription: isFrench ? 'Description ville actuelle' : 'Current city description',
        cityStepLabel: isFrench ? 'Étape ville' : 'City step label',
        cityStepTitle: isFrench ? 'Titre étape ville' : 'City step title',
        categoryStepLabel: isFrench ? 'Étape catégorie' : 'Category step label',
        categoryStepTitle: isFrench ? 'Titre étape catégorie' : 'Category step title',
        guidedEyebrow: isFrench ? 'Badge expériences guidées' : 'Guided experiences eyebrow',
        toursReadyTemplate: isFrench ? 'Template tours prêtes ({count} / {city})' : 'Tours ready template ({count} / {city})',
        rentalsSwitchLabel: isFrench ? 'Lien vers locations' : 'Switch to rentals label',
      },
    }),
    [isFrench]
  );

  const currentFields = labels[activeTab];
  const currentValues = content[activeTab] || {};

  const updateField = (field, value) => {
    setContent((current) => ({
      ...current,
      [activeTab]: {
        ...current[activeTab],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    const next = websiteContentService.saveSection(activeTab, content[activeTab]);
    setContent(next);
    toast.success(isFrench ? 'Contenu du site enregistré localement.' : 'Website content saved locally.');
  };

  const handleReset = () => {
    const next = websiteContentService.resetSection(activeTab);
    setContent(next);
    toast.success(isFrench ? 'Section réinitialisée.' : 'Section reset to defaults.');
  };

  const renderPreview = () => {
    if (activeTab === 'landing') {
      return (
        <div className="space-y-4">
          <div className="rounded-[32px] border border-violet-100 bg-[radial-gradient(circle_at_top_left,#e9d5ff_0%,#c4b5fd_26%,#ffffff_100%)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">{currentValues.eyebrow}</p>
            <h3 className="mt-4 text-3xl font-semibold text-slate-950">{currentValues.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{currentValues.subtitle}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={cardClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">Rent</p>
              <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.rentTitle}</h4>
              <p className="mt-2 text-sm text-slate-600">{currentValues.rentDescription}</p>
              <div className="mt-5 inline-flex rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
                {currentValues.rentPrimaryCta}
              </div>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">Tours</p>
              <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.toursTitle}</h4>
              <p className="mt-2 text-sm text-slate-600">{currentValues.toursDescription}</p>
              <div className="mt-5 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                {currentValues.toursPrimaryCta}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'rentPage') {
      return (
        <div className="space-y-4">
          <div className="rounded-[32px] border border-violet-100 bg-[radial-gradient(circle_at_top_left,#e9d5ff_0%,#c4b5fd_26%,#ffffff_100%)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">{currentValues.eyebrow}</p>
            <h3 className="mt-4 text-3xl font-semibold text-slate-950">{currentValues.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{currentValues.subtitle}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">{currentValues.browseEyebrow}</p>
            <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.browseTitle}</h4>
            <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-slate-500">
              {currentValues.searchPlaceholder}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[currentValues.sourceLabel, currentValues.cityLabel, currentValues.bookingFlowLabel, currentValues.brandLabel].map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-[32px] border border-violet-100 bg-[radial-gradient(circle_at_top_left,#e9d5ff_0%,#c4b5fd_26%,#ffffff_100%)] p-6">
          <p className="inline-flex rounded-full border border-violet-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">
            {currentValues.badge}
          </p>
          <h3 className="mt-4 text-3xl font-semibold text-slate-950">{currentValues.title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">{currentValues.subtitle}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{currentValues.cityStepLabel}</p>
            <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.cityStepTitle}</h4>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{currentValues.categoryStepLabel}</p>
            <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.categoryStepTitle}</h4>
          </div>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{currentValues.guidedEyebrow}</p>
          <h4 className="mt-3 text-xl font-semibold text-slate-950">{currentValues.toursReadyTemplate}</h4>
          <p className="mt-3 text-sm font-semibold text-violet-700">{currentValues.rentalsSwitchLabel}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Globe className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Éditeur du site' : 'Website Editor'}
        title={isFrench ? 'Éditeur du site' : 'Website Editor'}
        description={isFrench ? 'Commencez avec les pages publiques les plus visibles : accueil, location et tours. Cette première version crée le flux d’édition directement dans l’admin.' : 'Start with the most visible public pages: landing, rentals, and tours. This first version creates the editing flow directly inside admin.'}
        className="w-full"
      />

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isFrench
            ? "Le backend CMS n'existe pas encore. Cette première version enregistre le contenu du site localement dans ce navigateur pour construire le module et le flux d'édition tout de suite."
            : 'The CMS backend does not exist yet. This first version saves website content locally in this browser so we can build the module and editing flow immediately.'}
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-violet-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {isFrench ? tab.labelFr : tab.labelEn}
              </button>
            );
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
                  {isFrench ? 'Aperçu' : 'Preview'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {isFrench ? 'Aperçu de la page publique' : 'Public page preview'}
                </h2>
              </div>
              <Link
                to={activeTab === 'landing' ? '/website' : activeTab === 'rentPage' ? '/rent' : '/tours'}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                {isFrench ? 'Ouvrir la page' : 'Open page'}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6">{renderPreview()}</div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
                  {isFrench ? 'Champs éditables' : 'Editable fields'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {isFrench ? 'Modifier le contenu visible' : 'Edit visible content'}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  <RotateCcw className="h-4 w-4" />
                  {isFrench ? 'Réinitialiser' : 'Reset'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  <Save className="h-4 w-4" />
                  {isFrench ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {Object.entries(currentFields).map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
                  {String(currentValues[field] || '').length > 80 ? (
                    <textarea
                      rows={4}
                      value={currentValues[field] || ''}
                      onChange={(event) => updateField(field, event.target.value)}
                      className={inputClass}
                    />
                  ) : (
                    <input
                      type="text"
                      value={currentValues[field] || ''}
                      onChange={(event) => updateField(field, event.target.value)}
                      className={inputClass}
                    />
                  )}
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WebsiteEditor;
