import React from 'react';
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Ellipsis,
  ExternalLink,
  Eye,
  FileBadge,
  Trash2,
} from 'lucide-react';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';

const formatWorkflowDate = (value, isFrench) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(isFrench ? 'fr-MA' : 'en-MA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

const getStatusMeta = (status, tr) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') {
    return {
      icon: CheckCircle2,
      chip: 'bg-emerald-100 text-emerald-700',
      shell: 'border-emerald-200 bg-emerald-50',
      label: tr('Verified', 'Vérifié'),
    };
  }
  if (['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(normalized)) {
    return {
      icon: AlertTriangle,
      chip: 'bg-amber-100 text-amber-700',
      shell: 'border-amber-200 bg-amber-50',
      label: tr('Needs changes', 'Corrections requises'),
    };
  }
  return {
    icon: Clock3,
    chip: 'bg-slate-200 text-slate-700',
    shell: 'border-slate-200 bg-slate-50',
    label: tr('In review', 'En révision'),
  };
};

const getInitialActiveVerificationPost = (posts = [], preferredPost = null) => {
  if (!Array.isArray(posts) || posts.length === 0) return null;
  if (preferredPost?.id) {
    const exactMatch = posts.find((post) => String(post.id) === String(preferredPost.id));
    if (exactMatch) return exactMatch;
  }
  return posts[0];
};

