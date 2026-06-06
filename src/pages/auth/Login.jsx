import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle, ShieldCheck, ArrowRight, ChevronLeft } from 'lucide-react';
import i18n from '../../i18n';
import { hasBusinessOwnerRequest, isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../../utils/accountType';
import { supabase } from '../../lib/supabase';
import { requestPasswordResetEmail } from '../../services/emailApi';
import { shouldScopeSharedTenantData } from '../../services/OrganizationService';
import { buildHostUrl, buildLocalTenantUrl, getHostContext, isFirstPartyTenantHost, isSaharaXBrandingHost } from '../../utils/hostContext';

const getSafeRedirectPath = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('/')) return '';
  if (normalized.startsWith('//')) return '';
  return normalized;
};

const resolveHostAwareRedirect = (pathname = '/') => {
  const normalizedPath = getSafeRedirectPath(pathname) || '/';
  return normalizedPath;
};

const buildMarketplaceLoginRedirect = ({ email = '', redirect = '/customer/dashboard' } = {}) => {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (redirect) params.set('redirect', redirect);
  params.set('tenantAccess', 'marketplace-customer');

  const host = getHostContext();
  if (host?.isLocal) {
    return buildLocalTenantUrl({
      pathname: '/login',
      search: `?${params.toString()}`,
    });
  }

  return buildHostUrl({
    kind: 'public',
    pathname: '/login',
    search: `?${params.toString()}`,
  });
};

