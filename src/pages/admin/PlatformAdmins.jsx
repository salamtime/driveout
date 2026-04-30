import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, RefreshCw, Shield, Unlock, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import { useAuth } from '../../contexts/AuthContext';
import {
  disablePlatformAdminAccess,
  grantPlatformAdminAccess,
  listPlatformAdmins,
  updatePlatformAdminAccess,
} from '../../services/PlatformAdminService';

const DEFAULT_PERMISSIONS = {
  Workspaces: true,
  'Platform Admins': false,
  'Marketplace Review': false,
  'System Settings': false,
};

const EMPTY_FORM = {
  email: '',
  platform_role: 'platform_admin',
  access_enabled: true,
  notes: '',
  permissions: DEFAULT_PERMISSIONS,
};

const PERMISSION_OPTIONS = [
  { key: 'Workspaces', label: 'Workspaces', description: 'Access tenant registry and workspace controls.' },
  { key: 'Platform Admins', label: 'Platform Admins', description: 'Grant or revoke other platform admins.' },
  { key: 'Marketplace Review', label: 'Marketplace Review', description: 'Review and manage marketplace content.' },
  { key: 'System Settings', label: 'System Settings', description: 'Access platform-wide settings surfaces.' },
];

const normalizeAdminPermissions = (permissions) => ({
  ...DEFAULT_PERMISSIONS,
  ...(permissions && typeof permissions === 'object' && !Array.isArray(permissions) ? permissions : {}),
});

const PlatformAdmins = () => {
  const { platformAccess } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingUserId, setSavingUserId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const canManagePlatformAdmins = platformAccess?.is_platform_owner === true;

  const activeCount = useMemo(
    () => admins.filter((admin) => admin.access_enabled !== false).length,
    [admins]
  );

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await listPlatformAdmins();
      setAdmins(data);
    } catch (error) {
      toast.error(error.message || 'Unable to load platform admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdmins();
  }, []);

  const handlePermissionToggle = (permissionKey, enabled) => {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permissionKey]: enabled,
      },
    }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!canManagePlatformAdmins) return;
    setSubmitting(true);

    try {
      const createdAdmin = await grantPlatformAdminAccess(form);
      setAdmins((current) => {
        const next = current.filter((entry) => entry.auth_user_id !== createdAdmin.auth_user_id);
        return [...next, createdAdmin];
      });
      setForm(EMPTY_FORM);
      toast.success('Platform access saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save platform access');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowToggle = async (admin, nextEnabled) => {
    if (!canManagePlatformAdmins) return;
    setSavingUserId(admin.auth_user_id);

    try {
      const updated = nextEnabled
        ? await updatePlatformAdminAccess(admin.auth_user_id, { access_enabled: true })
        : await disablePlatformAdminAccess(admin.auth_user_id);

      setAdmins((current) => current.map((entry) => (
        entry.auth_user_id === updated.auth_user_id ? updated : entry
      )));
      toast.success(nextEnabled ? 'Platform access enabled' : 'Platform access disabled');
    } catch (error) {
      toast.error(error.message || 'Unable to update access');
    } finally {
      setSavingUserId('');
    }
  };

  const handlePermissionUpdate = async (admin, permissionKey, enabled) => {
    if (!canManagePlatformAdmins) return;
    setSavingUserId(admin.auth_user_id);

    try {
      const updated = await updatePlatformAdminAccess(admin.auth_user_id, {
        permissions: {
          ...normalizeAdminPermissions(admin.permissions),
          [permissionKey]: enabled,
        },
      });

      setAdmins((current) => current.map((entry) => (
        entry.auth_user_id === updated.auth_user_id ? updated : entry
      )));
      toast.success('Platform permissions updated');
    } catch (error) {
      toast.error(error.message || 'Unable to update permissions');
    } finally {
      setSavingUserId('');
    }
  };

  return (
    <div className="pb-10">
      <AdminModuleHero
        icon={<Shield className="h-7 w-7" />}
        eyebrow="DriveOut access"
        title="Platform Admins"
        description="Grant, revoke, and review DriveOut platform access separately from tenant staff roles."
        actions={(
          <button
            type="button"
            onClick={() => void loadAdmins()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        )}
      />

      <div className="mt-6 grid gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Current access</h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeCount} active platform admin{activeCount === 1 ? '' : 's'}
            </p>
            {!canManagePlatformAdmins ? (
              <p className="mt-2 text-sm text-amber-700">
                You can review platform admins here, but only the platform owner can grant, revoke, or edit access.
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading platform admins...
            </div>
          ) : admins.length === 0 ? (
            <div className="py-10 text-sm text-slate-500">
              No platform admins yet. Grant the first one from the panel on the right.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {admins.map((admin) => {
                const permissions = normalizeAdminPermissions(admin.permissions);
                const isSaving = savingUserId === admin.auth_user_id;

                return (
                  <article
                    key={admin.auth_user_id}
                    className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {admin.full_name || admin.email}
                          </h3>
                          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {admin.platform_role === 'platform_owner' ? 'Platform owner' : 'Platform admin'}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              admin.access_enabled === false
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {admin.access_enabled === false ? 'Disabled' : 'Enabled'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{admin.email}</p>
                        {admin.notes ? (
                          <p className="mt-2 text-sm text-slate-600">{admin.notes}</p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        disabled={isSaving || !canManagePlatformAdmins}
                        onClick={() => void handleRowToggle(admin, admin.access_enabled === false)}
                        className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                          admin.access_enabled === false
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : admin.access_enabled === false ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        {admin.access_enabled === false ? 'Enable' : 'Disable'}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {PERMISSION_OPTIONS.map((option) => (
                        <label
                          key={`${admin.auth_user_id}-${option.key}`}
                          className="flex items-start gap-3 rounded-2xl border border-white bg-white px-3 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={permissions[option.key] === true}
                            disabled={isSaving || !canManagePlatformAdmins}
                            onChange={(event) => void handlePermissionUpdate(admin, option.key, event.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                            <span className="block text-xs text-slate-500">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Grant platform access</h2>
              <p className="mt-1 text-sm text-slate-500">
                This only affects DriveOut platform access. Tenant staff roles stay separate.
              </p>
              {!canManagePlatformAdmins ? (
                <p className="mt-2 text-sm text-amber-700">
                  Grant and revoke controls are limited to the platform owner.
                </p>
              ) : null}
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleCreate}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="platform-admin-email">
                User email
              </label>
              <input
                id="platform-admin-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@example.com"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                disabled={!canManagePlatformAdmins}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="platform-admin-role">
                Platform role
              </label>
              <select
                id="platform-admin-role"
                value={form.platform_role}
                onChange={(event) => setForm((current) => ({ ...current, platform_role: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                disabled={!canManagePlatformAdmins}
              >
                <option value="platform_admin">Platform admin</option>
                <option value="platform_owner">Platform owner</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="platform-admin-notes">
                Notes
              </label>
              <textarea
                id="platform-admin-notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                placeholder="Why this person needs platform access"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                disabled={!canManagePlatformAdmins}
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-slate-800">Platform permissions</p>
              <div className="mt-3 space-y-3">
                {PERMISSION_OPTIONS.map((option) => (
                  <label key={option.key} className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3">
                    <input
                      type="checkbox"
                      checked={form.permissions[option.key] === true}
                      disabled={!canManagePlatformAdmins}
                      onChange={(event) => handlePermissionToggle(option.key, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                      <span className="block text-xs text-slate-500">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.access_enabled}
                onChange={(event) => setForm((current) => ({ ...current, access_enabled: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                disabled={!canManagePlatformAdmins}
              />
              Enable access immediately
            </label>

            <button
              type="submit"
              disabled={submitting || !canManagePlatformAdmins}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Save platform access
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default PlatformAdmins;
