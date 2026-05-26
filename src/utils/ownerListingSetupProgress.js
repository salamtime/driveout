const normalizeStatus = (value, fallback = 'todo') =>
  String(value || fallback).trim().toLowerCase() || fallback;

const encodePathSegment = (value) => encodeURIComponent(String(value || '').trim());

export const OWNER_LISTING_SETUP_STEP_KEYS = Object.freeze({
  ownerVerification: 'owner_verification',
  vehicleBasics: 'vehicle_basics',
  vehiclePhotos: 'vehicle_photos',
  vehicleDocuments: 'vehicle_documents',
  pricingPickup: 'pricing_pickup',
  reviewPublish: 'review_publish',
});

export const OWNER_LISTING_SETUP_TASK_KEYS = Object.freeze({
  ownerVerification: 'owner_verification',
  vehicleProfile: 'vehicle_profile',
  listingMedia: 'listing_media',
  vehicleDocuments: 'vehicle_documents',
  vehicleVerification: 'vehicle_verification',
  listingDetails: 'listing_details',
  listingPricing: 'listing_pricing',
  renterSetup: 'renter_setup',
  listingReview: 'listing_review',
  publish: 'publish',
});

const getVehicleProfilePath = (vehicleId, tab = 'overview') =>
  vehicleId
    ? `/account/vehicles/${encodePathSegment(vehicleId)}/profile?tab=${encodeURIComponent(tab)}`
    : '/account/vehicles/new/profile?tab=overview';

const buildStepTarget = ({ vehicleId, tab, section, route, currentPath = '' }) => {
  if (route) {
    return {
      to: route,
      state: { from: currentPath },
    };
  }

  return {
    to: getVehicleProfilePath(vehicleId, tab),
    state: {
      from: currentPath,
      resumeEditing: true,
      focusSectionId: section || '',
    },
  };
};

const getActionStatus = ({ done, waiting = false, issue = false, active = false, locked = false }) => {
  if (done) return 'done';
  if (issue) return 'issue';
  if (waiting) return 'waiting';
  if (locked) return 'locked';
  if (active) return 'active';
  return 'todo';
};

const buildTask = ({ key, done, label, tab, section, route }) => ({
  key,
  done: Boolean(done),
  label,
  tab: tab || '',
  section: section || '',
  route: route || '',
});

