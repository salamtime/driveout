import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Copy, Gift, Loader2, MessageCircle, Share2, Upload, Wallet } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import CustomerRewardsService from '../../services/CustomerRewardsService';
import GrowthLoopApiService from '../../services/GrowthLoopApiService';
import { uploadFile } from '../../utils/storageUpload';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getMarketplaceRequestDisplay } from '../../utils/marketplaceRequestState';
import { getCurrentLocationPath, resolveReturnPath } from '../../utils/navigationReturn';

const CUSTOMER_REWARDS_STORAGE_PREFIX = 'saharax_customer_rewards';
const MONEY_TABS = {
  renting: 'renting',
  hosting: 'hosting',
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const formatCount = (value, locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value, locale) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const safeNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const getCustomerRewardsStorageKey = (userId, suffix) => `${CUSTOMER_REWARDS_STORAGE_PREFIX}:${userId}:${suffix}`;

const copyText = async (value) => {
  const text = String(value || '').trim();
  if (!text) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
};

const getActivityTone = (status) => {
  const key = String(status || '').toLowerCase();
  if (['paid', 'completed', 'approved', 'released'].includes(key)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }
  if (['partial', 'pending', 'submitted', 'review', 'pre_approved', 'unpaid'].includes(key)) {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }
  if (['rejected', 'failed', 'refunded'].includes(key)) {
    return 'bg-rose-50 text-rose-700 border-rose-100';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const WalletHeroCard = ({ stats = [] }) => (
  <section className="overflow-hidden rounded-[2rem] border border-violet-200 bg-[linear-gradient(135deg,#f5f3ff_0%,#eef2ff_44%,#f8fafc_100%)] p-5 shadow-[0_24px_70px_rgba(91,33,182,0.08)] sm:p-6">
    <div className="rounded-[1.8rem] border border-white/70 bg-white/96 p-5 shadow-sm sm:p-6">
      <div className={`grid gap-4 ${stats.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[1.45rem] bg-slate-50/80 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const WalletActionItem = ({ title, detail, ctaLabel, to, state, onClick, tone = 'violet', ctaTone = 'default' }) => {
  const toneClassName =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/80'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/80'
        : tone === 'default'
          ? 'border-slate-200 bg-white'
          : 'border-violet-200 bg-violet-50/70';

  const ctaClassName =
    ctaTone === 'violet'
      ? 'border-transparent bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_12px_28px_rgba(91,33,182,0.24)]'
      : 'border-white/80 bg-white text-violet-700 shadow-sm';

  const content = (
    <>
      <div className="min-w-0">
        <p className="text-base font-bold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${ctaClassName}`}>
        <span>{ctaLabel}</span>
        <ArrowRight className="h-4 w-4" />
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        state={state}
        className={`flex items-start justify-between gap-4 rounded-[1.55rem] border px-4 py-4 shadow-sm transition hover:translate-y-[-1px] hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${toneClassName}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-4 rounded-[1.55rem] border px-4 py-4 text-left shadow-sm transition hover:translate-y-[-1px] hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${toneClassName}`}
    >
      {content}
    </button>
  );
};

const WalletTabs = ({ tabs, activeTab, onChange }) => (
  <div className="inline-flex rounded-[1.2rem] border border-slate-200 bg-white p-1 shadow-sm">
    {tabs.map((tab) => {
      const active = tab.id === activeTab;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-[0.95rem] px-4 py-2.5 text-sm font-semibold transition ${
            active
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_12px_28px_rgba(91,33,182,0.26)]'
              : 'text-slate-600 hover:text-violet-700'
          }`}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

const WalletEmptyState = ({ title, detail, actionLabel, actionTo, actionState }) => (
  <section className="rounded-[1.7rem] border border-dashed border-slate-200 bg-slate-50/90 p-6 text-center">
    <h3 className="text-lg font-bold text-slate-950">{title}</h3>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{detail}</p>
    {actionLabel && actionTo ? (
      <Link
        to={actionTo}
        state={actionState}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
      >
        <span>{actionLabel}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    ) : null}
  </section>
);

const WalletActivityFeed = ({ items, locale, emptyTitle, emptyDetail, actionLabel, actionTo, actionState }) => {
  if (!items.length) {
    return <WalletEmptyState title={emptyTitle} detail={emptyDetail} actionLabel={actionLabel} actionTo={actionTo} actionState={actionState} />;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[1.45rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getActivityTone(item.status)}`}>
                  {item.badge}
                </span>
                {item.context ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {item.context}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-950">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
            <div className="shrink-0 text-right">
              {item.amount ? (
                <p className="text-base font-black text-slate-950">{item.amount}</p>
              ) : null}
              {item.at ? <p className="mt-1 text-xs font-medium text-slate-400">{formatDateTime(item.at, locale)}</p> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
};

const WalletDetailSection = ({ title, items = [], renderItem, emptyMessage = '' }) => {
  return (
    <section className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {items.length ? (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[1.2rem] border border-slate-100 bg-slate-50/80 px-4 py-3">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : emptyMessage ? (
        <div className="mt-3 rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4">
          <p className="text-sm font-medium leading-6 text-slate-500">{emptyMessage}</p>
        </div>
      ) : null}
    </section>
  );
};

const WalletTopupComposer = ({
  amount,
  note,
  receiptFile,
  submitting,
  feedback,
  onAmountChange,
  onNoteChange,
  onReceiptChange,
  onSubmit,
  onViewStatus,
  tr,
}) => (
  <section className="rounded-[2rem] border border-violet-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)] p-5 shadow-[0_18px_46px_rgba(91,33,182,0.08)] sm:p-6">
    <AccountWorkspaceSectionHeader
      eyebrow={tr('Add funds', 'Ajouter des fonds')}
      title={tr('Add funds via bank transfer', 'Ajouter des fonds par virement bancaire')}
      description={tr(
        'Upload your transfer receipt and our team will review it manually.',
        'Téléversez votre reçu de virement et notre équipe le vérifiera manuellement.'
      )}
    />

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{tr('Amount', 'Montant')}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder="0"
            className="mt-2 w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-950 shadow-sm outline-none transition focus:border-violet-300"
          />
        </label>

        <div className="block">
          <span className="text-sm font-semibold text-slate-700">{tr('Receipt', 'Reçu')}</span>
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-[1.2rem] border border-dashed border-slate-300 bg-white px-4 py-3 shadow-sm transition hover:border-violet-300">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">
                {receiptFile ? receiptFile.name : tr('Upload image or PDF', 'Téléverser une image ou un PDF')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('JPG, PNG, or PDF proof of your transfer', 'JPG, PNG ou PDF comme preuve de votre virement')}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Upload className="h-4 w-4" />
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(event) => onReceiptChange(event.target.files?.[0] || null)}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{tr('Note (optional)', 'Note (optionnelle)')}</span>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={3}
            placeholder={tr('Add a transfer reference if helpful', 'Ajoutez une référence de virement si utile')}
            className="mt-2 w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-violet-300"
          />
        </label>

        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(91,33,182,0.26)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span>{tr('Submit for review', 'Soumettre pour revue')}</span>
        </button>
      </div>

      <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">{tr('Manual review', 'Revue manuelle')}</p>
          <p className="mt-1 text-sm leading-6 text-amber-700">
            {tr('Funds appear within 24 hours after approval.', "Les fonds apparaissent sous 24 heures après l'approbation.")}
          </p>
        </div>
        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{tr('Email updates', 'Mises à jour par email')}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {tr(
              'We’ll email you when the transfer is approved or if we need a clearer receipt.',
              'Nous vous enverrons un email quand le virement sera approuvé ou si nous avons besoin d’un reçu plus clair.'
            )}
          </p>
        </div>
        {feedback ? (
          <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">{feedback.title}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-700">{feedback.detail}</p>
                {onViewStatus ? (
                  <button
                    type="button"
                    onClick={onViewStatus}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:border-emerald-300"
                  >
                    <span>{tr('View status', 'Voir le statut')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  </section>
);

const AccountRevenue = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [rewardsSnapshot, setRewardsSnapshot] = useState(null);
  const [rentals, setRentals] = useState([]);
  const [marketplaceRequests, setMarketplaceRequests] = useState([]);
  const [rewardsLedger, setRewardsLedger] = useState([]);
  const [activeRewardIds, setActiveRewardIds] = useState([]);
  const [activeTab, setActiveTab] = useState(MONEY_TABS.renting);
  const [showDetails, setShowDetails] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [topupReceiptFile, setTopupReceiptFile] = useState(null);
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupFeedback, setTopupFeedback] = useState(null);
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const backLink = useMemo(() => resolveReturnPath(location, '/account/overview'), [location]);
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const creditsSectionRef = useRef(null);
  const moneyRecordSectionRef = useRef(null);
  const creditsPanelRequested = useMemo(
    () => new URLSearchParams(location.search).get('panel') === 'credits',
    [location.search]
  );

  const openWalletTopupStatus = useCallback(() => {
    setActiveTab(MONEY_TABS.renting);
    setShowDetails(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        moneyRecordSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const [accountSnapshot, rentalHistory, customerRequests] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user, { forceRefresh: true }),
          CustomerExperienceService.getCustomerRentalHistory(user),
          CustomerExperienceService.getCustomerMarketplaceRequests(user),
        ]);

        if (cancelled) return;
        setSnapshot(accountSnapshot);
        setRentals(Array.isArray(rentalHistory) ? rentalHistory : []);
        setMarketplaceRequests(Array.isArray(customerRequests) ? customerRequests : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError?.message ||
              tr(
                'Unable to load your wallet right now.',
                "Impossible de charger votre portefeuille pour le moment."
              )
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isFrench]);

  useEffect(() => {
    let cancelled = false;

    const loadRewardsSnapshot = async () => {
      if (!user) {
        if (!cancelled) {
          setRewardsSnapshot(null);
        }
        return;
      }

      try {
        const nextSnapshot = await GrowthLoopApiService.getSnapshot('rewards');
        if (!cancelled) {
          setRewardsSnapshot(nextSnapshot);
        }
      } catch {
        if (!cancelled) {
          setRewardsSnapshot(null);
        }
      }
    };

    void loadRewardsSnapshot();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const hasShareLink = Boolean(rewardsSnapshot?.shareLink?.shortUrl);
    if (!hasShareLink) return undefined;

    const intervalId = window.setInterval(async () => {
      try {
        const nextSnapshot = await GrowthLoopApiService.getSnapshot('rewards');
        setRewardsSnapshot(nextSnapshot);
      } catch {
        // Keep the wallet quiet if the rewards refresh misses once.
      }
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [rewardsSnapshot?.shareLink?.shortUrl]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') {
      setRewardsLedger([]);
      setActiveRewardIds([]);
      return;
    }

    try {
      const savedLedger = JSON.parse(window.localStorage.getItem(getCustomerRewardsStorageKey(user.id, 'ledger')) || '[]');
      const savedRewards = JSON.parse(window.localStorage.getItem(getCustomerRewardsStorageKey(user.id, 'activeRewards')) || '[]');
      setRewardsLedger(Array.isArray(savedLedger) ? savedLedger : []);
      setActiveRewardIds(Array.isArray(savedRewards) ? savedRewards : []);
    } catch {
      setRewardsLedger([]);
      setActiveRewardIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!creditsPanelRequested) return;
    creditsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [creditsPanelRequested, rewardsSnapshot?.shareLink?.shortUrl]);

  const wallet = snapshot?.wallet || CustomerExperienceService.getEmptyWallet();
  const walletTransactions = Array.isArray(snapshot?.walletTransactions) ? snapshot.walletTransactions : [];
  const rideCreditsSnapshot = useMemo(
    () =>
      CustomerRewardsService.buildWalletSnapshot({
        ledger: rewardsLedger,
        activeRewardIds,
        completedRentals: rentals.length,
        tr,
      }),
    [rewardsLedger, activeRewardIds, rentals.length, tr]
  );

  const creditsBalance = Number(rideCreditsSnapshot?.wallet?.balance || 0);
  const referralBalance = safeNumber(rewardsSnapshot?.wallet?.balance);
  const referralMadValue = safeNumber(rewardsSnapshot?.wallet?.madValue);
  const rewardPerReferral = safeNumber(rewardsSnapshot?.rewardPerReferral || rewardsSnapshot?.program?.rewardPerReferral);
  const referralLink = String(rewardsSnapshot?.shareLink?.shortUrl || '').trim();
  const recentReferralRewards = Array.isArray(rewardsSnapshot?.recentRewards) ? rewardsSnapshot.recentRewards : [];
  const outstandingTotal = useMemo(
    () => rentals.reduce((sum, rental) => sum + Number(rental?.outstanding || 0), 0),
    [rentals]
  );

  const pendingMarketplaceCount = useMemo(
    () =>
      marketplaceRequests.filter((request) =>
        ['pending', 'submitted', 'review', 'countered', 'pre_approved'].includes(String(request?.requestStatus || '').toLowerCase())
      ).length,
    [marketplaceRequests]
  );

  const pendingTopups = Number(wallet.pendingTopups || 0);
  const inferWalletTransactionDirection = (transaction) => {
    const type = String(transaction?.type || transaction?.transaction_type || '').toLowerCase();
    const status = String(transaction?.status || transaction?.transaction_status || '').toLowerCase();
    const description = String(transaction?.description || transaction?.notes || transaction?.note || '').toLowerCase();
    if (status === 'refunded') return 1;
    if (
      type.includes('withdraw') ||
      type.includes('debit') ||
      type.includes('fee') ||
      type.includes('commission') ||
      type.includes('payout') ||
      type.includes('hold') ||
      type.includes('reservation') ||
      type.includes('charge') ||
      description.includes('fee') ||
      description.includes('commission') ||
      description.includes('withdraw') ||
      description.includes('held')
    ) {
      return -1;
    }
    return 1;
  };

  const getWalletTransactionTitle = (transaction) => {
    const type = String(transaction?.type || transaction?.transaction_type || '').toLowerCase();
    const status = String(transaction?.status || transaction?.transaction_status || '').toLowerCase();

    if (type.includes('topup')) {
      return status === 'approved'
        ? tr('Wallet top-up approved', 'Recharge portefeuille approuvée')
        : tr('Wallet top-up pending', 'Recharge portefeuille en attente');
    }

    if (type.includes('manual_adjustment')) {
      return tr('Manual balance adjustment', 'Ajustement manuel du solde');
    }

    if (type.includes('commission')) {
      return tr('Marketplace fee movement', 'Mouvement des frais marketplace');
    }

    if (type.includes('payout')) {
      return tr('Owner payout movement', 'Mouvement de versement propriétaire');
    }

    if (type.includes('refund')) {
      return tr('Refund recorded', 'Remboursement enregistré');
    }

    if (type.includes('hold') || type.includes('reservation')) {
      return tr('Reserved in wallet', 'Réservé dans le portefeuille');
    }

    return transaction?.type || transaction?.transaction_type || tr('Wallet transaction', 'Transaction portefeuille');
  };

  const getWalletTransactionDetail = (transaction) => {
    const explicitDescription = transaction?.description || transaction?.notes || transaction?.note || '';
    if (explicitDescription) return explicitDescription;

    const type = String(transaction?.type || transaction?.transaction_type || '').toLowerCase();
    const status = String(transaction?.status || transaction?.transaction_status || '').toLowerCase();

    if (type.includes('manual_adjustment')) {
      return tr(
        'Added or corrected manually by the team. This is usually an admin credit or balance fix.',
        "Ajouté ou corrigé manuellement par l'équipe. Il s'agit généralement d'un crédit admin ou d'une correction de solde."
      );
    }

    if (type.includes('topup')) {
      return status === 'approved'
        ? tr('Bank transfer receipt approved and funds added to your wallet.', 'Reçu de virement approuvé et fonds ajoutés au portefeuille.')
        : tr('Waiting for the transfer receipt to be reviewed.', 'En attente de la revue du reçu de virement.');
    }

    if (type.includes('commission')) {
      return tr(
        'Marketplace fees or reservations connected to a booking request.',
        'Frais marketplace ou réservations liées à une demande de réservation.'
      );
    }

    if (type.includes('payout')) {
      return tr('Owner payout linked to hosting revenue.', 'Versement propriétaire lié au revenu hébergement.');
    }

    if (type.includes('hold') || type.includes('reservation')) {
      return tr('Temporarily reserved during a live booking or request flow.', 'Temporairement réservé pendant un flux actif de réservation ou de demande.');
    }

    return tr('Recorded in your wallet ledger.', 'Enregistré dans votre historique portefeuille.');
  };

  const walletLedgerEntries = useMemo(() => {
    const sortedTransactions = [...walletTransactions].sort(
      (left, right) => new Date(right?.createdAt || right?.created_at || right?.updatedAt || right?.updated_at || 0).getTime() -
        new Date(left?.createdAt || left?.created_at || left?.updatedAt || left?.updated_at || 0).getTime()
    );

    let newerSignedAmountTotal = 0;
    return sortedTransactions.map((transaction) => {
      const amount = Number(transaction?.amount || 0);
      const direction = inferWalletTransactionDirection(transaction);
      const signedAmount = amount * direction;
      const runningBalance = Number(wallet.balance || 0) - newerSignedAmountTotal;
      newerSignedAmountTotal += signedAmount;
      return {
        ...transaction,
        signedAmount,
        runningBalance,
      };
    });
  }, [walletTransactions, wallet.balance]);

  const walletLedgerSummary = useMemo(() => {
    return walletLedgerEntries.reduce(
      (summary, transaction) => {
        const amount = Number(transaction?.signedAmount || 0);
        if (amount >= 0) {
          summary.credits += amount;
        } else {
          summary.debits += Math.abs(amount);
        }
        summary.count += 1;
        return summary;
      },
      { credits: 0, debits: 0, count: 0 }
    );
  }, [walletLedgerEntries]);

  const handleSubmitTopup = async () => {
    const normalizedAmount = Number(topupAmount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setError(tr('Enter a valid amount before submitting.', 'Entrez un montant valide avant de soumettre.'));
      return;
    }

    if (!topupReceiptFile) {
      setError(tr('Upload your transfer receipt before submitting.', 'Téléversez votre reçu de virement avant de soumettre.'));
      return;
    }

    try {
      setTopupSubmitting(true);
      setError('');
      setTopupFeedback(null);

      const upload = await uploadFile(topupReceiptFile, {
        bucket: 'rental-documents',
        pathPrefix: `wallet-topups/${String(user?.id || 'customer')}`,
        optimizationProfile: 'document',
      });

      if (!upload?.success) {
        throw new Error(upload?.error || tr('Receipt upload failed.', "L'envoi du reçu a échoué."));
      }

      await CustomerExperienceService.submitWalletTopup({
        amount: normalizedAmount,
        proofUrl: upload.url,
        proofPath: upload.path,
        note: topupNote,
      });

      const freshSnapshot = await CustomerExperienceService.getCustomerAccountSnapshot(user, { forceRefresh: true });
      setSnapshot(freshSnapshot);
      setTopupAmount('');
      setTopupNote('');
      setTopupReceiptFile(null);
      setShowDetails(true);
      setTopupFeedback({
        title: tr('Submitted for review', 'Soumis pour revue'),
        detail: tr('Funds appear within 24 hours.', 'Les fonds apparaissent sous 24 heures.'),
      });
    } catch (submitError) {
      console.error('Wallet top-up submission failed:', {
        message: submitError?.message,
        status: submitError?.status,
        payload: submitError?.payload || null,
      });
      setError(
        submitError?.message ||
          tr(
            'Unable to submit your bank transfer right now.',
            "Impossible de soumettre votre virement bancaire pour le moment."
          )
      );
    } finally {
      setTopupSubmitting(false);
    }
  };

  const handleCreateShareLink = async () => {
    setCreatingShareLink(true);
    try {
      const nextSnapshot = await GrowthLoopApiService.createShareLink({
        type: 'rewards',
        destinationUrl: `${window.location.origin}/register`,
      });
      setRewardsSnapshot(nextSnapshot);
      toast.success(tr('Your referral link is ready.', 'Votre lien de parrainage est prêt.'));
    } catch (createError) {
      toast.error(
        createError?.message ||
          tr(
            'Unable to create your referral link right now.',
            'Impossible de créer votre lien de parrainage pour le moment.'
          )
      );
    } finally {
      setCreatingShareLink(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!referralLink) return;
    try {
      const copied = await copyText(referralLink);
      if (!copied) throw new Error('copy_failed');
      toast.success(tr('Referral link copied.', 'Lien de parrainage copié.'));
    } catch {
      toast.error(tr('Unable to copy right now.', 'Impossible de copier pour le moment.'));
    }
  };

  const jumpToCreditsSection = () => {
    creditsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const heroStats = useMemo(() => {
    const stats = [
      {
        label: tr('Available', 'Disponible'),
        value: formatMoney(wallet.balance || 0, wallet.currencyCode || 'MAD', locale),
      },
      {
        label: tr('Ride credits', 'Crédits Ride'),
        value: formatCount(creditsBalance, locale),
      },
      {
        label: tr('Referral value', 'Valeur parrainage'),
        value: formatMoney(referralMadValue, 'MAD', locale),
      },
    ];

    return stats;
  }, [wallet.balance, wallet.currencyCode, creditsBalance, referralMadValue, locale, tr]);

  const actionItems = useMemo(() => {
    const items = [];

    if (outstandingTotal > 0) {
      items.push({
        id: 'outstanding',
        title: tr('Outstanding payment', 'Paiement en attente'),
        detail: tr(
          `${formatMoney(outstandingTotal, 'MAD', locale)} still needs attention on your rentals.`,
          `${formatMoney(outstandingTotal, 'MAD', locale)} demandent encore votre attention sur vos locations.`
        ),
        ctaLabel: tr('Pay', 'Payer'),
        to: '/account/rentals',
        tone: 'amber',
      });
    }

    if (pendingMarketplaceCount > 0) {
      items.push({
        id: 'marketplace',
        title: tr('Pending marketplace request', 'Demande marketplace en attente'),
        detail: tr(
          `${pendingMarketplaceCount} request${pendingMarketplaceCount > 1 ? 's' : ''} still need a next step.`,
          `${pendingMarketplaceCount} demande${pendingMarketplaceCount > 1 ? 's' : ''} attendent encore une suite.`
        ),
        ctaLabel: tr('Review', 'Voir'),
        to: '/account/marketplace',
        tone: 'default',
        ctaTone: 'violet',
      });
    }

    if (pendingTopups > 0) {
      items.push({
        id: 'topups',
        title: tr('Top-up pending', 'Recharge en attente'),
        detail: tr(
          `${formatMoney(pendingTopups, wallet.currencyCode || 'MAD', locale)} is still being processed.`,
          `${formatMoney(pendingTopups, wallet.currencyCode || 'MAD', locale)} est encore en cours de traitement.`
        ),
        ctaLabel: tr('View status', 'Voir le statut'),
        onClick: openWalletTopupStatus,
        tone: 'amber',
      });
    }

    return items;
  }, [outstandingTotal, pendingMarketplaceCount, pendingTopups, wallet.currencyCode, locale, tr, openWalletTopupStatus]);

  const rentingActivity = useMemo(() => {
    const rentalItems = rentals.map((rental) => {
      const paymentStatus = String(rental?.paymentStatus || '').toLowerCase();
      const hasOutstanding = Number(rental?.outstanding || 0) > 0;

      return {
        id: `rental-${rental.id}`,
        status: hasOutstanding ? 'pending' : paymentStatus || 'completed',
        badge: hasOutstanding
          ? tr('Action needed', 'Action requise')
          : paymentStatus === 'paid'
            ? tr('Paid', 'Payé')
            : paymentStatus === 'partial'
              ? tr('Partial', 'Partiel')
              : tr('Completed', 'Terminé'),
        context: tr('Rental', 'Location'),
        title: hasOutstanding
          ? tr('Payment pending', 'Paiement en attente')
          : tr('Payment completed', 'Paiement terminé'),
        description: hasOutstanding
          ? tr(
              `${rental?.modelName || tr('Rental', 'Location')} still has ${formatMoney(rental.outstanding, 'MAD', locale)} due.`,
              `${rental?.modelName || tr('Location', 'Location')} a encore ${formatMoney(rental.outstanding, 'MAD', locale)} à régler.`
            )
          : tr(
              `${rental?.modelName || tr('Rental', 'Location')} has been settled.`,
              `${rental?.modelName || tr('Location', 'Location')} a été réglée.`
            ),
        amount: formatMoney(hasOutstanding ? rental.outstanding : rental.total || 0, 'MAD', locale),
        at: rental?.startDate || rental?.endDate ? new Date(rental.startDate || rental.endDate) : null,
      };
    });

    const requestItems = marketplaceRequests.map((request) => {
      const requestStatus = String(request?.requestStatus || '').toLowerCase();
      const displayState = getMarketplaceRequestDisplay(request?.requestStatus, tr);

      let title = tr('Pending request', 'Demande en attente');
      let description = tr('Not charged yet.', 'Pas encore facturé.');

      if (requestStatus === 'pre_approved') {
        title = tr('Pre-approved', 'Pré-approuvé');
        description = tr(
          'Wallet confirmation is needed before chat unlocks.',
          'Une confirmation portefeuille est nécessaire avant de débloquer le chat.'
        );
      } else if (['approved', 'active'].includes(requestStatus)) {
        title = tr('Confirmed request', 'Demande confirmée');
        description = tr('This request is moving forward.', 'Cette demande avance.');
      } else if (requestStatus === 'completed') {
        title = tr('Request completed', 'Demande terminée');
        description = tr('This request is closed.', 'Cette demande est clôturée.');
      }

      return {
        id: `request-${request.id}`,
        status: requestStatus || 'pending',
        badge: displayState.label,
        context: tr('Marketplace', 'Marketplace'),
        title,
        description,
        amount: Number(request?.estimatedAmount || 0) > 0 ? formatMoney(request.estimatedAmount, request?.currencyCode || 'MAD', locale) : null,
        at: request?.updatedAt || request?.createdAt ? new Date(request.updatedAt || request.createdAt) : null,
      };
    });

    const walletItems = walletTransactions
      .map((transaction) => {
        const type = String(transaction?.type || transaction?.transaction_type || '').toLowerCase();
        const status = String(transaction?.status || 'pending').toLowerCase();

        if (type.includes('topup')) {
          return {
            id: `wallet-${transaction.id}`,
            status,
            badge: status === 'approved' ? tr('Completed', 'Terminé') : tr('Pending', 'En attente'),
            context: tr('Wallet', 'Portefeuille'),
            title: status === 'approved' ? tr('Top-up completed', 'Recharge terminée') : tr('Top-up pending', 'Recharge en attente'),
            description:
              transaction?.note ||
              (status === 'approved'
                ? tr('Balance was added to your wallet.', 'Le solde a été ajouté à votre portefeuille.')
                : tr('Your top-up is still being processed.', 'Votre recharge est encore en cours de traitement.')),
            amount: formatMoney(transaction?.amount || 0, wallet.currencyCode || 'MAD', locale),
            at: transaction?.createdAt ? new Date(transaction.createdAt) : null,
          };
        }

        if (type === 'marketplace commission' || type === 'marketplace_commission') {
          return {
            id: `wallet-${transaction.id}`,
            status,
            badge: tr('Reserved', 'Réservé'),
            context: tr('Wallet', 'Portefeuille'),
            title: tr('DriveOut fee reserved', 'Frais DriveOut réservés'),
            description:
              transaction?.note ||
              tr(
                'Reserved from wallet before the owner payout moves.',
                'Réservés depuis le portefeuille avant le versement au propriétaire.'
              ),
            amount: formatMoney(transaction?.amount || 0, wallet.currencyCode || 'MAD', locale),
            at: transaction?.createdAt ? new Date(transaction.createdAt) : null,
          };
        }

        return null;
      })
      .filter(Boolean);

    return [...rentalItems, ...requestItems, ...walletItems].sort(
      (left, right) => new Date(right?.at || 0).getTime() - new Date(left?.at || 0).getTime()
    );
  }, [rentals, marketplaceRequests, walletTransactions, wallet.currencyCode, locale, tr]);

  const hostingActivity = useMemo(
    () =>
      walletTransactions
        .map((transaction) => {
          const type = String(transaction?.type || transaction?.transaction_type || '').toLowerCase();
          const note = String(transaction?.note || '').toLowerCase();
          if (!type.includes('payout') && !note.includes('owner payout') && !note.includes('versement')) return null;

          return {
            id: `hosting-${transaction.id}`,
            status: transaction?.status || 'pending',
            badge:
              String(transaction?.status || '').toLowerCase() === 'approved'
                ? tr('Paid out', 'Versé')
                : tr('In progress', 'En cours'),
            context: tr('Hosting', 'Hébergement'),
            title:
              String(transaction?.status || '').toLowerCase() === 'approved'
                ? tr('Owner payout sent', 'Versement propriétaire envoyé')
                : tr('Owner payout in progress', 'Versement propriétaire en cours'),
            description:
              transaction?.note ||
              tr(
                'Hosting payouts will appear here as they start moving.',
                'Les versements propriétaire apparaîtront ici dès qu’ils commenceront à bouger.'
              ),
            amount: formatMoney(transaction?.amount || 0, wallet.currencyCode || 'MAD', locale),
            at: transaction?.createdAt ? new Date(transaction.createdAt) : null,
          };
        })
        .filter(Boolean)
        .sort((left, right) => new Date(right?.at || 0).getTime() - new Date(left?.at || 0).getTime()),
    [walletTransactions, wallet.currencyCode, locale, tr]
  );

  const activeFeed = activeTab === MONEY_TABS.hosting ? hostingActivity : rentingActivity;
  const hasAnyWalletSignal =
    Number(wallet.balance || 0) > 0 ||
    creditsBalance > 0 ||
    referralBalance > 0 ||
    recentReferralRewards.length > 0 ||
    Boolean(referralLink) ||
    actionItems.length > 0 ||
    rentingActivity.length > 0 ||
    hostingActivity.length > 0;

  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  if (loading && !suppressBlockingLoader) {
    return (
      <div className="space-y-6">
        <section className="h-52 animate-pulse rounded-[2rem] border border-violet-200 bg-white" />
        <section className="grid gap-4 md:grid-cols-2">
          <div className="h-28 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white" />
          <div className="h-28 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {location.state?.from ? (
        <button
          type="button"
          onClick={() => navigate(backLink)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr('Back', 'Retour')}
        </button>
      ) : null}

      <AccountWorkspaceHero
        eyebrow={tr('Wallet', 'Portefeuille')}
        title={tr('Money, at a glance', "L'argent, en un regard")}
        description={tr(
          'See what is available now, what needs action, and what is still moving.',
          'Voyez ce qui est disponible maintenant, ce qui demande une action, et ce qui est encore en cours.'
        )}
      >
        <div className="mt-6">
          <WalletHeroCard stats={heroStats} />
        </div>
      </AccountWorkspaceHero>

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section
        ref={creditsSectionRef}
        className={`rounded-[2rem] border p-5 shadow-[0_20px_52px_rgba(91,33,182,0.08)] sm:p-6 ${
          creditsPanelRequested
            ? 'border-violet-300 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)]'
            : 'border-violet-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)]'
        }`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
              {tr('Credits & referrals', 'Crédits & parrainage')}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {tr('Keep rewards inside the wallet', 'Gardez les récompenses dans le portefeuille')}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {tr(
                'Ride credits, referral earnings, and share links now live here so your money picture stays in one place.',
                "Les crédits Ride, gains de parrainage et liens de partage vivent maintenant ici pour garder votre vision d'argent au même endroit."
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px] lg:max-w-[420px]">
            <div className="rounded-[1.45rem] border border-white/80 bg-white/95 px-4 py-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('Referral balance', 'Solde parrainage')}
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                {formatCount(referralBalance, locale)}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {formatMoney(referralMadValue, 'MAD', locale)}
              </p>
            </div>
            <div className="rounded-[1.45rem] border border-white/80 bg-white/95 px-4 py-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('Referral flow', 'Flux parrainage')}
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                {referralLink ? tr('Live', 'Actif') : tr('Ready', 'Prêt')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {rewardPerReferral > 0
                  ? tr(
                      `Earn ${formatMoney(rewardPerReferral, 'MAD', locale)} per referral milestone.`,
                      `Gagnez ${formatMoney(rewardPerReferral, 'MAD', locale)} par palier de parrainage.`
                    )
                  : tr('Share -> friend joins -> you earn', 'Partage -> un ami rejoint -> vous gagnez')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {!referralLink ? (
            <button
              type="button"
              onClick={handleCreateShareLink}
              disabled={creatingShareLink}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(91,33,182,0.26)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Share2 className="h-4 w-4" />
              <span>
                {creatingShareLink
                  ? tr('Preparing link...', 'Préparation du lien...')
                  : tr('Create referral link', 'Créer un lien de parrainage')}
              </span>
            </button>
          ) : (
            <>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(91,33,182,0.26)] transition hover:translate-y-[-1px]"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{tr('Share on WhatsApp', 'Partager sur WhatsApp')}</span>
              </a>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
              >
                <Copy className="h-4 w-4" />
                <span>{tr('Copy link', 'Copier le lien')}</span>
              </button>
            </>
          )}
        </div>

        {referralLink ? (
          <div className="mt-4 rounded-[1.35rem] border border-slate-200 bg-white/95 px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {tr('Active referral link', 'Lien de parrainage actif')}
            </p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{referralLink}</p>
          </div>
        ) : null}

        <div className="mt-5 rounded-[1.35rem] border border-dashed border-slate-200 bg-white/70 px-4 py-4">
          <p className="text-sm font-semibold text-slate-700">
            {tr('Recent referral rewards', 'Récompenses récentes')}
          </p>
          {recentReferralRewards.length ? (
            <div className="mt-3 space-y-3">
              {recentReferralRewards.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">
                        {entry.note || tr('Referral reward earned', 'Récompense de parrainage gagnée')}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {entry.createdAt ? formatDateTime(new Date(entry.createdAt), locale) : '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                        +{formatCount(entry.amount, locale)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {tr(
                'Referral rewards will appear here after friends sign up or book through your link.',
                'Les récompenses de parrainage apparaîtront ici après les inscriptions ou réservations faites via votre lien.'
              )}
            </p>
          )}
        </div>
      </section>

      {actionItems.length ? (
        <section className="space-y-3">
          <AccountWorkspaceSectionHeader
            title={tr('Needs attention', "À traiter")}
            description={tr(
              'Only the next money actions that matter right now.',
              "Uniquement les prochaines actions financières qui comptent maintenant."
            )}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {actionItems.map((item) => (
              <WalletActionItem key={item.id} {...item} />
            ))}
          </div>
        </section>
      ) : null}

      <WalletTopupComposer
        amount={topupAmount}
        note={topupNote}
        receiptFile={topupReceiptFile}
        submitting={topupSubmitting}
        feedback={topupFeedback}
        onAmountChange={setTopupAmount}
        onNoteChange={setTopupNote}
        onReceiptChange={setTopupReceiptFile}
        onSubmit={handleSubmitTopup}
        onViewStatus={openWalletTopupStatus}
        tr={tr}
      />

      <section className="rounded-[2rem] border border-violet-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_22px_58px_rgba(91,33,182,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
              {tr('Payments & payouts', 'Paiements & virements')}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{tr('Money by role', "Argent par rôle")}</h2>
          </div>
          <WalletTabs
            tabs={[
              { id: MONEY_TABS.renting, label: tr('Renting', 'Location') },
              { id: MONEY_TABS.hosting, label: tr('Hosting', 'Hébergement') },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {activeTab === MONEY_TABS.renting && outstandingTotal > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              {tr('Outstanding', 'Restant')}: {formatMoney(outstandingTotal, 'MAD', locale)}
            </span>
          ) : null}
          {activeTab === MONEY_TABS.renting && pendingTopups > 0 ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {tr('Pending top-ups', 'Recharges en attente')}: {formatMoney(pendingTopups, wallet.currencyCode || 'MAD', locale)}
            </span>
          ) : null}
          {activeTab === MONEY_TABS.renting && pendingMarketplaceCount > 0 ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              {pendingMarketplaceCount} {tr('request(s) moving', 'demande(s) en cours')}
            </span>
          ) : null}
          {activeTab === MONEY_TABS.hosting && hostingActivity.length > 0 ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              {hostingActivity.length} {tr('payout event(s)', 'événement(s) de versement')}
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <WalletActivityFeed
            items={activeFeed}
            locale={locale}
            emptyTitle={
              activeTab === MONEY_TABS.hosting
                ? tr('No hosting payouts yet', 'Aucun versement propriétaire pour le moment')
                : tr('No renting money activity yet', "Aucune activité financière location pour le moment")
            }
            emptyDetail={
              activeTab === MONEY_TABS.hosting
                ? tr(
                    'Owner payouts will appear here once hosting money starts moving.',
                    'Les versements propriétaire apparaîtront ici dès que les flux hébergement commenceront.'
                  )
                : tr(
                    'Payments, request confirmations, and wallet moves will collect here as they happen.',
                    'Paiements, confirmations de demande et mouvements de portefeuille apparaîtront ici au fur et à mesure.'
                  )
            }
            actionLabel={
              activeTab === MONEY_TABS.hosting
                ? tr('Open listings', 'Ouvrir les annonces')
                : tr('Browse vehicles', 'Explorer les véhicules')
            }
            actionTo={activeTab === MONEY_TABS.hosting ? '/account/vehicles' : '/marketplace'}
            actionState={{ from: currentPath }}
          />
        </div>
      </section>

      <section ref={moneyRecordSectionRef} className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Deep details', 'Détails')}</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              {tr('See the full money record', "Voir l'historique complet")}
            </h2>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition ${showDetails ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-5 w-5" />
          </span>
        </button>

        {showDetails ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.2rem] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Entries', 'Entrées')}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{walletLedgerSummary.count}</p>
              </div>
              <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">{tr('Money in', 'Entrées d’argent')}</p>
                <p className="mt-2 text-2xl font-black text-emerald-700">
                  {formatMoney(walletLedgerSummary.credits, wallet.currencyCode || 'MAD', locale)}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-amber-100 bg-amber-50/80 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">{tr('Money out', 'Sorties d’argent')}</p>
                <p className="mt-2 text-2xl font-black text-amber-800">
                  {formatMoney(walletLedgerSummary.debits, wallet.currencyCode || 'MAD', locale)}
                </p>
              </div>
            </div>

            <WalletDetailSection
              title={tr('Wallet', 'Portefeuille')}
              items={walletLedgerEntries}
              emptyMessage={tr(
                'No wallet ledger entries yet. When funds are added, reserved, released, or spent, the full record will appear here.',
                "Aucune écriture portefeuille pour le moment. Quand des fonds seront ajoutés, réservés, libérés ou dépensés, l'historique complet apparaîtra ici."
              )}
              renderItem={(item) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-slate-950">{getWalletTransactionTitle(item)}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getActivityTone(item?.status || item?.transaction_status)}`}>
                        {String(item?.status || item?.transaction_status || tr('Recorded', 'Enregistré'))}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{getWalletTransactionDetail(item)}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {tr('Balance after this move', 'Solde après ce mouvement')}: {formatMoney(item?.runningBalance || 0, wallet.currencyCode || 'MAD', locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-black ${Number(item?.signedAmount || 0) >= 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                      {Number(item?.signedAmount || 0) >= 0 ? '+' : '-'}
                      {formatMoney(Math.abs(Number(item?.amount || 0)), wallet.currencyCode || 'MAD', locale)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item?.createdAt || item?.created_at
                        ? formatDateTime(new Date(item.createdAt || item.created_at), locale)
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            />

            <WalletDetailSection
              title={tr('Rentals', 'Locations')}
              items={rentals}
              renderItem={(item) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">{item?.modelName || tr('Rental', 'Location')}</p>
                    <p className="mt-1 text-sm text-slate-500">{item?.packageName || item?.vehicleLabel || tr('Certified booking', 'Réservation certifiée')}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-950">{formatMoney(item?.total || 0, 'MAD', locale)}</p>
                    {Number(item?.outstanding || 0) > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        {tr('Due', 'Restant')}: {formatMoney(item?.outstanding || 0, 'MAD', locale)}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            />

            <WalletDetailSection
              title={tr('Marketplace requests', 'Demandes marketplace')}
              items={marketplaceRequests}
              renderItem={(item) => {
                const display = getMarketplaceRequestDisplay(item?.requestStatus, tr);
                return (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950">{item?.listingTitle || tr('Marketplace request', 'Demande marketplace')}</p>
                      <p className="mt-1 text-sm text-slate-500">{display.label}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-950">{formatMoney(item?.estimatedAmount || 0, item?.currencyCode || 'MAD', locale)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {item?.updatedAt || item?.createdAt ? formatDateTime(new Date(item.updatedAt || item.createdAt), locale) : '—'}
                      </p>
                    </div>
                  </div>
                );
              }}
            />
          </div>
        ) : null}
      </section>

      {!hasAnyWalletSignal ? (
        <WalletEmptyState
          title={tr('Your wallet is quiet right now', 'Votre portefeuille est calme pour le moment')}
          detail={tr(
            'Once you start moving money through rentals, credits, or marketplace requests, everything important will appear here.',
            'Dès que vous commencerez à faire circuler de l’argent via locations, crédits ou demandes marketplace, tout l’essentiel apparaîtra ici.'
          )}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <button
          type="button"
          onClick={jumpToCreditsSection}
          className="group rounded-[1.75rem] border border-violet-200 bg-[linear-gradient(135deg,#ffffff_0%,#faf5ff_55%,#eef2ff_100%)] p-5 text-left shadow-[0_18px_46px_rgba(91,33,182,0.08)] transition hover:translate-y-[-1px] hover:shadow-[0_22px_52px_rgba(91,33,182,0.11)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Credits', 'Crédits')}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {tr('Credits now live here', 'Les crédits vivent maintenant ici')}
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Gift className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {tr(
              'Referral links, reward value, and recent credits are part of Wallet now.',
              'Les liens de parrainage, la valeur gagnée et les crédits récents font maintenant partie du Portefeuille.'
            )}
          </p>
        </button>

        <Link
          to="/account/settings"
          state={{ from: currentPath }}
          className="group rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:translate-y-[-1px] hover:border-violet-200 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Settings', 'Paramètres')}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Payments & payouts', 'Paiements & virements')}</h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {tr(
              'Open cards, payout setup, and account payment preferences.',
              'Ouvrez cartes, configuration de versement et préférences de paiement du compte.'
            )}
          </p>
        </Link>
      </section>
    </div>
  );
};

export default AccountRevenue;
