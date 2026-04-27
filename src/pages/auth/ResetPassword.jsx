import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ChevronLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import i18n from '../../i18n';
import { supabase } from '../../lib/supabase';

const ResetPassword = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [verifyingLink, setVerifyingLink] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      const tokenHash = String(searchParams.get('token_hash') || '').trim();
      const type = String(searchParams.get('type') || 'recovery').trim();

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type || 'recovery',
        });

        if (!mounted) return;

        if (verifyError) {
          setError(
            verifyError.message ||
              tr(
                'This reset link is invalid or has expired.',
                'Ce lien de réinitialisation est invalide ou expiré.'
              )
          );
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data?.session?.user));
      setVerifyingLink(false);
      setSessionReady(true);
    };

    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setHasSession(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!password || password.length < 6) {
      setError(tr('Password must be at least 6 characters.', 'Le mot de passe doit contenir au moins 6 caractères.'));
      return;
    }
    if (password !== confirmPassword) {
      setError(tr('Passwords do not match.', 'Les mots de passe ne correspondent pas.'));
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message || tr('Unable to update password right now.', "Impossible de mettre à jour le mot de passe."));
      return;
    }

    setSuccess(tr('Password updated. Please sign in again.', 'Mot de passe mis à jour. Veuillez vous reconnecter.'));
    await supabase.auth.signOut();
    setTimeout(() => {
      navigate('/login', { state: { message: tr('Password updated. Please sign in again.', 'Mot de passe mis à jour. Veuillez vous reconnecter.') } });
    }, 900);
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_30%),linear-gradient(180deg,_#f8f7ff_0%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white/90 shadow-[0_30px_90px_rgba(76,29,149,0.14)] backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_32%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                {tr('Account Security', 'Sécurité du compte')}
              </div>
              <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
                {tr('Set a new password', 'Définissez un nouveau mot de passe')}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-violet-100 sm:text-lg">
                {tr(
                  'Create a new password to keep your SaharaX account secure.',
                  'Créez un nouveau mot de passe pour sécuriser votre compte SaharaX.'
                )}
              </p>
            </div>
          </section>

          <section className="bg-white/95 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
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
                  {tr('Reset Password', 'Réinitialiser')}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {tr('Create a new password', 'Créez un nouveau mot de passe')}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {tr('Use the form below to set a new password.', 'Utilisez le formulaire ci-dessous pour définir un nouveau mot de passe.')}
                </p>
              </div>

              {!sessionReady || verifyingLink ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  {tr('Preparing reset form...', 'Préparation du formulaire...')}
                </div>
              ) : !hasSession ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                  {tr(
                    'Please open the reset link from your email to continue.',
                    'Veuillez ouvrir le lien de réinitialisation reçu par e-mail.'
                  )}
                  <div className="mt-3">
                    <Link to="/login" className="font-semibold text-violet-600 hover:text-violet-700">
                      {tr('Back to sign in', 'Retour à la connexion')}
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      {tr('New password', 'Nouveau mot de passe')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-4 pr-12 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                        placeholder={tr('At least 6 characters', 'Au moins 6 caractères')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        aria-label={showPassword ? tr('Hide password', 'Masquer le mot de passe') : tr('Show password', 'Afficher le mot de passe')}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      {tr('Confirm password', 'Confirmer le mot de passe')}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-3.5 pl-4 pr-12 text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                        placeholder={tr('Repeat the password', 'Répétez le mot de passe')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                        aria-label={showConfirmPassword ? tr('Hide password', 'Masquer le mot de passe') : tr('Show password', 'Afficher le mot de passe')}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        <span>{success}</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {saving ? tr('Updating...', 'Mise à jour...') : tr('Update password', 'Mettre à jour')}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
