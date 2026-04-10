import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle,
  ChevronLeft,
  Mail,
  MapPin,
  Eye,
  EyeOff,
  ShieldCheck,
  Tractor,
  User,
  Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import PhoneInputWithCountryCode from '../../components/forms/PhoneInputWithCountryCode';

const GoogleMark = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.25-.95 2.3-2.03 3.02l3.28 2.54c1.91-1.76 3.01-4.35 3.01-7.42 0-.72-.06-1.42-.18-2.08H12z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.28-2.54c-.91.61-2.07.97-3.33.97-2.56 0-4.73-1.73-5.5-4.06H3.11v2.62A9.99 9.99 0 0 0 12 22z" />
    <path fill="#4A90E2" d="M6.5 13.94A5.98 5.98 0 0 1 6.19 12c0-.67.12-1.31.31-1.94V7.44H3.11A9.99 9.99 0 0 0 2 12c0 1.61.38 3.13 1.11 4.56l3.39-2.62z" />
    <path fill="#FBBC05" d="M12 5.98c1.47 0 2.78.5 3.81 1.47l2.86-2.86C16.96 2.98 14.7 2 12 2a9.99 9.99 0 0 0-8.89 5.44L6.5 10.06C7.27 7.71 9.44 5.98 12 5.98z" />
  </svg>
);

const ACCOUNT_TYPES = [
  {
    id: 'customer',
    icon: User,
    title: { en: 'Rent a Vehicle', fr: 'Louer un véhicule' },
    description: {
      en: 'For customers booking rentals and tours.',
      fr: 'Pour les clients qui réservent des locations et des tours.'
    },
    badge: { en: 'Fastest start', fr: 'Démarrage rapide' }
  },
  {
    id: 'individual_owner',
    icon: Tractor,
    title: { en: 'List My Vehicle', fr: 'Lister mon véhicule' },
    description: {
      en: 'For independent owners adding one or more vehicles to the marketplace.',
      fr: 'Pour les propriétaires indépendants qui ajoutent un ou plusieurs véhicules à la marketplace.'
    },
    badge: { en: 'Verification required', fr: 'Vérification requise' }
  },
  {
    id: 'operator',
    icon: Building2,
    title: { en: 'I Run a Rental Business', fr: 'Je gère une activité de location' },
    description: {
      en: 'For companies managing fleet, staff, bookings, finance, and marketplace visibility.',
      fr: 'Pour les entreprises qui gèrent flotte, équipe, réservations, finance et visibilité marketplace.'
    },
    badge: { en: 'Business onboarding', fr: 'Onboarding business' }
  }
];

const ACTIVE_CITY_OPTIONS = ['Tangier'];
const DEFAULT_ACTIVE_CITY = ACTIVE_CITY_OPTIONS[0] || 'Tangier';
const PENDING_ACCOUNT_INTENT_KEY = 'saharax_pending_account_type';

