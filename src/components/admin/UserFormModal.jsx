import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import toast from 'react-hot-toast';
import i18n from '../../i18n';
import { assertCanCreateStaffUser, clearTenantRuntimeControlsCache } from '../../services/TenantLimitService';

const UserFormModal = ({ isOpen, onClose, onUserCreated }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'customer'
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const roles = [
    { value: 'owner', label: tr('Owner', 'Propriétaire'), color: 'text-purple-600' },
    { value: 'admin', label: tr('Admin', 'Admin'), color: 'text-blue-600' },
    { value: 'guide', label: tr('Guide', 'Guide'), color: 'text-green-600' },
    { value: 'employee', label: tr('Employee', 'Employé'), color: 'text-gray-600' },
    { value: 'customer', label: tr('Customer', 'Client'), color: 'text-yellow-600' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error(tr('Email and password are required', "L'e-mail et le mot de passe sont requis"));
      return;
    }

    if (formData.password.length < 6) {
      toast.error(tr('Password must be at least 6 characters', 'Le mot de passe doit contenir au moins 6 caractères'));
      return;
    }

    setLoading(true);
    try {
      console.log('🔄 Creating new user...', formData.email);
      const normalizedRole = String(formData?.role || '').trim().toLowerCase();
      if (normalizedRole && normalizedRole !== 'customer') {
        await assertCanCreateStaffUser();
      }
      
      // Create user with Supabase Auth Admin API
      const { data, error } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        email_confirm: true,
        user_metadata: {
          full_name: formData.full_name || formData.email.split('@')[0],
          role: formData.role
        }
      });

      if (error) throw error;

      console.log('✅ User created successfully:', data.user);
      clearTenantRuntimeControlsCache();
      toast.success(tr(`User ${formData.email} created successfully!`, `L'utilisateur ${formData.email} a été créé avec succès !`));
      
      // Store password for credentials display
      const createdPassword = formData.password;
      
      // Reset form
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'customer'
      });
      
      // Notify parent to refresh user list and show credentials
      if (onUserCreated) {
        onUserCreated(data.user, createdPassword);
      }
      
      onClose();
    } catch (error) {
      console.error('❌ Error creating user:', error);
      toast.error(tr(`Failed to create user: ${error.message}`, `Impossible de créer l'utilisateur : ${error.message}`));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{tr('Add New User', 'Ajouter un nouvel utilisateur')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tr('Email Address', 'Adresse e-mail')} *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="user@example.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tr('Password', 'Mot de passe')} *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={6}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={tr('Minimum 6 characters', 'Minimum 6 caractères')}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tr('Full Name', 'Nom complet')}
            </label>
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={tr('John Doe', 'Jean Dupont')}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {tr('Role', 'Rôle')} *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              {roles.map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {tr('Creating...', 'Création...')}
                </>
              ) : (
                tr('Create User', "Créer l'utilisateur")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;
