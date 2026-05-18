import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileBadge,
  Loader2,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import {
  workspacePanelClass,
  workspaceInsetPanelClass,
  workspacePrimaryButtonClass,
  workspaceSecondaryButtonClass,
} from '../../components/account/accountWorkspaceDesignSystem';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import VerificationUploadField from '../../components/verification/VerificationUploadField';
import VerificationService from '../../services/VerificationService';
import MessageService from '../../services/MessageService';
import { resolveReturnPath } from '../../utils/navigationReturn';

const REQUIRED_TYPES = ['driver_license', 'profile_id'];
const VERIFICATION_SUMMARY_TIMEOUT_MS = 8000;
const VERIFICATION_THREAD_TIMEOUT_MS = 5000;

const runWithTimeout = (promise, timeoutMs, errorMessage) => {
  let timeoutId = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  });
};

const buildVerificationThreadKey = ({ entityType, entityId }) =>
  ['verification', 'verification', String(entityType || '').trim().toLowerCase(), String(entityId || '').trim()].join(':');

const attachLatestVerificationNotes = (requests = [], threadMessages = []) => {
  const latestNoteByRequestId = new Map();

  (Array.isArray(threadMessages) ? threadMessages : []).forEach((message) => {
    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const requestId = String(metadata.verificationRequestId || '').trim();
    const messageType = String(message?.message_type || '').trim().toLowerCase();
    const reviewReason = String(metadata.reviewReason || message?.body || '').trim();

    if (!requestId || messageType !== 'verification_note' || !reviewReason) {
      return;
    }

    const existing = latestNoteByRequestId.get(requestId);
    const incomingTimestamp = new Date(message?.created_at || 0).getTime();
    const existingTimestamp = new Date(existing?.created_at || 0).getTime();
    if (existing && existingTimestamp > incomingTimestamp) {
      return;
    }

    latestNoteByRequestId.set(requestId, {
      body: reviewReason,
      created_at: message?.created_at || null,
    });
  });

  return (Array.isArray(requests) ? requests : []).map((request) => {
    const latestNote = latestNoteByRequestId.get(String(request?.id || '').trim());
    const normalizedStatus = String(request?.status || '').trim().toLowerCase();
    return {
      ...request,
      latest_replacement_note: ['rejected', 'suspended'].includes(normalizedStatus) ? latestNote?.body || '' : '',
      latest_replacement_note_at: ['rejected', 'suspended'].includes(normalizedStatus) ? latestNote?.created_at || null : null,
    };
  });
};

const getLatestByType = (requests = []) =>
  requests.reduce((acc, request) => {
    if (!request?.verification_type) return acc;
    if (String(request?.status || '').trim().toLowerCase() === 'archived') return acc;
    if (!acc[request.verification_type]) {
      acc[request.verification_type] = request;
    }
    return acc;
  }, {});

const mapRequestStatusToTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'success';
  if (normalized === 'rejected' || normalized === 'suspended') return 'danger';
  if (normalized === 'pending' || normalized === 'expired') return 'warning';
  return 'neutral';
};

const getRequestStatusLabel = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return tr('Approved', 'Approuvé');
  if (normalized === 'rejected') return tr('Replacement requested', 'Remplacement demandé');
  if (normalized === 'suspended') return tr('Suspended', 'Suspendu');
  if (normalized === 'expired') return tr('Expired', 'Expiré');
  if (normalized === 'pending') return tr('Pending review', 'En attente de révision');
  return tr('Missing', 'Manquant');
};

