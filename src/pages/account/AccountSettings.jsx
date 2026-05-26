import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Camera, CheckCircle2, ChevronRight, Globe2, Pencil, Save, ShieldCheck, SlidersHorizontal, Star, Trash2, UserRound, Wallet, X } from 'lucide-react';
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
      {items.map((item) => {
        const ItemIcon = item.icon || ChevronRight;
        const verified = item.status === 'verified';
        const iconClassName = verified
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : item.tone === 'amber'
            ? 'border-amber-100 bg-amber-50 text-amber-700'
            : 'border-violet-100 bg-violet-50 text-violet-700';
        const ctaClassName = verified
          ? 'text-emerald-700'
          : 'text-slate-500';

        return (
          <Link
            key={item.href}
            to={item.href}
            state={item.state}
            className="flex items-center justify-between gap-3 bg-white px-4 py-3.5 transition hover:bg-violet-50/50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${iconClassName}`}>
                <ItemIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${ctaClassName}`}>
                  {verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {item.cta}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>
        );
      })}
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
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    username: '',
    phone: '',
  });
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
  const currentPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;

  const sections = [
    {
      icon: UserRound,
      title: tr('Account', 'Compte'),
      description: tr('Manage your profile, trust status, and owner identity setup.', 'Gérez votre profil, votre statut de confiance et votre identité propriétaire.'),
      items: [
        {
          href: '/account/verification',
          icon: isVerifiedAccount ? CheckCircle2 : ShieldCheck,
          label: tr('Trust center', 'Centre de confiance'),
          cta: verificationCta,
          status: isVerifiedAccount ? 'verified' : '',
        },
        {
          href: '/account/reviews',
          icon: Star,
          tone: 'amber',
          label: tr('Reputation', 'Reputation'),
          cta: tr('Open reputation', 'Ouvrir la reputation'),
          state: { from: currentPath },
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
          icon: Wallet,
          label: tr('Wallet', 'Portefeuille'),
          cta: tr('Open wallet', 'Ouvrir le portefeuille'),
        },
      ],
    },
    {
      icon: SlidersHorizontal,
      title: tr('Preferences', 'Préférences'),
      description: tr('Control account alerts and Inbox notification behavior.', "Gérez les alertes du compte et le comportement des notifications d'Inbox."),
      items: [
        {
          href: '/account/settings#message-notifications',
          icon: Bell,
          label: tr('Notifications', 'Notifications'),
          cta: tr('Manage notifications', 'Gérer les notifications'),
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

  useEffect(() => {
    if (profileEditing) return;
    setProfileForm({
      fullName: profileFullName,
      username: profileUsername,
      phone: profilePhone,
    });
  }, [profileEditing, profileFullName, profilePhone, profileUsername]);

  const profileInitials = buildInitials(profileFullName, profileEmail);
  const backLink = useMemo(() => resolveReturnPath(location, '/account/overview'), [location]);

  const handleStartProfileEditing = () => {
    setProfileForm({
      fullName: profileFullName,
      username: profileUsername,
      phone: profilePhone,
    });
    setProfileNotice('');
    setProfileError('');
    setProfileEditing(true);
  };

  const handleCancelProfileEditing = () => {
    setProfileForm({
      fullName: profileFullName,
      username: profileUsername,
      phone: profilePhone,
    });
    setProfileNotice('');
    setProfileError('');
    setProfileEditing(false);
  };

  const handleProfileFormChange = (field, value) => {
    if (!profileEditing) return;
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
    setProfileNotice('');
    setProfileError('');
  };

  const handleSaveProfileDetails = async () => {
    if (!user?.id || profileSaving) return;

    const nextProfile = {
      full_name: profileForm.fullName.trim(),
      username: profileForm.username.trim(),
      phone: profileForm.phone.trim(),
      phone_number: profileForm.phone.trim(),
    };
    const validation = UserProfileService.validateProfileData({
      username: nextProfile.username,
      phone: nextProfile.phone,
    });

    if (!validation.isValid) {
      setProfileError(Object.values(validation.errors)[0] || tr('Please check your profile details.', 'Veuillez vérifier les détails du profil.'));
      return;
    }

    setProfileSaving(true);
    setProfileNotice('');
    setProfileError('');

    try {
      const { data, error } = await UserProfileService.updateUserProfile(user.id, nextProfile);
      if (error) {
        throw error;
      }

      const normalizedProfile = data || nextProfile;
      updateCurrentUserProfile?.({
        ...normalizedProfile,
        fullName: normalizedProfile.fullName || normalizedProfile.full_name || nextProfile.full_name,
        full_name: normalizedProfile.full_name || nextProfile.full_name,
        username: normalizedProfile.username ?? nextProfile.username,
        phone: normalizedProfile.phone ?? nextProfile.phone,
        phone_number: normalizedProfile.phone_number ?? nextProfile.phone_number,
      });
      setProfileEditing(false);
      setProfileNotice(tr('Profile updated.', 'Profil mis à jour.'));
    } catch (error) {
      setProfileError(
        error?.message ||
        tr('Unable to update your profile right now.', 'Impossible de mettre à jour votre profil pour le moment.')
      );
    } finally {
      setProfileSaving(false);
    }
  };

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
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">
                    {profileFullName || tr('Your account', 'Votre compte')}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {profileEditing
                      ? tr('Edit your profile here. Email stays locked for login security.', 'Modifiez votre profil ici. L’e-mail reste verrouillé pour la sécurité de connexion.')
                      : tr('Manage your profile photo and quickly review your account details here.', 'Gérez votre photo de profil et consultez rapidement les informations de votre compte ici.')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {profileEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelProfileEditing}
                        disabled={profileSaving}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <X className="h-4 w-4" />
                        {tr('Cancel', 'Annuler')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveProfileDetails()}
                        disabled={profileSaving}
                        className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {profileSaving ? tr('Saving…', 'Enregistrement…') : tr('Save', 'Enregistrer')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartProfileEditing}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                    >
                      <Pencil className="h-4 w-4" />
                      {tr('Edit profile', 'Modifier le profil')}
                    </button>
                  )}
                </div>
              </div>

              <div className={`mt-4 grid gap-3 ${workspaceInsetPanelClass} bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Full name', 'Nom complet')}</p>
                  {profileEditing ? (
                    <input
                      value={profileForm.fullName}
                      onChange={(event) => handleProfileFormChange('fullName', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm font-bold text-slate-950 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Full name', 'Nom complet')}
                    />
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-slate-900">{profileFullName || '—'}</p>
                  )}
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Email', 'E-mail')}</p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-900">{profileEmail || '—'}</p>
                  {profileEditing ? (
                    <p className="mt-1 text-[11px] font-bold text-slate-400">
                      {tr('Login email cannot be changed here.', 'L’e-mail de connexion ne peut pas être modifié ici.')}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Username', 'Nom d’utilisateur')}</p>
                  {profileEditing ? (
                    <input
                      value={profileForm.username}
                      onChange={(event) => handleProfileFormChange('username', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm font-bold text-slate-950 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Username', 'Nom d’utilisateur')}
                    />
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-slate-900">{profileUsername || '—'}</p>
                  )}
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{tr('Phone', 'Téléphone')}</p>
                  {profileEditing ? (
                    <input
                      value={profileForm.phone}
                      onChange={(event) => handleProfileFormChange('phone', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm font-bold text-slate-950 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Phone', 'Téléphone')}
                    />
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-slate-900">{profilePhone || '—'}</p>
                  )}
                </div>
              </div>
              {profileError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {profileError}
                </div>
              ) : null}
              {profileNotice ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {profileNotice}
                </div>
              ) : null}
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
              {tr('Critical account alerts stay on. Customer conversation alerts can be muted here.', "Les alertes critiques du compte restent activées. Les alertes de conversation client peuvent être coupées ici.")}
            </p>
          </div>
        </div>

        <div className={`mt-5 space-y-3 ${workspaceInsetPanelClass} bg-slate-50/70 p-4`}>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{tr('Account & support alerts', 'Alertes compte et support')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('Always on for trust, payment, booking, and support updates.', 'Toujours activé pour les mises à jour de confiance, paiement, réservation et support.')}
              </p>
            </div>
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {tr('Always on', 'Toujours actif')}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{tr('Conversation alerts', 'Alertes de conversation')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('Show floating alerts for incoming renter or customer conversations. Muted messages still stay in Inbox.', "Afficher les alertes flottantes pour les conversations entrantes des locataires ou clients. Les messages coupés restent dans l'Inbox.")}
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