const WorkflowThreadView = ({
  compactMode = false,
  currentSenderRole = 'customer',
  isFrench = false,
  tr,
  workflowKind = '',
  selectedThread,
  headerPrimaryName = '',
  headerSecondaryLabel = '',
  workflowAudienceLabel = '',
  headerStatusSummary = '',
  headerNextActionSummary = '',
  openWorkflowContext,
  workflowContextLabel = '',
  canManageThread = false,
  canDeleteThread = false,
  isThreadArchived = false,
  threadArchiveBusy = false,
  threadDeleteBusy = false,
  onToggleArchiveThread,
  onDeleteThread,
  verificationStatus = '',
  verificationNeedsChanges = false,
  workflowDocuments = [],
  primaryVerificationIssue = null,
  primaryVerificationIssueLabel = '',
  primaryVerificationIssueReason = '',
  openVerificationDocument,
  openVerificationPostPreview,
  nextVerificationPost = null,
  onApproveVerification,
  onRejectVerification,
  verificationActionBusy = '',
  workflowActionError = '',
  marketplaceModerationProgress = null,
  workflowHistoryItems = [],
  onExitReadingMode,
  floatingBackLabel = '',
}) => {
  const topStatusMeta = getStatusMeta(verificationStatus || selectedThread?.status || '', tr);
  const TopStatusIcon = topStatusMeta.icon;
  const showVerificationActions = workflowKind === 'identity_review' && currentSenderRole === 'admin' && nextVerificationPost;
  const [activeVerificationPostId, setActiveVerificationPostId] = React.useState(() => getInitialActiveVerificationPost(workflowDocuments, nextVerificationPost)?.id || null);
  const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
  const headerMenuRef = React.useRef(null);

  React.useEffect(() => {
    if (!headerMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!headerMenuRef.current?.contains(event.target)) {
        setHeaderMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [headerMenuOpen]);

  React.useEffect(() => {
    const nextActivePost = getInitialActiveVerificationPost(workflowDocuments, nextVerificationPost);
    setActiveVerificationPostId((currentId) => {
      if (!workflowDocuments.length) return null;
      if (currentId && workflowDocuments.some((post) => String(post.id) === String(currentId))) {
        return currentId;
      }
      return nextActivePost?.id || null;
    });
  }, [workflowDocuments, nextVerificationPost]);

  const activeVerificationPost = React.useMemo(() => {
    if (!workflowDocuments.length) return null;
    return (
      workflowDocuments.find((post) => String(post.id) === String(activeVerificationPostId)) ||
      getInitialActiveVerificationPost(workflowDocuments, nextVerificationPost)
    );
  }, [workflowDocuments, activeVerificationPostId, nextVerificationPost]);

  const activeVerificationMeta = getStatusMeta(activeVerificationPost?.status || verificationStatus || '', tr);
  const ActiveVerificationIcon = activeVerificationMeta.icon;
  const activeVerificationLabel = activeVerificationPost
    ? getVerificationTypeLabel(activeVerificationPost.documentType || 'profile_id', isFrench ? 'fr' : 'en')
    : '';
  const activeVerificationCustomerNote = String(activeVerificationPost?.messageBody || '').trim();
  const activeVerificationUpdatedAt = activeVerificationPost?.created_at || null;
  const isActiveVerificationActionTarget = Boolean(
    activeVerificationPost &&
    nextVerificationPost &&
    String(activeVerificationPost.id) === String(nextVerificationPost.id)
  );
  const hasWorkflowHistory = Array.isArray(workflowHistoryItems) && workflowHistoryItems.length > 0;
  const identityReviewGridClass = hasWorkflowHistory
    ? 'grid gap-3 xl:grid-cols-[240px_minmax(0,1.35fr)_280px] 2xl:grid-cols-[252px_minmax(0,1.45fr)_296px]'
    : 'grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[252px_minmax(0,1fr)]';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] bg-white sm:rounded-[32px]">
      <div className={`border-b border-slate-200 bg-white/96 backdrop-blur ${compactMode ? 'px-4 py-3' : 'px-4 py-3.5 sm:px-5'}`}>
        {compactMode && typeof onExitReadingMode === 'function' ? (
          <div className="mb-3">
            <button
              type="button"
              onClick={onExitReadingMode}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <ArrowLeft className="h-4 w-4" />
              {floatingBackLabel || tr('Message list', 'Liste des messages')}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              {workflowKind === 'identity_review'
                ? tr('Workflow thread', 'Fil workflow')
                : workflowKind === 'listing_review'
                  ? tr('Review timeline', 'Chronologie de revue')
                  : tr('Workflow history', 'Historique workflow')}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950">
              {headerPrimaryName || tr('Workflow review', 'Revue workflow')}
            </h2>
            {headerSecondaryLabel ? (
              <p className="mt-1 text-sm font-medium text-slate-500">{headerSecondaryLabel}</p>
            ) : null}
          </div>
          {canManageThread ? (
            <div className="relative shrink-0" ref={headerMenuRef}>
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((current) => !current)}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                aria-label={tr('Open thread actions', 'Ouvrir les actions du fil')}
                aria-expanded={headerMenuOpen}
              >
                <Ellipsis className="h-5 w-5" />
              </button>
              {headerMenuOpen ? (
                <div className="absolute right-0 top-12 z-30 min-w-[15rem] rounded-[22px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.14)]">
                  {typeof openWorkflowContext === 'function' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        openWorkflowContext();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>{workflowContextLabel || tr('Open workflow', 'Ouvrir le workflow')}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onToggleArchiveThread?.();
                    }}
                    disabled={!onToggleArchiveThread || threadArchiveBusy}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-60 ${
                      isThreadArchived
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : 'text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    <Archive className="h-4 w-4" />
                    <span>
                      {threadArchiveBusy
                        ? isThreadArchived
                          ? tr('Restoring…', 'Restauration…')
                          : tr('Archiving…', 'Archivage…')
                        : isThreadArchived
                          ? tr('Restore thread', 'Restaurer le fil')
                          : tr('Archive review', 'Archiver la revue')}
                    </span>
                  </button>
                  {canDeleteThread ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        onDeleteThread?.();
                      }}
                      disabled={!onDeleteThread || threadDeleteBusy}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>
                        {threadDeleteBusy
                          ? tr('Deleting…', 'Suppression…')
                          : tr('Delete review thread', 'Supprimer le fil de revue')}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : typeof openWorkflowContext === 'function' ? (
            <button
              type="button"
              onClick={openWorkflowContext}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <ExternalLink className="h-4 w-4" />
              {workflowContextLabel || tr('Open workflow', 'Ouvrir le workflow')}
            </button>
          ) : null}
        </div>

        <div className={`mt-3 rounded-[20px] border px-3.5 py-3 ${topStatusMeta.shell}`}>
          <div className="flex items-start gap-3">
            <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.1rem] ${topStatusMeta.chip}`}>
              <TopStatusIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${topStatusMeta.chip}`}>
                  {topStatusMeta.label}
                </span>
                {headerStatusSummary ? (
                  <p className="text-sm font-black text-slate-950">{headerStatusSummary}</p>
                ) : null}
              </div>
              {headerNextActionSummary ? (
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{headerNextActionSummary}</p>
              ) : null}
            </div>
          </div>
        </div>

        {workflowActionError ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {workflowActionError}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">
        <div className="space-y-3.5">
          {workflowKind === 'identity_review' && verificationNeedsChanges && currentSenderRole !== 'admin' && primaryVerificationIssue ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-950">
                    {tr(
                      `${primaryVerificationIssueLabel} needs to be replaced.`,
                      `${primaryVerificationIssueLabel} doit être remplacé.`
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {primaryVerificationIssueReason || tr('Please upload a valid replacement document.', 'Veuillez téléverser un document de remplacement valide.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openVerificationDocument?.(primaryVerificationIssue)}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {tr('Open verification', 'Ouvrir la vérification')}
                </button>
              </div>
            </div>
          ) : null}

          {workflowKind === 'identity_review' && workflowDocuments.length ? (
            <section className="space-y-2.5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tr('Documents in this review', 'Documents dans cette revue')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {hasWorkflowHistory
                    ? tr(
                        'Select a document on the left, inspect it in the center, then use the history rail for context.',
                        "Sélectionnez un document à gauche, inspectez-le au centre, puis utilisez l'historique à droite pour le contexte."
                      )
                    : tr(
                        'Select a document on the left, then inspect it in the center.',
                        'Sélectionnez un document à gauche, puis inspectez-le au centre.'
                      )}
                </p>
              </div>
              <div className={identityReviewGridClass}>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="mb-3 px-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {tr('Document queue', 'File des documents')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {workflowDocuments.map((post) => {
                      const postMeta = getStatusMeta(post.status, tr);
                      const PostIcon = postMeta.icon;
                      const postLabel = getVerificationTypeLabel(post.documentType || 'profile_id', isFrench ? 'fr' : 'en');
                      const isSelected = activeVerificationPost && String(activeVerificationPost.id) === String(post.id);
                      return (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setActiveVerificationPostId(post.id)}
                          className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                            isSelected
                              ? 'border-violet-300 bg-violet-50 shadow-[0_10px_24px_rgba(124,58,237,0.12)]'
                              : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/60'
                          }`}
                        >
                          {post.imageUrl ? (
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[1rem] border border-slate-200 bg-white">
                              <img src={post.imageUrl} alt={postLabel} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1rem] border border-slate-200 bg-white text-slate-400">
                              <FileBadge className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-black text-slate-950">{postLabel}</p>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${postMeta.chip}`}>
                                <PostIcon className="h-3 w-3" />
                                {postMeta.label}
                              </span>
                            </div>
                            {post.fileName ? (
                              <p className="mt-1 truncate text-xs font-medium text-slate-500">{post.fileName}</p>
                            ) : null}
                            {post.created_at ? (
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                {formatWorkflowDate(post.created_at, isFrench)}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  {activeVerificationPost ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {tr('Active document', 'Document actif')}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-[1.8rem] font-black tracking-[-0.03em] text-slate-950 sm:text-[2rem]">
                              {activeVerificationLabel}
                            </h3>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${activeVerificationMeta.chip}`}>
                              <ActiveVerificationIcon className="h-3.5 w-3.5" />
                              {activeVerificationMeta.label}
                            </span>
                          </div>
                          {activeVerificationPost.fileName ? (
                            <p className="mt-1 text-sm text-slate-500">{activeVerificationPost.fileName}</p>
                          ) : null}
                          {activeVerificationPost.created_at ? (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                              {formatWorkflowDate(activeVerificationPost.created_at, isFrench)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
                        {activeVerificationPost.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => openVerificationPostPreview?.(activeVerificationPost)}
                            className="block h-full w-full"
                          >
                            <img
                              src={activeVerificationPost.imageUrl}
                              alt={activeVerificationLabel}
                              className="max-h-[520px] w-full object-contain bg-white"
                            />
                          </button>
                        ) : (
                          <div className="flex min-h-[320px] items-center justify-center text-slate-400">
                            <div className="flex flex-col items-center gap-3">
                              <FileBadge className="h-10 w-10" />
                              <p className="text-sm font-semibold">{tr('Preview unavailable', 'Aperçu indisponible')}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {activeVerificationPost.messageBody ? (
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-2.5">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {tr('Document message', 'Message du document')}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{activeVerificationPost.messageBody}</p>
                        </div>
                      ) : null}

                      {currentSenderRole === 'admin' && activeVerificationCustomerNote ? (
                        <div className={`rounded-[22px] border px-4 py-4 ${
                          ['approved', 'verified', 'completed'].includes(String(activeVerificationPost?.status || '').trim().toLowerCase())
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-amber-200 bg-amber-50'
                        }`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                {tr('Customer update sent', 'Mise à jour client envoyée')}
                              </p>
                              <p className="mt-2 text-sm font-black text-slate-950">
                                {workflowAudienceLabel
                                  ? tr(
                                      `Message sent to ${workflowAudienceLabel}`,
                                      `Message envoyé à ${workflowAudienceLabel}`
                                    )
                                  : tr('Message sent to the customer', 'Message envoyé au client')}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {tr(
                                  `Linked to ${activeVerificationLabel}`,
                                  `Lié à ${activeVerificationLabel}`
                                )}
                              </p>
                            </div>
                            {activeVerificationUpdatedAt ? (
                              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {formatWorkflowDate(activeVerificationUpdatedAt, isFrench)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2.5 rounded-[18px] border border-white/80 bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                            {activeVerificationCustomerNote}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openVerificationPostPreview?.(activeVerificationPost)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <Eye className="h-4 w-4" />
                          {tr('Open preview', 'Ouvrir l’aperçu')}
                        </button>
                        {!canManageThread && typeof openWorkflowContext !== 'function' ? (
                          <button
                            type="button"
                            onClick={() => openVerificationDocument?.(activeVerificationPost)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {tr('Open verification', 'Ouvrir la vérification')}
                          </button>
                        ) : null}
                        {showVerificationActions && isActiveVerificationActionTarget ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onApproveVerification?.(activeVerificationPost.id)}
                              disabled={Boolean(verificationActionBusy)}
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {verificationActionBusy === 'approve_verification'
                                ? tr('Approving…', 'Approbation…')
                                : tr('Approve', 'Approuver')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onRejectVerification?.(activeVerificationPost.id)}
                              disabled={Boolean(verificationActionBusy)}
                              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-60"
                            >
                              {verificationActionBusy === 'reject_verification'
                                ? tr('Requesting…', 'Demande…')
                                : tr('Request changes', 'Demander des corrections')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {hasWorkflowHistory ? (
                  <div className="space-y-3">
                    <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {tr('Status history', 'Historique du statut')}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {tr('Track the review path without covering the active document.', 'Suivez le parcours de la revue sans masquer le document actif.')}
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {workflowHistoryItems.map((item, index) => (
                          <div key={item.id || `${item.title}-${index}`} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl ${
                                item.tone === 'success'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.tone === 'warning'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-200 text-slate-600'
                              }`}>
                                {item.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : item.tone === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                              </span>
                              {index < workflowHistoryItems.length - 1 ? (
                                <span className="mt-2 h-8 w-px bg-slate-200" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 pb-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-slate-950">{item.title}</p>
                                {item.createdAt ? (
                                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                                    {formatWorkflowDate(item.createdAt, isFrench)}
                                  </span>
                                ) : null}
                              </div>
                              {item.body ? (
                                <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {workflowKind === 'listing_review' && marketplaceModerationProgress ? (
            <section className="space-y-2.5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tr('Review progress', 'Progression de la revue')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {tr('This workflow thread now behaves like a status timeline instead of a live chat.', 'Ce fil workflow fonctionne désormais comme une chronologie de statut au lieu d’un chat en direct.')}
                </p>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3.5">
                  <div className="space-y-3">
                    {marketplaceModerationProgress.statusHistoryItems.map((item, index) => (
                      <div key={item.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${
                            item.state === 'complete'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.state === 'current'
                                ? marketplaceModerationProgress.stateTone.chip
                                : 'bg-slate-200 text-slate-600'
                          }`}>
                            {item.state === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                          </span>
                          {index < marketplaceModerationProgress.statusHistoryItems.length - 1 ? (
                            <span className="mt-2 h-10 w-px bg-slate-200" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          <p className="text-sm font-black text-slate-950">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {workflowHistoryItems.length ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {tr('Status history', 'Historique du statut')}
                    </p>
                    <div className="mt-3 space-y-3">
                      {workflowHistoryItems.map((item, index) => (
                        <div key={item.id || `${item.title}-${index}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl ${
                              item.tone === 'success'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.tone === 'warning'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-200 text-slate-600'
                            }`}>
                              {item.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : item.tone === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                            </span>
                            {index < workflowHistoryItems.length - 1 ? (
                              <span className="mt-2 h-8 w-px bg-slate-200" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-slate-950">{item.title}</p>
                              {item.createdAt ? (
                                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                                  {formatWorkflowDate(item.createdAt, isFrench)}
                                </span>
                              ) : null}
                            </div>
                            {item.body ? (
                              <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {workflowHistoryItems.length && workflowKind !== 'identity_review' && workflowKind !== 'listing_review' ? (
            <section className="space-y-2.5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tr('Status history', 'Historique du statut')}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <div className="space-y-3">
                  {workflowHistoryItems.map((item, index) => (
                    <div key={item.id || `${item.title}-${index}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl ${
                          item.tone === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.tone === 'warning'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : item.tone === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                        </span>
                        {index < workflowHistoryItems.length - 1 ? (
                          <span className="mt-2 h-8 w-px bg-slate-200" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-950">{item.title}</p>
                          {item.createdAt ? (
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                              {formatWorkflowDate(item.createdAt, isFrench)}
                            </span>
                          ) : null}
                        </div>
                        {item.body ? (
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WorkflowThreadView;
