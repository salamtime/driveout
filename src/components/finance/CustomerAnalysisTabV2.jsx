import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  Download,
  ExternalLink,
  DollarSign,
  Calendar,
  TrendingUp,
  Shield,
  WalletCards,
  ReceiptText,
  ArrowDownRight,
  ArrowUpRight
} from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const CustomerAnalysisTabV2 = ({
  filters,
  loading,
  onCustomerClick,
  exportEnabled = true,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [customerData, setCustomerData] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const loadCustomerData = async () => {
      try {
        setDataLoading(true);
        const data = await financeApiV2.getCustomerAnalysisData(filters);
        setCustomerData(data);
      } catch (error) {
        console.error('Error loading customer analysis data:', error);
        setCustomerData([]);
      } finally {
        setDataLoading(false);
      }
    };

    if (!loading) {
      loadCustomerData();
    }
  }, [filters, loading]);

  useEffect(() => {
    if (!selectedCustomerId && customerData.length > 0) {
      setSelectedCustomerId(customerData[0].customerId);
    }
  }, [customerData, selectedCustomerId]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!selectedCustomerId) return;
      try {
        setProfileLoading(true);
        const profile = await financeApiV2.getCustomerFinanceProfile(selectedCustomerId, filters);
        setSelectedProfile(profile);
      } catch (error) {
        console.error('Error loading customer finance profile:', error);
        setSelectedProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    if (!loading && !dataLoading && selectedCustomerId) {
      loadProfile();
    }
  }, [selectedCustomerId, filters, loading, dataLoading]);

  const processedData = useMemo(() => {
    return customerData
      .filter((customer) => String(customer.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.revenue - a.revenue);
  }, [customerData, searchTerm]);

  const formatCurrency = (value) =>
    `${new Intl.NumberFormat(isFrench ? 'fr-MA' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(value || 0))} MAD`;

  const formatDate = (dateString, options = {}) => {
    if (!dateString) return tr('Not recorded', 'Non enregistré');
    try {
      return new Date(dateString).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options
      });
    } catch {
      return tr('Invalid date', 'Date invalide');
    }
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

  const getTier = (revenue) => {
    if (revenue >= 10000) return { label: 'VIP', className: 'bg-violet-100 text-violet-700' };
    if (revenue >= 5000) return { label: tr('Premium', 'Premium'), className: 'bg-sky-100 text-sky-700' };
    if (revenue >= 1000) return { label: tr('Regular', 'Régulier'), className: 'bg-emerald-100 text-emerald-700' };
    return { label: tr('New', 'Nouveau'), className: 'bg-slate-100 text-slate-600' };
  };

  if (loading || dataLoading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="rounded-2xl bg-violet-50 p-3">
            <Users className="h-6 w-6 animate-pulse text-violet-700" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">{tr('Loading customer finance...', 'Chargement de la finance client...')}</h3>
          <p className="text-sm text-slate-500">
            {tr('We are preparing customer money profiles and contract timelines for the current filters.', 'Nous préparons les profils financiers clients et les chronologies de contrats pour les filtres actuels.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
              <Users className="h-6 w-6 text-violet-700" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Customer Finance', 'Finance client')}</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{tr('Customer money profiles and contract timelines', 'Profils financiers client et chronologies contrat')}</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {tr('See what each customer has paid, what is still due, how much security is still pending, and the money story of every linked contract.', 'Voyez ce que chaque client a payé, ce qui reste dû, quelle garantie reste à recevoir, et l’histoire financière de chaque contrat lié.')}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={tr('Search customers...', 'Rechercher des clients...')}
                className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-300 sm:w-72"
              />
            </div>
            {exportEnabled ? (
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
              >
                <Download className="h-4 w-4" />
                {tr('Export CSV', 'Exporter CSV')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-2">
            <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-900">{tr('Customers', 'Clients')}</p>
                  <p className="mt-2 text-2xl font-bold text-sky-700">{processedData.length}</p>
                </div>
                <Users className="h-8 w-8 text-sky-600" />
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-900">{tr('Revenue', 'Revenus')}</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(processedData.reduce((sum, c) => sum + c.revenue, 0))}</p>
                </div>
                <DollarSign className="h-8 w-8 text-emerald-600" />
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-violet-900">{tr('Average value', 'Valeur moyenne')}</p>
                  <p className="mt-2 text-2xl font-bold text-violet-700">
                    {formatCurrency(processedData.length ? processedData.reduce((sum, c) => sum + c.revenue, 0) / processedData.length : 0)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-violet-600" />
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-900">{tr('Contracts', 'Contrats')}</p>
                  <p className="mt-2 text-2xl font-bold text-amber-700">{processedData.reduce((sum, c) => sum + c.rentals, 0)}</p>
                </div>
                <Calendar className="h-8 w-8 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{tr('Customer finance cards', 'Cartes finance client')}</h3>
                <p className="text-sm text-slate-600">{tr('Pick a customer to inspect the complete finance profile and contract timeline.', 'Choisissez un client pour inspecter le profil financier complet et la chronologie des contrats.')}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {processedData.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                  {tr('No customer finance data found yet.', 'Aucune donnée de finance client trouvée pour le moment.')}
                </div>
              ) : (
                processedData.map((customer) => {
                  const tier = getTier(customer.revenue);
                  const isSelected = selectedCustomerId === customer.customerId;
                  return (
                    <button
                      key={customer.customerId}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.customerId)}
                      className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                        isSelected
                          ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-[0_18px_48px_rgba(76,29,149,0.10)]'
                          : 'border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-bold text-slate-900">{customer.customerName}</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tier.className}`}>{tier.label}</span>
                            {isSelected && (
                              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">{tr('Selected', 'Sélectionné')}</span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{customer.customerId}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-sm font-semibold text-emerald-700">{formatCurrency(customer.revenue)}</p>
                          <p className="text-xs text-slate-500">{customer.rentals} {tr('contracts', 'contrats')}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Net', 'Net')}</p>
                          <p className={`mt-1 font-semibold ${customer.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(customer.net)}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Refunds', 'Remboursements')}</p>
                          <p className="mt-1 font-semibold text-amber-700">{formatCurrency(customer.refunds)}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Discounts', 'Remises')}</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatCurrency(customer.discounts)}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Last activity', 'Dernière activité')}</p>
                          <p className="mt-1 font-semibold text-slate-900">{formatDate(customer.lastActivity)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {profileLoading ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="text-5xl leading-none animate-pulse">⏳</div>
                <h3 className="text-xl font-semibold text-slate-900">{tr('Loading customer profile...', 'Chargement du profil client...')}</h3>
              </div>
            </div>
          ) : selectedProfile ? (
            <>
              <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Customer finance profile', 'Profil finance client')}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{selectedProfile.customerName}</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {tr('This profile separates rental payments from security, highlights outstanding balances, and exposes the money timeline for each linked contract.', 'Ce profil sépare les paiements location de la garantie, met en évidence les soldes restants et expose la chronologie financière de chaque contrat lié.')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onCustomerClick && onCustomerClick(selectedProfile.customerId)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {tr('Open Customer', 'Ouvrir client')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/80 p-5">
                  <p className="text-sm font-medium text-emerald-900">{tr('Total agreed revenue', 'Revenu convenu total')}</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(selectedProfile.totalRevenue)}</p>
                </div>
                <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/80 p-5">
                  <p className="text-sm font-medium text-sky-900">{tr('Paid so far', 'Payé à ce jour')}</p>
                  <p className="mt-2 text-2xl font-bold text-sky-700">{formatCurrency(selectedProfile.totalPaid)}</p>
                </div>
                <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/80 p-5">
                  <p className="text-sm font-medium text-rose-900">{tr('Still due', 'Reste dû')}</p>
                  <p className="mt-2 text-2xl font-bold text-rose-700">{formatCurrency(selectedProfile.totalOutstanding)}</p>
                </div>
                <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
                  <p className="text-sm font-medium text-violet-900">{tr('Security still due', 'Garantie restant à recevoir')}</p>
                  <p className="mt-2 text-2xl font-bold text-violet-700">{formatCurrency(selectedProfile.securityStillDue)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-6">
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                        <WalletCards className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{tr('Money summary', 'Résumé argent')}</h3>
                        <p className="text-sm text-slate-600">{tr('The customer-level finance picture across all linked contracts.', 'La lecture financière au niveau client sur l’ensemble des contrats liés.')}</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {[
                        { label: tr('Contracts', 'Contrats'), value: `${selectedProfile.rentalCount}`, tone: 'slate' },
                        { label: tr('Active contracts', 'Contrats actifs'), value: `${selectedProfile.activeContracts}`, tone: 'sky' },
                        { label: tr('Refunds', 'Remboursements'), value: formatCurrency(selectedProfile.totalRefunds), tone: 'amber' },
                        { label: tr('Security required', 'Garantie requise'), value: formatCurrency(selectedProfile.securityRequired), tone: 'violet' },
                        { label: tr('Security received', 'Garantie reçue'), value: formatCurrency(selectedProfile.securityReceived), tone: 'emerald' },
                        { label: tr('Last activity', 'Dernière activité'), value: formatDate(selectedProfile.lastActivity), tone: 'slate' }
                      ].map((item) => (
                        <div key={item.label} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                          <p className="mt-2 text-lg font-bold text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                        <Shield className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{tr('Security status', 'Statut garantie')}</h3>
                        <p className="text-sm text-slate-600">{tr('Keeps security separate from rental payment, so staff can read custody clearly.', 'Maintient la garantie séparée du paiement location pour une lecture claire de la garde.')}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-[1.25rem] border border-violet-100 bg-violet-50/80 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">{tr('Required', 'Requise')}</p>
                        <p className="mt-2 text-lg font-bold text-violet-700">{formatCurrency(selectedProfile.securityRequired)}</p>
                      </div>
                      <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50/80 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{tr('Received', 'Reçue')}</p>
                        <p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(selectedProfile.securityReceived)}</p>
                      </div>
                      <div className="rounded-[1.25rem] border border-rose-100 bg-rose-50/80 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">{tr('Still due', 'Restant')}</p>
                        <p className="mt-2 text-lg font-bold text-rose-700">{formatCurrency(selectedProfile.securityStillDue)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                      <ReceiptText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{tr('Contract finance timelines', 'Chronologies financières contrat')}</h3>
                      <p className="text-sm text-slate-600">{tr('Each box tells the money story of one rental or tour: agreed amount, paid, outstanding, security, and timeline events.', 'Chaque bloc raconte l’histoire financière d’une location ou d’un tour : montant convenu, payé, restant, garantie et événements chronologiques.')}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {selectedProfile.rentals.map((contract) => (
                      <div key={`${contract.type}-${contract.id}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{contract.type}</span>
                              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">{contract.rentalId}</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${String(contract.paymentStatus).toLowerCase() === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {contract.paymentStatus}
                              </span>
                            </div>
                            <p className="mt-3 text-lg font-bold text-slate-900">{contract.vehicleDisplay}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatDate(contract.startAt)} • {tr('Status', 'Statut')}: {contract.status}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => window.location.href = contract.href}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {tr('Open', 'Ouvrir')}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-5">
                          <div className="rounded-xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Agreed', 'Convenu')}</p>
                            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(contract.totalAmount)}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Paid', 'Payé')}</p>
                            <p className="mt-1 font-semibold text-emerald-700">{formatCurrency(contract.paidAmount)}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Outstanding', 'Restant')}</p>
                            <p className="mt-1 font-semibold text-rose-700">{formatCurrency(contract.remainingAmount)}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Security', 'Garantie')}</p>
                            <p className="mt-1 font-semibold text-violet-700">{formatCurrency(contract.securityRequired)}</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Security received', 'Garantie reçue')}</p>
                            <p className="mt-1 font-semibold text-sky-700">{formatCurrency(contract.securityReceived)}</p>
                          </div>
                        </div>

                        {contract.securityDocumentLabel && (
                          <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/80 px-4 py-3 text-sm text-violet-700">
                            <span className="font-semibold">{tr('Held document:', 'Document retenu :')}</span> {contract.securityDocumentLabel}
                          </div>
                        )}

                        <div className="mt-4 space-y-3">
                          {contract.timeline.map((event) => {
                            const toneClass = event.tone === 'emerald'
                              ? 'bg-emerald-100 text-emerald-700'
                              : event.tone === 'amber'
                                ? 'bg-amber-100 text-amber-700'
                                : event.tone === 'rose'
                                  ? 'bg-rose-100 text-rose-700'
                                  : event.tone === 'violet'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-slate-100 text-slate-600';
                            return (
                              <div key={`${contract.id}-${event.key}-${event.timestamp}`} className="flex flex-col gap-2 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{event.label}</span>
                                    <span className="text-xs text-slate-500">{formatDate(event.timestamp, { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  {event.note && (
                                    <p className="mt-2 text-sm text-slate-500">{event.note}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {typeof event.amount === 'number' && (
                                    <span className={`text-sm font-bold ${event.amount >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                                      {event.amount > 0 ? (
                                        <span className="inline-flex items-center gap-1">
                                          <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                                          {formatCurrency(event.amount)}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1">
                                          <ArrowDownRight className="h-4 w-4 text-rose-600" />
                                          {formatCurrency(event.amount)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-4 text-slate-500">
                  <Users className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{tr('Select a customer', 'Sélectionnez un client')}</h3>
                <p className="text-sm text-slate-500">{tr('Choose any customer card on the left to open the finance profile and contract timelines.', 'Choisissez une carte client à gauche pour ouvrir le profil financier et les chronologies contrat.')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerAnalysisTabV2;
