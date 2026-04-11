import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import VehicleModelService from '../../services/VehicleModelService';
import { resolveTankCapacityLiters } from '../../utils/vehicleModelSpecs';
import i18n from '../../i18n';
import VehicleImageUpload from '../VehicleImageUpload';

const VehicleModelEditModal = ({ vehicleModel, isOpen, onClose, onSave, onError }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'ATV',
    description: '',
    power_cc_min: 0,
    power_cc_max: 0,
    capacity_min: 1,
    capacity_max: 1,
    tank_capacity_liters: '',
    image_url: '',
    features: [],
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!vehicleModel || !isOpen) return;
    setFormData({
      name: vehicleModel.name || '',
      model: vehicleModel.model || '',
      vehicle_type: vehicleModel.vehicle_type || 'ATV',
      description: vehicleModel.description || '',
      power_cc_min: vehicleModel.power_cc_min || 0,
      power_cc_max: vehicleModel.power_cc_max || 0,
      capacity_min: vehicleModel.capacity_min || 1,
      capacity_max: vehicleModel.capacity_max || 1,
      tank_capacity_liters: resolveTankCapacityLiters(
        vehicleModel.tank_capacity_liters,
        vehicleModel.model,
        vehicleModel.name
      )?.toString() || '',
      image_url: vehicleModel.image_url || '',
      features: vehicleModel.features || [],
      is_active: vehicleModel.is_active !== undefined ? vehicleModel.is_active : true,
    });
    setError('');
  }, [vehicleModel, isOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const validation = VehicleModelService.validateModel(formData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      const updatedModel = await VehicleModelService.updateModel(vehicleModel.id, formData);
      onSave?.(updatedModel);
      onClose();
    } catch (nextError) {
      const message =
        nextError?.message || tr('Failed to update vehicle model', 'Impossible de mettre à jour le modèle de véhicule');
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-screen w-full max-w-3xl overflow-y-auto rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,#f8f6ff_0%,#ffffff_28%)] shadow-[0_24px_60px_rgba(76,29,149,0.18)]">
        <div className="flex items-center justify-between border-b border-violet-100 px-6 py-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
              {tr('Vehicle Models', 'Modèles véhicule')}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {tr('Edit Vehicle Model', 'Modifier le modèle de véhicule')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {tr(
                'Keep the ATV model details, image, and rider capacity aligned across fleet and website experiences.',
                'Gardez les détails, l’image et la capacité du modèle ATV alignés entre la flotte et le site web.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mx-6 mt-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {tr('Vehicle model update failed', 'Échec de la mise à jour du modèle')}
              </p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
              {tr('Basics', 'Informations de base')}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Model name', 'Nom du modèle')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  placeholder="SEGWAY"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Model code', 'Identifiant du modèle')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  placeholder="AT6"
                  required
                />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
              {tr('Image', 'Image')}
            </p>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {tr('ATV model image', 'Image du modèle ATV')}
              </label>
              <VehicleImageUpload
                vehicleId={`vehicle-models/${vehicleModel?.id || 'draft'}`}
                currentImageUrl={formData.image_url}
                onImageChange={(nextUrl) => setFormData({ ...formData, image_url: nextUrl })}
                disabled={loading}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
              {tr('Setup', 'Configuration')}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Tank capacity (L)', 'Capacité du réservoir (L)')}
                </label>
                <input
                  type="number"
                  value={formData.tank_capacity_liters}
                  onChange={(e) => setFormData({ ...formData, tank_capacity_liters: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  min="1"
                  step="0.1"
                  placeholder="23"
                />
                <p className="mt-2 text-xs text-slate-500">
                  {tr(
                    'Shared fuel capacity used across fleet, rentals, and tours.',
                    'Capacité de carburant partagée utilisée pour la flotte, les locations et les tours.'
                  )}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Vehicle type', 'Type de véhicule')}
                </label>
                <select
                  value={formData.vehicle_type}
                  onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                >
                  <option value="quad">Quad</option>
                  <option value="ATV">ATV</option>
                  <option value="UTV">UTV</option>
                  <option value="buggy">Buggy</option>
                  <option value="car">Car</option>
                  <option value="motorhome">Motorhome</option>
                  <option value="jet_ski">Jet Ski</option>
                  <option value="electric_bike">Electric Bike</option>
                  <option value="electric_motorbike">Electric Motorbike</option>
                  <option value="electric_motorcycle">Electric Motorcycle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="scooter">Scooter</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
              {tr('Specifications', 'Spécifications')}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Status', 'Statut')}
                </label>
                <select
                  value={String(formData.is_active)}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                >
                  <option value="true">{tr('Active', 'Actif')}</option>
                  <option value="false">{tr('Inactive', 'Inactif')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Power min. (CC)', 'Puissance min. (CC)')}
                </label>
                <input
                  type="number"
                  value={formData.power_cc_min}
                  onChange={(e) => setFormData({ ...formData, power_cc_min: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  min="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Power max. (CC)', 'Puissance max. (CC)')}
                </label>
                <input
                  type="number"
                  value={formData.power_cc_max}
                  onChange={(e) => setFormData({ ...formData, power_cc_max: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  min="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Capacity min.', 'Capacité min.')}
                </label>
                <input
                  type="number"
                  value={formData.capacity_min}
                  onChange={(e) => setFormData({ ...formData, capacity_min: parseInt(e.target.value, 10) || 1 })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  min="1"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {tr('Capacity max.', 'Capacité max.')}
                </label>
                <input
                  type="number"
                  value={formData.capacity_max}
                  onChange={(e) => setFormData({ ...formData, capacity_max: parseInt(e.target.value, 10) || 1 })}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                  min="1"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3 border-t border-violet-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${
                loading
                  ? 'cursor-not-allowed bg-slate-400'
                  : 'bg-gradient-to-r from-violet-600 to-indigo-700 shadow-[0_14px_30px_rgba(79,70,229,0.24)] hover:scale-[1.01]'
              }`}
            >
              {loading ? tr('Saving...', 'Enregistrement...') : tr('Save Model', 'Enregistrer le modèle')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VehicleModelEditModal;
