import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Loader2, Plus, Receipt, Tag, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { receiveFundsService } from '../../services/receiveFundsService';
import { canRecordReceiveFunds } from '../../utils/permissionHelpers';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const formatMoney = (value) =>
  `${new Intl.NumberFormat(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))} MAD`;

const formatDateLabel = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isEmbeddableImage = (url) =>
  /^data:image\//i.test(String(url || '')) ||
  /^blob:/i.test(String(url || '')) ||
  /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(String(url || ''));

const FinanceExpensesTabV2 = ({ filters, refreshTrigger, onAddExpense }) => {
  const { userProfile } = useAuth();
  const canRecord = canRecordReceiveFunds(userProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [receiptPreview, setReceiptPreview] = useState(null);

  useEffect(() => {
    let isActive = true;

    const loadExpenses = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await receiveFundsService.listEntries(filters, userProfile);
        if (!isActive) return;
        setEntries((payload?.entries || []).filter((entry) => entry.entryType === 'expense'));
      } catch (loadError) {
        console.error('Failed to load finance expenses:', loadError);
        if (!isActive) return;
        setEntries([]);
        setError(loadError?.message || tr('Failed to load expenses.', 'Impossible de charger les dépenses.'));
      } finally {
        if (isActive) setLoading(false);
      }
    };

    void loadExpenses();
    return () => {
      isActive = false;
    };
  }, [filters, refreshTrigger, userProfile]);

  const summary = useMemo(() => {
    const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const labelCounts = new Map();

    entries.forEach((entry) => {
      const firstLabel = Array.isArray(entry.labels) && entry.labels.length > 0
        ? entry.labels[0]
        : tr('Unlabeled', 'Sans label');
      labelCounts.set(firstLabel, (labelCounts.get(firstLabel) || 0) + 1);
    });

    const topLabel =
      [...labelCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ||
      tr('None yet', 'Aucune');

    return {
      total,
      count: entries.length,
      topLabel,
    };
  }, [entries]);

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Expenses', 'Dépenses')}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">
              {tr('Manage purchase expenses', 'Gérer les dépenses d’achat')}
            </h3>
          </div>

          <button
            type="button"
            onClick={onAddExpense}
            disabled={!canRecord}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {tr('Add Expense', 'Ajouter une dépense')}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('This range', 'Cette période')}</p>
            <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{formatMoney(summary.total)}</p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Entries', 'Entrées')}</p>
            <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{summary.count}</p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Top label', 'Label principal')}</p>
            <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{summary.topLabel}</p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-violet-600" />
        </div>
      ) : error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">{tr('No expenses yet', 'Aucune dépense pour le moment')}</p>
          <p className="mt-2 text-sm text-slate-500">{tr('Use Add Expense to log the first purchase.', 'Utilisez Ajouter une dépense pour enregistrer le premier achat.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const firstLabel = Array.isArray(entry.labels) && entry.labels.length > 0
              ? entry.labels[0]
              : tr('Unlabeled', 'Sans label');

            return (
              <article
                key={entry.id}
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {tr('Expense', 'Dépense')}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        <Tag className="h-3.5 w-3.5" />
                        {firstLabel}
                      </span>
                    </div>

                    <p className="mt-3 text-2xl font-bold tracking-[-0.05em] text-slate-950">{formatMoney(entry.amount)}</p>
                    {entry.note ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{entry.note}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-slate-500 sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {tr('Date', 'Date')}
                      </p>
                      <p className="mt-2 font-semibold text-slate-900">{formatDateLabel(entry.receivedDate)}</p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <User className="h-3.5 w-3.5" />
                        {tr('Staff', 'Staff')}
                      </p>
                      <p className="mt-2 font-semibold text-slate-900">{entry.recordedByDisplayName || tr('Team', 'Équipe')}</p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <Receipt className="h-3.5 w-3.5" />
                        {tr('Receipt', 'Reçu')}
                      </p>
                      {entry.receiptImageUrl ? (
                        <button
                          type="button"
                          onClick={() => setReceiptPreview({
                            url: entry.receiptImageUrl,
                            label: firstLabel,
                            amount: entry.amount,
                          })}
                          className="mt-2 inline-flex items-center gap-2 font-semibold text-violet-700 transition hover:text-violet-800"
                        >
                          {tr('Open image', "Ouvrir l'image")}
                        </button>
                      ) : (
                        <p className="mt-2 font-semibold text-slate-400">{tr('No receipt', 'Aucun reçu')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {receiptPreview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 shadow-[0_32px_90px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
              <div className="min-w-0">
                <h4 className="truncate text-2xl font-bold tracking-[-0.04em] text-white">{tr('Receipt image', 'Image du reçu')}</h4>
                <p className="mt-1 text-sm text-slate-400">
                  {receiptPreview.label} • {formatMoney(receiptPreview.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>

            <div className="bg-slate-950 p-4">
              {isEmbeddableImage(receiptPreview.url) ? (
                <img
                  src={receiptPreview.url}
                  alt={tr('Receipt preview', 'Aperçu du reçu')}
                  className="max-h-[75vh] w-full rounded-[22px] bg-slate-900 object-contain"
                />
              ) : (
                <iframe
                  src={receiptPreview.url}
                  title={tr('Receipt preview', 'Aperçu du reçu')}
                  className="h-[75vh] w-full rounded-[22px] border border-slate-800 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FinanceExpensesTabV2;
