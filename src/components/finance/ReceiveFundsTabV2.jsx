import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  canAccessOwnerBankMethods,
  canRecordReceiveFunds,
  canReviewReceiveFunds,
  canUseBankDepositMethod,
} from '../../utils/permissionHelpers';
import { receiveFundsService } from '../../services/receiveFundsService';
import { getStaffDirectory } from '../../services/UserService';
import { uploadFile } from '../../utils/storageUpload';
import { buildStaffDisplayMap, buildStaffDisplayName, normalizeAdminRecipients } from '../../utils/receiveFundsUi';
import { buildExpenseNote, loadExpenseLabelPresets, saveExpenseLabelPresets, uniqueLabels } from '../../utils/expenseLabels';
import PhotoCapture from '../video/PhotoCapture';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const formatMoney = (value) =>
  `${new Intl.NumberFormat(isFrenchLocale() ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))} MAD`;

const formatDateLabel = (value, options = {}) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', options);
};

const todayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const METHOD_OPTIONS = [
  {
    key: 'cash',
    title: tr('Cash', 'Espèces'),
    subtitle: tr('Collected in person', 'Collecté en main propre'),
    icon: Banknote,
    tone: 'text-emerald-700',
    activeClass: 'border-emerald-300 bg-emerald-50 shadow-[0_16px_34px_rgba(16,185,129,0.14)]',
  },
  {
    key: 'bank_deposit',
    title: tr('Deposit', 'Dépôt'),
    subtitle: tr('Received to bank account', 'Reçu sur compte bancaire'),
    icon: Landmark,
    tone: 'text-violet-700',
    activeClass: 'border-violet-300 bg-violet-50 shadow-[0_16px_34px_rgba(124,58,237,0.14)]',
  },
  {
    key: 'wire_transfer',
    title: tr('Bank Transfer', 'Virement bancaire'),
    subtitle: tr('Transferred between accounts', 'Transféré entre comptes'),
    icon: ArrowDownToLine,
    tone: 'text-sky-700',
    activeClass: 'border-sky-300 bg-sky-50 shadow-[0_16px_34px_rgba(14,165,233,0.14)]',
  },
];

const STATUS_STYLES = {
  matched: {
    label: tr('Matched', 'Équilibré'),
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panel: 'border-emerald-200 bg-emerald-50/70',
  },
  under_collected: {
    label: tr('Under-collected', 'Sous-collecté'),
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    panel: 'border-amber-200 bg-amber-50/80',
  },
  over_collected: {
    label: tr('Over-collected', 'Sur-collecté'),
    chip: 'border-sky-200 bg-sky-50 text-sky-700',
    panel: 'border-sky-200 bg-sky-50/80',
  },
  pending_review: {
    label: tr('Pending review', 'À vérifier'),
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    panel: 'border-rose-200 bg-rose-50/80',
  },
  idle: {
    label: tr('No activity yet', "Pas encore d'activité"),
    chip: 'border-slate-200 bg-slate-50 text-slate-600',
    panel: 'border-slate-200 bg-slate-50/80',
  },
};

const EXPENSE_SAVE_NOTICE_STYLES = {
  saving: {
    container: 'border-amber-200 bg-amber-50 text-amber-800',
    iconClass: 'text-amber-600',
    icon: Loader2,
    spin: true,
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconClass: 'text-emerald-600',
    icon: CheckCircle2,
    spin: false,
  },
  error: {
    container: 'border-rose-200 bg-rose-50 text-rose-800',
    iconClass: 'text-rose-600',
    icon: AlertTriangle,
    spin: false,
  },
};

const getEntryVisual = (entry) => {
  if (entry.entryType === 'expense' || entry.method === 'expense') {
    return {
      icon: ClipboardList,
      iconClass: 'bg-rose-100 text-rose-700',
      chipClass: 'bg-slate-100 text-slate-700',
      label: tr('Expense', 'Dépense'),
    };
  }

  if (entry.method === 'cash') {
    return {
      icon: Banknote,
      iconClass: 'bg-emerald-100 text-emerald-700',
      chipClass: 'bg-emerald-100 text-emerald-700',
      label: tr('Cash', 'Espèces'),
    };
  }

  if (entry.method === 'bank_deposit') {
    return {
      icon: Landmark,
      iconClass: 'bg-violet-100 text-violet-700',
      chipClass: 'bg-violet-100 text-violet-700',
      label: tr('Deposit', 'Dépôt'),
    };
  }

  return {
    icon: ArrowDownToLine,
    iconClass: 'bg-sky-100 text-sky-700',
    chipClass: 'bg-sky-100 text-sky-700',
    label: tr('Bank Transfer', 'Virement bancaire'),
  };
};

