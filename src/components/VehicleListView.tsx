import React from 'react';
import { Car, Edit, Trash2, FileText } from 'lucide-react';
import { getFleetAlertsForVehicle } from '../utils/fleetAlerts';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';

interface Vehicle {
  id: number;
  name: string;
  model: string;
  vehicle_type: string;
  status: 'available' | 'rented' | 'tour' | 'maintenance' | 'out_of_service';
  plate_number: string;
  image_url?: string;
  current_odometer?: string | null;
  next_oil_change_odometer?: string | null;
  next_oil_change_due?: string | null;
  registration_expiry_date?: string | null;
  insurance_expiry_date?: string | null;
}

interface VehicleListViewProps {
  vehicles: Vehicle[];
  onView: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (id: number) => void;
  getStatusColor: (status: string) => string;
}

const VehicleListView: React.FC<VehicleListViewProps> = ({
  vehicles,
  onView,
  onEdit,
  onDelete,
  getStatusColor,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {vehicles.map((vehicle) => (
              (() => {
                const vehicleAlerts = getFleetAlertsForVehicle(vehicle);
                const displayImageUrl = normalizeVehicleImageUrl(vehicle.image_url);
                return (
                  <tr
                    key={vehicle.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => onView(vehicle)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {displayImageUrl ? (
                        <img
                          src={displayImageUrl}
                          alt={vehicle.name}
                          className="h-12 w-12 rounded-lg object-cover border border-gray-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center">
                          <Car className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <div className="min-w-[180px]">
                        <p className="text-sm font-bold text-gray-900">{vehicle.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {vehicle.model || 'Model not set'}
                          </span>
                          <span className="text-xs font-medium text-gray-500">{vehicle.vehicle_type || 'Vehicle'}</span>
                        </div>
                        {vehicleAlerts.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {vehicleAlerts.slice(0, 3).map((alert) => (
                              <span key={alert.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${alert.classes}`}>
                                <span>{alert.emoji}</span>
                                <span>{alert.label}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="inline-flex items-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-sm font-extrabold tracking-[0.16em] text-blue-900">
                        {vehicle.plate_number || 'NO PLATE'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vehicle.vehicle_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vehicle.model}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-2">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(vehicle.status)}`}>
                          {vehicle.status}
                        </span>
                        {vehicleAlerts.length > 0 && (
                          <div className="space-y-1">
                            {vehicleAlerts.slice(0, 2).map((alert) => (
                              <p key={`${alert.id}-detail`} className="text-[11px] text-gray-500">
                                {alert.detail}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex gap-2 justify-end">
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
                    </td>
                  </tr>
                );
              })()
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VehicleListView;