const buildNonAdminWorkspaceRedirect = ({ redirect = '/customer/dashboard' } = {}) => {
  const safeRedirect = getSafeRedirectPath(redirect) || '/customer/dashboard';
  const host = getHostContext();

  if (host?.isLocal) {
    return buildLocalTenantUrl({
      pathname: safeRedirect,
    });
  }

  return buildHostUrl({
    kind: safeRedirect.startsWith('/account') || safeRedirect.startsWith('/customer') ? 'app' : 'public',
    pathname: safeRedirect,
  });
};

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
  const hasRedirectedRef = useRef(false);
  const host = getHostContext();
  const queryParams = new URLSearchParams(location.search);
  const redirectQuery = getSafeRedirectPath(queryParams.get('redirect'));
  const prefilledEmail = String(queryParams.get('email') || '').trim();
  const tenantAccessNotice = queryParams.get('tenantAccess');
  const { user, session, signIn, signInWithGoogle, loading: authLoading, initialized, getBusinessOwnerHomePath } = useAuth();
  const isAdminHost = host.kind === 'admin';
  const isFirstPartyTenantWorkspace = isFirstPartyTenantHost(host);
  const isSharedTenantWorkspace = shouldScopeSharedTenantData(host);
  const loginBrand = isAdminHost
    ? {
        eyebrow: tr('Driveout Admin', 'Admin Driveout'),
        heroTitle: tr('Welcome back', 'Bon retour'),
        heroBody: tr(
          'Sign in to manage the Driveout operations platform.',
          'Connectez-vous pour gérer la plateforme opérationnelle Driveout.'
        ),
        introEyebrow: tr('Admin Access', 'Accès admin'),
        introBody: tr(
          'Use your Driveout admin account to continue.',
          'Utilisez votre compte admin Driveout pour continuer.'
        ),
      }
    : isFirstPartyTenantWorkspace
      ? {
          eyebrow: tr('Saharax Workspace', 'Espace Saharax'),
          heroTitle: tr('Welcome back', 'Bon retour'),
          heroBody: tr(
            'Sign in to continue in your SaharaX workspace.',
            'Connectez-vous pour continuer dans votre espace SaharaX.'
          ),
          introEyebrow: tr('Account Access', 'Accès compte'),
          introBody: tr(
            'Use your SaharaX account to continue.',
            'Utilisez votre compte SaharaX pour continuer.'
          ),
        }
      : {
          eyebrow: tr('Driveout Marketplace', 'Marketplace Driveout'),
          heroTitle: tr('Welcome back', 'Bon retour'),
          heroBody: tr(
            'Sign in to continue on Driveout.',
            'Connectez-vous pour continuer sur Driveout.'
          ),
          introEyebrow: tr('Account Access', 'Accès compte'),
          introBody: tr(
            'Use your Driveout account to continue.',
            'Utilisez votre compte Driveout pour continuer.'
          ),
        };
  const getRedirectPathForRole = (role, accountType = '') => {
    const platformOwnerOverride = isPlatformOwnerEmail(user?.email);
    const internalTenantRole = ['owner', 'admin', 'employee', 'guide'].includes(String(role || '').trim().toLowerCase());
    const approvedBusinessOwner = !platformOwnerOverride && isApprovedBusinessOwnerAccount({
      account_type: accountType,
      verification_status: user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
      certification_request_status: user?.user_metadata?.certification_request_status || user?.app_metadata?.certification_request_status,
    });
    const businessOwnerFreezeRedirect = !platformOwnerOverride && !internalTenantRole && hasBusinessOwnerRequest({
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
    email: prefilledEmail,
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.message || '');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const isBusy = authLoading;
  const isLocalSaharaXWorkspace = Boolean(host?.isLocal) && isSaharaXBrandingHost(host);
  const marketplaceTenantNotice = tenantAccessNotice === 'marketplace-customer' && !isLocalSaharaXWorkspace
    ? isSharedTenantWorkspace
      ? tr(
          'This email signs in on Driveout marketplace, not inside the SaharaX tenant workspace. Continue below and we will take you to the right place.',
          "Cet e-mail se connecte sur la marketplace Driveout, pas dans l'espace tenant SaharaX. Continuez ci-dessous et nous vous emmènerons au bon endroit."
        )
      : tr(
          'This email signs in on Driveout marketplace. Continue below and we will take you to the right place.',
          'Cet e-mail se connecte sur la marketplace Driveout. Continuez ci-dessous et nous vous emmènerons au bon endroit.'
        )
    : '';

  // Redirect if user is already logged in and auth is fully loaded
  useEffect(() => {
    if (initialized && session?.user && !authLoading && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const normalizedRole = String(user?.role || '').trim().toLowerCase();
      const accountType = String(
        user?.accountType ||
        user?.account_type ||
        session?.user?.user_metadata?.account_type ||
        session?.user?.app_metadata?.account_type ||
        ''
      ).trim().toLowerCase();
      const tenantBusinessOwnerLike = hasBusinessOwnerRequest({
        account_type: accountType,
        verification_status: user?.verificationStatus || session?.user?.user_metadata?.verification_status || session?.user?.app_metadata?.verification_status,
        certification_request_status: session?.user?.user_metadata?.certification_request_status || session?.user?.app_metadata?.certification_request_status,
      });
      const approvedBusinessOwner = isApprovedBusinessOwnerAccount({
        account_type: accountType,
        verification_status: user?.verificationStatus || session?.user?.user_metadata?.verification_status || session?.user?.app_metadata?.verification_status,
        certification_request_status: session?.user?.user_metadata?.certification_request_status || session?.user?.app_metadata?.certification_request_status,
      });
      const isInternalWorkspaceRole = ['owner', 'admin', 'employee', 'guide'].includes(normalizedRole);

      if (isAdminHost && !isInternalWorkspaceRole) {
        const nonAdminRedirect = buildNonAdminWorkspaceRedirect({
          redirect: redirectQuery || getRedirectPathForRole(normalizedRole || 'customer', accountType),
        });
        window.location.href = nonAdminRedirect;
        return;
      }

      if (isSharedTenantWorkspace && !isLocalSaharaXWorkspace && normalizedRole === 'customer' && !approvedBusinessOwner && !tenantBusinessOwnerLike) {
        const marketplaceRedirect = buildMarketplaceLoginRedirect({
          email: user?.email || formData.email,
          redirect: redirectQuery || '/customer/dashboard',
        });
        window.location.href = marketplaceRedirect;
        return;
      }

      const from = location.state?.from?.pathname;
      const redirectTo =
        redirectQuery ||
        (from && from !== '/' && from !== '/login' && from !== '/register'
          ? from
          : getRedirectPathForRole(user.role, accountType));
      const finalRedirectTo = resolveHostAwareRedirect(redirectTo);
      console.log(`✅ Auth ready, redirecting to: ${finalRedirectTo}`);
      if (/^https?:\/\//i.test(finalRedirectTo)) {
        window.location.href = finalRedirectTo;
        return;
      }
      navigate(finalRedirectTo, { replace: true });
    }
  }, [authLoading, formData.email, initialized, isLocalSaharaXWorkspace, isSharedTenantWorkspace, location.state, navigate, redirectQuery, session?.user, session?.user?.app_metadata?.certification_request_status, session?.user?.app_metadata?.verification_status, session?.user?.user_metadata?.certification_request_status, session?.user?.user_metadata?.verification_status, user]);

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
      const normalizedMessage = String(signInError.message || '').trim().toLowerCase();
      if (normalizedMessage.includes('email not confirmed')) {
        setError(
          tr(
            'Your email is not confirmed yet. Open the confirmation email first, then sign in again.',
            "Votre e-mail n'est pas encore confirmé. Ouvrez d'abord l'e-mail de confirmation, puis reconnectez-vous."
          )
        );
      } else {
        setError(signInError.message || tr('Login failed. Please try again.', "Échec de la connexion. Veuillez réessayer."));
      }
    } else {
      setSuccess(tr('Login successful! Redirecting...', 'Connexion réussie ! Redirection...'));
    }
  };

  const handleForgotPassword = () => {
    setError('');
    setSuccess('');
    setResetSuccess('');
    setResetEmail(formData.email.trim());
    setShowReset(true);
  };

  const handleSendReset = async () => {
    const email = resetEmail.trim();
    if (!email) {
      setError(tr('Please enter your email to reset the password.', 'Veuillez saisir votre e-mail pour réinitialiser le mot de passe.'));
      return;
    }
    setError('');
    setResetSuccess('');
    setResetSending(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    try {
      await requestPasswordResetEmail({ email, redirectTo });
      setResetSuccess(tr('Password reset link sent. Check your email.', 'Lien de réinitialisation envoyé. Vérifiez votre e-mail.'));
    } catch (resetError) {
      setResetSending(false);
      const message = resetError.message || '';
      const looksLikeRedirect =
        message.toLowerCase().includes('redirect') ||
        message.toLowerCase().includes('url') ||
        resetError.status === 400;
      if (looksLikeRedirect) {
        setError(
          tr(
            `Reset email failed. Please add ${redirectTo} to Supabase Auth redirect URLs.`,
            `Échec de l’e-mail. Ajoutez ${redirectTo} aux redirections autorisées Supabase.`
          )
        );
      } else {
        setError(
          resetError.message ||
            tr('Unable to send reset email.', "Impossible d'envoyer l’e-mail de réinitialisation.")
        );
      }
      return;
    }
    setResetSending(false);
  };

  const handleGoogleContinue = async () => {
    setError('');
    setSuccess('');

    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message || tr('Google sign-in failed. Please try again.', 'La connexion Google a échoué. Veuillez réessayer.'));
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#f8f7ff_0%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white/85 shadow-[0_30px_90px_rgba(76,29,149,0.14)] backdrop-blur sm:rounded-[2.25rem] lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_32%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {loginBrand.eyebrow}
              </div>

              <div className="mt-8 max-w-xl">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {loginBrand.heroTitle}
                </h1>
                <p className="mt-4 max-w-lg text-base leading-7 text-violet-100 sm:text-lg">
                  {loginBrand.heroBody}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white/90 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="mx-auto max-w-md">
              <Link
                to="/website"
                className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-600 transition hover:text-violet-700"
              >
                <ChevronLeft className="h-4 w-4" />
                {tr('Back to website', 'Retour au site')}
              </Link>
              <div className="mb-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                  {loginBrand.introEyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {tr('Sign in to continue', 'Connectez-vous pour continuer')}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {loginBrand.introBody}
                </p>
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleContinue}
                  disabled={isBusy}
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
                      autoComplete="username"
                      inputMode="email"
                      autoCapitalize="none"
                      required
                      disabled={isBusy}
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
                    autoComplete="current-password"
                    required
                    disabled={isBusy}
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

                {showReset && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {tr('Reset your password', 'Réinitialiser votre mot de passe')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr(
                        'We will send a secure reset link to your email.',
                        'Nous enverrons un lien sécurisé à votre adresse e-mail.'
                      )}
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        disabled={isBusy}
                        className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        placeholder={tr('Email for reset link', 'E-mail pour le lien')}
                      />
                      <button
                        type="button"
                        onClick={handleSendReset}
                        disabled={resetSending || isBusy}
                        className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {resetSending ? tr('Sending...', 'Envoi...') : tr('Send link', 'Envoyer')}
                      </button>
                    </div>
                    {resetSuccess && (
                      <p className="mt-3 text-xs font-semibold text-emerald-600">{resetSuccess}</p>
                    )}
                  </div>
                )}

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

                {marketplaceTenantNotice && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                    <p className="text-sm leading-6">{marketplaceTenantNotice}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isBusy ? (
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
                    disabled={isBusy}
                    className="text-sm font-medium text-violet-600 transition-colors hover:text-violet-700 disabled:text-violet-300"
                  >
                    {tr('Forgot your password?', 'Mot de passe oublié ?')}
                  </button>
                  <Link
                    to={redirectQuery ? `/register?redirect=${encodeURIComponent(redirectQuery)}&email=${encodeURIComponent(resetEmail || formData.email || '')}` : '/register'}
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
