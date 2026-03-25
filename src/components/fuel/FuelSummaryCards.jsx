import React, { useState, useEffect } from 'react';
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Car,
  Calendar,
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import FuelTransactionService from '../../services/FuelTransactionService';

const FuelSummaryCards = ({ vehicles = [] }) => {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load summary data
  const loadSummaryData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get analytics for the last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);

      const result = await FuelTransactionService.getAnalytics({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      if (result.success) {
        setSummaryData(result.analytics);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummaryData();
  }, []);

  // Format currency
  const formatMAD = (amount) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Animated counter component
  const AnimatedCounter = ({ value, duration = 1000, formatter = (v) => v }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
      let startTime;
      const animate = (currentTime) => {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        
        setCount(Math.floor(progress * value));
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    }, [value, duration]);

    return <span>{formatter(count)}</span>;
  };

  // Get trend indicator
  const getTrendIndicator = (current, previous) => {
    if (!previous || previous === 0) return null;
    
    const change = ((current - previous) / previous) * 100;
    const isPositive = change > 0;
    
    return {
      percentage: Math.abs(change).toFixed(1),
      isPositive,
      icon: isPositive ? TrendingUp : TrendingDown,
      color: isPositive ? 'text-green-600' : 'text-red-600',
      bgColor: isPositive ? 'bg-green-50' : 'bg-red-50'
    };
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
              <div className="w-8 h-4 bg-gray-200 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="w-16 h-8 bg-gray-200 rounded"></div>
              <div className="w-24 h-4 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Failed to load summary data</h3>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const activeVehicles = vehicles.filter(v => v.status === 'available' || v.status === 'rented').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Transactions */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Activity className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            30 days
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedCounter value={summaryData?.totalTransactions || 0} />
          </div>
          <p className="text-sm text-gray-600">Total Transactions</p>
          
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">
                {summaryData?.totalRefills || 0} refills
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <span className="text-gray-600">
                {summaryData?.totalWithdrawals || 0} withdrawals
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Total Fuel Amount */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <Fuel className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            Active
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedCounter 
              value={summaryData?.totalFuelAmount || 0} 
              formatter={(v) => `${v.toFixed(1)}L`}
            />
          </div>
          <p className="text-sm text-gray-600">Total Fuel Volume</p>
          
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Efficiency</span>
              <span>Good</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Total Cost */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-yellow-100 rounded-xl">
            <DollarSign className="w-6 h-6 text-yellow-600" />
          </div>
          <div className="text-xs text-gray-500">
            Avg: {formatMAD(summaryData?.avgCostPerLiter || 0)}/L
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedCounter 
              value={summaryData?.totalCost || 0} 
              formatter={(v) => formatMAD(v)}
            />
          </div>
          <p className="text-sm text-gray-600">Total Fuel Cost</p>
          
          <div className="flex items-center gap-2 mt-3">
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <BarChart3 className="w-3 h-3" />
              <span>Cost per liter</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fleet Status */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Car className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <CheckCircle className="w-3 h-3" />
            Fleet
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedCounter value={vehicles.length} />
          </div>
          <p className="text-sm text-gray-600">Total Vehicles</p>
          
          <div className="space-y-2 mt-3">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-600">Active</span>
              </div>
              <span className="font-medium text-green-600">{activeVehicles}</span>
            </div>
            
            {maintenanceVehicles > 0 && (
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-gray-600">Maintenance</span>
                </div>
                <span className="font-medium text-orange-600">{maintenanceVehicles}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuelSummaryCards;