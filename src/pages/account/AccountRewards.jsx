import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Copy, Gift, MessageCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import GrowthLoopApiService from '../../services/GrowthLoopApiService';
import RewardToast from '../../components/account/RewardToast';
import { resolveReturnPath } from '../../utils/navigationReturn';
import {
  workspaceLabelClass,
  workspaceMetricCardClass,
  workspacePanelClass,
  workspacePrimaryButtonStrongClass,
  workspaceSecondaryButtonClass,
} from '../../components/account/accountWorkspaceDesignSystem';

const formatMadValue = (value, locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0)) + ' MAD';

const formatEntryDate = (value, locale = 'en') => {
  if (!value) return '—';
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(next);
};

const safeNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

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

const CreditHistoryRow = ({ entry, locale, tr }) => (
  <article className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-950">{entry.note || tr('Credit earned', 'Crédit gagné')}</p>
        <p className="mt-1 text-sm text-slate-500">{formatEntryDate(entry.createdAt, locale)}</p>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
        +{safeNumber(entry.amount)}
      </span>
    </div>
  </article>
);

const ShareLinkModal = ({ open, onClose, shareLink, tr }) => {
  if (!open || !shareLink?.shortUrl) return null;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, []);

  const handleCopy = async () => {
    try {
      const copied = await copyText(shareLink.shortUrl);
      if (!copied) throw new Error('copy_failed');
      toast.success(tr('Link copied.', 'Lien copié.'));
    } catch {
      toast.error(tr('Unable to copy right now.', 'Impossible de copier pour le moment.'));
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareLink.shortUrl)}`;

  const modal = (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/40 px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div className="w-full max-w-lg rounded-t-[2rem] border border-violet-200 bg-white p-6 shadow-[0_-18px_48px_rgba(91,33,182,0.18)] sm:rounded-[2rem] sm:shadow-[0_30px_80px_rgba(91,33,182,0.22)]">
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-600">
              {tr('Referral link', 'Lien de parrainage')}
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {tr('Share and earn', 'Partagez et gagnez')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
          >
            {tr('Close', 'Fermer')}
          </button>
        </div>

        <div className="mt-6 rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{tr('Share link', 'Lien de partage')}</p>
          <p className="mt-2 break-all text-sm font-semibold text-slate-900">{shareLink.shortUrl}</p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            {tr('Share on WhatsApp', 'Partager sur WhatsApp')}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"
          >
            <Copy className="h-4 w-4" />
            {tr('Copy link', 'Copier le lien')}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }

  return createPortal(modal, document.body);
};

const AccountRewards = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = useCallback((en, fr) => (isFrench ? fr : en), [isFrench]);
  const backLink = useMemo(
    () => resolveReturnPath(location, '/account/revenue'),
    [location]
  );

  const [loading, setLoading] = useState(true);
  const [creatingLink, setCreatingLink] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [rewardToast, setRewardToast] = useState(null);

  const loadSnapshot = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const next = await GrowthLoopApiService.getSnapshot('rewards');
      setSnapshot(next);
    } catch (error) {
      toast.error(error.message || tr('Unable to load credits right now.', 'Impossible de charger les crédits pour le moment.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot?.shareLink?.shortUrl) return undefined;
    const intervalId = window.setInterval(() => {
      loadSnapshot({ quiet: true });
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [snapshot?.shareLink?.shortUrl, loadSnapshot]);

  const latestReward = useMemo(() => {
    const entry = snapshot?.recentRewards?.[0];
    if (!entry?.id || safeNumber(entry.amount) <= 0) return null;
    return {
      id: entry.id,
      title: tr('Reward unlocked', 'Récompense débloquée'),
      body: `${entry.amount} ${tr('credits added', 'crédits ajoutés')}`,
    };
  }, [snapshot?.recentRewards, tr]);

  useEffect(() => {
    if (!latestReward?.id) return;
    setRewardToast(latestReward);
  }, [latestReward]);

  const handleShare = async () => {
    setCreatingLink(true);
    try {
      const next = await GrowthLoopApiService.createShareLink({
        type: 'rewards',
        destinationUrl: `${window.location.origin}/register`,
      });
      setSnapshot(next);
      setShareModalOpen(true);
      toast.success(tr('Your link is ready.', 'Votre lien est prêt.'));
    } catch (error) {
      toast.error(error.message || tr('Unable to create your referral link.', 'Impossible de créer votre lien de parrainage.'));
    } finally {
      setCreatingLink(false);
    }
  };

  const suppressLoader = shouldSuppressBlockingPageLoader('account-rewards');
  if (loading && suppressLoader) {
    return <AccountWorkspaceLoadingShell variant="detail" />;
  }

  const creditBalance = safeNumber(snapshot?.wallet?.balance);
  const madValue = snapshot?.wallet?.madValue || 0;
  const recentRewards = Array.isArray(snapshot?.recentRewards) ? snapshot.recentRewards : [];
  const hasActivity = recentRewards.length > 0;
  const rewardPerReferral = safeNumber(snapshot?.rewardPerReferral || snapshot?.program?.rewardPerReferral || 0);
  const shareLink = snapshot?.shareLink?.shortUrl || '';
  const whatsappUrl = shareLink ? `https://wa.me/?text=${encodeURIComponent(shareLink)}` : '';

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      const copied = await copyText(shareLink);
      if (!copied) throw new Error('copy_failed');
      toast.success(tr('Link copied.', 'Lien copié.'));
    } catch {
      toast.error(tr('Unable to copy right now.', 'Impossible de copier pour le moment.'));
    }
  };

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
        eyebrow={tr('Credits', 'Crédits')}
        title={tr('Earn credits', 'Gagnez des crédits')}
        description={tr('Invite friends and earn rewards when they book.', 'Invitez des amis et gagnez des récompenses lorsqu’ils réservent.')}
        aside={(
          <div className={workspaceMetricCardClass}>
            <p className={workspaceLabelClass}>{tr('Balance', 'Solde')}</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-black text-slate-950">{creditBalance}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {formatMadValue(madValue, isFrench ? 'fr' : 'en')}
                </p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Gift className="h-5 w-5" />
              </span>
            </div>
          </div>
        )}
      >
        <div className="rounded-[1.4rem] border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-violet-800">
          {tr('Earn', 'Gagnez')} {formatMadValue(rewardPerReferral, isFrench ? 'fr' : 'en')} {tr('per referral', 'par parrainage')}
        </div>
      </AccountWorkspaceHero>

      <section className={workspacePanelClass}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-950">
              {shareLink ? tr('Share your link', 'Partagez votre lien') : tr('Create referral link', 'Créer un lien de parrainage')}
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {!shareLink ? (
              <button
                type="button"
                onClick={handleShare}
                disabled={creatingLink}
                className={`${workspacePrimaryButtonStrongClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Share2 className="h-4 w-4" />
                {creatingLink ? tr('Preparing link...', 'Préparation du lien...') : tr('Create referral link', 'Créer un lien de parrainage')}
              </button>
            ) : (
              <>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={workspacePrimaryButtonStrongClass}
                >
                  <MessageCircle className="h-4 w-4" />
                  {tr('Share on WhatsApp', 'Partager sur WhatsApp')}
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={workspaceSecondaryButtonClass}
                >
                  <Copy className="h-4 w-4" />
                  {tr('Copy link', 'Copier le lien')}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className={workspacePanelClass}>
        <p className="text-sm font-semibold text-slate-500">
          {tr('Share → Friend joins → You earn', 'Partage → Un ami rejoint → Vous gagnez')}
        </p>
      </section>

      <section className={workspacePanelClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Activity', 'Activité')}</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Recent credits', 'Crédits récents')}</h2>
          </div>
        </div>
        {hasActivity ? (
          <div className="mt-5 space-y-3">
            {recentRewards.map((entry) => (
              <CreditHistoryRow key={entry.id} entry={entry} locale={isFrench ? 'fr' : 'en'} tr={tr} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50/70 p-6">
            <p className="text-sm font-bold text-slate-900">{tr('No credits yet', 'Pas encore de crédits')}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {tr('Credits appear once friends book.', 'Les crédits apparaissent une fois que des amis réservent.')}
            </p>
          </div>
        )}
      </section>

      <ShareLinkModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareLink={snapshot?.shareLink}
        tr={tr}
      />
      <RewardToast reward={rewardToast} />
    </div>
  );
};

export default AccountRewards;
