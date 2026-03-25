import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
// Note: Select component not available, using native select
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { AlertCircle, Copy, Eye, EyeOff, RefreshCw, Shield, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateUser } from '../../store/slices/usersSlice';
import { supabase } from '../../utils/supabaseClient';

const MODULES = [
  { id: 'dashboard', name: 'Dashboard', description: 'Main dashboard overview' },
  { id: 'calendar', name: 'Calendar', description: 'Calendar and scheduling' },
  { id: 'tours_booking', name: 'Tours & Booking', description: 'Tour booking interface' },
  { id: 'booking_management', name: 'Booking Management', description: 'Manage all bookings' },
  { id: 'rental_management', name: 'Rental Management', description: 'Rental operations' },
  { id: 'fleet_management', name: 'Fleet Management', description: 'Vehicle fleet management' },
  { id: 'quad_maintenance', name: 'Quad Maintenance', description: 'Maintenance tracking' },
  { id: 'fuel_logs', name: 'Fuel Logs', description: 'Fuel usage tracking' },
  { id: 'inventory', name: 'Inventory', description: 'Inventory management' },
  { id: 'finance_management', name: 'Finance Management', description: 'Financial operations' },
  { id: 'user_role_management', name: 'User & Role Management', description: 'User administration' },
  { id: 'system_settings', name: 'System Settings', description: 'System configuration' }
];

const ROLES = ['customer', 'guide', 'employee', 'admin', 'owner'];

const generateSecurePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const getPasswordStrength = (password) => {
  if (!password) return { strength: 'none', score: 0 };
  
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  
  if (score <= 2) return { strength: 'weak', score };
  if (score <= 4) return { strength: 'medium', score };
  return { strength: 'strong', score };
};

