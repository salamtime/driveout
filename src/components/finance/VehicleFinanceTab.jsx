import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Car, 
  TrendingUp, 
  DollarSign, 
  BarChart3, 
  PieChart, 
  ExternalLink,
  RefreshCw,
  Filter,
  Download
} from 'lucide-react';
import VehicleProfitabilityChart from './VehicleProfitabilityChart';
import VehicleAcquisitionTable from './VehicleAcquisitionTable';
import FinanceKPICard from './FinanceKPICard';
import { financeApi } from '../../services/financeApi';

/**
 * VehicleFinanceTab - Comprehensive vehicle-level financial analysis component
 * 
 * Features:
 * - Vehicle profitability visualization and analysis
 * - Acquisition cost vs current value tracking
 * - ROI analysis and performance metrics
 * - Fleet-wide financial summaries
 * - Drill-down integration with Fleet Management
 * - Export functionality for financial reports
 */
const VehicleFinanceTab = ({ 
  orgId = null,
  onNavigateToFleet = null 
}) => {
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vehicleProfitability, setVehicleProfitability] = useState([]);
  const [vehicleAcquisition, setVehicleAcquisition] = useState([]);
  const [vehicleROI, setVehicleROI] = useState([]);
  const [fleetSummary, setFleetSummary] = useState(null);
  const [vehicleList, setVehicleList] = useState([]);
  
  // Filter states
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [dateRange, setDateRange] = useState('12months');
  const [activeTab, setActiveTab] = useState('profitability');

  // Load vehicle finance data
  const loadVehicleFinanceData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        orgId: orgId,
        vehicleId: selectedVehicle !== 'all' ? selectedVehicle : undefined,
        startDate: getStartDateForRange(dateRange),
        endDate: new Date().toISOString().split('T')[0]
      };

      const [
        profitabilityData,
        acquisitionData,
        roiData,
        fleetData,
        vehicles
      ] = await Promise.all([
        financeApi.getVehicleProfitability(params),
        financeApi.getVehicleAcquisition(params),
        financeApi.getVehicleROIAnalysis(params),
        financeApi.getFleetFinanceSummary(orgId),
        financeApi.getVehicleList(orgId)
      ]);

      setVehicleProfitability(profitabilityData);
      setVehicleAcquisition(acquisitionData);
      setVehicleROI(roiData);
      setFleetSummary(fleetData);
      setVehicleList(vehicles);

    } catch (err) {
      console.error('Error loading vehicle finance data:', err);
      setError('Failed to load vehicle financial data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get start date for date range filter
  const getStartDateForRange = (range) => {
    const now = new Date();
    switch (range) {
      case '3months':
        return new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
      case '6months':
        return new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
      case '12months':
        return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
      case '24months':
        return new Date(now.setFullYear(now.getFullYear() - 2)).toISOString().split('T')[0];
      default:
        return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    }
  };

  // Load data on component mount and filter changes
  useEffect(() => {
    loadVehicleFinanceData();
  }, [selectedVehicle, dateRange, orgId]);

  // Handle vehicle drill-down
  const handleVehicleClick = (vehicleId, vehicleName) => {
    if (onNavigateToFleet) {
      onNavigateToFleet(vehicleId);
    } else {
      // Fallback: filter to show only this vehicle
      setSelectedVehicle(vehicleId);
    }
  };

  // Handle data export
  const handleExportData = (data, filename = 'vehicle_finance_data') => {
    const csvContent = convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Convert data to CSV format
  const convertToCSV = (data) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(value => 
        typeof value === 'string' && value.includes(',') ? `"${value}"` : value
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading vehicle financial data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button onClick={loadVehicleFinanceData} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="h-6 w-6" />
            Vehicle Finance Analysis
          </h2>
          <p className="text-gray-600 mt-1">
            Comprehensive financial performance analysis for fleet vehicles
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {vehicleList.map(vehicle => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} ({vehicle.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
              <SelectItem value="24months">Last 24 Months</SelectItem>
            </SelectContent>
          </Select>

          {onNavigateToFleet && (
            <Button variant="outline" onClick={() => onNavigateToFleet()} className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Fleet Management
            </Button>
          )}
        </div>
      </div>

      {/* Fleet Summary KPIs */}
      {fleetSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FinanceKPICard
            title="Fleet Revenue"
            value={fleetSummary.totalRevenue}
            change={12.5}
            trend="up"
            currency="MAD"
            icon={DollarSign}
            color="green"
          />
          <FinanceKPICard
            title="Fleet Costs"
            value={fleetSummary.totalCosts}
            change={-3.2}
            trend="down"
            currency="MAD"
            icon={BarChart3}
            color="red"
          />
          <FinanceKPICard
            title="Fleet Profit"
            value={fleetSummary.totalProfit}
            change={18.7}
            trend="up"
            currency="MAD"
            icon={TrendingUp}
            color="purple"
          />
          <FinanceKPICard
            title="Average ROI"
            value={fleetSummary.avgROI}
            change={5.4}
            trend="up"
            currency="%"
            icon={PieChart}
            color="blue"
          />
        </div>
      )}

      {/* Vehicle Finance Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="roi">ROI Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="space-y-6">
          <VehicleProfitabilityChart
            data={vehicleProfitability}
            loading={loading}
            onVehicleClick={handleVehicleClick}
            showProfit={true}
            height={400}
          />

          {/* Top and Bottom Performers */}
          {fleetSummary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Top Performers
                  </CardTitle>
                  <CardDescription>Most profitable vehicles in the fleet</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fleetSummary.topPerformers.slice(0, 5).map((vehicle, index) => (
                      <div key={vehicle.vehicle_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium text-green-900">{vehicle.vehicle_name}</p>
                          <p className="text-sm text-green-700">{vehicle.vehicle_type}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-800">{formatCurrency(vehicle.annual_profit)}</p>
                          <p className="text-sm text-green-600">{vehicle.profit_margin_pct.toFixed(1)}% margin</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                    Attention Needed
                  </CardTitle>
                  <CardDescription>Vehicles requiring financial attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fleetSummary.bottomPerformers.slice(0, 5).map((vehicle, index) => (
                      <div key={vehicle.vehicle_id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-medium text-red-900">{vehicle.vehicle_name}</p>
                          <p className="text-sm text-red-700">{vehicle.vehicle_type}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-800">{formatCurrency(vehicle.annual_profit)}</p>
                          <p className="text-sm text-red-600">{vehicle.profit_margin_pct.toFixed(1)}% margin</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="acquisition" className="space-y-6">
          <VehicleAcquisitionTable
            data={vehicleAcquisition}
            loading={loading}
            onVehicleClick={handleVehicleClick}
            onExport={(data) => handleExportData(data, 'vehicle_acquisition')}
            showDepreciation={true}
          />
        </TabsContent>

        <TabsContent value="roi" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Return on Investment Analysis
              </CardTitle>
              <CardDescription>
                ROI performance and payback analysis for fleet vehicles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vehicleROI.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <PieChart className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">ROI Analysis Coming Soon</p>
                  <p className="text-sm">ROI analysis features will be available once sufficient data is collected.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vehicleROI.map((vehicle) => (
                    <Card key={vehicle.vehicle_id} className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => handleVehicleClick(vehicle.vehicle_id, vehicle.vehicle_name)}>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-900">{vehicle.vehicle_name}</h4>
                          <p className="text-sm text-gray-600">{vehicle.vehicle_model}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">ROI:</span>
                              <span className={`font-medium ${vehicle.roi_percentage > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {vehicle.roi_percentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Payback:</span>
                              <span className="font-medium">{vehicle.payback_period_months} months</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Monthly Profit:</span>
                              <span className="font-medium">{formatCurrency(vehicle.profit_per_month)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VehicleFinanceTab;