import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { getUserPermissions, updateUserPermission } from '../../services/UserService';
import { toast } from 'react-hot-toast';

const ModulePermissionsModal = ({ open, handleClose, user }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user?.id || !user.user_metadata?.role) {
      if(open) toast.error("User data is incomplete.");
      return;
    }
    setLoading(true);
    try {
      const perms = await getUserPermissions(user.id, user.user_metadata.role);
      setPermissions(perms);
    } catch (error) {
      console.error("Failed to fetch permissions", error);
      toast.error("Failed to load permissions.");
    } finally {
      setLoading(false);
    }
  }, [user, open]);

  useEffect(() => {
    if (open) {
      fetchPermissions();
    }
  }, [open, fetchPermissions]);

  const handleToggle = async (moduleName, currentAccess) => {
    const isOwner = user.user_metadata?.role === 'owner';
    if (isOwner) return;

    const newAccess = !currentAccess;
    const originalPermissions = [...permissions];
    
    // Optimistic update
    setPermissions(prev => prev.map(p => p.module_name === moduleName ? { ...p, has_access: newAccess } : p));

    try {
      await updateUserPermission(user.id, moduleName, newAccess);
      toast.success(`Permission for '${moduleName}' updated.`);
    } catch (error) {
      console.error("Failed to update permission", error);
      toast.error(`Failed to update permission for '${moduleName}'.`);
      // Revert on error
      setPermissions(originalPermissions);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Permissions for {user?.user_metadata?.full_name || 'user'}</DialogTitle>
          <DialogDescription>
            Manage module access for this user.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3 py-4 max-h-96 overflow-y-auto pr-3">
            {permissions.length > 0 ? permissions.map(({ module_name, has_access }) => (
              <div key={module_name} className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <Label htmlFor={`switch-${module_name}`} className="font-medium">
                  {module_name}
                </Label>
                <Switch
                  id={`switch-${module_name}`}
                  checked={has_access}
                  onCheckedChange={() => handleToggle(module_name, has_access)}
                  disabled={user.user_metadata?.role === 'owner'}
                />
              </div>
            )) : <p className="text-center text-gray-500">No modules found for this user's role.</p>}
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleClose} variant="outline">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModulePermissionsModal;