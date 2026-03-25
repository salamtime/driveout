import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CarFront, Plus } from 'lucide-react';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import { useAuth } from '../../contexts/AuthContext';
import VehicleList from '../../components/admin/VehicleList';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

/**
 * Vehicles - Fleet management page with role-based access control
 * 
 * Provides fleet management functionality based on user permissions.
 * Integrates with the RBAC system for proper access control.
 */
const Vehicles = () => {
  const dispatch = useDispatch();
  const { vehicles, loading, error } = useSelector((state) => state.vehicles);
  const { hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Define permissions based on the new module-based system
  const canManageVehicles = hasPermission('vehicles');
  const canCreateVehicle = hasPermission('vehicles');
  const canEditVehicle = hasPermission('vehicles');

  // Fetch vehicles on component mount
  useEffect(() => {
    dispatch(fetchVehicles());
  }, [dispatch]);

  // Filter vehicles based on search and status
  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = vehicle.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         vehicle.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         vehicle.plate_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Vehicles</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AdminModuleHero
        icon={<CarFront className="h-8 w-8 text-white" />}
        eyebrow="Fleet Management"
        title="Fleet Management"
        description="Track vehicle availability, status, and fleet records from one management workspace."
        actions={
          canCreateVehicle ? (
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20">
              <Plus className="h-4 w-4" />
              Add New Vehicle
            </button>
          ) : null
        }
      />

      {/* Filters */}
      <div className="mb-6 mt-6 flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search vehicles by name, model, or plate number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Status Filter */}
        <div className="sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="rented">Rented</option>
            <option value="tour">Tour</option>
            <option value="maintenance">Maintenance</option>
            <option value="out_of_service">Out of Service</option>
          </select>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          title="Total Vehicles"
          value={vehicles.length}
          color="blue"
        />
        <StatCard
          title="Available"
          value={vehicles.filter(v => v.status === 'available').length}
          color="green"
        />
        <StatCard
          title="Rented"
          value={vehicles.filter(v => v.status === 'rented').length}
          color="yellow"
        />
        <StatCard
          title="Tour"
          value={vehicles.filter(v => v.status === 'tour').length}
          color="violet"
        />
        <StatCard
          title="Maintenance"
          value={vehicles.filter(v => v.status === 'maintenance').length}
          color="red"
        />
      </div>

      {/* Vehicle List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <VehicleList 
          vehicles={filteredVehicles}
          canEdit={canEditVehicle}
          canManage={canManageVehicles}
        />
      </div>

      {/* Empty State */}
      {filteredVehicles.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🚗</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm || statusFilter !== 'all' ? 'No vehicles found' : 'No vehicles available'}
          </h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search criteria or filters.'
              : 'Get started by adding your first vehicle to the fleet.'
            }
          </p>
          {canCreateVehicle && !searchTerm && statusFilter === 'all' && (
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors duration-150">
              Add First Vehicle
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * StatCard - Statistics display card
 */
const StatCard = ({ title, value, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    violet: 'bg-violet-50 text-violet-600 border-violet-200',
    red: 'bg-red-50 text-red-600 border-red-200'
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium mt-1">{title}</div>
    </div>
  );
};

export default Vehicles;