const EditUserModal = ({ user, isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { user: currentUser } = useSelector(state => state.auth);
  const { loading } = useSelector(state => state.users);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'customer',
    status: 'active'
  });
  
  const [passwordData, setPasswordData] = useState({
    password: '',
    confirmPassword: '',
    showPassword: false
  });
  
  const [permissions, setPermissions] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  useEffect(() => {
    console.log('🔄 EDIT MODAL - User data changed:', user);
    if (user) {
      console.log('🔄 EDIT MODAL - Setting form data from user:', {
        full_name: user.full_name,
        email: user.email,
        role: user.role || user.raw_user_meta_data?.role,
        status: user.status
      });
      
      setFormData({
        full_name: user.full_name || user.raw_user_meta_data?.full_name || '',
        email: user.email || '',
        role: user.role || user.raw_user_meta_data?.role || 'customer',
        status: user.status || 'active'
      });
      
      // Extract permissions from metadata
      const userPermissions = user.raw_user_meta_data?.permissions || {};
      const permissionMap = {};
      MODULES.forEach(module => {
        permissionMap[module.id] = userPermissions[module.id] || false;
      });
      
      console.log('🔄 EDIT MODAL - Setting permissions:', permissionMap);
      setPermissions(permissionMap);
      
      // Reset password fields
      setPasswordData({
        password: '',
        confirmPassword: '',
        showPassword: false
      });
      setShowPasswordSection(false);
      
      console.log('✅ EDIT MODAL - Form data initialized successfully');
    }
  }, [user]);

  const canEditRole = (targetRole) => {
    if (currentUser?.role === 'owner') return true;
    if (currentUser?.role === 'admin' && targetRole !== 'owner') return true;
    return false;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePasswordChange = (field, value) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePermissionToggle = async (moduleId) => {
    const newPermissions = {
      ...permissions,
      [moduleId]: !permissions[moduleId]
    };
    setPermissions(newPermissions);

    // Save immediately to Supabase
    try {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.raw_user_meta_data,
          permissions: newPermissions
        }
      });

      if (error) throw error;
      
      toast.success(`Permission ${permissions[moduleId] ? 'removed' : 'granted'} for ${MODULES.find(m => m.id === moduleId)?.name}`);
    } catch (error) {
      console.error('Permission update failed:', error);
      // Revert on error
      setPermissions(permissions);
      toast.error('Failed to update permissions');
    }
  };

  const generatePassword = () => {
    const newPassword = generateSecurePassword();
    setPasswordData(prev => ({
      ...prev,
      password: newPassword,
      confirmPassword: newPassword
    }));
    toast.success('Secure password generated');
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('🔄 EDIT MODAL - Form submission started');
    console.log('🔄 EDIT MODAL - Form data:', formData);
    console.log('🔄 EDIT MODAL - Permissions:', permissions);
    console.log('🔄 EDIT MODAL - User ID:', user.id);
    
    if (showPasswordSection && passwordData.password) {
      if (passwordData.password !== passwordData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      
      const strength = getPasswordStrength(passwordData.password);
      if (strength.strength === 'weak') {
        toast.error('Password is too weak. Please use a stronger password.');
        return;
      }
    }

    setIsUpdating(true);
    
    try {
      console.log('🔄 SUPABASE - Starting user update...');
      
      // First, update Auth user metadata
      const authUpdateData = {
        user_metadata: {
          full_name: formData.full_name,
          role: formData.role,
          permissions: permissions
        }
      };

      // Add password if provided
      if (showPasswordSection && passwordData.password) {
        authUpdateData.password = passwordData.password;
        console.log('🔄 SUPABASE - Password update included');
      }

      console.log('🔄 SUPABASE - Auth update data:', authUpdateData);
      const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(user.id, authUpdateData);
      
      if (authError) {
        console.error('❌ SUPABASE - Auth update failed:', authError);
        throw authError;
      }
      
      console.log('✅ SUPABASE - Auth update successful:', authData);

      // Also try to update in users table if it exists
      try {
        console.log('🔄 SUPABASE - Attempting users table update...');
        const { data: tableData, error: tableError } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            status: formData.status,
            updated_at: new Date().toISOString(),
            raw_user_meta_data: {
              full_name: formData.full_name,
              role: formData.role,
              permissions: permissions
            }
          })
          .eq('id', user.id)
          .select();

        if (tableError) {
          console.warn('⚠️ SUPABASE - Users table update failed (table may not exist):', tableError);
        } else {
          console.log('✅ SUPABASE - Users table update successful:', tableData);
        }
      } catch (tableUpdateError) {
        console.warn('⚠️ SUPABASE - Users table update failed:', tableUpdateError);
      }

      // Update Redux store with the new data
      const updatedUser = {
        id: user.id,
        ...formData,
        raw_user_meta_data: {
          ...user.raw_user_meta_data,
          full_name: formData.full_name,
          role: formData.role,
          permissions: permissions
        },
        updated_at: new Date().toISOString()
      };

      console.log('🔄 REDUX - Updating store with:', updatedUser);
      dispatch(updateUser(updatedUser));

      // Call parent component update handler if provided
      if (typeof onClose === 'function') {
        console.log('🔄 PARENT - Calling onClose callback');
      }

      console.log('✅ USER UPDATE - Complete success!');
      toast.success('User updated successfully');
      onClose();
    } catch (error) {
      console.error('❌ USER UPDATE - Failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      toast.error(`Update failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
      console.log('🔄 USER UPDATE - Process finished');
    }
  };

  const passwordStrength = getPasswordStrength(passwordData.password);
  const isCurrentUser = currentUser?.id === user?.id;

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Edit User: {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                placeholder="Enter full name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">Email cannot be changed</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                value={formData.role}
                onChange={(e) => handleInputChange('role', e.target.value)}
                disabled={!canEditRole(formData.role)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ROLES.map(role => (
                  <option 
                    key={role} 
                    value={role}
                    disabled={role === 'owner' && currentUser?.role !== 'owner'}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* User Details */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">User Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">ID:</span>
                <span className="ml-2 font-mono">{user.id.substring(0, 8)}...</span>
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  onClick={() => copyToClipboard(user.id, 'User ID')}
                  className="ml-1 h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-2">{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-gray-500">Last Login:</span>
                <span className="ml-2">
                  {user.last_sign_in_at 
                    ? new Date(user.last_sign_in_at).toLocaleDateString()
                    : 'Never'
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Password Reset Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Password Reset</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
              >
                {showPasswordSection ? 'Cancel Reset' : 'Reset Password'}
              </Button>
            </div>
            
            {showPasswordSection && (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={passwordData.showPassword ? "text" : "password"}
                        value={passwordData.password}
                        onChange={(e) => handlePasswordChange('password', e.target.value)}
                        placeholder="Enter new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => handlePasswordChange('showPassword', !passwordData.showPassword)}
                      >
                        {passwordData.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    
                    {passwordData.password && (
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-full rounded-full ${
                          passwordStrength.strength === 'weak' ? 'bg-red-200' :
                          passwordStrength.strength === 'medium' ? 'bg-yellow-200' : 'bg-green-200'
                        }`}>
                          <div className={`h-full rounded-full transition-all ${
                            passwordStrength.strength === 'weak' ? 'bg-red-500 w-1/3' :
                            passwordStrength.strength === 'medium' ? 'bg-yellow-500 w-2/3' : 'bg-green-500 w-full'
                          }`} />
                        </div>
                        <Badge variant={
                          passwordStrength.strength === 'weak' ? 'destructive' :
                          passwordStrength.strength === 'medium' ? 'secondary' : 'default'
                        }>
                          {passwordStrength.strength}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                      placeholder="Confirm new password"
                    />
                    {passwordData.confirmPassword && passwordData.password !== passwordData.confirmPassword && (
                      <p className="text-xs text-red-500">Passwords do not match</p>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generatePassword}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate Secure Password
                  </Button>
                  
                  {passwordData.password && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyToClipboard(passwordData.password, 'Password')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Password
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Module Permissions */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Module Permissions</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MODULES.map(module => (
                <div key={module.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{module.name}</div>
                    <div className="text-xs text-gray-500">{module.description}</div>
                  </div>
                  <Switch
                    checked={permissions[module.id] || false}
                    onCheckedChange={() => handlePermissionToggle(module.id)}
                    disabled={isCurrentUser && module.id === 'user_role_management'}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdating || loading}>
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserModal;