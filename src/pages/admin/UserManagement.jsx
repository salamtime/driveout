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
import { ArrowLeft, Loader2, ShieldAlert, Pencil, Users, Mail, Smartphone, Shield, MessageSquare, Eye, EyeOff } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

// STANDARDIZED MODULE NAMES - Source of Truth
const modules = [
  'Dashboard', 'Calendar', 'Tours & Bookings', 'Rental Management', 'Customer Management', 
  'Fleet Management', 'Pricing Management', 'Choose Tour Guide', 'Change Rental Price', 'Change Extension Price',
  'Quad Maintenance', 'Fuel Logs', 'Inventory', 'Finance Management', 'Alerts',
  'User & Role Management', 'System Settings', 'Project Export', 'WhatsApp Alerts'
];

const specialPermissionKeys = ['Choose Tour Guide', 'Change Rental Price', 'Change Extension Price'];

const buildPermissionState = (defaultValue = false) =>
  modules.reduce((acc, permissionKey) => ({ ...acc, [permissionKey]: defaultValue }), {});

const buildPermissionsForRole = (role) =>
  modules.reduce((acc, permissionKey) => {
    const isOwner = role === 'owner';
    if (isOwner) {
      acc[permissionKey] = true;
      return acc;
    }

    const isRestricted =
      permissionKey === 'User & Role Management' ||
      permissionKey === 'System Settings' ||
      specialPermissionKeys.includes(permissionKey);

    acc[permissionKey] = !isRestricted;
    return acc;
  }, {});

