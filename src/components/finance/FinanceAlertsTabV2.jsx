import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ShieldAlert,
  WalletCards,
  Wrench,
  Car,
  ExternalLink,
  CircleAlert,
  ReceiptText,
  Landmark,
  BadgeCheck
} from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import walletTopupApi from '../../services/walletTopupApi';
import i18n from '../../i18n';

const FinanceAlertsTabV2 = ({ filters, refreshTrigger }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState(null);
  const [trustData, setTrustData] = useState(null);
  const [reviewingTopupId, setReviewingTopupId] = useState('');

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        setLoading(true);
        const [alerts, trust] = await Promise.all([
          financeApiV2.getFinanceAlerts(filters),
          financeApiV2.getFinanceTrustData(filters)
        ]);
        setAlertsData(alerts);
        setTrustData(trust);
      } catch (error) {
        console.error('Error loading finance alerts:', error);
        setAlertsData(null);
        setTrustData(null);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, [filters, refreshTrigger]);

  const reloadAlerts = async () => {
    try {
      setLoading(true);
      const [alerts, trust] = await Promise.all([
        financeApiV2.getFinanceAlerts(filters),
        financeApiV2.getFinanceTrustData(filters)
      ]);
      setAlertsData(alerts);
      setTrustData(trust);
    } catch (error) {
      console.error('Error reloading finance alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewWalletTopup = async (row, nextStatus) => {
    try {
      setReviewingTopupId(row.id);
      const reviewNote = nextStatus === 'rejected'
        ? (window.prompt(tr('Add a short rejection note', 'Ajoutez une courte note de rejet')) || '').trim()
        : '';

      if (nextStatus === 'rejected' && !reviewNote) {
        toast.error(tr('A rejection note is required.', 'Une note de rejet est requise.'));
        return;
      }

      await walletTopupApi.reviewTopup(row.id, {
        status: nextStatus,
        reviewNote,
      });

      toast.success(
        nextStatus === 'approved'
          ? tr('Wallet top-up approved and credited.', 'Recharge portefeuille approuvée et créditée.')
          : tr('Wallet top-up rejected.', 'Recharge portefeuille rejetée.')
      );

      await reloadAlerts();
    } catch (error) {
      toast.error(error?.message || tr('Unable to review this top-up.', "Impossible d'examiner cette recharge."));
    } finally {
      setReviewingTopupId('');
    }
  };

  const formatCurrency = (value) =>
    `${new Intl.NumberFormat(isFrench ? 'fr-MA' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(value || 0))} MAD`;

  const iconMap = useMemo(() => ({
    unpaid_contract: WalletCards,
    security_due: ShieldAlert,
    maintenance_recovery_pending: Wrench,
    negative_vehicle_roi: Car,
    high_vehicle_cost: CircleAlert
  }), []);

  const severityStyles = {
    high: 'border-rose-200 bg-rose-50/80 text-rose-700',
    medium: 'border-amber-200 bg-amber-50/80 text-amber-700',
    low: 'border-sky-200 bg-sky-50/80 text-sky-700'
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="text-5xl leading-none animate-pulse">⏳</div>
          <h3 className="text-xl font-semibold text-slate-900">{tr('Loading finance controls...', 'Chargement des contrôles finance...')}</h3>
        </div>
      </div>
    );
  }

  const rows = alertsData?.rows || [];
  const proofQueue = trustData?.paymentProofQueue || [];
  const walletAccounts = trustData?.walletAccounts || [];
  const reconciliationGap = Number(trustData?.walletReconciliationGap || 0);
  const hasGap = Math.abs(reconciliationGap) > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Finance Alerts', 'Alertes finance')}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{tr('Operating controls and money risk signals', 'Contrôles opérationnels et signaux de risque financier')}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tr('Use this page to act on the money problems hiding across Rentals, Maintenance, Security, and Vehicle performance.', 'Utilisez cette page pour agir sur les problèmes financiers cachés à travers Locations, Maintenance, Garantie et performance véhicule.')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/80 p-5">
          <p className="text-sm font-medium text-rose-900">{tr('Unpaid contracts', 'Contrats impayés')}</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{formatCurrency(alertsData?.unpaidTotal || 0)}</p>
        </div>
        <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
          <p className="text-sm font-medium text-violet-900">{tr('Security still due', 'Garantie restant à recevoir')}</p>
          <p className="mt-2 text-2xl font-bold text-violet-700">{formatCurrency(alertsData?.securityDueTotal || 0)}</p>
        </div>
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/80 p-5">
          <p className="text-sm font-medium text-amber-900">{tr('Maintenance recovery pending', 'Recouvrement maintenance en attente')}</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(alertsData?.maintenanceRecoveryPendingTotal || 0)}</p>
        </div>
        <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/80 p-5">
          <p className="text-sm font-medium text-sky-900">{tr('Vehicles with negative ROI', 'Véhicules à ROI négatif')}</p>
          <p className="mt-2 text-2xl font-bold text-sky-700">{alertsData?.negativeVehicleCount || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-900">{tr('Wallet balance on platform', 'Solde portefeuille plateforme')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(trustData?.totalWalletBalance || 0)}</p>
            </div>
            <Landmark className="h-8 w-8 text-emerald-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">{tr('Pending top-ups', 'Recharges en attente')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(trustData?.pendingTopupsTotal || 0)}</p>
            </div>
            <WalletCards className="h-8 w-8 text-amber-600" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-violet-100 bg-violet-50/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-violet-900">{tr('Pending proofs to review', 'Preuves en attente')}</p>
              <p className="mt-2 text-2xl font-bold text-violet-700">
                {(trustData?.pendingBookingProofCount || 0) + (trustData?.pendingWalletProofCount || 0)}
              </p>
            </div>
            <ReceiptText className="h-8 w-8 text-violet-600" />
          </div>
        </div>
        <div className={`rounded-[1.75rem] border p-5 ${hasGap ? 'border-rose-100 bg-rose-50/80' : 'border-sky-100 bg-sky-50/80'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-medium ${hasGap ? 'text-rose-900' : 'text-sky-900'}`}>{tr('Wallet reconciliation gap', 'Écart de rapprochement')}</p>
              <p className={`mt-2 text-2xl font-bold ${hasGap ? 'text-rose-700' : 'text-sky-700'}`}>{formatCurrency(reconciliationGap)}</p>
            </div>
            <BadgeCheck className={`h-8 w-8 ${hasGap ? 'text-rose-600' : 'text-sky-600'}`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <ReceiptText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr('Payment proof review queue', 'File de revue des preuves')}</h3>
              <p className="text-sm text-slate-600">{tr('Booking proofs and wallet top-up proofs are grouped together here so finance can review the live queue in one place.', 'Les preuves de réservation et de recharge portefeuille sont regroupées ici pour que la finance révise la file en direct en un seul endroit.')}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {proofQueue.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                {tr('No payment proofs found yet.', 'Aucune preuve de paiement trouvée pour le moment.')}
              </div>
            ) : proofQueue.map((row) => {
              const statusTone =
                row.status === 'approved' || row.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : row.status === 'rejected'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700';
              const typeTone = row.proofType === 'wallet'
                ? 'bg-sky-100 text-sky-700'
                : 'bg-violet-100 text-violet-700';

              return (
                <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${typeTone}`}>
                          {row.proofType === 'wallet' ? tr('Wallet proof', 'Preuve portefeuille') : tr('Booking proof', 'Preuve réservation')}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>{row.status}</span>
                      </div>
                      <h4 className="mt-3 text-lg font-bold text-slate-900">
                        {row.bookingReference
                          ? `${row.bookingReference} • ${row.customerName}`
                          : row.customerName}
                      </h4>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.ownerLabel} • {row.methodLabel}
                        {row.submittedAt ? ` • ${new Date(row.submittedAt).toLocaleString(isFrench ? 'fr-FR' : 'en-US')}` : ''}
                      </p>
                      {row.reviewNote ? (
                        <p className="mt-2 text-sm text-slate-500">{row.reviewNote}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                      <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Amount', 'Montant')}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(row.amount)}</p>
                      </div>
                      {row.proofUrl ? (
                        <a
                          href={row.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {tr('Open proof', 'Ouvrir la preuve')}
                        </a>
                      ) : null}
                      {row.href && row.proofType !== 'wallet' ? (
                        <button
                          type="button"
                          onClick={() => window.location.href = row.href}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {tr('Open', 'Ouvrir')}
                        </button>
                      ) : null}
                      {row.proofType === 'wallet' && ['pending', 'submitted', 'review'].includes(row.status) ? (
                        <>
                          <button
                            type="button"
                            disabled={reviewingTopupId === row.id}
                            onClick={() => handleReviewWalletTopup(row, 'approved')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            {tr('Approve', 'Approuver')}
                          </button>
                          <button
                            type="button"
                            disabled={reviewingTopupId === row.id}
                            onClick={() => handleReviewWalletTopup(row, 'rejected')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300"
                          >
                            <AlertTriangle className="h-4 w-4" />
                            {tr('Reject', 'Rejeter')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <Landmark className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{tr('Wallet reconciliation', 'Rapprochement portefeuille')}</h3>
                <p className="text-sm text-slate-600">{tr('Use this to compare wallet balances visible on the platform against the approved and adjusted ledger behind them.', 'Utilisez ceci pour comparer les soldes portefeuilles visibles sur la plateforme avec le journal approuvé et ajusté qui les soutient.')}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {[
                { label: tr('Approved top-ups', 'Recharges approuvées'), value: trustData?.approvedTopupsTotal || 0, tone: 'emerald' },
                { label: tr('Manual adjustments', 'Ajustements manuels'), value: trustData?.manualAdjustmentsTotal || 0, tone: 'sky' },
                { label: tr('Expected ledger total', 'Total attendu du journal'), value: trustData?.walletLedgerExpectedTotal || 0, tone: 'violet' },
                { label: tr('Current wallet balances', 'Soldes portefeuilles actuels'), value: trustData?.totalWalletBalance || 0, tone: 'slate' },
                { label: tr('Rejected top-ups', 'Recharges rejetées'), value: trustData?.rejectedTopupsTotal || 0, tone: 'rose' },
                { label: tr('Verified wallets', 'Portefeuilles vérifiés'), value: trustData?.verifiedWalletCount || 0, tone: 'emerald', numericOnly: true },
                { label: tr('Pending wallets', 'Portefeuilles en attente'), value: trustData?.pendingWalletCount || 0, tone: 'amber', numericOnly: true }
              ].map((item) => (
                <div key={item.label} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {item.numericOnly ? item.value : formatCurrency(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                <WalletCards className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{tr('Top wallet accounts', 'Principaux comptes portefeuille')}</h3>
                <p className="text-sm text-slate-600">{tr('The accounts with the highest wallet value and the latest top-up pressure.', 'Les comptes avec la plus forte valeur portefeuille et la dernière pression de recharge.')}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {walletAccounts.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                  {tr('No wallet accounts found yet.', 'Aucun compte portefeuille trouvé pour le moment.')}
                </div>
              ) : walletAccounts.map((row) => (
                <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{row.ownerLabel}</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.verificationState === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {row.verificationState}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{row.ownerType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(row.balance)}</p>
                      <p className="text-xs text-slate-500">
                        {tr('Pending', 'En attente')} {formatCurrency(row.pendingTopups)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{tr('Action queue', 'File d’action')}</h3>
            <p className="text-sm text-slate-600">{tr('Highest-risk items are pushed to the top so the team knows what to resolve next.', 'Les éléments les plus risqués remontent en haut pour que l’équipe sache quoi résoudre ensuite.')}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
              {tr('No finance alerts for the current filters.', 'Aucune alerte finance pour les filtres actuels.')}
            </div>
          ) : (
            rows.map((row) => {
              const Icon = iconMap[row.type] || AlertTriangle;
              return (
                <div key={row.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-2xl bg-white p-3 text-violet-700 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityStyles[row.severity]}`}>{row.severity}</span>
                        {row.sourceLabel && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{row.sourceLabel}</span>
                        )}
                      </div>
                      <h4 className="mt-3 text-lg font-bold text-slate-900">{row.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{row.description}</p>
                    </div>

                    <div className="flex flex-wrap gap-3 lg:justify-end">
                      <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Amount', 'Montant')}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(row.amount)}</p>
                      </div>
                      {typeof row.secondaryAmount === 'number' && (
                        <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Reference', 'Référence')}</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(row.secondaryAmount)}</p>
                        </div>
                      )}
                      {row.href && (
                        <button
                          type="button"
                          onClick={() => window.location.href = row.href}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {tr('Open', 'Ouvrir')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceAlertsTabV2;
