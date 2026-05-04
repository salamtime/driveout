import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import UserProfileService from '../../services/UserProfileService';

const fieldBaseClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-50';

const sectionClassName =
  'overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]';

const sectionHeaderClassName =
  'border-b border-slate-200 bg-slate-50/90 px-6 py-5';

const sectionBodyClassName = 'px-6 py-6';

const ProfileSettings = ({ profile, userRole, onProfileUpdate }) => {
  const { t } = useTranslation();
  const tr = (key, fallback) => t(key, { defaultValue: fallback });
  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    date_of_birth: '',
    emergency_contact: '',
    emergency_phone: '',
    preferences: {},
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const allowedFields = useMemo(
    () => UserProfileService.getAllowedProfileFields(userRole),
    [userRole]
  );

  const profileSnapshot = useMemo(
    () => JSON.stringify({
      username: profile?.username || '',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      date_of_birth: profile?.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
      emergency_contact: profile?.emergency_contact || '',
      emergency_phone: profile?.emergency_phone || '',
      preferences: profile?.preferences || {},
    }),
    [
      profile?.address,
      profile?.date_of_birth,
      profile?.emergency_contact,
      profile?.emergency_phone,
      profile?.first_name,
      profile?.last_name,
      profile?.phone,
      profile?.preferences,
      profile?.username,
    ]
  );

  const resetForm = () => {
    setFormData({
      username: profile?.username || '',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      date_of_birth: profile?.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
      emergency_contact: profile?.emergency_contact || '',
      emergency_phone: profile?.emergency_phone || '',
      preferences: profile?.preferences || {},
    });
    setErrors({});
    setSuccessMessage('');
  };

  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSnapshot]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrors({});
    setSuccessMessage('');

    const validation = UserProfileService.validateProfileData(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setLoading(false);
      return;
    }

    try {
      const success = await onProfileUpdate(formData);
      if (success) {
        setSuccessMessage(tr('profile.updateSuccess', 'Profile updated successfully.'));
        toast.success(tr('profile.updateSuccess', 'Profile updated successfully.'));
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      setErrors({ general: error.message });
    } finally {
      setLoading(false);
    }
  };

  const renderInput = ({
    name,
    label,
    placeholder,
    type = 'text',
    required = false,
    multiline = false,
  }) => {
    if (!allowedFields.includes(name)) return null;
    const error = errors[name];
    const Component = multiline ? 'textarea' : 'input';

    return (
      <label key={name} className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          {label}{required ? ' *' : ''}
        </span>
        <Component
          type={multiline ? undefined : type}
          name={name}
          value={formData[name] || ''}
          onChange={handleInputChange}
          placeholder={placeholder}
          rows={multiline ? 4 : undefined}
          className={`${fieldBaseClass} ${error ? 'border-rose-300 focus:border-rose-300 focus:ring-rose-100' : ''}`}
        />
        {error && <span className="mt-1 block text-xs font-semibold text-rose-600">{error}</span>}
      </label>
    );
  };

  const profileFields = [
    {
      name: 'username',
      label: tr('profile.fields.username', 'Username'),
      placeholder: tr('profile.placeholders.username', 'Choose a username'),
      required: true,
    },
    {
      name: 'first_name',
      label: tr('profile.fields.firstName', 'First name'),
      placeholder: tr('profile.placeholders.firstName', 'Enter first name'),
      required: true,
    },
    {
      name: 'last_name',
      label: tr('profile.fields.lastName', 'Last name'),
      placeholder: tr('profile.placeholders.lastName', 'Enter last name'),
      required: true,
    },
    {
      name: 'date_of_birth',
      type: 'date',
      label: tr('profile.fields.dateOfBirth', 'Date of birth'),
    },
  ];

  const contactFields = [
    {
      name: 'phone',
      type: 'tel',
      label: tr('profile.fields.phone', 'Phone'),
      placeholder: tr('profile.placeholders.phone', 'Enter phone number'),
    },
    {
      name: 'emergency_contact',
      label: tr('profile.fields.emergencyContact', 'Emergency contact'),
      placeholder: tr('profile.placeholders.emergencyContact', 'Enter emergency contact'),
    },
    {
      name: 'emergency_phone',
      type: 'tel',
      label: tr('profile.fields.emergencyPhone', 'Emergency phone'),
      placeholder: tr('profile.placeholders.emergencyPhone', 'Enter emergency phone'),
    },
    {
      name: 'address',
      label: tr('profile.fields.address', 'Address'),
      placeholder: tr('profile.placeholders.address', 'Enter address'),
      multiline: true,
    },
  ];

  const updatedLabel = profile?.updated_at
    ? new Date(profile.updated_at).toLocaleString()
    : tr('common.never', 'Never');

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {successMessage && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {successMessage}
        </div>
      )}

      {errors.general && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {errors.general}
        </div>
      )}

      <section className={sectionClassName}>
        <div className={`${sectionHeaderClassName} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              {tr('profile.tabs.profile', 'Profile')}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {tr('profile.personalInformation', 'Personal Information')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {tr('profile.roleBasedAccess', 'Role-based access')}
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            {String(userRole || 'user').toUpperCase()}
          </span>
        </div>
        <div className={sectionBodyClassName}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {profileFields.map(renderInput)}
          </div>
        </div>
      </section>

      <section className={sectionClassName}>
        <div className={sectionHeaderClassName}>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            {tr('common.contact', 'Contact')}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {tr('profile.contactDetails', 'Contact details')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {tr('profile.lastUpdated', 'Last updated')}: <span className="font-semibold text-slate-700">{updatedLabel}</span>
          </p>
        </div>
        <div className={sectionBodyClassName}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {contactFields.map(renderInput)}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-[2rem] border border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
            {tr('common.save', 'Save')}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {tr('profile.saveHint', 'Review your details before saving.')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {tr('common.reset', 'Reset')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)] transition hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? tr('common.saving', 'Saving...') : tr('common.save', 'Save')}
          </button>
        </div>
      </div>
    </form>
  );
};

export default ProfileSettings;
