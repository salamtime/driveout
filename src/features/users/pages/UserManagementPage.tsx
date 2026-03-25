import { useState, useCallback, useEffect, useMemo } from 'react';
import UserList from '../components/UserList';
import { User } from '../types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import AddUserDrawer from '../components/AddUserDrawer';
import EditUserDrawer from '../components/EditUserDrawer';
import PermissionEditorModal from '../components/PermissionEditorModal';
import { userService } from '../services/userService';
import { ArrowUpDown } from 'lucide-react';

type SortKey = 'full_name' | 'email' | 'role';

const UserManagementPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [isAddDrawerOpen, setAddDrawerOpen] = useState(false);
  const [isEditDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isPermissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>({ key: 'full_name', direction: 'ascending' });

  const fetchUsers = useCallback(async () => {
    try {
      const userList = await userService.getUsers();
      setUsers(userList);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDataChange = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditDrawerOpen(true);
  };

  const handlePermissions = (user: User) => {
    setSelectedUser(user);
    setPermissionsModalOpen(true);
  };

  const handleDelete = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await userService.deleteUser(userId);
        handleDataChange();
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const filteredUsers = useMemo(() => {
    return users
      .filter(user =>
        (user.full_name?.toLowerCase() || 'n/a').includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .filter(user => roleFilter === 'all' || user.role === roleFilter);
  }, [users, searchTerm, roleFilter]);

  const sortedUsers = useMemo(() => {
    let sortableUsers = [...filteredUsers];
    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key] ?? '';
        const bValue = b[sortConfig.key] ?? '';
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
  }, [filteredUsers, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortConfig.direction === 'ascending' ? <span className="ml-2">🔼</span> : <span className="ml-2">🔽</span>;
  };

  const roles = ['all', 'owner', 'admin', 'staff', 'guide', 'employee', 'customer'];

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>User Management</CardTitle>
            <Button onClick={() => setAddDrawerOpen(true)}>Add New User</Button>
          </div>
          <div className="flex items-center space-x-2 pt-4">
            <Input
              placeholder="Filter by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </Trigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-500 mb-4">Error: {error}</div>}
          <UserList 
            users={sortedUsers} 
            onEdit={handleEdit} 
            onPermissions={handlePermissions} 
            onDelete={handleDelete} 
          />
        </CardContent>
      </Card>

      <AddUserDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        onUserAdded={handleDataChange}
      />
      
      {selectedUser && (
        <EditUserDrawer
          isOpen={isEditDrawerOpen}
          onClose={() => setEditDrawerOpen(false)}
          user={selectedUser}
          onUserUpdated={handleDataChange}
        />
      )}

      {selectedUser && (
        <PermissionEditorModal
          isOpen={isPermissionsModalOpen}
          onClose={() => setPermissionsModalOpen(false)}
          user={selectedUser}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