const Register = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { signUp, signInWithGoogle, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    accountType: 'customer',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    city: DEFAULT_ACTIVE_CITY,
    country: 'Morocco',
    companyName: '',
    serviceArea: '',
    vehicleCountHint: '',
    preferredLanguage: i18n.resolvedLanguage || 'en',
    categoriesInterest: [],
    marketplaceEnabled: false
  });

  const selectedAccount = useMemo(
    () => ACCOUNT_TYPES.find((item) => item.id === formData.accountType) || ACCOUNT_TYPES[0],
    [formData.accountType]
  );

  const cityOptions = useMemo(() => ACTIVE_CITY_OPTIONS, []);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const toggleCategory = (category) => {
    setFormData((prev) => ({
      ...prev,
      categoriesInterest: prev.categoriesInterest.includes(category)
        ? prev.categoriesInterest.filter((item) => item !== category)
        : [...prev.categoriesInterest, category]
    }));
  };

  const validateStep = () => {
    if (step === 1 && !formData.accountType) {
      setError(tr('Choose the type of account you want to create.', "Choisissez le type de compte à créer."));
      return false;
    }

    if (step === 2) {
      if (!formData.fullName.trim() || !formData.email.trim()) {
        setError(tr('Name and email are required.', 'Le nom et l’e-mail sont obligatoires.'));
        return false;
      }
      if (formData.password.length < 6) {
        setError(tr('Password must be at least 6 characters.', 'Le mot de passe doit contenir au moins 6 caractères.'));
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError(tr('Passwords do not match.', 'Les mots de passe ne correspondent pas.'));
        return false;
      }
    }

    if (step === 3) {
      if (!formData.phone.trim() || !formData.city.trim()) {
        setError(tr('Phone and city are required to continue.', 'Le téléphone et la ville sont requis pour continuer.'));
        return false;
      }

      if (formData.accountType === 'operator' && !formData.companyName.trim()) {
        setError(tr('Company name is required for operators.', "Le nom de l'entreprise est requis pour les opérateurs."));
        return false;
      }
    }

    setError('');
    return true;
  };

  const handleContinue = () => {
    if (!validateStep()) return;
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;

    const { user, error: signUpError } = await signUp(formData.email, formData.password, {
      full_name: formData.fullName.trim(),
      account_type: formData.accountType,
      default_language: formData.preferredLanguage,
      phone: formData.phone.trim(),
      city: formData.city.trim(),
      country: formData.country.trim(),
      company_name: formData.companyName.trim(),
      service_area: formData.serviceArea.trim(),
      vehicle_count_hint: formData.vehicleCountHint.trim(),
      categories_interest: formData.categoriesInterest,
      marketplace_enabled: formData.accountType !== 'customer' ? formData.marketplaceEnabled : false,
      verification_status: formData.accountType === 'customer' ? 'active' : 'pending_verification'
    });

    if (signUpError) {
      setError(signUpError.message || tr('Unable to create the account right now.', "Impossible de créer le compte maintenant."));
      return;
    }

    if (user) {
      const successMessage =
        formData.accountType === 'customer'
          ? tr('Account created. Check your email, then sign in to continue booking.', 'Compte créé. Vérifiez votre e-mail puis connectez-vous pour continuer à réserver.')
          : tr('Account created. Check your email, then sign in to continue your verification setup.', 'Compte créé. Vérifiez votre e-mail puis connectez-vous pour continuer la vérification.');
      setSuccess(successMessage);
      navigate('/login', {
        replace: true,
        state: { message: successMessage }
      });
    }
  };

  const handleGoogleContinue = async () => {
    setError('');
    setSuccess('');

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(
          PENDING_ACCOUNT_INTENT_KEY,
          JSON.stringify({
            account_type: formData.accountType,
            default_language: formData.preferredLanguage,
            phone: formData.phone.trim(),
            city: formData.city.trim(),
            country: formData.country.trim(),
            company_name: formData.companyName.trim(),
            service_area: formData.serviceArea.trim(),
            vehicle_count_hint: formData.vehicleCountHint.trim(),
            categories_interest: formData.categoriesInterest,
            marketplace_enabled: formData.accountType !== 'customer' ? formData.marketplaceEnabled : false,
          })
        );
      } catch (storageError) {
        console.warn('Unable to preserve selected account type before Google signup:', storageError);
      }
    }

    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message || tr('Google sign-up failed. Please try again.', 'L’inscription Google a échoué. Veuillez réessayer.'));
    }
  };

  const SelectedIcon = selectedAccount.icon;

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.12),_transparent_30%),linear-gradient(180deg,_#f8f7ff_0%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white/90 shadow-[0_30px_90px_rgba(76,29,149,0.12)] backdrop-blur lg:grid-cols-[1fr_0.92fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-violet-900 to-indigo-950 px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.16),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.10),_transparent_34%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {tr('Public Onboarding', 'Onboarding public')}
              </div>

              <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
                {tr('Start the right account from day one', 'Commencez avec le bon compte dès le premier jour')}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-violet-100 sm:text-lg">
                {tr(
                  'Choose how you want to use the platform, then we collect only the fields needed for that path.',
                  'Choisissez comment vous voulez utiliser la plateforme, puis nous collectons seulement les champs nécessaires pour ce parcours.'
                )}
              </p>

              <div className="mt-10 space-y-4">
                {ACCOUNT_TYPES.map((account) => {
                  const Icon = account.icon;
                  const selected = formData.accountType === account.id;
                  return (
                    <div
                      key={account.id}
                      className={`rounded-[1.5rem] border p-4 transition ${
                        selected ? 'border-white/30 bg-white/16' : 'border-white/10 bg-white/8'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`rounded-2xl p-3 ${selected ? 'bg-white/20 text-white' : 'bg-white/10 text-violet-100'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{account.title[isFrench ? 'fr' : 'en']}</p>
                            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">
                              {account.badge[isFrench ? 'fr' : 'en']}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-violet-100/90">{account.description[isFrench ? 'fr' : 'en']}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="bg-white/95 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="mx-auto max-w-xl">
              <div className="mb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                  {tr('Account Setup', 'Configuration du compte')}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {tr('Create your account', 'Créez votre compte')}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {tr(
                    'We keep this light: choose the account path, set access, then add the onboarding basics.',
                    'Nous gardons cela léger : choisissez le parcours, définissez l’accès, puis ajoutez les bases d’onboarding.'
                  )}
                </p>
              </div>

              <div className="mb-6 flex items-center gap-3">
                {[1, 2, 3].map((item) => (
                  <React.Fragment key={item}>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${step >= item ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {item}
                    </div>
                    {item < 3 && <div className={`h-1 flex-1 rounded-full ${step > item ? 'bg-violet-300' : 'bg-slate-200'}`} />}
                  </React.Fragment>
                ))}
              </div>

              <div className="mb-6 space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleContinue}
                  disabled={authLoading}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/60 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <GoogleMark />
                  {tr('Continue with Google', 'Continuer avec Google')}
                </button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {tr('Or create with email', 'Ou créer avec e-mail')}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="rounded-[1.6rem] border border-violet-100 bg-violet-50/70 p-5">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-white p-3 text-violet-700 shadow-sm">
                          <SelectedIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{selectedAccount.title[isFrench ? 'fr' : 'en']}</p>
                          <p className="text-sm text-slate-600">{selectedAccount.description[isFrench ? 'fr' : 'en']}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {ACCOUNT_TYPES.map((account) => {
                        const Icon = account.icon;
                        const selected = formData.accountType === account.id;
                        return (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => updateField('accountType', account.id)}
                            className={`rounded-[1.4rem] border p-4 text-left transition ${
                              selected
                                ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-[0_16px_34px_rgba(76,29,149,0.10)]'
                                : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <div className={`rounded-2xl p-3 ${selected ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900">{account.title[isFrench ? 'fr' : 'en']}</p>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                                    {account.badge[isFrench ? 'fr' : 'en']}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-600">{account.description[isFrench ? 'fr' : 'en']}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Full name', 'Nom complet')}</label>
                        <input
                          value={formData.fullName}
                          onChange={(e) => updateField('fullName', e.target.value)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                          placeholder={tr('Enter the main contact name', 'Entrez le nom du contact principal')}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Email address', 'Adresse e-mail')}</label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => updateField('email', e.target.value)}
                            className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-11 pr-4 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                            placeholder={tr('Enter your email', 'Entrez votre e-mail')}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Password', 'Mot de passe')}</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={formData.password}
                            onChange={(e) => updateField('password', e.target.value)}
                            className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-4 pr-12 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                            placeholder={tr('At least 6 characters', 'Au moins 6 caractères')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((visible) => !visible)}
                            className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                            aria-label={showPassword ? tr('Hide password', 'Masquer le mot de passe') : tr('Show password', 'Afficher le mot de passe')}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Confirm password', 'Confirmer le mot de passe')}</label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={formData.confirmPassword}
                            onChange={(e) => updateField('confirmPassword', e.target.value)}
                            className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-4 pr-12 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                            placeholder={tr('Repeat the password', 'Répétez le mot de passe')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((visible) => !visible)}
                            className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                            aria-label={showConfirmPassword ? tr('Hide password', 'Masquer le mot de passe') : tr('Show password', 'Afficher le mot de passe')}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <PhoneInputWithCountryCode
                        value={formData.phone}
                        onChange={(value) => updateField('phone', value)}
                        tr={tr}
                      />

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Preferred language', 'Langue préférée')}</label>
                        <select
                          value={formData.preferredLanguage}
                          onChange={(e) => updateField('preferredLanguage', e.target.value)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                        >
                          <option value="en">English</option>
                          <option value="fr">Français</option>
                          <option value="ar">العربية</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('City', 'Ville')}</label>
                        <div className="relative">
                          <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <select
                            value={formData.city}
                            onChange={(e) => updateField('city', e.target.value)}
                            className="block w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-11 pr-4 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                          >
                            {cityOptions.map((city) => (
                              <option key={city} value={city}>
                                {city}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Country', 'Pays')}</label>
                        <input
                          value={formData.country}
                          onChange={(e) => updateField('country', e.target.value)}
                          className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                        />
                      </div>

                      {formData.accountType === 'operator' && (
                        <>
                          <div className="sm:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Company name', "Nom de l'entreprise")}</label>
                            <input
                              value={formData.companyName}
                              onChange={(e) => updateField('companyName', e.target.value)}
                              className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                              placeholder={tr('SaharaX Tangier', 'SaharaX Tanger')}
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Service area', 'Zone de service')}</label>
                            <input
                              value={formData.serviceArea}
                              onChange={(e) => updateField('serviceArea', e.target.value)}
                              className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                              placeholder={tr('Tangier / Playa / Cap Spartel', 'Tanger / Playa / Cap Spartel')}
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Fleet size hint', 'Taille de flotte')}</label>
                            <input
                              value={formData.vehicleCountHint}
                              onChange={(e) => updateField('vehicleCountHint', e.target.value)}
                              className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                              placeholder={tr('Example: 15 vehicles', 'Exemple : 15 véhicules')}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {formData.accountType !== 'customer' && (
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">{tr('Marketplace setup', 'Configuration marketplace')}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {tr('Choose the categories you want to activate first. Verification stays pending until review.', 'Choisissez les catégories à activer d’abord. La vérification reste en attente jusqu’à revue.')}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {['ATV', 'Buggy', 'Motorcycle', 'Electric'].map((category) => {
                            const selected = formData.categoriesInterest.includes(category);
                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() => toggleCategory(category)}
                                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                  selected
                                    ? 'bg-violet-600 text-white'
                                    : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                                }`}
                              >
                                {category}
                              </button>
                            );
                          })}
                        </div>

                        <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={formData.marketplaceEnabled}
                            onChange={(e) => updateField('marketplaceEnabled', e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                          {tr('Enable marketplace setup from the start', 'Activer la configuration marketplace dès le départ')}
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {step > 1 && (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        {tr('Back', 'Retour')}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {step < 3 ? (
                      <button
                        type="button"
                        onClick={handleContinue}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800"
                      >
                        {tr('Continue', 'Continuer')}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800 disabled:opacity-70"
                      >
                        {authLoading ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            {tr('Creating account...', 'Création du compte...')}
                          </>
                        ) : (
                          <>
                            {tr('Create account', 'Créer le compte')}
                            <CheckCircle className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">
                {tr('Already have an account?', 'Vous avez déjà un compte ?')}{' '}
                <Link to="/login" className="font-medium text-violet-600 transition-colors hover:text-violet-700">
                  {tr('Sign in', 'Se connecter')}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Register;
