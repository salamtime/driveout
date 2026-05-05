import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import i18n from '../../../i18n';
import { updateUserProfile } from '../../../services/UserService';
import { TABLE_NAMES } from '../../../config/tableNames';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import {
  applyTelegramAdminSettingsToPreferences,
  buildDefaultTelegramEventTypes,
  getTelegramAlertSettingsFromPreferences,
} from '../../../utils/telegramAlertPreferences';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
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

const EditUser = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userData, setUserData] = useState(null);
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: 'employee',
    phone_number: '',
    whatsapp_notifications: false,
    telegram_alerts_allowed: false,
    telegram_allowed_event_types: buildDefaultTelegramEventTypes(false),
    preferences: {},
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    // If user data was passed via navigation state, use it directly
    const stateUser = location.state?.user;
    if (stateUser) {
      const telegramSettings = getTelegramAlertSettingsFromPreferences(stateUser.preferences);
      setUserData(stateUser);
      setForm({
        email: stateUser.email || '',
        name: stateUser.name || '',
        role: stateUser.role || 'employee',
        phone_number: stateUser.phone_number || '',
        whatsapp_notifications: stateUser.whatsapp_notifications || false,
        telegram_alerts_allowed: telegramSettings.allowed,
        telegram_allowed_event_types: telegramSettings.allowed_event_types,
        preferences: stateUser.preferences || {},
        password: '',
        confirmPassword: '',
      });
      setIsLoading(false);
    } else {
      // Fallback: fetch from DB
      const fetchUser = async () => {
        try {
          const { data, error } = await supabase
            .from(TABLE_NAMES.USERS)
            .select('id, email, full_name, role, phone_number, whatsapp_notifications, preferences')
            .eq('id', id)
            .single();

          if (error) throw error;
          const telegramSettings = getTelegramAlertSettingsFromPreferences(data.preferences);

          const user = {
            id: data.id,
            email: data.email,
            name: data.full_name,
            role: data.role,
            phone_number: data.phone_number,
            whatsapp_notifications: data.whatsapp_notifications,
            preferences: data.preferences || {},
          };
          setUserData(user);
          setForm({
            email: user.email || '',
            name: user.name || '',
            role: user.role || 'employee',
            phone_number: user.phone_number || '',
            whatsapp_notifications: user.whatsapp_notifications || false,
            telegram_alerts_allowed: telegramSettings.allowed,
            telegram_allowed_event_types: telegramSettings.allowed_event_types,
            preferences: user.preferences || {},
            password: '',
            confirmPassword: '',
          });
        } catch (err) {
          toast.error(`Failed to load user: ${err.message}`);
          navigate('/admin/users');
        } finally {
          setIsLoading(false);
        }
      };
      fetchUser();
    }
  }, [id, location.state, navigate]);

  const handleSave = async () => {
    if (!form.email || !form.name || !form.role) {
      toast.error('Veuillez remplir tous les champs obligatoires : nom complet, e-mail et rôle.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (form.phone_number && !/^\+?[0-9\s\-\(\)]+$/.test(form.phone_number)) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    if (form.password) {
      if (form.password.length < 6) {
        toast.error('Password must be at least 6 characters long.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.error('Passwords do not match.');
        return;
      }
    }

    if (userData?.id === currentUser?.id && form.role !== userData.role) {
      toast.error('You cannot change your own role.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updates = {
        email: form.email,
        name: form.name,
        role: form.role.toLowerCase(),
        phone_number: form.phone_number || null,
        whatsapp_notifications: form.whatsapp_notifications || false,
        preferences: applyTelegramAdminSettingsToPreferences(form.preferences || userData?.preferences || {}, {
          allowed: form.telegram_alerts_allowed,
          allowed_event_types: form.telegram_allowed_event_types,
        }),
      };
      if (form.password && form.password.trim() !== '') {
        updates.password = form.password;
      }

      await updateUserProfile(id, updates);

      const { error: updateError } = await supabase
        .from(TABLE_NAMES.USERS)
        .update({
          email: form.email,
          full_name: form.name,
          role: form.role.toLowerCase(),
          phone_number: form.phone_number || null,
          whatsapp_notifications: form.whatsapp_notifications || false,
          preferences: updates.preferences,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        toast.warning('Utilisateur mis à jour, mais impossible d’enregistrer les préférences téléphone/WhatsApp.');
      }

      toast.success('Utilisateur mis à jour avec succès !');
      navigate('/admin/users');
    } catch (error) {
      toast.error(`Erreur lors de la mise à jour de l’utilisateur : ${error.message || 'Une erreur inconnue est survenue'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading user...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit User</h1>
          <p className="text-sm text-muted-foreground">{userData?.email}</p>
        </div>
      </div>

      {/* Form */}
      <div className="border rounded-lg p-6 bg-card space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Nom complet <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            placeholder="Nom complet"
            value={form.name}
            onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
          <Input
            id="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Numéro de téléphone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+212 6XX XXX XXX"
            value={form.phone_number}
            onChange={(e) => setForm(p => ({ ...p, phone_number: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role <span className="text-red-500">*</span></Label>
          <select
            id="role"
            value={form.role}
            onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
            disabled={userData?.id === currentUser?.id}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
            <option value="guide">Guide</option>
          </select>
          {userData?.id === currentUser?.id && (
            <p className="text-xs text-muted-foreground italic">You cannot change your own role.</p>
          )}
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="whatsapp"
            checked={form.whatsapp_notifications}
            onCheckedChange={(checked) => setForm(p => ({ ...p, whatsapp_notifications: checked }))}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="whatsapp" className="font-normal">Enable WhatsApp notifications</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Staff will receive rental alerts &amp; updates via WhatsApp on their phone number above
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-violet-100 bg-violet-50/30 p-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="telegram-enabled"
              checked={form.telegram_alerts_allowed}
              onCheckedChange={(checked) => setForm((current) => ({
                ...current,
                telegram_alerts_allowed: checked === true,
                telegram_allowed_event_types: checked === true
                  ? current.telegram_allowed_event_types
                  : buildDefaultTelegramEventTypes(false),
              }))}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="telegram-enabled" className="font-normal">Allow Telegram alerts for this staff member</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Admin decides which rental alerts this staff member may receive in Telegram.
              </p>
            </div>
          </div>

          <div className={`grid gap-2 rounded-lg border p-3 ${form.telegram_alerts_allowed ? 'border-violet-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
            {TELEGRAM_ALERT_EVENT_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-slate-700">
                <span>{option.label}</span>
                <Checkbox
                  checked={form.telegram_allowed_event_types?.[option.key] === true}
                  disabled={!form.telegram_alerts_allowed}
                  onCheckedChange={(checked) => setForm((current) => ({
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

        {/* Password section */}
        <div className="border-t pt-4 space-y-4">
          <div>
            <p className="text-sm font-medium">Change Password <span className="text-muted-foreground font-normal">(Optional)</span></p>
            <p className="text-xs text-muted-foreground">Leave blank to keep current password</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="New Password (min 6 chars)"
              value={form.password}
              onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
            />
          </div>

          {form.password && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm New Password"
                value={form.confirmPassword}
                onChange={(e) => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate('/admin/users')} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tr('Saving...', 'Enregistrement...')}</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />{tr('Save Changes', 'Enregistrer les modifications')}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditUser;