const ReceiveFundsTabV2 = ({ filters, refreshTrigger, openComposerRequest = 0, openExpenseComposerRequest = 0, openEditComposerRequest = null }) => {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reversingId, setReversingId] = useState(null);
  const [error, setError] = useState('');
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [dashboard, setDashboard] = useState({
    tableReady: true,
    entries: [],
    summary: {
      expectedRevenue: 0,
      cashReceived: 0,
      bankDepositReceived: 0,
      wireTransferReceived: 0,
      totalReceived: 0,
      variance: 0,
      absoluteVariance: 0,
      reconciliationStatus: 'idle',
      sentence: '',
      reviewCount: 0,
    },
    reviewItems: [],
  });
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState('funds');
  const [editingEntry, setEditingEntry] = useState(null);
  const [expenseModeReady, setExpenseModeReady] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const [adminRecipients, setAdminRecipients] = useState([]);
  const [staffDisplayMap, setStaffDisplayMap] = useState({});
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [showReceiptCapture, setShowReceiptCapture] = useState(false);
  const [expenseLabelPresets, setExpenseLabelPresets] = useState([]);
  const [selectedExpenseLabels, setSelectedExpenseLabels] = useState([]);
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const [showExpenseNote, setShowExpenseNote] = useState(false);
  const [expenseSaveFeedback, setExpenseSaveFeedback] = useState(null);
  const receiptCaptureRef = useRef(null);
  const receiptImportInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const [form, setForm] = useState({
    method: 'cash',
    amount: '',
    receivedDate: todayKey(),
    receivedByAdminUserId: '',
    receivedByAdminDisplayName: '',
    note: '',
  });

  const canRecord = canRecordReceiveFunds(userProfile);
  const canReview = canReviewReceiveFunds(userProfile);
  const canUseOwnerBankMethods = canAccessOwnerBankMethods(userProfile);
  const canUseBankDeposit = canUseBankDepositMethod(userProfile);
  const selectedMethodOption = METHOD_OPTIONS.find((option) => option.key === form.method) || METHOD_OPTIONS[0];
  const isExpenseMode = composerMode === 'expense';
  const isEditing = Boolean(editingEntry);
  const expenseLabelsScopeId = String(
    userProfile?.organization_id ||
    userProfile?.organizationId ||
    userProfile?.workspace_id ||
    userProfile?.workspaceId ||
    'shared'
  ).trim() || 'shared';

  const resetComposerForm = (mode = composerMode, recipients = adminRecipients, options = {}) => {
    if (options.clearEditing !== false) {
      setEditingEntry(null);
    }
    setForm({
      method: 'cash',
      amount: '',
      receivedDate: todayKey(),
      receivedByAdminUserId: mode === 'funds' ? (recipients[0]?.id || '') : '',
      receivedByAdminDisplayName: mode === 'funds' ? (recipients[0]?.label || '') : '',
      note: '',
    });
    setReceiptFile(null);
    setShowDateInput(false);
    setShowReceiptCapture(false);
    setSelectedExpenseLabels([]);
    setNewExpenseLabel('');
    setShowExpenseNote(false);
    if (options.clearExpenseFeedback !== false) {
      setExpenseSaveFeedback(null);
    }
  };

  useEffect(() => {
    setExpenseLabelPresets(loadExpenseLabelPresets(expenseLabelsScopeId));
  }, [expenseLabelsScopeId]);

  const handleReceiptImport = (event) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) return;
    setReceiptFile(nextFile);
    setShowReceiptCapture(false);
    event.target.value = '';
  };

  const openEditEntry = async (entry) => {
    if (!entry || entry.status !== 'active') {
      toast.error(tr('Reversed entries cannot be edited.', 'Les entrées annulées ne peuvent pas être modifiées.'));
      return;
    }

    if (entry.entryType === 'expense') {
      const ready = await receiveFundsService.refreshExpensesTableExists();
      setExpenseModeReady(Boolean(ready));
      if (!ready) {
        toast.error(
          tr(
            'Edit Expense needs the finance_expenses table. Run the finance expenses migration first.',
            "Modifier une dépense nécessite la table finance_expenses. Exécutez d'abord la migration des dépenses finance."
          )
        );
        return;
      }
    }

    const nextMode = entry.entryType === 'expense' ? 'expense' : 'funds';
    setComposerMode(nextMode);
    setEditingEntry(entry);
    setForm({
      method: nextMode === 'funds' ? (entry.method || 'cash') : 'cash',
      amount: String(entry.amount || ''),
      receivedDate: entry.receivedDate || todayKey(),
      receivedByAdminUserId: nextMode === 'funds' ? (entry.receivedByAdminUserId || '') : '',
      receivedByAdminDisplayName: nextMode === 'funds' ? (entry.receivedByAdminDisplayName || '') : '',
      note: entry.note || '',
    });
    setReceiptFile(null);
    setShowDateInput(false);
    setShowReceiptCapture(false);
    setSelectedExpenseLabels(nextMode === 'expense' && Array.isArray(entry.labels) ? entry.labels : []);
    setNewExpenseLabel('');
    setShowExpenseNote(false);
    setExpenseSaveFeedback(null);
    setShowComposer(true);
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError('');
      const nextDashboard = await receiveFundsService.getDashboardData(filters, userProfile);
      setDashboard(nextDashboard);
    } catch (loadError) {
      console.error('Failed to load receive funds dashboard:', loadError);
      setError(loadError.message || tr('Failed to load receive funds.', 'Impossible de charger les fonds reçus.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [filters?.endDate, filters?.orgId, filters?.startDate, refreshTrigger, userProfile?.id]);

  useEffect(() => {
    if (openComposerRequest > 0 && canRecord) {
      setComposerMode('funds');
      resetComposerForm('funds');
      setShowComposer(true);
    }
  }, [openComposerRequest, canRecord]);

  useEffect(() => {
    if (openExpenseComposerRequest > 0 && canRecord) {
      void openExpenseMode(true);
    }
  }, [openExpenseComposerRequest, canRecord]);

  useEffect(() => {
    if (openEditComposerRequest?.entry && canRecord) {
      void openEditEntry(openEditComposerRequest.entry);
    }
  }, [openEditComposerRequest?.requestId, canRecord]);

  useEffect(() => {
    let isActive = true;

    const loadExpenseModeReady = async () => {
      try {
        const ready = await receiveFundsService.checkExpensesTableExists();
        if (isActive) {
          setExpenseModeReady(Boolean(ready));
        }
      } catch (_error) {
        if (isActive) {
          setExpenseModeReady(false);
        }
      }
    };

    void loadExpenseModeReady();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!canUseBankDeposit && form.method === 'bank_deposit') {
      setForm((current) => ({ ...current, method: 'cash' }));
      return;
    }

    if (!canUseOwnerBankMethods && form.method === 'wire_transfer') {
      setForm((current) => ({ ...current, method: 'cash' }));
    }
  }, [canUseBankDeposit, canUseOwnerBankMethods, form.method]);

  useEffect(() => {
    if (typeof document === 'undefined' || !showComposer) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showComposer]);

  useEffect(() => {
    if (!showReceiptCapture) return undefined;

    const scrollToCapture = () => {
      receiptCaptureRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    };

    scrollToCapture();
    const timeoutId = window.setTimeout(scrollToCapture, 0);
    return () => window.clearTimeout(timeoutId);
  }, [showReceiptCapture]);

  useEffect(() => {
    let isActive = true;

    const loadAdmins = async () => {
      try {
        setAdminsLoading(true);
        const users = await getStaffDirectory();
        if (!isActive) return;
        const nextAdmins = normalizeAdminRecipients(users);
        setStaffDisplayMap(buildStaffDisplayMap(users));
        setAdminRecipients(nextAdmins);
        setForm((current) => {
          if (current.receivedByAdminUserId || nextAdmins.length === 0) {
            return current;
          }
          return {
            ...current,
            receivedByAdminUserId: nextAdmins[0].id,
            receivedByAdminDisplayName: nextAdmins[0].label,
          };
        });
      } catch (loadError) {
        console.error('Failed to load admin recipients:', loadError);
        if (isActive) {
          setStaffDisplayMap({});
          setAdminRecipients([]);
        }
      } finally {
        if (isActive) {
          setAdminsLoading(false);
        }
      }
    };

    if (canRecord) {
      void loadAdmins();
    }

    return () => {
      isActive = false;
    };
  }, [canRecord]);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [receiptFile]);

  useEffect(() => {
    if (!showComposer || !isExpenseMode) return;
    const timeoutId = window.setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select?.();
    }, 40);
    return () => window.clearTimeout(timeoutId);
  }, [showComposer, isExpenseMode]);

  const handleSaveEntry = async () => {
    try {
      if (!isExpenseMode && adminRecipients.length > 0 && !form.receivedByAdminUserId) {
        toast.error(tr('Choose which admin received the funds.', "Choisissez l'admin qui a reçu les fonds."));
        return;
      }

      if (isEditing && editingEntry?.status !== 'active') {
        toast.error(tr('Reversed entries cannot be edited.', 'Les entrées annulées ne peuvent pas être modifiées.'));
        return;
      }

      setSaving(true);
      let receiptUpload = null;
      if (receiptFile) {
        const scopeId = String(
          userProfile?.organization_id ||
            userProfile?.organizationId ||
            userProfile?.workspace_id ||
            userProfile?.workspaceId ||
            'shared'
        ).trim();
        receiptUpload = await uploadFile(receiptFile, {
          bucket: 'rental-documents',
          pathPrefix: `receive-funds/${scopeId}`,
          optimizationProfile: 'document',
        });
        if (!receiptUpload?.success) {
          throw new Error(receiptUpload?.error || tr('Receipt upload failed.', "L'envoi du reçu a échoué."));
        }
      }

      if (isEditing) {
        if (isExpenseMode) {
          setExpenseSaveFeedback({
            status: 'saving',
            title: tr('Saving expense…', 'Enregistrement de la dépense…'),
            message: tr('Please wait while we save this purchase.', "Veuillez patienter pendant l'enregistrement de cet achat."),
          });
          await receiveFundsService.updateExpense(
            editingEntry.id,
            {
              amount: form.amount,
              receivedDate: form.receivedDate,
              note: form.note,
              labels: selectedExpenseLabels,
              ...(receiptUpload?.url ? { receiptImageUrl: receiptUpload.url } : {}),
            },
            userProfile
          );
          resetComposerForm('expense', adminRecipients, { clearExpenseFeedback: false });
          setExpenseSaveFeedback({
            status: 'success',
            title: tr('Expense updated.', 'Dépense mise à jour.'),
            message: tr('The purchase expense was saved successfully.', "La dépense d'achat a bien été enregistrée."),
          });
          toast.success(tr('Expense updated.', 'Dépense mise à jour.'));
        } else {
          await receiveFundsService.updateEntry(
            editingEntry.id,
            {
              amount: form.amount,
              method: form.method,
              receivedDate: form.receivedDate,
              receivedByAdminUserId: form.receivedByAdminUserId,
              receivedByAdminDisplayName: form.receivedByAdminDisplayName,
              note: form.note,
              ...(receiptUpload?.url ? { receiptImageUrl: receiptUpload.url } : {}),
              ...(receiptUpload?.path ? { receiptImagePath: receiptUpload.path } : {}),
            },
            userProfile
          );
          toast.success(tr('Funds updated.', 'Fonds mis à jour.'));
        }

        resetComposerForm(isExpenseMode ? 'expense' : 'funds');
        setShowComposer(false);
        void loadDashboard().catch((refreshError) => {
          console.error('Receive funds refresh failed after update:', refreshError);
        });
        return;
      }

      if (isExpenseMode) {
        setExpenseSaveFeedback({
          status: 'saving',
          title: tr('Saving expense…', 'Enregistrement de la dépense…'),
          message: tr('Please wait while we save this purchase.', "Veuillez patienter pendant l'enregistrement de cet achat."),
        });
        await receiveFundsService.recordExpense(
          {
            amount: form.amount,
            receivedDate: form.receivedDate,
            note: form.note,
            labels: selectedExpenseLabels,
            receiptImageUrl: receiptUpload?.url || '',
          },
          userProfile
        );
        const savedLabel = selectedExpenseLabels[0] || tr('Expense', 'Dépense');
        const savedAmount = Number(form.amount || 0);
        resetComposerForm('expense', adminRecipients, { clearExpenseFeedback: false });
        setExpenseSaveFeedback({
          status: 'success',
          title: tr('Expense saved.', 'Dépense enregistrée.'),
          message: tr('Staff can now find it in purchase expenses and finance history.', "L'équipe peut maintenant la retrouver dans les dépenses d'achat et l'historique financier."),
          label: savedLabel,
          amount: savedAmount,
        });
        toast.success(tr('Expense saved.', 'Dépense enregistrée.'));
        setComposerMode('expense');
      } else {
        await receiveFundsService.recordEntry(
          {
            amount: form.amount,
            method: form.method,
            receivedDate: form.receivedDate,
            receivedByAdminUserId: form.receivedByAdminUserId,
            receivedByAdminDisplayName: form.receivedByAdminDisplayName,
            note: form.note,
            receiptImageUrl: receiptUpload?.url || '',
            receiptImagePath: receiptUpload?.path || '',
          },
          userProfile
        );
        toast.success(tr('Funds recorded successfully.', 'Fonds enregistrés avec succès.'));
        resetComposerForm('funds');
        setShowComposer(false);
      }
      void loadDashboard().catch((refreshError) => {
        console.error('Receive funds refresh failed after save:', refreshError);
      });
    } catch (saveError) {
      console.error('Failed to save drawer entry:', saveError);
      if (isExpenseMode) {
        setExpenseSaveFeedback({
          status: 'error',
          title: tr('Expense not saved.', 'Dépense non enregistrée.'),
          message: saveError.message || tr('Please try again before leaving this screen.', "Veuillez réessayer avant de quitter cet écran."),
        });
      }
      toast.error(
        saveError.message ||
          (isExpenseMode
            ? tr('Could not record expense.', "Impossible d'enregistrer la dépense.")
            : tr('Could not record funds.', "Impossible d'enregistrer les fonds."))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddExpenseLabel = () => {
    const normalized = uniqueLabels([newExpenseLabel])[0];
    if (!normalized) return;
    const nextPresets = uniqueLabels([...expenseLabelPresets, normalized]);
    setExpenseLabelPresets(nextPresets);
    saveExpenseLabelPresets(expenseLabelsScopeId, nextPresets);
    setSelectedExpenseLabels([normalized]);
    setNewExpenseLabel('');
    setExpenseSaveFeedback(null);
  };

  const handleToggleExpenseLabel = (label) => {
    setSelectedExpenseLabels((current) =>
      current.some((item) => item.toLowerCase() === String(label).toLowerCase()) ? [] : [label]
    );
    setExpenseSaveFeedback(null);
  };

  const handleRemoveExpenseLabelPreset = (label) => {
    const nextPresets = expenseLabelPresets.filter((item) => item.toLowerCase() !== String(label).toLowerCase());
    setExpenseLabelPresets(nextPresets);
    saveExpenseLabelPresets(expenseLabelsScopeId, nextPresets);
    setSelectedExpenseLabels((current) => current.filter((item) => item.toLowerCase() !== String(label).toLowerCase()));
    setExpenseSaveFeedback(null);
  };

  const openExpenseMode = async (openComposer = false) => {
    const ready = await receiveFundsService.refreshExpensesTableExists();
    setExpenseModeReady(Boolean(ready));

    if (!ready) {
      toast.error(
        tr(
          'Add Expense needs the finance_expenses table. Run the finance expenses migration first.',
          "Ajouter une dépense nécessite la table finance_expenses. Exécutez d'abord la migration des dépenses finance."
        )
      );
      return;
    }

    setComposerMode('expense');
    resetComposerForm('expense');
    if (openComposer) {
      setShowComposer(true);
    }
  };

  const expenseNotePreview = useMemo(
    () => buildExpenseNote(form.note, selectedExpenseLabels),
    [form.note, selectedExpenseLabels]
  );
  const expenseSaveNoticeStyle = expenseSaveFeedback?.status
    ? EXPENSE_SAVE_NOTICE_STYLES[expenseSaveFeedback.status] || EXPENSE_SAVE_NOTICE_STYLES.success
    : null;
  const compactExpenseDateLabel = useMemo(() => {
    const baseLabel = formatDateLabel(form.receivedDate, { month: 'short', day: 'numeric' });
    if (form.receivedDate === todayKey()) {
      return tr(`Today • ${baseLabel}`, `Aujourd'hui • ${baseLabel}`);
    }
    return formatDateLabel(form.receivedDate, { weekday: 'short', month: 'short', day: 'numeric' });
  }, [form.receivedDate]);

  const handleReverseEntry = async (entry) => {
    const reversalNote = window.prompt(
      tr(
        'Add an optional reversal note before removing this funds entry from reconciliation.',
        "Ajoutez une note d'annulation facultative avant de retirer cette entrée de la réconciliation."
      ),
      entry.reversalNote || ''
    );

    if (reversalNote === null) return;

    try {
      setReversingId(entry.id);
      await receiveFundsService.reverseEntry(entry.id, { reversalNote }, userProfile);
      toast.success(tr('Entry reversed.', 'Entrée annulée.'));
      await loadDashboard();
    } catch (reverseError) {
      console.error('Failed to reverse entry:', reverseError);
      toast.error(reverseError.message || tr('Could not reverse this entry.', "Impossible d'annuler cette entrée."));
    } finally {
      setReversingId(null);
    }
  };

  const statusStyle = STATUS_STYLES[dashboard.summary.reconciliationStatus] || STATUS_STYLES.idle;
  const differencePrefix = dashboard.summary.variance > 0 ? '+' : dashboard.summary.variance < 0 ? '−' : '';
  const selectedDateLabel = useMemo(() => {
    const start = filters?.startDate ? formatDateLabel(filters.startDate, { month: 'short', day: 'numeric' }) : '';
    const end = filters?.endDate ? formatDateLabel(filters.endDate, { month: 'short', day: 'numeric' }) : '';
    if (start && end && start !== end) return `${start} - ${end}`;
    return start || end || tr('Current period', 'Période actuelle');
  }, [filters?.endDate, filters?.startDate]);

  const methodBreakdown = useMemo(
    () => [
      { key: 'cash', label: tr('Cash', 'Espèces'), amount: dashboard.summary.cashReceived, tone: 'text-emerald-700' },
      { key: 'wire_transfer', label: tr('Bank Transfer', 'Virement bancaire'), amount: dashboard.summary.wireTransferReceived, tone: 'text-sky-700' },
      { key: 'bank_deposit', label: tr('Deposit', 'Dépôt'), amount: dashboard.summary.bankDepositReceived, tone: 'text-violet-700' },
    ],
    [dashboard.summary.bankDepositReceived, dashboard.summary.cashReceived, dashboard.summary.wireTransferReceived]
  );

  const shouldShowReview = dashboard.summary.reconciliationStatus !== 'matched' || dashboard.reviewItems.length > 0;

  const getEntryStaffName = (entry) => {
    const recordedById = String(entry?.recordedByUserId || '').trim();
    const storedDisplayName = String(entry?.recordedByDisplayName || '').trim();
    const isGenericStoredName = !storedDisplayName || storedDisplayName.toLowerCase() === 'team';
    const currentUserId = String(userProfile?.id || '').trim();

    return (
      (recordedById && staffDisplayMap[recordedById]) ||
      (!isGenericStoredName ? storedDisplayName : '') ||
      (recordedById && currentUserId && recordedById === currentUserId ? buildStaffDisplayName(userProfile, '') : '') ||
      tr('Team', 'Équipe')
    );
  };

  if (!dashboard.tableReady && !loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[28px] border border-amber-200 bg-[#fffaf1] p-6 shadow-[0_18px_42px_rgba(245,158,11,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">{tr('Receive Funds', 'Fonds reçus')}</p>
          <h3 className="mt-3 text-2xl font-bold text-slate-950">{tr('Run the Receive Funds SQL setup first', 'Exécutez d’abord le SQL Receive Funds')}</h3>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            /Users/amrani/Desktop/rental-system-frontend/src/migrations/create_receive_funds_entries.sql
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-[34px] bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#f8fafc_40%,#ffffff_100%)] p-4 sm:p-6">
      <section className="rounded-[28px] border border-white/80 bg-white px-5 py-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Receive Funds', 'Fonds reçus')}</p>
            <h3 className="mt-2 text-3xl font-bold tracking-[-0.05em] text-slate-950">{tr('Receive Funds', 'Fonds reçus')}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              <CalendarDays className="h-4 w-4 text-violet-600" />
              <span>{selectedDateLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerMode('funds');
                resetComposerForm('funds');
                setShowComposer(true);
              }}
              disabled={!canRecord}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {tr('Record Funds', 'Enregistrer des fonds')}
            </button>
            <button
              type="button"
              onClick={() => {
                void openExpenseMode(true);
              }}
              disabled={!canRecord}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {tr('Add Expense', 'Ajouter une dépense')}
            </button>
          </div>
        </div>
      </section>

      <section className={`rounded-[30px] border bg-white px-5 py-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:px-6 ${statusStyle.panel}`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle.chip}`}>
              {statusStyle.label}
            </span>
            <div>
              <p className="text-4xl font-bold tracking-[-0.06em] text-slate-950">{formatMoney(dashboard.summary.expectedRevenue)}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">{tr('expected', 'attendu')}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:min-w-[620px]">
            <div className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Collected', 'Collecté')}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{formatMoney(dashboard.summary.totalReceived)}</p>
            </div>
            <div className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Difference', 'Différence')}</p>
              <p className={`mt-2 text-2xl font-bold tracking-[-0.05em] ${dashboard.summary.variance < 0 ? 'text-amber-700' : dashboard.summary.variance > 0 ? 'text-sky-700' : 'text-emerald-700'}`}>
                {differencePrefix}{formatMoney(dashboard.summary.absoluteVariance)}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Status', 'Statut')}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.05em] text-slate-950">{statusStyle.label}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {methodBreakdown.map((method) => (
            <div key={method.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <span className={method.tone}>{method.label}</span>
              <span className="text-slate-400">/</span>
              <span>{formatMoney(method.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      {shouldShowReview ? (
        <section className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 shadow-[0_18px_42px_rgba(245,158,11,0.08)]">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/80 p-2 text-amber-700 shadow-sm">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {dashboard.reviewItems[0]?.title || tr('Mismatch detected', 'Écart détecté')}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {dashboard.reviewItems[0]?.detail || dashboard.summary.sentence}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Activity Log', "Journal d'activité")}</p>
            <h4 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">{tr('Activity Log', "Journal d'activité")}</h4>
          </div>
          <button
            type="button"
            onClick={() => {
              setComposerMode('funds');
              resetComposerForm('funds');
              setShowComposer(true);
            }}
            disabled={!canRecord}
            className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition hover:scale-[1.01] disabled:opacity-50 lg:inline-flex"
          >
            <Plus className="h-4 w-4" />
            {tr('Record Funds', 'Enregistrer des fonds')}
          </button>
        </div>

        {loading ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-violet-600" />
          </div>
        ) : error ? (
          <div className="mt-5 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-700">
            {error}
          </div>
        ) : dashboard.entries.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <p className="text-base font-semibold text-slate-900">{tr('No entries yet', "Aucune entrée pour le moment")}</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {dashboard.entries.map((entry) => {
              const entryVisual = getEntryVisual(entry);
              const EntryIcon = entryVisual.icon;
              const entryLabels = entry.entryType === 'expense' && Array.isArray(entry.labels)
                ? entry.labels.filter(Boolean)
                : [];
              return (
                <article
                  key={entry.id}
                  className="rounded-[24px] border border-slate-200 bg-[#fdfdff] px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`rounded-[1.1rem] p-3 ${entryVisual.iconClass}`}>
                        <EntryIcon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-slate-950">{formatMoney(entry.amount)}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${entryVisual.chipClass}`}>
                            {entryVisual.label}
                          </span>
                          {entryLabels.map((label) => (
                            <span
                              key={`${entry.id}-${label}`}
                              className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700"
                            >
                              {label}
                            </span>
                          ))}
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            entry.status === 'active'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            {entry.status === 'active' ? tr('Active', 'Actif') : tr('Reversed', 'Annulé')}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-slate-500">
                          {formatDateLabel(entry.receivedDate, { weekday: 'short', month: 'short', day: 'numeric' })} · {getEntryStaffName(entry)}
                        </p>

                        {entry.receivedByAdminDisplayName && entry.entryType !== 'expense' ? (
                          <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-violet-600">
                            {tr('Sent to', 'Envoyé à')} {entry.receivedByAdminDisplayName}
                          </p>
                        ) : null}

                        {entry.note ? (
                          <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {tr('Note', 'Note')}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.note}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canRecord && entry.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void openEditEntry(entry)}
                          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                        >
                          <Pencil className="h-4 w-4" />
                          {tr('Edit', 'Modifier')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpandedEntryId((current) => (current === entry.id ? null : entry.id))}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        {expandedEntryId === entry.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {tr('Details', 'Détails')}
                      </button>
                      {canReview && entry.status === 'active' && entry.entryType !== 'expense' ? (
                        <button
                          type="button"
                          onClick={() => handleReverseEntry(entry)}
                          disabled={reversingId === entry.id}
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {reversingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Reverse', 'Annuler')}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {expandedEntryId === entry.id ? (
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <span>
                          <span className="font-semibold text-slate-900">{tr('Logged', 'Enregistré')}:</span>{' '}
                          {formatDateLabel(entry.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {entry.status === 'reversed' && entry.reversedAt ? (
                          <span>
                            <span className="font-semibold text-slate-900">{tr('Reversed', 'Annulé')}:</span>{' '}
                            {formatDateLabel(entry.reversedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                      {entry.status === 'reversed' && entry.reversalNote ? (
                        <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                          {entry.reversalNote}
                        </p>
                      ) : null}
                      {entry.receiptImageUrl ? (
                        <a
                          href={entry.receiptImageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 transition hover:border-violet-200"
                        >
                          <img
                            src={entry.receiptImageUrl}
                            alt={tr('Receipt proof', 'Preuve du reçu')}
                            className="h-12 w-12 rounded-xl object-cover"
                          />
                          <span className="text-xs font-semibold text-slate-700">{tr('Open receipt image', "Ouvrir l'image du reçu")}</span>
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!showComposer ? (
        <button
          type="button"
          onClick={() => {
            setComposerMode('funds');
            resetComposerForm('funds');
            setShowComposer(true);
          }}
          disabled={!canRecord}
          className="app-floating-primary fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_24px_50px_rgba(79,70,229,0.32)] transition hover:scale-[1.01] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {tr('Record Funds', 'Enregistrer des fonds')}
        </button>
      ) : null}

      {showComposer ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={tr('Close record funds drawer', 'Fermer le panneau fonds reçus')}
            onClick={() => setShowComposer(false)}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
          />

          <div className="absolute inset-y-0 right-0 flex w-full justify-end">
            <aside className="relative flex h-full w-full max-w-[560px] flex-col border-l border-violet-100 bg-[linear-gradient(180deg,#f7f2ff_0%,#ffffff_26%)] shadow-[-24px_0_60px_rgba(15,23,42,0.16)]">
              <div className="border-b border-violet-100 bg-white/88 px-5 py-5 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">
                      {isEditing
                        ? isExpenseMode
                          ? tr('Edit Expense', 'Modifier la dépense')
                          : tr('Edit Funds', 'Modifier les fonds')
                        : isExpenseMode
                          ? tr('Add Expense', 'Ajouter une dépense')
                          : tr('Record Funds', 'Enregistrer des fonds')}
                    </p>
                    <h4 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">
                      {isExpenseMode ? tr('Purchase Expense', "Dépense d'achat") : selectedMethodOption.title}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowComposer(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    <Plus className="h-5 w-5 rotate-45" />
                  </button>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) return;
                        setComposerMode('funds');
                        resetComposerForm('funds');
                      }}
                      disabled={isEditing}
                      className={`rounded-[18px] px-4 py-3 text-left transition ${
                        !isExpenseMode
                          ? 'bg-white text-violet-700 shadow-sm'
                          : 'text-slate-600 hover:bg-white/70'
                      } ${isEditing ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <p className="text-sm font-semibold">{tr('Record Funds', 'Enregistrer des fonds')}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) return;
                        void openExpenseMode();
                      }}
                      disabled={isEditing}
                      className={`rounded-[18px] px-4 py-3 text-left transition ${
                        isExpenseMode
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:bg-white/70'
                      } ${isEditing ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <p className="text-sm font-semibold">{tr('Add Expense', 'Ajouter une dépense')}</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-32">
                {!isExpenseMode ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                  {METHOD_OPTIONS.filter((option) => {
                    if (option.key === 'cash') return true;
                    if (option.key === 'bank_deposit') return canUseBankDeposit;
                    if (option.key === 'wire_transfer') return canUseOwnerBankMethods;
                    return false;
                  }).map((option) => {
                    const Icon = option.icon;
                    const isActive = form.method === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, method: option.key }))}
                        className={`rounded-[22px] border px-4 py-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.985] ${isActive ? option.activeClass : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-sm font-semibold ${option.tone}`}>{option.title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{option.subtitle}</p>
                          </div>
                          <div className="rounded-2xl bg-white/90 p-2 shadow-sm">
                            <Icon className={`h-5 w-5 ${option.tone}`} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-violet-100 bg-[#fbf9ff] p-4">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
                    {tr('Amount', 'Montant')}
                  </label>
                  <div className="mt-3 flex items-end gap-3 rounded-[22px] border border-violet-200 bg-white px-4 py-5 shadow-[0_14px_34px_rgba(79,70,229,0.06)]">
                    <span className="pb-1 text-lg font-semibold text-slate-400">MAD</span>
                    <input
                      ref={amountInputRef}
                      type={isExpenseMode ? 'text' : 'number'}
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => {
                        const nextValue = isExpenseMode
                          ? event.target.value.replace(/[^0-9.,]/g, '')
                          : event.target.value;
                        setForm((current) => ({ ...current, amount: nextValue }));
                        setExpenseSaveFeedback(null);
                      }}
                      placeholder="0"
                      autoFocus={isExpenseMode}
                      className="w-full appearance-none bg-transparent text-5xl font-bold tracking-[-0.06em] text-slate-950 outline-none placeholder:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <CalendarDays className="h-4 w-4 text-violet-600" />
                      {isExpenseMode ? tr('Expense Date', 'Date de dépense') : tr('Deposit Date', 'Date du dépôt')}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                        {formatDateLabel(form.receivedDate, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDateInput((value) => !value)}
                        className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-violet-700"
                      >
                        {showDateInput ? tr('Hide', 'Masquer') : tr('Change', 'Modifier')}
                      </button>
                    </div>
                  </div>
                  {showDateInput ? (
                    <input
                      type="date"
                      value={form.receivedDate}
                      onChange={(event) => setForm((current) => ({ ...current, receivedDate: event.target.value }))}
                      className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:bg-white"
                    />
                  ) : null}
                </div>

                {!isExpenseMode ? (
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {tr('Sent to admin', 'Envoyé à un admin')}
                      </label>
                      {adminsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {adminRecipients.map((admin) => {
                        const isActive = form.receivedByAdminUserId === admin.id;
                        return (
                          <button
                            key={admin.id}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                receivedByAdminUserId: admin.id,
                                receivedByAdminDisplayName: admin.label,
                              }))
                            }
                            className={`rounded-full border px-3 py-2 text-sm font-semibold transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.97] ${
                              isActive
                                ? 'border-violet-300 bg-violet-50 text-violet-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white'
                            }`}
                          >
                            {admin.label}
                          </button>
                        );
                      })}
                      {!adminsLoading && adminRecipients.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          {tr('No admin recipients found.', "Aucun admin trouvé.")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className={`rounded-[22px] p-4 ${isExpenseMode ? 'border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-[0_16px_34px_rgba(124,58,237,0.10)]' : 'border border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <label className={`text-xs font-semibold uppercase tracking-[0.18em] ${isExpenseMode ? 'text-violet-700' : 'text-slate-500'}`}>
                      {isExpenseMode ? tr('Expense note', 'Note de dépense') : tr('Optional note', 'Note facultative')}
                    </label>
                    {isExpenseMode ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 shadow-sm">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                          +
                        </span>
                        {tr('Add detail', 'Ajouter un détail')}
                      </span>
                    ) : null}
                  </div>
                  {isExpenseMode ? (
                    <p className="mt-2 text-sm font-medium text-violet-700/80">
                      {tr('Quick context for this purchase makes the expense easier to track later.', 'Un court contexte pour cet achat facilite le suivi de la dépense ensuite.')}
                    </p>
                  ) : null}
                  <textarea
                    rows={4}
                    value={form.note}
                    onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder={
                      isExpenseMode
                        ? tr('Add a short note for this purchase.', "Ajoutez une courte note pour cet achat.")
                        : tr('Add a note if needed.', 'Ajoutez une note si nécessaire.')
                    }
                    className={`mt-3 w-full resize-none rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none transition ${isExpenseMode ? 'border border-violet-200 bg-white shadow-inner focus:border-violet-400 focus:bg-white' : 'border border-slate-200 bg-slate-50 focus:border-violet-300 focus:bg-white'}`}
                  />
                </div>

                {isExpenseMode ? (
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {tr('Labels', 'Labels')}
                      </label>
                      {selectedExpenseLabels.length > 0 ? (
                        <span className="text-xs font-semibold text-violet-600">
                          {selectedExpenseLabels.length} {tr('selected', 'sélectionné(s)')}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {expenseLabelPresets.map((label) => {
                        const isSelected = selectedExpenseLabels.some((item) => item.toLowerCase() === label.toLowerCase());
                        return (
                          <div
                            key={label}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm font-semibold ${
                              isSelected
                                ? 'border-violet-300 bg-violet-50 text-violet-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleExpenseLabel(label)}
                              className="transition hover:opacity-80"
                            >
                              {label}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveExpenseLabelPreset(label)}
                              className="text-xs uppercase tracking-[0.12em] text-slate-400 transition hover:text-rose-600"
                              aria-label={`${tr('Remove', 'Retirer')} ${label}`}
                            >
                              x
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <input
                        type="text"
                        value={newExpenseLabel}
                        onChange={(event) => setNewExpenseLabel(event.target.value)}
                        placeholder={tr('Add label', 'Ajouter un label')}
                        className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddExpenseLabel}
                        className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                      >
                        + {tr('Add', 'Ajouter')}
                      </button>
                    </div>

                    {expenseNotePreview ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {tr('Saved in expense note', 'Enregistré dans la note de dépense')}
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{expenseNotePreview}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <input
                    ref={receiptImportInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReceiptImport}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {tr('Receipt image', 'Image du reçu')}
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowReceiptCapture((current) => !current)}
                        className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                          showReceiptCapture
                            ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)]'
                            : 'border-violet-200 bg-white text-violet-700 hover:border-violet-300 hover:bg-violet-50'
                        }`}
                      >
                        {showReceiptCapture ? tr('Close photo', 'Fermer la photo') : tr('Add photo', 'Ajouter une photo')}
                      </button>
                      <button
                        type="button"
                        onClick={() => receiptImportInputRef.current?.click()}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {tr('Import', 'Importer')}
                      </button>
                      {receiptFile ? (
                        <button
                          type="button"
                          onClick={() => setReceiptFile(null)}
                          className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-rose-600"
                        >
                          {tr('Remove', 'Retirer')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {receiptPreviewUrl ? (
                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                      <img src={receiptPreviewUrl} alt={tr('Receipt preview', 'Aperçu du reçu')} className="h-14 w-14 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {receiptFile ? receiptFile.name : tr('Receipt image ready', 'Image du reçu prête')}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isExpenseMode
                            ? tr('One receipt photo will be saved with this expense.', 'Une photo du reçu sera enregistrée avec cette dépense.')
                            : tr('One photo will be saved with this funds record.', 'Une photo sera enregistrée avec ce fonds reçu.')}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {isEditing && editingEntry?.receiptImageUrl && !receiptPreviewUrl ? (
                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-violet-200 bg-violet-50/70 px-4 py-3">
                      <img src={editingEntry.receiptImageUrl} alt={tr('Current receipt', 'Reçu actuel')} className="h-14 w-14 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {tr('Current receipt will be kept', 'Le reçu actuel sera conservé')}
                        </p>
                        <p className="text-xs text-slate-500">
                          {tr('Import or capture a new image only if you want to replace it.', "Importez ou capturez une nouvelle image seulement si vous voulez le remplacer.")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {showReceiptCapture ? (
                    <div ref={receiptCaptureRef} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <PhotoCapture
                        sessionToken="receipt-capture"
                        requirements={{ minPhotos: 1, maxPhotos: 1 }}
                        hideHeader
                        hideInstructions
                        squarePreview
                        captureLabel={tr('Take Photo', 'Prendre une photo')}
                        submitLabel={tr('Use this photo', 'Utiliser cette photo')}
                        retakeLabel={tr('Retake photo', 'Reprendre la photo')}
                        loadingLabel={tr('Initializing camera…', 'Initialisation de la caméra…')}
                        importLabel={tr('Import', 'Importer')}
                        onImportClick={() => receiptImportInputRef.current?.click()}
                        onPhotosCapture={(files) => {
                          const nextFile = files?.[files.length - 1] || null;
                          setReceiptFile(nextFile);
                          setShowReceiptCapture(false);
                        }}
                        onError={(message) => {
                          toast.error(message || tr('Camera access failed.', "L'accès à la caméra a échoué."));
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {isExpenseMode && expenseSaveFeedback && expenseSaveNoticeStyle ? (
                <div className={`mx-5 mb-4 rounded-[20px] border px-4 py-3 ${expenseSaveNoticeStyle.container}`}>
                  <div className="flex items-start gap-3">
                    <expenseSaveNoticeStyle.icon className={`mt-0.5 h-4 w-4 shrink-0 ${expenseSaveNoticeStyle.iconClass} ${expenseSaveNoticeStyle.spin ? 'animate-spin' : ''}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{expenseSaveFeedback.title}</p>
                      <p className="mt-1 text-sm opacity-90">{expenseSaveFeedback.message}</p>
                      {expenseSaveFeedback.status === 'success' ? (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
                          {expenseSaveFeedback.label} • {Number(expenseSaveFeedback.amount || 0).toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US')} MAD
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="sticky bottom-0 z-10 border-t border-violet-100 bg-white/92 px-5 py-4 backdrop-blur-xl">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSaveEntry}
                    disabled={saving || !canRecord}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.01] active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {saving
                      ? tr('Saving…', 'Enregistrement…')
                      : isEditing
                        ? isExpenseMode
                          ? tr('Update expense', 'Mettre à jour la dépense')
                          : tr('Update funds', 'Mettre à jour les fonds')
                        : isExpenseMode
                          ? tr('Save expense', 'Enregistrer la dépense')
                          : tr('Save received funds', 'Enregistrer les fonds reçus')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowComposer(false)}
                    className="inline-flex items-center justify-center rounded-[22px] border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ReceiveFundsTabV2;
