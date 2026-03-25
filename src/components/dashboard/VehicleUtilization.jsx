import React, { useState, useEffect } from 'react';
import { Car, Truck, BarChart3 } from 'lucide-react';
import DashboardService from '../../services/DashboardService';

const VehicleUtilization = () => {
  const [utilization, setUtilization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVehicleUtilization();
  }, []);

  const loadVehicleUtilization = async () => {
    try {
      const utilizationData = await DashboardService.getVehicleUtilization();
      setUtilization(utilizationData);
    } catch (error) {
      console.error('Error loading vehicle utilization:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Vehicle Utilization</h3>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!utilization) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Vehicle Utilization</h3>
        <p className="text-gray-500">Unable to load vehicle utilization data</p>
      </div>
    );
  }

  const { statusCounts, typeCounts, totalVehicles } = utilization;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Vehicle Utilization</h3>
        <BarChart3 className="h-5 w-5 text-blue-500" />
      </div>
      
      {/* Total Fleet */}
      <div className="text-center p-4 bg-gray-50 rounded-lg mb-6">
        <Car className="h-8 w-8 text-gray-600 mx-auto mb-2" />
        <p className="text-3xl font-bold text-gray-900">{totalVehicles}</p>
        <p className="text-sm text-gray-600">Total Fleet</p>
      </div>

      {/* Status Breakdown */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Status Distribution</h4>
        <div className="space-y-3">
          {Object.entries(statusCounts).map(([status, count]) => {
            const percentage = totalVehicles > 0 ? (count / totalVehicles) * 100 : 0;
            const statusColors = {
              available: 'bg-green-500',
              rented: 'bg-blue-500',
              maintenance: 'bg-yellow-500',
              out_of_service: 'bg-red-500'
            };
            
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${statusColors[status] || 'bg-gray-500'}`}></div>
                    <span className="text-sm capitalize text-gray-700">{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{count}</span>
                    <span className="text-xs text-gray-500">({percentage.toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${statusColors[status] || 'bg-gray-500'}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vehicle Types */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Vehicle Types</h4>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(typeCounts).map(([type, count]) => {
            const percentage = totalVehicles > 0 ? (count / totalVehicles) * 100 : 0;
            const typeIcons = {
              quad: Car,
              atv: Car,
              buggy: Truck,
              motorcycle: Car
            };
            const IconComponent = typeIcons[type] || Car;
            
            return (
              <div key={type} className="text-center p-3 border border-gray-200 rounded-lg">
                <IconComponent className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <p className="text-lg font-semibold text-gray-900">{count}</p>
                <p className="text-xs text-gray-600 capitalize">{type}</p>
                <p className="text-xs text-gray-500">({percentage.toFixed(1)}%)</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VehicleUtilization;