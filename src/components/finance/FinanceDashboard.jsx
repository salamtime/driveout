import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DateRangePicker } from '../ui/date-range-picker';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, Users, Car } from 'lucide-react';
import FinanceKPICard from './FinanceKPICard';
import FinanceTrendChart from './FinanceTrendChart';
import FinanceTable from './FinanceTable';
import VehicleFinanceTab from './VehicleFinanceTab';
import { financeApi } from '../../services/financeApi';

/**
 * FinanceDashboard - Comprehensive financial analytics and reporting dashboard
 * 
 * Features:
 * - Real-time KPI monitoring (Revenue, Expenses, Taxes, Gross Profit)
 * - Interactive trend charts for revenue vs costs analysis
 * - Detailed financial tables with sorting and pagination
 * - Vehicle-level financial analysis with drill-down capabilities
 * - Advanced filtering by date range, vehicle, customer, and organization
 * - Responsive design supporting desktop, tablet, and mobile devices
 * - Multi-tenant data isolation with org_id filtering
 * - Loading states, error handling, and empty data scenarios
 */
const FinanceDashboard = ({ onNavigateToFleet = null }) => {
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  
  // Filter states
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0] // today
  });
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState('current');
  const [activeTab, setActiveTab] = useState('overview');

  // Mock data for development (replace with real API calls)
  const mockKPIData = {
    revenue: { value: 125000, change: 12.5, trend: 'up', currency: 'MAD' },
    expenses: { value: 85000, change: -5.2, trend: 'down', currency: 'MAD' },
    taxes: { value: 15000, change: 8.1, trend: 'up', currency: 'MAD' },
    grossProfit: { value: 40000, change: 18.7, trend: 'up', currency: 'MAD' }
  };

  const mockTrendData = [
    { month: 'Jan', revenue: 95000, expenses: 68000 },
    { month: 'Feb', revenue: 105000, expenses: 72000 },
    { month: 'Mar', revenue: 115000, expenses: 78000 },
    { month: 'Apr', revenue: 125000, expenses: 85000 }
  ];

  const mockTableData = {
    rentalPL: [
      { id: 1, rental: 'R001', customer: 'Ahmed Hassan', vehicle: 'Yamaha Raptor 700', revenue: 2500, costs: 1800, profit: 700 },
      { id: 2, rental: 'R002', customer: 'Fatima Al-Zahra', vehicle: 'Honda TRX450R', revenue: 2200, costs: 1600, profit: 600 },
      { id: 3, rental: 'R003', customer: 'Mohammed Benali', vehicle: 'Polaris Sportsman', revenue: 2800, costs: 2000, profit: 800 }
    ],
    vehicleProfitability: [
      { id: 1, vehicle: 'Yamaha Raptor 700', type: 'Sport ATV', revenue: 15000, costs: 10800, profit: 4200, margin: 28 },
      { id: 2, vehicle: 'Honda TRX450R', type: 'Sport ATV', revenue: 13200, costs: 9600, profit: 3600, margin: 27.3 },
      { id: 3, vehicle: 'Polaris Sportsman', type: 'Utility ATV', revenue: 16800, costs: 12000, profit: 4800, margin: 28.6 }
    ]
  };

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // In a real implementation, you would call the finance API here
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        vehicleId: selectedVehicle !== 'all' ? selectedVehicle : null,
        customerId: selectedCustomer !== 'all' ? selectedCustomer : null,
        orgId: selectedOrg !== 'current' ? selectedOrg : null
      };

      // For now, simulate API call with mock data
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setDashboardData({
        kpis: mockKPIData,
        trends: mockTrendData,
        tables: mockTableData
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load financial data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount and filter changes
  useEffect(() => {
    loadDashboardData();
  }, [dateRange, selectedVehicle, selectedCustomer, selectedOrg]);

  // Handle date range changes
  const handleDateRangeChange = (newDateRange) => {
    setDateRange(newDateRange);
  };

  // Handle navigation to fleet management
  const handleNavigateToFleet = (vehicleId = null) => {
    if (onNavigateToFleet) {
      onNavigateToFleet(vehicleId);
    } else {
      // Fallback: show alert or redirect
      alert(`Navigate to Fleet Management${vehicleId ? ` for vehicle ${vehicleId}` : ''}`);
    }
  };

  // Render loading state
  if (loading && !dashboardData) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading financial data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !dashboardData) {
    return (
      <div className="p-4 lg:p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-gray-600 mt-1">Financial analytics, KPIs, and performance insights</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onDateChange={handleDateRangeChange}
            className="w-full sm:w-64"
            placeholder="Select date range"
          />
          
          <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              <SelectItem value="yamaha-raptor">Yamaha Raptor 700</SelectItem>
              <SelectItem value="honda-trx">Honda TRX450R</SelectItem>
              <SelectItem value="polaris-sportsman">Polaris Sportsman</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="vip">VIP Customers</SelectItem>
              <SelectItem value="premium">Premium Customers</SelectItem>
              <SelectItem value="regular">Regular Customers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <FinanceKPICard
          title="Total Revenue"
          value={dashboardData?.kpis?.revenue?.value || 0}
          change={dashboardData?.kpis?.revenue?.change || 0}
          trend={dashboardData?.kpis?.revenue?.trend || 'neutral'}
          currency={dashboardData?.kpis?.revenue?.currency || 'MAD'}
          icon={DollarSign}
          color="green"
        />
        <FinanceKPICard
          title="Total Expenses"
          value={dashboardData?.kpis?.expenses?.value || 0}
          change={dashboardData?.kpis?.expenses?.change || 0}
          trend={dashboardData?.kpis?.expenses?.trend || 'neutral'}
          currency={dashboardData?.kpis?.expenses?.currency || 'MAD'}
          icon={BarChart3}
          color="red"
        />
        <FinanceKPICard
          title="Taxes"
          value={dashboardData?.kpis?.taxes?.value || 0}
          change={dashboardData?.kpis?.taxes?.change || 0}
          trend={dashboardData?.kpis?.taxes?.trend || 'neutral'}
          currency={dashboardData?.kpis?.taxes?.currency || 'MAD'}
          icon={PieChart}
          color="blue"
        />
        <FinanceKPICard
          title="Gross Profit"
          value={dashboardData?.kpis?.grossProfit?.value || 0}
          change={dashboardData?.kpis?.grossProfit?.change || 0}
          trend={dashboardData?.kpis?.grossProfit?.trend || 'neutral'}
          currency={dashboardData?.kpis?.grossProfit?.currency || 'MAD'}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Charts and Tables */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rentals">Rental P&L</TabsTrigger>
          <TabsTrigger value="vehicles">
            <Car className="h-4 w-4 mr-2" />
            Vehicle Finance
          </TabsTrigger>
          <TabsTrigger value="customers">Customer Analysis</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue vs Expenses Trend</CardTitle>
              <CardDescription>Monthly comparison of revenue and operating expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <FinanceTrendChart data={dashboardData?.trends || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rentals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rental Profit & Loss</CardTitle>
              <CardDescription>Individual rental performance and profitability analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <FinanceTable
                data={dashboardData?.tables?.rentalPL || []}
                columns={[
                  { key: 'rental', label: 'Rental ID', sortable: true },
                  { key: 'customer', label: 'Customer', sortable: true },
                  { key: 'vehicle', label: 'Vehicle', sortable: true },
                  { key: 'revenue', label: 'Revenue (MAD)', sortable: true, type: 'currency' },
                  { key: 'costs', label: 'Costs (MAD)', sortable: true, type: 'currency' },
                  { key: 'profit', label: 'Profit (MAD)', sortable: true, type: 'currency' }
                ]}
                searchable={true}
                exportable={true}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicles" className="space-y-6">
          <VehicleFinanceTab
            orgId={selectedOrg !== 'current' ? selectedOrg : null}
            onNavigateToFleet={handleNavigateToFleet}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Analysis</CardTitle>
              <CardDescription>Customer segmentation and lifetime value analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Customer Analytics</h3>
                <p className="text-gray-600">
                  Customer analysis features will be implemented here, including lifetime value,
                  segmentation, and retention metrics.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Financial Reports</CardTitle>
              <CardDescription>Generate and export comprehensive financial reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Financial Reports</h3>
                <p className="text-gray-600">
                  Advanced reporting features will be available here, including P&L statements,
                  cash flow reports, and custom financial analytics.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinanceDashboard;