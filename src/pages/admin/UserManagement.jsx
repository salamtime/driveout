import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { addUser, deleteUser, getUsers, updateUserProfile } from '../../services/UserService';
import { TABLE_NAMES } from '../../config/tableNames';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ShieldAlert, Pencil, Users, Mail, Smartphone, Shield, MessageSquare, Eye, EyeOff, ScrollText, ChevronDown, ChevronUp, Trash2, CalendarDays, Upload, FileText, BadgeCheck, Image as ImageIcon, ExternalLink } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminWorkspaceLoadingShell from '../../components/admin/AdminWorkspaceLoadingShell';
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, buildDefaultPermissionsForRole } from '../../utils/permissionCatalog';
import { normalizePermissionMap as normalizeCatalogPermissionMap } from '../../utils/permissionCatalog';
import { isPlatformOwnerEmail } from '../../utils/accountType';
import {
  applyTelegramAdminSettingsToPreferences,
  buildDefaultTelegramEventTypes,
  countEnabledTelegramAlertEvents,
  getTelegramAlertSettingsFromPreferences,
} from '../../utils/telegramAlertPreferences';
import UserProfileService from '../../services/UserProfileService';
import i18n from '../../i18n';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';

const buildPermissionState = (defaultValue = false) =>
  ALL_PERMISSION_KEYS.reduce((acc, permissionKey) => ({ ...acc, [permissionKey]: defaultValue }), {});

const buildPermissionsForRole = (role) => buildDefaultPermissionsForRole(role);

const buildMergedPermissionsForUser = (user) => {
  const merged = buildPermissionsForRole(user?.role || 'employee');
  if (isPlatformOwnerEmail(user?.email)) {
    return merged;
  }

  const dbPermissions = normalizeCatalogPermissionMap(
    user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
      ? user.permissions
      : {}
  );

  ALL_PERMISSION_KEYS.forEach((permissionKey) => {
    if (Object.prototype.hasOwnProperty.call(dbPermissions, permissionKey)) {
      merged[permissionKey] = dbPermissions[permissionKey] === true;
    }
  });

  return merged;
};

const PERMISSION_ROLE_PRESETS = [
  { key: 'admin', label: 'Admin' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
  { key: 'mechanic', label: 'Mechanic' },
];

const TELEGRAM_ALERT_EVENT_OPTIONS = [
  { key: 'rental_created', label: 'Rental created' },
  { key: 'rental_started', label: 'Rental started' },
  { key: 'rental_vehicle_replaced', label: 'Vehicle replaced' },
  { key: 'rental_completed', label: 'Rental completed' },
  { key: 'payment_received', label: 'Payment received' },
  { key: 'rental_overdue', label: 'Rental overdue' },
  { key: 'rental_cancelled', label: 'Rental cancelled' },
  { key: 'deposit_returned', label: 'Deposit returned' },
];

const buildPermissionPreset = (presetKey) => {
  const permissions = buildPermissionState(false);
  const enable = (keys) => {
    keys.forEach((key) => {
      permissions[key] = true;
    });
  };

  if (presetKey === 'admin') {
    return buildPermissionState(true);
  }

  if (presetKey === 'manager') {
    enable([
      'Dashboard',
      'Calendar',
      'Tours & Bookings',
      'Manage Tour Packages',
      'Choose Tour Guide',
      'Team Tasks',
      'Rental Management',
      'Edit Rental Contract',
      'Edit Rental Cost',
      'Change Extension Price',
      'Require Extension Approval',
      'Edit Extension History',
      'Fleet Management',
      'Adjust Vehicle Fuel Level',
      'Customer Management',
      'Edit Customer Profile',
      'Pricing Management',
      'Quad Maintenance',
      'Fuel Logs',
      'Adjust Fuel Tank Level',
      'Inventory',
      'Finance Management',
      'Alerts',
      'WhatsApp Alerts',
    ]);
    return permissions;
  }

  if (presetKey === 'mechanic') {
    enable([
      'Dashboard',
      'Calendar',
      'Team Tasks',
      'Fleet Management',
      'Adjust Vehicle Fuel Level',
      'Quad Maintenance',
      'Fuel Logs',
      'Inventory',
      'Alerts',
      'WhatsApp Alerts',
    ]);
    return permissions;
  }

  enable([
    'Dashboard',
    'Calendar',
    'Tours & Bookings',
    'Team Tasks',
    'Rental Management',
    'Fuel Logs',
  ]);
  return permissions;
};

const buildPermissionSummary = (permissions) => {
  const summary = [];

  if (permissions['Rental Management']) {
    summary.push('Manage rentals');
  }
  if (permissions['Calendar']) {
    summary.push('View calendar');
  }
  if (permissions['Team Tasks']) {
    summary.push('Use team tasks');
  }
  if (permissions['Quad Maintenance']) {
    summary.push('Manage maintenance');
  }
  if (permissions['Fleet Management']) {
    summary.push('View fleet');
  }
  if (permissions['Finance Management']) {
    summary.push('View finance');
  }
  if (permissions['Marketplace Review']) {
    summary.push('Review marketplace listings');
  }
  if (permissions['Verification Center']) {
    summary.push('Review verification documents');
  }
  if (permissions['Messages']) {
    summary.push('Use shared message center');
  }
  if (!permissions['Edit Rental Cost'] && !permissions['Pricing Management']) {
    summary.push('Cannot edit pricing');
  }
  if (!permissions['User & Role Management']) {
    summary.push('Cannot manage users');
  }

  return summary.slice(0, 6);
};

const PERMISSION_MODULE_DESCRIPTIONS = {
  Dashboard: 'Access the main operations dashboard.',
  Calendar: 'View the operations calendar and daily planning.',
  'Tours & Bookings': 'Manage tour bookings and guide assignments.',
  'Team Tasks': 'Use the shared team task workspace.',
  'Rental Management': 'Create, manage, and track rentals.',
  'Fleet Management': 'View and manage fleet records.',
  'Customer Management': 'View and manage customer profiles.',
  'Pricing Management': 'Manage package and rental pricing.',
  'Quad Maintenance': 'Manage maintenance records and repairs.',
  'Fuel Logs': 'Track fuel activity and fuel adjustments.',
  Inventory: 'View inventory stock and movements.',
  'Finance Management': 'Access finance dashboards and reports.',
  Alerts: 'View and manage operational alerts.',
  'User & Role Management': 'Manage users and role permissions.',
  'Verification Center': 'Review owner and vehicle verification documents.',
  Messages: 'Access the shared operational message center.',
  'Marketplace Review': 'Review, approve, and publish marketplace listings.',
  'System Settings': 'Manage platform-wide settings.',
  'Project Export': 'Export project data.',
  'WhatsApp Alerts': 'Receive WhatsApp alert workflows.',
};

const PermissionAccessSummary = ({ enabled, selectedCount, totalCount }) => {
  if (!enabled) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        {tr('No Access', 'Aucun accès')}
      </span>
    );
  }

  if (totalCount === 0 || selectedCount === totalCount) {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        {tr('Full Access', 'Accès complet')}
      </span>
    );
  }

  return (
    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
      {tr('Custom', 'Personnalisé')} ({selectedCount}/{totalCount})
    </span>
  );
};

