import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleDashed, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import VerificationUploadField from './VerificationUploadField';
import VerificationStatusBadge from './VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import {
  PROFILE_REQUIRED_VERIFICATIONS,
  buildEntityVerificationSummary,
  getVerificationTypeLabel,
} from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';

const ProfileVerificationCard = ({ profile }) => {
  const { i18n } = useTranslation();
  const location = useLocation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const profileId = profile?.id;
  const summary = useMemo(() => buildEntityVerificationSummary(requests, 'user'), [requests]);

  const loadRequests = useCallback(async () => {
    if (!profileId) return;
    try {
      setLoading(true);
      const result = await VerificationService.getEntityVerificationSummary('user', profileId);
      setRequests(result.requests || []);
    } catch (error) {
      console.warn('Unable to load profile verification summary:', error.message);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const latestByType = summary.latestByType || {};
  const completedCount = summary.approved?.length || 0;
  const requiredCount = summary.requiredTypes?.length || PROFILE_REQUIRED_VERIFICATIONS.length;
  const progress = Math.round((completedCount / Math.max(requiredCount, 1)) * 100);

  const checklist = PROFILE_REQUIRED_VERIFICATIONS.map((verificationType) => {
    const request = latestByType[verificationType];
    const normalizedStatus = String(request?.status || '').toLowerCase();
    const complete = normalizedStatus === 'approved';
    const blocked = ['rejected', 'suspended', 'expired'].includes(normalizedStatus);
    const stateLabel = complete
      ? tr('Done', 'Terminé')
      : blocked
        ? tr('Fix', 'Corriger')
        : request
          ? tr('Waiting', 'En attente')
          : tr('Next', 'Suivant');

    return {
      id: verificationType,
      label: getVerificationTypeLabel(verificationType, language),
      complete,
      blocked,
      stateLabel,
    };
  });

  const nextTask = checklist.find((item) => !item.complete) || null;
  const milestoneLabel = summary.complete
    ? tr('Owner verification unlocked', 'Vérification propriétaire débloquée')
    : nextTask
      ? tr(`Finish ${nextTask.label}`, `Terminer ${nextTask.label}`)
      : tr('Verification in progress', 'Vérification en cours');
  const isAdminWorkspaceContext = location.pathname.startsWith('/admin/');
  const nextDocumentType = String(nextTask?.id || 'profile_id').trim().toLowerCase() || 'profile_id';
  const verificationTaskHref = isAdminWorkspaceContext
    ? `/admin/profile/verification?documentType=${encodeURIComponent(nextDocumentType)}`
    : `/account/verification?documentType=${encodeURIComponent(nextDocumentType)}`;
  const verificationTaskState = isAdminWorkspaceContext
    ? {
        from: '/admin/profile',
        fromLabel: tr('Back to profile', 'Retour au profil'),
      }
    : {
        from: `${location.pathname}${location.search}`,
        fromLabel: tr('Back to profile', 'Retour au profil'),
      };

  return (
    <div className="mt-5 rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
      <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              {tr('Owner trust mission', 'Mission confiance propriétaire')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] border border-violet-200 bg-white text-violet-700 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-black text-slate-950">
                  {tr('Complete verification', 'Compléter la vérification')}
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'Finish the owner checks once, then unlock trusted marketplace workflows.',
                    'Terminez les contrôles propriétaire une fois, puis débloquez les opérations marketplace vérifiées.'
                  )}
                </p>
              </div>
            </div>
          </div>
          <VerificationStatusBadge status={summary.status} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.9fr)]">
          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {tr('Verification progress', 'Progression de vérification')}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-black text-slate-950">{progress}%</span>
                  <span className="pb-1 text-sm font-semibold text-slate-500">
                    {tr(`${completedCount}/${requiredCount} done`, `${completedCount}/${requiredCount} terminé`)}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
                <Sparkles className="h-3.5 w-3.5" />
                {milestoneLabel}
              </span>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${Math.max(6, progress)}%` }}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] border px-4 py-3 ${
                    item.complete
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : item.blocked
                        ? 'border-rose-200 bg-rose-50/80'
                        : 'border-slate-200 bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {item.stateLabel}
                      </p>
                    </div>
                    <span
                      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl ${
                        item.complete
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.blocked
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-violet-100 text-violet-700'
                      }`}
                    >
                      {item.complete ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CircleDashed className="h-4 w-4" />
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {tr('Next milestone', 'Prochain palier')}
            </p>
            <h4 className="mt-2 text-lg font-black text-slate-950">
              {summary.complete
                ? tr('You are verified', 'Vous êtes vérifié')
                : nextTask
                  ? nextTask.label
                  : tr('Verification review', 'Revue de vérification')}
            </h4>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {summary.complete
                ? tr(
                    'Your owner trust checks are complete. You can move forward with the rest of the workflow.',
                    'Vos contrôles de confiance propriétaire sont terminés. Vous pouvez avancer dans le reste du parcours.'
                  )
                : tr(
                    'Upload the missing item, then wait for the review team to approve it.',
                    'Téléversez l’élément manquant, puis attendez que l’équipe de revue l’approuve.'
                  )}
            </p>

            <Link
              to={verificationTaskHref}
              state={verificationTaskState}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"
            >
              {summary.complete
                ? tr('Open verification', 'Ouvrir la vérification')
                : tr('Open next task', 'Ouvrir la prochaine tâche')}
              <ArrowRight className="h-4 w-4" />
            </Link>

            {!summary.complete ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {tr(
                  'Once this mission is approved, your private owner tools stay unlocked.',
                  'Une fois cette mission approuvée, vos outils propriétaire privé restent débloqués.'
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            {tr('Verification', 'Vérification')}
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Verification details', 'Détails de vérification')}</h3>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
            {tr(
              'Use the upload blocks below to replace, scan, or inspect the files tied to this mission.',
              'Utilisez les blocs ci-dessous pour remplacer, scanner ou consulter les fichiers liés à cette mission.'
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {PROFILE_REQUIRED_VERIFICATIONS.map((verificationType) => (
          <VerificationUploadField
            key={verificationType}
            entityType="user"
            entityId={profileId}
            ownerUserId={profileId}
            verificationType={verificationType}
            request={latestByType[verificationType]}
            disabled={!profileId || loading}
            onUploaded={loadRequests}
          />
        ))}
      </div>

      {!summary.complete && (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {tr(
            `${getVerificationTypeLabel('profile_id', language)} must be approved before full owner activation.`,
            `${getVerificationTypeLabel('profile_id', language)} doit être approuvé avant l’activation complète du propriétaire.`
          )}
        </p>
      )}
    </div>
  );
};

export default ProfileVerificationCard;
