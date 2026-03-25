import React from 'react';
import { CalendarDays } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

/**
 * CalendarPage - Schedule and appointment management
 * 
 * Features to implement:
 * - Monthly/weekly/daily calendar views
 * - Rental scheduling
 * - Tour bookings
 * - Maintenance appointments
 * - Resource allocation
 */
const CalendarPage = () => {
  return (
    <div className="p-4 lg:p-6">
      <AdminModuleHero
        icon={<CalendarDays className="h-8 w-8 text-white" />}
        eyebrow="Calendar"
        title="Calendar"
        description="Schedule rentals, tours, maintenance, and appointments from one shared operational calendar."
      />

      <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📅</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Calendar Module</h2>
          <p className="text-gray-600 mb-6">
            Comprehensive scheduling system for rentals, tours, and maintenance appointments.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Rental Scheduling</h3>
              <p className="text-sm text-blue-700">Book and manage vehicle rentals</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">Tour Planning</h3>
              <p className="text-sm text-green-700">Schedule guided tours and activities</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <h3 className="font-semibold text-orange-900 mb-2">Maintenance</h3>
              <p className="text-sm text-orange-700">Plan vehicle service appointments</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
