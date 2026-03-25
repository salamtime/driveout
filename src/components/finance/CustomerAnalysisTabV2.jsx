import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { 
  Users, 
  Search, 
  Download,
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  ExternalLink,
  DollarSign,
  Calendar,
  TrendingUp
} from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

/**
 * CustomerAnalysisTabV2 - Customer financial analysis and segmentation
 * 
 * Features:
 * - Customer lifetime value analysis
 * - Revenue, discounts, and refunds tracking
 * - Last activity monitoring
 * - Click navigation to customer 360 view
 * - Search and sorting capabilities
 */
const CustomerAnalysisTabV2 = ({ 
  filters, 
  customers, 
  loading, 
  onCustomerClick 
}) => {
  // State management
  const [customerData, setCustomerData] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' });

  // Load customer analysis data
  useEffect(() => {
    const loadCustomerData = async () => {
      try {
        setDataLoading(true);
        const data = await financeApiV2.getCustomerAnalysisData(filters);
        setCustomerData(data);
      } catch (error) {
        console.error('Error loading customer analysis data:', error);
      } finally {
        setDataLoading(false);
      }
    };

    if (!loading) {
      loadCustomerData();
    }
  }, [filters, loading]);

  // Handle sorting
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-blue-600" />
      : <ArrowDown className="h-4 w-4 text-blue-600" />;
  };

  // Filter and sort data
  const processedData = React.useMemo(() => {
    let filtered = customerData.filter(customer => 
      customer.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle date sorting
        if (sortConfig.key === 'lastActivity') {
          aValue = new Date(aValue || 0).getTime();
          bValue = new Date(bValue || 0).getTime();
        }

        // Handle numeric sorting
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        // Handle string sorting
        aValue = String(aValue || '').toLowerCase();
        bValue = String(bValue || '').toLowerCase();
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [customerData, searchTerm, sortConfig]);

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Never') return 'Never';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  // Get customer tier based on revenue
  const getCustomerTier = (revenue) => {
    if (revenue >= 10000) return { label: 'VIP', color: 'bg-purple-100 text-purple-800' };
    if (revenue >= 5000) return { label: 'Premium', color: 'bg-blue-100 text-blue-800' };
    if (revenue >= 1000) return { label: 'Regular', color: 'bg-green-100 text-green-800' };
    return { label: 'New', color: 'bg-gray-100 text-gray-800' };
  };

  const handleExport = async () => {
    try {
      const exportData = await financeApiV2.exportCustomerAnalysis(filters);
      const csvContent = [
        exportData.headers.join(','),
        ...exportData.data.map((row) =>
          exportData.headers.map((header) => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',')
              ? `"${value}"`
              : value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportData.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting customer analysis:', error);
    }
  };

  if (loading || dataLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Analysis
            </CardTitle>
            <CardDescription>
              Customer segmentation, lifetime value, and activity analysis
            </CardDescription>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Total Customers</p>
                <p className="text-2xl font-bold text-blue-700">{processedData.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-900">Total Revenue</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatCurrency(processedData.reduce((sum, c) => sum + c.revenue, 0))}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-900">Avg Revenue</p>
                <p className="text-2xl font-bold text-purple-700">
                  {formatCurrency(processedData.length > 0 ? processedData.reduce((sum, c) => sum + c.revenue, 0) / processedData.length : 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-900">Total Rentals</p>
                <p className="text-2xl font-bold text-orange-700">
                  {processedData.reduce((sum, c) => sum + c.rentals, 0)}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Customer Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b-2 border-gray-200">
              <tr>
                <th className="text-left p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('customerName')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Customer
                    {getSortIcon('customerName')}
                  </button>
                </th>
                <th className="text-center p-3 font-medium text-gray-900">Tier</th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('rentals')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Rentals
                    {getSortIcon('rentals')}
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('revenue')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Revenue
                    {getSortIcon('revenue')}
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('discounts')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Discounts
                    {getSortIcon('discounts')}
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('refunds')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Refunds
                    {getSortIcon('refunds')}
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('net')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Net
                    {getSortIcon('net')}
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-gray-900">
                  <button
                    onClick={() => handleSort('lastActivity')}
                    className="flex items-center gap-2 hover:text-blue-600"
                  >
                    Last Activity
                    {getSortIcon('lastActivity')}
                  </button>
                </th>
                <th className="text-center p-3 font-medium text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">No customer data found</p>
                    <p className="text-sm">Customer analysis will appear here once bookings are made</p>
                  </td>
                </tr>
              ) : (
                processedData.map((customer, index) => {
                  const tier = getCustomerTier(customer.revenue);
                  
                  return (
                    <tr 
                      key={customer.customerId || index} 
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3">
                        <div>
                          <p className="font-medium text-gray-900">{customer.customerName}</p>
                          <p className="text-sm text-gray-500">{customer.customerId}</p>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${tier.color}`}>
                          {tier.label}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium">{customer.rentals}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium text-green-700">{formatCurrency(customer.revenue)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium text-orange-700">{formatCurrency(customer.discounts)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-medium text-red-700">{formatCurrency(customer.refunds)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-medium ${customer.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatCurrency(customer.net)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-gray-600">{formatDate(customer.lastActivity)}</span>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCustomerClick && onCustomerClick(customer.customerId)}
                          className="flex items-center gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Customer Segmentation Summary */}
        {processedData.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="font-medium text-gray-900 mb-3">Customer Segmentation</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['VIP', 'Premium', 'Regular', 'New'].map(tierName => {
                const tierCustomers = processedData.filter(c => getCustomerTier(c.revenue).label === tierName);
                const tierRevenue = tierCustomers.reduce((sum, c) => sum + c.revenue, 0);
                
                return (
                  <div key={tierName} className="text-center">
                    <p className="text-sm text-gray-600">{tierName} Customers</p>
                    <p className="font-bold text-lg">{tierCustomers.length}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(tierRevenue)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomerAnalysisTabV2;
