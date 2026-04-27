import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Gift, Link2, MessageCircle, Rocket, Share2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import GrowthLoopApiService from '../../services/GrowthLoopApiService';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import RewardToast from '../../components/account/RewardToast';
import { buildMarketplaceListingPath, buildMarketplaceWhatsappShareHref } from '../../utils/marketplaceShareLinks';
import {
  workspacePrimaryButtonStrongClass,
  workspaceSecondaryButtonClass,
  workspaceLabelClass,
  workspaceMetricCardClass,
  workspacePanelClass,
  workspaceSectionDescriptionClass,
  workspaceTitleClass,
} from '../../components/account/accountWorkspaceDesignSystem';

const formatMadValue = (value, locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0)) + ' MAD';

const safeNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

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
      await navigator.clipboard.writeText(shareLink.shortUrl);
      toast.success(tr('Link copied.', 'Lien copié.'));
    } catch {
      toast.error(tr('Unable to copy right now.', 'Impossible de copier pour le moment.'));
    }
  };

  const whatsappUrl = shareLink?.shortUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${tr('View this vehicle', 'Voir ce véhicule')}\n${shareLink.shortUrl}`)}`
    : '';

  const modal = (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/40 px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div className="w-full max-w-lg rounded-t-[2rem] border border-violet-200 bg-white p-6 shadow-[0_-18px_48px_rgba(91,33,182,0.18)] sm:rounded-[2rem] sm:shadow-[0_30px_80px_rgba(91,33,182,0.22)]">
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-600">
              {tr('Share link', 'Lien de partage')}
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {tr('Promote your listing', 'Promouvoir votre annonce')}
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
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white"
          >
            <Copy className="h-4 w-4" />
            {tr('Copy link', 'Copier le lien')}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modal;
  }

  return createPortal(modal, document.body);
};

const StatCard = ({ label, value, icon: Icon }) => (
  <article className={workspaceMetricCardClass}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={workspaceLabelClass}>{label}</p>
        <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
      </div>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </article>
);