const getDocumentState = ({
  verificationStatus,
  hasProfileBasics,
  hasIdentityDoc,
  hasDriverLicense,
  latestByType,
  tr,
}) => {
  const normalized = String(verificationStatus || '').toLowerCase();
  const licenseRequest = latestByType?.driver_license || null;
  const identityRequest = latestByType?.profile_id || null;

  if (licenseRequest || identityRequest) {
    const accountTone =
      licenseRequest?.status === 'approved' && identityRequest?.status === 'approved'
        ? 'success'
        : [licenseRequest?.status, identityRequest?.status].some((status) => ['rejected', 'suspended'].includes(String(status || '').toLowerCase()))
          ? 'danger'
          : [licenseRequest?.status, identityRequest?.status].some((status) => String(status || '').toLowerCase() === 'pending')
            ? 'warning'
            : 'neutral';

    return {
      identity: {
        label: identityRequest ? getRequestStatusLabel(identityRequest.status, tr) : tr('Missing', 'Manquant'),
        tone: identityRequest ? mapRequestStatusToTone(identityRequest.status) : 'neutral',
        request: identityRequest,
      },
      license: {
        label: licenseRequest ? getRequestStatusLabel(licenseRequest.status, tr) : tr('Missing', 'Manquant'),
        tone: licenseRequest ? mapRequestStatusToTone(licenseRequest.status) : 'neutral',
        request: licenseRequest,
      },
      account: {
        label:
          licenseRequest?.status === 'approved' && identityRequest?.status === 'approved'
            ? tr('Verified', 'Vérifié')
            : accountTone === 'danger'
              ? tr('Changes required', 'Modifications requises')
              : accountTone === 'warning'
                ? tr('Pending', 'En attente')
                : hasProfileBasics
                  ? tr('In progress', 'En cours')
                  : tr('Unverified', 'Non vérifié'),
        tone: accountTone,
      },
    };
  }

  if (normalized === 'approved') {
    return {
      identity: { label: tr('Approved', 'Approuvé'), tone: 'success', request: null },
      license: { label: tr('Approved', 'Approuvé'), tone: 'success', request: null },
      account: { label: tr('Verified', 'Vérifié'), tone: 'success' },
    };
  }

  if (normalized === 'rejected') {
    return {
      identity: { label: tr('Needs update', 'À corriger'), tone: 'danger', request: null },
      license: { label: tr('Needs update', 'À corriger'), tone: 'danger', request: null },
      account: { label: tr('Changes required', 'Modifications requises'), tone: 'danger' },
    };
  }

  if (normalized === 'pending') {
    return {
      identity: { label: tr('Pending review', 'En attente de révision'), tone: 'warning', request: null },
      license: { label: tr('Pending review', 'En attente de révision'), tone: 'warning', request: null },
      account: { label: tr('Pending', 'En attente'), tone: 'warning' },
    };
  }

  return {
    identity: {
      label: hasIdentityDoc ? tr('Uploaded', 'Téléversé') : tr('Missing', 'Manquant'),
      tone: hasIdentityDoc ? 'warning' : 'neutral',
      request: null,
    },
    license: {
      label: hasDriverLicense ? tr('Uploaded', 'Téléversé') : tr('Missing', 'Manquant'),
      tone: hasDriverLicense ? 'warning' : 'neutral',
      request: null,
    },
    account: {
      label: hasProfileBasics ? tr('In progress', 'En cours') : tr('Unverified', 'Non vérifié'),
      tone: hasProfileBasics ? 'warning' : 'neutral',
    },
  };
};