const PermissionToggle = ({ id, checked, onChange, disabled = false }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-violet-200 focus:ring-offset-2 ${
      checked ? 'bg-emerald-500' : 'bg-slate-300'
    } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const PermissionCheckboxGrid = ({ userId, permissions, extras, onToggle, disabled = false }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {extras.map((permissionKey) => {
      const permissionEnabled = permissions[permissionKey] === true;
      return (
        <label
          key={permissionKey}
          htmlFor={`permission-detail-${userId}-${permissionKey}`}
          className={`flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition ${
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-violet-100 hover:bg-violet-50/30'
          }`}
        >
          <Checkbox
            id={`permission-detail-${userId}-${permissionKey}`}
            checked={permissionEnabled}
            onCheckedChange={(checked) => onToggle(permissionKey, checked)}
            disabled={disabled}
            className="border-slate-300 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
          />
          <span className="text-sm font-medium text-slate-700">{permissionKey}</span>
        </label>
      );
    })}
  </div>
);

const PermissionCard = ({
  user,
  module,
  extras,
  visibleExtras,
  permissions,
  isExpanded,
  onExpand,
  onModuleToggle,
  onPermissionToggle,
  locked = false,
}) => {
  const moduleEnabled = permissions[module] === true;
  const selectedCount = extras.filter((permissionKey) => permissions[permissionKey] === true).length;
  const hasExtras = extras.length > 0;
  const canShowDetails = moduleEnabled && hasExtras;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => hasExtras && onExpand(module)}
          className={`min-w-0 flex-1 text-left ${hasExtras ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-950 sm:text-base">{module}</h4>
            <PermissionAccessSummary enabled={moduleEnabled} selectedCount={selectedCount} totalCount={extras.length} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {PERMISSION_MODULE_DESCRIPTIONS[module] || tr('Module access', 'Accès au module')}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-bold ${moduleEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
            {moduleEnabled ? 'ON' : 'OFF'}
          </span>
          <PermissionToggle
            id={`permission-module-${user.id}-${module}`}
            checked={moduleEnabled}
            onChange={(checked) => onModuleToggle(module, extras, checked)}
            disabled={locked}
          />
        </div>
      </div>

      {hasExtras ? (
        <>
          <div className="my-4 h-px bg-slate-100" />
          <button
            type="button"
            onClick={() => canShowDetails && onExpand(module)}
            disabled={!canShowDetails}
            className={`flex w-full items-center justify-between text-sm font-semibold transition ${
              canShowDetails ? 'text-slate-700 hover:text-violet-700' : 'cursor-not-allowed text-slate-400'
            }`}
          >
            <span>{tr('Detailed permissions', 'Permissions détaillées')}</span>
            {canShowDetails ? (
              isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="text-xs font-medium">{tr('Turn module on first', "Activez d'abord le module")}</span>
            )}
          </button>
          <div className={`grid transition-all duration-200 ease-out ${canShowDetails && isExpanded ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              {canShowDetails && isExpanded ? (
                <PermissionCheckboxGrid
                  userId={user.id}
                  permissions={permissions}
                  extras={visibleExtras}
                  onToggle={onPermissionToggle}
                  disabled={locked}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
};

const arePermissionMapsEqual = (left = {}, right = {}) =>
  ALL_PERMISSION_KEYS.every((permissionKey) => (left?.[permissionKey] === true) === (right?.[permissionKey] === true));

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const normalizeStaffIdDocuments = (documents) => {
  if (!documents) return [];
  const normalizeItem = (document, index = 0) => {
    if (!document) return null;
    if (typeof document === 'string') {
      return {
        id: `staff-id-${index}`,
        url: document,
        name: tr('Legal ID', 'Pièce légale'),
      };
    }
    if (typeof document === 'object') {
      const url = document.url || document.publicUrl || document.id_scan_url || document.path || document.storage_path || '';
      if (!url) return null;
      return {
        ...document,
        id: document.id || `staff-id-${index}`,
        url,
        name: document.name || document.fileName || document.filename || tr('Legal ID', 'Pièce légale'),
      };
    }
    return null;
  };

  if (Array.isArray(documents)) return documents.map((document, index) => normalizeItem(document, index)).filter(Boolean);
  if (typeof documents === 'string') {
    try {
      const parsed = JSON.parse(documents);
      return Array.isArray(parsed) ? parsed.map((document, index) => normalizeItem(document, index)).filter(Boolean) : [];
    } catch {
      return normalizeItem(documents, 0) ? [normalizeItem(documents, 0)] : [];
    }
  }
  return [];
};

const getStaffIdDocumentCount = (user) => normalizeStaffIdDocuments(user?.staff_id_documents).length;
const isImageDocument = (document) => /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(document?.url || '') || String(document?.mimeType || '').startsWith('image/');

const normalizeActivityAction = (log) =>
  String(log?.action || log?.event_name || log?.title || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');

const isLoginActivity = (log) => {
  const action = normalizeActivityAction(log);
  return action === 'user_login' || action === 'login' || action === 'signed_in';
};

const isLogoutActivity = (log) => {
  const action = normalizeActivityAction(log);
  return action === 'user_logout' || action === 'logout' || action === 'signed_out';
};

const UserManagement = () => {
  const isFrench = isFrenchLocale();
  const { user: currentUser, loading: authLoading, initialized } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const [enrichingUsers, setEnrichingUsers] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [isAddUserModalOpen, setAddUserModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({ 
    email: '', 
    password: '', 
    name: '', 
    role: 'employee',
    phone_number: '',
    whatsapp_notifications: false,
    telegram_alerts_allowed: false,
    telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
    salary_amount: '',
    staff_id_documents: []
  });
  const [editUser, setEditUser] = useState({ 
    email: '', 
    name: '', 
    role: '', 
    password: '', 
    confirmPassword: '',
    phone_number: '',
    whatsapp_notifications: false,
    telegram_alerts_allowed: false,
    telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
    preferences: {},
    salary_amount: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [newUserPermissions, setNewUserPermissions] = useState(buildPermissionsForRole('employee'));
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  const [editPermissions, setEditPermissions] = useState({});
  const [permissionDraftBaseline, setPermissionDraftBaseline] = useState({});
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [userActivityLogs, setUserActivityLogs] = useState([]);
  const [isLoadingUserActivity, setIsLoadingUserActivity] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [showProfilePermissions, setShowProfilePermissions] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [expandedPermissionModules, setExpandedPermissionModules] = useState(() => new Set());
  const [legalIdPreviewUser, setLegalIdPreviewUser] = useState(null);
  const [legalIdPreviewIndex, setLegalIdPreviewIndex] = useState(0);

  const setGroupedPermissionValue = (setter, permissionKey, checked) => {
    setter((prev) => ({ ...prev, [permissionKey]: checked === true }));
  };

  const handleModuleToggle = (setter, moduleKey, extras, checked) => {
    setter((prev) => {
      const next = { ...prev, [moduleKey]: checked === true };
      if (!checked) {
        extras.forEach((permissionKey) => {
          next[permissionKey] = false;
        });
      }
      return next;
    });
  };

  const isOwnerRole = (role) => String(role || '').toLowerCase() === 'owner';
  const isMasterOwnerUser = (user) => isOwnerRole(user?.role) && isPlatformOwnerEmail(user?.email);
  const getLockedMasterOwnerPermissions = () => buildPermissionsForRole('owner');
  const legalIdDocuments = useMemo(
    () => normalizeStaffIdDocuments(legalIdPreviewUser?.staff_id_documents || legalIdPreviewUser?.user_metadata?.staff_id_documents),
    [legalIdPreviewUser]
  );
  const activeLegalIdDocument = legalIdDocuments[legalIdPreviewIndex] || null;

  const userRouteMatch = useMemo(
    () => location.pathname.match(/\/admin\/users\/([^/]+)\/(profile|edit|permissions)$/),
    [location.pathname]
  );
  const activeUserId = userRouteMatch?.[1] ? decodeURIComponent(userRouteMatch[1]) : null;
  const activeView = userRouteMatch?.[2] || null;
  const activeUser = useMemo(
    () => users.find((user) => String(user.id) === String(activeUserId)) || null,
    [users, activeUserId]
  );
  const isInitialActivityLoading = isLoadingUserActivity && userActivityLogs.length === 0;
  const activitySummary = useMemo(() => {
    const sortedLogs = [...userActivityLogs]
      .filter((log) => log?.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const latestLog = sortedLogs[0] || null;
    const lastLogin = sortedLogs.find((log) => isLoginActivity(log)) || null;
    const lastLogout = sortedLogs.find((log) => isLogoutActivity(log)) || null;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentLogs = sortedLogs.filter((log) => new Date(log.created_at).getTime() >= sevenDaysAgo);
    const recentNonAuthLogs = recentLogs.filter((log) => !isLoginActivity(log) && !isLogoutActivity(log));

    return {
      latestLog,
      lastLogin,
      lastLogout,
      recentCount: recentLogs.length,
      recentUsageCount: recentNonAuthLogs.length,
      hasRecentUsage: recentLogs.length > 0,
    };
  }, [userActivityLogs]);

  useEffect(() => {
    if (initialized) {
      console.log("Auth Initialized. Current User:", currentUser);
    }
  }, [initialized, currentUser]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    console.log("=== fetchUsers called ===");
    
    try {
      setEnrichingUsers(true);
      const usersData = await getUsers();
      console.log(`Merged admin users fetched: ${usersData.length}`);

      const transformedUsers = (usersData || []).map((user) => {
        const normalizedPreferences = user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
          ? user.preferences
          : {};
        const telegramSettings = getTelegramAlertSettingsFromPreferences(normalizedPreferences);

        return {
          ...user,
          id: user.id,
          email: user.email || '',
          name: user.name || user.full_name || user.user_metadata?.full_name || user.user_metadata?.name || 'No Name',
          role: user.role || user.user_metadata?.role || 'employee',
          phone_number: user.phone_number || '',
          whatsapp_notifications: Boolean(user.whatsapp_notifications),
          telegram_alerts_allowed: telegramSettings.allowed,
          telegram_allowed_event_types: telegramSettings.allowed_event_types,
          preferences: normalizedPreferences,
          permissions: user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions) ? normalizeCatalogPermissionMap(user.permissions) : {},
          salary_amount: user.salary_amount ?? null,
          staff_id_documents: normalizeStaffIdDocuments(user.staff_id_documents || user.user_metadata?.staff_id_documents),
          created_at: user.created_at || null,
          updated_at: user.updated_at || null,
        };
      });

      setUsers(transformedUsers);
    } catch (error) {
      console.error("Error in fetchUsers:", error);
      setUsers([]);
      setFetchError(error.message || tr('Failed to fetch users', "Impossible de charger les utilisateurs"));
      toast.error(`${tr('Failed to fetch users', "Impossible de charger les utilisateurs")} : ${error.message}`);
    } finally {
      setEnrichingUsers(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized && currentUser?.role === 'owner') {
      fetchUsers();
    } else if (initialized) {
      setLoading(false);
    }
  }, [initialized, currentUser, fetchUsers]);

  const handlePermissionChange = (module, checked) => {
    setNewUserPermissions(prev => ({ ...prev, [module]: checked }));
  };

  const handleEditPermissionChange = (module, checked) => {
    setEditPermissions(prev => ({ ...prev, [module]: checked }));
  };
  
  const handleRoleChange = (role) => {
    setNewUser(p => ({ ...p, role: role }));
    setNewUserPermissions(buildPermissionsForRole(role));
  };

  const handleAddUser = async () => {
    console.log("=== handleAddUser START ===");
    
    if (currentUser.role !== 'owner') {
        console.error("User is not owner. Current role:", currentUser.role);
        toast.error("Seuls les propriétaires peuvent ajouter de nouveaux utilisateurs.");
        return;
    }

    if (!newUser.email || !newUser.password || !newUser.name) {
        console.error("Missing required fields:", { email: !!newUser.email, password: !!newUser.password, name: !!newUser.name });
        toast.error("Veuillez remplir tous les champs : nom complet, e-mail et mot de passe.");
        return;
    }

    if (!supabase) {
        console.error("supabase is not initialized");
        toast.error("Admin client not initialized. Cannot create user.");
        return;
    }

    console.log("All validations passed. Creating user...");
    console.log("newUser data:", JSON.stringify(newUser, null, 2));

    setIsSubmitting(true);
    
    try {
        const completePermissions = isMasterOwnerUser(newUser) ? getLockedMasterOwnerPermissions() : {};
        if (!isMasterOwnerUser(newUser)) {
          ALL_PERMISSION_KEYS.forEach(permissionKey => {
            completePermissions[permissionKey] = newUserPermissions[permissionKey] === true;
          });
        }

        const telegramPreferences = applyTelegramAdminSettingsToPreferences({}, {
          allowed: newUser.telegram_alerts_allowed,
          allowed_event_types: newUser.telegram_allowed_event_types,
        });

        const data = await addUser(newUser.email, newUser.password, newUser.name, newUser.role.toLowerCase(), {
          phone_number: newUser.phone_number || null,
          whatsapp_notifications: newUser.whatsapp_notifications || false,
          preferences: telegramPreferences,
          permissions: completePermissions,
          salary_amount: newUser.salary_amount,
          access_enabled: true,
        });
        if (!data?.user) throw new Error('User creation failed - no user data returned');
        
        console.log("User created successfully:", data.user);
        console.log("User ID:", data.user.id);
        console.log("User email:", data.user.email);
        
        const assignedModules = Object.entries(newUserPermissions)
            .filter(([, hasAccess]) => hasAccess)
            .map(([moduleName]) => moduleName);

        console.log(`User ${data.user.id} created. Assigned modules:`, assignedModules);

        // Close modal and reset form
        setAddUserModalOpen(false);
        setNewUser({ 
          email: '', 
          password: '', 
          name: '', 
          role: 'employee',
          phone_number: '',
          whatsapp_notifications: false,
          telegram_alerts_allowed: false,
          telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
          salary_amount: ''
        });
        setNewUserPermissions(buildPermissionsForRole('employee'));
        
        // Refresh user list
        console.log("Refreshing user list...");
        await fetchUsers();
        
        toast.success(`User ${newUser.name} added successfully!`);
        console.log("=== handleAddUser SUCCESS ===");
    } catch (error) {
        console.error("=== handleAddUser ERROR ===");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.error("Full error object:", JSON.stringify(error, null, 2));
        
        toast.error(`Error adding user: ${error.message || 'Unknown error occurred'}`);
    } finally {
        setIsSubmitting(false);
        console.log("=== handleAddUser END ===");
    }
  };

  const openEditPage = async (user) => {
    console.log("=== openEditPage ===");
    console.log("User to edit:", user);
    const telegramSettings = getTelegramAlertSettingsFromPreferences(user.preferences);
    
    setSelectedUser(user);

    // Use the phone_number already in the user object (from fetchUsers)
    setEditUser({
      email: user.email || '',
      name: user.name || '',
      role: user.role || 'employee',
      password: '',
      confirmPassword: '',
      phone_number: user.phone_number || '', // ✅ Get from user object
      whatsapp_notifications: user.whatsapp_notifications || false,
      telegram_alerts_allowed: telegramSettings.allowed,
      telegram_allowed_event_types: telegramSettings.allowed_event_types,
      preferences: user.preferences || {},
      salary_amount: user.salary_amount ?? '',
      staff_id_documents: normalizeStaffIdDocuments(user.staff_id_documents || user.user_metadata?.staff_id_documents)
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);

    navigate(`/admin/users/${encodeURIComponent(user.id)}/edit`);
  };

  const handleEditUser = async () => {
    console.log("=== handleEditUser START ===");
    
    if (currentUser.role !== 'owner') {
        console.error("User is not owner. Current role:", currentUser.role);
        toast.error(tr('Only owners can edit users.', 'Seuls les propriétaires peuvent modifier les utilisateurs.'));
        return;
    }

    // Validation
    if (!editUser.email || !editUser.name || !editUser.role) {
        toast.error(tr('Please fill in all required fields: Full Name, Email, and Role.', 'Veuillez remplir tous les champs requis : nom complet, e-mail et rôle.'));
        return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editUser.email)) {
        toast.error(tr('Please enter a valid email address.', 'Veuillez saisir une adresse e-mail valide.'));
        return;
    }

    // Phone number validation
    if (editUser.phone_number && !/^\+?[0-9\s\-\(\)]+$/.test(editUser.phone_number)) {
        toast.error("Please enter a valid phone number.");
        return;
    }

    // Password validation (if provided)
    if (editUser.password) {
        if (editUser.password.length < 6) {
            toast.error("Password must be at least 6 characters long.");
            return;
        }
        if (editUser.password !== editUser.confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
    }

    // Prevent users from editing their own role
    if (selectedUser.id === currentUser.id && editUser.role !== selectedUser.role) {
        toast.error("You cannot change your own role.");
        return;
    }

    setIsSubmitting(true);
    
    try {
        console.log("Updating user:", selectedUser.id);
        console.log("Update data:", { 
            email: editUser.email, 
            name: editUser.name, 
            role: editUser.role,
            hasPassword: !!editUser.password,
            phone_number: editUser.phone_number,
            whatsapp_notifications: editUser.whatsapp_notifications,
            salary_amount: editUser.salary_amount,
            staff_id_documents: normalizeStaffIdDocuments(editUser.staff_id_documents).length
        });

        const updates = {
            email: editUser.email,
            name: editUser.name,
            role: editUser.role.toLowerCase(),
            phone_number: editUser.phone_number || null,
            whatsapp_notifications: editUser.whatsapp_notifications || false,
            preferences: applyTelegramAdminSettingsToPreferences(editUser.preferences || selectedUser?.preferences || {}, {
              allowed: editUser.telegram_alerts_allowed,
              allowed_event_types: editUser.telegram_allowed_event_types,
            }),
            salary_amount: editUser.salary_amount,
            staff_id_documents: normalizeStaffIdDocuments(editUser.staff_id_documents),
        };

        // Only include password if provided
        if (editUser.password && editUser.password.trim() !== '') {
            updates.password = editUser.password;
        }

        await updateUserProfile(selectedUser.id, updates);

        // Close page editor and reset form
        setEditUser({ 
          email: '', 
          name: '', 
          role: '', 
          password: '', 
          confirmPassword: '',
          phone_number: '',
          whatsapp_notifications: false,
          telegram_alerts_allowed: false,
          telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
          preferences: {},
          salary_amount: '',
          staff_id_documents: []
        });
        setSelectedUser(null);
        navigate('/admin/users');
        
        // Refresh user list
        await fetchUsers();
        
        toast.success(`User updated successfully!`);
        console.log("=== handleEditUser SUCCESS ===");
    } catch (error) {
        console.error("=== handleEditUser ERROR ===");
        console.error("Error:", error);
        toast.error(`Error updating user: ${error.message || 'Unknown error occurred'}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleStaffIdDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedUser?.id) return;

    try {
      setIsSubmitting(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `staff_ids/${selectedUser.id}/${Date.now()}_${safeName}`;
      const { data, error } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(data.path);

      const nextDocument = {
        id: `staff_id_${Date.now()}`,
        name: file.name,
        url: publicData?.publicUrl || '',
        bucket: 'customer-documents',
        storage_path: data.path,
        type: file.type || 'application/octet-stream',
        size: file.size,
        uploaded_at: new Date().toISOString(),
      };

      setEditUser((prev) => ({
        ...prev,
        staff_id_documents: [...normalizeStaffIdDocuments(prev.staff_id_documents), nextDocument],
      }));
      toast.success(tr('ID document uploaded. Save changes to attach it to this user.', "Document d'identité importé. Enregistrez les modifications pour l'attacher à cet utilisateur."));
    } catch (error) {
      console.error('Failed to upload staff ID document:', error);
      toast.error(`${tr('Failed to upload ID document', "Impossible d'importer le document d'identité")} : ${error.message}`);
    } finally {
      setIsSubmitting(false);
      event.target.value = '';
    }
  };

  const handleRemoveStaffIdDocument = (documentId) => {
    setEditUser((prev) => ({
      ...prev,
      staff_id_documents: normalizeStaffIdDocuments(prev.staff_id_documents).filter((document) => {
        const currentId = document.id || document.url || document.storage_path || document.name;
        return currentId !== documentId;
      }),
    }));
  };

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !supabase) return;
    
    console.log("=== handleDeleteUser START ===");
    console.log("Deleting user:", selectedUser.id);

    setIsSubmitting(true);

    try {
      await deleteUser(selectedUser.id);
      
      setDeleteModalOpen(false);
      setSelectedUser(null);
      navigate('/admin/users');
      await fetchUsers();
      toast.success('User deleted successfully!');
      console.log("=== handleDeleteUser SUCCESS ===");
    } catch (error) {
      console.error("=== handleDeleteUser ERROR ===");
      console.error("Error:", error);
      toast.error(`Error deleting user: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadPermissionsForUser = async (user) => {
    console.log("=== loadPermissionsForUser START ===");
    console.log("Fetching permissions for user ID:", user.id);
    console.log("User object:", user);
    
    // Clear state before loading new data
    setEditPermissions({});
    setSelectedUserForPermissions(user);
    setIsLoadingPermissions(true);
    
    try {
      if (isMasterOwnerUser(user)) {
        const lockedPermissions = getLockedMasterOwnerPermissions();
        setEditPermissions(lockedPermissions);
        setPermissionDraftBaseline(lockedPermissions);
        return;
      }

      // FIXED: Use supabase instead of supabase
      const { data, error } = await supabase
        .from(TABLE_NAMES.USERS)
        .select('permissions')
        .eq('id', user.id)
        .maybeSingle();
      
      console.log("Fetch result - data:", data);
      console.log("Fetch result - error:", error);
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching permissions:', error);
        throw error;
      }
      
      // Handle case when no row exists
      if (!data) {
        console.warn('No permissions row found for user:', user.id);
        // State Management: Default to all FALSE
        const defaultPermissions = buildPermissionsForRole(user.role || 'employee');
        setEditPermissions(defaultPermissions);
        return;
      }
      
      // The 'Merge' Strategy: Merge database permissions with master modules list
      // Missing keys are treated as false, not true
      const dbPermissions = data?.permissions || {};
      const merged = buildPermissionsForRole(user.role || 'employee');
      ALL_PERMISSION_KEYS.forEach(m => {
        if (Object.prototype.hasOwnProperty.call(dbPermissions, m)) {
          merged[m] = dbPermissions[m] === true;
        }
      });
      
      console.log("Merged permissions:", merged);
      setEditPermissions(merged);
      setPermissionDraftBaseline(merged);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error(`${tr('Failed to load permissions', 'Impossible de charger les autorisations')} : ${error.message}`);
      // State Management: Default to all FALSE if error
      const defaultPermissions = buildPermissionsForRole(user.role || 'employee');
      setEditPermissions(defaultPermissions);
      setPermissionDraftBaseline(defaultPermissions);
    } finally {
      setIsLoadingPermissions(false);
      console.log("=== loadPermissionsForUser END ===");
    }
  };

  const openPermissionsPage = async (user) => {
    setShowProfilePermissions(true);
    await loadPermissionsForUser(user);
  };

  const openLegalIdPreview = (user, index = 0) => {
    const documents = normalizeStaffIdDocuments(user?.staff_id_documents || user?.user_metadata?.staff_id_documents);
    if (documents.length === 0) {
      toast.info(tr('No legal ID uploaded for this user yet.', "Aucune pièce légale n'a encore été importée pour cet utilisateur."));
      return;
    }
    setLegalIdPreviewUser(user);
    setLegalIdPreviewIndex(Math.min(index, documents.length - 1));
  };

  const closeLegalIdPreview = () => {
    setLegalIdPreviewUser(null);
    setLegalIdPreviewIndex(0);
  };

  const legalIdPreviewOverlay = legalIdPreviewUser ? (
    <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-x-hidden bg-slate-950/45 p-3 sm:p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-[min(100%,56rem)] overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <BadgeCheck className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{tr('Legal ID', 'Pièce légale')}</h2>
                <p className="text-sm text-slate-500">
                  {`${legalIdPreviewUser.name} • ${legalIdDocuments.length} ${tr(legalIdDocuments.length === 1 ? 'file' : 'files', legalIdDocuments.length === 1 ? 'fichier' : 'fichiers')}`}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLegalIdPreview}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-b border-violet-100 bg-slate-50/70 p-4 md:border-b-0 md:border-r">
            <div className="space-y-2">
              {legalIdDocuments.map((document, index) => {
                const selected = index === legalIdPreviewIndex;
                return (
                  <button
                    key={document.id || document.url || index}
                    type="button"
                    onClick={() => setLegalIdPreviewIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      selected
                        ? 'border-violet-200 bg-white shadow-[0_12px_30px_rgba(124,58,237,0.10)]'
                        : 'border-transparent bg-white/70 hover:border-violet-100 hover:bg-white'
                    }`}
                  >
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                      <ImageIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{document.name || `${tr('Legal ID', 'Pièce légale')} ${index + 1}`}</span>
                      <span className="block text-xs text-slate-500">{tr('Tap to preview', 'Touchez pour prévisualiser')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-[420px] min-w-0 flex-col bg-white">
            {activeLegalIdDocument ? (
              <>
                <div className="flex flex-col gap-3 border-b border-violet-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{activeLegalIdDocument.name || tr('Legal ID', 'Pièce légale')}</p>
                    <p className="text-xs text-slate-500">{tr('Inline preview', 'Aperçu intégré')}</p>
                  </div>
                  <a
                    href={activeLegalIdDocument.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {tr('Open original', "Ouvrir l'original")}
                  </a>
                </div>
                <div className="flex-1 overflow-auto bg-slate-50 p-3 sm:p-4">
                  {isImageDocument(activeLegalIdDocument) ? (
                    <div className="overflow-hidden rounded-[24px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
                      <img
                        src={activeLegalIdDocument.url}
                        alt={activeLegalIdDocument.name || tr('Legal ID preview', 'Aperçu de la pièce légale')}
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[24px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
                      <iframe
                        src={activeLegalIdDocument.url}
                        title={activeLegalIdDocument.name || tr('Legal ID preview', 'Aperçu de la pièce légale')}
                        className="h-[70vh] w-full"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">
                {tr('No legal ID available for preview.', "Aucune pièce légale disponible pour l'aperçu.")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const startInlinePermissionDraft = (user, updater) => {
    if (!user) return;

    if (isMasterOwnerUser(user)) {
      const lockedPermissions = getLockedMasterOwnerPermissions();
      setSelectedUserForPermissions(user);
      setEditPermissions(lockedPermissions);
      setPermissionDraftBaseline(lockedPermissions);
      return;
    }

    const basePermissions =
      selectedUserForPermissions?.id === user.id
        ? editPermissions
        : buildMergedPermissionsForUser(user);

    if (selectedUserForPermissions?.id !== user.id) {
      setPermissionDraftBaseline(basePermissions);
    }
    setSelectedUserForPermissions(user);
    setEditPermissions(updater(basePermissions));
  };

  const handleInlineModuleToggle = (user, module, extras, checked) => {
    if (isMasterOwnerUser(user)) return;

    startInlinePermissionDraft(user, (basePermissions) => {
      const next = { ...basePermissions, [module]: checked === true };
      if (!checked) {
        extras.forEach((permissionKey) => {
          next[permissionKey] = false;
        });
      }
      return next;
    });
  };

  const handleInlinePermissionToggle = (user, permissionKey, checked) => {
    if (isMasterOwnerUser(user)) return;

    startInlinePermissionDraft(user, (basePermissions) => ({
      ...basePermissions,
      [permissionKey]: checked === true,
    }));
  };

  const handleApplyPermissionPreset = (user, presetKey) => {
    if (!user || !presetKey) return;
    if (isMasterOwnerUser(user)) {
      const lockedPermissions = getLockedMasterOwnerPermissions();
      setSelectedUserForPermissions(user);
      setEditPermissions(lockedPermissions);
      setPermissionDraftBaseline(lockedPermissions);
      return;
    }

    if (selectedUserForPermissions?.id !== user.id) {
      setPermissionDraftBaseline(buildMergedPermissionsForUser(user));
    }
    setSelectedUserForPermissions(user);
    setEditPermissions(buildPermissionPreset(presetKey));
  };

  const handleCancelPermissionDraft = () => {
    setSelectedUserForPermissions(null);
    setEditPermissions({});
    setPermissionDraftBaseline({});
  };

  const togglePermissionModuleDetails = (module) => {
    setExpandedPermissionModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const openProfilePage = (user) => {
    navigate(`/admin/users/${encodeURIComponent(user.id)}/profile`);
  };

  const loadUserActivity = useCallback(async (userId, options = {}) => {
    if (!userId) return;
    const { append = false, offset = 0 } = options;
    setIsLoadingUserActivity(true);
    try {
      const profileUser = users.find((user) => String(user.id) === String(userId));
      const { data, hasMore, total, error } = await UserProfileService.getUserActivityLog(userId, {
        limit: 25,
        offset,
        userName: profileUser?.name || '',
        userEmail: profileUser?.email || '',
      });
      if (error) {
        console.warn('Error loading user activity:', error);
      }
      setUserActivityLogs((prev) => {
        if (!append) return data || [];
        const merged = [...prev, ...(data || [])];
        return merged.filter((log, index, logs) => logs.findIndex((candidate) => candidate.id === log.id) === index);
      });
      setActivityOffset(offset);
      setActivityHasMore(Boolean(hasMore));
      setActivityTotal(Number(total || 0));
    } finally {
      setIsLoadingUserActivity(false);
    }
  }, [users]);

  const handleUpdatePermissions = async () => {
    if (!selectedUserForPermissions) return;
    
    console.log("=== handleUpdatePermissions START ===");
    console.log("Selected user ID:", selectedUserForPermissions.id);
    console.log("Current editPermissions (raw):", editPermissions);
    
    setIsSubmitting(true);
    
    try {
      // DATA SAFETY: Ensure permissions are saved as JSON Object (not array)
      // Explicit False Values: Ensure all modules are included with explicit true/false
      const completePermissions = isMasterOwnerUser(selectedUserForPermissions) ? getLockedMasterOwnerPermissions() : {};
      if (!isMasterOwnerUser(selectedUserForPermissions)) {
        ALL_PERMISSION_KEYS.forEach(permissionKey => {
          completePermissions[permissionKey] = editPermissions[permissionKey] === true;
        });
      }
      
      console.log("✅ Complete permissions to save (JSON Object):", completePermissions);
      console.log("✅ Permissions type check:", typeof completePermissions);
      console.log("✅ Is Array?", Array.isArray(completePermissions));
      console.log("✅ Is Object?", completePermissions !== null && typeof completePermissions === 'object' && !Array.isArray(completePermissions));
      
      const updatePayload = {
        email: selectedUserForPermissions.email,
        name: selectedUserForPermissions.name,
        role: selectedUserForPermissions.role,
        permissions: completePermissions,
      };
      
      console.log("🔍 PERMISSION UPDATE PAYLOAD (before admin API call):");
      console.log("   - user_id:", selectedUserForPermissions.id);
      console.log("   - email:", updatePayload.email);
      console.log("   - full_name:", updatePayload.name);
      console.log("   - role:", updatePayload.role);
      console.log("   - permissions:", JSON.stringify(updatePayload.permissions, null, 2));
      
      await updateUserProfile(selectedUserForPermissions.id, updatePayload);
      
      setUsers((prev) =>
        prev.map((user) =>
          String(user.id) === String(selectedUserForPermissions.id)
            ? {
                ...user,
                permissions: completePermissions,
                updated_at: new Date().toISOString(),
              }
            : user
        )
      );
      const updatedUserId = selectedUserForPermissions.id;
      const shouldStayInline = activeView === 'profile';
      setSelectedUserForPermissions(null);
      setEditPermissions({});
      setPermissionDraftBaseline({});
      if (shouldStayInline) {
        setShowProfilePermissions(true);
      } else {
        navigate(`/admin/users/${encodeURIComponent(updatedUserId)}/profile`);
      }
      toast.success(`Permissions updated for ${selectedUserForPermissions.name}`);
      console.log("=== handleUpdatePermissions SUCCESS ===");
    } catch (error) {
      console.error('=== handleUpdatePermissions ERROR ===');
      console.error('Error updating permissions:', error);
      toast.error(`Failed to update permissions: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeUser || activeView !== 'edit') return;
    const telegramSettings = getTelegramAlertSettingsFromPreferences(activeUser.preferences);

    setSelectedUser(activeUser);
    setEditUser({
      email: activeUser.email || '',
      name: activeUser.name || '',
      role: activeUser.role || 'employee',
      password: '',
      confirmPassword: '',
      phone_number: activeUser.phone_number || '',
      whatsapp_notifications: activeUser.whatsapp_notifications || false,
      telegram_alerts_allowed: telegramSettings.allowed,
      telegram_allowed_event_types: telegramSettings.allowed_event_types,
      preferences: activeUser.preferences || {},
      salary_amount: activeUser.salary_amount ?? '',
      staff_id_documents: normalizeStaffIdDocuments(activeUser.staff_id_documents || activeUser.user_metadata?.staff_id_documents)
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
  }, [activeUser, activeView]);

  useEffect(() => {
    if (!activeUser || activeView !== 'permissions') return;
    loadPermissionsForUser(activeUser);
  }, [activeUser, activeView]);

  useEffect(() => {
    if (!activeUser || activeView !== 'profile') return;
    setSelectedUser(activeUser);
    setShowProfilePermissions(false);
    setUserActivityLogs([]);
    setActivityOffset(0);
    setActivityHasMore(false);
    setActivityTotal(0);
    loadUserActivity(activeUser.id, { append: false, offset: 0 });
  }, [activeUser, activeView, loadUserActivity]);

  const handleLoadMoreActivity = async () => {
    if (!activeUser?.id || isLoadingUserActivity || !activityHasMore) return;
    await loadUserActivity(activeUser.id, {
      append: true,
      offset: activityOffset + 25,
    });
  };

  const closeDetailPage = () => {
    setSelectedUser(null);
    setSelectedUserForPermissions(null);
    setEditPermissions({});
    setEditUser({
      email: '',
      name: '',
      role: '',
      password: '',
      confirmPassword: '',
      phone_number: '',
      whatsapp_notifications: false,
      telegram_alerts_allowed: false,
      telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
      preferences: {},
      salary_amount: '',
      staff_id_documents: []
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
    setUserActivityLogs([]);
    setActivityOffset(0);
    setActivityHasMore(false);
    setActivityTotal(0);
    setShowProfilePermissions(false);
    navigate('/admin/users');
  };

  const returnToActiveUserProfile = () => {
    if (!activeUser?.id) {
      closeDetailPage();
      return;
    }

    setSelectedUser(activeUser);
    setSelectedUserForPermissions(null);
    setEditPermissions({});
    setShowProfilePermissions(true);
    navigate(`/admin/users/${encodeURIComponent(activeUser.id)}/profile`);
  };

  const deleteConfirmationDialog = (
    <Dialog open={isDeleteModalOpen} onOpenChange={setDeleteModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription className="sr-only">
            Dialog for confirming user deletion
          </DialogDescription>
        </DialogHeader>
        <p>This will permanently delete the user <span className="font-bold">{selectedUser?.name || selectedUser?.email}</span>. This action cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDeleteUser} disabled={isSubmitting || !selectedUser}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderPermissionWorkspace = (user, options = {}) => {
    if (!user) return null;

    const { standalone = false } = options;
    const masterOwnerLocked = isMasterOwnerUser(user);
    const hasDraftForUser = selectedUserForPermissions?.id === user.id;
    const mergedPermissions = masterOwnerLocked
      ? getLockedMasterOwnerPermissions()
      : hasDraftForUser
        ? editPermissions
        : buildMergedPermissionsForUser(user);
    const hasPermissionChanges = !masterOwnerLocked && hasDraftForUser && !arePermissionMapsEqual(editPermissions, permissionDraftBaseline);
    const query = permissionSearch.trim().toLowerCase();
    const filteredGroups = PERMISSION_GROUPS.map((group) => ({
      ...group,
      matchedExtras: group.extras.filter((permissionKey) => permissionKey.toLowerCase().includes(query)),
    })).filter((group) => {
      if (!query) return true;
      return group.module.toLowerCase().includes(query) || group.matchedExtras.length > 0;
    });
    const summaryItems = buildPermissionSummary(mergedPermissions);

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{tr('Permissions', 'Permissions')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {masterOwnerLocked
                ? tr('The master owner keeps full platform access. These permissions cannot be disabled.', 'Le propriétaire principal garde un accès complet à la plateforme. Ces permissions ne peuvent pas être désactivées.')
                : hasPermissionChanges
                ? tr('Unsaved permission changes.', 'Modifications non enregistrées.')
                : tr('Choose a role preset or adjust module access below.', 'Choisissez un rôle prédéfini ou ajustez les accès ci-dessous.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleCancelPermissionDraft();
                if (standalone && !hasPermissionChanges) {
                  closeDetailPage();
                }
              }}
              disabled={isSubmitting}
              className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              {tr('Cancel', 'Annuler')}
            </Button>
            <Button
              type="button"
              onClick={handleUpdatePermissions}
              disabled={isSubmitting || isLoadingPermissions || masterOwnerLocked || !hasPermissionChanges}
              className="rounded-2xl bg-violet-600 text-white shadow-[0_10px_20px_rgba(124,58,237,0.18)] hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? tr('Saving...', 'Enregistrement...') : tr('Save Changes', 'Enregistrer les modifications')}
            </Button>
          </div>
        </div>

        {isLoadingPermissions && hasDraftForUser ? (
          <div className="mt-4 flex items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            <p className="ml-2 text-sm font-medium text-slate-600">{tr('Loading permissions...', 'Chargement des autorisations...')}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-900">{tr('This user can:', 'Cet utilisateur peut :')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {masterOwnerLocked ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
                      {tr('Master owner locked', 'Propriétaire principal verrouillé')}
                    </span>
                  ) : null}
                  {summaryItems.length > 0 ? (
                    summaryItems.map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">{tr('No access enabled yet.', 'Aucun accès activé pour le moment.')}</span>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Role presets', 'Rôles prédéfinis')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {PERMISSION_ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleApplyPermissionPreset(user, preset.key)}
                      disabled={masterOwnerLocked}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:text-slate-700"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {masterOwnerLocked
                    ? tr('Presets are disabled for the master owner.', 'Les rôles prédéfinis sont désactivés pour le propriétaire principal.')
                    : tr('Presets fill the toggles, then you can customize manually.', 'Les rôles remplissent les accès, puis vous pouvez personnaliser.')}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{tr('Module access', 'Accès aux modules')}</h3>
                <p className="text-xs text-slate-500">{tr('Expand a module only when you need detailed permissions.', 'Dépliez un module uniquement pour les permissions détaillées.')}</p>
              </div>
              <Input
                value={permissionSearch}
                onChange={(event) => setPermissionSearch(event.target.value)}
                placeholder={tr('Search permission...', 'Rechercher une permission...')}
                className="h-10 max-w-sm rounded-2xl border-slate-200 bg-white text-sm"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredGroups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 md:col-span-2">
                  {tr('No permissions match your search.', 'Aucune permission ne correspond à votre recherche.')}
                </div>
              ) : (
                filteredGroups.map(({ module, extras, matchedExtras }) => {
                  const moduleEnabled = mergedPermissions[module] === true;
                  const cardExpanded = expandedPermissionModules.has(module) || Boolean(query && matchedExtras.length > 0);
                  const visibleExtras = query && matchedExtras.length > 0 ? matchedExtras : extras;

                  return (
                    <PermissionCard
                      key={module}
                      user={user}
                      module={module}
                      extras={extras}
                      visibleExtras={visibleExtras}
                      permissions={mergedPermissions}
                      isExpanded={cardExpanded}
                      onExpand={togglePermissionModuleDetails}
                      onModuleToggle={(moduleKey, moduleExtras, checked) => handleInlineModuleToggle(user, moduleKey, moduleExtras, checked)}
                      onPermissionToggle={(permissionKey, checked) => handleInlinePermissionToggle(user, permissionKey, checked)}
                      locked={masterOwnerLocked}
                    />
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (authLoading || !initialized) {
    return <AdminWorkspaceLoadingShell eyebrow={tr('Users & Roles', 'Utilisateurs et rôles')} title={tr('User and Role Management', 'Gestion des utilisateurs et rôles')} description={tr('Verifying credentials and workspace access...', 'Vérification des identifiants et de l’accès à l’espace...')} cardRows={1} />;
  }

  if (currentUser?.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">{tr('Access Denied', 'Accès refusé')}</h1>
        <p className="text-muted-foreground mt-2">{tr('You do not have permission to view this page. Please contact an administrator.', "Vous n'avez pas l'autorisation de voir cette page. Veuillez contacter un administrateur.")}</p>
      </div>
    );
  }
  
  if (loading && !suppressBlockingLoader) {
    return <AdminWorkspaceLoadingShell eyebrow={tr('Users & Roles', 'Utilisateurs et rôles')} title={tr('User and Role Management', 'Gestion des utilisateurs et rôles')} description={tr('Preparing user access, roles, and permission controls...', 'Préparation des accès utilisateurs, rôles et contrôles de permissions...')} cardRows={1} />;
  }

  if (activeView && activeUser) {
    return (
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <button
            type="button"
            onClick={closeDetailPage}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {tr('Back to users', 'Retour aux utilisateurs')}
          </button>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            {activeView === 'edit' ? tr('Edit User', "Modifier l'utilisateur") : activeView === 'permissions' ? `${tr('Manage Permissions', 'Gérer les permissions')} - ${activeUser.name}` : activeUser.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeUser.email}
          </p>
        </div>

        {enrichingUsers ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {tr('Refreshing user details...', 'Actualisation des détails utilisateur...')}
          </div>
        ) : null}

        {activeView === 'profile' ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                    {activeUser.role}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Email', 'Email')}</p>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-900">{activeUser.email}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Phone', 'Téléphone')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{activeUser.phone_number || tr('Not set', 'Non défini')}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Salary Paid', 'Salaire payé')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {activeUser.salary_amount !== null && activeUser.salary_amount !== undefined && activeUser.salary_amount !== ''
                          ? `${Number(activeUser.salary_amount).toLocaleString()} MAD`
                          : tr('Not set', 'Non défini')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('ID Documents', "Documents d'identité")}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {getStaffIdDocumentCount(activeUser)} {tr(getStaffIdDocumentCount(activeUser) === 1 ? 'ID file' : 'ID files', getStaffIdDocumentCount(activeUser) === 1 ? "pièce d'identité" : "pièces d'identité")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">WhatsApp</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{activeUser.whatsapp_notifications ? tr('Enabled', 'Activé') : tr('Disabled', 'Désactivé')}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Telegram</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {activeUser.telegram_alerts_allowed
                          ? tr('Allowed by admin', 'Autorisé par admin')
                          : tr('Disabled', 'Désactivé')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {countEnabledTelegramAlertEvents(activeUser.telegram_allowed_event_types)} {tr('event types allowed', "types d'alerte autorisés")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Created', 'Créé')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{activeUser.created_at ? new Date(activeUser.created_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US') : tr('Unknown', 'Inconnu')}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Updated', 'Mis à jour')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{activeUser.updated_at ? new Date(activeUser.updated_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US') : tr('Unknown', 'Inconnu')}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => openEditPage(activeUser)} className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white">
                    <Pencil className="mr-2 h-4 w-4" />
                    {tr('Edit', 'Modifier')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openLegalIdPreview(activeUser)}
                    className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <BadgeCheck className="mr-2 h-4 w-4 text-violet-600" />
                    {tr('Legal ID', 'Pièce légale')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowProfilePermissions((prev) => !prev)} className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                    {showProfilePermissions ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                    {tr('Permissions', 'Permissions')}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => openDeleteModal(activeUser)} className="rounded-2xl">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tr('Delete', 'Supprimer')}
                  </Button>
                </div>
              </div>
            </div>

            {showProfilePermissions && (
              renderPermissionWorkspace(activeUser)
            )}

            <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-violet-600" />
                <h2 className="text-lg font-semibold text-slate-900">{tr('Activity Logs', "Journaux d'activité")}</h2>
              </div>
              {isInitialActivityLoading ? (
                <div className="flex items-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="ml-2 text-sm text-slate-500">{tr('Loading activity logs...', "Chargement des journaux d'activité...")}</p>
                </div>
              ) : userActivityLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  {tr('No activity logs found yet for this user.', "Aucun journal d'activité trouvé pour cet utilisateur pour l'instant.")}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    activitySummary.hasRecentUsage
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}>
                    <p className="font-semibold">
                      {activitySummary.hasRecentUsage
                        ? tr('This user has been active on the app recently.', "Cet utilisateur a été actif récemment dans l'application.")
                        : tr('No recent app usage detected.', "Aucune utilisation récente de l'application détectée.")}
                    </p>
                    <p className="mt-1 text-xs">
                      {activitySummary.latestLog?.created_at
                        ? `${tr('Last seen', 'Dernière activité')} ${new Date(activitySummary.latestLog.created_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US')}`
                        : tr('No recorded activity yet.', "Aucune activité enregistrée pour le moment.")}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Last seen', 'Dernière activité')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {activitySummary.latestLog?.created_at
                          ? new Date(activitySummary.latestLog.created_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US')
                          : tr('Never', 'Jamais')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Last sign in', 'Dernière connexion')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {activitySummary.lastLogin?.created_at
                          ? new Date(activitySummary.lastLogin.created_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US')
                          : tr('Not recorded', 'Non enregistrée')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Recent activity', 'Activité récente')}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {activitySummary.recentUsageCount} {tr('usage events in 7 days', "événements d'utilisation en 7 jours")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {activitySummary.lastLogout?.created_at
                          ? `${tr('Last logout', 'Dernière déconnexion')}: ${new Date(activitySummary.lastLogout.created_at).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US')}`
                          : tr('No logout event recorded yet.', 'Aucune déconnexion enregistrée pour le moment.')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{tr('Showing', 'Affichage de')} {userActivityLogs.length} {tr('of', 'sur')} {activityTotal || userActivityLogs.length} {tr('activities', 'activités')}</span>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
                      {tr('Shared timeline', 'Chronologie partagée')}
                    </span>
                  </div>
                  <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                  {userActivityLogs.map((log) => (
                    <div key={log.id || `${log.user_id}-${log.created_at}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{log.action || log.event_name || log.title || tr('Activity', 'Activité')}</p>
                            {log.source && (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                                {String(log.source).replaceAll('_', ' ')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{log.description || log.details || log.message || tr('No details', 'Aucun détail')}</p>
                          {log.details && log.description !== log.details && (
                            <p className="mt-1 text-xs text-slate-500">{log.details}</p>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {log.created_at ? new Date(log.created_at).toLocaleString(isFrench ? 'fr-FR' : 'en-US') : tr('Unknown time', 'Heure inconnue')}
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                  {activityHasMore && (
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleLoadMoreActivity}
                        disabled={isLoadingUserActivity}
                        className="border-violet-200 bg-white text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                      >
                        {isLoadingUserActivity ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {tr('Loading more', 'Chargement supplémentaire')}
                          </>
                        ) : (
                          tr('Load more activity', "Charger plus d'activité")
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'edit' ? (
          <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name-page" className="text-left sm:text-right text-slate-700">{tr('Full Name', 'Nom complet')}</Label>
                <Input
                  id="edit-name-page"
                  name="name"
                  placeholder={tr('Full Name', 'Nom complet')}
                  onChange={(e) => setEditUser(p => ({...p, name: e.target.value}))}
                  value={editUser.name}
                  className="col-span-1 border-violet-100 bg-white sm:col-span-3 focus-visible:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-email-page" className="text-left sm:text-right text-slate-700">Email</Label>
                <Input
                  id="edit-email-page"
                  name="email"
                  type="email"
                  placeholder="Email"
                  onChange={(e) => setEditUser(p => ({...p, email: e.target.value}))}
                  value={editUser.email}
                  className="col-span-1 border-violet-100 bg-white sm:col-span-3 focus-visible:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-phone-page" className="text-left sm:text-right text-slate-700">{tr('Phone Number', 'Numéro de téléphone')}</Label>
                <Input
                  id="edit-phone-page"
                  name="phone_number"
                  type="tel"
                  placeholder="+212 6XX XXX XXX"
                  onChange={(e) => setEditUser(p => ({...p, phone_number: e.target.value}))}
                  value={editUser.phone_number}
                  className="col-span-1 border-violet-100 bg-white sm:col-span-3 focus-visible:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-salary-page" className="text-left sm:text-right text-slate-700">{tr('Salary Paid', 'Salaire payé')}</Label>
                <Input
                  id="edit-salary-page"
                  name="salary_amount"
                  type="number"
                  min="0"
                  placeholder={tr('Amount in MAD', 'Montant en MAD')}
                  onChange={(e) => setEditUser(p => ({...p, salary_amount: e.target.value}))}
                  value={editUser.salary_amount}
                  className="col-span-1 border-violet-100 bg-white sm:col-span-3 focus-visible:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-role-page" className="text-left sm:text-right text-slate-700">{tr('Role', 'Rôle')}</Label>
                <select
                  id="edit-role-page"
                  value={editUser.role}
                  onChange={(e) => setEditUser(p => ({...p, role: e.target.value}))}
                  disabled={selectedUser?.id === currentUser?.id}
                  className="col-span-1 h-9 rounded-md border border-violet-100 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3"
                >
                  <option value="" disabled>{tr('Select a role', 'Sélectionnez un rôle')}</option>
                  <option value="admin">{tr('Admin', 'Admin')}</option>
                  <option value="employee">{tr('Employee', 'Employé')}</option>
                  <option value="guide">{tr('Guide', 'Guide')}</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label className="text-left sm:text-right text-slate-700">WhatsApp Alerts</Label>
                <div className="col-span-1 sm:col-span-3 flex items-center space-x-2">
                  <Checkbox
                    id="edit-whatsapp-page"
                    checked={editUser.whatsapp_notifications}
                    onCheckedChange={(checked) => setEditUser(p => ({...p, whatsapp_notifications: checked}))}
                  />
                  <div>
                    <Label htmlFor="edit-whatsapp-page" className="text-sm font-normal">Enable WhatsApp notifications</Label>
                    <p className="text-xs text-gray-500 mt-0.5">Staff receives rental alerts & updates via WhatsApp</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4">
                <Label className="text-left sm:text-right text-slate-700">Telegram Alerts</Label>
                <div className="col-span-1 space-y-3 sm:col-span-3">
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="edit-telegram-enabled-page"
                      checked={editUser.telegram_alerts_allowed}
                      onCheckedChange={(checked) => setEditUser((current) => ({
                        ...current,
                        telegram_alerts_allowed: checked === true,
                        telegram_allowed_event_types: checked === true
                          ? current.telegram_allowed_event_types
                          : buildDefaultTelegramEventTypes(false),
                      }))}
                    />
                    <div>
                      <Label htmlFor="edit-telegram-enabled-page" className="text-sm font-normal">Allow this staff member to receive Telegram alerts</Label>
                      <p className="mt-0.5 text-xs text-gray-500">Staff can only opt into Telegram events that are enabled here by admin.</p>
                    </div>
                  </div>
                  <div className={`grid gap-2 rounded-2xl border p-3 ${editUser.telegram_alerts_allowed ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                    {TELEGRAM_ALERT_EVENT_OPTIONS.map((option) => (
                      <label key={option.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                        <span>{option.label}</span>
                        <Checkbox
                          checked={editUser.telegram_allowed_event_types?.[option.key] === true}
                          disabled={!editUser.telegram_alerts_allowed}
                          onCheckedChange={(checked) => setEditUser((current) => ({
                            ...current,
                            telegram_allowed_event_types: {
                              ...current.telegram_allowed_event_types,
                              [option.key]: checked === true,
                            },
                          }))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4">
                <Label className="text-left sm:text-right text-slate-700">{tr('Import ID', "Importer l'identité")}</Label>
                <div className="col-span-1 space-y-3 sm:col-span-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3 text-sm transition hover:bg-violet-50">
                    <span className="flex items-center gap-2 font-semibold text-violet-700">
                      <Upload className="h-4 w-4" />
                      {tr('Upload staff ID document', "Téléverser la pièce d'identité")}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {normalizeStaffIdDocuments(editUser.staff_id_documents).length} {tr('files', 'fichiers')}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleStaffIdDocumentUpload}
                      disabled={isSubmitting}
                    />
                  </label>
                  {normalizeStaffIdDocuments(editUser.staff_id_documents).length > 0 ? (
                    <div className="space-y-2">
                      {normalizeStaffIdDocuments(editUser.staff_id_documents).map((document, index) => {
                        const documentKey = document.id || document.url || document.storage_path || document.name || `staff-id-${index}`;
                        return (
                        <div key={documentKey} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700 hover:text-violet-700"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-violet-500" />
                            <span className="truncate">{document.name || tr('ID document', "Pièce d'identité")}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveStaffIdDocument(documentKey)}
                            className="text-left text-xs font-bold text-red-600 hover:text-red-700 sm:text-right"
                          >
                            {tr('Remove', 'Retirer')}
                          </button>
                        </div>
                      );})}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {tr('No staff ID documents uploaded yet.', "Aucune pièce d'identité du personnel importée pour le moment.")}
                    </p>
                  )}
                </div>
              </div>
              {selectedUser?.id === currentUser?.id && (
                <div className="text-sm italic text-slate-500">
                  Note: You cannot change your own role.
                </div>
              )}
              <div className="border-t border-violet-100 pt-4">
                <Label className="mb-2 block text-sm font-medium text-slate-900">Change Password (Optional)</Label>
                <p className="mb-3 text-xs text-slate-500">Leave blank to keep current password</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-password-page" className="text-left sm:text-right text-slate-700">New Password</Label>
                <div className="relative col-span-1 sm:col-span-3">
                  <Input
                    id="edit-password-page"
                    name="password"
                    type={showEditPassword ? 'text' : 'password'}
                    placeholder="New Password (min 6 chars)"
                    onChange={(e) => setEditUser(p => ({...p, password: e.target.value}))}
                    value={editUser.password}
                    className="border-violet-100 bg-white pr-20 focus-visible:ring-violet-500"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditPassword((prev) => !prev)}
                    className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-xl px-2 text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                  >
                    {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="ml-1 text-xs">{showEditPassword ? 'Hide' : 'View'}</span>
                  </Button>
                </div>
              </div>
              {editUser.password && (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-confirm-password-page" className="text-left sm:text-right text-slate-700">Confirm Password</Label>
                  <div className="relative col-span-1 sm:col-span-3">
                    <Input
                      id="edit-confirm-password-page"
                      name="confirmPassword"
                      type={showEditConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm New Password"
                      onChange={(e) => setEditUser(p => ({...p, confirmPassword: e.target.value}))}
                      value={editUser.confirmPassword}
                      className="border-violet-100 bg-white pr-20 focus-visible:ring-violet-500"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowEditConfirmPassword((prev) => !prev)}
                      className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-xl px-2 text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                    >
                      {showEditConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="ml-1 text-xs">{showEditConfirmPassword ? 'Hide' : 'View'}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-end">
              <Button variant="outline" type="button" onClick={returnToActiveUserProfile} disabled={isSubmitting} className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</Button>
              <Button type="button" onClick={handleEditUser} disabled={isSubmitting} className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] hover:from-violet-700 hover:to-indigo-800">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? tr('Saving...', 'Enregistrement...') : tr('Save Changes', 'Enregistrer les modifications')}
              </Button>
            </div>
          </div>
        ) : (
          renderPermissionWorkspace(activeUser, { standalone: true })
        )}
        {deleteConfirmationDialog}
        {legalIdPreviewOverlay}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Users className="h-8 w-8 text-white" />}
        eyebrow={tr('User & Role Management', 'Gestion des utilisateurs et rôles')}
        title={tr('User Management', 'Gestion des utilisateurs')}
        description={tr('Manage staff accounts, contact details, and permission access from one admin workspace.', 'Gérez les comptes du personnel, les coordonnées et les accès depuis un espace administrateur unique.')}
        className="w-full"
        actions={
          <Button
            onClick={() => setAddUserModalOpen(true)}
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800"
          >
            {tr('Add New User', 'Ajouter un nouvel utilisateur')}
          </Button>
        }
      />

      {enrichingUsers ? (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {tr('Refreshing user details...', 'Actualisation des détails utilisateur...')}
          </div>
        </div>
      ) : null}

      <div className="container mx-auto p-4">
      {fetchError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-semibold text-red-900">Could not load users</h2>
          <p className="mt-2 text-sm text-red-700">
            The user list could not be fetched, so this is not being treated as an empty-state.
          </p>
          <p className="mt-2 text-sm text-red-700">
            Error: {fetchError}
          </p>
          <div className="mt-4">
            <Button variant="outline" onClick={fetchUsers}>Try Again</Button>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="mt-6 text-center py-16 border-2 border-dashed rounded-lg">
          <h2 className="text-xl font-semibold">No Users Found</h2>
          <p className="text-muted-foreground mt-2">The user source loaded successfully, but there are currently no users to display.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => (
            <div
              key={user.id}
              role="button"
              tabIndex={0}
              onClick={() => openProfilePage(user)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openProfilePage(user);
                }
              }}
              className="rounded-xl border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)] cursor-pointer"
            >
              <div className="mb-5 flex items-start justify-between gap-3 border-b border-violet-100 pb-4">
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold text-slate-900">{user.name}</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    {user.phone_number ? (
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-slate-400" />
                        <span>{user.phone_number}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                  user.role === 'owner'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : user.role === 'admin'
                      ? 'bg-violet-50 text-violet-700 border border-violet-200'
                      : user.role === 'guide'
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-slate-50 text-slate-700 border border-slate-200'
                }`}>
                  {user.role}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <Shield className="h-3.5 w-3.5" />
                    {tr('Role', 'Rôle')}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{user.role}</div>
                </div>
                <div className={`rounded-xl border px-4 py-3 ${
                  user.whatsapp_notifications
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-rose-200 bg-rose-50'
                }`}>
                  <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    user.whatsapp_notifications ? 'text-emerald-500' : 'text-rose-500'
                  }`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    WhatsApp
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${
                    user.whatsapp_notifications ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {user.whatsapp_notifications ? tr('Enabled', 'Activé') : tr('Disabled', 'Désactivé')}
                  </div>
                </div>
                <div className={`rounded-xl border px-4 py-3 ${
                  user.telegram_alerts_allowed
                    ? 'border-sky-200 bg-sky-50'
                    : 'border-slate-200 bg-slate-50'
                }`}>
                  <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    user.telegram_alerts_allowed ? 'text-sky-500' : 'text-slate-400'
                  }`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Telegram
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${
                    user.telegram_alerts_allowed ? 'text-sky-700' : 'text-slate-700'
                  }`}>
                    {user.telegram_alerts_allowed ? tr('Allowed', 'Autorisé') : tr('Off', 'Off')}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {countEnabledTelegramAlertEvents(user.telegram_allowed_event_types)} {tr('event types', "types d'alerte")}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FileText className="h-3.5 w-3.5" />
                    {tr('ID Files', 'Pièces ID')}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{getStaffIdDocumentCount(user)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-xs text-violet-700">
                  <ScrollText className="h-3.5 w-3.5" />
                  {tr('Tap card to open profile', 'Touchez la carte pour ouvrir le profil')}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openLegalIdPreview(user);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <BadgeCheck className="mr-2 h-3.5 w-3.5 text-violet-600" />
                    {tr('Legal ID', 'Pièce légale')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-2xl"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteModal(user);
                    }}
                  >
                    {tr('Delete', 'Supprimer')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {legalIdPreviewOverlay}

      {/* Add User Modal */}
      <Dialog open={isAddUserModalOpen} onOpenChange={setAddUserModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('Add New User', 'Ajouter un nouvel utilisateur')}</DialogTitle>
            <DialogDescription className="sr-only">
              {tr('Dialog for adding a new user to the system', "Fenêtre d'ajout d'un nouvel utilisateur au système")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">{tr('Full Name', 'Nom complet')}</Label>
              <Input id="name" name="name" placeholder={tr('Full Name', 'Nom complet')} onChange={(e) => setNewUser(p => ({...p, name: e.target.value}))} value={newUser.name} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">{tr('Email', 'E-mail')}</Label>
              <Input id="email" name="email" type="email" placeholder={tr('Email', 'E-mail')} onChange={(e) => setNewUser(p => ({...p, email: e.target.value}))} value={newUser.email} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">{tr('Password', 'Mot de passe')}</Label>
              <Input id="password" name="password" type="password" placeholder={tr('Password', 'Mot de passe')} onChange={(e) => setNewUser(p => ({...p, password: e.target.value}))} value={newUser.password} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone_number" className="text-right">{tr('Phone Number', 'Numéro de téléphone')}</Label>
              <Input 
                id="phone_number" 
                name="phone_number" 
                type="tel" 
                placeholder="+212 6XX XXX XXX" 
                onChange={(e) => setNewUser(p => ({...p, phone_number: e.target.value}))} 
                value={newUser.phone_number} 
                className="col-span-3" 
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="salary_amount" className="text-right">{tr('Salary Paid', 'Salaire payé')}</Label>
              <Input 
                id="salary_amount" 
                name="salary_amount" 
                type="number"
                min="0"
                placeholder={tr('Amount in MAD', 'Montant en MAD')} 
                onChange={(e) => setNewUser(p => ({...p, salary_amount: e.target.value}))} 
                value={newUser.salary_amount} 
                className="col-span-3" 
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">{tr('Role', 'Rôle')}</Label>
              <select
                id="role"
                value={newUser.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="col-span-3 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>{tr('Select a role', 'Sélectionnez un rôle')}</option>
                <option value="admin">{tr('Admin', 'Admin')}</option>
                <option value="employee">{tr('Employee', 'Employé')}</option>
                <option value="guide">{tr('Guide', 'Guide')}</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{tr('WhatsApp Alerts', 'Alertes WhatsApp')}</Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Checkbox
                  id="whatsapp_notifications"
                  checked={newUser.whatsapp_notifications}
                  onCheckedChange={(checked) => setNewUser(p => ({...p, whatsapp_notifications: checked}))}
                />
                <div>
                  <Label htmlFor="whatsapp_notifications" className="text-sm font-normal">Enable WhatsApp notifications</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Staff will receive rental alerts & updates via WhatsApp on their phone number above</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right">{tr('Telegram Alerts', 'Alertes Telegram')}</Label>
              <div className="col-span-3 space-y-3">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="telegram_alerts_allowed"
                    checked={newUser.telegram_alerts_allowed}
                    onCheckedChange={(checked) => setNewUser((current) => ({
                      ...current,
                      telegram_alerts_allowed: checked === true,
                      telegram_allowed_event_types: checked === true
                        ? current.telegram_allowed_event_types
                        : buildDefaultTelegramEventTypes(false),
                    }))}
                  />
                  <div>
                    <Label htmlFor="telegram_alerts_allowed" className="text-sm font-normal">Allow Telegram alerts for this staff member</Label>
                    <p className="text-xs text-gray-500 mt-0.5">Admin decides which rental events this staff member is allowed to receive in Telegram.</p>
                  </div>
                </div>
                <div className={`grid gap-2 rounded-2xl border p-3 ${newUser.telegram_alerts_allowed ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                  {TELEGRAM_ALERT_EVENT_OPTIONS.map((option) => (
                    <label key={option.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                      <span>{option.label}</span>
                      <Checkbox
                        checked={newUser.telegram_allowed_event_types?.[option.key] === true}
                        disabled={!newUser.telegram_alerts_allowed}
                        onCheckedChange={(checked) => setNewUser((current) => ({
                          ...current,
                          telegram_allowed_event_types: {
                            ...current.telegram_allowed_event_types,
                            [option.key]: checked === true,
                          },
                        }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
             <div>
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4 mt-2">
                    <div className="col-span-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Turn on module access first, then enable the extra actions inside that module only when needed.
                    </div>
                    {PERMISSION_GROUPS.map(({ module, extras }) => {
                      const moduleEnabled = newUserPermissions[module] === true;
                      return (
                        <div key={module} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{module}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {extras.length > 0 ? 'Access plus optional advanced actions' : 'Module access'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`perm-${module}`}
                                checked={moduleEnabled}
                                onCheckedChange={(checked) => handleModuleToggle(setNewUserPermissions, module, extras, checked)}
                                disabled={newUser.role === 'owner'}
                              />
                              <Label htmlFor={`perm-${module}`} className="text-sm font-medium">Access</Label>
                            </div>
                          </div>
                          {extras.length > 0 ? (
                            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                              {extras.map((permissionKey) => (
                                <div key={permissionKey} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                  <Label htmlFor={`perm-${permissionKey}`} className="text-sm font-normal text-slate-700">
                                    {permissionKey}
                                  </Label>
                                  <Checkbox
                                    id={`perm-${permissionKey}`}
                                    checked={newUserPermissions[permissionKey] === true}
                                    onCheckedChange={(checked) => setGroupedPermissionValue(setNewUserPermissions, permissionKey, checked)}
                                    disabled={newUser.role === 'owner' || !moduleEnabled}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleAddUser} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Adding...' : 'Add User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteConfirmationDialog}
    </div>
  );
};

export default UserManagement;
