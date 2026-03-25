import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../utils/supabaseClient';

const DeleteUserModal = ({ user, isOpen, onClose, onUserDeleted }) => {
  const { user: currentUser } = useSelector(state => state.auth);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      toast.error('Please type "DELETE" to confirm');
      return;
    }

    // Prevent self-deletion
    if (user?.id === currentUser?.id || user?.email === currentUser?.email) {
      toast.error('You cannot delete your own account');
      return;
    }

    setIsDeleting(true);

    try {
      console.log('🗑️ Deleting user:', user.id);

      // Delete from Supabase Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
      
      if (authError) {
        console.error('❌ Auth user delete error:', authError);
        throw new Error(`Failed to delete user from authentication: ${authError.message}`);
      }

      // Also try to delete from custom users table
      try {
        const { error: customError } = await supabase
          .from('users')
          .delete()
          .eq('auth_user_id', user.id);
        
        if (customError) {
          console.warn('⚠️ Custom user delete failed:', customError);
        }
      } catch (customDeleteError) {
        console.warn('⚠️ Custom user table deletion failed:', customDeleteError);
      }

      console.log('✅ User deleted successfully');
      toast.success(`User ${user.full_name || user.email} has been deleted`);
      
      // Notify parent component
      onUserDeleted(user.id);
      onClose();
    } catch (error) {
      console.error('❌ User deletion failed:', error);
      toast.error(`Failed to delete user: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setConfirmText('');
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete User Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Message */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-red-800">This action cannot be undone!</h4>
                <p className="text-sm text-red-700 mt-1">
                  This will permanently delete the user account and remove all associated data.
                </p>
              </div>
            </div>
          </div>

          {/* User Details */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">User to be deleted:</h4>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Name:</span> {user.full_name || 'No name set'}</div>
              <div><span className="font-medium">Email:</span> {user.email}</div>
              <div><span className="font-medium">Role:</span> {user.role?.charAt(0)?.toUpperCase() + user.role?.slice(1)}</div>
              <div><span className="font-medium">Status:</span> {user.status}</div>
            </div>
          </div>

          {/* Confirmation Input */}
          <div className="space-y-2">
            <Label htmlFor="confirmText">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </Label>
            <Input
              id="confirmText"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE here"
              className="font-mono"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || isDeleting}
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteUserModal;