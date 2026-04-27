import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink, CheckCircle2, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import VerificationStatusBadge from './VerificationStatusBadge';
import VerificationService from '../../services/VerificationService';
import MessageService from '../../services/MessageService';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';
import { useTranslation } from 'react-i18next';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../../utils/messageCenter';

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const isPreviewableImage = (document = {}) => {
  const mime = String(document?.file_mime_type || '').toLowerCase();
  const fileName = String(document?.file_name || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
};

const DECISIONS = [
  { value: 'approved', tone: 'emerald' },
  { value: 'rejected', tone: 'rose' },
  { value: 'suspended', tone: 'amber' },
  { value: 'expired', tone: 'slate' },
];

const ADVANCED_DECISIONS = ['suspended', 'expired'];

const DECISION_VALUES = new Set(DECISIONS.map((item) => item.value));

const getDecisionLabel = (value, tr, currentStatus = '') => {
  switch (value) {
    case 'approved':
      return currentStatus === 'approved' ? tr('Approved', 'Approuvée') : tr('Approve', 'Approuver');
    case 'rejected':
      return tr('Request replacement', 'Demander remplacement');
    case 'suspended':
      return tr('Suspend verification', 'Suspendre');
    case 'expired':
      return tr('Mark expired', 'Marquer expiré');
    default:
      return value;
  }
};

const getDecisionClasses = (value, isActive) => {
  if (value === 'approved') {
    return isActive
      ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_12px_24px_rgba(16,185,129,0.24)]'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100';
  }
  if (value === 'rejected') {
    return isActive
      ? 'border-rose-500 bg-rose-500 text-white shadow-[0_12px_24px_rgba(244,63,94,0.24)]'
      : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100';
  }
  if (value === 'suspended') {
    return isActive
      ? 'border-amber-500 bg-amber-500 text-white shadow-[0_12px_24px_rgba(245,158,11,0.24)]'
      : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100';
  }
  return isActive
    ? 'border-slate-500 bg-slate-700 text-white shadow-[0_12px_24px_rgba(15,23,42,0.20)]'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100';
};

const buildVerificationThreadKey = ({ entityType, entityId }) =>
  ['verification', 'verification', String(entityType || '').trim().toLowerCase(), String(entityId || '').trim()].join(':');

const getStatusLabel = (value, tr) => {
  switch (String(value || '').toLowerCase()) {
    case 'approved':
      return tr('Approved', 'Approuvée');
    case 'rejected':
      return tr('Replacement requested', 'Remplacement demandé');
    case 'suspended':
      return tr('Suspended', 'Suspendue');
    case 'expired':
      return tr('Expired', 'Expirée');
    case 'pending':
    default:
      return tr('Pending review', 'En attente de révision');
  }
};

const cleanComparisonValue = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || '';
};

const readMetadataValue = (metadata, keys = []) => {
  if (!metadata || typeof metadata !== 'object') return '';
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
};

const readNestedMetadataValue = (metadata, keys = [], nestedKeys = []) => {
  if (!metadata || typeof metadata !== 'object') return '';

  for (const nestedKey of nestedKeys) {
    const nestedValue = metadata[nestedKey];
    if (nestedValue && typeof nestedValue === 'object') {
      const direct = readMetadataValue(nestedValue, keys);
      if (direct) return direct;
    }
  }

  return readMetadataValue(metadata, keys);
};

const normalizeCompareString = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildProfileNavigationState = (request, documents, selectedDocumentId = '') => ({
  verificationDocuments: Array.isArray(documents) ? documents : [],
  verificationSummary: request
    ? {
        status: request.status || 'pending',
        verificationStatus: request.status || 'pending',
        pendingCount: (Array.isArray(documents) ? documents : []).filter((document) => String(document?.status || 'pending').toLowerCase() === 'pending').length,
        approvedCount: (Array.isArray(documents) ? documents : []).filter((document) => String(document?.status || '').toLowerCase() === 'approved').length,
      }
    : null,
  verificationContext: {
    entityType: request?.entity_type || 'user',
    entityId: request?.entity_id || '',
    documentId: selectedDocumentId || '',
  },
});

const buildComparisonRows = ({ request, document, tr }) => {
  const profile = request?.profile_snapshot && typeof request.profile_snapshot === 'object'
    ? request.profile_snapshot
    : {};
  const metadata = document?.submission_metadata && typeof document.submission_metadata === 'object'
    ? document.submission_metadata
    : {};

  const rows = [
    {
      key: 'full_name',
      label: tr('Full name', 'Nom complet'),
      profileValue: cleanComparisonValue(profile.full_name || request?.display_name || request?.entity_email),
      extractedValue: readNestedMetadataValue(
        metadata,
        ['full_name', 'fullName', 'name', 'customer_name', 'customerName'],
        ['extractedFields']
      ),
      confirmedValue: readNestedMetadataValue(
        metadata,
        ['full_name', 'fullName', 'name', 'customer_name', 'customerName'],
        ['customerReviewedFields']
      ),
    },
    {
      key: 'date_of_birth',
      label: tr('Date of birth', 'Date de naissance'),
      profileValue: cleanComparisonValue(profile.date_of_birth),
      extractedValue: readNestedMetadataValue(
        metadata,
        ['date_of_birth', 'dateOfBirth', 'customer_dob'],
        ['extractedFields']
      ),
      confirmedValue: readNestedMetadataValue(
        metadata,
        ['date_of_birth', 'dateOfBirth', 'customer_dob'],
        ['customerReviewedFields']
      ),
    },
  ];

  const normalizedType = String(document?.verification_type || '').toLowerCase();
  if (normalizedType === 'driver_license') {
    rows.push({
      key: 'license_number',
      label: tr('License number', 'Numéro de permis'),
      profileValue: cleanComparisonValue(profile.licence_number || profile.license_number),
      extractedValue: readNestedMetadataValue(
        metadata,
        ['license_number', 'licence_number', 'licenseNumber', 'licenceNumber', 'document_number'],
        ['extractedFields']
      ),
      confirmedValue: readNestedMetadataValue(
        metadata,
        ['license_number', 'licence_number', 'licenseNumber', 'licenceNumber', 'document_number'],
        ['customerReviewedFields']
      ),
    });
  } else if (normalizedType === 'profile_id') {
    rows.push({
      key: 'id_number',
      label: tr('ID number', "Numéro d'identité"),
      profileValue: cleanComparisonValue(profile.id_number),
      extractedValue: readNestedMetadataValue(
        metadata,
        ['id_number', 'idNumber', 'document_number', 'passport_number', 'passportNumber'],
        ['extractedFields']
      ),
      confirmedValue: readNestedMetadataValue(
        metadata,
        ['id_number', 'idNumber', 'document_number', 'passport_number', 'passportNumber'],
        ['customerReviewedFields']
      ),
    });
  }

  return rows.map((row) => {
    const profileValue = cleanComparisonValue(row.profileValue);
    const extractedValue = cleanComparisonValue(row.extractedValue);
    const confirmedValue = cleanComparisonValue(row.confirmedValue);
    const comparisonSource = confirmedValue || extractedValue;
    let matchState = 'missing';
    if (profileValue && comparisonSource) {
      matchState = normalizeCompareString(profileValue) === normalizeCompareString(comparisonSource) ? 'match' : 'mismatch';
    } else if (profileValue || comparisonSource) {
      matchState = 'partial';
    }
    return {
      ...row,
      profileValue,
      extractedValue,
      confirmedValue,
      matchState,
    };
  });
};

const VEHICLE_VERIFICATION_PRESETS = [
  {
    id: 'registration_expired',
    label: ['Registration expired', 'Carte grise expirée'],
    message: [
      'Please upload a valid vehicle registration document. The current registration appears expired or no longer valid.',
      'Veuillez téléverser une carte grise valide. Le document actuel semble expiré ou non valide.',
    ],
  },
  {
    id: 'insurance_expired',
    label: ['Insurance expired', 'Assurance expirée'],
    message: [
      'Please upload a valid insurance document. The current insurance proof appears expired or no longer valid.',
      'Veuillez téléverser une attestation d’assurance valide. Le document actuel semble expiré ou non valide.',
    ],
  },
  {
    id: 'ownership_missing',
    label: ['Ownership proof missing', 'Preuve de propriété manquante'],
    message: [
      'Please upload clear proof that you own or are authorized to manage this vehicle before verification can continue.',
      'Veuillez téléverser une preuve claire que vous êtes propriétaire du véhicule ou autorisé à le gérer avant de poursuivre la vérification.',
    ],
  },
  {
    id: 'clearer_documents',
    label: ['Clearer documents needed', 'Documents plus lisibles'],
    message: [
      'Please upload clearer document images. Important details are not readable enough for approval right now.',
      'Veuillez téléverser des images de documents plus lisibles. Les détails importants ne sont pas assez visibles pour une approbation pour le moment.',
    ],
  },
  {
    id: 'vehicle_photos',
    label: ['Better vehicle photos', 'Meilleures photos véhicule'],
    message: [
      'Please upload clearer vehicle photos. Make sure the vehicle is fully visible, well lit, and easy to identify.',
      'Veuillez téléverser des photos du véhicule plus claires. Assurez-vous que le véhicule soit bien visible, bien éclairé et facile à identifier.',
    ],
  },
  {
    id: 'details_mismatch',
    label: ['Details do not match', 'Informations non concordantes'],
    message: [
      'Please review the submitted vehicle details. Some information does not match the documents currently on file.',
      'Veuillez vérifier les informations du véhicule soumises. Certaines données ne correspondent pas aux documents actuellement envoyés.',
    ],
  },
];

const GENERAL_VERIFICATION_PRESETS = [
  {
    id: 'clearer_id',
    label: ['Clearer document needed', 'Document plus lisible'],
    message: [
      'Please upload a clearer copy of this document. Important information is not readable enough for approval right now.',
      'Veuillez téléverser une copie plus lisible de ce document. Les informations importantes ne sont pas assez visibles pour une approbation pour le moment.',
    ],
  },
  {
    id: 'document_expired',
    label: ['Document expired', 'Document expiré'],
    message: [
      'Please upload a valid, non-expired document so we can continue your verification.',
      'Veuillez téléverser un document valide et non expiré afin que nous puissions poursuivre votre vérification.',
    ],
  },
  {
    id: 'details_missing',
    label: ['Missing information', 'Informations manquantes'],
    message: [
      'Please resubmit this document with all required information clearly visible before we continue.',
      'Veuillez soumettre à nouveau ce document avec toutes les informations requises clairement visibles avant de poursuivre.',
    ],
  },
];

