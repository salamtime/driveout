import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CarFront,
  ChevronDown,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Wallet,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getCurrentLocationPath, resolveReturnPath } from '../../utils/navigationReturn';
import {
  canCustomerConfirmMarketplaceRequest,
  canSendMarketplaceRequestReminder,
  formatMarketplaceGraceCountdown,
  formatMarketplaceHoldCountdown,
  getMarketplaceApprovalHoldState,
  getMarketplaceChatGraceState,
  getMarketplaceFundsPolicy,
  getMarketplaceMoneyBreakdown,
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../../utils/marketplaceRequestState';
import { buildMarketplaceBookingConfirmWhatsappHref } from '../../utils/marketplaceBookingLinks';

const formatDateTime = (value, locale) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const TimelineStep = ({ label, active = false, complete = false }) => (
  <div className="flex items-center gap-3">
    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
      complete
        ? 'bg-emerald-500'
        : active
          ? 'bg-violet-500'
          : 'bg-slate-300'
    }`} />
    <p className={`text-sm font-semibold ${active || complete ? 'text-slate-900' : 'text-slate-500'}`}>{label}</p>
  </div>
);

const MoneyLine = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className={strong ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</span>
    <span className={strong ? 'font-semibold text-slate-950' : 'font-semibold text-slate-700'}>{value}</span>
  </div>
);

const SummaryRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0 last:pb-0 first:pt-0">
    <span className="text-sm font-medium text-slate-500">{label}</span>
    <span className="text-right text-sm font-semibold text-slate-900">{value || '—'}</span>
  </div>
);

const FundsStep = ({ label, detail, active = false, complete = false }) => (
  <div className={`rounded-2xl border px-4 py-3 ${
    complete
      ? 'border-emerald-200 bg-emerald-50'
      : active
        ? 'border-violet-200 bg-violet-50'
        : 'border-slate-200 bg-white'
  }`}>
    <p className={`text-sm font-semibold ${
      complete || active ? 'text-slate-950' : 'text-slate-700'
    }`}>
      {label}
    </p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </div>
);

const PolicyLine = ({ label, detail }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-sm font-semibold text-slate-950">{label}</p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </div>
);

const SummaryMetric = ({ label, value, tone = 'default' }) => {
  const toneClassName =
    tone === 'violet'
      ? 'border-violet-200 bg-violet-50/80'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/80'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/80'
          : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-[1.25rem] border px-4 py-4 ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
};

const HoldStatusBanner = ({ urgency = 'normal', countdownLabel = '00:00', expired = false, tr }) => {
  if (expired) {
    return (
      <div className="rounded-[1.35rem] border border-slate-300 bg-slate-50 px-4 py-4">
        <p className="text-sm font-bold text-slate-900">{tr('Booking hold expired', 'Réservation expirée')}</p>
        <p className="mt-1 text-sm text-slate-600">{tr('Request again to continue.', 'Redemandez pour continuer.')}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${
      urgency === 'critical'
        ? 'border-amber-300 bg-amber-50'
        : urgency === 'low'
          ? 'border-orange-200 bg-orange-50'
          : 'border-violet-200 bg-violet-50'
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-slate-900">{tr('Held for', 'Maintenue pendant')} {countdownLabel}</p>
        {urgency === 'critical' ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
            {tr('Only a few minutes left', 'Plus que quelques minutes')}
          </span>
        ) : urgency === 'low' ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200">
            {tr('Low time remaining', 'Temps restant faible')}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const GraceStatusBanner = ({ urgency = 'normal', countdownLabel = '0m', expired = false, tr }) => {
  if (expired) {
    return (
      <div className="rounded-[1.35rem] border border-slate-300 bg-slate-50 px-4 py-4">
        <p className="text-sm font-bold text-slate-900">{tr('Pickup window expired', 'Fenêtre de remise expirée')}</p>
        <p className="mt-1 text-sm text-slate-600">
          {tr(
            'This approval window passed without handoff. Review the request and renter chat before continuing.',
            "Cette fenêtre d'approbation est passée sans remise. Vérifiez la demande et le chat client avant de continuer."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${
      urgency === 'critical'
        ? 'border-amber-300 bg-amber-50'
        : urgency === 'low'
          ? 'border-orange-200 bg-orange-50'
          : 'border-emerald-200 bg-emerald-50'
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-slate-900">{tr('Pickup window ends in', 'La fenêtre de remise se termine dans')} {countdownLabel}</p>
        {urgency === 'critical' ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
            {tr('Less than 1 hour left', "Moins d'1 heure restante")}
          </span>
        ) : urgency === 'low' ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200">
            {tr('Final hours', 'Dernières heures')}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const ConfirmationAmountCard = ({
  amount,
  rentalAmount,
  depositAmount,
  walletBalanceLabel,
  walletBalanceValue,
  walletTone = 'default',
  tr,
}) => (
  <div className="rounded-[1.65rem] border border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.95)_0%,rgba(255,255,255,1)_100%)] p-5 shadow-[0_18px_45px_rgba(91,33,182,0.08)] sm:p-6">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Pay now', 'À payer maintenant')}</p>
    <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">{amount}</p>
    <p className="mt-1 text-sm font-medium text-slate-500">{tr('(platform fee)', '(frais plateforme)')}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <SummaryMetric
        label={tr('Rental', 'Location')}
        value={rentalAmount}
        tone="default"
      />
      <SummaryMetric
        label={tr('Deposit held', 'Caution retenue')}
        value={depositAmount}
        tone="amber"
      />
    </div>
    <p className="mt-4 text-sm font-medium text-slate-600">
      {tr('You pay now. Remaining is handled at pickup.', 'Vous payez maintenant. Le reste est géré au départ.')}
    </p>
    <div className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
      walletTone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700'
        : walletTone === 'amber'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-700'
    }`}>
      <Wallet className="h-4 w-4" />
      <span>{walletBalanceLabel}: {walletBalanceValue}</span>
    </div>
  </div>
);

