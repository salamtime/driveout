import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Camera, ChevronRight, Globe2, ShieldCheck, SlidersHorizontal, Star, Trash2, UserRound, Wallet } from 'lucide-react';
import i18n from '../../i18n';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import {
  workspacePanelClass,
  workspaceInsetPanelClass,
} from '../../components/account/accountWorkspaceDesignSystem';
import { useAuth } from '../../contexts/AuthContext';
import VerificationService from '../../services/VerificationService';
import UserProfileService from '../../services/UserProfileService';
import { getMessageNotificationPreferences } from '../../utils/messageNotificationPreferences';
import { resolveReturnPath } from '../../utils/navigationReturn';

const SettingsSectionCard = ({ icon: Icon, title, description, items }) => (
  <section className={workspacePanelClass}>
    <div className="flex items-start gap-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>

    <div className={`mt-5 divide-y divide-slate-200 overflow-hidden ${workspaceInsetPanelClass} bg-slate-50/70 p-0`}>
      {items.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className="flex items-center justify-between gap-3 bg-white px-4 py-3.5 transition hover:bg-violet-50/50"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{item.cta}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </Link>
      ))}
    </div>
  </section>
);

const buildInitials = (fullName = '', email = '') => {
  const seed = String(fullName || email || '').trim();
  const tokens = seed.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 'SX';
  return tokens.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
};

