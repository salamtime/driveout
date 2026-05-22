import { normalizeMarketplaceRequestLifecycleStatus } from './marketplaceRequestState';
import {
  deriveRentalExecutionStage,
  normalizeRentalExecutionDraft,
} from './rentalExecutionFlow';

const ACTIONABLE_EXECUTION_STATUSES = new Set(['approved', 'active']);

export const getOwnerExecutionRequestStage = (request = null) => {
  if (!request || typeof request !== 'object') return '';
  const requestStatus = normalizeMarketplaceRequestLifecycleStatus(request?.requestStatus || request);
  const ownerExecution = normalizeRentalExecutionDraft(
    request?.ownerExecution ||
      request?.rawRequest?.counter_offer?.owner_execution ||
      request?.counterOffer?.owner_execution ||
      {}
  );
  return deriveRentalExecutionStage(ownerExecution, requestStatus);
};

export const buildOwnerExecutionWorkspaceHref = (request = null, options = {}) => {
  const requestId = String(request?.id || request?.requestId || '').trim();
  const vehicleId = String(
    request?.vehiclePublicProfileId ||
      request?.rawListing?.vehicle_public_profile_id ||
      request?.rawProfile?.id ||
      ''
  ).trim();
  const focus = String(options?.focus || 'execution').trim().toLowerCase();
  const focusSectionId =
    focus === 'request'
      ? `vehicle-request-${requestId}`
      : focus === 'execution'
        ? 'owner-rental-execution'
        : '';

  if (vehicleId && requestId) {
    const query = new URLSearchParams({ requestId });
    if (focusSectionId) query.set('focusSectionId', focusSectionId);
    return `/account/operations/${encodeURIComponent(vehicleId)}?${query.toString()}`;
  }

  if (requestId) {
    return `/account/rentals/requests/${encodeURIComponent(requestId)}`;
  }

  return '/account/overview';
};

export const getOwnerExecutionActionConfig = (request = null, tr = (en) => en) => {
  if (!request || typeof request !== 'object') return null;
  const requestStatus = normalizeMarketplaceRequestLifecycleStatus(request?.requestStatus || request);
  if (!ACTIONABLE_EXECUTION_STATUSES.has(requestStatus)) return null;

  const stage = getOwnerExecutionRequestStage(request);
  const href = buildOwnerExecutionWorkspaceHref(request);

  if (stage === 'live' || stage === 'return_pending') {
    return {
      stage,
      href,
      title: tr('Ready to finish rental', 'Prête à terminer la location'),
      detail:
        stage === 'return_pending'
          ? tr(
              'The return flow is already open. Finish the inspection, deposit review, and closeout here.',
              'Le flux retour est déjà ouvert. Terminez ici le contrôle, la revue de caution et la clôture.'
            )
          : tr(
              'The rental is live. Open the return flow when the vehicle comes back.',
              'La location est active. Ouvrez le flux retour quand le véhicule revient.'
            ),
      ctaLabel:
        stage === 'return_pending'
          ? tr('Continue finish flow', 'Continuer la fin')
          : tr('Ready to finish', 'Prête à terminer'),
      tone: stage === 'return_pending' ? 'amber' : 'emerald',
    };
  }

  return {
    stage,
    href,
    title: tr('Ready to start rental', 'Prête à démarrer la location'),
    detail:
      stage === 'ready_to_start'
        ? tr(
            'Pickup is fully prepared. Start the rental from the same stepper workspace.',
            'Le départ est entièrement prêt. Démarrez la location depuis le même espace stepper.'
          )
        : tr(
            'Open the pickup flow to complete handoff, evidence, and opening checks.',
            'Ouvrez le flux de départ pour terminer la remise, les preuves et les contrôles initiaux.'
          ),
    ctaLabel:
      stage === 'ready_to_start'
        ? tr('Start rental', 'Démarrer la location')
        : tr('Ready to start', 'Prête à démarrer'),
    tone: stage === 'ready_to_start' ? 'emerald' : 'violet',
  };
};
