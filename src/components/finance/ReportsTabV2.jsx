import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const tr = (en, fr) => t(en, fr);
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
          throw new Error(tr('Unknown report type', 'Type de rapport inconnu'));
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
      
      toast.success(tr('Report exported successfully', 'Rapport exporté avec succès'));
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error(tr('Failed to export report', "Impossible d'exporter le rapport"));
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
      title: tr('Period P&L Statement', 'Compte de résultat de la période'),
      description: tr('Comprehensive profit and loss statement for the selected period', 'Compte de résultat complet pour la période sélectionnée'),
      icon: BarChart3,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      includes: [tr('Daily revenue trends', 'Tendances quotidiennes du revenu'), tr('Expense breakdowns', 'Répartition des dépenses'), tr('Tax calculations', 'Calculs de taxes'), tr('Net profit analysis', 'Analyse du bénéfice net')]
    },
    {
      id: 'vehicle_profitability',
      title: tr('Vehicle Profitability Report', 'Rapport de rentabilité des véhicules'),
      description: tr('Individual vehicle performance and ROI analysis', 'Analyse des performances individuelles des véhicules et du ROI'),
      icon: Car,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      includes: [tr('Revenue per vehicle', 'Revenu par véhicule'), tr('Operating costs', "Coûts d'exploitation"), tr('Profit margins', 'Marges bénéficiaires'), tr('Utilization rates', "Taux d'utilisation")]
    },
    {
      id: 'ar_aging',
      title: tr('Accounts Receivable Aging', 'Ancienneté des créances clients'),
      description: tr('Outstanding balances and collection analysis', 'Analyse des soldes impayés et du recouvrement'),
      icon: Calendar,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      includes: [tr('Current balances', 'Soldes actuels'), tr('Aging buckets', "Tranches d'ancienneté"), tr('Collection risks', 'Risques de recouvrement'), tr('Customer payment patterns', 'Habitudes de paiement clients')]
    },
    {
      id: 'customer_analysis',
      title: tr('Customer Financial Analysis', 'Analyse financière des clients'),
      description: tr('Customer lifetime value and segmentation report', 'Rapport sur la valeur vie client et la segmentation'),
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      includes: [tr('Customer tiers', 'Catégories de clients'), tr('Lifetime value', 'Valeur vie client'), tr('Revenue trends', 'Tendances de revenu'), tr('Activity patterns', "Schémas d'activité")]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tr('Financial Reports', 'Rapports financiers')}
          </CardTitle>
          <CardDescription>
            {tr('Generate and export comprehensive financial reports for the period:', 'Générez et exportez des rapports financiers complets pour la période :')} {formatDateRange()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{tr('Period:', 'Période :')} {formatDateRange()}</span>
            </div>
            {filters.vehicleIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Car className="h-4 w-4" />
                <span>{filters.vehicleIds.length} {tr(filters.vehicleIds.length !== 1 ? 'vehicles selected' : 'vehicle selected', filters.vehicleIds.length !== 1 ? 'véhicules sélectionnés' : 'véhicule sélectionné')}</span>
              </div>
            )}
            {filters.customerIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>{filters.customerIds.length} {tr(filters.customerIds.length !== 1 ? 'customers selected' : 'customer selected', filters.customerIds.length !== 1 ? 'clients sélectionnés' : 'client sélectionné')}</span>
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
            {tr('Quick Exports', 'Exports rapides')}
          </CardTitle>
          <CardDescription>
            {tr('One-click exports for common financial reports', 'Exports en un clic pour les rapports financiers courants')}
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
              <span className="font-medium">{tr('Period P&L', 'P&L période')}</span>
              <span className="text-xs text-gray-500">{tr('CSV Export', 'Export CSV')}</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('vehicle_profitability')}
            >
              <Car className="h-8 w-8 text-green-600" />
              <span className="font-medium">{tr('Vehicle Reports', 'Rapports véhicules')}</span>
              <span className="text-xs text-gray-500">{tr('CSV Export', 'Export CSV')}</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('ar_aging')}
            >
              <Calendar className="h-8 w-8 text-orange-600" />
              <span className="font-medium">{tr('AR Aging', 'Ancienneté créances')}</span>
              <span className="text-xs text-gray-500">{tr('CSV Export', 'Export CSV')}</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => handleExportReport('customer_analysis')}
            >
              <Users className="h-8 w-8 text-purple-600" />
              <span className="font-medium">{tr('Customers', 'Clients')}</span>
              <span className="text-xs text-gray-500">{tr('CSV Export', 'Export CSV')}</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={onExport}
            >
              <FileText className="h-8 w-8 text-purple-600" />
              <span className="font-medium">{tr('Current View', 'Vue actuelle')}</span>
              <span className="text-xs text-gray-500">{tr('CSV Export', 'Export CSV')}</span>
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
                    <h4 className="font-medium text-gray-900 mb-2">{tr('Includes:', 'Comprend :')}</h4>
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
                      {tr('Export CSV', 'Exporter CSV')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-gray-400"
                    >
                      {tr('XLSX (Soon)', 'XLSX (Bientôt)')}
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
          <CardTitle className="text-lg">{tr("Export Guidelines", "Consignes d'export")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">{tr('Data Scope', 'Portée des données')}</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>{tr('• All exports respect current filter selections', '• Tous les exports respectent les filtres actuels')}</li>
                <li>{tr(`• Date range: ${formatDateRange()}`, `• Période : ${formatDateRange()}`)}</li>
                <li>{tr('• Multi-tenant data isolation maintained', '• Isolation des données multi-tenant maintenue')}</li>
                <li>{tr('• Real-time data from rentals, maintenance, fuel, and vehicle lifecycle logs', '• Données en temps réel provenant des locations, de la maintenance, du carburant et du cycle de vie des véhicules')}</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">{tr('File Formats', 'Formats de fichier')}</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>{tr('• CSV: Compatible with Excel, Google Sheets', '• CSV : compatible avec Excel et Google Sheets')}</li>
                <li>{tr('• UTF-8 encoding for international characters', '• Encodage UTF-8 pour les caractères internationaux')}</li>
                <li>{tr('• Comma-separated with quoted text fields', '• Valeurs séparées par des virgules avec les champs texte entre guillemets')}</li>
                <li>{tr('• XLSX format coming soon', '• Format XLSX bientôt disponible')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsTabV2;
