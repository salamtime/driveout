import React from 'react';
import { Car, Edit, Trash2, FileText, Calendar, AlertTriangle, File } from 'lucide-react';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import { roundTo } from '../utils/fuelMath';

interface Vehicle {
  id: number;
  name: string;
  model: string;
  vehicle_type: string;
  power_cc: number;
  capacity: number;
  status: 'available' | 'rented' | 'impounded' | 'tour' | 'maintenance' | 'out_of_service';
  image_url: string;
  plate_number: string;
  current_odometer: string | null;
  engine_hours: string | null;
  next_oil_change_due: string | null;
  next_oil_change_odometer: string | null;
  last_oil_change_odometer: string | null;
  document_count?: number;
  location_name?: string | null;
}

interface VehicleGridViewProps {
  vehicles: Vehicle[];
  vehicleFuelStateMap: Record<string, any>;
  onView: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (id: number) => void;
  getStatusColor: (status: string) => string;
  isMaintenanceDue: (vehicle: Vehicle) => boolean;
  getOilChangeProgress: (vehicle: Vehicle) => number;
  isOilChangeDue: (vehicle: Vehicle) => boolean;
}

const VehicleGridView: React.FC<VehicleGridViewProps> = ({
  vehicles,
  vehicleFuelStateMap,
  onView,
  onEdit,
  onDelete,
  getStatusColor,
  isMaintenanceDue,
  getOilChangeProgress,
  isOilChangeDue: isOilChangeDueProp
}) => {
  const getVehicleDocumentCount = (vehicle: Vehicle) => Number(vehicle.document_count || 0);
  const renderFuelProgressBar = (vehicle: Vehicle) => {
    const fuelState = vehicleFuelStateMap[String(vehicle.id)];
    if (!fuelState) return null;

    const lines = Number(fuelState.current_fuel_lines || 0);
    const liters = Number(fuelState.current_fuel_liters || 0);
    const tankCapacity = Number(fuelState.tank_capacity_liters || 0);
    const percentage = Math.max(0, Math.min(100, (lines / 8) * 100));

    return (
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>Fuel</span>
          <span>
            {lines}/8
            {tankCapacity > 0 ? ` · ${roundTo(liters, 1)}/${tankCapacity}L` : ` · ${roundTo(liters, 1)}L`}
          </span>
        </div>
        <div className="w-full overflow-hidden rounded-full bg-emerald-100 h-2">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-400"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {vehicles.map((vehicle) => (
        (() => {
          const displayImageUrl = normalizeVehicleImageUrl(vehicle.image_url);
          return (
        <article
          key={vehicle.id}
          className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-md transition-shadow hover:shadow-lg"
        >
          <div className="relative">
            {displayImageUrl ? (
              <img
                src={displayImageUrl}
                alt={vehicle.name}
                className="w-full h-48 object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                <Car className="w-16 h-16 text-gray-400" />
              </div>
            )}
            
            {isMaintenanceDue(vehicle) && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-white p-1 rounded-full">
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            
            <div className="absolute top-2 left-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(vehicle.status)}`}>
                {vehicle.status}
              </span>
            </div>

            {getVehicleDocumentCount(vehicle) > 0 && (
              <div className="absolute bottom-2 right-2 bg-indigo-500 text-white px-2 py-1 rounded-full shadow-lg">
                <div className="flex items-center gap-1">
                  <File className="w-3 h-3" />
                  <span className="text-xs font-medium">{getVehicleDocumentCount(vehicle)}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0 pr-3">
                <div className="inline-flex items-center rounded-2xl border border-blue-300 bg-gradient-to-r from-blue-50 to-sky-100 px-4 py-2 text-lg font-black tracking-[0.24em] text-blue-950 shadow-sm ring-1 ring-blue-100">
                  {vehicle.plate_number || 'NO PLATE'}
                </div>
                <h3 className="mt-3 text-lg font-bold text-gray-900">{vehicle.name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
                    {vehicle.model || 'Model not set'}
                  </span>
                  <span className="text-sm font-medium text-gray-500">{vehicle.vehicle_type || 'Vehicle'}</span>
                  {vehicle.location_name ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                      {vehicle.location_name}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(vehicle);
                  }}
                  className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                  title="Open Profile"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(vehicle);
                  }}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Edit Vehicle"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(vehicle.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete Vehicle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              {vehicle.current_odometer && (
                <div>Odometer: {vehicle.current_odometer}km</div>
              )}
              {vehicle.engine_hours && (
                <div>Hours: {vehicle.engine_hours}h</div>
              )}
            </div>

            {renderFuelProgressBar(vehicle)}
            
            {vehicle.current_odometer && vehicle.next_oil_change_odometer && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Oil Change</span>
                  <span>{vehicle.current_odometer}/{vehicle.next_oil_change_odometer} km</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      isOilChangeDueProp(vehicle) ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(getOilChangeProgress(vehicle) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {vehicle.next_oil_change_due && !vehicle.next_oil_change_odometer && (
              <div className="mt-2 text-xs">
                <span className={`flex items-center gap-1 ${isMaintenanceDue(vehicle) ? 'text-yellow-600' : 'text-gray-500'}`}>
                  <Calendar className="w-3 h-3" />
                  Next service: {new Date(vehicle.next_oil_change_due).toLocaleDateString()}
                </span>
              </div>
            )}

            {getVehicleDocumentCount(vehicle) > 0 && (
              <div className="mt-2 text-xs text-indigo-600">
                <span className="flex items-center gap-1">
                  <File className="w-3 h-3" />
                  {getVehicleDocumentCount(vehicle)} document{getVehicleDocumentCount(vehicle) !== 1 ? 's' : ''} uploaded
                </span>
              </div>
            )}
          </div>
        </article>
          );
        })()
      ))}
    </div>
  );
};

export default VehicleGridView;