export const buildOwnerListingSetupProgress = ({
  tr = (en) => en,
  vehicleId = '',
  currentPath = '',
  ownerVerificationReady = false,
  ownerVerificationPending = false,
  ownerVerificationIssue = false,
  vehicleHasDraft = false,
  vehicleBasicsComplete = false,
  vehiclePhotosComplete = false,
  vehicleDocumentsComplete = false,
  vehicleDocumentsPending = false,
  vehicleDocumentsIssue = false,
  listingDetailsComplete = false,
  listingPricingComplete = false,
  pickupSetupComplete = false,
  listingReviewSubmitted = false,
  listingApproved = false,
  listingLive = false,
  listingIssue = false,
  canSendFullReview = false,
} = {}) => {
  const safeVehicleId = String(vehicleId || '').trim();
  const setupStarted = Boolean(vehicleHasDraft || safeVehicleId);
  const pricingPickupComplete = Boolean(listingDetailsComplete && listingPricingComplete && pickupSetupComplete);
  const reviewPublishComplete = Boolean(listingLive);
  const reviewPublishWaiting = Boolean(listingReviewSubmitted && !listingApproved && !listingLive);
  const reviewPublishActive = Boolean(canSendFullReview || listingApproved);
  const reviewPublishState = reviewPublishComplete
    ? 'live'
    : listingApproved
      ? 'approved'
      : listingIssue
        ? 'changes_requested'
        : listingReviewSubmitted
          ? 'waiting_for_admin'
          : canSendFullReview
            ? 'ready_for_review'
            : 'blocked';

  const tasks = [
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.ownerVerification,
      done: ownerVerificationReady,
      label: tr('Owner ID + license', 'Pièce + permis propriétaire'),
      route: '/account/verification',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.vehicleProfile,
      done: vehicleBasicsComplete,
      label: tr('Vehicle basics', 'Bases du véhicule'),
      tab: 'overview',
      section: 'vehicle-basics',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.listingMedia,
      done: vehiclePhotosComplete,
      label: tr('Vehicle photos', 'Photos du véhicule'),
      tab: 'overview',
      section: 'primary-photo',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.vehicleDocuments,
      done: vehicleDocumentsComplete,
      label: tr('Vehicle documents', 'Documents véhicule'),
      tab: 'legal',
      section: 'legal-documents',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.vehicleVerification,
      done: vehicleDocumentsComplete || vehicleDocumentsPending,
      label: tr('Vehicle verification', 'Vérification véhicule'),
      tab: 'legal',
      section: 'legal-documents',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.listingDetails,
      done: listingDetailsComplete,
      label: tr('Listing title', "Titre de l'annonce"),
      tab: 'listing',
      section: 'listing-details',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.listingPricing,
      done: listingPricingComplete,
      label: tr('Price + deposit', 'Prix + caution'),
      tab: 'listing',
      section: 'listing-details',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.renterSetup,
      done: pickupSetupComplete,
      label: tr('Pickup setup', 'Point de retrait'),
      tab: 'listing',
      section: 'listing-rules',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.listingReview,
      done: listingReviewSubmitted || listingApproved || listingLive,
      label: tr('Send full review', 'Envoyer la revue complète'),
      tab: 'listing',
      section: 'listing-journey',
    }),
    buildTask({
      key: OWNER_LISTING_SETUP_TASK_KEYS.publish,
      done: listingLive,
      label: tr('Publish now', 'Publier maintenant'),
      tab: 'listing',
      section: 'listing-journey',
    }),
  ];

  const steps = [
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.ownerVerification,
      stepNumber: 1,
      title: tr('Owner verification', 'Vérification propriétaire'),
      detail: ownerVerificationReady
        ? tr('Owner trust is approved.', 'La confiance propriétaire est approuvée.')
        : ownerVerificationPending
          ? tr('Your identity files are with admin. Keep building while review continues.', 'Vos fichiers identité sont chez l’admin. Continuez pendant la revue.')
          : tr('Upload profile ID and driver license so the listing can be reviewed.', 'Téléversez pièce d’identité et permis pour que l’annonce puisse être revue.'),
      status: getActionStatus({
        done: ownerVerificationReady,
        waiting: ownerVerificationPending,
        issue: ownerVerificationIssue,
        active: setupStarted,
      }),
      ctaLabel: ownerVerificationReady
        ? tr('View trust center', 'Voir le centre de confiance')
        : ownerVerificationPending
          ? tr('Review verification', 'Voir la vérification')
          : tr('Open trust center', 'Ouvrir le centre de confiance'),
      target: buildStepTarget({ route: '/account/verification', currentPath }),
      taskKeys: [OWNER_LISTING_SETUP_TASK_KEYS.ownerVerification],
    },
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.vehicleBasics,
      stepNumber: 2,
      title: tr('Vehicle basics', 'Bases du véhicule'),
      detail: tr('Add brand, model, plate number, and city.', 'Ajoutez marque, modèle, immatriculation et ville.'),
      status: getActionStatus({
        done: vehicleBasicsComplete,
        active: setupStarted || !vehicleBasicsComplete,
      }),
      ctaLabel: tr('Open vehicle basics', 'Ouvrir les bases du véhicule'),
      target: buildStepTarget({ vehicleId: safeVehicleId, tab: 'overview', section: 'vehicle-basics', currentPath }),
      taskKeys: [OWNER_LISTING_SETUP_TASK_KEYS.vehicleProfile],
    },
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.vehiclePhotos,
      stepNumber: 3,
      title: tr('Vehicle photos', 'Photos véhicule'),
      detail: tr('Upload hero, context, and detail photos.', 'Téléversez les photos principale, contexte et détail.'),
      status: getActionStatus({
        done: vehiclePhotosComplete,
        active: vehicleBasicsComplete || setupStarted,
      }),
      ctaLabel: tr('Open photos', 'Ouvrir les photos'),
      target: buildStepTarget({ vehicleId: safeVehicleId, tab: 'overview', section: 'primary-photo', currentPath }),
      taskKeys: [OWNER_LISTING_SETUP_TASK_KEYS.listingMedia],
    },
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.vehicleDocuments,
      stepNumber: 4,
      title: tr('Vehicle documents', 'Documents véhicule'),
      detail: vehicleDocumentsPending
        ? tr('Documents are with admin. You can continue setup.', 'Les documents sont chez l’admin. Vous pouvez continuer.')
        : tr('Upload registration and insurance.', 'Téléversez immatriculation et assurance.'),
      status: getActionStatus({
        done: vehicleDocumentsComplete,
        waiting: vehicleDocumentsPending,
        issue: vehicleDocumentsIssue,
        active: vehicleBasicsComplete || setupStarted,
      }),
      ctaLabel: tr('Open documents', 'Ouvrir les documents'),
      target: buildStepTarget({ vehicleId: safeVehicleId, tab: 'legal', section: 'legal-documents', currentPath }),
      taskKeys: [
        OWNER_LISTING_SETUP_TASK_KEYS.vehicleDocuments,
        OWNER_LISTING_SETUP_TASK_KEYS.vehicleVerification,
      ],
    },
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.pricingPickup,
      stepNumber: 5,
      title: tr('Pricing & pickup', 'Prix & retrait'),
      detail: tr('Set price, deposit, pickup location, and renter setup.', 'Définissez prix, caution, lieu de retrait et configuration locataire.'),
      status: getActionStatus({
        done: pricingPickupComplete,
        active: vehicleBasicsComplete || setupStarted,
      }),
      ctaLabel: tr('Open pricing & pickup', 'Ouvrir prix & retrait'),
      target: buildStepTarget({
        vehicleId: safeVehicleId,
        tab: 'listing',
        section: listingDetailsComplete && listingPricingComplete ? 'listing-rules' : 'listing-details',
        currentPath,
      }),
      taskKeys: [
        OWNER_LISTING_SETUP_TASK_KEYS.listingDetails,
        OWNER_LISTING_SETUP_TASK_KEYS.listingPricing,
        OWNER_LISTING_SETUP_TASK_KEYS.renterSetup,
      ],
    },
    {
      key: OWNER_LISTING_SETUP_STEP_KEYS.reviewPublish,
      stepNumber: 6,
      title: tr('Review & publish', 'Revue & publication'),
      detail: listingIssue
        ? tr('Review feedback is waiting in support. Update the listing, then send it again.', 'Le retour de revue vous attend dans le support. Mettez l’annonce à jour, puis renvoyez-la.')
        : reviewPublishWaiting
        ? tr('The full package is with admin.', 'Le dossier complet est chez l’admin.')
        : tr('Submit for review, then publish when approved.', 'Envoyez en revue, puis publiez après approbation.'),
      status: getActionStatus({
        done: reviewPublishComplete,
        waiting: reviewPublishWaiting,
        issue: listingIssue,
        active: reviewPublishActive,
        locked: !reviewPublishActive && !reviewPublishComplete && !reviewPublishWaiting,
      }),
      ctaLabel: listingLive
        ? tr('Manage listing', "Gérer l'annonce")
        : listingApproved
          ? tr('Publish now', 'Publier maintenant')
          : listingIssue
            ? tr('Open support', 'Ouvrir le support')
          : listingReviewSubmitted
            ? tr('Open support', 'Ouvrir le support')
            : tr('Open review step', "Ouvrir l'étape de revue"),
      actionMode: 'navigate',
      target: buildStepTarget({ vehicleId: safeVehicleId, tab: 'listing', section: 'listing-journey', currentPath }),
      taskKeys: [
        OWNER_LISTING_SETUP_TASK_KEYS.listingReview,
        OWNER_LISTING_SETUP_TASK_KEYS.publish,
      ],
    },
  ].map((step) => ({
    ...step,
    status: normalizeStatus(step.status),
    tasks: tasks.filter((task) => step.taskKeys.includes(task.key)),
  }));

  const completedSteps = steps.filter((step) => step.status === 'done').length;
  const currentStepIndex = steps.findIndex((step) =>
    ['issue', 'active', 'waiting'].includes(step.status)
  );
  const fallbackStepIndex = steps.findIndex((step) => step.status !== 'done');
  const resolvedStepIndex = currentStepIndex >= 0
    ? currentStepIndex
    : fallbackStepIndex >= 0
      ? fallbackStepIndex
      : steps.length - 1;
  const currentStep = steps[resolvedStepIndex] || null;
  const totalSteps = steps.length;
  const progressPercent = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  return {
    steps,
    tasks,
    currentStep,
    currentStepNumber: resolvedStepIndex + 1,
    nextStep: currentStep,
    completedSteps,
    totalSteps,
    progressPercent,
    visualProgressPercent: completedSteps === 0 ? 8 : Math.max(progressPercent, 8),
    completedTasks: tasks.filter((task) => task.done).length,
    totalTasks: tasks.length,
    incompleteTasks: tasks.filter((task) => !task.done),
    canSendFullReview: Boolean(canSendFullReview),
    reviewPublishState,
  };
};
