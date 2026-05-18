import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Compass,
  FileText,
  MapPinned,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import CustomerExperienceService from '../../services/CustomerExperienceService';

const STATUS_TONE_MAP = {
  scheduled: 'bg-sky-50 text-sky-700',
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-rose-50 text-rose-700',
  canceled: 'bg-rose-50 text-rose-700',
  no_show: 'bg-amber-50 text-amber-700',
  expired: 'bg-slate-100 text-slate-700',
};

const STATUS_LABELS = {
  scheduled: { en: 'Upcoming', fr: 'À venir' },
  active: { en: 'Active', fr: 'Actif' },
  completed: { en: 'Completed', fr: 'Terminé' },
  cancelled: { en: 'Cancelled', fr: 'Annulé' },
  canceled: { en: 'Cancelled', fr: 'Annulé' },
  no_show: { en: 'No-show', fr: 'Absent' },
  expired: { en: 'Expired', fr: 'Expiré' },
};

const formatDateTime = (value, locale) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  `${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(Number(amount || 0))} ${currencyCode}`;

const DetailBlock = ({ eyebrow, title, children }) => (
  <section className="rounded-[1.5rem] bg-white p-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{eyebrow}</p>
    <h3 className="mt-2 text-sm font-bold text-slate-900">{title}</h3>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);

const DetailRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
  </div>
);