const AccountVerification = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, userProfile } = useAuth();
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [verificationLoading, setVerificationLoading] = useState(true);
  const [verificationError, setVerificationError] = useState('');
  const [verificationSummary, setVerificationSummary] = useState(null);

  const hasFullName = Boolean(userProfile?.fullName || user?.user_metadata?.full_name);
  const hasEmail = Boolean(user?.email || userProfile?.email);
  const hasPhone = Boolean(userProfile?.phone || user?.user_metadata?.phone);
  const hasProfileBasics = hasFullName && hasEmail && hasPhone;
  const hasIdentityDoc = Boolean(
    userProfile?.passportUrl ||
    userProfile?.passport_url ||
    userProfile?.nationalIdUrl ||
    userProfile?.national_id_url ||
    userProfile?.idDocumentUrl ||
    userProfile?.id_document_url
  );
  const hasDriverLicense = Boolean(
    userProfile?.driverLicenseUrl ||
    userProfile?.driver_license_url ||
    userProfile?.driverLicenseNumber ||
    userProfile?.licence_number ||
    userProfile?.license_number
  );

  const loadVerification = useCallback(async ({ silent = false, forceRefresh = false } = {}) => {
    if (!user?.id) {
      setVerificationLoading(false);
      return;
    }

    try {
      if (!silent) {
        setVerificationLoading(true);
      }
      setVerificationError('');
      const threadKey = buildVerificationThreadKey({ entityType: 'user', entityId: user.id });
      const result = await runWithTimeout(
        VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh }),
        VERIFICATION_SUMMARY_TIMEOUT_MS,
        tr('Loading verification status took too long. You can still upload your documents below.', 'Le chargement du statut de vérification a pris trop de temps. Vous pouvez quand même téléverser vos documents ci-dessous.')
      );

      const baseRequests = Array.isArray(result?.requests) ? result.requests : [];
      setVerificationRequests(baseRequests);
      setVerificationSummary(result?.summary || null);

      if (!silent) {
        setVerificationLoading(false);
      }

      try {
        const threadResponse = await runWithTimeout(
          MessageService.listSharedThreads({
            family: 'verification',
            threadKey,
          }).catch(() => ({ threads: [] })),
          VERIFICATION_THREAD_TIMEOUT_MS,
          'Verification thread lookup timed out.'
        );
        const matchingThread = Array.isArray(threadResponse?.threads)
          ? threadResponse.threads.find((thread) => String(thread?.thread_key || '') === threadKey)
          : null;
        const enrichedRequests = attachLatestVerificationNotes(
          baseRequests,
          Array.isArray(matchingThread?.messages) ? matchingThread.messages : []
        );
        setVerificationRequests(enrichedRequests);
      } catch (_threadError) {
        // Keep the verification uploader usable even if the thread lookup is slow.
      }
    } catch (error) {
      setVerificationError(error?.message || tr('Unable to load verification status right now.', 'Impossible de charger le statut de vérification pour le moment.'));
    } finally {
      if (!silent) {
        setVerificationLoading(false);
      }
    }
  }, [user?.id, isFrench]);

  useEffect(() => {
    void loadVerification();
  }, [loadVerification]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const shouldKeepRefreshing =
      String(verificationSummary?.status || userProfile?.verificationStatus || '').toLowerCase() !== 'approved';

    if (!shouldKeepRefreshing) return undefined;

    const runSilentRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadVerification({ silent: true });
    };

    const intervalId = window.setInterval(runSilentRefresh, 15000);
    window.addEventListener('focus', runSilentRefresh);
    document.addEventListener('visibilitychange', runSilentRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', runSilentRefresh);
      document.removeEventListener('visibilitychange', runSilentRefresh);
    };
  }, [loadVerification, user?.id, userProfile?.verificationStatus, verificationSummary?.status]);

  const latestByType = useMemo(() => getLatestByType(verificationRequests), [verificationRequests]);
  const effectiveVerificationStatus = String(
    verificationSummary?.status ||
    userProfile?.verificationStatus ||
    ''
  ).toLowerCase();

  const documentState = useMemo(
    () =>
      getDocumentState({
        verificationStatus: effectiveVerificationStatus,
        hasProfileBasics,
        hasIdentityDoc,
        hasDriverLicense,
        latestByType,
        tr,
      }),
    [effectiveVerificationStatus, hasProfileBasics, hasIdentityDoc, hasDriverLicense, latestByType, isFrench]
  );

  const completedRequiredCount = REQUIRED_TYPES.filter((type) => {
    const status = String(latestByType?.[type]?.status || '').toLowerCase();
    return ['approved', 'pending'].includes(status) || (type === 'driver_license' ? hasDriverLicense : hasIdentityDoc);
  }).length;
  const pendingCount = verificationRequests.filter((request) => String(request?.status || '').toLowerCase() === 'pending').length;
  const latestRejection = verificationRequests.find((request) => String(request?.status || '').toLowerCase() === 'rejected') || null;
  const rejectedTypes = verificationRequests
    .filter((request) => String(request?.status || '').toLowerCase() === 'rejected')
    .map((request) => request?.verification_type)
    .filter(Boolean);
  const needsLicenseReplacement = rejectedTypes.includes('driver_license');
  const needsIdentityReplacement = rejectedTypes.includes('profile_id');
  const isAdminWorkspaceShell = location.pathname.startsWith('/admin/');
  const backLink = useMemo(
    () => resolveReturnPath(location, isAdminWorkspaceShell ? '/admin/profile' : '/account/overview'),
    [isAdminWorkspaceShell, location]
  );
  const verificationThreadKey = useMemo(
    () => (user?.id ? buildVerificationThreadKey({ entityType: 'user', entityId: user.id }) : ''),
    [user?.id]
  );
  const isVerificationComplete = documentState.account.tone === 'success';
  const verificationResumeHandledRef = useRef(false);
  const highlightedDocumentRef = useRef('');
  const resumeBookingFlow = location.state?.resumeBookingFlow === 'marketplace_request';
  const verificationReturnPath = typeof location.state?.from === 'string' ? location.state.from : '';
  const verificationReturnLabel = typeof location.state?.fromLabel === 'string' ? location.state.fromLabel : '';
  const verificationCtaState = { from: `${location.pathname}${location.search}` };
  const defaultListingsPath = isAdminWorkspaceShell ? '/admin/fleet' : '/account/vehicles';
  const defaultInboxPath = isAdminWorkspaceShell ? '/admin/messages' : '/account/messages';
  const trustCenterReturnPath = !resumeBookingFlow && verificationReturnPath ? verificationReturnPath : defaultListingsPath;
  const focusedDocumentType = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('documentType') || '').trim().toLowerCase();
  }, [location.search]);
  const verificationHero = useMemo(() => {
    if (resumeBookingFlow) {
      return isVerificationComplete
        ? {
            eyebrow: tr('Booking verification', 'Vérification réservation'),
            title: tr("You're verified", 'Vous êtes vérifié'),
            description: tr(
              'Your account is verified and your booking requests can move forward.',
              'Votre compte est vérifié et vos demandes de réservation peuvent continuer.'
            ),
          }
        : {
            eyebrow: tr('Booking verification', 'Vérification réservation'),
            title: tr('Verify your account', 'Vérifiez votre compte'),
            description: tr(
              'Upload 2 documents to unlock booking requests.',
              'Téléversez 2 documents pour débloquer les demandes de réservation.'
            ),
          };
    }

    return isVerificationComplete
      ? {
          eyebrow: tr('Trust center', 'Centre de confiance'),
          title: tr('Owner trust is approved', 'La confiance propriétaire est approuvée'),
          description: tr(
            'Your identity documents are approved. Listings, inbox conversations, payouts, and review submission all now run from the same verified account.',
            'Vos documents d’identité sont approuvés. Les annonces, conversations Inbox, virements et envois en revue fonctionnent désormais depuis le même compte vérifié.'
          ),
        }
      : {
          eyebrow: tr('Trust center', 'Centre de confiance'),
          title: tr('Upload the 2 required documents', 'Téléversez les 2 documents requis'),
          description: tr(
            'Upload your driver license and your ID or passport below. You can keep building your listing while admin reviews them.',
            'Téléversez votre permis et votre pièce ou passeport ci-dessous. Vous pouvez continuer votre annonce pendant que l’admin les révise.'
          ),
        };
  }, [isVerificationComplete, resumeBookingFlow, tr]);

  useEffect(() => {
    if (!isVerificationComplete || !resumeBookingFlow || !verificationReturnPath || verificationResumeHandledRef.current) {
      return undefined;
    }

    verificationResumeHandledRef.current = true;
    const timeoutId = window.setTimeout(() => {
      navigate(verificationReturnPath, {
        replace: true,
        state: {
          from: '/account/verification',
          verificationResumed: true,
        },
      });
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [isVerificationComplete, navigate, resumeBookingFlow, verificationReturnPath]);

  useEffect(() => {
    if (!focusedDocumentType || verificationLoading) return;

    const anchorId = focusedDocumentType === 'driver_license'
      ? 'verification-driver-license'
      : focusedDocumentType === 'profile_id'
        ? 'verification-identity-document'
        : '';

    if (!anchorId || highlightedDocumentRef.current === anchorId) return;

    const target = document.getElementById(anchorId);
    if (!target) return;

    highlightedDocumentRef.current = anchorId;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [focusedDocumentType, verificationLoading]);

  return (
    <div className="space-y-4">
      <AccountWorkspaceHero
        eyebrow={verificationHero.eyebrow}
        title={verificationHero.title}
        description={verificationHero.description}
        aside={
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {backLink ? (
              <button
                type="button"
                onClick={() => navigate(backLink)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                {verificationReturnLabel || tr('Back', 'Retour')}
              </button>
            ) : null}
            {isVerificationComplete ? (
              resumeBookingFlow && verificationReturnPath ? (
                <Link
                  to={verificationReturnPath}
                  className={workspacePrimaryButtonClass}
                >
                  {tr('Return to booking', 'Retour à la réservation')}
                </Link>
              ) : (
                <Link
                  to={trustCenterReturnPath}
                  state={verificationCtaState}
                  className={workspacePrimaryButtonClass}
                >
                  {verificationReturnPath
                    ? tr('Return to listings', 'Retour aux annonces')
                    : tr('Open listings', 'Ouvrir les annonces')}
                </Link>
              )
            ) : (
              <div className={`${workspaceInsetPanelClass} text-left sm:min-w-[240px] sm:text-right`}>
                <p className="text-sm font-semibold text-slate-500">{tr('Trust progress', 'Progression confiance')}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{completedRequiredCount}/{REQUIRED_TYPES.length}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pendingCount > 0
                    ? tr('Your documents are already with admin. You can keep building your listing while they review.', 'Vos documents sont déjà chez l’admin. Vous pouvez continuer votre annonce pendant la revue.')
                    : tr('Upload the next document below. Listing setup can continue in parallel.', 'Téléversez le document suivant ci-dessous. La configuration de l’annonce peut continuer en parallèle.')}
                </p>
              </div>
            )}
            {!resumeBookingFlow ? (
              <Link
                to={verificationThreadKey ? `${defaultInboxPath}?threadKey=${encodeURIComponent(verificationThreadKey)}` : defaultInboxPath}
                className={workspaceSecondaryButtonClass}
              >
                {tr('Open Inbox', 'Ouvrir Inbox')}
              </Link>
            ) : null}
          </div>
        }
      />

      {verificationError ? (
        <section className={`${workspacePanelClass} border-rose-200 text-sm text-rose-700`}>
          {verificationError}
        </section>
      ) : null}

      {resumeBookingFlow && !isVerificationComplete ? (
        <section className={workspacePanelClass}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            {tr('Booking unlock', 'Déblocage réservation')}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {tr(
              'Verify your account to request this vehicle. We’ll bring you back to your booking once it is approved.',
              'Vérifiez votre compte pour demander ce véhicule. Nous vous ramènerons à votre réservation une fois approuvée.'
            )}
          </p>
        </section>
      ) : null}

      {isVerificationComplete ? (
        <>
          <section className={`${workspacePanelClass} sm:px-6`}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Verified documents', 'Documents vérifiés')}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {tr('Everything is approved', 'Tout est approuvé')}
              </h2>
            </div>

            <div className="mt-4 grid gap-3">
              <div className={`${workspaceInsetPanelClass} flex items-center justify-between bg-white`}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-[0_12px_24px_rgba(16,185,129,0.12)]">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{tr('Driver license', 'Permis de conduire')}</p>
                    <p className="text-sm text-slate-500">{tr('Verified', 'Vérifié')}</p>
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>

              <div className={`${workspaceInsetPanelClass} flex items-center justify-between bg-white`}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-[0_12px_24px_rgba(16,185,129,0.12)]">
                    <FileBadge className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{tr('ID / Passport', 'Pièce / passeport')}</p>
                    <p className="text-sm text-slate-500">{tr('Verified', 'Vérifié')}</p>
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </section>

          <section className={workspacePanelClass}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Update documents', 'Mettre à jour les documents')}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {tr('Need to update a document? You can scan or replace it here.', 'Besoin de mettre à jour un document ? Vous pouvez le scanner ou le remplacer ici.')}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div id="verification-driver-license" className={workspaceInsetPanelClass}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{tr('Driver license', 'Permis de conduire')}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Scan or replace', 'Scanner ou remplacer')}</p>
                  </div>
                </div>
                <VerificationUploadField
                  entityType="user"
                  entityId={user?.id}
                  ownerUserId={user?.id}
                  verificationType="driver_license"
                  request={documentState.license.request}
                  disabled={!user?.id}
                  enableScan
                  scanTitle={tr('Scan driver license', 'Scanner le permis de conduire')}
                  currentProfile={userProfile}
                  onUploaded={loadVerification}
                />
              </div>

              <div id="verification-identity-document" className={workspaceInsetPanelClass}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <FileBadge className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{tr('ID / Passport', 'Pièce / passeport')}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{tr('Scan or replace', 'Scanner ou remplacer')}</p>
                  </div>
                </div>
                <VerificationUploadField
                  entityType="user"
                  entityId={user?.id}
                  ownerUserId={user?.id}
                  verificationType="profile_id"
                  request={documentState.identity.request}
                  disabled={!user?.id}
                  enableScan
                  scanTitle={tr('Scan national ID or passport', 'Scanner la carte nationale ou le passeport')}
                  currentProfile={userProfile}
                  onUploaded={loadVerification}
                />
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className={`${workspacePanelClass} sm:px-6`}>
          <div className="mt-4 space-y-3">
            {latestRejection ? (
              <div className={`${workspaceInsetPanelClass} border-rose-100 bg-rose-50`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600">{tr('Action required', 'Action requise')}</p>
                <p className="mt-2 text-sm font-semibold text-rose-700">
                  {tr('Replace the document marked below before trust approval can continue.', "Remplacez le document marqué ci-dessous avant que l'approbation puisse continuer.")}
                </p>
                {latestRejection?.latest_replacement_note || latestRejection?.rejection_reason ? (
                  <p className="mt-2 text-sm text-rose-700">
                    {latestRejection.latest_replacement_note || latestRejection.rejection_reason}
                  </p>
                ) : null}
              </div>
            ) : pendingCount > 0 ? (
              <div className={`${workspaceInsetPanelClass} border-amber-100 bg-amber-50`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">{tr('Under review', 'En revue')}</p>
                <p className="mt-2 text-sm text-amber-800">
                  {tr('Admin is reviewing your documents. Replace one below if needed.', 'L’admin vérifie vos documents. Remplacez-en un ci-dessous si besoin.')}
                </p>
              </div>
            ) : (
              <div className={`${workspaceInsetPanelClass} border-violet-100 bg-violet-50`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('What to do now', 'Que faire maintenant')}</p>
                <p className="mt-2 text-sm text-violet-900">
                  {tr('Upload the 2 required documents below. You can complete them in any order.', 'Téléversez les 2 documents requis ci-dessous. Vous pouvez les faire dans n’importe quel ordre.')}
                </p>
              </div>
            )}
            {verificationLoading ? (
              <div className={`${workspaceInsetPanelClass} flex items-center gap-3 bg-white text-sm font-medium text-slate-500`}>
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                {tr('Loading your verification file…', 'Chargement de votre dossier de vérification…')}
              </div>
            ) : null}
            <div className="px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {pendingCount > 0 ? tr('Documents', 'Documents') : tr('Required documents', 'Documents requis')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {pendingCount > 0
                  ? tr('Review, scan, or replace below.', 'Consultez, scannez ou remplacez ci-dessous.')
                  : tr('Upload or scan below.', 'Téléversez ou scannez ci-dessous.')}
              </p>
            </div>
            <div id="verification-driver-license" className={`${workspaceInsetPanelClass} bg-white`}>
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950">{tr('Driver license', 'Permis de conduire')}</p>
                </div>
              </div>
              <VerificationUploadField
                entityType="user"
                entityId={user?.id}
                ownerUserId={user?.id}
                verificationType="driver_license"
                request={documentState.license.request}
                disabled={!user?.id}
                enableScan
                scanTitle={tr('Scan driver license', 'Scanner le permis de conduire')}
                currentProfile={userProfile}
                onUploaded={loadVerification}
                showStatusBadge
              />
            </div>

            <div id="verification-identity-document" className={`${workspaceInsetPanelClass} bg-white`}>
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <FileBadge className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950">{tr('ID / Passport', 'Pièce / passeport')}</p>
                </div>
              </div>
              <VerificationUploadField
                entityType="user"
                entityId={user?.id}
                ownerUserId={user?.id}
                verificationType="profile_id"
                request={documentState.identity.request}
                disabled={!user?.id}
                enableScan
                scanTitle={tr('Scan national ID or passport', 'Scanner la carte nationale ou le passeport')}
                currentProfile={userProfile}
                onUploaded={loadVerification}
                showStatusBadge
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default AccountVerification;
