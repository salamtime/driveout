import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, MapPin, CircleDot } from 'lucide-react';
import VehicleService from '../../services/VehicleService';
import FleetLocationService from '../../services/FleetLocationService';
import { normalizeVehicleImageUrl } from '../../utils/vehicleImage';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';

/**
 * VehiclesPage - Vehicle OS entry with unified list
 */
const FleetPage = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  useEffect(() => {
    let isMounted = true;
    const loadVehicles = async () => {
      try {
        setLoading(true);
        const [vehicleRows, locationRows] = await Promise.all([
          VehicleService.getAllVehicles(),
          FleetLocationService.listLocations(),
        ]);
        if (!isMounted) return;
        setVehicles(Array.isArray(vehicleRows) ? vehicleRows : []);
        setLocations(Array.isArray(locationRows) ? locationRows : []);
      } catch (error) {
        console.error('Failed to load vehicles list', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadVehicles();
    return () => {
      isMounted = false;
    };
  }, []);

  const locationMap = useMemo(() => {
    const map = new Map();
    locations.forEach((location) => {
      if (location?.id) map.set(String(location.id), location.name);
    });
    return map;
  }, [locations]);

  const getListingStatus = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (['available', 'rented', 'scheduled'].includes(normalized)) return tr('Live', 'En ligne');
    if (['maintenance', 'out_of_service', 'impounded'].includes(normalized)) return tr('Draft', 'Brouillon');
    return tr('In review', 'En revue');
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F7F6FF_0%,#EEF1FF_100%)]">
      <AdminModuleHero
        icon={<Car className="h-8 w-8 text-white" />}
        eyebrow={tr('Vehicles', 'Véhicules')}
        title={tr('Vehicle Operating System', 'Système véhicules')}
        description={tr('Select a vehicle to manage everything in one place.', 'Sélectionnez un véhicule pour tout gérer au même endroit.')}
      />
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-52 rounded-2xl border border-violet-100 bg-white/80 shadow-sm animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => {
              const imageUrl = normalizeVehicleImageUrl(vehicle.image_url || '');
              const locationName = locationMap.get(String(vehicle.location_id)) || tr('Location not set', 'Emplacement non défini');
              const listingStatus = getListingStatus(vehicle.status);
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => navigate(`/admin/fleet/${vehicle.id}`)}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white text-left shadow-[0_18px_40px_rgba(76,29,149,0.08)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_26px_60px_rgba(76,29,149,0.16)]"
                >
                  <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                    {imageUrl ? (
                      <img src={imageUrl} alt={vehicle.name || 'Vehicle'} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <Car className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{vehicle.name || tr('Vehicle', 'Véhicule')}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        {locationName}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                      {listingStatus}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FleetPage;