const UserManagement = () => {
  const { user: currentUser, loading: authLoading, initialized } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
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
    whatsapp_notifications: false
  });
  const [editUser, setEditUser] = useState({ 
    email: '', 
    name: '', 
    role: '', 
    password: '', 
    confirmPassword: '',
    phone_number: '',
    whatsapp_notifications: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [newUserPermissions, setNewUserPermissions] = useState(buildPermissionsForRole('employee'));
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState(null);
  const [editPermissions, setEditPermissions] = useState({});
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  const userRouteMatch = useMemo(
    () => location.pathname.match(/\/admin\/users\/([^/]+)\/(edit|permissions)$/),
    [location.pathname]
  );
  const activeUserId = userRouteMatch?.[1] ? decodeURIComponent(userRouteMatch[1]) : null;
  const activeView = userRouteMatch?.[2] || null;
  const activeUser = useMemo(
    () => users.find((user) => String(user.id) === String(activeUserId)) || null,
    [users, activeUserId]
  );

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
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }
      
      const { data: customUsersData, error: customError } = await supabase
        .from(TABLE_NAMES.USERS)
        .select('id, email, full_name, role, phone_number, whatsapp_notifications, permissions, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (customError) {
        console.error("Error fetching custom user data:", customError);
        throw customError;
      }

      let transformedUsers = [];

      try {
        const usersData = await getUsers();
        console.log(`Auth users fetched: ${usersData.length}`);

        const customUserMap = {};
        (customUsersData || []).forEach((user) => {
          customUserMap[user.id] = user;
        });

        transformedUsers = usersData.map((user) => {
          const customData = customUserMap[user.id] || {};

          return {
            ...user,
            name: customData.full_name || user.user_metadata?.full_name || user.user_metadata?.name || 'No Name',
            role: customData.role || user.user_metadata?.role || 'N/A',
            phone_number: customData.phone_number || '',
            whatsapp_notifications: customData.whatsapp_notifications || false,
            permissions: customData.permissions || {},
            created_at: customData.created_at || user.created_at,
            updated_at: customData.updated_at || user.updated_at,
          };
        });
      } catch (authListError) {
        console.warn('Auth admin user list unavailable on this host, falling back to app users table only:', authListError);

        transformedUsers = (customUsersData || []).map((user) => ({
          id: user.id,
          email: user.email,
          name: user.full_name || 'No Name',
          role: user.role || 'employee',
          phone_number: user.phone_number || '',
          whatsapp_notifications: user.whatsapp_notifications || false,
          permissions: user.permissions || {},
          created_at: user.created_at,
          updated_at: user.updated_at,
        }));
      }

      console.log("Transformed users with phone numbers:", transformedUsers);
      setUsers(transformedUsers);
    } catch (error) {
      console.error("Error in fetchUsers:", error);
      setUsers([]);
      setFetchError(error.message || 'Failed to fetch users');
      toast.error(`Failed to fetch users: ${error.message}`);
    } finally {
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
        toast.error("Only owners can add new users.");
        return;
    }

    if (!newUser.email || !newUser.password || !newUser.name) {
        console.error("Missing required fields:", { email: !!newUser.email, password: !!newUser.password, name: !!newUser.name });
        toast.error("Please fill in all fields: Full Name, Email, and Password.");
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
        const data = await addUser(newUser.email, newUser.password, newUser.name, newUser.role.toLowerCase());
        if (!data?.user) throw new Error('User creation failed - no user data returned');
        
        console.log("User created successfully:", data.user);
        console.log("User ID:", data.user.id);
        console.log("User email:", data.user.email);
        
        const assignedModules = Object.entries(newUserPermissions)
            .filter(([, hasAccess]) => hasAccess)
            .map(([moduleName]) => moduleName);

        console.log(`User ${data.user.id} created. Assigned modules:`, assignedModules);

        // Insert user data into app_users table with phone and WhatsApp preferences
        const completePermissions = {};
        modules.forEach(permissionKey => {
          completePermissions[permissionKey] = newUserPermissions[permissionKey] === true;
        });

        const upsertPayload = {
          id: data.user.id,
          email: newUser.email,
          full_name: newUser.name,
          role: newUser.role.toLowerCase(),
          access_enabled: true,
          permissions: completePermissions,
          phone_number: newUser.phone_number || null,
          whatsapp_notifications: newUser.whatsapp_notifications || false
        };

        console.log("Inserting user data into app_users table:", upsertPayload);

        // FIXED: Use supabase instead of supabase
        const { error: upsertError } = await supabase
          .from(TABLE_NAMES.USERS)
          .upsert(upsertPayload, { onConflict: 'id' });

        if (upsertError) {
          console.error("Error inserting user data:", upsertError);
          toast.warning("User created but failed to save additional data.");
        }

        // Close modal and reset form
        setAddUserModalOpen(false);
        setNewUser({ 
          email: '', 
          password: '', 
          name: '', 
          role: 'employee',
          phone_number: '',
          whatsapp_notifications: false
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
    
    setSelectedUser(user);

    // Use the phone_number already in the user object (from fetchUsers)
    setEditUser({
      email: user.email || '',
      name: user.name || '',
      role: user.role || 'employee',
      password: '',
      confirmPassword: '',
      phone_number: user.phone_number || '', // ✅ Get from user object
      whatsapp_notifications: user.whatsapp_notifications || false
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);

    navigate(`/admin/users/${encodeURIComponent(user.id)}/edit`);
  };

  const handleEditUser = async () => {
    console.log("=== handleEditUser START ===");
    
    if (currentUser.role !== 'owner') {
        console.error("User is not owner. Current role:", currentUser.role);
        toast.error("Only owners can edit users.");
        return;
    }

    // Validation
    if (!editUser.email || !editUser.name || !editUser.role) {
        toast.error("Please fill in all required fields: Full Name, Email, and Role.");
        return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editUser.email)) {
        toast.error("Please enter a valid email address.");
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
            whatsapp_notifications: editUser.whatsapp_notifications
        });

        const updates = {
            email: editUser.email,
            name: editUser.name,
            role: editUser.role.toLowerCase()
        };

        // Only include password if provided
        if (editUser.password && editUser.password.trim() !== '') {
            updates.password = editUser.password;
        }

        await updateUserProfile(selectedUser.id, updates);

        // Update phone number and WhatsApp notifications in app_users table USING supabase
        const { error: updateError } = await supabase
          .from(TABLE_NAMES.USERS)
          .update({
            email: editUser.email,
            full_name: editUser.name,
            role: editUser.role.toLowerCase(),
            phone_number: editUser.phone_number || null,
            whatsapp_notifications: editUser.whatsapp_notifications || false,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedUser.id);

        if (updateError) {
          console.error("Error updating user additional data:", updateError);
          toast.warning("User updated but failed to save phone/WhatsApp preferences.");
        }
        
        // Close page editor and reset form
        setEditUser({ 
          email: '', 
          name: '', 
          role: '', 
          password: '', 
          confirmPassword: '',
          phone_number: '',
          whatsapp_notifications: false
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

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || !supabase) return;
    
    console.log("=== handleDeleteUser START ===");
    console.log("Deleting user:", selectedUser.id);
    
    try {
      await deleteUser(selectedUser.id);
      
      // Clean up the custom table USING supabase
      const { error: deleteError } = await supabase
        .from(TABLE_NAMES.USERS)
        .delete()
        .eq('id', selectedUser.id);
      
      if (deleteError) {
        console.error("Error deleting user from custom table:", deleteError);
        toast.warning("User deleted from auth but not from custom table.");
      }
      
      setDeleteModalOpen(false);
      await fetchUsers();
      toast.success('User deleted successfully!');
      console.log("=== handleDeleteUser SUCCESS ===");
    } catch (error) {
      console.error("=== handleDeleteUser ERROR ===");
      console.error("Error:", error);
      toast.error(`Error deleting user: ${error.message}`);
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
        const defaultPermissions = buildPermissionState(false);
        setEditPermissions(defaultPermissions);
        return;
      }
      
      // The 'Merge' Strategy: Merge database permissions with master modules list
      // Missing keys are treated as false, not true
      const dbPermissions = data?.permissions || {};
      const merged = {};
      modules.forEach(m => {
        merged[m] = dbPermissions[m] === true; // Explicitly check for true
      });
      
      console.log("Merged permissions:", merged);
      setEditPermissions(merged);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error(`Failed to load permissions: ${error.message}`);
      // State Management: Default to all FALSE if error
      const defaultPermissions = buildPermissionState(false);
      setEditPermissions(defaultPermissions);
    } finally {
      setIsLoadingPermissions(false);
      console.log("=== loadPermissionsForUser END ===");
    }
  };

  const openPermissionsPage = async (user) => {
    navigate(`/admin/users/${encodeURIComponent(user.id)}/permissions`);
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUserForPermissions) return;
    
    console.log("=== handleUpdatePermissions START ===");
    console.log("Selected user ID:", selectedUserForPermissions.id);
    console.log("Current editPermissions (raw):", editPermissions);
    
    setIsSubmitting(true);
    
    try {
      // DATA SAFETY: Ensure permissions are saved as JSON Object (not array)
      // Explicit False Values: Ensure all modules are included with explicit true/false
      const completePermissions = {};
        modules.forEach(permissionKey => {
          completePermissions[permissionKey] = editPermissions[permissionKey] === true;
        });
      
      console.log("✅ Complete permissions to save (JSON Object):", completePermissions);
      console.log("✅ Permissions type check:", typeof completePermissions);
      console.log("✅ Is Array?", Array.isArray(completePermissions));
      console.log("✅ Is Object?", completePermissions !== null && typeof completePermissions === 'object' && !Array.isArray(completePermissions));
      
      // Fetch current phone_number and whatsapp_notifications to preserve them
      // FIXED: Use supabase instead of supabase
      const { data: currentData } = await supabase
        .from(TABLE_NAMES.USERS)
        .select('phone_number, whatsapp_notifications')
        .eq('id', selectedUserForPermissions.id)
        .maybeSingle();

      // DEBUG: Log the exact payload before upsert
      const upsertPayload = {
        id: selectedUserForPermissions.id,
        email: selectedUserForPermissions.email,
        full_name: selectedUserForPermissions.name,
        role: selectedUserForPermissions.role,
        access_enabled: true,
        permissions: completePermissions,
        phone_number: currentData?.phone_number || null,
        whatsapp_notifications: currentData?.whatsapp_notifications || false
      };
      
      console.log("🔍 UPSERT PAYLOAD (before database call):");
      console.log("   - user_id:", upsertPayload.id);
      console.log("   - email:", upsertPayload.email);
      console.log("   - full_name:", upsertPayload.full_name);
      console.log("   - role:", upsertPayload.role);
      console.log("   - permissions:", JSON.stringify(upsertPayload.permissions, null, 2));
      console.log("   - phone_number:", upsertPayload.phone_number);
      console.log("   - whatsapp_notifications:", upsertPayload.whatsapp_notifications);
      
      // The Upsert Strategy: Use upsert instead of update
      // FIXED: Use supabase instead of supabase
      const { error } = await supabase
        .from(TABLE_NAMES.USERS)
        .upsert(upsertPayload, { onConflict: 'id' });
      
      console.log("Upsert permissions response - error:", error);
      
      if (error) throw error;
      
      setSelectedUserForPermissions(null);
      navigate('/admin/users');
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

    setSelectedUser(activeUser);
    setEditUser({
      email: activeUser.email || '',
      name: activeUser.name || '',
      role: activeUser.role || 'employee',
      password: '',
      confirmPassword: '',
      phone_number: activeUser.phone_number || '',
      whatsapp_notifications: activeUser.whatsapp_notifications || false
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
  }, [activeUser, activeView]);

  useEffect(() => {
    if (!activeUser || activeView !== 'permissions') return;
    loadPermissionsForUser(activeUser);
  }, [activeUser, activeView]);

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
      whatsapp_notifications: false
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
    navigate('/admin/users');
  };

  if (authLoading || !initialized) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Verifying credentials...</p>
      </div>
    );
  }

  if (currentUser?.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground mt-2">You do not have permission to view this page. Please contact an administrator.</p>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading users...</p>
      </div>
    );
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
            Back to users
          </button>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            {activeView === 'edit' ? 'Edit User' : `Manage Permissions - ${activeUser.name}`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeUser.email}
          </p>
        </div>

        {activeView === 'edit' ? (
          <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name-page" className="text-left sm:text-right text-slate-700">Full Name</Label>
                <Input
                  id="edit-name-page"
                  name="name"
                  placeholder="Full Name"
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
                <Label htmlFor="edit-phone-page" className="text-left sm:text-right text-slate-700">Phone Number</Label>
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
                <Label htmlFor="edit-role-page" className="text-left sm:text-right text-slate-700">Role</Label>
                <select
                  id="edit-role-page"
                  value={editUser.role}
                  onChange={(e) => setEditUser(p => ({...p, role: e.target.value}))}
                  disabled={selectedUser?.id === currentUser?.id}
                  className="col-span-1 h-9 rounded-md border border-violet-100 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3"
                >
                  <option value="" disabled>Select a role</option>
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                  <option value="guide">Guide</option>
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
              <Button variant="outline" type="button" onClick={closeDetailPage} disabled={isSubmitting} className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</Button>
              <Button type="button" onClick={handleEditUser} disabled={isSubmitting} className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] hover:from-violet-700 hover:to-indigo-800">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            {isLoadingPermissions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Loading permissions...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Label className="text-sm font-medium text-slate-900">Permissions</Label>
                <div className="mt-2 grid grid-cols-1 gap-4 rounded-xl border border-violet-100 bg-slate-50/70 p-4 md:grid-cols-2">
                  {modules.map((permissionKey) => (
                    <div key={permissionKey} className="flex items-center space-x-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <Checkbox
                        id={`page-edit-perm-${permissionKey}`}
                        checked={editPermissions[permissionKey] === true}
                        onCheckedChange={(checked) => handleEditPermissionChange(permissionKey, checked)}
                      />
                      <Label htmlFor={`page-edit-perm-${permissionKey}`} className="text-sm font-normal text-slate-700">{permissionKey}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-end">
              <Button variant="outline" type="button" onClick={closeDetailPage} disabled={isSubmitting} className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Cancel</Button>
              <Button type="button" onClick={handleUpdatePermissions} disabled={isSubmitting || isLoadingPermissions} className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] hover:from-violet-700 hover:to-indigo-800">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <AdminModuleHero
        icon={<Users className="h-8 w-8 text-white" />}
        eyebrow="User & Role Management"
        title="User Management"
        description="Manage staff accounts, contact details, and permission access from one admin workspace."
        actions={
          <Button
            onClick={() => setAddUserModalOpen(true)}
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800"
          >
            Add New User
          </Button>
        }
      />

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
              className="rounded-xl border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)]"
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
                    Role
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
                    {user.whatsapp_notifications ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl border-violet-100 bg-white text-violet-700 hover:bg-violet-50"
                  onClick={() => openEditPage(user)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => openPermissionsPage(user)}
                >
                  Permissions
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => openDeleteModal(user)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      <Dialog open={isAddUserModalOpen} onOpenChange={setAddUserModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription className="sr-only">
              Dialog for adding a new user to the system
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Full Name</Label>
              <Input id="name" name="name" placeholder="Full Name" onChange={(e) => setNewUser(p => ({...p, name: e.target.value}))} value={newUser.name} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input id="email" name="email" type="email" placeholder="Email" onChange={(e) => setNewUser(p => ({...p, email: e.target.value}))} value={newUser.email} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input id="password" name="password" type="password" placeholder="Password" onChange={(e) => setNewUser(p => ({...p, password: e.target.value}))} value={newUser.password} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone_number" className="text-right">Phone Number</Label>
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
              <Label htmlFor="role" className="text-right">Role</Label>
              <select
                id="role"
                value={newUser.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="col-span-3 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>Select a role</option>
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
                <option value="guide">Guide</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">WhatsApp Alerts</Label>
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
             <div>
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4 mt-2">
                    {modules.map((permissionKey) => (
                        <div key={permissionKey} className="flex items-center space-x-2">
                            <Checkbox
                                id={`perm-${permissionKey}`}
                                checked={newUserPermissions[permissionKey]}
                                onCheckedChange={(checked) => handlePermissionChange(permissionKey, checked)}
                                disabled={newUser.role === 'owner'}
                            />
                            <Label htmlFor={`perm-${permissionKey}`} className="text-sm font-normal">{permissionKey}</Label>
                        </div>
                    ))}
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

      {/* Delete Confirmation Modal */}
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
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
