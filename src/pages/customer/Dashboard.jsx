import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * CustomerDashboard - Dashboard for customer role users
 */
const CustomerDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          My Account
        </h1>
        <p className="text-gray-600 mt-2">
          Welcome, {user?.email} - Self-Service Portal
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold mb-2">Book a Vehicle</h2>
          <p className="text-gray-600 mb-4">Browse available vehicles and make a booking.</p>
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Browse Vehicles
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold mb-2">My Rentals</h2>
          <p className="text-gray-600 mb-4">View your rental history and current bookings.</p>
          <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            View Rentals
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold mb-2">Profile Settings</h2>
          <p className="text-gray-600 mb-4">Update your personal information and preferences.</p>
          <button className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Edit Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;