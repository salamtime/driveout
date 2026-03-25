import React, { useState, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { 
  Car, 
  Edit, 
  Trash2, 
  Eye, 
  Search,
  Plus,
  Filter
} from 'lucide-react';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import VehicleStatusBadge from '../VehicleStatusBadge';

// NUCLEAR FIX: Simple status constants instead of broken service
const VEHICLE_STATUS = {
  AVAILABLE: 'available',
  SCHEDULED: 'scheduled',
  RENTED: 'rented',
  SERVICE: 'service'
};

const VehicleList = ({ 
  onEdit, 
  onDelete, 
  onView, 
  onAdd
}) => {
  const dispatch = useDispatch();
  
  // FIXED: Use Redux vehicles like the working rental dropdown
  const { vehicles: reduxVehicles, loading, error } = useSelector(state => state.vehicles);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vehiclesWithStatus, setVehiclesWithStatus] = useState([]);

  // Load vehicles from Redux on mount (same pattern as rental dropdown)
  useEffect(() => {
    console.log('🔄 VehicleList: Loading vehicles from Redux...');
    dispatch(fetchVehicles());
  }, [dispatch]);

  // NUCLEAR FIX: Simple status assignment without service calls
  useEffect(() => {
    if (reduxVehicles && reduxVehicles.length > 0) {
      console.log('✅ VehicleList: Using Redux vehicles directly:', reduxVehicles);
      // Add basic status - all vehicles default to available for now
      const vehiclesWithBasicStatus = reduxVehicles.map(vehicle => ({
        ...vehicle,
        derived_status: vehicle.status || VEHICLE_STATUS.AVAILABLE
      }));
      setVehiclesWithStatus(vehiclesWithBasicStatus);
    } else {
      setVehiclesWithStatus([]);
    }
  }, [reduxVehicles]);

  // Filter vehicles based on search and derived status
  const filteredVehicles = useMemo(() => {
    if (!Array.isArray(vehiclesWithStatus)) return [];
    
    return vehiclesWithStatus.filter(vehicle => {
      if (!vehicle) return false;
      
      const matchesSearch = !searchTerm || 
        (vehicle.name && vehicle.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.model && vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.brand && vehicle.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.plate_number && vehicle.plate_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (vehicle.id && vehicle.id.toString().toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Use derived_status for filtering
      const matchesStatus = statusFilter === 'all' || 
        (vehicle.derived_status && vehicle.derived_status === statusFilter);
      
      return matchesSearch && matchesStatus;
    });
  }, [vehiclesWithStatus, searchTerm, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Vehicles</h3>
        <p className="text-red-600 text-sm">{error}</p>
        <button 
          onClick={() => dispatch(fetchVehicles())}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Info */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <h4 className="text-sm font-semibold text-green-800 mb-1">🔥 NUCLEAR FIX APPLIED!</h4>
        <div className="text-xs text-green-700 space-y-1">
          <div>✅ VehicleAvailabilityService COMPLETELY REMOVED</div>
          <div>✅ Using Redux vehicles directly (same as working rental dropdown)</div>
          <div>✅ Simple status constants - no more crashes</div>
          <div>Redux vehicles: {reduxVehicles?.length || 0} | With status: {vehiclesWithStatus.length} | Filtered: {filteredVehicles.length}</div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vehicle List</h2>
          <p className="text-gray-600">Manage your fleet vehicles</p>
        </div>
        {onAdd && (
          <Button onClick={onAdd} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Vehicle
          </Button>
        )}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search vehicles by name, model, brand, plate number, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="min-w-[200px]">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="scheduled">Scheduled</option>
            <option value="rented">Rented</option>
            <option value="service">Service/Maintenance</option>
          </select>
        </div>
      </div>

      {/* Vehicle Grid */}
      {filteredVehicles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {reduxVehicles?.length === 0 ? 'No vehicles found' : 'No vehicles match your search'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria.' 
                : 'Get started by adding your first vehicle.'}
            </p>
            {onAdd && !searchTerm && statusFilter === 'all' && reduxVehicles?.length === 0 && (
              <Button onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Vehicle
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVehicles.map((vehicle) => (
            <Card key={vehicle.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{vehicle.name || 'Unnamed Vehicle'}</CardTitle>
                    <p className="text-sm text-gray-600">{vehicle.model || 'No model'}</p>
                    {vehicle.plate_number && (
                      <p className="text-sm font-medium text-blue-600">Plate: {vehicle.plate_number}</p>
                    )}
                  </div>
                  {/* Use VehicleStatusBadge with derived status */}
                  <VehicleStatusBadge 
                    status={vehicle.derived_status || VEHICLE_STATUS.AVAILABLE} 
                    size="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Brand</p>
                      <p className="font-medium">{vehicle.brand || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Type</p>
                      <p className="font-medium">{vehicle.vehicle_type || 'N/A'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-500">
                      ID: {vehicle.id}
                    </div>
                    <div className="text-gray-500">
                      Power: {vehicle.power_cc || 'N/A'} CC
                    </div>
                  </div>

                  {/* Show derived status info */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-2">
                    <p className="text-xs text-blue-800 font-medium">
                      Status: {vehicle.derived_status || VEHICLE_STATUS.AVAILABLE}
                    </p>
                  </div>

                  {vehicle.notes && (
                    <p className="text-sm text-gray-600 truncate">{vehicle.notes}</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    {onView && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onView(vehicle)}
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    )}
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(vehicle)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(vehicle)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default VehicleList;