const AccountBoost = () => {
  const { user } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = useCallback((en, fr) => (isFrench ? fr : en), [isFrench]);

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [activeListing, setActiveListing] = useState(null);
  const [rewardToast, setRewardToast] = useState(null);

  const loadSnapshot = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [boostSnapshot, ownerVehicles] = await Promise.all([
        GrowthLoopApiService.getSnapshot('boost'),
        user?.id ? BusinessMarketplaceService.getOwnerVehicles(user.id) : Promise.resolve({ vehicles: [] }),
      ]);
      const liveVehicle = (ownerVehicles?.vehicles || []).find((vehicle) => vehicle.listingStatus === 'live') || null;
      setActiveListing(liveVehicle);
      setSnapshot(boostSnapshot);
    } catch (error) {
      toast.error(error.message || tr('Unable to load Boost right now.', 'Impossible de charger Boost pour le moment.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [tr, user?.id]);

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
      title: tr('Boost unlocked', 'Boost débloqué'),
      body: `${entry.amount} ${tr('credits added', 'crédits ajoutés')}`,
    };
  }, [snapshot?.recentRewards, tr]);

  useEffect(() => {
    if (!latestReward?.id) return;
    setRewardToast(latestReward);
  }, [latestReward]);

  const handleShare = async () => {
    if (!activeListing?.listingId) {
      toast.info(tr('Publish one vehicle first to unlock Boost.', 'Publiez un véhicule d’abord pour débloquer Boost.'));
      return;
    }

    setCreatingLink(true);
    try {
      const next = await GrowthLoopApiService.createShareLink({
        type: 'boost',
        destinationUrl: `${window.location.origin}${buildMarketplaceListingPath(activeListing.listingId, {
          source: 'boost-share',
          via: 'owner-share',
        })}`,
      });
      setSnapshot(next);
      setShareModalOpen(true);
      toast.success(tr('Your link is ready.', 'Votre lien est prêt.'));
    } catch (error) {
      toast.error(error.message || tr('Unable to create your share link.', 'Impossible de créer votre lien de partage.'));
    } finally {
      setCreatingLink(false);
    }
  };

  const suppressLoader = shouldSuppressBlockingPageLoader('account-boost');
  if (loading && suppressLoader) {
    return <AccountWorkspaceLoadingShell variant="detail" />;
  }

  const progress = snapshot?.progress || { clicks: 0, bookings: 0 };
  const boostCredits = safeNumber(snapshot?.wallet?.balance);
  const creditValue = snapshot?.wallet?.madValue || 0;
  const hasLiveLink = Boolean(snapshot?.shareLink?.shortUrl);
  const boostWhatsappUrl = useMemo(
    () => activeListing?.listingId
      ? buildMarketplaceWhatsappShareHref({
          listingId: activeListing.listingId,
          title: activeListing.title || activeListing.name || '',
          dailyPrice: activeListing.dailyPrice || activeListing.pricePerDay || '',
          currencyCode: activeListing.currencyCode || 'MAD',
          locationLabel: activeListing.location || activeListing.city || '',
          tr,
          source: 'boost-share',
        })
      : '',
    [activeListing?.city, activeListing?.currencyCode, activeListing?.dailyPrice, activeListing?.listingId, activeListing?.location, activeListing?.name, activeListing?.pricePerDay, activeListing?.title, tr]
  );
  const howItWorks = [
    {
      title: tr('Create your share link', 'Créez votre lien de partage'),
      body: tr('Generate one link for your live vehicle.', 'Générez un seul lien pour votre véhicule en ligne.'),
    },
    {
      title: tr('Share your listing', 'Partagez votre annonce'),
      body: tr('Post it anywhere your audience already is.', 'Publiez-le là où votre audience est déjà présente.'),
    },
    {
      title: tr('Turn visits into bookings', 'Transformez les visites en réservations'),
      body: tr('Track visits and real bookings from that link.', 'Suivez les visites et les vraies réservations depuis ce lien.'),
    },
  ];

  return (
    <div className="space-y-6">
      <AccountWorkspaceHero
        eyebrow={tr('Boost', 'Boost')}
        title={tr('Promote your vehicle', 'Promouvoir votre véhicule')}
        description={tr(
          'Share your listing and generate more real bookings.',
          'Partagez votre annonce et générez plus de vraies réservations.'
        )}
        aside={(
          <div className={workspacePanelClass}>
            <p className={workspaceLabelClass}>
              {tr('Boost credits', 'Boost crédits')}
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-black text-slate-950">{boostCredits}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {formatMadValue(creditValue, isFrench ? 'fr' : 'en')}
                </p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <Gift className="h-5 w-5" />
              </span>
            </div>
          </div>
        )}
      />

      <section className={workspacePanelClass}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className={workspaceLabelClass}>
              {tr('Primary action', 'Action principale')}
            </p>
            <h2 className={workspaceTitleClass}>
              {tr('Create share link', 'Créer un lien de partage')}
            </h2>
            <p className={workspaceSectionDescriptionClass}>
              {activeListing?.listingId
                ? tr('Create one link for your live listing and share it anywhere.', 'Créez un lien pour votre annonce en ligne et partagez-le partout.')
                : tr('Publish one vehicle first, then create a share link.', 'Publiez d’abord un véhicule, puis créez un lien de partage.')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleShare}
              disabled={creatingLink || !activeListing?.listingId}
              className={`${workspacePrimaryButtonStrongClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Share2 className="h-4 w-4" />
              {creatingLink ? tr('Preparing link...', 'Préparation du lien...') : tr('Create share link', 'Créer un lien de partage')}
            </button>
            {hasLiveLink ? (
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className={workspaceSecondaryButtonClass}
              >
                <Link2 className="h-4 w-4" />
                {tr('View link', 'Voir le lien')}
              </button>
            ) : null}
            {boostWhatsappUrl ? (
              <a
                href={boostWhatsappUrl}
                target="_blank"
                rel="noreferrer"
                className={workspaceSecondaryButtonClass}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className={workspacePanelClass}>
        <p className={workspaceLabelClass}>
          {tr('How it works', 'Comment ça marche')}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {howItWorks.map((step, index) => (
            <article key={step.title} className="rounded-[1.55rem] border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-violet-700 shadow-sm">
                0{index + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-slate-950">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={tr('Visits', 'Visites')}
          value={String(progress.clicks || 0)}
          icon={TrendingUp}
        />
        <StatCard
          label={tr('Bookings', 'Réservations')}
          value={String(progress.bookings || 0)}
          icon={Rocket}
        />
        <StatCard
          label={tr('Credits', 'Crédits')}
          value={String(boostCredits)}
          icon={Gift}
        />
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

export default AccountBoost;
