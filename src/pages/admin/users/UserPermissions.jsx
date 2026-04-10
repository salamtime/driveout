import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { TABLE_NAMES } from '../../../config/tableNames';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Shield, CheckSquare, Square } from 'lucide-react';
import { ALL_PERMISSION_KEYS, MODULE_PERMISSION_KEYS, PERMISSION_GROUPS, normalizePermissionMap as normalizeCatalogPermissionMap } from '../../../utils/permissionCatalog';
import { updateUserProfile } from '../../../services/UserService';

const buildPermissionsForRole = (role) => {
  const normalizedRole = String(role || 'employee').toLowerCase();

  return ALL_PERMISSION_KEYS.reduce((acc, permissionKey) => {
    if (normalizedRole === 'owner') {
      acc[permissionKey] = true;
      return acc;
    }

    acc[permissionKey] = false;

    if (permissionKey === 'Require Extension Approval') {
      acc[permissionKey] = true;
    }

    return acc;
  }, {});
};

const UserPermissions = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userData, setUserData] = useState(null);
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    const stateUser = location.state?.user;

    const loadPermissions = async (user) => {
      setUserData(user);
      try {
        const { data, error } = await supabase
          .from(TABLE_NAMES.USERS)
          .select('permissions')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        const dbPermissions = normalizeCatalogPermissionMap(data?.permissions || {});
        const merged = buildPermissionsForRole(user.role);
        ALL_PERMISSION_KEYS.forEach(m => {
          if (Object.prototype.hasOwnProperty.call(dbPermissions, m)) {
            merged[m] = dbPermissions[m] === true;
          }
        });
        setPermissions(merged);
      } catch (err) {
        toast.error(`Failed to load permissions: ${err.message}`);
        const defaultPerms = buildPermissionsForRole(user.role);
        setPermissions(defaultPerms);
      } finally {
        setIsLoading(false);
      }
    };

    if (stateUser) {
      loadPermissions(stateUser);
    } else {
      // Fallback: fetch user from DB then load permissions
      const fetchUserAndPermissions = async () => {
        try {
          const { data, error } = await supabase
            .from(TABLE_NAMES.USERS)
            .select('id, email, full_name, role, permissions')
            .eq('id', id)
            .single();

          if (error) throw error;

          const user = {
            id: data.id,
            email: data.email,
            name: data.full_name,
            role: data.role,
          };
          setUserData(user);

          const dbPermissions = normalizeCatalogPermissionMap(data.permissions || {});
          const merged = buildPermissionsForRole(data.role);
          ALL_PERMISSION_KEYS.forEach(m => {
            if (Object.prototype.hasOwnProperty.call(dbPermissions, m)) {
              merged[m] = dbPermissions[m] === true;
            }
          });
          setPermissions(merged);
        } catch (err) {
          toast.error(`Failed to load user: ${err.message}`);
          navigate('/admin/users');
        } finally {
          setIsLoading(false);
        }
      };
      fetchUserAndPermissions();
    }
  }, [id, location.state, navigate]);

  const setPermissionValue = (permissionKey, checked) => {
    setPermissions((prev) => ({ ...prev, [permissionKey]: checked === true }));
  };

  const handleModuleToggle = (moduleKey, extras, checked) => {
    setPermissions((prev) => {
      const next = { ...prev, [moduleKey]: checked === true };
      if (!checked) {
        extras.forEach((permissionKey) => {
          next[permissionKey] = false;
        });
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allSelected = MODULE_PERMISSION_KEYS.every(m => permissions[m]);
    const updated = {};
    ALL_PERMISSION_KEYS.forEach(m => {
      updated[m] = !allSelected;
    });
    if (allSelected) {
      ALL_PERMISSION_KEYS.forEach((m) => {
        updated[m] = false;
      });
    }
    setPermissions(updated);
  };

  const handleSave = async () => {
    if (!userData) return;

    setIsSubmitting(true);
    try {
      const completePermissions = {};
      ALL_PERMISSION_KEYS.forEach(module => {
        completePermissions[module] = permissions[module] === true;
      });

      await updateUserProfile(userData.id, {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        permissions: completePermissions,
      });

      toast.success(`Permissions updated for ${userData.name}`);
      navigate('/admin/users');
    } catch (error) {
      toast.error(`Failed to update permissions: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Chargement des autorisations...</p>
      </div>
    );
  }

  const allSelected = MODULE_PERMISSION_KEYS.every(m => permissions[m]);
  const enabledCount = ALL_PERMISSION_KEYS.filter(m => permissions[m]).length;

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Retour
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Autorisations des modules
          </h1>
          <p className="text-sm text-muted-foreground">
            {userData?.name} &mdash; {userData?.email}
          </p>
        </div>
      </div>

      {/* Permissions card */}
      <div className="border rounded-lg p-6 bg-card space-y-4">
        {/* Summary + select all */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{enabledCount}</span> autorisations activées sur {ALL_PERMISSION_KEYS.length}
          </p>
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            {allSelected ? (
              <><Square className="h-4 w-4 mr-1" />Tout désélectionner</>
            ) : (
              <><CheckSquare className="h-4 w-4 mr-1" />Tout sélectionner</>
            )}
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          L’accès au module ouvre la page. Les actions supplémentaires contrôlent quels boutons sensibles apparaissent à l’intérieur du module.
        </div>

        {/* Grouped permission cards */}
        <div className="grid grid-cols-1 gap-4">
          {PERMISSION_GROUPS.map(({ module, extras }) => {
            const moduleEnabled = permissions[module] === true;
            return (
              <div key={module} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{module}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {extras.length > 0 ? 'Module access with extra action controls' : 'Module access'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`perm-${module}`}
                      checked={moduleEnabled}
                      onCheckedChange={(checked) => handleModuleToggle(module, extras, checked)}
                    />
                    <Label htmlFor={`perm-${module}`} className="text-sm font-medium cursor-pointer">
                      Access
                    </Label>
                  </div>
                </div>
                {extras.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {extras.map((permissionKey) => (
                      <div key={permissionKey} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{permissionKey}</p>
                          <p className="text-xs text-slate-500">Enable this action only if the user should see the button</p>
                        </div>
                        <Checkbox
                          id={`perm-${permissionKey}`}
                          checked={permissions[permissionKey] === true}
                          disabled={!moduleEnabled}
                          onCheckedChange={(checked) => setPermissionValue(permissionKey, checked)}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate('/admin/users')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</>
            ) : (
              <><Shield className="mr-2 h-4 w-4" />Enregistrer les autorisations</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserPermissions;