const AccountMarketplaceRequestDetailsPage = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletCurrencyCode, setWalletCurrencyCode] = useState('MAD');
  const [confirming, setConfirming] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [holdNow, setHoldNow] = useState(Date.now());
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const backLink = useMemo(
    () => resolveReturnPath(location, '/account/overview'),
    [location]
  );
  const backButtonLabel = backLink.includes('/account/messages')
    ? tr('Back to messages', 'Retour aux messages')
    : tr('Back to my profile', 'Retour à mon profil');

  const loadRequestDetail = useCallback(async ({ silent = false } = {}) => {
    if (!user || !requestId) {
      setLoading(false);
      return null;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');
      const [detail, snapshot] = await Promise.all([
        CustomerExperienceService.getCustomerMarketplaceRequestDetail(user, requestId),
        CustomerExperienceService.getCustomerAccountSnapshot(user).catch(() => null),
      ]);
      setRequest(detail);
      setWalletBalance(Number(snapshot?.wallet?.balance || 0));
      setWalletCurrencyCode(String(snapshot?.wallet?.currencyCode || detail?.currencyCode || 'MAD'));
      return detail;
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load this marketplace request right now.', 'Impossible de charger cette demande marketplace pour le moment.'));
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [requestId, tr, user]);

  useEffect(() => {
    void loadRequestDetail();
  }, [loadRequestDetail]);

  useEffect(() => {
    if (!requestId) return undefined;

    let reloadTimer = null;
    const queueReload = () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        void loadRequestDetail({ silent: true });
      }, 500);
    };

    const bookingChannel = supabase
      .channel(`account-request-detail:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_booking_requests',
          filter: `id=eq.${requestId}`,
        },
        queueReload
      )
      .subscribe();

    return () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      try {
        supabase.removeChannel(bookingChannel);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [loadRequestDetail, requestId]);

  const handleConfirmRequest = async () => {
    if (!request?.id) return;

    try {
      setConfirming(true);
      setError('');
      await CustomerExperienceService.confirmMarketplaceRequest(request.id);
      const detail = await CustomerExperienceService.getCustomerMarketplaceRequestDetail(user, request.id);
      setRequest(detail);
    } catch (confirmError) {
      setError(confirmError?.message || tr('Unable to confirm this marketplace request right now.', 'Impossible de confirmer cette demande marketplace pour le moment.'));
    } finally {
      setConfirming(false);
    }
  };

  const handleSendReminder = async () => {
    if (!request?.id) return;

    try {
      setReminding(true);
      setError('');
      const result = await CustomerExperienceService.sendMarketplaceRequestReminder(request.id);
      const reminderSentAt = result?.reminderSentAt || new Date().toISOString();
      setRequest((current) => current ? { ...current, reminderSentAt: new Date(reminderSentAt) } : current);
    } catch (reminderError) {
      setError(reminderError?.message || tr('Unable to send a reminder right now.', "Impossible d'envoyer un rappel pour le moment."));
    } finally {
      setReminding(false);
    }
  };

  const timelineSteps = useMemo(() => {
    const status = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
    return [
      {
        key: 'sent',
        label: tr('Request sent', 'Demande envoyée'),
        active: ['pending', 'countered', 'pre_approved', 'approved', 'active', 'completed', 'expired'].includes(status),
        complete: ['pending', 'countered', 'pre_approved', 'approved', 'active', 'completed', 'expired'].includes(status),
      },
      {
        key: 'review',
        label: tr('Approved by owner', 'Approuvée par le propriétaire'),
        active: ['pre_approved'].includes(status),
        complete: ['approved', 'active', 'completed'].includes(status),
      },
      {
        key: 'confirm',
        label: tr('Booking confirmed', 'Réservation confirmée'),
        active: ['approved', 'active'].includes(status),
        complete: ['approved', 'active', 'completed'].includes(status),
      },
      {
        key: 'chat',
        label: tr('Chat open', 'Chat ouvert'),
        active: Boolean(request?.chatUnlocked),
        complete: Boolean(request?.chatUnlocked) || ['active', 'completed'].includes(status),
      },
    ];
  }, [request?.chatUnlocked, request?.requestStatus, tr]);
  const requestStatus = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
  const requestDisplay = getMarketplaceRequestDisplay(requestStatus, tr);
  const chatUnlocked = Boolean(request?.chatUnlocked) || isMarketplaceChatUnlocked(requestStatus);
  const approvalHoldState = useMemo(
    () => getMarketplaceApprovalHoldState({
      status: requestStatus,
      holdExpiresAt: request?.holdExpiresAt || null,
      now: holdNow,
    }),
    [holdNow, request?.holdExpiresAt, requestStatus]
  );
  const chatGraceState = useMemo(
    () => getMarketplaceChatGraceState({
      status: requestStatus,
      chatGraceExpiresAt: request?.chatGraceExpiresAt || null,
      now: holdNow,
    }),
    [holdNow, request?.chatGraceExpiresAt, requestStatus]
  );
  const canConfirmRequest = canCustomerConfirmMarketplaceRequest(requestStatus) && !approvalHoldState.expired;
  const canSendReminder = canSendMarketplaceRequestReminder(requestStatus, request?.reminderSentAt);
  const isRentalLive = requestStatus === 'active';
  const isRentalCompleted = requestStatus === 'completed';
  const money = getMarketplaceMoneyBreakdown({
    estimatedAmount: request?.estimatedAmount,
    commissionAmount: request?.commissionAmount,
  });
  const damageDepositAmount = Math.max(0, Number(request?.damageDepositAmount || request?.depositAmount || 0));
  const hasEnoughWalletBalance = walletBalance >= money.commissionAmount;
  const walletShortfall = Math.max(0, money.commissionAmount - walletBalance);
  const settlementRules = useMemo(() => getMarketplaceFundsPolicy(tr), [tr]);
  const holdCountdownLabel = approvalHoldState.active
    ? formatMarketplaceHoldCountdown(approvalHoldState.remainingMs)
    : '00:00';
  const graceCountdownLabel = chatGraceState.active
    ? formatMarketplaceGraceCountdown(chatGraceState.remainingMs)
    : '0m';
  const requestDateRange = useMemo(() => {
    const start = formatDateTime(request?.requestedStartAt, locale);
    const end = formatDateTime(request?.requestedEndAt, locale);
    return [start, end].filter((value) => value && value !== '—').join(' → ');
  }, [locale, request?.requestedEndAt, request?.requestedStartAt]);
  const lifecycleStatusLabel = isRentalCompleted
    ? tr('Rental completed', 'Location terminée')
    : isRentalLive
      ? tr('Rental live', 'Location en cours')
      : tr('Booking confirmed', 'Réservation confirmée');
  const lifecycleStatusSubtext = isRentalCompleted
    ? tr('The rental is closed and the trip is complete.', 'La location est clôturée et le trajet est terminé.')
    : isRentalLive
      ? tr('Pickup is complete and the rental is now in progress.', 'La remise est terminée et la location est en cours.')
      : tr('Chat is open with the owner', 'Le chat est ouvert avec le propriétaire');
  const heroTitle = canConfirmRequest
    ? tr('Pay now to confirm', 'Payez maintenant pour confirmer')
    : chatUnlocked
      ? lifecycleStatusLabel
      : request?.listingTitle || tr('Request details', 'Détails de la demande');
  const heroDescription = canConfirmRequest
    ? [request?.listingTitle, requestDateRange, tr('Approved by owner', 'Approuvée par le propriétaire')].filter(Boolean).join(' • ')
      : chatUnlocked
      ? [
          request?.listingTitle,
          requestDateRange,
          lifecycleStatusSubtext,
        ].filter(Boolean).join(' • ')
      : tr('See the amount, the next step, and the request status in one place.', 'Voyez le montant, la prochaine étape et le statut de la demande au même endroit.');
  const confirmationCtaLabel = hasEnoughWalletBalance
    ? tr('Pay now to confirm', 'Payer maintenant pour confirmer')
    : tr(
      `Add ${formatMoney(walletShortfall, request?.currencyCode || 'MAD', locale)} & pay now`,
      `Ajouter ${formatMoney(walletShortfall, request?.currencyCode || 'MAD', locale)} et payer`
    );
  const fundsLifecycle = useMemo(
    () => [
      {
        key: 'fee',
        label: tr('DriveOut fee', 'Frais DriveOut'),
        detail: tr('Reserved from the owner wallet when the owner approves.', 'Réservés depuis le portefeuille du propriétaire quand il approuve.'),
        active: !chatUnlocked,
        complete: chatUnlocked,
      },
      {
        key: 'deposit',
        label: tr('Damage deposit', 'Caution'),
        detail: tr('Held from your wallet when the owner approves.', 'Retenue depuis votre portefeuille quand le propriétaire approuve.'),
        active: chatUnlocked,
        complete: false,
      },
      {
        key: 'payout',
        label: tr('Owner payout', 'Versement propriétaire'),
        detail: tr('Moves after the rental is started.', 'Déclenché après le démarrage de la location.'),
        active: false,
        complete: false,
      },
    ],
    [canConfirmRequest, chatUnlocked, tr]
  );
  const confirmationAmount = formatMoney(money.commissionAmount, request?.currencyCode || 'MAD', locale);
  const damageDepositLabel = formatMoney(damageDepositAmount, request?.currencyCode || 'MAD', locale);
  const rentalAmountLabel = formatMoney(money.estimatedAmount, request?.currencyCode || 'MAD', locale);
  const walletBalanceLabel = formatMoney(walletBalance, walletCurrencyCode || request?.currencyCode || 'MAD', locale);
  const requestDurationLabel = request?.rentalType === 'daily'
    ? tr(`${Math.max(1, Number(request?.duration || 1))} day`, `${Math.max(1, Number(request?.duration || 1))} jour(s)`)
    : tr(`${Math.max(1, Number(request?.duration || 1))} hour`, `${Math.max(1, Number(request?.duration || 1))} heure(s)`);
  const bookingApprovalWhatsappHref = useMemo(
    () => buildMarketplaceBookingConfirmWhatsappHref({
      requestId: request?.id,
      listingTitle: request?.listingTitle,
      amount: confirmationAmount,
      tr,
    }),
    [confirmationAmount, request?.id, request?.listingTitle, tr]
  );
  const showConfirmedCompactLayout = chatUnlocked;
  const nextStepLabel = isRentalCompleted
    ? tr('Rental completed', 'Location terminée')
    : isRentalLive
      ? tr('Rental is live', 'Location en cours')
      : tr('Next step', 'Étape suivante');
  const nextStepDescription = isRentalCompleted
    ? tr('Review the final timeline or reopen chat if you need anything else.', 'Consultez la chronologie finale ou rouvrez le chat si vous avez encore besoin de quelque chose.')
    : isRentalLive
      ? tr('Stay in touch with the owner while the rental is active.', 'Restez en contact avec le propriétaire pendant la location.')
      : tr('Coordinate pickup with the owner', 'Coordonnez la remise avec le propriétaire');

  useEffect(() => {
    const shouldTickLegacyHold = requestStatus === 'pre_approved' && request?.holdExpiresAt;
    const shouldTickChatGrace = requestStatus === 'approved' && request?.chatGraceExpiresAt;
    if (!shouldTickLegacyHold && !shouldTickChatGrace) return undefined;

    const timer = window.setInterval(() => {
      setHoldNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [request?.chatGraceExpiresAt, request?.holdExpiresAt, requestStatus]);

  if (loading && suppressBlockingLoader) {
    return <AccountWorkspaceLoadingShell cardCount={1} showStatsRow={false} />;
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(backLink)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {backButtonLabel}
      </button>

      {!showConfirmedCompactLayout ? (
        <AccountWorkspaceHero
          eyebrow={tr('Marketplace Request', 'Demande marketplace')}
          title={heroTitle}
          description={heroDescription}
        />
      ) : null}

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.85rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            {request?.coverImageUrl ? (
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-50 shadow-sm">
                <img src={request.coverImageUrl} alt={request?.listingTitle || 'Marketplace vehicle'} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.3rem] border border-slate-200 bg-violet-50 text-violet-600 shadow-sm">
                <CarFront className="h-7 w-7" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              {showConfirmedCompactLayout ? (
                <>
                  <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-950">
                    {request?.listingTitle || '—'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {requestDateRange || '—'}
                  </p>
                  <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Status', 'Statut')}
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">{lifecycleStatusLabel}</p>
                    <p className="mt-1 text-sm text-slate-600">{lifecycleStatusSubtext}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${request?.requestStatusTone || requestDisplay?.tone || 'bg-slate-100 text-slate-700'}`}>
                      {requestDisplay?.label || tr('Request sent', 'Demande envoyée')}
                    </span>
                  </div>
                  {request?.requestReference ? (
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {tr('Reference', 'Référence')} {request.requestReference}
                    </p>
                  ) : null}
                  <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                    {heroTitle}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {canConfirmRequest
                      ? heroDescription
                      : [request?.cityName, request?.areaName].filter(Boolean).join(' • ')}
                  </p>
                </>
              )}
            </div>
          </div>

          {canConfirmRequest ? (
            <ConfirmationAmountCard
              amount={confirmationAmount}
              rentalAmount={rentalAmountLabel}
              depositAmount={damageDepositLabel}
              walletBalanceLabel={tr('Wallet balance', 'Solde portefeuille')}
              walletBalanceValue={walletBalanceLabel}
              walletTone={hasEnoughWalletBalance ? 'emerald' : 'amber'}
              tr={tr}
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryMetric
                  label={tr('Pay now', 'À payer maintenant')}
                  value={confirmationAmount}
                  tone="violet"
                />
                <SummaryMetric
                  label={tr('Rental', 'Location')}
                  value={rentalAmountLabel}
                  tone="default"
                />
                <SummaryMetric
                  label={tr('Deposit', 'Caution')}
                  value={damageDepositLabel}
                  tone="amber"
                />
              </div>

              {chatUnlocked ? (
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {nextStepLabel}
                  </p>
                  <p className="mt-3 text-sm font-medium text-slate-600">
                    {nextStepDescription}
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      to={`/account/messages?requestId=${encodeURIComponent(String(request?.id || ''))}`}
                      state={{ from: currentPath }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)]"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {tr('Open chat', 'Ouvrir le chat')}
                    </Link>
                    <p className="text-sm font-medium text-slate-500">
                      {tr('Pickup window ends in', 'La fenêtre de remise se termine dans')} {graceCountdownLabel}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr('Booking summary', 'Résumé de réservation')}
                  </p>
                  <div className="mt-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-1">
                    <SummaryRow label={tr('Vehicle', 'Véhicule')} value={request?.listingTitle || '—'} />
                    <SummaryRow label={tr('Dates', 'Dates')} value={requestDateRange || '—'} />
                    <SummaryRow label={tr('Duration', 'Durée')} value={requestDurationLabel} />
                  </div>
                </div>
              )}
            </>
          )}

          {!hasEnoughWalletBalance && canConfirmRequest ? (
            <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-bold text-amber-800">{tr('Top up required', 'Recharge requise')}</p>
              <p className="mt-1 text-sm text-amber-700">
                {tr(
                  `Add ${formatMoney(walletShortfall, request?.currencyCode || 'MAD', locale)} to confirm your booking.`,
                  `Ajoutez ${formatMoney(walletShortfall, request?.currencyCode || 'MAD', locale)} pour confirmer votre réservation.`
                )}
              </p>
            </div>
          ) : null}

          {requestStatus === 'pre_approved' ? (
            <HoldStatusBanner
              urgency={approvalHoldState.urgency}
              countdownLabel={holdCountdownLabel}
              expired={approvalHoldState.expired}
              tr={tr}
            />
          ) : null}

          {chatUnlocked && !showConfirmedCompactLayout ? (
            <GraceStatusBanner
              urgency={chatGraceState.urgency}
              countdownLabel={graceCountdownLabel}
              expired={chatGraceState.expired}
              tr={tr}
            />
          ) : null}

          {canConfirmRequest ? (
            <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-950">
                {tr('One-time confirmation fee to secure your booking', 'Frais uniques de confirmation pour sécuriser votre réservation')}
              </p>
              <label className="mt-3 flex items-start gap-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <span>{tr('You agree to rental terms. Deposit is handled at pickup.', 'Vous acceptez les conditions de location. La caution est gérée au départ.')}</span>
              </label>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canConfirmRequest ? (
              <>
                {hasEnoughWalletBalance ? (
                  <button
                    type="button"
                    onClick={handleConfirmRequest}
                    disabled={confirming || !legalAccepted}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {confirming ? tr('Confirming…', 'Confirmation…') : confirmationCtaLabel}
                  </button>
                ) : (
                  <Link
                    to="/account/revenue"
                    state={{ from: currentPath }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)] sm:w-auto"
                  >
                    <Wallet className="h-4 w-4" />
                    {confirmationCtaLabel}
                  </Link>
                )}
                {bookingApprovalWhatsappHref ? (
                  <a
                    href={bookingApprovalWhatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                  >
                    <MessageSquare className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : null}
              </>
            ) : approvalHoldState.expired && request?.listingId ? (
              <Link
                to={`/account/marketplace/${encodeURIComponent(String(request.listingId))}`}
                state={{ from: currentPath }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
              >
                <CarFront className="h-4 w-4" />
                {tr('Request again', 'Redemander')}
              </Link>
            ) : canSendReminder ? (
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={reminding}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
              >
                <BellRing className="h-4 w-4" />
                {reminding ? tr('Sending reminder…', 'Envoi du rappel…') : tr('Send reminder', 'Envoyer un rappel')}
              </button>
            ) : request?.reminderSentAt && !chatUnlocked ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                <BellRing className="h-4 w-4" />
                {tr('Reminder sent', 'Rappel envoyé')}
              </div>
            ) : null}

            {chatUnlocked ? null : (
              approvalHoldState.expired && request?.listingId ? (
                <Link
                  to={`/account/marketplace/${encodeURIComponent(String(request.listingId))}`}
                  state={{ from: currentPath }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:text-violet-700 sm:w-auto"
                >
                  <CarFront className="h-4 w-4" />
                  {tr('Request again', 'Redemander')}
                </Link>
              ) : null
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <AccountWorkspaceSectionHeader
          title={tr('Timeline', 'Chronologie')}
          description=""
          titleClassName="mt-1 text-lg font-bold text-slate-950"
        />

        <div className="mt-5 space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          {timelineSteps.map((step) => (
            <TimelineStep key={step.key} label={step.label} active={step.active} complete={step.complete} />
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Details', 'Détails')}</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('View full details', 'Voir tous les détails')}</h2>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition ${showDetails ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-5 w-5" />
          </span>
        </button>

        {showDetails ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Booking summary', 'Résumé de réservation')}</p>
                <div className="mt-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-1">
                  <SummaryRow label={tr('Vehicle', 'Véhicule')} value={request?.listingTitle || '—'} />
                  <SummaryRow label={tr('Dates', 'Dates')} value={requestDateRange || '—'} />
                  <SummaryRow label={tr('Duration', 'Durée')} value={requestDurationLabel} />
                  <SummaryRow label={tr('Rental amount', 'Montant location')} value={rentalAmountLabel} />
                  <SummaryRow label={tr('Deposit held', 'Caution retenue')} value={damageDepositLabel} />
                  <SummaryRow label={tr('Platform fee', 'Frais plateforme')} value={confirmationAmount} />
                  <SummaryRow label={tr('Wallet balance', 'Solde portefeuille')} value={walletBalanceLabel} />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Funds flow', 'Flux financier')}</p>
                <div className="mt-3 grid gap-3">
                  {fundsLifecycle.map((step) => (
                    <FundsStep
                      key={step.key}
                      label={step.label}
                      detail={step.detail}
                      active={step.active}
                      complete={step.complete}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Settlement rules', 'Règles de règlement')}</p>
                <div className="mt-3 grid gap-3">
                  {settlementRules.map((rule) => (
                    <PolicyLine key={rule.key} label={rule.label} detail={rule.detail} />
                  ))}
                </div>
              </div>
            </div>

            {request?.customerMessage ? (
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Your note', 'Votre note')}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{request.customerMessage}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {(canConfirmRequest || (approvalHoldState.expired && request?.listingId)) ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-20 -mx-1 block px-1 sm:hidden">
          <div className="rounded-[1.4rem] border border-slate-200 bg-white/96 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {canConfirmRequest ? tr('To confirm', 'À confirmer') : chatUnlocked ? lifecycleStatusLabel : tr('Booking hold expired', 'Réservation expirée')}
                </p>
                <p className="mt-1 truncate text-sm font-bold text-slate-950">
                  {canConfirmRequest ? confirmationAmount : chatUnlocked ? lifecycleStatusSubtext : tr('Request again to continue', 'Redemandez pour continuer')}
                </p>
              </div>
              {canConfirmRequest && approvalHoldState.active ? (
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  approvalHoldState.urgency === 'critical'
                    ? 'bg-amber-50 text-amber-700'
                    : approvalHoldState.urgency === 'low'
                      ? 'bg-orange-50 text-orange-700'
                      : 'bg-violet-50 text-violet-700'
                }`}>
                  {holdCountdownLabel}
                </span>
              ) : null}
            </div>

            {canConfirmRequest ? (
              hasEnoughWalletBalance ? (
                <button
                  type="button"
                  onClick={handleConfirmRequest}
                  disabled={confirming || !legalAccepted}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {confirming ? tr('Confirming…', 'Confirmation…') : confirmationCtaLabel}
                </button>
              ) : (
                <Link
                  to="/account/revenue"
                  state={{ from: currentPath }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)]"
                >
                  <Wallet className="h-4 w-4" />
                  {confirmationCtaLabel}
                </Link>
              )
            ) : chatUnlocked ? (
              <Link
                to={`/account/messages?requestId=${encodeURIComponent(String(request?.id || ''))}`}
                state={{ from: currentPath }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)]"
              >
                <MessageSquare className="h-4 w-4" />
                {tr('Open chat', 'Ouvrir le chat')}
              </Link>
            ) : (
              <Link
                to={`/account/marketplace/${encodeURIComponent(String(request.listingId))}`}
                state={{ from: currentPath }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <CarFront className="h-4 w-4" />
                {tr('Request again', 'Redemander')}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountMarketplaceRequestDetailsPage;
