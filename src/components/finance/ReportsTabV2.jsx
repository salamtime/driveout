import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { 
  FileText, 
  Download, 
  BarChart3, 
  PieChart, 
  TrendingUp,
  Calendar,
  DollarSign,
  Users,
  Car
} from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import { toast } from 'react-hot-toast';

/**
 * ReportsTabV2 - Quick export functionality for financial reports
 * 
 * Features:
 * - Period P&L export
 * - Vehicle profitability export
 * - AR aging export
 * - Customer analysis export
 * - CSV/XLSX format support
 * - Quick action buttons
 */
const ReportsTabV2 = ({ filters, onExport }) => {
  // Handle specific report exports
  const handleExportReport = async (reportType) => {
    try {
      let exportData;
      
      switch (reportType) {
        case 'period_pl':
          exportData = await financeApiV2.exportPeriodPL(filters);
          break;
        case 'vehicle_profitability':
          exportData = await financeApiV2.exportVehicleProfitability(filters);
          break;
        case 'ar_aging':
          exportData = await financeApiV2.exportARAging(filters);
          break;
        case 'customer_analysis':
          exportData = await financeApiV2.exportCustomerAnalysis(filters);
          break;
        default:
          throw new Error('Unknown report type');
      }
      
      // Create and download CSV
      const csvContent = [
        exportData.headers.join(','),
        ...exportData.data.map(row => 
          exportData.headers.map(header => {
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
      
      toast.success(`${reportType.replace('_', ' ').toUpperCase()} exported successfully`);
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  // Format date range for display
  const formatDateRange = () => {
    try {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      const formatter = new Intl.DateTimeFormat('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
    } catch {
      return `${filters.startDate} – ${filters.endDate}`;
    }
  };

  // Report configurations
  const reports = [
    {
      id: 'period_pl',
      title: 'Period P&L Statement',
      description: 'Comprehensive profit and loss statement for the selected period',
      icon: BarChart3,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      includes: ['Daily revenue trends', 'Expense breakdowns', 'Tax calculations', 'Net profit analysis']
    },
    {
      id: 'vehicle_profitability',
      title: 'Vehicle Profitability Report',
      description: 'Individual vehicle performance and ROI analysis',
      icon: Car,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      includes: ['Revenue per vehicle', 'Operating costs', 'Profit margins', 'Utilization rates']
    },
    {
      id: 'ar_aging',
      title: 'Accounts Receivable Aging',
      description: 'Outstanding balances and collection analysis',
      icon: Calendar,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      includes: ['Current balances', 'Aging buckets', 'Collection risks', 'Customer payment patterns']
    },
    {
      id: 'customer_analysis',
      title: 'Customer Financial Analysis',
      description: 'Customer lifetime value and segmentation report',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      includes: ['Customer tiers', 'Lifetime value', 'Revenue trends', 'Activity patterns']
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Financial Reports
          </CardTitle>
          <CardDescription>
            Generate and export comprehensive financial reports for the period: {formatDateRange()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>Period: {formatDateRange()}</span>
            </div>
            {filters.vehicleIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Car className="h-4 w-4" />
                <span>{filters.vehicleIds.length} vehicle{filters.vehicleIds.length !== 1 ? 's' : ''} selected</span>
              </div>
            )}
            {filters.customerIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>{filters.customerIds.length} customer{filters.customerIds.length !== 1 ? 's' : ''} selected</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Export Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Quick Exports
          </CardTitle>
          <CardDescription>
            One-click exports for common financial reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('period_pl')}
            >
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <span className="font-medium">Period P&L</span>
              <span className="text-xs text-gray-500">CSV Export</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('vehicle_profitability')}
            >
              <Car className="h-8 w-8 text-green-600" />
              <span className="font-medium">Vehicle Reports</span>
              <span className="text-xs text-gray-500">CSV Export</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('ar_aging')}
            >
              <Calendar className="h-8 w-8 text-orange-600" />
              <span className="font-medium">AR Aging</span>
              <span className="text-xs text-gray-500">CSV Export</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('customer_analysis')}
            >
              <Users className="h-8 w-8 text-purple-600" />
              <span className="font-medium">Customers</span>
              <span className="text-xs text-gray-500">CSV Export</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={onExport}
            >
              <FileText className="h-8 w-8 text-purple-600" />
              <span className="font-medium">Current View</span>
              <span className="text-xs text-gray-500">CSV Export</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Report Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;
          
          return (
            <Card key={report.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${report.bgColor}`}>
                      <Icon className={`h-6 w-6 ${report.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{report.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {report.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Includes:</h4>
                    <ul className="space-y-1">
                      {report.includes.map((item, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleExportReport(report.id)}
                      className="flex-1"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-gray-400"
                    >
                      XLSX (Soon)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Export Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Data Scope</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• All exports respect current filter selections</li>
                <li>• Date range: {formatDateRange()}</li>
                <li>• Multi-tenant data isolation maintained</li>
                <li>• Real-time data from rentals, maintenance, fuel, and vehicle lifecycle logs</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">File Formats</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• CSV: Compatible with Excel, Google Sheets</li>
                <li>• UTF-8 encoding for international characters</li>
                <li>• Comma-separated with quoted text fields</li>
                <li>• XLSX format coming soon</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsTabV2;
