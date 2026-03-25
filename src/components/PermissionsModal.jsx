import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Box, Typography, Switch, FormControlLabel, CircularProgress, Tooltip, IconButton } from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { getUserPermissions, updateUserPermission } from '../services/UserService';
import { useAuth } from '../contexts/AuthContext';

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

const PermissionsModal = ({ open, handleClose, userId, userRole, userName }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refreshPermissions: refreshAuthPermissions } = useAuth();

  const fetchPermissions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const perms = await getUserPermissions(userId, userRole);
      setPermissions(perms);
    } catch (error) {
      console.error("Failed to fetch permissions", error);
    } finally {
      setLoading(false);
    }
  }, [userId, userRole]);

  useEffect(() => {
    if (open) {
      fetchPermissions();
    }
  }, [open, fetchPermissions]);

  const handleToggle = async (moduleName, currentAccess) => {
    const isOwner = userRole === 'owner';
    if (isOwner) return;

    const newAccess = !currentAccess;
    // Optimistically update UI
    setPermissions(prev => prev.map(p => p.module_name === moduleName ? { ...p, has_access: newAccess } : p));

    try {
      await updateUserPermission(userId, moduleName, newAccess);
      // After successful update, refresh the permissions in the auth context
      // to ensure other parts of the app are updated.
      refreshAuthPermissions();
    } catch (error) {
      console.error("Failed to update permission", error);
      // Revert UI change on error
      setPermissions(prev => prev.map(p => p.module_name === moduleName ? { ...p, has_access: currentAccess } : p));
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="permissions-modal-title"
    >
      <Box sx={style}>
        <Typography id="permissions-modal-title" variant="h6" component="h2">
          Permissions for {userName}
        </Typography>
        {loading ? (
          <CircularProgress />
        ) : (
          <Box sx={{ mt: 2, maxHeight: 300, overflowY: 'auto' }}>
            {permissions.map(({ module_name, has_access }) => (
              <FormControlLabel
                key={module_name}
                control={
                  <Switch
                    checked={has_access}
                    onChange={() => handleToggle(module_name, has_access)}
                    disabled={userRole === 'owner'}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {module_name}
                    {userRole === 'owner' && (
                      <Tooltip title="Owners have full access to all modules.">
                        <IconButton size="small" sx={{ ml: 1 }}>
                          <HelpOutline fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                }
              />
            ))}
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default PermissionsModal;