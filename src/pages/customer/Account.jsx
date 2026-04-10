import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarClock, Camera, ChevronDown, ChevronRight, Compass, CreditCard, Globe2, LogOut, Mail, MapPin, Save, ShieldCheck, UserCircle2, WalletCards } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import customerExperienceService from '../../services/CustomerExperienceService';
import UserProfileService from '../../services/UserProfileService';
import { syncCustomerAccountForAuthUser } from '../../services/CustomerAccountSyncService';
import ProfilePictureUpload from '../../components/profile/ProfilePictureUpload';
import PublicSiteChrome from '../../components/public/PublicSiteChrome';
import PhoneInputWithCountryCode from '../../components/forms/PhoneInputWithCountryCode';
import { isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../../utils/accountType';

const Account = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { session, signOut, getBusinessOwnerHomePath } = useAuth();
  const navigate = useNavigate();
  const authUser = session?.user || null;
  const accountType = authUser?.user_metadata?.account_type || '';
  const platformOwnerOverride = isPlatformOwnerEmail(authUser?.email);
  const businessOwnerFreezeRedirect = isBusinessOwnerAccountType(accountType)
    ? getBusinessOwnerHomePath({
        account_type: accountType,
        verification_status: authUser?.user_metadata?.verification_status || authUser?.app_metadata?.verification_status,
        subscription_status: authUser?.user_metadata?.subscription_status || authUser?.app_metadata?.subscription_status,
      })
    : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [expandedReservations, setExpandedReservations] = useState({});
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    city: '',
    country: '',
    preferredLanguage: 'en',
  });

  const syncFormDataFromSnapshot = (data) => {
    setFormData({
      fullName: data?.profile?.fullName || '',
      email: data?.profile?.email || authUser?.email || '',
      phone: data?.profile?.phone || '',
      city: data?.profile?.city || '',
      country: data?.profile?.country || '',
      preferredLanguage: data?.profile?.preferredLanguage || 'en',
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!authUser) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await customerExperienceService.getCustomerAccountSnapshot(authUser);
        if (!cancelled) {
          setSnapshot(data);
          syncFormDataFromSnapshot(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your account right now.', 'Impossible de charger votre compte pour le moment.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, isFrench]);

  const updateField = (field, value) => {
    if (!isEditing) return;
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const reloadSnapshot = async () => {
    if (!authUser) return null;
    const data = await customerExperienceService.getCustomerAccountSnapshot(authUser);
    setSnapshot(data);
    return data;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!authUser || !isEditing) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const trimmedContactEmail = formData.email.trim();
      if (trimmedContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContactEmail)) {
        throw new Error(tr('Please enter a valid email address.', 'Veuillez saisir une adresse e-mail valide.'));
      }

      const metadataUpdates = {
        full_name: formData.fullName.trim(),
        contact_email: trimmedContactEmail,
        phone: formData.phone.trim(),
        city: formData.city.trim(),
        country: formData.country.trim(),
        default_language: formData.preferredLanguage,
      };

      const { error: authError } = await UserProfileService.updateAuthMetadata({
        data: {
          ...authUser.user_metadata,
          ...metadataUpdates,
        },
      });

      if (authError) {
        throw authError;
      }

      await syncCustomerAccountForAuthUser(
        {
          ...authUser,
          user_metadata: {
            ...(authUser.user_metadata || {}),
            ...metadataUpdates,
          },
        },
        {
          role: authUser.user_metadata?.role || authUser.app_metadata?.role || 'customer',
          accountType: authUser.user_metadata?.account_type || authUser.app_metadata?.account_type || 'customer',
          fullName: metadataUpdates.full_name,
          phone: metadataUpdates.phone,
          email: authUser.email,
          contactEmail: metadataUpdates.contact_email,
        }
      );

      const refreshedData = await reloadSnapshot();
      syncFormDataFromSnapshot(refreshedData);
      setIsEditing(false);
      setSuccess(tr('Your workspace details were updated.', 'Les détails de votre espace ont été mis à jour.'));
    } catch (saveError) {
      setError(saveError?.message || tr('Unable to update your workspace.', 'Impossible de mettre à jour votre espace.'));
    } finally {
      setSaving(false);
    }
  };

  const handleProfilePictureUpdate = async () => {
    const data = await reloadSnapshot();
    if (data) {
      setSnapshot(data);
    }
  };

  const handleSignOut = async () => {
    setError('');
    setSuccess('');
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleStartEditing = () => {
    setError('');
    setSuccess('');
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    syncFormDataFromSnapshot(snapshot);
    setError('');
    setSuccess('');
    setIsEditing(false);
  };

  const wallet = snapshot?.wallet || customerExperienceService.getEmptyWallet();
  const transactions = snapshot?.walletTransactions || [];
  const loyalty = snapshot?.loyalty || {
    tier: 'Standard',
    points: 0,
    totalSpend: 0,
    activeBookings: 0,
  };
  const upcomingBookings = snapshot?.upcoming || [];
  const recentBookings = snapshot?.recent || [];
  const reservationCards = [
    ...upcomingBookings.slice(0, 2).map((booking) => ({ ...booking, bucket: 'upcoming' })),
    ...recentBookings.slice(0, 2).map((booking) => ({ ...booking, bucket: 'recent' })),
  ];

  const formatBookingWindow = (booking) => {
    if (!booking?.startDate) return booking?.dateLabel || '—';
    try {
      const start = new Date(booking.startDate);
      const end = booking.endDate ? new Date(booking.endDate) : null;
      const dateLabel = start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-GB', {
        month: 'short',
        day: 'numeric',
      });
      const startTime = start.toLocaleTimeString(isFrench ? 'fr-FR' : 'en-GB', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const endTime = end
        ? end.toLocaleTimeString(isFrench ? 'fr-FR' : 'en-GB', { hour: 'numeric', minute: '2-digit' })
        : null;
      return endTime ? `${dateLabel} • ${startTime} - ${endTime}` : `${dateLabel} • ${startTime}`;
    } catch {
      return booking?.dateLabel || '—';
    }
  };

  const getReservationStatusTone = (booking) => {
    const status = String(booking?.status || booking?.paymentStatus || '').toLowerCase();
    if (status.includes('active') || status.includes('paid')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status.includes('scheduled') || status.includes('upcoming')) return 'border-violet-200 bg-violet-50 text-violet-700';
    if (status.includes('cancel')) return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };

  const toggleReservation = (id) => {
    setExpandedReservations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (platformOwnerOverride) {
    return <Navigate to="/admin/profile" replace />;
  }

  if (businessOwnerFreezeRedirect) {
    return <Navigate to={businessOwnerFreezeRedirect} replace />;
  }

  if (loading) {
    return (
      <>
        <PublicSiteChrome current="home" />
        <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#ffffff_100%)] p-6">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            {tr('Loading your workspace...', 'Chargement de votre espace...')}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PublicSiteChrome current="home" />
      <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#ffffff_100%)] px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-6">
          <div className="rounded-[1.5rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.14),_transparent_36%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_100%)] p-4 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="shrink-0 rounded-[1.5rem] border border-white/80 bg-white/75 p-2 shadow-sm">
                  <ProfilePictureUpload
                    userId={authUser?.id}
                    currentPictureUrl={snapshot?.profile?.profilePictureUrl}
                    onPictureUpdate={handleProfilePictureUpdate}
                    size="large"
                    editable={isEditing}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">
                    {tr('My Workspace', 'Mon espace')}
                  </p>
                  <h1 className="mt-2 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {snapshot?.profile?.fullName || authUser?.email}
                  </h1>
                  <p className="mt-1 break-all text-sm text-slate-600">{authUser?.email}</p>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {isEditing
                      ? tr('Editing is active. Save or cancel when you finish.', 'La modification est active. Enregistrez ou annulez quand vous avez terminé.')
                      : tr('Your workspace stays compact until you choose to edit your details.', 'Votre espace reste compact jusqu’à ce que vous choisissiez de modifier vos détails.')}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[420px]">
                <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Loyalty tier', 'Niveau fidélité')}</p>
                  <p className="mt-3 text-xl font-bold text-slate-900">{loyalty.tier}</p>
                </div>
                <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Tracked spend', 'Dépense suivie')}</p>
                  <p className="mt-3 text-xl font-bold text-slate-900">{loyalty.totalSpend} MAD</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="min-w-0 rounded-[1.5rem] border border-emerald-100 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                      <WalletCards className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{tr('Wallet', 'Portefeuille')}</h2>
                      <p className="text-sm text-slate-600">{tr('Your balance and wallet state stay visible first.', 'Votre solde et le statut du portefeuille restent visibles en premier.')}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Available balance', 'Solde disponible')}</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{wallet.balance} {wallet.currencyCode}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white px-3 py-1 text-emerald-700">{tr('Status', 'Statut')}: {wallet.verificationState}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-slate-600">{tr('Pending top-ups', 'Recharges en attente')}: {wallet.pendingTopups} {wallet.currencyCode}</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {transactions.length === 0 ? (
                      <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        {tr('No wallet activity yet.', 'Aucune activité portefeuille pour le moment.')}
                      </div>
                    ) : (
                      transactions.slice(0, 3).map((row) => (
                        <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold capitalize text-slate-900">{row.type}</p>
                            <p className="text-sm font-semibold text-slate-700">{row.amount} {wallet.currencyCode}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{row.note || row.status}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
                      <CalendarClock className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{tr('My reservations', 'Mes réservations')}</h2>
                      <p className="text-sm text-slate-600">{tr('Compact first, expandable when you need more.', 'Compact d’abord, extensible quand vous avez besoin de plus.')}</p>
                    </div>
                  </div>

                  {reservationCards.length === 0 ? (
                    <div className="mt-5 rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      {tr('No reservations found yet. Once you book from the website, they will appear here.', 'Aucune réservation trouvée pour le moment. Une fois que vous réservez depuis le site, elles apparaîtront ici.')}
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {reservationCards.map((booking) => {
                        const expanded = Boolean(expandedReservations[booking.id]);
                        return (
                          <div key={`${booking.bucket}-${booking.id}`} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/90 px-4 py-4">
                            <button
                              type="button"
                              onClick={() => toggleReservation(booking.id)}
                              className="flex w-full items-start justify-between gap-3 text-left"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">{booking.modelName}</p>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getReservationStatusTone(booking)}`}>
                                    {booking.bucket === 'upcoming' ? tr('Upcoming', 'À venir') : tr('Recent', 'Récent')}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-slate-600">{formatBookingWindow(booking)}</p>
                                <p className="mt-1 text-xs font-semibold text-violet-700">{booking.rentalId}</p>
                              </div>
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-slate-900">{booking.total} MAD</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{booking.status || booking.paymentStatus}</p>
                                </div>
                                {expanded ? <ChevronDown className="mt-1 h-4 w-4 text-slate-400" /> : <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />}
                              </div>
                            </button>

                            {expanded ? (
                              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
                                <p>{booking.city} • {booking.category}</p>
                                {booking.paymentStatus ? <p>{tr('Payment', 'Paiement')}: {booking.paymentStatus}</p> : null}
                                {booking.depositAmount ? <p>{tr('Deposit', 'Caution')}: {booking.depositAmount} MAD</p> : null}
                                {booking.isWebsiteBooking ? (
                                  <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                                    {tr('Website reservation', 'Réservation site web')}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => navigate('/rent')}
                          className="flex items-center justify-between rounded-[1.25rem] border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-4 py-4 text-left transition hover:border-violet-300 hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-violet-100 p-2.5 text-violet-700">
                              <Compass className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{tr('Book a rental', 'Réserver une location')}</p>
                              <p className="text-xs text-slate-500">{tr('Browse certified vehicles', 'Voir les véhicules certifiés')}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-violet-500" />
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate('/tours')}
                          className="flex items-center justify-between rounded-[1.25rem] border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-4 py-4 text-left transition hover:border-indigo-300 hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-indigo-100 p-2.5 text-indigo-700">
                              <CalendarClock className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{tr('Book a tour', 'Réserver un tour')}</p>
                              <p className="text-xs text-slate-500">{tr('Explore guided experiences', 'Voir les expériences guidées')}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-indigo-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSave} className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                      <UserCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{tr('Profile details', 'Détails du profil')}</h2>
                      <p className="text-sm text-slate-600">{tr('Your profile stays small and read-only until you choose to edit it.', 'Votre profil reste compact et en lecture seule jusqu’à ce que vous choisissiez de le modifier.')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCancelEditing}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          {tr('Cancel', 'Annuler')}
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800 disabled:opacity-70"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? tr('Saving...', 'Enregistrement...') : tr('Save', 'Enregistrer')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartEditing}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)] transition-all hover:from-violet-700 hover:to-indigo-800"
                      >
                        {tr('Edit profile', 'Modifier le profil')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Full name', 'Nom complet')}</label>
                    <input
                      value={formData.fullName}
                      onChange={(e) => updateField('fullName', e.target.value)}
                      disabled={!isEditing}
                      className={`block w-full rounded-2xl border px-4 py-3.5 text-slate-900 outline-none transition ${isEditing ? 'border-slate-200 bg-slate-50/80 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100' : 'border-slate-100 bg-slate-50/60 text-slate-700'}`}
                      placeholder={tr('Enter your full name', 'Entrez votre nom complet')}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Contact email', 'Email de contact')}</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        disabled={!isEditing}
                        className={`block w-full rounded-2xl border py-3.5 pl-11 pr-4 text-slate-900 outline-none transition ${isEditing ? 'border-slate-200 bg-slate-50/80 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100' : 'border-slate-100 bg-slate-50/60 text-slate-700'}`}
                        placeholder={tr('Enter your email', 'Entrez votre e-mail')}
                      />
                    </div>
                  </div>

                  <div>
                    <PhoneInputWithCountryCode
                      label={tr('Phone', 'Téléphone')}
                      value={formData.phone}
                      onChange={(value) => updateField('phone', value)}
                      tr={tr}
                      disabled={!isEditing}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">{tr('City', 'Ville')}</label>
                    <input
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      disabled={!isEditing}
                      className={`block w-full rounded-2xl border px-4 py-3.5 text-slate-900 outline-none transition ${isEditing ? 'border-slate-200 bg-slate-50/80 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100' : 'border-slate-100 bg-slate-50/60 text-slate-700'}`}
                      placeholder={tr('Tangier', 'Tanger')}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Country', 'Pays')}</label>
                    <input
                      value={formData.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      disabled={!isEditing}
                      className={`block w-full rounded-2xl border px-4 py-3.5 text-slate-900 outline-none transition ${isEditing ? 'border-slate-200 bg-slate-50/80 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100' : 'border-slate-100 bg-slate-50/60 text-slate-700'}`}
                    />
                  </div>
                </div>

                {error && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                {success && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
              </form>
            </div>

            <div className="min-w-0 space-y-4 sm:space-y-6">
              <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{tr('Profile summary', 'Résumé du profil')}</h2>
                    <p className="text-sm text-slate-600">{tr('Your identity stays compact here, with the important details first.', 'Votre identité reste compacte ici, avec les détails importants en premier.')}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-600" /> {formData.city || tr('No city yet', 'Aucune ville encore')}, {formData.country || tr('No country yet', 'Aucun pays encore')}</p>
                  <p className="mt-2 flex items-center gap-2"><Camera className="h-4 w-4 text-violet-600" /> {tr('Photo and details unlock only after tapping Edit profile.', 'La photo et les détails ne se déverrouillent qu’après avoir appuyé sur Modifier le profil.')}</p>
                  <p className="mt-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-600" /> {tr('Use the SaharaX burger menu above to move to the other modules.', 'Utilisez le menu burger SaharaX ci-dessus pour aller vers les autres modules.')}</p>
                </div>
              </div>

              <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <Globe2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{tr('Preferences', 'Préférences')}</h2>
                    <p className="text-sm text-slate-600">{tr('Language and softer account preferences live lower on the page.', 'La langue et les préférences de compte plus légères se trouvent plus bas sur la page.')}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <label className="mb-3 block text-sm font-medium text-slate-700">{tr('Preferred language', 'Langue préférée')}</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'en', label: 'English' },
                      { id: 'fr', label: 'Français' },
                      { id: 'ar', label: 'العربية' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => updateField('preferredLanguage', option.id)}
                        disabled={!isEditing}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          formData.preferredLanguage === option.id
                            ? 'bg-violet-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                        } ${!isEditing ? 'pointer-events-none opacity-70' : ''}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{tr('Tap Edit profile first if you want to change this preference.', 'Appuyez d’abord sur Modifier le profil si vous souhaitez changer cette préférence.')}</p>
                </div>
              </div>

              <div className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <WalletCards className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{tr('Account status', 'Statut du compte')}</h2>
                    <p className="text-sm text-slate-600">{tr('A small operational summary of your customer account.', 'Un petit résumé opérationnel de votre compte client.')}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Active bookings', 'Réservations actives')}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-900">{loyalty.activeBookings}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Loyalty points', 'Points fidélité')}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-900">{loyalty.points}</p>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-[1.5rem] border border-rose-100 bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{tr('Session', 'Session')}</h2>
                    <p className="text-sm text-slate-600">{tr('Keep sign-out as a secondary action at the very bottom.', 'Gardez la déconnexion comme action secondaire tout en bas.')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {tr('Sign out', 'Se déconnecter')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Account;
