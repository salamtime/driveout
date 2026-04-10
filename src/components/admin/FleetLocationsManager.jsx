import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Save } from 'lucide-react';
import FleetLocationService from '../../services/FleetLocationService';
import i18n from '../../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const emptyForm = {
  id: null,
  name: '',
  code: '',
  address: '',
  display_order: 0,
  is_active: true,
  is_default: false,
};

const FleetLocationsManager = ({ onLocationsChanged }) => {
  const [locations, setLocations] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLocations = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await FleetLocationService.listLocations(true);
      setLocations(rows);
    } catch (err) {
      setError(err.message || tr('Failed to load fleet locations.', 'Impossible de charger les emplacements.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await FleetLocationService.saveLocation(formData);
      setFormData(emptyForm);
      await loadLocations();
      onLocationsChanged?.();
    } catch (err) {
      setError(err.message || tr('Failed to save fleet location.', "Impossible d'enregistrer l'emplacement."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-violet-700">
            <MapPin className="h-3.5 w-3.5" />
            {tr('Fleet locations', 'Emplacements flotte')}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            {tr('Manage where vehicles live between rentals', 'Gérez où les véhicules restent entre les locations')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {tr('Use one default pickup location and track the current return location for each vehicle.', "Utilisez un lieu de départ par défaut et suivez l'emplacement actuel de retour pour chaque véhicule.")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {tr('Loading locations...', 'Chargement des emplacements...')}
            </div>
          ) : locations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              {tr('No fleet locations yet. Add your first one on the right.', "Aucun emplacement flotte. Ajoutez le premier à droite.")}
            </div>
          ) : (
            locations.map((location) => (
              <button
                key={location.id}
                type="button"
                onClick={() => setFormData({ ...location })}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{location.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{location.address || tr('No address yet', "Pas encore d'adresse")}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {location.is_default ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {tr('Default', 'Par défaut')}
                      </span>
                    ) : null}
                    {!location.is_active ? (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {tr('Inactive', 'Inactif')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Plus className="h-4 w-4 text-violet-600" />
            {formData.id ? tr('Edit location', "Modifier l'emplacement") : tr('Add location', 'Ajouter un emplacement')}
          </div>

          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
              placeholder={tr('Location name', "Nom de l'emplacement")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-violet-300 focus:outline-none"
            />
            <input
              type="text"
              value={formData.code || ''}
              onChange={(e) => setFormData((current) => ({ ...current, code: e.target.value }))}
              placeholder={tr('Code (optional)', 'Code (optionnel)')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-violet-300 focus:outline-none"
            />
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData((current) => ({ ...current, address: e.target.value }))}
              placeholder={tr('Address or short description', 'Adresse ou description courte')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-violet-300 focus:outline-none"
            />
            <input
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData((current) => ({ ...current, display_order: Number(e.target.value || 0) }))}
              placeholder={tr('Display order', "Ordre d'affichage")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm focus:border-violet-300 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(formData.is_default)}
                onChange={(e) => setFormData((current) => ({ ...current, is_default: e.target.checked }))}
              />
              {tr('Use as default pickup location', 'Utiliser comme lieu de départ par défaut')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={formData.is_active !== false}
                onChange={(e) => setFormData((current) => ({ ...current, is_active: e.target.checked }))}
              />
              {tr('Active location', 'Emplacement actif')}
            </label>
          </div>

          {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white"
            >
              <Save className="h-4 w-4" />
              {saving ? tr('Saving...', 'Enregistrement...') : tr('Save location', "Enregistrer l'emplacement")}
            </button>
            <button
              type="button"
              onClick={() => setFormData(emptyForm)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              {tr('Reset', 'Réinitialiser')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FleetLocationsManager;
