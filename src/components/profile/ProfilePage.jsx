import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import UserProfileService from '../../services/UserProfileService';
import { fetchSystemSettings, SYSTEM_SETTINGS_UPDATED_EVENT } from '../../services/systemSettingsApi';
import { isBusinessOwnerAccountType } from '../../utils/accountType';
import ChangePasswordModal from './ChangePasswordModal';
import ProfilePictureUpload from './ProfilePictureUpload';
import ProfileSettings from './ProfileSettings';
import ProfileVerificationCard from '../verification/ProfileVerificationCard';
import LoadingSpinner from '../common/LoadingSpinner';

const roleClassName = {
  owner: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  admin: 'border-blue-200 bg-blue-50 text-blue-700',
  employee: 'border-amber-200 bg-amber-50 text-amber-700',
  guide: 'border-violet-200 bg-violet-50 text-violet-700',
  customer: 'border-slate-200 bg-slate-50 text-slate-700',
};

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';

const getTenantLogoFallback = () => {
  if (typeof window === 'undefined') return '';
  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isSaharaXTenant =
    isLocal ||
    hostname === 'saharax.driveout.io' ||
    hostname === 'saharax.co' ||
    hostname === 'www.saharax.co';

  return isSaharaXTenant ? SAHARAX_DEFAULT_LOGO_URL : '';
};

