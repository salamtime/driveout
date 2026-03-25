import React from 'react';
import VehicleManagement from '../../components/VehicleManagement';

/**
 * FleetPage - Fleet management system with integrated vehicle database
 */
const FleetPage = () => {
  return (
    <div className="min-h-full">
      {/* Use the VehicleManagement component which integrates with Supabase database */}
      <VehicleManagement />
    </div>
  );
};

export default FleetPage;