const AccountTourDetailsPage = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tourId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tour, setTour] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user || !tourId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const detail = await CustomerExperienceService.getCustomerTourDetail(user, tourId);
        if (cancelled) return;
        setTour(detail);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load tour details right now.', 'Impossible de charger les détails du tour pour le moment.'));
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
  }, [user?.id, tourId, isFrench]);

  const statusKey = String(tour?.status || '').toLowerCase();
  const statusTone = STATUS_TONE_MAP[statusKey] || 'bg-slate-100 text-slate-700';
  const statusLabel = STATUS_LABELS[statusKey]?.[locale] || tour?.status || tr('Scheduled', 'Planifié');
  const scheduleSummary = useMemo(
    () => [formatDateTime(tour?.scheduledFor, locale), tour?.location, tour?.operatorName].filter(Boolean).join(' • '),
    [tour?.scheduledFor, tour?.location, tour?.operatorName, locale]
  );

  return (
    <div className="space-y-4">
      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="sticky top-0 z-10 bg-transparent px-5 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Tour details', 'Détails du tour')}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{tour?.packageName || tr('Tour booking', 'Réservation de tour')}</h2>
              {!loading ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
                  <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    {tour?.groupId || tr('Reference pending', 'Référence en attente')}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {tour?.operatorName || tr('Certified operator', 'Opérateur certifié')}
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => navigate('/account/rentals?panel=tours')}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {tr('Back', 'Retour')}
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="space-y-4">
              <section className="overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.14),_transparent_34%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_58%,_#f8f5ff_100%)] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="h-7 w-40 animate-pulse rounded-full bg-white/90" />
                    <div className="mt-4 h-9 w-56 animate-pulse rounded-2xl bg-white/90" />
                    <div className="mt-3 h-4 w-full max-w-sm animate-pulse rounded-full bg-white/90" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="h-8 w-40 animate-pulse rounded-full bg-white/90" />
                      <div className="h-8 w-44 animate-pulse rounded-full bg-white/90" />
                    </div>
                  </div>
                  <div className="h-28 min-w-[220px] animate-pulse rounded-[1.5rem] bg-white/90 shadow-[0_14px_36px_rgba(15,23,42,0.08)]" />
                </div>
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-40 animate-pulse rounded-[1.5rem] bg-white" />
                ))}
              </div>
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.20),_transparent_34%),linear-gradient(135deg,_#ffffff_0%,_#eef2ff_58%,_#f8f5ff_100%)] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2">
                      <span className="inline-flex w-fit rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                        {tr('Tour summary', 'Résumé du tour')}
                      </span>
                      {tour?.routeType ? (
                        <span className="inline-flex w-fit rounded-full border border-violet-100 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                          {tour.routeType}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-[2rem] font-bold leading-[1.05] tracking-tight text-slate-950">
                      {tour?.groupId || tr('Reference pending', 'Référence en attente')}
                    </p>
                    <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                      <p className="font-medium text-slate-600">
                        {formatDateTime(tour?.scheduledFor, locale) || tr('Schedule pending', 'Planning en attente')}
                      </p>
                      <p className="font-medium text-slate-600">
                        {tour?.location || tr('Meeting point shared later', 'Point de rendez-vous communiqué plus tard')}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      <span className="inline-flex rounded-full border border-white/80 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                        {tour?.operatorName || tr('Tour operator', 'Opérateur de tour')}
                      </span>
                      <span className="inline-flex rounded-full border border-white/80 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                        {tour?.guideName || tr('Guide assigned later', 'Guide assigné plus tard')}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-[220px] rounded-[1.5rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Current total', 'Total actuel')}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(tour?.totalAmount, 'MAD', locale)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        {tour?.remainingAmount > 0 ? tr('Pending', 'En attente') : tr('Paid', 'Payé')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[1.35rem] bg-white/88 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <Users className="h-4 w-4" />
                      {tr('Guests', 'Participants')}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{tour?.ridersCount || 1}</p>
                  </div>
                  <div className="rounded-[1.35rem] bg-white/88 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <CalendarClock className="h-4 w-4" />
                      {tr('Duration', 'Durée')}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {tour?.durationHours > 0 ? tr(`${tour.durationHours} hours`, `${tour.durationHours} heures`) : tr('Scheduled route', 'Parcours planifié')}
                    </p>
                  </div>
                  <div className="rounded-[1.35rem] bg-white/88 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <Wallet className="h-4 w-4" />
                      {tr('Remaining', 'Restant')}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{formatMoney(tour?.remainingAmount, 'MAD', locale)}</p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <DetailBlock eyebrow={tr('Overview', 'Vue générale')} title={tr('Booking summary', 'Résumé réservation')}>
                  <DetailRow label={tr('Package', 'Package')} value={tour?.packageName || '—'} />
                  <DetailRow label={tr('Reference', 'Référence')} value={tour?.groupId || '—'} />
                  <DetailRow label={tr('Operator', 'Opérateur')} value={tour?.operatorName || tr('Certified operator', 'Opérateur certifié')} />
                  <DetailRow label={tr('Guide', 'Guide')} value={tour?.guideName || tr('Assigned later', 'Assigné plus tard')} />
                  <DetailRow label={tr('Route', 'Itinéraire')} value={tour?.routeType || '—'} />
                </DetailBlock>

                <DetailBlock eyebrow={tr('Money', 'Montants')} title={tr('Payment status', 'Statut du paiement')}>
                  <DetailRow label={tr('Total', 'Total')} value={formatMoney(tour?.totalAmount, 'MAD', locale)} />
                  <DetailRow label={tr('Paid now', 'Payé maintenant')} value={formatMoney(tour?.paidAmount, 'MAD', locale)} />
                  <DetailRow label={tr('Remaining', 'Restant')} value={formatMoney(tour?.remainingAmount, 'MAD', locale)} />
                  <DetailRow label={tr('Payment state', 'État du paiement')} value={tour?.remainingAmount > 0 ? tr('Pending', 'En attente') : tr('Paid', 'Payé')} />
                </DetailBlock>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <DetailBlock eyebrow={tr('Schedule', 'Programme')} title={tr('Meeting details', 'Détails du rendez-vous')}>
                  <DetailRow label={tr('Start', 'Début')} value={formatDateTime(tour?.scheduledFor, locale) || '—'} />
                  <DetailRow label={tr('End', 'Fin')} value={formatDateTime(tour?.scheduledEndAt, locale) || '—'} />
                  <DetailRow label={tr('Location', 'Lieu')} value={tour?.location || tr('Shared later', 'Communiqué plus tard')} />
                  <DetailRow label={tr('Assignment mode', 'Mode d’attribution')} value={tour?.assignmentMode || '—'} />
                </DetailBlock>

                <DetailBlock eyebrow={tr('Guests', 'Participants')} title={tr('Riders and requirements', 'Participants et exigences')}>
                  <DetailRow label={tr('Riders', 'Participants')} value={tour?.ridersCount || 1} />
                  <DetailRow label={tr('Quads', 'Quads')} value={tour?.quadCount || 1} />
                  <DetailRow label={tr('License required', 'Permis requis')} value={tour?.requiresLicense ? tr('Yes', 'Oui') : tr('No', 'Non')} />
                  <DetailRow label={tr('Customer', 'Client')} value={tour?.customerName || '—'} />
                </DetailBlock>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <DetailBlock eyebrow={tr('Documents', 'Documents')} title={tr('Contract and receipt state', 'État du contrat et du reçu')}>
                  <div className="grid gap-3">
                    <div className="flex items-start justify-between rounded-[1.25rem] bg-violet-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-violet-600">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{tr('Contract sharing', 'Partage du contrat')}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {tour?.shareContract
                              ? tr('Contract is marked to be shared for this tour.', 'Le contrat est marqué pour être partagé pour ce tour.')
                              : tr('Contract was optional for this tour.', 'Le contrat était optionnel pour ce tour.')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between rounded-[1.25rem] bg-emerald-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-emerald-600">
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{tr('Receipt status', 'Statut du reçu')}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {tour?.receiptIssued
                              ? tr('Receipt was issued or marked shared for this tour.', 'Le reçu a été émis ou marqué comme partagé pour ce tour.')
                              : tr('Receipt is still pending for this booking.', 'Le reçu est encore en attente pour cette réservation.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </DetailBlock>

                <DetailBlock eyebrow={tr('Support', 'Support')} title={tr('Tracking and help', 'Suivi et aide')}>
                  <DetailRow label={tr('Reference', 'Référence')} value={tour?.groupId || '—'} />
                  <DetailRow label={tr('Operator', 'Opérateur')} value={tour?.operatorName || tr('Certified operator', 'Opérateur certifié')} />
                  <DetailRow label={tr('Tracking link', 'Lien de suivi')} value={tour?.trackingUrl ? tr('Available', 'Disponible') : tr('Not shared yet', 'Pas encore partagé')} />
                  {tour?.trackingUrl ? (
                    <a
                      href={tour.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      {tr('Open tracking', 'Ouvrir le suivi')}
                      <Compass className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">{tr('Use this tour reference when you contact support.', 'Utilisez cette référence de tour lorsque vous contactez le support.')}</p>
                  )}
                </DetailBlock>
              </section>

              <DetailBlock eyebrow={tr('Activity', 'Activité')} title={tr('Recent activity', 'Activité récente')}>
                {Array.isArray(tour?.timeline) && tour.timeline.length ? (
                  <div className="space-y-3">
                    {tour.timeline.map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-violet-500" />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="text-sm text-slate-500">{formatDateTime(item.at, locale) || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{tr('Activity will appear here as the tour progresses.', 'L’activité apparaîtra ici au fur et à mesure du déroulement du tour.')}</p>
                )}
              </DetailBlock>

              <section className="rounded-[1.5rem] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Support', 'Support')}</p>
                    <h3 className="mt-2 text-sm font-bold text-slate-900">{tr('Keep your reference ready', 'Gardez votre référence prête')}</h3>
                    <p className="mt-3 text-sm text-slate-500">{scheduleSummary || tr('Your schedule summary stays here for confirmations and support.', 'Le résumé de votre programme reste ici pour les confirmations et le support.')}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default AccountTourDetailsPage;
