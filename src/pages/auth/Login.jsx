import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import i18n from '../../i18n';
import { hasBusinessOwnerRequest, isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../../utils/accountType';

const GoogleMark = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.25-.95 2.3-2.03 3.02l3.28 2.54c1.91-1.76 3.01-4.35 3.01-7.42 0-.72-.06-1.42-.18-2.08H12z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.28-2.54c-.91.61-2.07.97-3.33.97-2.56 0-4.73-1.73-5.5-4.06H3.11v2.62A9.99 9.99 0 0 0 12 22z" />
    <path fill="#4A90E2" d="M6.5 13.94A5.98 5.98 0 0 1 6.19 12c0-.67.12-1.31.31-1.94V7.44H3.11A9.99 9.99 0 0 0 2 12c0 1.61.38 3.13 1.11 4.56l3.39-2.62z" />
    <path fill="#FBBC05" d="M12 5.98c1.47 0 2.78.5 3.81 1.47l2.86-2.86C16.96 2.98 14.7 2 12 2a9.99 9.99 0 0 0-8.89 5.44L6.5 10.06C7.27 7.71 9.44 5.98 12 5.98z" />
  </svg>
);

const Login = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signInWithGoogle, loading: authLoading, initialized, getBusinessOwnerHomePath } = useAuth();
  const getRedirectPathForRole = (role, accountType = '') => {
    const platformOwnerOverride = isPlatformOwnerEmail(user?.email);
    const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount({
      account_type: accountType,
      verification_status: user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
      certification_request_status: user?.user_metadata?.certification_request_status || user?.app_metadata?.certification_request_status,
    });
    const businessOwnerFreezeRedirect = !platformOwnerOverride && hasBusinessOwnerRequest({
      account_type: accountType,
      certification_request_status: user?.user_metadata?.certification_request_status || user?.app_metadata?.certification_request_status,
    })
      ? getBusinessOwnerHomePath({
          account_type: accountType,
          verification_status: user?.verificationStatus || user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
          certification_request_status: user?.user_metadata?.certification_request_status || user?.app_metadata?.certification_request_status,
          subscription_status: user?.subscriptionStatus || user?.user_metadata?.subscription_status || user?.app_metadata?.subscription_status,
        })
      : null;

    if (businessOwnerFreezeRedirect) {
      return businessOwnerFreezeRedirect;
    }

    const dashboardPaths = {
      owner: '/admin/dashboard',
      admin: '/admin/dashboard',
      employee: '/admin/dashboard',
      business_owner: '/pending-approval',
      guide: '/guide/dashboard',
      customer: approvedBusinessOwner ? '/pending-approval' : '/customer/dashboard',
    };

    return dashboardPaths[role] || '/admin/dashboard';
  };

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.message || '');

  // Redirect if user is already logged in and auth is fully loaded
  useEffect(() => {
    if (initialized && user && !authLoading) {
      const from = location.state?.from?.pathname;
      const redirectTo =
        from && from !== '/' && from !== '/login' && from !== '/register'
          ? from
          : getRedirectPathForRole(user.role, user.accountType || user.account_type);
      console.log(`✅ Auth ready, redirecting to: ${redirectTo}`);
      if (/^https?:\/\//i.test(redirectTo)) {
        window.location.href = redirectTo;
        return;
      }
      navigate(redirectTo, { replace: true });
    }
  }, [user, initialized, authLoading, navigate, location.state]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { data, error: signInError } = await signIn(formData.email, formData.password);

    if (signInError) {
      console.error('Login error:', signInError);
      setError(signInError.message || tr('Login failed. Please try again.', "Échec de la connexion. Veuillez réessayer."));
    } else {
      setSuccess(tr('Login successful! Redirecting...', 'Connexion réussie ! Redirection...'));
    }
  };

  const handleForgotPassword = async () => {
    // This function can be implemented later if needed
    setError(tr('Password reset functionality is not yet implemented.', "La réinitialisation du mot de passe n'est pas encore implémentée."));
  };

  const handleGoogleContinue = async () => {
    setError('');
    setSuccess('');

    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message || tr('Google sign-in failed. Please try again.', 'La connexion Google a échoué. Veuillez réessayer.'));
    }
  };

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">{tr('Initializing...', 'Initialisation...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#f8f7ff_0%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white/85 shadow-[0_30px_90px_rgba(76,29,149,0.14)] backdrop-blur sm:rounded-[2.25rem] lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-violet-700 via-violet-800 to-indigo-950 px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_32%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {tr('Saharax Workspace', 'Espace Saharax')}
              </div>

              <div className="mt-8 max-w-xl">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {tr('Welcome back', 'Bon retour')}
                </h1>
                <p className="mt-4 max-w-lg text-base leading-7 text-violet-100 sm:text-lg">
                  {tr(
                    'Sign in to continue managing rentals, fleet activity, finance, and operations from one shared workspace.',
                    'Connectez-vous pour gérer les locations, la flotte, la finance et les opérations depuis un espace partagé.'
                  )}
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                    {tr('Rental Flow', 'Flux location')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{tr('Live', 'Live')}</p>
                  <p className="mt-2 text-sm text-violet-100/90">
                    {tr('Scheduled, active, and completed workspaces stay connected.', 'Les espaces planifiés, actifs et terminés restent connectés.')}
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                    {tr('Operations', 'Opérations')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{tr('Unified', 'Unifié')}</p>
                  <p className="mt-2 text-sm text-violet-100/90">
                    {tr('Fuel, maintenance, customer, and contract activity in one place.', 'Carburant, maintenance, client et contrat réunis au même endroit.')}
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/12 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                    {tr('Access', 'Accès')}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{tr('Secure', 'Sécurisé')}</p>
                  <p className="mt-2 text-sm text-violet-100/90">
                    {tr('Role-based access keeps each workspace focused and protected.', 'Les rôles gardent chaque espace ciblé et protégé.')}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white/90 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="mx-auto max-w-md">
              <div className="mb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                  {tr('Account Access', 'Accès compte')}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {tr('Sign in to continue', 'Connectez-vous pour continuer')}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {tr(
                    'One login for customers, staff, guides, and admins. Admin accounts open the admin workspace automatically.',
                    'Une seule connexion pour clients, équipe, guides et admins. Les comptes admin ouvrent automatiquement l’espace admin.'
                  )}
                </p>
              </div>

              <div className="space-y-4">
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
                    {tr('Or continue with email', 'Ou continuer avec e-mail')}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 pt-5">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                    {tr('Email Address', 'Adresse e-mail')}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-12 pr-4 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Enter your email', 'Entrez votre e-mail')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                    {tr('Password', 'Mot de passe')}
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-12 pr-14 text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Enter your password', 'Entrez votre mot de passe')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition-colors hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-500" />
                    <p className="text-sm leading-6">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <p className="text-sm leading-6">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {authLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {tr('Signing in...', 'Connexion...')}
                    </>
                  ) : (
                    <>
                      {tr('Sign In', 'Se connecter')}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={authLoading}
                    className="text-sm font-medium text-violet-600 transition-colors hover:text-violet-700 disabled:text-violet-300"
                  >
                    {tr('Forgot your password?', 'Mot de passe oublié ?')}
                  </button>
                  <Link
                    to="/register"
                    className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
                  >
                    {tr('Create account', 'Créer un compte')}
                  </Link>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
