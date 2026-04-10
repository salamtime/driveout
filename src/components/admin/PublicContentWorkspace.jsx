import React, { useEffect, useState } from 'react';
import { Globe2, Languages, LayoutTemplate, MapPinned, Package2 } from 'lucide-react';
import platformExperienceService from '../../services/PlatformExperienceService';
import i18n from '../../i18n';

const PublicContentWorkspace = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const data = await platformExperienceService.getPublicContentSnapshot();
        if (!cancelled) {
          setSnapshot(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{tr('Loading public content controls...', 'Chargement des contrôles contenu public...')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
            <Globe2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{tr('Public website control center', 'Centre de contrôle du site public')}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tr(
                'This workspace keeps the public experience connected: homepage content, translation coverage, website-visible tours, and marketplace discovery readiness.',
                'Cet espace garde l’expérience publique connectée : contenu homepage, couverture traduction, tours visibles sur le site et préparation de la découverte marketplace.'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-violet-900">{tr('Published CMS pages', 'Pages CMS publiées')}</p>
              <p className="mt-2 text-2xl font-bold text-violet-700">{snapshot?.publishedCmsPages || 0}</p>
            </div>
            <LayoutTemplate className="h-8 w-8 text-violet-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-sky-900">{tr('Published sections', 'Sections publiées')}</p>
              <p className="mt-2 text-2xl font-bold text-sky-700">{snapshot?.publishedCmsSections || 0}</p>
            </div>
            <MapPinned className="h-8 w-8 text-sky-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-900">{tr('Website-visible tours', 'Tours visibles sur le site')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{snapshot?.websiteVisibleTours || 0}</p>
            </div>
            <Package2 className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">{tr('Dynamic translations', 'Traductions dynamiques')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{snapshot?.translationsTotal || 0}</p>
            </div>
            <Languages className="h-8 w-8 text-amber-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-slate-900">{tr('Public experience status', 'État de l’expérience publique')}</h4>
          <p className="mt-1 text-sm text-slate-600">{tr('A quick status board for the surfaces customers see first.', 'Un tableau rapide de l’état des surfaces que les clients voient en premier.')}</p>

          <div className="mt-5 space-y-3">
            {(snapshot?.contentRows || []).map((row) => {
              const tone =
                row.status === 'ready' || row.status === 'connected'
                  ? 'bg-emerald-100 text-emerald-700'
                  : row.status === 'hidden' || row.status === 'quiet'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600';

              return (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{row.status}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{row.type}</span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-slate-900">{row.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{row.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold text-slate-900">{tr('Tour website visibility', 'Visibilité web des tours')}</h4>
          <p className="mt-1 text-sm text-slate-600">{tr('Tour packages that are ready for public preview and discovery.', 'Forfaits tour prêts pour l’aperçu et la découverte publics.')}</p>

          <div className="mt-5 space-y-3">
            {(snapshot?.tourRows || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {tr('No tour packages found yet.', 'Aucun forfait tour trouvé pour le moment.')}
              </div>
            ) : (
              snapshot.tourRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.websiteVisible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.websiteVisible ? tr('Website visible', 'Visible sur le site') : tr('Hidden', 'Masqué')}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.active ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'}`}>
                      {row.active ? tr('Active', 'Actif') : tr('Inactive', 'Inactif')}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{row.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{tr('Duration', 'Durée')}: {row.duration || 0}h</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicContentWorkspace;
