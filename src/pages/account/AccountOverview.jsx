import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CarFront, CheckCircle2, Compass, CreditCard, MessageSquare, ShieldCheck, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import { isBusinessAccountType, isBusinessOwnerAccountType } from '../../utils/accountType';
import AccountStatCard from '../../components/account/AccountStatCard';

const AccountOverview = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [ownerData, setOwnerData] = useState({ vehicles: [], requests: [] });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const accountType = String(
          userProfile?.accountType ||
          user?.user_metadata?.account_type ||
          user?.app_metadata?.account_type ||
          ''
        ).toLowerCase();
        const isOwnerWorkspace =
          String(userProfile?.role || '').toLowerCase() === 'business_owner' ||
          isBusinessOwnerAccountType(accountType) ||
          isBusinessAccountType(accountType);

        const [accountSnapshot, ownerVehiclesResult, ownerRequestsResult] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user),
          isOwnerWorkspace ? BusinessMarketplaceService.getOwnerVehicles(user.id) : Promise.resolve({ vehicles: [] }),
          isOwnerWorkspace ? BusinessMarketplaceService.getOwnerRequests(user.id, 'all') : Promise.resolve({ requests: [] }),
        ]);

        if (cancelled) return;

        setSnapshot(accountSnapshot);
        setOwnerData({
          vehicles: ownerVehiclesResult?.vehicles || [],
          requests: ownerRequestsResult?.requests || [],
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your workspace overview right now.', 'Impossible de charger votre vue générale pour le moment.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, userProfile?.accountType, userProfile?.role, isFrench]);

  const profile = snapshot?.profile || {};
  const upcomingBookings = snapshot?.upcoming || [];
  const recentBookings = snapshot?.recent || [];
  const wallet = snapshot?.wallet || CustomerExperienceService.getEmptyWallet();

  const ownerVehicles = ownerData.vehicles || [];
  const ownerRequests = ownerData.requests || [];
  const pendingOwnerRequests = ownerRequests.filter((request) => String(request.requestStatus || '').toLowerCase() === 'pending').length;
  const pendingApprovals = ownerVehicles.filter((vehicle) => ['draft', 'pending_review', 'approved', 'rejected'].includes(String(vehicle.listingStatus || '').toLowerCase())).length;
  const changesRequested = ownerVehicles.filter((vehicle) => String(vehicle.moderationStatus || '').toLowerCase() === 'changes_requested').length;
  const liveVehicles = ownerVehicles.filter((vehicle) => String(vehicle.listingStatus || '').toLowerCase() === 'live').length;

  const verificationChecks = useMemo(() => {
    const checks = [
      Boolean(profile.fullName),
      Boolean(profile.email),
      Boolean(profile.phone),
      String(userProfile?.verificationStatus || '').toLowerCase() === 'approved',
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile.email, profile.fullName, profile.phone, userProfile?.verificationStatus]);

  const alerts = [
    changesRequested
      ? {
          title: tr('Admin requested updates', 'Admin a demandé des modifications'),
          body: tr('One or more marketplace vehicles need updates before they can move forward again.', 'Un ou plusieurs véhicules marketplace ont besoin de modifications avant de continuer.'),
          href: '/account/marketplace',
        }
      : null,
    pendingOwnerRequests
      ? {
          title: tr('Booking requests waiting', 'Demandes de réservation en attente'),
          body: tr('You have incoming marketplace requests that still need your decision.', 'Vous avez des demandes marketplace qui attendent encore votre décision.'),
          href: '/account/marketplace',
        }
      : null,
    verificationChecks < 100
      ? {
          title: tr('Complete your trust profile', 'Complétez votre profil de confiance'),
          body: tr('Adding the missing profile and verification details will strengthen your private workspace.', 'Ajouter les informations de profil et de vérification manquantes renforcera votre espace privé.'),
          href: '/account/verification',
        }
      : null,
  ].filter(Boolean);

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.16),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_100%)] p-6 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:p-8">
          <div className="h-6 w-28 animate-pulse rounded-full bg-violet-100" />
          <div className="mt-4 h-10 w-72 animate-pulse rounded-2xl bg-white/80" />
          <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded-full bg-white/80" />
        </section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[1.75rem] border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.16),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_100%)] p-6 shadow-[0_24px_70px_rgba(76,29,149,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">{tr('Overview', 'Vue générale')}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {tr('Your private workspace', 'Votre espace privé')}
        </h1>
        <p className="mt-3 max-w-3xl text-base text-slate-600">
          {tr(
            'One place to follow your bookings, trust progress, marketplace activity, and anything that needs your attention next.',
            'Un seul endroit pour suivre vos réservations, votre progression de confiance, votre activité marketplace et tout ce qui demande votre attention ensuite.'
          )}
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.75rem] border border-violet-100 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('Trust progress', 'Progression de confiance')}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {tr('Profile, verification, and workspace readiness in one visual score.', 'Profil, vérification et préparation de l’espace dans un seul score visuel.')}
                </p>
              </div>
              <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700">
                {verificationChecks}%
              </span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-emerald-500" style={{ width: `${verificationChecks}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${profile.fullName ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{tr('Profile', 'Profil')}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${profile.phone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{tr('Phone', 'Téléphone')}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${String(userProfile?.verificationStatus || '').toLowerCase() === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{tr('Verification', 'Vérification')}</span>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{tr('Quick actions', 'Actions rapides')}</p>
            <div className="mt-4 space-y-3">
              <Link to="/account/verification" className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                <span>{tr('Upload missing documents', 'Téléverser les documents manquants')}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/account/marketplace" className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                <span>{tr('Open marketplace workspace', 'Ouvrir l’espace marketplace')}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/customer/profile" className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                <span>{tr('Edit profile details', 'Modifier les détails du profil')}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AccountStatCard eyebrow={tr('Rentals', 'Locations')} value={upcomingBookings.length} label={tr('Upcoming bookings', 'Réservations à venir')} tone="violet" />
        <AccountStatCard eyebrow={tr('History', 'Historique')} value={recentBookings.length} label={tr('Recent activity', 'Activité récente')} tone="slate" />
        <AccountStatCard eyebrow={tr('Wallet', 'Portefeuille')} value={`${wallet.balance || 0} ${wallet.currencyCode || 'MAD'}`} label={tr('Available balance', 'Solde disponible')} tone="emerald" />
        <AccountStatCard eyebrow={tr('Marketplace', 'Marketplace')} value={ownerVehicles.length} label={tr('Owner vehicles', 'Véhicules propriétaire')} tone="sky" hint={tr('Live, pending review, and draft supply from your private owner side.', 'Offre live, en revue et brouillons depuis votre côté propriétaire privé.')} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Action needed', 'Action requise')}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('What needs attention next', 'Ce qui demande votre attention ensuite')}</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <p>{tr('Everything looks calm right now. Your workspace does not have any urgent blockers.', 'Tout semble calme pour le moment. Votre espace n’a pas de blocage urgent.')}</p>
                </div>
              </div>
            ) : (
              alerts.map((alert) => (
                <Link key={alert.title} to={alert.href} className="block rounded-[1.5rem] border border-amber-100 bg-amber-50 p-4 transition hover:border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">{alert.title}</p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">{alert.body}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Activity', 'Activité')}</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">{tr('Recent timeline', 'Timeline récente')}</h2>
          <div className="mt-5 space-y-4">
            {[
              upcomingBookings[0]
                ? {
                    icon: CarFront,
                    title: tr('Upcoming rental ready', 'Location à venir prête'),
                    body: upcomingBookings[0].title || tr('You have a booking coming up soon.', 'Vous avez une réservation qui arrive bientôt.'),
                  }
                : null,
              pendingOwnerRequests
                ? {
                    icon: MessageSquare,
                    title: tr('Marketplace requests waiting', 'Demandes marketplace en attente'),
                    body: tr(`${pendingOwnerRequests} request(s) need your review.`, `${pendingOwnerRequests} demande(s) attendent votre revue.`),
                  }
                : null,
              liveVehicles
                ? {
                    icon: Store,
                    title: tr('Live marketplace supply', 'Offre marketplace live'),
                    body: tr(`${liveVehicles} vehicle(s) are visible publicly.`, `${liveVehicles} véhicule(s) sont visibles publiquement.`),
                  }
                : null,
              {
                icon: ShieldCheck,
                title: tr('Trust layer active', 'Couche de confiance active'),
                body: tr(`Verification progress is currently ${verificationChecks}%.`, `La progression de vérification est actuellement de ${verificationChecks} %.`),
              },
            ].filter(Boolean).map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AccountOverview;
