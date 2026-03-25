import React from 'react';
import MaintenanceTrackingDashboard from '../maintenance/MaintenanceTrackingDashboard';

const QuadMaintenance = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quad Maintenance</h1>
        <p className="text-gray-600">Manage maintenance schedules, track service history, and monitor vehicle status</p>
      </div>
      
      <MaintenanceTrackingDashboard />
    </div>
  );
};

export default QuadMaintenance;