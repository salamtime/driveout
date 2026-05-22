import React from 'react';
import {
  FileText,
  Download,
  BarChart3,
  Calendar,
  Users,
  Car,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import { toast } from 'react-hot-toast';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const reportToneMap = {
  blue: {
    iconShell: 'bg-sky-50 text-sky-700',
    bullet: 'bg-sky-400',
    button: 'border-sky-200 hover:border-sky-300 hover:bg-sky-50',
  },
  green: {
    iconShell: 'bg-emerald-50 text-emerald-700',
    bullet: 'bg-emerald-400',
    button: 'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50',
  },
  amber: {
    iconShell: 'bg-amber-50 text-amber-700',
    bullet: 'bg-amber-400',
    button: 'border-amber-200 hover:border-amber-300 hover:bg-amber-50',
  },
  violet: {
    iconShell: 'bg-violet-50 text-violet-700',
    bullet: 'bg-violet-400',
    button: 'border-violet-200 hover:border-violet-300 hover:bg-violet-50',
  },
};

/**
 * ReportsTabV2 - Quick export functionality for financial reports
 */
const ReportsTabV2 = ({ filters, onExport }) => {
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

      const csvContent = [
        exportData.headers.join(','),
        ...exportData.data.map((row) =>
          exportData.headers.map((header) => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',')
              ? `"${value}"`
              : value;
          }).join(',')
        ),
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

  const formatDateRange = () => {
    try {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      const formatter = new Intl.DateTimeFormat(isFrenchLocale() ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
    } catch {
      return `${filters.startDate} - ${filters.endDate}`;
    }
  };

  const reports = [
    {
      id: 'period_pl',
      title: tr('Period P&L Statement', 'Compte de résultat de la période'),
      description: tr(
        'Comprehensive profit and loss statement for the selected period.',
        'Compte de résultat complet pour la période sélectionnée.'
      ),
      icon: BarChart3,
      tone: 'blue',
      includes: [
        tr('Daily revenue trends', 'Tendances quotidiennes du revenu'),
        tr('Expense breakdowns', 'Répartition des dépenses'),
        tr('Tax calculations', 'Calculs de taxes'),
        tr('Net profit analysis', 'Analyse du bénéfice net'),
      ],
    },
    {
      id: 'vehicle_profitability',
      title: tr('Vehicle Profitability Report', 'Rapport de rentabilité des véhicules'),
      description: tr(
        'Individual vehicle performance and ROI analysis.',
        'Analyse des performances individuelles des véhicules et du ROI.'
      ),
      icon: Car,
      tone: 'green',
      includes: [
        tr('Revenue per vehicle', 'Revenu par véhicule'),
        tr('Operating costs', "Coûts d'exploitation"),
        tr('Profit margins', 'Marges bénéficiaires'),
        tr('Utilization rates', "Taux d'utilisation"),
      ],
    },
    {
      id: 'ar_aging',
      title: tr('Accounts Receivable Aging', 'Ancienneté des créances clients'),
      description: tr(
        'Outstanding balances and collection analysis.',
        'Analyse des soldes impayés et du recouvrement.'
      ),
      icon: Calendar,
      tone: 'amber',
      includes: [
        tr('Current balances', 'Soldes actuels'),
        tr("Aging buckets", "Tranches d'ancienneté"),
        tr('Collection risks', 'Risques de recouvrement'),
        tr('Customer payment patterns', 'Habitudes de paiement clients'),
      ],
    },
    {
      id: 'customer_analysis',
      title: tr('Customer Financial Analysis', 'Analyse financière des clients'),
      description: tr(
        'Customer lifetime value and segmentation report.',
        'Rapport sur la valeur vie client et la segmentation.'
      ),
      icon: Users,
      tone: 'violet',
      includes: [
        tr('Customer tiers', 'Catégories de clients'),
        tr('Lifetime value', 'Valeur vie client'),
        tr('Revenue trends', 'Tendances de revenu'),
        tr("Activity patterns", "Schémas d'activité"),
      ],
    },
  ];

  const summaryStats = [
    {
      label: tr('Report templates', 'Modèles de rapports'),
      value: reports.length,
      tone: 'text-violet-700',
    },
    {
      label: tr('Selected period', 'Période sélectionnée'),
      value: formatDateRange(),
      tone: 'text-slate-900',
    },
    {
      label: tr('Vehicle filters', 'Filtres véhicules'),
      value: filters.vehicleIds.length > 0 ? filters.vehicleIds.length : tr('All', 'Tous'),
      tone: 'text-slate-900',
    },
    {
      label: tr('Customer filters', 'Filtres clients'),
      value: filters.customerIds.length > 0 ? filters.customerIds.length : tr('All', 'Tous'),
      tone: 'text-slate-900',
    },
  ];

  const quickActions = [
    {
      key: 'period_pl',
      label: tr('Period P&L', 'P&L période'),
      eyebrow: tr('CSV export', 'Export CSV'),
      icon: BarChart3,
      tone: reportToneMap.blue,
      onClick: () => handleExportReport('period_pl'),
    },
    {
      key: 'vehicle_profitability',
      label: tr('Vehicle Reports', 'Rapports véhicules'),
      eyebrow: tr('CSV export', 'Export CSV'),
      icon: Car,
      tone: reportToneMap.green,
      onClick: () => handleExportReport('vehicle_profitability'),
    },
    {
      key: 'ar_aging',
      label: tr('AR Aging', 'Ancienneté créances'),
      eyebrow: tr('CSV export', 'Export CSV'),
      icon: Calendar,
      tone: reportToneMap.amber,
      onClick: () => handleExportReport('ar_aging'),
    },
    {
      key: 'customer_analysis',
      label: tr('Customers', 'Clients'),
      eyebrow: tr('CSV export', 'Export CSV'),
      icon: Users,
      tone: reportToneMap.violet,
      onClick: () => handleExportReport('customer_analysis'),
    },
    {
      key: 'current_view',
      label: tr('Current View', 'Vue actuelle'),
      eyebrow: tr('CSV export', 'Export CSV'),
      icon: FileText,
      tone: reportToneMap.violet,
      onClick: onExport,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
              <FileText className="h-6 w-6 text-violet-700" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Reports', 'Rapports')}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {tr('Finance export workspace', "Espace d'export finance")}
              </h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {tr(
                  'Generate clean exports for the current finance scope without leaving the admin workspace style.',
                  "Générez des exports propres pour la portée finance actuelle sans quitter le style de l'espace admin."
                )}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm">
            {formatDateRange()}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {summaryStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4 shadow-sm"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {stat.label}
              </p>
              <p className={`mt-2 text-xl font-bold tracking-[-0.03em] ${stat.tone}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-violet-50 p-3">
            <Download className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Quick exports', 'Exports rapides')}
            </p>
            <h4 className="mt-2 text-xl font-semibold text-slate-900">
              {tr('One-click report exports', 'Exports de rapports en un clic')}
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              {tr(
                'Use these shortcuts when you need the most common finance files immediately.',
                'Utilisez ces raccourcis lorsque vous avez besoin immédiatement des fichiers finance les plus courants.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                className={`rounded-[24px] border bg-white px-4 py-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 ${action.tone.button}`}
              >
                <div className={`inline-flex rounded-2xl p-3 ${action.tone.iconShell}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold text-slate-900">{action.label}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {action.eyebrow}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Report library', 'Bibliothèque des rapports')}
            </p>
            <h4 className="mt-2 text-xl font-semibold text-slate-900">
              {tr('Detailed report packs', 'Packs de rapports détaillés')}
            </h4>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {reports.map((report) => {
              const Icon = report.icon;
              const tone = reportToneMap[report.tone] || reportToneMap.violet;

              return (
                <article
                  key={report.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 ${tone.iconShell}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="text-lg font-semibold text-slate-900">{report.title}</h5>
                      <p className="mt-2 text-sm text-slate-500">{report.description}</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {tr('Includes', 'Comprend')}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {report.includes.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                          <span className={`h-1.5 w-1.5 rounded-full ${tone.bullet}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleExportReport(report.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition hover:scale-[1.01] sm:w-auto sm:flex-1"
                    >
                      <Download className="h-4 w-4" />
                      {tr('Export CSV', 'Exporter CSV')}
                    </button>
                    <div className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-400 sm:w-auto">
                      {tr('XLSX soon', 'XLSX bientôt')}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Export rules', "Règles d'export")}
            </p>
            <h4 className="mt-2 text-xl font-semibold text-slate-900">
              {tr('What each file respects', 'Ce que respecte chaque fichier')}
            </h4>
          </div>

          <div className="mt-5 space-y-5">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('Data scope', 'Portée des données')}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  {tr('All exports respect the current filter selections.', 'Tous les exports respectent les filtres actuels.')}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  {tr(`Date range: ${formatDateRange()}`, `Période : ${formatDateRange()}`)}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  {tr('Workspace and tenant isolation remain enforced.', "L'isolation de l'espace et du tenant reste appliquée.")}
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  {tr(
                    'Data pulls from rentals, maintenance, fuel, expenses, and vehicle lifecycle sources.',
                    'Les données proviennent des locations, de la maintenance, du carburant, des dépenses et du cycle de vie des véhicules.'
                  )}
                </li>
              </ul>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('File format notes', 'Notes de format de fichier')}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-violet-600" />
                  {tr('CSV works with Excel and Google Sheets.', 'Le CSV fonctionne avec Excel et Google Sheets.')}
                </li>
                <li className="flex items-start gap-2">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-violet-600" />
                  {tr('UTF-8 encoding is used for multilingual text.', "L'encodage UTF-8 est utilisé pour les textes multilingues.")}
                </li>
                <li className="flex items-start gap-2">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-violet-600" />
                  {tr('Comma-separated rows quote text fields when needed.', 'Les lignes séparées par virgules protègent les champs texte si nécessaire.')}
                </li>
                <li className="flex items-start gap-2">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-violet-600" />
                  {tr('XLSX export can be added later without changing the report definitions.', "L'export XLSX pourra être ajouté plus tard sans changer les définitions des rapports.")}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ReportsTabV2;