const VerificationReviewDrawer = ({ request, initialDocumentId = '', onClose, onUpdated }) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
  const tr = (en, fr) => (language === 'fr' ? fr : en);
  const [localRequest, setLocalRequest] = useState(request);
  const documents = useMemo(() => localRequest?.documents || [], [localRequest]);
  const [activeDocumentId, setActiveDocumentId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [decision, setDecision] = useState('');
  const [savingStatus, setSavingStatus] = useState('');
  const [threadMessages, setThreadMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [detailsDocumentId, setDetailsDocumentId] = useState('');
  const [replacementComposerOpen, setReplacementComposerOpen] = useState(false);
  const [replacementComposerDocumentId, setReplacementComposerDocumentId] = useState('');
  const [replacementComposerMessage, setReplacementComposerMessage] = useState('');
  const [replacementComposerPresetId, setReplacementComposerPresetId] = useState('');
  const [replacementComposerSubmitting, setReplacementComposerSubmitting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [bulkSavingStatus, setBulkSavingStatus] = useState('');
  const reviewNoteRef = useRef(null);

  useEffect(() => {
    setLocalRequest(request);
  }, [request]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) || documents[0] || null,
    [activeDocumentId, documents]
  );
  const activeDocumentIndex = useMemo(
    () => documents.findIndex((document) => String(document.id) === String(activeDocument?.id)),
    [documents, activeDocument?.id]
  );
  const replacementComposerDocument = useMemo(
    () => documents.find((document) => String(document.id) === String(replacementComposerDocumentId)) || null,
    [documents, replacementComposerDocumentId]
  );
  const threadKey = useMemo(
    () =>
      buildVerificationThreadKey({
        entityType: activeDocument?.entity_type || request?.entity_type || 'user',
        entityId: activeDocument?.entity_id || request?.entity_id || request?.id,
      }),
    [activeDocument?.entity_id, activeDocument?.entity_type, request?.entity_id, request?.entity_type, request?.id]
  );
  const profileNavigationState = useMemo(
    () => buildProfileNavigationState(localRequest, documents, activeDocumentId),
    [activeDocumentId, documents, localRequest]
  );

  useEffect(() => {
    const nextDocument =
      documents.find((document) => String(document.id) === String(initialDocumentId || '')) ||
      documents[0] ||
      null;
    setActiveDocumentId(nextDocument?.id || '');
  }, [initialDocumentId, localRequest?.id, documents]);

  useEffect(() => {
    setReason('');
    setExpiresAt(activeDocument?.expires_at?.slice(0, 10) || '');
    setDecision('');
    setSelectedPresetId('');
  }, [activeDocument?.id, activeDocument?.expires_at]);

  useEffect(() => {
    let cancelled = false;

    const loadThreadHistory = async () => {
      if (!activeDocument || !request?.entity_id) {
        setThreadMessages([]);
        return;
      }

      try {
        setLoadingThread(true);
        const response = await MessageService.listSharedThreads({
          family: MESSAGE_FAMILIES.verification,
        });

        if (cancelled) return;

        const threads = Array.isArray(response?.threads) ? response.threads : [];
        const matchingThread = threads.find((thread) => String(thread?.thread_key || '') === threadKey);

        setThreadMessages(
          Array.isArray(matchingThread?.messages)
            ? [...matchingThread.messages].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            : []
        );
      } catch {
        if (!cancelled) {
          setThreadMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    };

    void loadThreadHistory();

    return () => {
      cancelled = true;
    };
  }, [activeDocument?.id, request?.entity_id, request?.entity_type, threadKey]);

  const comparisonRows = useMemo(
    () => buildComparisonRows({ request: localRequest, document: activeDocument, tr }),
    [activeDocument, localRequest, tr]
  );

  const documentCount = documents.length;
  const pendingDocuments = useMemo(
    () => documents.filter((document) => String(document?.status || 'pending').toLowerCase() === 'pending'),
    [documents]
  );
  const approvedDocuments = useMemo(
    () => documents.filter((document) => String(document?.status || '').toLowerCase() === 'approved'),
    [documents]
  );
  const rejectedDocuments = useMemo(
    () => documents.filter((document) => ['rejected', 'suspended'].includes(String(document?.status || '').toLowerCase())),
    [documents]
  );
  const overallStatusLabel = useMemo(() => {
    if (pendingDocuments.length > 0) return tr('Pending review', 'En attente de révision');
    if (rejectedDocuments.length > 0) return tr('Changes requested', 'Modifications demandées');
    if (approvedDocuments.length === documents.length && documents.length > 0) return tr('Approved', 'Approuvée');
    return getStatusLabel(localRequest?.status || 'pending', tr);
  }, [approvedDocuments.length, documents.length, localRequest?.status, pendingDocuments.length, rejectedDocuments.length, tr]);
  const isFullyApproved = documents.length > 0 && approvedDocuments.length === documents.length;
  const timelineItems = useMemo(() => {
    const submissionItems = documents.map((document) => ({
      id: `submission-${document.id}`,
      timestamp: document.created_at || null,
      title: `${getVerificationTypeLabel(document.verification_type, language)} ${tr('submitted', 'submitted')}`,
      detail: '',
      tone: 'slate',
      requestId: String(document.id),
    }));

    const messageItems = threadMessages.flatMap((message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const messageType = String(message?.message_type || '').toLowerCase();
      const status = String(metadata.status || metadata.verificationStatus || '').toLowerCase();
      const requestId = String(metadata.verificationRequestId || '');
      const document = documents.find((item) => String(item.id) === requestId);
      const documentLabel = getVerificationTypeLabel(
        metadata.verificationType || metadata.documentType || document?.verification_type,
        language
      );

      if (messageType === 'verification_status') {
        if (status === 'approved') {
          return [{
            id: `message-${message.id}`,
            timestamp: message.created_at || null,
            title: `${documentLabel} ${tr('approved', 'approved')}`,
            detail: '',
            tone: 'emerald',
            requestId,
          }];
        }
        if (status === 'rejected') {
          return [{
            id: `message-${message.id}`,
            timestamp: message.created_at || null,
            title: `${documentLabel} ${tr('replacement requested', 'replacement requested')}`,
            detail: String(metadata.reviewReason || message.body || '').trim(),
            tone: 'rose',
            requestId,
          }];
        }
        return [];
      }

      if (messageType === 'verification_note' && requestId) {
        const note = String(metadata.reviewReason || message.body || '').trim();
        if (!note) return [];
        return [{
          id: `message-${message.id}`,
          timestamp: message.created_at || null,
          title: `${documentLabel} ${tr('replacement requested', 'replacement requested')}`,
          detail: note,
          tone: 'rose',
          requestId,
        }];
      }

      if (messageType === 'system_event' && String(message?.body || '').toLowerCase().includes('verification')) {
        return [{
          id: `message-${message.id}`,
          timestamp: message.created_at || null,
          title: tr('Verification completed', 'Vérification terminée'),
          detail: '',
          tone: 'emerald',
          requestId: '',
        }];
      }

      return [];
    });

    const dedupedItems = [...submissionItems, ...messageItems]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .filter((item, index, list) => {
        return !list.slice(0, index).some((other) => {
          const sameTitle = other.title === item.title;
          const sameDetail = other.detail === item.detail;
          const sameRequest = other.requestId === item.requestId;
          const closeInTime = Math.abs(new Date(other.timestamp || 0).getTime() - new Date(item.timestamp || 0).getTime()) < 10000;
          return sameTitle && sameDetail && sameRequest && closeInTime;
        });
      });

    return dedupedItems.slice(0, 6);
  }, [documents, language, threadMessages, tr]);
  const latestReplacementNote = useMemo(() => {
    if (!activeDocument) return '';
    const matchingMessage = threadMessages.find((message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      return (
        String(metadata.verificationRequestId || '') === String(activeDocument.id || '') &&
        String(message?.message_type || '').toLowerCase() === 'verification_note'
      );
    });
    const metadata = matchingMessage?.metadata && typeof matchingMessage.metadata === 'object' ? matchingMessage.metadata : {};
    return String(metadata.reviewReason || matchingMessage?.body || '').trim();
  }, [activeDocument, threadMessages]);

  if (!request) return null;

  const isVehicleVerification =
    String(request?.entity_type || '').toLowerCase() === 'vehicle' ||
    ['vehicle_registration', 'vehicle_insurance', 'proof_of_ownership'].includes(
      String(activeDocument?.verification_type || '').toLowerCase()
    );
  const feedbackPresets = isVehicleVerification ? VEHICLE_VERIFICATION_PRESETS : GENERAL_VERIFICATION_PRESETS;

  const currentStatus = String(activeDocument?.status || 'pending').toLowerCase();
  const hasDecisionSelected = Boolean(decision);
  const hasPendingDecisionChange = hasDecisionSelected && decision !== currentStatus;
  const selectedDecisionLabel = decision ? getStatusLabel(decision, tr) : '';
  const detailsOpen = activeDocument && String(detailsDocumentId) === String(activeDocument.id);

  const refreshThreadMessages = async () => {
    try {
      const response = await MessageService.listSharedThreads({
        family: MESSAGE_FAMILIES.verification,
      });
      const threads = Array.isArray(response?.threads) ? response.threads : [];
      const matchingThread = threads.find((thread) => String(thread?.thread_key || '') === threadKey);
      setThreadMessages(
        Array.isArray(matchingThread?.messages)
          ? [...matchingThread.messages].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          : []
      );
    } catch (threadError) {
      console.warn('Unable to refresh verification thread after status update:', threadError);
    }
  };

  const sendDecisionMessageToCustomer = async (document, status, reviewReason = '') => {
    if (!document || !request?.owner_user_id) return;

    const normalizedStatus = String(status || '').toLowerCase();
    const cleanedReason = String(reviewReason || '').trim();
    if (!['rejected', 'suspended'].includes(normalizedStatus) || !cleanedReason) {
      return;
    }

    const documentLabel = getVerificationTypeLabel(document.verification_type, language);
    const subject =
      normalizedStatus === 'rejected'
        ? tr('Replacement requested', 'Remplacement demandé')
        : tr('Verification update', 'Mise à jour de vérification');
    const body =
      normalizedStatus === 'rejected'
        ? tr(
            `${documentLabel}: please upload a replacement document. ${cleanedReason}`,
            `${documentLabel} : veuillez téléverser un document de remplacement. ${cleanedReason}`
          )
        : tr(
            `${documentLabel}: this document has been suspended for review. ${cleanedReason}`,
            `${documentLabel} : ce document a été suspendu pour révision. ${cleanedReason}`
          );

    await MessageService.sendSharedMessage({
      family: MESSAGE_FAMILIES.verification,
      threadType: MESSAGE_THREAD_TYPES.verification,
      threadKey,
      entityType: request.entity_type || 'user',
      entityId: request.entity_id || request.id,
      recipientUserId: request.owner_user_id,
      recipientRole: request.entity_type === 'vehicle' ? 'owner' : 'customer',
      senderRole: 'admin',
      messageType: 'verification_note',
      subject,
      body,
      metadata: {
        type: 'verification',
        reviewTitle: tr('Verification review', 'Revue de vérification'),
        verificationRequestId: document.id,
        verificationType: document.verification_type,
        documentType: document.verification_type,
        verificationStatus: normalizedStatus,
        status: normalizedStatus,
        reviewReason: cleanedReason,
        imageUrl: document.file_url || null,
        href: '/account/verification',
        adminHref: '/admin/verification',
        source: 'verification_status_auto_note',
      },
    });
  };

  const syncSingleDocumentResult = (result, fallbackStatus = '') => {
    const updatedRequest = result?.request || null;
    const updatedSummary = result?.summary || null;
    if (!updatedRequest) {
      onUpdated?.(result);
      return;
    }

    setLocalRequest((current) => {
      if (!current) return current;
      const currentDocuments = Array.isArray(current.documents) ? current.documents : [];
      const nextDocuments = currentDocuments.map((document) =>
        String(document.id) === String(updatedRequest.id)
          ? {
              ...document,
              ...updatedRequest,
              file_url: updatedRequest.file_url || document.file_url,
              file_name: updatedRequest.file_name || document.file_name,
            }
          : document
      );

      const nextStatus = nextDocuments.every((document) => String(document.status || '').toLowerCase() === 'approved')
        ? 'approved'
        : nextDocuments.some((document) => ['rejected', 'suspended', 'expired'].includes(String(document.status || '').toLowerCase()))
          ? String(updatedRequest.status || fallbackStatus || current.status || 'pending')
          : nextDocuments.some((document) => String(document.status || '').toLowerCase() === 'pending')
            ? 'pending'
            : current.status;

      return {
        ...current,
        ...(updatedSummary && typeof updatedSummary === 'object' ? updatedSummary : {}),
        documents: nextDocuments,
        status: nextStatus,
      };
    });

    onUpdated?.(result);
  };

  const persistDocumentStatus = async (document, status, options = {}) => {
    if (!document) return;

    const normalizedCurrentStatus = String(document?.status || 'pending').toLowerCase();
    const normalizedTargetStatus = String(status || '').toLowerCase();
    const reasonValue = String(options.reason ?? reason ?? '').trim();
    const expiryValue = options.expiresAt ?? expiresAt ?? null;

    if (!normalizedTargetStatus) {
      toast.error(tr('Select a decision first.', 'Sélectionnez d’abord une décision.'));
      return;
    }
    if (normalizedTargetStatus === normalizedCurrentStatus) {
      toast.error(tr('This document already has that status.', 'Ce document a déjà ce statut.'));
      return;
    }
    if (['rejected', 'suspended'].includes(normalizedTargetStatus) && !reasonValue) {
      toast.error(tr('Add a review reason first.', 'Ajoutez d’abord un motif de révision.'));
      return;
    }

    try {
      setActiveDocumentId(document.id);
      setSavingStatus(normalizedTargetStatus);
      const result = await VerificationService.updateVerificationStatus({
        id: document.id,
        status: normalizedTargetStatus,
        rejectionReason: ['rejected', 'suspended'].includes(normalizedTargetStatus) ? reasonValue : '',
        expiresAt: expiryValue || null,
      });
      await sendDecisionMessageToCustomer(document, normalizedTargetStatus, reasonValue);
      await refreshThreadMessages();
      syncSingleDocumentResult(result, normalizedTargetStatus);
      setDecision('');
      toast.success(
        normalizedTargetStatus === 'rejected'
          ? tr('Replacement requested and customer notified.', 'Remplacement demandé et client notifié.')
          : tr('Verification updated.', 'Vérification mise à jour.')
      );
      return result;
    } catch (error) {
      toast.error(error.message || tr('Unable to update verification.', 'Impossible de mettre à jour la vérification.'));
      return null;
    } finally {
      setSavingStatus('');
    }
  };

  const prepareDocumentDecision = (document, status) => {
    if (!document) return;
    setActiveDocumentId(document.id);
    setDecision(status);
  };

  const handlePerDocumentReplacement = async (document) => {
    if (!document) return;

    const reasonValue = String(reason || '').trim();
    if (!reasonValue) {
      prepareDocumentDecision(document, 'rejected');
      toast.error(tr('Add a review note before requesting replacement.', 'Ajoutez une note de révision avant de demander le remplacement.'));
      window.setTimeout(() => {
        reviewNoteRef.current?.focus?.();
        reviewNoteRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }

    await persistDocumentStatus(document, 'rejected', {
      reason: reasonValue,
      expiresAt,
    });
  };

  const updateStatus = async () => {
    if (!activeDocument) return;
    if (!decision) {
      toast.error(tr('Select a decision first.', 'Sélectionnez d’abord une décision.'));
      return;
    }
    await persistDocumentStatus(activeDocument, decision, {
      reason,
      expiresAt,
    });
  };

  const applyDecisionToDocument = async (document, status) => {
    return VerificationService.updateVerificationStatus({
      id: document.id,
      status,
      rejectionReason: ['rejected', 'suspended'].includes(status) ? reason.trim() : '',
      expiresAt: expiresAt || null,
    });
  };

  const applyBulkDecision = async (status) => {
    if (!documents.length) return;
    if (status === 'rejected' && !reason.trim()) {
      toast.error(tr('Add a review reason first.', 'Ajoutez d’abord un motif de révision.'));
      return;
    }

    const targetDocuments = documents.filter((document) => String(document?.status || 'pending').toLowerCase() !== status);
    if (!targetDocuments.length) {
      toast.error(tr('All documents already have that status.', 'Tous les documents ont déjà ce statut.'));
      return;
    }

    try {
      setBulkSavingStatus(status);
      const results = await Promise.all(targetDocuments.map((document) => applyDecisionToDocument(document, status)));
      if (['rejected', 'suspended'].includes(status) && reason.trim()) {
        await Promise.all(
          targetDocuments.map((document) => sendDecisionMessageToCustomer(document, status, reason.trim()))
        );
      }
      const updatedById = new Map();
      let latestSummary = null;
      results.forEach((result) => {
        if (result?.request?.id) updatedById.set(String(result.request.id), result.request);
        if (result?.summary) latestSummary = result.summary;
      });

      let nextRequestSnapshot = null;
      setLocalRequest((current) => {
        if (!current) return current;
        const nextDocuments = (Array.isArray(current.documents) ? current.documents : []).map((document) => {
          const updated = updatedById.get(String(document.id));
          return updated
            ? {
                ...document,
                ...updated,
                file_url: updated.file_url || document.file_url,
                file_name: updated.file_name || document.file_name,
              }
            : document;
        });

        const nextStatus = nextDocuments.every((document) => String(document.status || '').toLowerCase() === 'approved')
          ? 'approved'
          : nextDocuments.some((document) => ['rejected', 'suspended', 'expired'].includes(String(document.status || '').toLowerCase()))
            ? status
            : nextDocuments.some((document) => String(document.status || '').toLowerCase() === 'pending')
              ? 'pending'
              : status;

        nextRequestSnapshot = {
          ...current,
          ...(latestSummary && typeof latestSummary === 'object' ? latestSummary : {}),
          documents: nextDocuments,
          status: nextStatus,
        };

        return nextRequestSnapshot;
      });

      toast.success(
        status === 'approved'
          ? tr('All documents approved.', 'Tous les documents ont été approuvés.')
          : tr('Replacement requests sent and customer notified.', 'Demandes de remplacement envoyées et client notifié.')
      );
      setDecision('');
      await refreshThreadMessages();
      onUpdated?.({ request: nextRequestSnapshot, summary: latestSummary });
    } catch (error) {
      toast.error(error.message || tr('Unable to update this verification file.', 'Impossible de mettre à jour ce dossier.'));
    } finally {
      setBulkSavingStatus('');
    }
  };

  const showPreviousDocument = () => {
    if (!documents.length || activeDocumentIndex <= 0) return;
    setActiveDocumentId(documents[activeDocumentIndex - 1]?.id || '');
  };

  const showNextDocument = () => {
    if (!documents.length || activeDocumentIndex >= documents.length - 1) return;
    setActiveDocumentId(documents[activeDocumentIndex + 1]?.id || '');
  };

  const openVerificationConversation = () => {
    const searchParams = new URLSearchParams();
    searchParams.set('threadKey', threadKey);
    navigate(`/admin/messages?${searchParams.toString()}`);
    onClose?.();
  };

  const openReplacementComposer = (document) => {
    if (!document) return;
    setActiveDocumentId(document.id);
    setReplacementComposerDocumentId(document.id);
    setReplacementComposerMessage(String(reason || latestReplacementNote || '').trim());
    setReplacementComposerPresetId(selectedPresetId || '');
    setReplacementComposerOpen(true);
  };

  const toggleDocumentDetails = (document) => {
    if (!document) return;
    setActiveDocumentId(document.id);
    setDetailsDocumentId((current) => (String(current) === String(document.id) ? '' : document.id));
  };

  const submitReplacementComposer = async () => {
    if (!replacementComposerDocument) return;

    const draftMessage = String(replacementComposerMessage || '').trim();
    if (!draftMessage) {
      toast.error(tr('Add a replacement note first.', 'Ajoutez d’abord une note de remplacement.'));
      return;
    }

    try {
      setReplacementComposerSubmitting(true);
      setActiveDocumentId(replacementComposerDocument.id);
      setDecision('rejected');
      setReason(draftMessage);
      setSelectedPresetId(replacementComposerPresetId);

      const result = await persistDocumentStatus(replacementComposerDocument, 'rejected', {
        reason: draftMessage,
        expiresAt,
      });

      if (!result) return;

      setReplacementComposerOpen(false);
      setReplacementComposerDocumentId('');
      setReplacementComposerMessage('');
      setReplacementComposerPresetId('');
    } finally {
      setReplacementComposerSubmitting(false);
    }
  };

  const openProfile = () => {
    if (!localRequest?.profile_path) return;
    navigate(localRequest.profile_path, { state: profileNavigationState });
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end bg-slate-950/35 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="relative h-full w-full max-w-xl overflow-y-auto bg-slate-50 shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="mt-1 truncate text-2xl font-black text-slate-950">
                {localRequest?.display_name || localRequest?.entity_email || localRequest?.entity_id}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                <span>{documentCount} {documentCount === 1 ? tr('document', 'document') : tr('documents', 'documents')}</span>
                <span>•</span>
                <span>{overallStatusLabel}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    {tr('Decision block', 'Bloc de décision')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black text-slate-950">
                      {tr('Profile verification', 'Vérification du profil')}
                    </span>
                    <VerificationStatusBadge status={localRequest?.status} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openVerificationConversation}
                    className="inline-flex items-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {tr('Open messages', 'Ouvrir messages')}
                  </button>
                  {localRequest?.profile_path ? (
                    <button
                      type="button"
                      onClick={openProfile}
                      className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tr('Open user profile', 'Ouvrir le profil utilisateur')}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                {documents.map((document) => (
                  <div key={`summary-${document.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                    <p className="text-sm font-bold text-slate-900">
                      {getVerificationTypeLabel(document.verification_type, language)}
                    </p>
                    <VerificationStatusBadge status={document.status} />
                  </div>
                ))}
              </div>

              {!isFullyApproved ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!bulkSavingStatus}
                    onClick={() => applyBulkDecision('approved')}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {bulkSavingStatus === 'approved' ? tr('Approving...', 'Approbation...') : tr('Approve all', 'Tout approuver')}
                  </button>
                  <button
                    type="button"
                    disabled={!!bulkSavingStatus}
                    onClick={() => applyBulkDecision('rejected')}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                  >
                    {bulkSavingStatus === 'rejected' ? tr('Updating...', 'Mise à jour...') : tr('Request replacements', 'Demander des remplacements')}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {tr(`${documentCount} documents approved`, `${documentCount} documents approuvés`)}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3">
            {documents.map((document) => {
              const normalizedStatus = String(document?.status || 'pending').toLowerCase();
              const isActive = document.id === activeDocument?.id;
              return (
                <div
                  key={document.id}
                  className={`rounded-[28px] border bg-white p-4 shadow-sm transition ${isActive ? 'border-violet-300 ring-4 ring-violet-100' : 'border-slate-200'}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDocumentId(document.id);
                        if (document.file_url) {
                          setDocumentPreviewOpen(true);
                        }
                      }}
                      className="flex h-28 w-full items-center justify-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50 sm:w-32"
                    >
                      {document.file_url && isPreviewableImage(document) ? (
                        <img
                          src={document.file_url}
                          alt={getVerificationTypeLabel(document.verification_type, language)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                          {tr('Preview', 'Aperçu')}
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-black text-slate-950">
                            {getVerificationTypeLabel(document.verification_type, language)}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-500">
                            {document.file_name || tr('Submitted document', 'Document soumis')}
                          </p>
                        </div>
                        <VerificationStatusBadge status={document.status} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDocumentId(document.id);
                            if (document.file_url) {
                              setDocumentPreviewOpen(true);
                            }
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          {tr('Preview', 'Aperçu')}
                        </button>
                        {normalizedStatus !== 'approved' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setActiveDocumentId(document.id);
                              await persistDocumentStatus(document, 'approved');
                            }}
                            disabled={Boolean(savingStatus || bulkSavingStatus)}
                            className={`rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${getDecisionClasses('approved', decision === 'approved' && isActive)}`}
                          >
                            {getDecisionLabel('approved', tr, normalizedStatus)}
                          </button>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600">
                            {tr('Approved', 'Approuvée')}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            openReplacementComposer(document);
                          }}
                          disabled={Boolean(savingStatus || bulkSavingStatus)}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${getDecisionClasses('rejected', decision === 'rejected' && isActive)}`}
                        >
                          {getDecisionLabel('rejected', tr, normalizedStatus)}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDocumentDetails(document)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                        >
                          {detailsOpen && isActive ? tr('Hide details', 'Masquer détails') : tr('View details', 'Voir détails')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeDocument && (
            <>
              {detailsOpen ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        {tr('View details', 'Voir détails')}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {tr(
                          'Review extracted data only if you need more context before deciding.',
                          'Consultez les données extraites uniquement si vous avez besoin de plus de contexte avant de décider.'
                        )}
                      </p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                      {getVerificationTypeLabel(activeDocument.verification_type, language)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {comparisonRows.map((row) => {
                      const toneClass =
                        row.matchState === 'match'
                          ? 'border-emerald-200 bg-emerald-50'
                          : row.matchState === 'mismatch'
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-200 bg-slate-50';
                      const badgeLabel =
                        row.matchState === 'match'
                          ? tr('Match', 'Correspond')
                          : row.matchState === 'mismatch'
                            ? tr('Mismatch', 'Différent')
                            : row.matchState === 'partial'
                              ? tr('Partial', 'Partiel')
                              : tr('Not detected', 'Non détecté');
                      const badgeClass =
                        row.matchState === 'match'
                          ? 'bg-emerald-100 text-emerald-700'
                          : row.matchState === 'mismatch'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-600';

                      return (
                        <div key={row.key} className={`rounded-[22px] border px-4 py-4 ${toneClass}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-black text-slate-950">{row.label}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}>
                              {badgeLabel}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 xl:grid-cols-3">
                            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-3 py-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                {tr('Current profile', 'Profil actuel')}
                              </p>
                              <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">
                                {row.profileValue || tr('Not provided', 'Non renseigné')}
                              </p>
                            </div>
                            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-3 py-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                {tr('OCR extracted', 'OCR extrait')}
                              </p>
                              <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">
                                {row.extractedValue || tr('Not detected', 'Non détecté')}
                              </p>
                            </div>
                            <div className="min-w-0 rounded-2xl border border-white/70 bg-white/80 px-3 py-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                {tr('Customer confirmed', 'Confirmé par le client')}
                              </p>
                              <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">
                                {row.confirmedValue || tr('Not provided', 'Non renseigné')}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {detailsOpen ? (
                <>
                  {activeDocument.verification_type === 'vehicle_insurance' && (
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Confirm expiry date', 'Confirmer expiration')}</span>
                      <input
                        type="date"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      />
                    </label>
                  )}

                  {!isFullyApproved ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Review controls', 'Contrôles de revue')}</span>
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-500">
                            {tr('Current status', 'Statut actuel')}
                          </span>
                          <VerificationStatusBadge status={currentStatus} />
                          {hasPendingDecisionChange ? (
                            <>
                              <span className="text-sm font-semibold text-slate-400">→</span>
                              <span className="text-sm font-semibold text-slate-500">
                                {tr('Will change to', 'Passera à')}
                              </span>
                              <VerificationStatusBadge status={decision} />
                            </>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {hasPendingDecisionChange
                            ? tr(
                                `Decision selected: ${selectedDecisionLabel}. Save to apply it to this document.`,
                                `Décision sélectionnée : ${selectedDecisionLabel}. Enregistrez pour l’appliquer à ce document.`
                              )
                            : tr(
                                'Choose an advanced decision only when you need something other than approve or request replacement.',
                                'Choisissez une décision avancée uniquement si vous avez besoin de plus que approuver ou demander un remplacement.'
                              )}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DECISIONS.filter((option) => ADVANCED_DECISIONS.includes(option.value)).map((option) => {
                          const isActive = decision === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDecision(option.value)}
                              className={`rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${getDecisionClasses(option.value, isActive)}`}
                            >
                              {getDecisionLabel(option.value, tr, currentStatus)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Review note', 'Note de révision')}</span>
                    <textarea
                      ref={reviewNoteRef}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      className="mt-2 w-full rounded-[22px] border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      placeholder={tr('Required for rejection or suspension.', 'Requis en cas de rejet ou suspension.')}
                    />
                  </label>

                  {currentStatus === 'rejected' && latestReplacementNote ? (
                    <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose-600">
                        {tr('Latest customer-facing note', 'Dernière note envoyée au client')}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                        {latestReplacementNote}
                      </p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={openVerificationConversation}
                          className="inline-flex items-center rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {tr('Open full conversation', 'Ouvrir la conversation')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      {tr('Timeline', 'Chronologie')}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {tr(
                        'Clean review history without duplicate system noise.',
                        'Historique de revue simplifié sans bruit système dupliqué.'
                      )}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {timelineItems.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {loadingThread ? (
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, index) => (
                        <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                      ))}
                    </div>
                  ) : timelineItems.length ? (
                    timelineItems.map((item) => {
                      const toneClass =
                        item.tone === 'emerald'
                          ? 'border-emerald-200 bg-emerald-50'
                          : item.tone === 'rose'
                            ? 'border-rose-200 bg-rose-50'
                            : item.tone === 'violet'
                              ? 'border-violet-200 bg-violet-50'
                              : 'border-slate-200 bg-slate-50';
                      return (
                        <div key={item.id} className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-900">{item.title}</p>
                            <p className="text-xs font-semibold text-slate-400">
                              {formatDateTime(item.timestamp)}
                            </p>
                          </div>
                          {item.detail ? (
                            <p className="mt-2 text-sm leading-6 text-slate-700">{item.detail}</p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      {tr(
                        'No verification activity yet.',
                        'Aucune activité de vérification pour le moment.'
                      )}
                    </div>
                  )}
                </div>
              </div>

              {detailsOpen ? (
                <button
                  type="button"
                  disabled={!!savingStatus || !hasPendingDecisionChange}
                  onClick={updateStatus}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_18px_34px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {savingStatus
                    ? tr('Saving decision...', 'Enregistrement...')
                    : hasPendingDecisionChange
                      ? tr('Save review decision', 'Enregistrer la décision')
                      : tr('Select a decision first', 'Sélectionnez une décision')}
                </button>
              ) : null}
            </>
          )}
        </div>

        {replacementComposerOpen && replacementComposerDocument ? (
          <div
            className="absolute inset-0 z-20"
            onClick={() => setReplacementComposerOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-950/30" />
            <div
              className="absolute inset-3 overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:inset-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">
                      {tr('Replacement request', 'Demande de remplacement')}
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {getVerificationTypeLabel(replacementComposerDocument.verification_type, language)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {replacementComposerDocument.file_name || tr('Submitted document', 'Document soumis')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplacementComposerOpen(false)}
                    className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-[24px] border border-rose-100 bg-rose-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {tr(
                      'Prepare the replacement request before sending it to the customer. This is the exact document that will need to be changed.',
                      'Préparez la demande de remplacement avant de l’envoyer au client. C’est exactement ce document qui devra être remplacé.'
                    )}
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                    {replacementComposerDocument.file_url && isPreviewableImage(replacementComposerDocument) ? (
                      <img
                        src={replacementComposerDocument.file_url}
                        alt={getVerificationTypeLabel(replacementComposerDocument.verification_type, language)}
                        className="h-56 w-full object-cover"
                      />
                    ) : replacementComposerDocument.file_url ? (
                      <iframe
                        src={replacementComposerDocument.file_url}
                        title={replacementComposerDocument.file_name || getVerificationTypeLabel(replacementComposerDocument.verification_type, language)}
                        className="h-56 w-full bg-white"
                      />
                    ) : (
                      <div className="flex h-56 items-center justify-center text-sm font-semibold text-slate-500">
                        {tr('No preview available', 'Aucun aperçu disponible')}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {tr('Quick reasons', 'Raisons rapides')}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {tr(
                          'Choose a common reason to start the note, then adjust the message before continuing.',
                          'Choisissez une raison fréquente pour démarrer la note, puis ajustez le message avant de continuer.'
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {feedbackPresets.map((preset) => {
                          const selected = replacementComposerPresetId === preset.id;
                          const presetMessage = tr(preset.message[0], preset.message[1]);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setReplacementComposerPresetId(preset.id);
                                setReplacementComposerMessage(presetMessage);
                              }}
                              className={`rounded-2xl border px-3 py-2 text-xs font-bold transition ${
                                selected
                                  ? 'border-violet-500 bg-violet-600 text-white shadow-[0_12px_24px_rgba(124,58,237,0.22)]'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                              }`}
                            >
                              {tr(preset.label[0], preset.label[1])}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {tr('Replacement note draft', 'Brouillon de note de remplacement')}
                      </span>
                      <textarea
                        value={replacementComposerMessage}
                        onChange={(event) => setReplacementComposerMessage(event.target.value)}
                        rows={6}
                        className="mt-2 w-full rounded-[22px] border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                        placeholder={tr(
                          'Example: Please upload a clearer passport or national ID. The current image is too blurry to read.',
                          'Exemple : Veuillez téléverser un passeport ou une carte nationale plus lisible. L’image actuelle est trop floue pour être lue.'
                        )}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReplacementComposerOpen(false)}
                    disabled={replacementComposerSubmitting}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                  <button
                    type="button"
                    onClick={submitReplacementComposer}
                    disabled={replacementComposerSubmitting}
                    className="inline-flex items-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {replacementComposerSubmitting
                      ? tr('Sending request...', 'Envoi de la demande...')
                      : tr('Send request and mark for replacement', 'Envoyer et demander le remplacement')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {documentPreviewOpen ? (
          <div
            className="absolute inset-0 z-20"
            onClick={() => setDocumentPreviewOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-950/30" />
            <div
              className="absolute inset-3 flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:inset-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-slate-950">
                    {activeDocument ? getVerificationTypeLabel(activeDocument.verification_type, language) : tr('Document preview', 'Aperçu du document')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {activeDocument?.submission_source_label || tr('Submitted document', 'Document soumis')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={showPreviousDocument}
                    disabled={activeDocumentIndex <= 0}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tr('Previous', 'Précédent')}
                  </button>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {Math.max(1, activeDocumentIndex + 1)} / {Math.max(1, documents.length)}
                  </span>
                  <button
                    type="button"
                    onClick={showNextDocument}
                    disabled={activeDocumentIndex >= documents.length - 1}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tr('Next', 'Suivant')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentPreviewOpen(false)}
                    className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden bg-slate-100 p-3 sm:p-4">
                {activeDocument?.file_url ? (
                  isPreviewableImage(activeDocument) ? (
                    <div className="flex h-full items-center justify-center overflow-auto rounded-[24px] bg-white p-3">
                      <img
                        src={activeDocument.file_url}
                        alt={getVerificationTypeLabel(activeDocument.verification_type, language)}
                        className="max-h-full w-auto max-w-full rounded-2xl object-contain"
                      />
                    </div>
                  ) : (
                    <iframe
                      src={activeDocument.file_url}
                      title={getVerificationTypeLabel(activeDocument.verification_type, language)}
                      className="h-full w-full rounded-[24px] border border-slate-200 bg-white"
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-500">
                    {tr('No document preview available.', 'Aucun aperçu disponible.')}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
};

export default VerificationReviewDrawer;
