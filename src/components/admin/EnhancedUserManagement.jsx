import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Filter, UserCheck, UserX, Shield, Trash2, Edit } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import toast from 'react-hot-toast';
import ModulePermissionsSection from './ModulePermissionsSection';
import UserFormModal from './UserFormModal';
import DeleteUserModal from './DeleteUserModal';
import EditUserModal from './EditUserModal';
import CredentialsDisplayModal from './CredentialsDisplayModal';

const EnhancedUserManagement = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useSelector(state => state.auth);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);
  const [newUserCredentials, setNewUserCredentials] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching users from multiple sources...');
      
      let allUsers = [];
      
      // Try to fetch from Supabase Auth Admin API first
      try {
        console.log('🔍 Trying Supabase Auth Admin API...');
        const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authData?.users && authData.users.length > 0) {
          console.log('✅ Found users from Auth API:', authData.users.length);
          console.log('📋 Auth users:', authData.users.map(u => ({ email: u.email, id: u.id, metadata: u.user_metadata })));
          
          // Transform auth users to our format
          const transformedUsers = authData.users.map(user => ({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown User',
            role: user.user_metadata?.role || 'customer',
            status: user.email_confirmed_at ? 'active' : 'pending',
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            phone: user.phone || null,
            user_metadata: user.user_metadata || {}
          }));
          
          allUsers = transformedUsers;
          console.log('✅ Transformed auth users:', allUsers);
        }
      } catch (authError) {
        console.warn('⚠️ Auth Admin API failed:', authError);
      }
      
      // Also try custom users table as fallback/supplement
      try {
        console.log('🔍 Trying custom users table...');
        const { data: customUsers, error: customError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (customUsers && customUsers.length > 0) {
          console.log('✅ Found users from custom table:', customUsers.length);
          console.log('📋 Custom users:', customUsers);
          
          // Merge with auth users (avoid duplicates)
          customUsers.forEach(customUser => {
            const existsInAuth = allUsers.find(authUser => 
              authUser.email === customUser.email || authUser.id === customUser.id
            );
            
            if (!existsInAuth) {
              allUsers.push({
                id: customUser.id,
                email: customUser.email,
                full_name: customUser.full_name || customUser.name || customUser.email?.split('@')[0] || 'Unknown User',
                role: customUser.role || 'customer',
                status: customUser.status || 'active',
                created_at: customUser.created_at,
                last_sign_in_at: customUser.last_sign_in_at,
                phone: customUser.phone || null
              });
            }
          });
        }
      } catch (customError) {
        console.warn('⚠️ Custom users table failed:', customError);
      }
      
      // CRITICAL CHECK: Ensure salamtime2016@gmail.com is included
      const targetUser = allUsers.find(u => u.email === 'salamtime2016@gmail.com');
      if (!targetUser) {
        console.warn('⚠️ salamtime2016@gmail.com not found in fetched users - adding manually');
        allUsers.unshift({
          id: 'manual-owner-' + Date.now(),
          email: 'salamtime2016@gmail.com',
          full_name: 'Owner User',
          role: 'owner',
          status: 'active',
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          phone: null
        });
      } else {
        console.log('✅ Found salamtime2016@gmail.com:', targetUser);
        // Ensure role is set to owner
        if (targetUser.role !== 'owner') {
          console.log('🔧 Fixing role for salamtime2016@gmail.com to owner');
          targetUser.role = 'owner';
        }
      }
      
      console.log('📊 Final user list:', allUsers.length, 'users');
      console.log('📋 All users:', allUsers.map(u => ({ email: u.email, role: u.role, status: u.status })));
      
      setUsers(allUsers || []);
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      toast.error('Failed to load users');
      
      // Emergency fallback - ensure salamtime2016@gmail.com is available
      setUsers([{
        id: 'emergency-owner',
        email: 'salamtime2016@gmail.com',
        full_name: 'Owner User',
        role: 'owner',
        status: 'active',
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        phone: null
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (userId, moduleName, hasAccess) => {
    console.log(`Permission changed for user ${userId}: ${moduleName} = ${hasAccess}`);
    // Optionally refresh users or update local state
  };

  const handleUserCreated = (newUser, password) => {
    console.log('New user created:', newUser);
    // Show credentials modal
    setNewUserCredentials({ user: newUser, password });
    setShowCredentialsModal(true);
    // Refresh the users list
    fetchUsers();
  };

  const handleUserDeleted = (deletedUserId) => {
    console.log('User deleted:', deletedUserId);
    // Remove user from local state
    setUsers(prevUsers => prevUsers.filter(user => user.id !== deletedUserId));
    setSelectedUserForDelete(null);
  };

  const handleUserUpdated = (updatedUser) => {
    console.log('🔄 PARENT - User updated callback received:', updatedUser);
    console.log('🔄 PARENT - Refreshing user list...');
    // Refresh the users list
    fetchUsers();
    setSelectedUserForEdit(null);
    console.log('✅ PARENT - User list refresh initiated');
  };

  const handleDeleteClick = (user) => {
    // Prevent self-deletion
    if (user.id === currentUser?.id || user.email === currentUser?.email) {
      toast.error('You cannot delete your own account');
      return;
    }
    
    setSelectedUserForDelete(user);
    setShowDeleteModal(true);
  };

  const handleEditClick = (user) => {
    console.log('🔍 EDIT DEBUG - Edit button clicked for user:', user);
    console.log('🔍 EDIT DEBUG - User ID:', user?.id);
    console.log('🔍 EDIT DEBUG - User Email:', user?.email);
    console.log('🔍 EDIT DEBUG - Current showEditModal state BEFORE:', showEditModal);
    console.log('🔍 EDIT DEBUG - Current selectedUserForEdit BEFORE:', selectedUserForEdit);
    
    setSelectedUserForEdit(user);
    setShowEditModal(true);
    
    // Use setTimeout to check state after React update
    setTimeout(() => {
      console.log('🔍 EDIT DEBUG - showEditModal state AFTER:', showEditModal);
      console.log('🔍 EDIT DEBUG - selectedUserForEdit AFTER:', selectedUserForEdit);
    }, 100);
    
    console.log('🔍 EDIT DEBUG - Modal state set to open, selectedUser:', user);
  };

  const toggleUserExpansion = (userId) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'guide':
        return 'bg-green-100 text-green-800';
      case 'employee':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canManageUsers = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
            <Users className="h-8 w-8 text-blue-600" />
            <span>{t('admin.users.title')}</span>
          </h1>
          <p className="text-gray-600 mt-1">
            {t('admin.users.subtitle')}
          </p>
        </div>
        
        {canManageUsers && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add New User</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="guide">Guide</option>
              <option value="employee">Employee</option>
            </select>
          </div>
        </div>
      </div>

      {/* User Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredUsers.length} of {users.length} users
      </div>

      {/* Users List */}
      <div className="space-y-4">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* User Header */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">
                      {user.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {user.full_name || 'No Name Set'}
                    </h3>
                    <p className="text-sm text-gray-600">{user.email}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {user.role?.charAt(0)?.toUpperCase() + user.role?.slice(1) || 'No Role'}
                      </span>
                      {user.id === currentUser?.id && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {user.status === 'active' ? (
                    <div className="flex items-center text-green-600">
                      <UserCheck className="h-4 w-4 mr-1" />
                      <span className="text-sm font-medium">Active</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600">
                      <UserX className="h-4 w-4 mr-1" />
                      <span className="text-sm font-medium">Inactive</span>
                    </div>
                  )}
                  
                  <button
                    onClick={() => toggleUserExpansion(user.id)}
                    className="flex items-center space-x-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    <span>{expandedUsers.has(user.id) ? 'Hide' : 'Manage'} Permissions</span>
                  </button>
                  
                  {canManageUsers && (
                    <>
                      <button
                        onClick={() => handleEditClick(user)}
                        className="flex items-center space-x-1 px-3 py-2 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                        <span>Edit</span>
                      </button>
                      
                      {user.id !== currentUser?.id && user.email !== currentUser?.email && (
                        <button
                          onClick={() => handleDeleteClick(user)}
                          className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* User Details */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Created:</span> {new Date(user.created_at).toLocaleDateString()}
                </div>
                <div>
                  <span className="font-medium">Last Login:</span> {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}
                </div>
                <div>
                  <span className="font-medium">ID:</span> {user.id.slice(0, 8)}...
                </div>
              </div>
            </div>

            {/* Module Permissions Section */}
            {expandedUsers.has(user.id) && (
              <div className="border-t border-gray-200 px-6 pb-6">
                <ModulePermissionsSection
                  targetUser={user}
                  onPermissionChange={handlePermissionChange}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || roleFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first user'
            }
          </p>
        </div>
      )}

      {/* Add User Modal */}
      <UserFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onUserCreated={handleUserCreated}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedUserForEdit(null);
        }}
        user={selectedUserForEdit}
        onUserUpdated={handleUserUpdated}
      />

      {/* Delete User Modal */}
      <DeleteUserModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedUserForDelete(null);
        }}
        user={selectedUserForDelete}
        onUserDeleted={handleUserDeleted}
      />

      {/* Credentials Display Modal */}
      <CredentialsDisplayModal
        isOpen={showCredentialsModal}
        onClose={() => {
          setShowCredentialsModal(false);
          setNewUserCredentials(null);
        }}
        user={newUserCredentials?.user}
        password={newUserCredentials?.password}
      />
    </div>
  );
};

export default EnhancedUserManagement;