import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { TABLE_NAMES } from '../../../config/tableNames';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Shield, CheckSquare, Square } from 'lucide-react';

// STANDARDIZED MODULE NAMES - Source of Truth
const modules = [
  'Dashboard', 'Calendar', 'Tours & Bookings', 'Rental Management', 'Customer Management',
  'Fleet Management', 'Pricing Management', 'Quad Maintenance', 'Fuel Logs', 'Inventory',
  'Finance Management', 'Alerts', 'User & Role Management', 'System Settings', 'Project Export',
  'WhatsApp Alerts'
];

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

        const dbPermissions = data?.permissions || {};
        const merged = {};
        modules.forEach(m => {
          merged[m] = dbPermissions[m] === true;
        });
        setPermissions(merged);
      } catch (err) {
        toast.error(`Failed to load permissions: ${err.message}`);
        const defaultPerms = {};
        modules.forEach(m => { defaultPerms[m] = false; });
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

          const dbPermissions = data.permissions || {};
          const merged = {};
          modules.forEach(m => {
            merged[m] = dbPermissions[m] === true;
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

  const handleSelectAll = () => {
    const allSelected = modules.every(m => permissions[m]);
    const updated = {};
    modules.forEach(m => { updated[m] = !allSelected; });
    setPermissions(updated);
  };

  const handleSave = async () => {
    if (!userData) return;

    setIsSubmitting(true);
    try {
      const completePermissions = {};
      modules.forEach(module => {
        completePermissions[module] = permissions[module] === true;
      });

      // Preserve existing phone/whatsapp data
      const { data: currentData } = await supabase
        .from(TABLE_NAMES.USERS)
        .select('phone_number, whatsapp_notifications')
        .eq('id', userData.id)
        .maybeSingle();

      const upsertPayload = {
        id: userData.id,
        email: userData.email,
        full_name: userData.name,
        role: userData.role,
        access_enabled: true,
        permissions: completePermissions,
        phone_number: currentData?.phone_number || null,
        whatsapp_notifications: currentData?.whatsapp_notifications || false,
      };

      const { error } = await supabase
        .from(TABLE_NAMES.USERS)
        .upsert(upsertPayload, { onConflict: 'id' });

      if (error) throw error;

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
        <p className="ml-2">Loading permissions...</p>
      </div>
    );
  }

  const allSelected = modules.every(m => permissions[m]);
  const enabledCount = modules.filter(m => permissions[m]).length;

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Module Permissions
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
            <span className="font-semibold text-foreground">{enabledCount}</span> of {modules.length} modules enabled
          </p>
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            {allSelected ? (
              <><Square className="h-4 w-4 mr-1" />Deselect All</>
            ) : (
              <><CheckSquare className="h-4 w-4 mr-1" />Select All</>
            )}
          </Button>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border p-4">
          {modules.map((module) => (
            <div key={module} className="flex items-center space-x-2">
              <Checkbox
                id={`perm-${module}`}
                checked={permissions[module] === true}
                onCheckedChange={(checked) =>
                  setPermissions(prev => ({ ...prev, [module]: checked }))
                }
              />
              <Label htmlFor={`perm-${module}`} className="text-sm font-normal cursor-pointer">
                {module}
              </Label>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate('/admin/users')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
            ) : (
              <><Shield className="mr-2 h-4 w-4" />Save Permissions</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserPermissions;
