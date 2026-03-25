import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Briefcase,
  KeyRound,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Store,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { defaultSystemSettings, fetchSystemSettings, saveSystemSettings } from '../../services/systemSettingsApi';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

const TAB_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Settings2 },
  { id: 'business', label: 'Business Profile', icon: Store },
  { id: 'operations', label: 'Operations', icon: Briefcase },
  { id: 'finance', label: 'Finance & Tax', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & Access', icon: KeyRound },
];

const FIELD_CLASS =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50';

const ToggleCard = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
    <div className="pr-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative h-7 w-12 rounded-full transition ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      } ${disabled ? 'opacity-60' : ''}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  </div>
);

const SectionCard = ({ title, description, action, children }) => (
  <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const SettingsPage = () => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [settings, setSettings] = useState(defaultSystemSettings);

  const [businessForm, setBusinessForm] = useState({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
    companyWebsite: '',
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
  });

  const [notificationsForm, setNotificationsForm] = useState({
    bookingReminderHours: 24,
    returnReminderHours: 2,
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
  });

  const canEdit = userProfile?.role === 'owner' || userProfile?.role === 'admin';

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
    ],
    [businessForm.currency, operationsForm, settings.pickupTransportFee, settings.dropoffTransportFee]
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
      });
      setNotificationsForm({
        bookingReminderHours: Number(mergedSettings.bookingReminderHours) || 24,
        returnReminderHours: Number(mergedSettings.returnReminderHours) || 2,
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

  const handleBusinessSave = async () => {
    await persistSettings('Business profile', {
      ...businessForm,
    });
  };

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
    await persistSettings('Notifications', {
      bookingReminderHours: Number(notificationsForm.bookingReminderHours) || 0,
      returnReminderHours: Number(notificationsForm.returnReminderHours) || 0,
      whatsappEnabled: notificationsForm.whatsappEnabled,
      emailNotifications: notificationsForm.emailNotifications,
      smsNotifications: notificationsForm.smsNotifications,
      pushNotifications: notificationsForm.pushNotifications,
      notifyOnOverdue: notificationsForm.notifyOnOverdue,
      notifyOnMaintenance: notificationsForm.notifyOnMaintenance,
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
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <SectionCard
        title="System Settings Hub"
        description="One source of truth for business, operations, finance, notifications, and access."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="What Is Wired Now" description="These areas are already connected to real settings services.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Business Profile</p>
            <p className="mt-2 text-sm text-slate-500">
              Company identity, contact details, timezone, language, and currency are saved through the main settings service.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Operations</p>
            <p className="mt-2 text-sm text-slate-500">
              Rental defaults, tracking flags, operating days, and transport behavior are wired to live services.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Finance & Notifications</p>
            <p className="mt-2 text-sm text-slate-500">
              Finance defaults, tax rules, and operational reminders now save through the same stable API-backed settings flow.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderBusiness = () => (
    <SectionCard
      title="Business Profile"
      description="Central company identity used across admin pages, printed documents, and customer-facing communications."
      action={
        <button
          type="button"
          onClick={handleBusinessSave}
          disabled={!canEdit || savingSection === 'Business profile'}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSection === 'Business profile' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Business Profile
        </button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Company Name</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyName}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyName: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Company Email</label>
          <input
            type="email"
            className={FIELD_CLASS}
            value={businessForm.companyEmail}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyEmail: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Company Phone</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyPhone}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyPhone: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Website</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyWebsite}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyWebsite: e.target.value }))}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Address</label>
          <textarea
            rows={3}
            className={FIELD_CLASS}
            value={businessForm.companyAddress}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyAddress: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Timezone</label>
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
          <label className="mb-2 block text-sm font-medium text-slate-700">Default Language</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.language}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, language: e.target.value }))}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Currency</label>
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
      title="Operations"
      description="Operational rules for bookings, rental windows, notifications, and live tracking behavior."
      action={
        <button
          type="button"
          onClick={handleOperationsSave}
          disabled={!canEdit || savingSection === 'Operations'}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSection === 'Operations' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Operations
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Opening Time</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingStart}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingStart: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Closing Time</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingEnd}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingEnd: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Default Rental Duration</label>
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
              <label className="mb-2 block text-sm font-medium text-slate-700">Minimum Rental Duration</label>
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
              <label className="mb-2 block text-sm font-medium text-slate-700">Maximum Rental Duration</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.maxRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, maxRentalDuration: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">Operating Days</p>
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
            title="Maintenance Mode"
            description="Use this when the system should be read-only for operational changes."
            checked={operationsForm.maintenanceMode}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, maintenanceMode: value }))}
          />
          <ToggleCard
            title="Online Booking"
            description="Controls whether online booking flows stay available to the team."
            checked={operationsForm.onlineBooking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, onlineBooking: value }))}
          />
          <ToggleCard
            title="Real-Time Tracking"
            description="Default flag for the live map and tour tracking workflow."
            checked={operationsForm.realTimeTracking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, realTimeTracking: value }))}
          />
          <ToggleCard
            title="Email Notifications"
            description="Enable operational email notifications across booking and admin flows."
            checked={operationsForm.emailNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, emailNotifications: value }))}
          />
          <ToggleCard
            title="SMS Notifications"
            description="Enable SMS reminders for customers and staff workflows."
            checked={operationsForm.smsNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, smsNotifications: value }))}
          />
          <ToggleCard
            title="Push Notifications"
            description="Controls push-style notifications for supported user experiences."
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
      title="Finance & Tax"
      description="Tax behavior and finance defaults used by receipts, invoices, rentals, and tours."
      action={
        <button
          type="button"
          onClick={handleFinanceSave}
          disabled={!canEdit || savingSection === 'Finance & tax'}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Finance & Tax
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Tax Percentage</label>
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
            <label className="mb-2 block text-sm font-medium text-slate-700">Invoice Prefix</label>
            <input
              className={FIELD_CLASS}
              value={settings.invoicePrefix || 'INV'}
              disabled={!canEdit}
              onChange={(e) => setSettings((current) => ({ ...current, invoicePrefix: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleCard
              title="Apply Tax To Rentals"
              description="Include tax on rental receipts and finance calculations."
              checked={Boolean(settings.apply_to_rentals)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_rentals: value }))}
            />
            <ToggleCard
              title="Apply Tax To Tours"
              description="Include tax on tour bookings and tour finance reporting."
              checked={Boolean(settings.apply_to_tours)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_tours: value }))}
            />
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title="Enable Tax"
            description="Master control for tax visibility and automatic tax calculations."
            checked={Boolean(settings.tax_enabled)}
            disabled={!canEdit}
            onChange={(value) => setSettings((current) => ({ ...current, tax_enabled: value }))}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Finance Defaults</p>
            <p className="mt-2 text-sm text-slate-500">
              This section is now stored with the same shared system settings document, so it no longer depends on the missing
              `tax_settings` SQL table.
            </p>
            <button
              type="button"
              onClick={handleFinanceSave}
              disabled={!canEdit || savingSection === 'Finance & tax'}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Finance & Tax
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderNotifications = () => (
    <SectionCard
      title="Notifications"
      description="Operational communication defaults for reminders, alerts, WhatsApp, and staff follow-up."
      action={
        <button
          type="button"
          onClick={handleNotificationsSave}
          disabled={!canEdit || savingSection === 'Notifications'}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSection === 'Notifications' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Notifications
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Booking Reminder (hours before)</label>
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
            <label className="mb-2 block text-sm font-medium text-slate-700">Return Reminder (hours before)</label>
            <input
              type="number"
              min="0"
              className={FIELD_CLASS}
              value={notificationsForm.returnReminderHours}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, returnReminderHours: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Delivery Channels</p>
            <p className="mt-2 text-sm text-slate-500">
              Set the default channels the operations team expects to use for reminders and alerts.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title="WhatsApp Contact Flow"
            description="Makes WhatsApp the preferred communication channel in admin workflows."
            checked={notificationsForm.whatsappEnabled}
            disabled={!canEdit}
            onChange={(value) => setNotificationsForm((current) => ({ ...current, whatsappEnabled: value }))}
          />
          <ToggleCard
            title="Overdue Alerts"
            description="Notify the team when a rental or tour passes its planned return time."
            checked={notificationsForm.notifyOnOverdue}
            disabled={!canEdit}
            onChange={(value) => setNotificationsForm((current) => ({ ...current, notifyOnOverdue: value }))}
          />
          <ToggleCard
            title="Maintenance Alerts"
            description="Notify staff when inspection or maintenance thresholds are triggered."
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
      title="Security & Access"
      description="Administrative access policies, session timing, audit behavior, and sensitive workflow protections."
      action={
        <button
          type="button"
          onClick={handleSecuritySave}
          disabled={!canEdit || savingSection === 'Security & access'}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingSection === 'Security & access' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Security
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Session Timeout (minutes)</label>
          <input
            type="number"
            min="5"
            className={FIELD_CLASS}
            value={securityForm.sessionTimeoutMinutes}
            disabled={!canEdit}
            onChange={(e) => setSecurityForm((current) => ({ ...current, sessionTimeoutMinutes: e.target.value }))}
          />
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Access Policy Notes</p>
            <p className="mt-2 text-sm text-slate-500">
              These controls establish the administrative default policy. The rest of the app can gradually adopt them as the central source of truth.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title="Require 2FA For Admins"
            description="Target policy for owner/admin logins and sensitive settings changes."
            checked={securityForm.requireTwoFactorForAdmins}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, requireTwoFactorForAdmins: value }))}
          />
          <ToggleCard
            title="Allow Employee Package Edits"
            description="If disabled, employees stay read-only for package management and settings-adjacent package changes."
            checked={securityForm.allowEmployeePackageEdits}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeePackageEdits: value }))}
          />
          <ToggleCard
            title="Allow Employee Settings View"
            description="Lets employees open system settings in read-only mode for operational reference."
            checked={securityForm.allowEmployeeSettingsView}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeeSettingsView: value }))}
          />
          <ToggleCard
            title="Write Audit Logs"
            description="Keep admin changes and sensitive workflow changes attached to the audit trail."
            checked={securityForm.writeAuditLogs}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, writeAuditLogs: value }))}
          />
          <ToggleCard
            title="Allow Live Tracking Retry"
            description="Controls whether guides can re-trigger location permission after dismissing it once."
            checked={securityForm.allowLiveTrackingRetry}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowLiveTrackingRetry: value }))}
          />
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
      case 'finance':
        return renderFinance();
      case 'notifications':
        return renderNotifications();
      case 'security':
        return renderSecurity();
      case 'overview':
      default:
        return renderOverview();
    }
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <AdminModuleHero
        icon={<Settings2 className="h-8 w-8 text-white" />}
        eyebrow="System Settings"
        title="Control the whole admin system from one place"
        description="Configure business identity, operations, finance, notifications, and access without jumping between disconnected settings pages."
        actions={
          <>
            <button
              type="button"
              onClick={loadSettingsHub}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Settings
            </button>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm">
              <Bell className="h-4 w-4" />
              {canEdit ? 'Owner/Admin editing enabled' : 'Read-only access'}
            </div>
          </>
        }
      />

      <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-3">
            {TAB_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
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
          {loading ? (
            <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-16">
              <div className="flex items-center gap-3 text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Loading system settings...
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
