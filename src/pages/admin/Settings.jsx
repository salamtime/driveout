import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  CalendarDays,
  Image as ImageIcon,
  KeyRound,
  MessageSquareMore,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Store,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import { defaultSystemSettings, fetchSystemSettings, saveSystemSettings } from '../../services/systemSettingsApi';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminWorkspaceLoadingShell from '../../components/admin/AdminWorkspaceLoadingShell';
import i18n from '../../i18n';
import { supabase } from '../../lib/supabase';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';
const SAHARAX_DEFAULT_STAMP_URL = '/assets/stamp.png';

const getBrandingContext = () => {
  if (typeof window === 'undefined') {
    return { isSaharaXTenant: false, isLocal: false };
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isSaharaXTenant =
    isLocal ||
    hostname === 'saharax.driveout.io' ||
    hostname === 'saharax.co' ||
    hostname === 'www.saharax.co';

  return { isSaharaXTenant, isLocal };
};

const getTabItems = (isFrench) => [
  { id: 'overview', label: isFrench ? 'Vue d’ensemble' : 'Overview', icon: Settings2 },
  { id: 'business', label: isFrench ? 'Profil entreprise' : 'Business Profile', icon: Store },
  { id: 'operations', label: isFrench ? 'Opérations' : 'Operations', icon: Briefcase },
  { id: 'rentalRules', label: isFrench ? 'Règles de location' : 'Rental Rules', icon: CalendarDays },
  { id: 'finance', label: isFrench ? 'Finance & taxes' : 'Finance & Tax', icon: Shield },
  { id: 'notifications', label: isFrench ? 'Notifications' : 'Notifications', icon: Bell },
  { id: 'messaging', label: isFrench ? 'Messagerie' : 'Messaging', icon: MessageSquareMore },
  { id: 'security', label: isFrench ? 'Sécurité & accès' : 'Security & Access', icon: KeyRound },
];

const FIELD_CLASS =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50';

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-800 hover:shadow-[0_18px_34px_rgba(79,70,229,0.24)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition-all duration-200 hover:border-violet-300 hover:from-violet-100 hover:to-indigo-100 disabled:cursor-not-allowed disabled:opacity-60';

const ToggleCard = ({ title, description, checked, onChange, disabled }) => (
  <div
    className={`flex items-center justify-between rounded-[1.75rem] border px-4 py-4 shadow-sm transition-all ${
      checked
        ? 'border-violet-200 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 shadow-[0_16px_34px_rgba(124,58,237,0.10)]'
        : 'border-slate-200 bg-white'
    }`}
  >
    <div className="pr-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition duration-200 ${
        checked
          ? 'border-violet-500 bg-gradient-to-r from-violet-600 to-indigo-700'
          : 'border-slate-200 bg-slate-200'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:shadow-sm'}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

const SectionCard = ({ title, description, action, children }) => (
  <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
    <div className="flex flex-col gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">Workspace</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const AssetPreview = ({ label, url, emptyLabel, bucketLabel }) => (
  <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500 break-all">{url || emptyLabel}</p>
      </div>
      <div className="rounded-xl bg-white p-2 text-slate-400 shadow-sm">
        <ImageIcon className="h-5 w-5" />
      </div>
    </div>
    <div className="mt-4 flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      ) : (
        <div className="px-4 text-center text-sm text-slate-400">{emptyLabel}</div>
      )}
    </div>
    <p className="mt-3 text-xs text-slate-500">{bucketLabel}</p>
  </div>
);

const SettingsPage = () => {
  const location = useLocation();
  const { userProfile, hasPermission } = useAuth();
  const { setLanguage } = useLanguageContext();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tabs = getTabItems(isFrench);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [settings, setSettings] = useState(defaultSystemSettings);
  const [assetUploads, setAssetUploads] = useState({
    logo: false,
    stamp: false,
  });
  const brandingContext = useMemo(() => getBrandingContext(), []);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  const [businessForm, setBusinessForm] = useState({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
    companyWebsite: '',
    logoUrl: '',
    stampUrl: '',
    timezone: 'Africa/Casablanca',
    language: 'en',
    currency: 'MAD',
  });

  const [operationsForm, setOperationsForm] = useState({
    operatingStart: '08:00',
    operatingEnd: '18:00',
    operatingDays: [],
    defaultRentalDuration: 4,
    minRentalDuration: 1,
    maxRentalDuration: 24,
    maintenanceMode: false,
    onlineBooking: true,
    realTimeTracking: true,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    rentalDetailsDefaultView: 'standard',
  });

  const [notificationsForm, setNotificationsForm] = useState({
    bookingReminderHours: 24,
    returnReminderHours: 2,
    rentalGracePeriodMinutes: 60,
    rentalSoftLockMinutes: 45,
    extraHourThresholdMinutes: 25,
    whatsappEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    notifyOnOverdue: true,
    notifyOnMaintenance: true,
  });

  const [securityForm, setSecurityForm] = useState({
    requireTwoFactorForAdmins: false,
    sessionTimeoutMinutes: 60,
    allowEmployeePackageEdits: false,
    allowEmployeeSettingsView: true,
    writeAuditLogs: true,
    allowLiveTrackingRetry: true,
    autoSendContractEmailAfterCreation: false,
  });
  const [messagingForm, setMessagingForm] = useState({
    messagingPhotoSharingEnabled: true,
    messagingMaxPhotosPerMessage: 3,
    messagingPhotoRetentionDays: 7,
    messagingDraftRetentionHours: 24,
    messagingAllowCameraCapture: true,
  });

  const canEdit = hasPermission('System Settings');
  const brandingBucket = settings.storageBucket || defaultSystemSettings.storageBucket || 'rental-documents';

  const overviewCards = useMemo(
    () => [
      {
        label: 'Primary Currency',
        value: businessForm.currency || 'MAD',
        hint: 'Used across rentals, tours, and finance.',
      },
      {
        label: 'Operating Window',
        value: `${operationsForm.operatingStart} - ${operationsForm.operatingEnd}`,
        hint: `${operationsForm.operatingDays.length || 0} open day(s) configured`,
      },
      {
        label: 'Tracking & Booking',
        value: `${operationsForm.onlineBooking ? 'Online booking on' : 'Online booking off'}`,
        hint: operationsForm.realTimeTracking ? 'Live tour tracking enabled' : 'Live tour tracking disabled',
      },
      {
        label: 'Transport Fees',
        value: `${settings.pickupTransportFee || 0} / ${settings.dropoffTransportFee || 0} MAD`,
        hint: 'Pickup and drop-off defaults saved in system settings.',
      },
      {
        label: 'Messaging Policy',
        value: settings.messagingPhotoSharingEnabled ? 'Photo sharing on' : 'Photo sharing off',
        hint: `${settings.messagingPhotoRetentionDays || 7} day media retention, ${settings.messagingMaxPhotosPerMessage || 3} photo max`,
      },
    ],
    [businessForm.currency, operationsForm, settings.pickupTransportFee, settings.dropoffTransportFee, settings.messagingPhotoSharingEnabled, settings.messagingPhotoRetentionDays, settings.messagingMaxPhotosPerMessage]
  );

  const loadSettingsHub = async () => {
    setLoading(true);
    try {
      const mergedSettings = await fetchSystemSettings();

      setSettings(mergedSettings);
      setBusinessForm({
        companyName: mergedSettings.companyName || '',
        companyEmail: mergedSettings.companyEmail || '',
        companyPhone: mergedSettings.companyPhone || '',
        companyAddress: mergedSettings.companyAddress || '',
        companyWebsite: mergedSettings.companyWebsite || '',
        logoUrl: mergedSettings.logoUrl || '',
        stampUrl: mergedSettings.stampUrl || '',
        timezone: mergedSettings.timezone || 'Africa/Casablanca',
        language: mergedSettings.language || 'en',
        currency: mergedSettings.currency || 'MAD',
      });
      setOperationsForm({
        operatingStart: mergedSettings.operatingHours?.start || '08:00',
        operatingEnd: mergedSettings.operatingHours?.end || '18:00',
        operatingDays: Array.isArray(mergedSettings.operatingDays) ? mergedSettings.operatingDays : [],
        defaultRentalDuration: Number(mergedSettings.defaultRentalDuration) || 4,
        minRentalDuration: Number(mergedSettings.minRentalDuration) || 1,
        maxRentalDuration: Number(mergedSettings.maxRentalDuration) || 24,
        maintenanceMode: Boolean(mergedSettings.maintenanceMode),
        onlineBooking: mergedSettings.onlineBooking !== false,
        realTimeTracking: mergedSettings.realTimeTracking !== false,
        emailNotifications: mergedSettings.emailNotifications !== false,
        smsNotifications: Boolean(mergedSettings.smsNotifications),
        pushNotifications: mergedSettings.pushNotifications !== false,
        rentalDetailsDefaultView:
          String(mergedSettings.rentalDetailsDefaultView || '').toLowerCase() === 'light'
            ? 'light'
            : 'standard',
      });
      setNotificationsForm({
        bookingReminderHours: Number(mergedSettings.bookingReminderHours) || 24,
        returnReminderHours: Number(mergedSettings.returnReminderHours) || 2,
        rentalGracePeriodMinutes: Number(mergedSettings.rentalGracePeriodMinutes ?? mergedSettings.rental_grace_period_minutes) || 120,
        rentalSoftLockMinutes: Number(mergedSettings.rentalSoftLockMinutes ?? mergedSettings.rental_soft_lock_minutes) || 90,
        extraHourThresholdMinutes: Number(mergedSettings.extraHourThresholdMinutes ?? mergedSettings.extra_hour_threshold_minutes) || 25,
        whatsappEnabled: mergedSettings.whatsappEnabled !== false,
        emailNotifications: mergedSettings.emailNotifications !== false,
        smsNotifications: Boolean(mergedSettings.smsNotifications),
        pushNotifications: mergedSettings.pushNotifications !== false,
        notifyOnOverdue: mergedSettings.notifyOnOverdue !== false,
        notifyOnMaintenance: mergedSettings.notifyOnMaintenance !== false,
      });
      setSecurityForm({
        requireTwoFactorForAdmins: Boolean(mergedSettings.requireTwoFactorForAdmins),
        sessionTimeoutMinutes: Number(mergedSettings.sessionTimeoutMinutes) || 60,
        allowEmployeePackageEdits: Boolean(mergedSettings.allowEmployeePackageEdits),
        allowEmployeeSettingsView: mergedSettings.allowEmployeeSettingsView !== false,
        writeAuditLogs: mergedSettings.writeAuditLogs !== false,
        allowLiveTrackingRetry: mergedSettings.allowLiveTrackingRetry !== false,
        autoSendContractEmailAfterCreation: Boolean(mergedSettings.autoSendContractEmailAfterCreation),
      });
      setMessagingForm({
        messagingPhotoSharingEnabled: Boolean(mergedSettings.messagingPhotoSharingEnabled),
        messagingMaxPhotosPerMessage: Math.max(1, Number(mergedSettings.messagingMaxPhotosPerMessage) || 3),
        messagingPhotoRetentionDays: Math.max(1, Number(mergedSettings.messagingPhotoRetentionDays) || 7),
        messagingDraftRetentionHours: Math.max(1, Number(mergedSettings.messagingDraftRetentionHours) || 24),
        messagingAllowCameraCapture: mergedSettings.messagingAllowCameraCapture !== false,
      });
    } catch (error) {
      console.error('Failed to load settings hub:', error);
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsHub();
  }, []);

  const persistSettings = async (sectionName, patch, afterSave) => {
    if (!canEdit) {
      toast.error('Only owner and admin users can change system settings');
      return;
    }

    setSavingSection(sectionName);
    try {
      const nextSettings = {
        ...settings,
        ...patch,
      };
      const saved = await saveSystemSettings(nextSettings);
      const merged = { ...defaultSystemSettings, ...saved };
      setSettings(merged);
      if (afterSave) {
        await afterSave();
      }
      toast.success(`${sectionName} saved`);
    } catch (error) {
      console.error(`Failed to save ${sectionName}:`, error);
      toast.error(`Failed to save ${sectionName.toLowerCase()}`);
    } finally {
      setSavingSection(null);
    }
  };

  const uploadBrandAsset = async (assetType, file) => {
    if (!file) return;
    if (!canEdit) {
      toast.error(isFrench ? 'Acces refuse' : 'Access denied');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(isFrench ? 'Veuillez choisir une image valide' : 'Please choose a valid image');
      return;
    }

    const extension = (file.name.split('.').pop() || 'png').toLowerCase();
    const storagePath = `branding/${assetType}-${Date.now()}.${extension}`;

    setAssetUploads((current) => ({ ...current, [assetType]: true }));
    try {
      const { error: uploadError } = await supabase.storage
        .from(brandingBucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(brandingBucket).getPublicUrl(storagePath);
      const publicUrl = data?.publicUrl || '';
      if (!publicUrl) {
        throw new Error(isFrench ? "Impossible d'obtenir l'URL publique" : 'Unable to get public URL');
      }

      setBusinessForm((current) => ({
        ...current,
        [assetType === 'logo' ? 'logoUrl' : 'stampUrl']: publicUrl,
      }));

      const savedSettings = await saveSystemSettings({
        [assetType === 'logo' ? 'logoUrl' : 'stampUrl']: publicUrl,
      });

      setSettings({ ...defaultSystemSettings, ...savedSettings });
      setBusinessForm((current) => ({
        ...current,
        logoUrl: savedSettings.logoUrl || current.logoUrl,
        stampUrl: savedSettings.stampUrl || current.stampUrl,
      }));

      toast.success(
        assetType === 'logo'
          ? (isFrench ? 'Logo importe' : 'Logo imported')
          : (isFrench ? 'Cachet importe' : 'Stamp imported')
      );
    } catch (error) {
      console.error(`Failed to upload ${assetType}:`, error);
      toast.error(error.message || (isFrench ? 'Import impossible' : 'Upload failed'));
    } finally {
      setAssetUploads((current) => ({ ...current, [assetType]: false }));
    }
  };

  const handleBusinessSave = async () => {
    await persistSettings('Business profile', {
      ...businessForm,
    }, async () => {
      setLanguage(businessForm.language || 'en');
    });
  };

  const effectiveLogoUrl = businessForm.logoUrl || (brandingContext.isSaharaXTenant ? SAHARAX_DEFAULT_LOGO_URL : '');
  const effectiveStampUrl = businessForm.stampUrl || (brandingContext.isSaharaXTenant ? SAHARAX_DEFAULT_STAMP_URL : '');

  const handleOperationsSave = async () => {
    await persistSettings('Operations', {
      defaultRentalDuration: Number(operationsForm.defaultRentalDuration) || 0,
      minRentalDuration: Number(operationsForm.minRentalDuration) || 0,
      maxRentalDuration: Number(operationsForm.maxRentalDuration) || 0,
      maintenanceMode: operationsForm.maintenanceMode,
      onlineBooking: operationsForm.onlineBooking,
      realTimeTracking: operationsForm.realTimeTracking,
      emailNotifications: operationsForm.emailNotifications,
      smsNotifications: operationsForm.smsNotifications,
      pushNotifications: operationsForm.pushNotifications,
      rentalDetailsDefaultView:
        String(operationsForm.rentalDetailsDefaultView || '').toLowerCase() === 'light'
          ? 'light'
          : 'standard',
      operatingHours: {
        start: operationsForm.operatingStart,
        end: operationsForm.operatingEnd,
      },
      operatingDays: operationsForm.operatingDays,
    });
  };

  const handleFinanceSave = async () => {
    await persistSettings('Finance & tax', {
      tax_enabled: Boolean(settings.tax_enabled),
      tax_percentage: Number(settings.tax_percentage) || 0,
      apply_to_rentals: Boolean(settings.apply_to_rentals),
      apply_to_tours: Boolean(settings.apply_to_tours),
      invoicePrefix: settings.invoicePrefix || 'INV',
    });
  };

  const handleOperatingDayToggle = (day) => {
    setOperationsForm((current) => ({
      ...current,
      operatingDays: current.operatingDays.includes(day)
        ? current.operatingDays.filter((item) => item !== day)
        : [...current.operatingDays, day],
    }));
  };

  const handleNotificationsSave = async () => {
    const normalizedGraceMinutes = Math.max(0, Math.min(120, Number(notificationsForm.rentalGracePeriodMinutes) || 0));
    const normalizedSoftLockMinutes = Math.max(0, Math.min(normalizedGraceMinutes || 120, Number(notificationsForm.rentalSoftLockMinutes) || 0));

    await persistSettings('Notifications', {
      bookingReminderHours: Number(notificationsForm.bookingReminderHours) || 0,
      returnReminderHours: Number(notificationsForm.returnReminderHours) || 0,
      rentalGracePeriodMinutes: normalizedGraceMinutes,
      rentalSoftLockMinutes: normalizedSoftLockMinutes,
      rental_grace_period_minutes: normalizedGraceMinutes,
      rental_soft_lock_minutes: normalizedSoftLockMinutes,
      whatsappEnabled: notificationsForm.whatsappEnabled,
      emailNotifications: notificationsForm.emailNotifications,
      smsNotifications: notificationsForm.smsNotifications,
      pushNotifications: notificationsForm.pushNotifications,
      notifyOnOverdue: notificationsForm.notifyOnOverdue,
      notifyOnMaintenance: notificationsForm.notifyOnMaintenance,
    });
  };

  const handleRentalRulesSave = async () => {
    const normalizedGraceMinutes = Math.max(0, Math.min(120, Number(notificationsForm.rentalGracePeriodMinutes) || 0));
    const normalizedSoftLockMinutes = Math.max(0, Math.min(normalizedGraceMinutes || 120, Number(notificationsForm.rentalSoftLockMinutes) || 0));
    const normalizedExtraHourMinutes = Math.max(0, Math.min(120, Number(notificationsForm.extraHourThresholdMinutes) || 0));

    await persistSettings('Rental rules', {
      rentalGracePeriodMinutes: normalizedGraceMinutes,
      rentalSoftLockMinutes: normalizedSoftLockMinutes,
      extraHourThresholdMinutes: normalizedExtraHourMinutes,
      rental_grace_period_minutes: normalizedGraceMinutes,
      rental_soft_lock_minutes: normalizedSoftLockMinutes,
      extra_hour_threshold_minutes: normalizedExtraHourMinutes,
    });
  };

  const handleSecuritySave = async () => {
    await persistSettings('Security & access', {
      requireTwoFactorForAdmins: securityForm.requireTwoFactorForAdmins,
      sessionTimeoutMinutes: Number(securityForm.sessionTimeoutMinutes) || 60,
      allowEmployeePackageEdits: securityForm.allowEmployeePackageEdits,
      allowEmployeeSettingsView: securityForm.allowEmployeeSettingsView,
      writeAuditLogs: securityForm.writeAuditLogs,
      allowLiveTrackingRetry: securityForm.allowLiveTrackingRetry,
      autoSendContractEmailAfterCreation: securityForm.autoSendContractEmailAfterCreation,
    });
  };

  const handleMessagingSave = async () => {
    await persistSettings('Messaging', {
      messagingPhotoSharingEnabled: Boolean(messagingForm.messagingPhotoSharingEnabled),
      messagingMaxPhotosPerMessage: Math.max(1, Math.min(10, Number(messagingForm.messagingMaxPhotosPerMessage) || 3)),
      messagingPhotoRetentionDays: Math.max(1, Math.min(30, Number(messagingForm.messagingPhotoRetentionDays) || 7)),
      messagingDraftRetentionHours: Math.max(1, Math.min(168, Number(messagingForm.messagingDraftRetentionHours) || 24)),
      messagingAllowCameraCapture: Boolean(messagingForm.messagingAllowCameraCapture),
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <SectionCard
        title={isFrench ? 'Centre des paramètres système' : 'System Settings Hub'}
        description={isFrench ? 'Une seule source de vérité pour l’entreprise, les opérations, la finance, les notifications et les accès.' : 'One source of truth for business, operations, finance, notifications, and access.'}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={isFrench ? 'Ce qui est déjà connecté' : 'What Is Wired Now'} description={isFrench ? 'Ces zones sont déjà reliées à de vrais services de paramètres.' : 'These areas are already connected to real settings services.'}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Profil entreprise' : 'Business Profile'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "L'identité de l'entreprise, les coordonnées, le fuseau horaire, la langue et la devise sont enregistrés via le service principal de paramètres." : 'Company identity, contact details, timezone, language, and currency are saved through the main settings service.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Opérations' : 'Operations'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? 'Les valeurs par défaut des locations, les indicateurs de suivi, les jours ouvrés et le comportement du transport sont reliés aux services en direct.' : 'Rental defaults, tracking flags, operating days, and transport behavior are wired to live services.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Finance et notifications' : 'Finance & Notifications'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Les paramètres financiers, les règles fiscales et les rappels opérationnels sont maintenant enregistrés via le même flux de paramètres stable relié à l'API." : 'Finance defaults, tax rules, and operational reminders now save through the same stable API-backed settings flow.'}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderBusiness = () => (
    <SectionCard
      title={isFrench ? 'Profil entreprise' : 'Business Profile'}
      description={isFrench ? "Identité centrale de l'entreprise utilisée dans les pages admin, les documents imprimés et les communications côté client." : 'Central company identity used across admin pages, printed documents, and customer-facing communications.'}
      action={
        <button
          type="button"
          onClick={handleBusinessSave}
          disabled={!canEdit || savingSection === 'Business profile'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Business profile' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer le profil entreprise' : 'Save Business Profile'}
        </button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Nom de l’entreprise' : 'Company Name'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyName}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyName: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "E-mail de l'entreprise" : 'Company Email'}</label>
          <input
            type="email"
            className={FIELD_CLASS}
            value={businessForm.companyEmail}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyEmail: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "Téléphone de l'entreprise" : 'Company Phone'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyPhone}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyPhone: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Site web' : 'Website'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyWebsite}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyWebsite: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'URL du logo' : 'Logo URL'}</label>
          <input
            className={FIELD_CLASS}
            placeholder={isFrench ? 'https://.../logo.png' : 'https://.../logo.png'}
            value={businessForm.logoUrl}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, logoUrl: e.target.value }))}
          />
          <p className="mt-2 text-xs text-slate-500">
            {isFrench ? 'Utilise partout dans le tenant, y compris les partages, documents et pages publiques.' : 'Used across the tenant, including shares, documents, and public pages.'}
          </p>
          <div className="mt-3">
            <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer`}>
              {assetUploads.logo ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isFrench ? 'Importer le logo' : 'Import Logo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canEdit || assetUploads.logo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadBrandAsset('logo', file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'URL du cachet' : 'Stamp URL'}</label>
          <input
            className={FIELD_CLASS}
            placeholder={isFrench ? 'https://.../stamp.png' : 'https://.../stamp.png'}
            value={businessForm.stampUrl}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, stampUrl: e.target.value }))}
          />
          <div className="mt-3">
            <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer`}>
              {assetUploads.stamp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isFrench ? 'Importer le cachet' : 'Import Stamp'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canEdit || assetUploads.stamp}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadBrandAsset('stamp', file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div className="md:col-span-2 grid gap-5 md:grid-cols-2">
          <AssetPreview
            label={isFrench ? 'Apercu du logo' : 'Logo Preview'}
            url={effectiveLogoUrl}
            emptyLabel={isFrench ? 'Aucun logo importe pour le moment.' : 'No logo imported yet.'}
            bucketLabel={
              businessForm.logoUrl
                ? (isFrench
                    ? `Stocke dans le bucket ${brandingBucket} et reutilise partout dans le tenant.`
                    : `Stored in the ${brandingBucket} bucket and reused across the tenant.`)
                : brandingContext.isSaharaXTenant
                  ? (isFrench
                      ? 'Apercu de l’actif SaharaX herite. Enregistrez ou importez pour le stocker pour ce tenant.'
                      : 'Previewing the inherited SaharaX asset. Save or import it to store it for this tenant.')
                  : (isFrench
                      ? `Ce tenant doit importer son propre logo dans le bucket ${brandingBucket}.`
                      : `This tenant should import its own logo into the ${brandingBucket} bucket.`)
            }
          />
          <AssetPreview
            label={isFrench ? 'Apercu du cachet' : 'Stamp Preview'}
            url={effectiveStampUrl}
            emptyLabel={isFrench ? 'Aucun cachet importe pour le moment.' : 'No stamp imported yet.'}
            bucketLabel={
              businessForm.stampUrl
                ? (isFrench
                    ? `Stocke dans le bucket ${brandingBucket} et reutilise pour les documents et impressions.`
                    : `Stored in the ${brandingBucket} bucket and reused for documents and print flows.`)
                : brandingContext.isSaharaXTenant
                  ? (isFrench
                      ? 'Apercu du cachet SaharaX herite. Enregistrez ou importez pour le stocker pour ce tenant.'
                      : 'Previewing the inherited SaharaX stamp. Save or import it to store it for this tenant.')
                  : (isFrench
                      ? `Ce tenant doit importer son propre cachet dans le bucket ${brandingBucket}.`
                      : `This tenant should import its own stamp into the ${brandingBucket} bucket.`)
            }
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Adresse' : 'Address'}</label>
          <textarea
            rows={3}
            className={FIELD_CLASS}
            value={businessForm.companyAddress}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyAddress: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Fuseau horaire' : 'Timezone'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.timezone}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, timezone: e.target.value }))}
          >
            <option value="Africa/Casablanca">Africa/Casablanca</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Langue par défaut' : 'Default Language'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.language}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, language: e.target.value }))}
          >
            <option value="en">{isFrench ? 'Anglais' : 'English'}</option>
            <option value="fr">{isFrench ? 'Français' : 'French'}</option>
            <option value="ar">{isFrench ? 'Arabe' : 'Arabic'}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Devise' : 'Currency'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.currency}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, currency: e.target.value }))}
          >
            <option value="MAD">MAD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
    </SectionCard>
  );

  const renderOperations = () => (
    <SectionCard
      title={isFrench ? 'Opérations' : 'Operations'}
      description={isFrench ? 'Règles opérationnelles pour les réservations, fenêtres de location, notifications et comportement du suivi en direct.' : 'Operational rules for bookings, rental windows, notifications, and live tracking behavior.'}
      action={
        <button
          type="button"
          onClick={handleOperationsSave}
          disabled={!canEdit || savingSection === 'Operations'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Operations' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les opérations' : 'Save Operations'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "Heure d'ouverture" : 'Opening Time'}</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingStart}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingStart: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Heure de fermeture' : 'Closing Time'}</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingEnd}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingEnd: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée de location par défaut' : 'Default Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.defaultRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, defaultRentalDuration: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée minimale de location' : 'Minimum Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.minRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, minRentalDuration: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée maximale de location' : 'Maximum Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.maxRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, maxRentalDuration: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Mode par défaut des détails de location' : 'Default Rental Details Mode'}</label>
              <select
                className={FIELD_CLASS}
                value={operationsForm.rentalDetailsDefaultView}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, rentalDetailsDefaultView: e.target.value }))}
              >
                <option value="standard">{isFrench ? 'Standard' : 'Standard'}</option>
                <option value="light">{isFrench ? 'Light' : 'Light'}</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {isFrench
                  ? 'Définit la vue qui s’ouvre par défaut pour l’équipe dans les détails de location. La vue avancée reste toujours disponible dans la page.'
                  : 'Sets which rental-details view opens by default for staff. The advanced view stays available inside the page at all times.'}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">{isFrench ? "Jours d'ouverture" : 'Operating Days'}</p>
            <div className="flex flex-wrap gap-2">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                const active = operationsForm.operatingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleOperatingDayToggle(day)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-medium capitalize transition ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Mode maintenance' : 'Maintenance Mode'}
            description={isFrench ? 'À utiliser lorsque le système doit être en lecture seule pour les changements opérationnels.' : 'Use this when the system should be read-only for operational changes.'}
            checked={operationsForm.maintenanceMode}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, maintenanceMode: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Réservation en ligne' : 'Online Booking'}
            description={isFrench ? "Contrôle si les flux de réservation en ligne restent disponibles pour l'équipe." : 'Controls whether online booking flows stay available to the team.'}
            checked={operationsForm.onlineBooking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, onlineBooking: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Suivi en temps réel' : 'Real-Time Tracking'}
            description={isFrench ? 'Indicateur par défaut pour la carte en direct et le suivi des tours.' : 'Default flag for the live map and tour tracking workflow.'}
            checked={operationsForm.realTimeTracking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, realTimeTracking: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications e-mail' : 'Email Notifications'}
            description={isFrench ? "Active les notifications opérationnelles par e-mail dans les flux de réservation et d'administration." : 'Enable operational email notifications across booking and admin flows.'}
            checked={operationsForm.emailNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, emailNotifications: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications SMS' : 'SMS Notifications'}
            description={isFrench ? "Active les rappels SMS pour les clients et les flux de l'équipe." : 'Enable SMS reminders for customers and staff workflows.'}
            checked={operationsForm.smsNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, smsNotifications: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications push' : 'Push Notifications'}
            description={isFrench ? 'Contrôle les notifications push pour les expériences utilisateur prises en charge.' : 'Controls push-style notifications for supported user experiences.'}
            checked={operationsForm.pushNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, pushNotifications: value }))}
          />
        </div>
      </div>
    </SectionCard>
  );

  const renderFinance = () => (
    <SectionCard
      title={isFrench ? 'Finance et taxes' : 'Finance & Tax'}
      description={isFrench ? 'Comportement fiscal et paramètres financiers utilisés par les reçus, factures, locations et tours.' : 'Tax behavior and finance defaults used by receipts, invoices, rentals, and tours.'}
      action={
        <button
          type="button"
          onClick={handleFinanceSave}
          disabled={!canEdit || savingSection === 'Finance & tax'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer finance et taxes' : 'Save Finance & Tax'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Pourcentage de taxe' : 'Tax Percentage'}</label>
            <input
              type="number"
              min="0"
              max="100"
              className={FIELD_CLASS}
              value={settings.tax_percentage}
              disabled={!canEdit}
              onChange={(e) => setSettings((current) => ({ ...current, tax_percentage: Number(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Préfixe de facture' : 'Invoice Prefix'}</label>
            <input
              className={FIELD_CLASS}
              value={settings.invoicePrefix || 'INV'}
              disabled={!canEdit}
              onChange={(e) => setSettings((current) => ({ ...current, invoicePrefix: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleCard
              title={isFrench ? 'Appliquer la taxe aux locations' : 'Apply Tax To Rentals'}
              description={isFrench ? 'Inclure la taxe sur les reçus de location et les calculs financiers.' : 'Include tax on rental receipts and finance calculations.'}
              checked={Boolean(settings.apply_to_rentals)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_rentals: value }))}
            />
            <ToggleCard
              title={isFrench ? 'Appliquer la taxe aux tours' : 'Apply Tax To Tours'}
              description={isFrench ? 'Inclure la taxe sur les réservations de tours et les rapports financiers des tours.' : 'Include tax on tour bookings and tour finance reporting.'}
              checked={Boolean(settings.apply_to_tours)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_tours: value }))}
            />
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Activer la taxe' : 'Enable Tax'}
            description={isFrench ? 'Contrôle principal de la visibilité des taxes et des calculs automatiques.' : 'Master control for tax visibility and automatic tax calculations.'}
            checked={Boolean(settings.tax_enabled)}
            disabled={!canEdit}
            onChange={(value) => setSettings((current) => ({ ...current, tax_enabled: value }))}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Paramètres financiers par défaut' : 'Finance Defaults'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Cette section est maintenant enregistrée dans le même document partagé de paramètres système, elle ne dépend donc plus de la table SQL manquante `tax_settings`." : 'This section is now stored with the same shared system settings document, so it no longer depends on the missing `tax_settings` SQL table.'}
            </p>
            <button
              type="button"
              onClick={handleFinanceSave}
              disabled={!canEdit || savingSection === 'Finance & tax'}
              className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}
            >
              {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isFrench ? 'Enregistrer finance et taxes' : 'Save Finance & Tax'}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderRentalRules = () => (
    <SectionCard
      title={isFrench ? 'Règles de location' : 'Rental Rules'}
      description={
        isFrench
          ? 'Configurez la période de grâce, l’alerte de retard et la logique de libération automatique pour les réservations planifiées.'
          : 'Configure the grace window, late warning, and auto-release behavior for scheduled rentals.'
      }
      action={
        <button
          type="button"
          onClick={handleRentalRulesSave}
          disabled={!canEdit || savingSection === 'Rental rules'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Rental rules' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les règles de location' : 'Save Rental Rules'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? 'Période de grâce réservation (minutes)' : 'Booking Grace Period (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.rentalGracePeriodMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, rentalGracePeriodMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? 'Maximum 120 minutes. Cette règle s’applique aux locations journalières et horaires planifiées.'
                : 'Maximum 120 minutes. This rule applies to both scheduled daily and hourly rentals.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? 'Alerte retard réservation (minutes)' : 'Late Booking Warning (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.rentalSoftLockMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, rentalSoftLockMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? 'Définit quand la réservation doit commencer à être signalée comme en retard avant la libération automatique.'
                : 'Defines when the booking should start being flagged as late before auto-release.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? "Seuil d’heure supplémentaire (minutes)" : 'Extra Hour Threshold (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.extraHourThresholdMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, extraHourThresholdMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? "Après ce délai, l’heure suivante est facturée."
                : 'After this time, the next hour is charged.'}
            </p>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
          <p className="text-sm font-semibold text-slate-900">
            {isFrench ? 'Comment cela fonctionne' : 'How It Works'}
          </p>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <p>
              {isFrench
                ? 'Les réservations planifiées restent bloquées pendant la période de grâce après l’heure prévue de départ.'
                : 'Scheduled rentals stay blocked during the grace window after the planned start time.'}
            </p>
            <p>
              {isFrench
                ? 'Une fois la période dépassée, la réservation peut expirer automatiquement et le véhicule redevient disponible.'
                : 'Once that window passes, the booking can auto-expire and the vehicle becomes available again.'}
            </p>
            <p>
              {isFrench
                ? 'Il n’existe pas de seconde période distincte pour les locations horaires aujourd’hui: cette même règle est la source de vérité.'
                : 'There is no second separate hourly grace today: this same rule is the source of truth.'}
            </p>
            <p>
              {isFrench
                ? "Le seuil d’annulation d’extension prépare la prochaine règle: si le client revient très tôt dans l’heure ajoutée, cette extension pourra être annulée automatiquement."
                : 'The extension void threshold prepares the next rule: if the customer comes back very early in the added hour, that extension can be voided automatically.'}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderNotifications = () => (
    <SectionCard
      title={isFrench ? 'Notifications' : 'Notifications'}
      description={isFrench ? "Paramètres de communication opérationnelle pour les rappels, alertes, WhatsApp et le suivi de l'équipe." : 'Operational communication defaults for reminders, alerts, WhatsApp, and staff follow-up.'}
      action={
        <button
          type="button"
          onClick={handleNotificationsSave}
          disabled={!canEdit || savingSection === 'Notifications'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Notifications' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les notifications' : 'Save Notifications'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Rappel de réservation (heures avant)' : 'Booking Reminder (hours before)'}</label>
            <input
              type="number"
              min="0"
              className={FIELD_CLASS}
              value={notificationsForm.bookingReminderHours}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, bookingReminderHours: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Rappel de retour (heures avant)' : 'Return Reminder (hours before)'}</label>
            <input
              type="number"
              min="0"
              className={FIELD_CLASS}
              value={notificationsForm.returnReminderHours}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, returnReminderHours: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Canaux de diffusion' : 'Delivery Channels'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Définissez les canaux par défaut que l'équipe opérationnelle utilisera pour les rappels et alertes." : 'Set the default channels the operations team expects to use for reminders and alerts.'}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Flux de contact WhatsApp' : 'WhatsApp Contact Flow'}
            description={isFrench ? 'Fait de WhatsApp le canal de communication préféré dans les flux admin.' : 'Makes WhatsApp the preferred communication channel in admin workflows.'}
            checked={notificationsForm.whatsappEnabled}
            disabled={!canEdit}
            onChange={(value) => setNotificationsForm((current) => ({ ...current, whatsappEnabled: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Alertes de retard' : 'Overdue Alerts'}
            description={isFrench ? "Notifier l'équipe lorsqu'une location ou un tour dépasse son heure de retour prévue." : 'Notify the team when a rental or tour passes its planned return time.'}
            checked={notificationsForm.notifyOnOverdue}
            disabled={!canEdit}
            onChange={(value) => setNotificationsForm((current) => ({ ...current, notifyOnOverdue: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Alertes maintenance' : 'Maintenance Alerts'}
            description={isFrench ? "Notifier l'équipe lorsque les seuils d'inspection ou de maintenance sont atteints." : 'Notify staff when inspection or maintenance thresholds are triggered.'}
            checked={notificationsForm.notifyOnMaintenance}
            disabled={!canEdit}
            onChange={(value) => setNotificationsForm((current) => ({ ...current, notifyOnMaintenance: value }))}
          />
        </div>
      </div>
    </SectionCard>
  );

  const renderSecurity = () => (
    <SectionCard
      title={isFrench ? 'Sécurité et accès' : 'Security & Access'}
      description={isFrench ? "Politiques d'accès administrateur, durée des sessions, audit et protections des flux sensibles." : 'Administrative access policies, session timing, audit behavior, and sensitive workflow protections.'}
      action={
        <button
          type="button"
          onClick={handleSecuritySave}
          disabled={!canEdit || savingSection === 'Security & access'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Security & access' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer la sécurité' : 'Save Security'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Expiration de session (minutes)' : 'Session Timeout (minutes)'}</label>
          <input
            type="number"
            min="5"
            className={FIELD_CLASS}
            value={securityForm.sessionTimeoutMinutes}
            disabled={!canEdit}
            onChange={(e) => setSecurityForm((current) => ({ ...current, sessionTimeoutMinutes: e.target.value }))}
          />
          <div className="mt-4 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? "Notes sur la politique d'accès" : 'Access Policy Notes'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Ces contrôles définissent la politique administrative par défaut. Le reste de l'application peut les adopter progressivement comme source de vérité centrale." : 'These controls establish the administrative default policy. The rest of the app can gradually adopt them as the central source of truth.'}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Exiger la 2FA pour les admins' : 'Require 2FA For Admins'}
            description={isFrench ? 'Politique cible pour les connexions owner/admin et les changements sensibles.' : 'Target policy for owner/admin logins and sensitive settings changes.'}
            checked={securityForm.requireTwoFactorForAdmins}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, requireTwoFactorForAdmins: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la modification des packages par les employés' : 'Allow Employee Package Edits'}
            description={isFrench ? 'Si désactivé, les employés restent en lecture seule pour la gestion des packages et les changements liés aux paramètres.' : 'If disabled, employees stay read-only for package management and settings-adjacent package changes.'}
            checked={securityForm.allowEmployeePackageEdits}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeePackageEdits: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la consultation des paramètres par les employés' : 'Allow Employee Settings View'}
            description={isFrench ? 'Permet aux employés d’ouvrir les paramètres système en lecture seule pour référence opérationnelle.' : 'Lets employees open system settings in read-only mode for operational reference.'}
            checked={securityForm.allowEmployeeSettingsView}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeeSettingsView: value }))}
          />
          <ToggleCard
            title={isFrench ? "Écrire les journaux d'audit" : 'Write Audit Logs'}
            description={isFrench ? "Conserver les changements admin et les modifications sensibles dans la piste d'audit." : 'Keep admin changes and sensitive workflow changes attached to the audit trail.'}
            checked={securityForm.writeAuditLogs}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, writeAuditLogs: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la relance du suivi en direct' : 'Allow Live Tracking Retry'}
            description={isFrench ? "Contrôle si les guides peuvent redemander l'autorisation de localisation après l'avoir refusée une fois." : 'Controls whether guides can re-trigger location permission after dismissing it once.'}
            checked={securityForm.allowLiveTrackingRetry}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowLiveTrackingRetry: value }))}
          />
          <ToggleCard
            title={isFrench ? "Auto-envoyer le contrat par e-mail après création" : 'Auto-send contract email after creation'}
            description={isFrench ? "Désactivé par défaut. Si activé, l'e-mail du contrat part dès que la signature du contrat est finalisée. L'envoi manuel reste toujours disponible." : 'Off by default. If enabled, the contract email sends as soon as contract signing is completed. Manual send always stays available.'}
            checked={securityForm.autoSendContractEmailAfterCreation}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, autoSendContractEmailAfterCreation: value }))}
          />
        </div>
      </div>
    </SectionCard>
  );

  const renderMessaging = () => (
    <SectionCard
      title={isFrench ? 'Messagerie' : 'Messaging'}
      description={isFrench ? "Règles système pour la messagerie rapide entre staff, admins, owners et clients. Définissez ici les garde-fous avant d'activer le partage photo." : 'System rules for fast messaging between staff, admins, owners, and customers. Define the guardrails here before enabling photo sharing.'}
      action={
        <button
          type="button"
          onClick={handleMessagingSave}
          disabled={!canEdit || savingSection === 'Messaging'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Messaging' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer la messagerie' : 'Save Messaging'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Photos max par message' : 'Max Photos Per Message'}</label>
              <input
                type="number"
                min="1"
                max="10"
                className={FIELD_CLASS}
                value={messagingForm.messagingMaxPhotosPerMessage}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingMaxPhotosPerMessage: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Conservation photo (jours)' : 'Photo Retention (days)'}</label>
              <input
                type="number"
                min="1"
                max="30"
                className={FIELD_CLASS}
                value={messagingForm.messagingPhotoRetentionDays}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingPhotoRetentionDays: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Expiration des brouillons (heures)' : 'Draft Expiry (hours)'}</label>
              <input
                type="number"
                min="1"
                max="168"
                className={FIELD_CLASS}
                value={messagingForm.messagingDraftRetentionHours}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingDraftRetentionHours: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Politique recommandée' : 'Recommended Policy'}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>{isFrench ? 'Utilisez les photos seulement pour partager rapidement une information opérationnelle.' : 'Use photos only for quick operational information sharing.'}</p>
              <p>{isFrench ? 'Conservez les textes plus longtemps, mais laissez les médias expirer rapidement pour limiter le coût de stockage.' : 'Keep text longer, but let media expire quickly to keep storage costs low.'}</p>
              <p>{isFrench ? 'Commencez avec 1 à 3 photos max par message pour rester simple et léger.' : 'Start with 1 to 3 photos max per message to keep the experience simple and light.'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Activer le partage photo' : 'Enable Photo Sharing'}
            description={isFrench ? "Permet aux utilisateurs d'envoyer des photos depuis l'album ou la caméra dans les threads pris en charge." : 'Lets users send photos from album or camera in supported threads.'}
            checked={messagingForm.messagingPhotoSharingEnabled}
            disabled={!canEdit}
            onChange={(value) => setMessagingForm((current) => ({ ...current, messagingPhotoSharingEnabled: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la caméra' : 'Allow Camera Capture'}
            description={isFrench ? "Laisse l'utilisateur prendre une photo directement depuis le chat, en plus de l'album." : 'Lets the user take a photo directly from chat in addition to choosing from the album.'}
            checked={messagingForm.messagingAllowCameraCapture}
            disabled={!canEdit}
            onChange={(value) => setMessagingForm((current) => ({ ...current, messagingAllowCameraCapture: value }))}
          />
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Ce que ce réglage couvre maintenant' : 'What This Covers Right Now'}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <p>{isFrench ? 'Activation et limites du futur partage photo dans Messenger.' : 'Enablement and limits for upcoming photo sharing inside Messenger.'}</p>
              <p>{isFrench ? 'Fenêtre de suppression automatique des médias de chat.' : 'Auto-delete window for chat media.'}</p>
              <p>{isFrench ? 'Durée de vie des brouillons avant nettoyage.' : 'Draft lifetime before cleanup.'}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'business':
        return renderBusiness();
      case 'operations':
        return renderOperations();
      case 'rentalRules':
        return renderRentalRules();
      case 'finance':
        return renderFinance();
      case 'notifications':
        return renderNotifications();
      case 'messaging':
        return renderMessaging();
      case 'security':
        return renderSecurity();
      case 'overview':
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Settings2 className="h-8 w-8 text-white" />}
        eyebrow={null}
        title={isFrench ? 'Paramètres système' : 'System Settings'}
        description={isFrench ? "Pilotez tout le système admin depuis un seul endroit." : 'Control the whole admin system from one place.'}
        className="w-full"
        actions={
          <button
            type="button"
            onClick={loadSettingsHub}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {isFrench ? 'Actualiser les paramètres' : 'Refresh Settings'}
          </button>
        }
      />

      <div className="space-y-6 p-4 lg:p-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-3">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6">
          {loading && !suppressBlockingLoader ? (
            <AdminWorkspaceLoadingShell eyebrow={isFrench ? 'Paramètres système' : 'System Settings'} title={isFrench ? 'Paramètres système' : 'System Settings'} description={isFrench ? 'Préparation de l’espace paramètres système...' : 'Preparing the system settings workspace...'} cardRows={1} />
          ) : (
            renderContent()
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default SettingsPage;