const AccountSettings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, userProfile, session, updateCurrentUserProfile } = useAuth();
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [profilePictureBusyAction, setProfilePictureBusyAction] = useState('');
  const [profilePictureError, setProfilePictureError] = useState('');
  const [customerMessageNotificationsEnabled, setCustomerMessageNotificationsEnabled] = useState(true);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsNotice, setNotificationsNotice] = useState('');
  const previewObjectUrlRef = useRef('');
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadVerificationSummary = async () => {
      if (!user?.id) {
        setVerificationSummary(null);
        return;
      }

      try {
        const result = await VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true });
        if (active) {
          setVerificationSummary(result?.summary || null);
        }
      } catch {
        if (active) {
          setVerificationSummary(null);
        }
      }
    };

    void loadVerificationSummary();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    setProfilePictureUrl(String(
      userProfile?.profile_picture_url ||
      userProfile?.avatar_url ||
      user?.profile_picture_url ||
      session?.user?.user_metadata?.profile_picture_url ||
      session?.user?.user_metadata?.avatar_url ||
      ''
    ).trim());
  }, [
    session?.user?.user_metadata?.avatar_url,
    session?.user?.user_metadata?.profile_picture_url,
    user?.profile_picture_url,
    userProfile?.avatar_url,
    userProfile?.profile_picture_url,
  ]);

  useEffect(() => {
    setCustomerMessageNotificationsEnabled(
      getMessageNotificationPreferences({ userProfile, user, session }).customerMessages
    );
  }, [session, user, userProfile]);

  const verificationStatus = String(
    verificationSummary?.status ||
    userProfile?.verificationStatus ||
    user?.user_metadata?.verification_status ||
    user?.app_metadata?.verification_status ||
    ''
  ).trim().toLowerCase();
  const isVerifiedAccount = verificationStatus === 'approved' || verificationStatus === 'verified';
  const verificationCta = useMemo(
    () => (
      isVerifiedAccount
        ? tr('Verified', 'Vérifié')
        : tr('Open trust center', 'Ouvrir le centre de confiance')
    ),
    [isFrench, isVerifiedAccount]
  );

  const sections = [
    {
      icon: UserRound,
      title: tr('Account', 'Compte'),
      description: tr('Manage your profile, trust status, and owner identity setup.', 'Gérez votre profil, votre statut de confiance et votre identité propriétaire.'),
      items: [
        {
          href: '/customer/profile',
          label: tr('Profile details', 'Détails du profil'),
          cta: tr('Open profile', 'Ouvrir le profil'),
        },
        {
          href: '/account/verification',
          label: tr('Trust center', 'Centre de confiance'),
          cta: verificationCta,
        },
        {
          href: '/account/reviews',
          label: tr('Reputation', 'Reputation'),
          cta: tr('Open reputation', 'Ouvrir la reputation'),
        },
      ],
    },
    {
      icon: Wallet,
      title: tr('Payments', 'Paiements'),
      description: tr('Access wallet, payments, and payouts.', 'Accédez au portefeuille, aux paiements et aux virements.'),
      items: [
        {
          href: '/account/revenue',
          label: tr('Wallet', 'Portefeuille'),
          cta: tr('Open wallet', 'Ouvrir le portefeuille'),
        },
      ],
    },
    {
      icon: SlidersHorizontal,
      title: tr('Preferences', 'Préférences'),
      description: tr('Control notifications, language, and app settings.', 'Gérez les notifications, la langue et les réglages de l’application.'),
      items: [
        {
          href: '/account/settings#message-notifications',
          label: tr('Notifications', 'Notifications'),
          cta: tr('Manage notifications', 'Gérer les notifications'),
        },
        {
          href: '/customer/profile?section=language',
          label: tr('Language', 'Langue'),
          cta: tr('Change language', 'Changer la langue'),
        },
        {
          href: '/customer/profile?section=settings',
          label: tr('App settings', 'Réglages de l’application'),
          cta: tr('Open settings', 'Ouvrir les réglages'),
        },
      ],
    },
  ];

  const quickHighlights = [
    {
      icon: ShieldCheck,
      label: tr('Verification', 'Vérification'),
    },
    {
      icon: Wallet,
      label: tr('Wallet', 'Portefeuille'),
    },
    {
      icon: Bell,
      label: tr('Notifications', 'Notifications'),
    },
    {
      icon: Star,
      label: tr('Reputation', 'Reputation'),
    },
    {
      icon: Globe2,
      label: tr('Language', 'Langue'),
    },
  ];

  const profileFullName = String(
    userProfile?.full_name ||
    userProfile?.fullName ||
    user?.full_name ||
    session?.user?.user_metadata?.full_name ||
    userProfile?.username ||
    session?.user?.email ||
    ''
  ).trim();
  const profileEmail = String(
    userProfile?.email ||
    user?.email ||
    session?.user?.email ||
    ''
  ).trim();
  const profileUsername = String(
    userProfile?.username ||
    user?.username ||
    session?.user?.user_metadata?.username ||
    ''
  ).trim();
  const profilePhone = String(
    userProfile?.phone ||
    user?.phone ||
    session?.user?.user_metadata?.phone ||
    ''
  ).trim();
  const profileInitials = buildInitials(profileFullName, profileEmail);
  const backLink = useMemo(() => resolveReturnPath(location, '/account/overview'), [location]);

  const applyProfilePictureUpdate = (url) => {
    setProfilePictureUrl(String(url || '').trim());
    updateCurrentUserProfile?.({
      profile_picture_url: url || null,
      avatar_url: url || null,
    });
  };

  const handleProfilePictureSelection = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file || !user?.id) return;

    setProfilePictureBusyAction('upload');
    setProfilePictureError('');
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = previewUrl;
    setProfilePictureUrl(previewUrl);

    try {
      const result = await UserProfileService.uploadProfilePicture(user.id, file);
      if (result?.error) {
        setProfilePictureError(
          result.error?.message ||
          tr('Unable to upload your profile picture right now.', 'Impossible de téléverser votre photo de profil pour le moment.')
        );
      } else {
        applyProfilePictureUpdate(result?.data?.url || result?.data?.user?.profile_picture_url || '');
      }
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
      setProfilePictureBusyAction('');
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!user?.id || !profilePictureUrl) return;

    setProfilePictureBusyAction('delete');
    setProfilePictureError('');
    const previousUrl = profilePictureUrl;
    applyProfilePictureUpdate('');

    try {
      const result = await UserProfileService.deleteProfilePicture(user.id, previousUrl);
      if (result?.error) {
        applyProfilePictureUpdate(previousUrl);
        setProfilePictureError(
          result.error?.message ||
          tr('Unable to remove your profile picture right now.', 'Impossible de supprimer votre photo de profil pour le moment.')
        );
      }
    } finally {
      setProfilePictureBusyAction('');
    }
  };

  const handleCustomerMessageNotificationsToggle = async (enabled) => {
    if (!user?.id || notificationsSaving) return;

    const currentPreferences =
      userProfile?.preferences ||
      session?.user?.user_metadata?.preferences ||
      user?.user_metadata?.preferences ||
      {};
    const nextPreferences = {
      ...currentPreferences,
      messagingNotifications: {
        ...(currentPreferences?.messagingNotifications || currentPreferences?.messageNotifications || currentPreferences?.messaging || {}),
        customerMessages: Boolean(enabled),
      },
    };

    setCustomerMessageNotificationsEnabled(Boolean(enabled));
    setNotificationsSaving(true);
    setNotificationsNotice('');

    try {
      const { data, error } = await UserProfileService.updateUserProfile(user.id, {
        preferences: nextPreferences,
      });

      if (error) {
        throw error;
      }

      updateCurrentUserProfile?.({
        preferences: data?.preferences || nextPreferences,
      });
      setNotificationsNotice(
        enabled
          ? tr('Customer message notifications are on.', 'Les notifications de messages clients sont activées.')
          : tr('Customer message notifications are off.', 'Les notifications de messages clients sont désactivées.')
      );
    } catch (error) {
      setCustomerMessageNotificationsEnabled(!enabled);
      setNotificationsNotice(
        error?.message ||
        tr('Unable to update notification preferences right now.', 'Impossible de mettre à jour les préférences de notification pour le moment.')
      );
    } finally {
      setNotificationsSaving(false);
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
        eyebrow={tr('Settings', 'Paramètres')}
        title={tr('Settings', 'Paramètres')}
        description={tr('Manage your account, payments, and preferences.', 'Gérez votre compte, vos paiements et vos préférences.')}
        aside={
          <div className="flex flex-wrap gap-2">
            {quickHighlights.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            ))}
          </div>
        }
      />

      <section className={`${workspacePanelClass} overflow-hidden`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0">
              {profilePictureUrl ? (
                <img
                  src={profilePictureUrl}
                  alt={profileFullName || tr('Profile picture', 'Photo de profil')}
                  className="h-20 w-20 rounded-[24px] border border-slate-200 object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-violet-200 bg-violet-50 text-xl font-black text-violet-700 shadow-sm">
                  {profileInitials}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {tr('Your profile', 'Votre profil')}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950">
                {profileFullName || tr('Your account', 'Votre compte')}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {tr('Manage your profile photo and quickly review your account details here.', 'Gérez votre photo de profil et consultez rapidement les informations de votre compte ici.')}
              </p>

              <div className={`mt-4 grid gap-3 ${workspaceInsetPanelClass} bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Full name', 'Nom complet')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{profileFullName || '—'}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Email', 'E-mail')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 break-all">{profileEmail || '—'}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Username', 'Nom d’utilisateur')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{profileUsername || '—'}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Phone', 'Téléphone')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{profilePhone || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm shrink-0 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900">{tr('Profile picture', 'Photo de profil')}</p>
              <p className="mt-1 text-sm text-slate-500">
                {tr('Upload a profile photo so your account feels more personal across messages and your workspace.', 'Ajoutez une photo de profil pour rendre votre compte plus personnel dans les messages et votre espace.')}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePictureSelection}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
              >
                <Camera className="h-4 w-4" />
                {tr('Upload photo', 'Téléverser une photo')}
              </button>
              {profilePictureUrl ? (
                <button
                  type="button"
                  onClick={handleDeleteProfilePicture}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {tr('Remove photo', 'Supprimer la photo')}
                </button>
              ) : null}
              <Link
                to="/customer/profile"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
              >
                <UserRound className="h-4 w-4" />
                {tr('Open full profile', 'Ouvrir le profil complet')}
              </Link>
            </div>
            {profilePictureBusyAction ? (
              <p className="text-xs font-medium text-slate-400">
                {profilePictureBusyAction === 'delete'
                  ? tr('Removing photo…', 'Suppression de la photo…')
                  : tr('Saving photo…', 'Enregistrement de la photo…')}
              </p>
            ) : null}
            {profilePictureError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {profilePictureError}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <SettingsSectionCard key={section.title} {...section} />
        ))}
      </div>

      <section id="message-notifications" className={workspacePanelClass}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 shadow-sm">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-950">{tr('Inbox notifications', "Notifications d'Inbox")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {tr('Support updates always reach you. Customer Inbox alerts can be turned on or off here.', "Les mises à jour du support vous parviennent toujours. Les alertes de l'Inbox client peuvent être activées ou désactivées ici.")}
            </p>
          </div>
        </div>

        <div className={`mt-5 space-y-3 ${workspaceInsetPanelClass} bg-slate-50/70 p-4`}>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{tr('Support Inbox', 'Inbox support')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('Always on so account and support updates are never missed.', 'Toujours activé pour ne jamais manquer les mises à jour du compte et du support.')}
              </p>
            </div>
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {tr('Required', 'Obligatoire')}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{tr('Customer Inbox', 'Inbox client')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('Show or hide floating Inbox alerts for incoming customer or renter conversations.', "Afficher ou masquer les alertes flottantes d'Inbox pour les conversations entrantes des clients ou locataires.")}
              </p>
            </div>
            <button
              type="button"
              disabled={notificationsSaving}
              onClick={() => void handleCustomerMessageNotificationsToggle(!customerMessageNotificationsEnabled)}
              className={`inline-flex min-w-[86px] items-center justify-center rounded-full px-4 py-2 text-xs font-bold transition ${
                customerMessageNotificationsEnabled
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
              } ${notificationsSaving ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {notificationsSaving
                ? tr('Saving…', 'Enregistrement…')
                : customerMessageNotificationsEnabled
                  ? tr('Allowed', 'Activé')
                  : tr('Muted', 'Muet')}
            </button>
          </div>
        </div>

        {notificationsNotice ? (
          <p className="mt-3 text-sm font-medium text-slate-500">{notificationsNotice}</p>
        ) : null}
      </section>
    </div>
  );
};

export default AccountSettings;