const normalizeStaffIdDocuments = (documents) => {
  if (!documents) return [];
  if (Array.isArray(documents)) return documents.filter(Boolean);
  if (typeof documents === 'string') {
    try {
      const parsed = JSON.parse(documents);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getTrialDaysRemaining = (trialEndsAt) => {
  if (!trialEndsAt) return 0;
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return 0;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

const getSubscriptionPlanMeta = (subscriptionPlan, planType, tr) => {
  const normalizedPlanType = String(planType || '').toLowerCase();
  const normalizedPlan = String(subscriptionPlan || '').toLowerCase();

  if (normalizedPlanType === 'pro') {
    return {
      label: tr('profile.subscription.plans.pro', 'Pro'),
      badgeClass: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
      summary: tr('profile.subscription.planSummary.pro', 'Advanced operations workspace with higher limits and premium controls.'),
    };
  }

  if (normalizedPlanType === 'growth') {
    return {
      label: tr('profile.subscription.plans.growth', 'Growth'),
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
      summary: tr('profile.subscription.planSummary.growth', 'Expanded operations workspace for growing teams and public distribution readiness.'),
    };
  }

  if (normalizedPlanType === 'starter') {
    return {
      label: tr('profile.subscription.plans.starter', 'Starter'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
      summary: tr('profile.subscription.planSummary.starter', 'Core operations workspace for running your business day to day.'),
    };
  }

  if (normalizedPlan === 'saas_web') {
    return {
      label: tr('profile.subscription.plans.saasWeb', 'SaaS + Marketplace'),
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
      summary: tr('profile.subscription.planSummary.saasWeb', 'Full operations workspace with DriveOut marketplace distribution.'),
    };
  }

  if (normalizedPlan === 'saas') {
    return {
      label: tr('profile.subscription.plans.saas', 'SaaS Only'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
      summary: tr('profile.subscription.planSummary.saas', 'Private operations workspace without marketplace distribution.'),
    };
  }

  return {
    label: tr('profile.subscription.plans.freeTrial', 'Free Trial'),
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    summary: tr('profile.subscription.planSummary.freeTrial', 'You are still in the activation trial period.'),
  };
};

const getSubscriptionStatusMeta = (status, verificationStatus, tr) => {
  const normalizedStatus = String(status || '').toLowerCase();
  const normalizedVerificationStatus = String(verificationStatus || '').toLowerCase();

  if (normalizedVerificationStatus === 'rejected') {
    return {
      label: tr('profile.subscription.status.rejected', 'Rejected'),
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (normalizedVerificationStatus === 'needs_info') {
    return {
      label: tr('profile.subscription.status.needsInfo', 'Needs Info'),
      badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  if (normalizedStatus === 'suspended') {
    return {
      label: tr('profile.subscription.status.suspended', 'Suspended'),
      badgeClass: 'border-slate-300 bg-slate-100 text-slate-800',
    };
  }

  if (normalizedStatus === 'active') {
    return {
      label: tr('profile.subscription.status.active', 'Active'),
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (normalizedStatus === 'expired') {
    return {
      label: tr('profile.subscription.status.expired', 'Expired'),
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (normalizedStatus === 'cancelled') {
    return {
      label: tr('profile.subscription.status.cancelled', 'Cancelled'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  return {
    label: tr('profile.subscription.status.trial', 'Trial'),
    badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };
};

const BusinessOwnerSubscriptionCard = ({
  isBusinessOwner,
  verificationStatus,
  subscriptionPlan,
  planType,
  subscriptionStatus,
  billingStatus,
  trialEndsAt,
  subscriptionStartedAt,
  suspensionReason,
  tr,
}) => {
  if (!isBusinessOwner) {
    return null;
  }

  const planMeta = getSubscriptionPlanMeta(subscriptionPlan, planType, tr);
  const statusMeta = getSubscriptionStatusMeta(subscriptionStatus, verificationStatus, tr);
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);
  const isTrial = String(subscriptionStatus || '').toLowerCase() === 'trial';
  const isSuspended = String(subscriptionStatus || '').toLowerCase() === 'suspended';
  const planActionLabel = isTrial
    ? tr('profile.subscription.actions.choose', 'Choose a Plan')
    : tr('profile.subscription.actions.change', 'Change Plan');

  return (
    <div className="mb-5 rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.9)_0%,rgba(255,255,255,1)_55%,rgba(238,242,255,0.95)_100%)] p-5 shadow-[0_20px_60px_rgba(79,70,229,0.10)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
            {tr('profile.subscription.title', 'Subscription')}
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            {tr('profile.subscription.heading', 'Business Owner Activation')}
          </h3>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {planMeta.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${planMeta.badgeClass}`}>
            {planMeta.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.currentPlan', 'Current plan')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{planMeta.label}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.currentStatus', 'Status')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{statusMeta.label}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {isTrial
              ? tr('profile.subscription.trialRemaining', 'Trial remaining')
              : tr('profile.subscription.startedAt', 'Started')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {isTrial
              ? tr('profile.subscription.daysRemaining', '{{count}} days remaining').replace('{{count}}', String(trialDaysRemaining))
              : (subscriptionStartedAt ? new Date(subscriptionStartedAt).toLocaleDateString() : tr('profile.subscription.notStarted', 'Not started yet'))}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.billing', 'Billing')}
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
            {String(billingStatus || 'none').replace('_', ' ')}
          </p>
        </div>
        {isSuspended && suspensionReason ? (
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {tr('profile.subscription.suspensionReason', 'Suspension reason')}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{suspensionReason}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/choose-plan"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800"
        >
          {planActionLabel}
        </a>
        {isTrial ? (
          <p className="text-sm font-medium text-slate-500">
            {tr('profile.subscription.trialNote', 'Select the right package before your trial expires.')}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const ProfilePage = () => {
  const { t } = useTranslation();
  const tr = (key, fallback) => t(key, { defaultValue: fallback });
  const { user, userProfile, getUserRole, updateCurrentUserProfile } = useAuth();
  const userRole = getUserRole();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [tenantLogoUrl, setTenantLogoUrl] = useState('');
  const inheritedTenantLogoUrl = getTenantLogoFallback();

  const splitName = useCallback((name = '') => UserProfileService.splitFullName(name), []);

  const buildFallbackProfile = useCallback(() => {
    const metadata = user?.user_metadata || {};
    const fallbackFirstName = userProfile?.first_name || metadata.first_name || '';
    const fallbackLastName = userProfile?.last_name || metadata.last_name || '';
    const fallbackFullName =
      userProfile?.fullName ||
      userProfile?.full_name ||
      [fallbackFirstName, fallbackLastName].filter(Boolean).join(' ').trim() ||
      metadata.full_name ||
      user?.app_metadata?.full_name ||
      user?.email ||
      '';
    const derivedName = splitName(fallbackFullName);

    return {
      username: userProfile?.username || metadata.username || '',
      full_name: fallbackFullName,
      first_name: fallbackFirstName || derivedName.first_name || '',
      last_name: fallbackLastName || derivedName.last_name || '',
      profile_picture_url: metadata.profile_picture_url || metadata.avatar_url || null,
      phone: userProfile?.phone || userProfile?.phone_number || metadata.phone || '',
      address: userProfile?.address || metadata.address || '',
      date_of_birth: userProfile?.date_of_birth || metadata.date_of_birth || '',
      emergency_contact: userProfile?.emergency_contact || metadata.emergency_contact || '',
      emergency_phone: userProfile?.emergency_phone || metadata.emergency_phone || '',
      staff_id_documents: normalizeStaffIdDocuments(userProfile?.staff_id_documents || metadata.staff_id_documents),
      preferences: userProfile?.preferences || metadata.preferences || {},
      updated_at: userProfile?.updated_at || metadata.updated_at || null,
    };
  }, [
    splitName,
    user?.app_metadata?.full_name,
    user?.email,
    user?.user_metadata,
    userProfile?.address,
    userProfile?.date_of_birth,
    userProfile?.emergency_contact,
    userProfile?.emergency_phone,
    userProfile?.first_name,
    userProfile?.fullName,
    userProfile?.full_name,
    userProfile?.last_name,
    userProfile?.phone,
    userProfile?.phone_number,
    userProfile?.preferences,
    userProfile?.staff_id_documents,
    userProfile?.updated_at,
    userProfile?.username,
  ]);

  const fallbackProfile = useMemo(
    () => buildFallbackProfile(),
    [buildFallbackProfile]
  );

  const displayProfile = useMemo(
    () => profile || fallbackProfile,
    [fallbackProfile, profile]
  );
  const loadFailedMessage = tr(
    'profile.errors.loadFailed',
    'Unable to load profile. Showing your account information instead.'
  );
  const displayName =
    [displayProfile?.first_name, displayProfile?.last_name].filter(Boolean).join(' ').trim() ||
    displayProfile?.full_name ||
    user?.email ||
    tr('profile.title', 'My Profile');
  const roleLabel = String(userRole || 'user').toUpperCase();
  const staffIdDocumentCount = normalizeStaffIdDocuments(displayProfile?.staff_id_documents || user?.user_metadata?.staff_id_documents).length;
  const normalizedAccountType = String(
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).toLowerCase();
  const isBusinessOwner = userRole === 'business_owner' || isBusinessOwnerAccountType(normalizedAccountType);

  const tabs = useMemo(() => {
    const items = [
      { id: 'profile', label: tr('profile.tabs.profile', 'Profile'), icon: '👤' },
      { id: 'security', label: tr('profile.tabs.security', 'Security'), icon: '🔒' },
      { id: 'preferences', label: tr('profile.tabs.preferences', 'Preferences'), icon: '⚙️' },
    ];
    if (userRole === 'owner' || userRole === 'admin') {
      items.push({ id: 'activity', label: tr('profile.tabs.activity', 'Activity'), icon: '📊' });
    }
    return items;
  }, [t, userRole]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotice(null);
      setProfile((prev) => prev || fallbackProfile);

      try {
        const { data, error } = await UserProfileService.getUserProfile(user.id);

        if (cancelled) return;

        if (error) {
          setNotice({
            tone: 'warning',
            message: loadFailedMessage,
          });
          setProfile(fallbackProfile);
          return;
        }

        setProfile({ ...fallbackProfile, ...(data || {}) });
      } catch (error) {
        if (cancelled) return;
        console.error('Profile loading error:', error);
        setProfile(fallbackProfile);
        setNotice({
          tone: 'warning',
          message: loadFailedMessage,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fallbackProfile, loadFailedMessage, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id || !['owner', 'admin'].includes(userRole)) {
        setActivityLog([]);
        return;
      }

      try {
        const { data } = await UserProfileService.getUserActivityLog(user.id, {
          limit: 20,
          userName: displayName,
          userEmail: user.email,
        });

        if (!cancelled) {
          setActivityLog(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Activity log loading error:', error);
          setActivityLog([]);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [displayName, user?.email, user?.id, userRole]);

  useEffect(() => {
    let cancelled = false;

    const loadTenantBranding = async () => {
      try {
        const tenantSettings = await fetchSystemSettings();
        if (!cancelled) {
          setTenantLogoUrl(String(tenantSettings?.logoUrl || '').trim());
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Profile branding unavailable:', error);
          setTenantLogoUrl('');
        }
      }
    };

    loadTenantBranding();

    const handleBrandingUpdate = (event) => {
      const nextLogoUrl = String(event?.detail?.logoUrl || '').trim();
      setTenantLogoUrl(nextLogoUrl);
    };

    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, []);

  const handleProfileUpdate = async (updatedData) => {
    try {
      const { data, error } = await UserProfileService.updateUserProfile(user.id, updatedData);
      if (error) {
        setNotice({ tone: 'warning', message: error.message });
        return false;
      }

      const nextFirstName = String(updatedData?.first_name || data?.first_name || '').trim();
      const nextLastName = String(updatedData?.last_name || data?.last_name || '').trim();
      const nextFullName =
        String(
          [nextFirstName, nextLastName].filter(Boolean).join(' ').trim() ||
          updatedData?.full_name ||
          data?.full_name ||
          ''
        ).trim();
      const nextProfile = {
        ...(profile || fallbackProfile),
        ...(data || {}),
        ...updatedData,
        username: String(updatedData?.username ?? data?.username ?? profile?.username ?? fallbackProfile?.username ?? '').trim().toLowerCase(),
        first_name: nextFirstName,
        last_name: nextLastName,
        full_name: nextFullName,
      };

      setProfile(nextProfile);
      updateCurrentUserProfile(nextProfile);
      setNotice(null);
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      setNotice({
        tone: 'warning',
        message: tr('profile.errors.updateFailed', 'Unable to update profile'),
      });
      return false;
    }
  };

  const handlePasswordChange = async (newPassword) => {
    const { error } = await UserProfileService.changePassword(newPassword);
    if (error) {
      toast.error(tr('profile.password.updateFailed', 'Failed to update password'), {
        description: error.message || tr('common.tryAgain', 'Please try again.'),
      });
      throw error;
    }

    toast.success(tr('profile.changePassword', 'Change Password'), {
      description: tr('profile.password.updatedDescription', 'Password updated successfully.'),
    });
    setShowPasswordModal(false);
    return true;
  };

  const handleProfilePictureUpdate = (newPictureUrl) => {
      setProfile((prev) => ({
      ...(prev || fallbackProfile),
      profile_picture_url: newPictureUrl,
    }));
  };

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-slate-950">
            {tr('profile.notAuthenticated', 'You are not signed in')}
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {tr('profile.pleaseLogin', 'Please log in to view your profile.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef2ff_0,#f8fafc_36%,#f8fafc_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-[34px] border border-violet-100/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="relative overflow-hidden border-b border-violet-200/80 bg-[linear-gradient(135deg,rgba(221,214,254,0.98)_0%,rgba(243,244,246,0.98)_42%,rgba(196,181,253,0.96)_100%)] px-5 py-7 text-slate-950 sm:px-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(109,40,217,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.18),transparent_28%)]" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ProfilePictureUpload
                  userId={user.id}
                  fallbackLabel={displayName || user.email}
                  currentPictureUrl={displayProfile?.profile_picture_url}
                  fallbackImageUrl={tenantLogoUrl || inheritedTenantLogoUrl}
                  onPictureUpdate={handleProfilePictureUpdate}
                  size="large"
                  showInstructions={false}
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-500">
                    {tr('profile.title', 'My Profile')}
                  </p>
                  <h1 className="mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl">
                    {displayName}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                    {tr('profile.roleBasedAccess', 'Role-based access')}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <span className={`rounded-full border px-3.5 py-1.5 text-xs font-black tracking-[0.14em] shadow-sm ${roleClassName[userRole] || roleClassName.customer}`}>
                      {roleLabel}
                    </span>
                    {userRole !== 'customer' && (
                      <span className="rounded-full border border-violet-200 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
                        {staffIdDocumentCount} {staffIdDocumentCount === 1 ? tr('profile.idFile', 'ID file') : tr('profile.idFiles', 'ID files')}
                      </span>
                    )}
                    <span className="rounded-full border border-violet-200 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
                      {user.email}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-slate-900 shadow-[0_12px_30px_rgba(99,102,241,0.12)] transition hover:-translate-y-0.5 hover:bg-violet-50 sm:w-auto"
              >
                🔒 {tr('profile.changePassword', 'Change Password')}
              </button>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3.5 sm:px-6">
            <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/90 p-1.5 shadow-inner">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-w-fit items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    activeTab === tab.id
                      ? 'bg-white text-violet-700 shadow-[0_8px_18px_rgba(79,70,229,0.12)]'
                      : 'text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {notice && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-800 shadow-sm">
            {notice.message}
          </div>
        )}

        <section className="rounded-[34px] border border-violet-100/70 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-5">
          {activeTab === 'profile' && (
            <>
              <BusinessOwnerSubscriptionCard
                isBusinessOwner={isBusinessOwner}
                verificationStatus={userProfile?.verificationStatus}
                subscriptionPlan={userProfile?.subscriptionPlan}
                planType={userProfile?.planType}
                subscriptionStatus={userProfile?.subscriptionStatus}
                billingStatus={userProfile?.billingStatus}
                trialEndsAt={userProfile?.trialEndsAt}
                subscriptionStartedAt={userProfile?.subscriptionStartedAt}
                suspensionReason={userProfile?.suspensionReason}
                tr={tr}
              />
              <ProfileSettings
                profile={displayProfile}
                userRole={userRole}
                onProfileUpdate={handleProfileUpdate}
              />
              <ProfileVerificationCard profile={displayProfile} />
            </>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.9)_0%,rgba(255,255,255,1)_70%)] p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
                  {tr('profile.tabs.security', 'Security')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {tr('profile.security.password', 'Password')}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {tr('profile.security.passwordDescription', 'Update your account password.')}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-violet-800"
                >
                  {tr('profile.changePassword', 'Change Password')}
                </button>
              </div>
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">
                      {tr('profile.security.twoFactor', 'Two-factor authentication')}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {tr('profile.security.twoFactorDescription', 'Add an extra layer of protection to your account.')}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    {tr('common.comingSoon', 'Coming soon')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.9)_0%,rgba(255,255,255,1)_70%)] p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
                {tr('profile.tabs.preferences', 'Preferences')}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {tr('profile.preferences.notifications', 'Notifications')}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {tr('profile.preferences.notificationsDescription', 'Choose how you want to receive account updates.')}
              </p>
              <span className="mt-5 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                {tr('common.comingSoon', 'Coming soon')}
              </span>
            </div>
          )}

          {activeTab === 'activity' && ['owner', 'admin'].includes(userRole) && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
                  {tr('profile.tabs.activity', 'Activity')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {tr('profile.activity.title', 'Activity')}
                </h2>
              </div>
              {activityLog.length > 0 ? (
                activityLog.map((activity, index) => (
                  <div key={`${activity.id || activity.action}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">{activity.action}</p>
                    <p className="mt-1 text-sm text-slate-500">{activity.description || activity.details}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-400">
                      {activity.created_at ? new Date(activity.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                  {tr('profile.activity.noActivity', 'No activity recorded yet.')}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onPasswordChange={handlePasswordChange}
        />
      )}
    </div>
  );
};

export default ProfilePage;
