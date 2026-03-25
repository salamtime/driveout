import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, DollarSign, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardService from '../../services/DashboardService';

const BookingStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookingStats();
  }, []);

  const loadBookingStats = async () => {
    try {
      const statsData = await DashboardService.getBookingStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading booking stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Booking Statistics</h3>
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

  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Booking Statistics</h3>
        <p className="text-gray-500">Unable to load booking statistics</p>
      </div>
    );
  }

  const { statusCounts, monthlyData } = stats;
  const totalBookings = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const totalRevenue = Object.values(monthlyData).reduce((sum, month) => sum + month.revenue, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Booking Statistics</h3>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/bookings"
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View All
          </Link>
          <TrendingUp className="h-5 w-5 text-green-500" />
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <Calendar className="h-6 w-6 text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-blue-600">{totalBookings}</p>
          <p className="text-sm text-gray-600">Total Bookings</p>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <DollarSign className="h-6 w-6 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-green-600">${totalRevenue.toFixed(0)}</p>
          <p className="text-sm text-gray-600">Total Revenue</p>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Booking Status</h4>
        <div className="space-y-2">
          {Object.entries(statusCounts).map(([status, count]) => {
            const percentage = totalBookings > 0 ? (count / totalBookings) * 100 : 0;
            const statusColors = {
              confirmed: 'bg-green-500',
              pending: 'bg-yellow-500',
              completed: 'bg-blue-500',
              cancelled: 'bg-red-500'
            };
            
            return (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${statusColors[status] || 'bg-gray-500'}`}></div>
                  <span className="text-sm capitalize text-gray-700">{status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{count}</span>
                  <span className="text-xs text-gray-500">({percentage.toFixed(1)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly Trend */}
      {Object.keys(monthlyData).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Months</h4>
          <div className="space-y-2">
            {Object.entries(monthlyData)
              .sort(([a], [b]) => b.localeCompare(a))
              .slice(0, 3)
              .map(([month, data]) => (
                <div key={month} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  <div className="flex gap-4">
                    <span className="text-gray-900">{data.count} bookings</span>
                    <span className="text-green-600">${data.revenue.toFixed(0)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingStats;