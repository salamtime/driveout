import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle,
  Compass,
  CreditCard,
  Download,
  Eye,
  FileBadge2,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Store,
  User,
  Users,
  Clock,
  MessageSquare,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '../../lib/supabase';
import { TABLE_NAMES } from '../../config/tableNames';
import VerificationService from '../../services/VerificationService';
import { getCustomerRentalHistory } from '../../services/EnhancedUnifiedCustomerService';
import MessageService from '../../services/MessageService';
import { MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES } from '../../utils/messageCenter';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { buildAdminMarketplaceListingPath } from '../../utils/marketplaceAdminLinks';
import MessageWidget from '../../components/messages/MessageWidget';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';
import { mergeCustomerScanHistory } from '../../utils/customerIdentity';
import {
  ADMIN_EYEBROW_CLASS,
  ADMIN_MAIN_CARD_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_SOFT_CARD_CLASS,
} from '../../utils/adminSurfaceStyles';

const CUSTOMER_TABLE = 'app_4c3a7a6153_customers';
const SECOND_DRIVER_TABLE = 'app_4c3a7a6153_rental_second_drivers';

const formatDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-MA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const compactIdentifier = (value, prefix = 'ID') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Not available';
  if (/^RNT-/i.test(raw) || /^TOUR-/i.test(raw)) return raw;
  const normalized = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (!normalized) return raw;
  const shortTail = normalized.slice(-6).toUpperCase();
  return `${prefix}-${shortTail}`;
};

const compactCustomerId = (value) => compactIdentifier(value, 'CUST');
const compactUserId = (value) => compactIdentifier(value, 'USER');
const compactListingId = (value) => compactIdentifier(value, 'LIST');
const normalizeProfilePhone = (value) => String(value || '').replace(/[^\d+]/g, '').trim();

const getRentalHistoryTimestamp = (rental) => (
  rental?.updated_at ||
  rental?.completed_at ||
  rental?.started_at ||
  rental?.rental_end_date ||
  rental?.rental_start_date ||
  rental?.created_at ||
  0
);

const getRentalHistoryStatus = (rental) => {
  const normalized = String(
    rental?.rental_status ||
    rental?.status ||
    rental?.payment_status ||
    ''
  ).trim().toLowerCase();

  if (['active', 'ongoing', 'in_progress', 'started'].includes(normalized)) {
    return 'active';
  }
  if (['completed', 'finished', 'closed', 'returned'].includes(normalized)) {
    return 'completed';
  }
  if (['cancelled', 'canceled', 'no_show', 'rejected'].includes(normalized)) {
    return 'cancelled';
  }
  if (['scheduled', 'confirmed', 'pending'].includes(normalized)) {
    return 'scheduled';
  }

  return normalized || 'unknown';
};

const buildCustomerAccountThreadKey = ({ entityId, email }) => {
  const resolvedEntityId = String(entityId || '').trim();
  const resolvedEmail = String(email || '').trim().toLowerCase();
  return ['account_trust', 'account_status', 'user', resolvedEntityId || resolvedEmail || 'customer'].join(':');
};

const isCustomerAccountStatusThread = (thread = {}, authUserId = '') => {
  const normalizedAuthUserId = String(authUserId || '').trim();
  const normalizedFamily = String(thread?.family || '').trim().toLowerCase();
  const normalizedThreadType = String(thread?.thread_type || '').trim().toLowerCase();
  const normalizedEntityType = String(thread?.entity_type || thread?.context_type || '').trim().toLowerCase();
  const normalizedEntityId = String(thread?.entity_id || thread?.context_id || '').trim();

  return (
    normalizedFamily === MESSAGE_FAMILIES.accountTrust &&
    normalizedThreadType === MESSAGE_THREAD_TYPES.accountStatus &&
    normalizedEntityType === 'user' &&
    (!normalizedAuthUserId || normalizedEntityId === normalizedAuthUserId)
  );
};

const filterCustomerThreads = ({ threads, authUserId, email }) => {
  const allThreads = Array.isArray(threads) ? threads : [];
  const emailNeedle = String(email || '').trim().toLowerCase();
  const authNeedle = String(authUserId || '').trim();

  return allThreads.filter((thread) => {
    const normalizedEntityEmail = String(thread?.entity_email || '').trim().toLowerCase();
    const normalizedSenderEmail = String(thread?.sender_email || '').trim().toLowerCase();
    const normalizedRecipientEmail = String(thread?.recipient_email || '').trim().toLowerCase();
    const threadEntityId = String(thread?.entity_id || '').trim();
    return (
      (authNeedle && threadEntityId === authNeedle) ||
      (emailNeedle && [normalizedEntityEmail, normalizedSenderEmail, normalizedRecipientEmail].includes(emailNeedle))
    );
  }).slice(0, 8);
};

const getVerificationLabel = (summary) => {
  if (!summary) return 'Unverified';
  if (summary.isVerified || summary.verificationStatus === 'approved' || summary.status === 'approved') {
    return 'Verified';
  }
  if (summary.requiresChanges || summary.verificationStatus === 'rejected' || summary.status === 'rejected') {
    return 'Needs changes';
  }
  if (summary.pendingCount > 0 || summary.verificationStatus === 'pending' || summary.status === 'pending') {
    return 'Pending review';
  }
  return 'Unverified';
};

const getVerificationTone = (label) => {
  if (label === 'Verified') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (label === 'Needs changes') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (label === 'Pending review') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
};

const getVerificationDocumentStatusMeta = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') {
    return {
      label: 'Approved',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    };
  }
  if (normalized === 'rejected' || normalized === 'suspended') {
    return {
      label: 'Needs change',
      className: 'bg-rose-50 text-rose-700 ring-rose-200',
    };
  }
  if (normalized === 'archived') {
    return {
      label: 'History',
      className: 'bg-slate-100 text-slate-600 ring-slate-200',
    };
  }
  return {
    label: 'Pending review',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
};

const normalizeVerificationDocument = (document = {}) => ({
  ...document,
  verification_type: String(document?.verification_type || '').trim().toLowerCase() || 'supporting_document',
  file_url: String(document?.file_url || '').trim(),
});

const mergeVerificationDocuments = (...groups) => {
  const merged = [];
  const seen = new Set();

  groups.flat().filter(Boolean).forEach((rawDocument) => {
    const document = normalizeVerificationDocument(rawDocument);
    const dedupeKey =
      String(document?.id || '').trim() ||
      `${document.verification_type}::${document.file_url}` ||
      `${document.verification_type}::${String(document?.created_at || '')}`;

    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push(document);
  });

  const priority = {
    profile_id: 0,
    driver_license: 1,
  };

  return merged.sort((a, b) => {
    const left = priority[String(a?.verification_type || '').toLowerCase()] ?? 99;
    const right = priority[String(b?.verification_type || '').toLowerCase()] ?? 99;
    if (left !== right) return left - right;
    return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
  });
};

const normalizeDocumentUrl = (value) => {
  const normalized = typeof value === 'object' && value !== null
    ? String(value.url || value.public_url || value.publicUrl || value.path || '').trim()
    : String(value || '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return '';
  return normalized;
};

const copyTextToClipboard = async (value) => {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error('Nothing to copy');
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
};

const dedupeNormalizedUrls = (values = []) => (
  [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeDocumentUrl(value)).filter(Boolean))]
);

const withoutNormalizedUrl = (values = [], removedUrl = '') => {
  const targetUrl = normalizeDocumentUrl(removedUrl);
  return dedupeNormalizedUrls(values).filter((value) => value !== targetUrl);
};

const isImagePreviewUrl = (value) => /\.(jpg|jpeg|png|webp|gif)$/i.test(String(value || '').trim());

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

const buildVerificationComparisonRows = (document = {}, profile = {}) => {
  const metadata = document?.submission_metadata && typeof document.submission_metadata === 'object'
    ? document.submission_metadata
    : {};

  const rows = [
    {
      key: 'full_name',
      label: 'Full name',
      profileValue: cleanComparisonValue(profile.full_name || profile.display_name || profile.email),
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
      label: 'Date of birth',
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
      label: 'License number',
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
      label: 'ID number',
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

const getComparisonBadgeTone = (matchState) => {
  if (matchState === 'match') return 'bg-emerald-100 text-emerald-700';
  if (matchState === 'mismatch') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-200 text-slate-600';
};

const getComparisonBadgeLabel = (matchState) => {
  if (matchState === 'match') return 'Match';
  if (matchState === 'mismatch') return 'Mismatch';
  if (matchState === 'partial') return 'Partial';
  return 'Not detected';
};

const getVerificationFieldValue = (document, fieldType) => {
  const metadata = document?.submission_metadata && typeof document.submission_metadata === 'object'
    ? document.submission_metadata
    : {};

  if (fieldType === 'full_name') {
    return readNestedMetadataValue(
      metadata,
      ['full_name', 'fullName', 'name', 'customer_name', 'customerName'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'phone') {
    return readNestedMetadataValue(
      metadata,
      ['phone', 'customer_phone', 'phoneNumber'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'email') {
    return readNestedMetadataValue(
      metadata,
      ['email', 'customer_email'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'date_of_birth') {
    return readNestedMetadataValue(
      metadata,
      ['date_of_birth', 'dateOfBirth', 'customer_dob', 'dob'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'nationality') {
    return readNestedMetadataValue(
      metadata,
      ['nationality', 'customer_nationality'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'licence_number') {
    return readNestedMetadataValue(
      metadata,
      ['license_number', 'licence_number', 'licenseNumber', 'licenceNumber', 'driver_license_number', 'permit_number', 'document_number'],
      ['customerReviewedFields', 'extractedFields']
    );
  }
  if (fieldType === 'id_number') {
    return readNestedMetadataValue(
      metadata,
      ['id_number', 'idNumber', 'document_number', 'passport_number', 'passportNumber'],
      ['customerReviewedFields', 'extractedFields']
    );
  }

  return '';
};

const buildVerificationIdentityFallback = (documents = []) => {
  const normalizedDocuments = Array.isArray(documents) ? documents.filter(Boolean) : [];
  const sortDocumentsForField = (fieldType) => [...normalizedDocuments].sort((left, right) => {
    const normalizedLeftType = String(left?.verification_type || '').toLowerCase();
    const normalizedRightType = String(right?.verification_type || '').toLowerCase();
    const priority = (() => {
      if (fieldType === 'id_number') {
        return {
          profile_id: 0,
          driver_license: 1,
        };
      }

      if (fieldType === 'licence_number') {
        return {
          driver_license: 0,
          profile_id: 1,
        };
      }

      return {
        profile_id: 0,
        driver_license: 1,
      };
    })();

    const leftPriority = priority[normalizedLeftType] ?? 99;
    const rightPriority = priority[normalizedRightType] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
  });

  const pickField = (fieldType) => {
    const sortedDocuments = sortDocumentsForField(fieldType);
    for (const document of sortedDocuments) {
      const value = cleanComparisonValue(getVerificationFieldValue(document, fieldType));
      if (value) return value;
    }
    return '';
  };

  return {
    full_name: pickField('full_name'),
    phone: pickField('phone'),
    email: pickField('email'),
    date_of_birth: pickField('date_of_birth'),
    nationality: pickField('nationality'),
    licence_number: pickField('licence_number'),
    id_number: pickField('id_number'),
  };
};

const SummaryCard = ({ icon: Icon, eyebrow, title, description }) => (
  <div className={ADMIN_MAIN_CARD_CLASS}>
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  </div>
);

const QuickActionCard = ({ icon: Icon, label, hint, href, onClick, tone = 'violet' }) => {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-violet-100 text-violet-700';

  const content = (
    <div className={`${ADMIN_SOFT_CARD_CLASS} transition hover:bg-slate-50`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-3 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );

  if (href) return <Link to={href}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="w-full text-left">{content}</button>;
  return content;
};

const SectionShell = ({ title, description, children }) => (
  <section className={ADMIN_MAIN_CARD_CLASS}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

const CompactTimelineCard = ({ icon: Icon, title, meta, href, tone = 'slate' }) => {
  const toneClass =
    tone === 'violet'
      ? 'bg-violet-100 text-violet-700'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
          ? 'bg-slate-100 text-slate-700'
          : 'bg-slate-100 text-slate-700';

  const content = (
    <div className={`${ADMIN_SOFT_CARD_CLASS} transition-colors hover:bg-slate-50`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-2.5 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {meta ? <p className="mt-1 text-sm leading-6 text-slate-500">{meta}</p> : null}
        </div>
      </div>
    </div>
  );

  if (!href) return content;
  return <Link to={href}>{content}</Link>;
};

const KeyValueGrid = ({ items }) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((item) => (
      <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4">
        <p className={ADMIN_EYEBROW_CLASS}>{item.label}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{item.value || 'Not available'}</p>
      </div>
    ))}
  </div>
);

const AlertBanner = ({ tone = 'slate', title, children }) => {
  const toneClass =
    tone === 'amber'
      ? 'border-slate-200 bg-slate-50 text-slate-800'
    : tone === 'red'
        ? 'border-rose-200 bg-rose-50/90 text-rose-900'
      : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
          : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1 text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

const PreviewCard = ({ title, subtitle, imageUrl, href }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
    <div className="flex items-start gap-4">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        {subtitle ? <p className={`mt-2 ${ADMIN_EYEBROW_CLASS}`}>{subtitle}</p> : null}
        {href ? (
          <div className="mt-4">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={ADMIN_OUTLINE_BUTTON_CLASS}
            >
              <Eye className="h-4 w-4" />
              Open document
            </a>
          </div>
        ) : null}
      </div>
    </div>
  </div>
);

const VerificationDocumentCard = ({
  title,
  document,
  reviewHref,
  comparisonProfile,
  canDelete = false,
  isDeleting = false,
  onDelete = null,
}) => {
  const normalizedDocumentStatus = String(document?.status || '').toLowerCase();
  const documentNeedsChange = ['rejected', 'suspended'].includes(normalizedDocumentStatus);
  const statusLabel = getVerificationLabel({
    status: document?.status,
    verificationStatus: document?.status,
    pendingCount: document?.status === 'pending' ? 1 : 0,
    approvedCount: document?.status === 'approved' ? 1 : 0,
    requiresChanges: ['rejected', 'suspended'].includes(String(document?.status || '').toLowerCase()),
  });
  const previewUrl = String(document?.file_url || '').trim();
  const canPreviewImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(previewUrl);
  const comparisonRows = buildVerificationComparisonRows(document, comparisonProfile);
  const hasScanDetails = comparisonRows.some((row) => row.extractedValue || row.confirmedValue);
  const metadata = document?.submission_metadata && typeof document.submission_metadata === 'object'
    ? document.submission_metadata
    : {};
  const ocrAttempted = Boolean(metadata?.ocrAttempted || metadata?.source === 'ocr_scan');
  const ocrSucceeded = Boolean(metadata?.ocrSucceeded);
  const confirmedFieldsCount = metadata?.customerReviewedFields && typeof metadata.customerReviewedFields === 'object'
    ? Object.values(metadata.customerReviewedFields).filter((value) => String(value ?? '').trim()).length
    : 0;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
          {previewUrl && canPreviewImage ? (
            <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <FileBadge2 className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-900">{title}</p>
            {documentNeedsChange ? (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                Needs change
              </span>
            ) : null}
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getVerificationTone(statusLabel)}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {statusLabel}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p>Submitted: <span className="font-semibold text-slate-900">{formatDate(document?.created_at)}</span></p>
            <p>Source: <span className="font-semibold text-slate-900">{document?.submission_source_label || 'Submitted document'}</span></p>
            <p>Expiry: <span className="font-semibold text-slate-900">{document?.expires_at ? formatDate(document.expires_at) : 'No expiry'}</span></p>
            <p>Owner: <span className="font-semibold text-slate-900">{document?.owner_email || 'Linked customer'}</span></p>
          </div>
          {ocrAttempted ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ocrSucceeded ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {ocrSucceeded ? 'Scan completed' : 'OCR attempted'}
              </span>
              {confirmedFieldsCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                  Customer confirmed {confirmedFieldsCount} field{confirmedFieldsCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          ) : null}
          {document?.rejection_reason ? (
            <div className="mt-3 rounded-[18px] border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-medium text-rose-700">
              {document.rejection_reason}
            </div>
          ) : null}
          {hasScanDetails ? (
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className={ADMIN_EYEBROW_CLASS}>Scanned details</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Compare the customer profile with the scanned document values.
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                  Admin review
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {comparisonRows.map((row) => (
                  <div key={`${document?.id || title}-${row.key}`} className="rounded-[18px] border border-white bg-white/90 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getComparisonBadgeTone(row.matchState)}`}>
                        {getComparisonBadgeLabel(row.matchState)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 xl:grid-cols-3">
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Current profile</p>
                        <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">{row.profileValue || 'Not provided'}</p>
                      </div>
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">OCR extracted</p>
                        <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">{row.extractedValue || 'Not detected'}</p>
                      </div>
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Customer confirmed</p>
                        <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">{row.confirmedValue || 'Not provided'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ADMIN_OUTLINE_BUTTON_CLASS}
              >
                <Eye className="h-4 w-4" />
                Preview
              </a>
            ) : null}
            {canDelete && onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting…' : 'Delete ID'}
              </button>
            ) : null}
            {reviewHref ? (
              <Link
                to={reviewHref}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                <ShieldCheck className="h-4 w-4" />
                Open review
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-MA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const ThreadPreviewCard = ({ thread, openHref }) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const recentMessages = messages.slice(0, 3);
  const latestMessage = recentMessages[0] || null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Active thread</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {thread?.subject || thread?.entity_email || 'Shared customer thread'}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {latestMessage?.body || thread?.latest_message || 'No recent message yet.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            {thread?.family ? String(thread.family).replace(/_/g, ' ') : 'shared thread'}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {formatDateTime(latestMessage?.created_at || thread?.latest_message_at)}
          </span>
        </div>
      </div>

      {recentMessages.length > 0 ? (
        <div className="mt-4 space-y-3">
          {recentMessages.map((message) => (
            <div key={message.id || `${message.created_at}-${message.body}`} className="rounded-[20px] border border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={ADMIN_EYEBROW_CLASS}>
                  {message.sender_name || message.sender_email || message.sender_role || 'Message'}
                </p>
                <p className="text-xs font-semibold text-slate-400">{formatDateTime(message.created_at)}</p>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{message.body || 'No content'}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Link
          to={openHref}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          <MessageSquare className="h-4 w-4" />
          Open in Message Center
        </Link>
      </div>
    </div>
  );
};

const SecondDriverCard = ({ driver, index }) => {
  const imageUrl = driver?.id_scan_url || driver?.customer_id_image || driver?.id_image || '';
  return (
    <div className={`${ADMIN_SOFT_CARD_CLASS} shadow-sm`}>
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[20px] border border-slate-100 bg-white">
          {imageUrl ? (
            <img src={imageUrl} alt={driver?.full_name || `Driver ${index + 1}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <User className="h-7 w-7" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold text-slate-900">{driver?.full_name || `Driver ${index + 1}`}</p>
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
              Driver #{index + 1}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {driver?.licence_number ? <p>License: <span className="font-semibold text-slate-900">{driver.licence_number}</span></p> : null}
            {driver?.document_type ? <p>Document type: <span className="font-semibold text-slate-900">{driver.document_type}</span></p> : null}
            {driver?.id_number || driver?.document_number ? <p>ID: <span className="font-semibold text-slate-900">{driver.id_number || driver.document_number}</span></p> : null}
            {driver?.phone ? <p>Phone: <span className="font-semibold text-slate-900">{driver.phone}</span></p> : null}
            {driver?.email ? <p>Email: <span className="font-semibold text-slate-900">{driver.email}</span></p> : null}
            {driver?.nationality ? <p>Nationality: <span className="font-semibold text-slate-900">{driver.nationality}</span></p> : null}
          </div>
          {imageUrl ? (
            <div className="mt-4">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-800"
              >
                <Download className="h-4 w-4" />
                Open full image
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const AdminCustomerProfile = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { customerId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [appUserProfile, setAppUserProfile] = useState(null);
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [verificationHistoryRequests, setVerificationHistoryRequests] = useState([]);
  const [latestRental, setLatestRental] = useState(null);
  const [rentalHistory, setRentalHistory] = useState([]);
  const [secondDrivers, setSecondDrivers] = useState([]);
  const [tourGroups, setTourGroups] = useState([]);
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [marketplaceVehicleProfiles, setMarketplaceVehicleProfiles] = useState([]);
  const [relatedThreads, setRelatedThreads] = useState([]);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [customerProfileNote, setCustomerProfileNote] = useState('');
  const [customerBanNote, setCustomerBanNote] = useState('');
  const [customerAlertEnabled, setCustomerAlertEnabled] = useState(false);
  const [customerNoteHistory, setCustomerNoteHistory] = useState([]);
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);
  const [savingCustomerBan, setSavingCustomerBan] = useState(false);
  const [deletingDocumentKey, setDeletingDocumentKey] = useState('');
  const [uploadingCustomerDocument, setUploadingCustomerDocument] = useState(false);
  const [showCopyConfirmation, setShowCopyConfirmation] = useState(false);
  const [activeTab, setActiveTab] = useState('messages');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [shellCounts, setShellCounts] = useState({
    rentals: 0,
    tours: 0,
  });
  const customerNoteTextareaRef = useRef(null);
  const customerBanTextareaRef = useRef(null);
  const copyConfirmationTimeoutRef = useRef(null);
  const customerDocumentInputRef = useRef(null);
  useAdminModalFocus(Boolean(previewDocument), 'customer-profile-preview');

  const authUserIdParam = useMemo(() => {
    const value = searchParams.get('authUserId');
    return value ? String(value).trim() : '';
  }, [searchParams]);

  const customerIdQueryParam = useMemo(() => {
    const value = searchParams.get('customerId');
    return value ? String(value).trim() : '';
  }, [searchParams]);

  const emailParam = useMemo(() => {
    const value = searchParams.get('email');
    return value ? String(value).trim().toLowerCase() : '';
  }, [searchParams]);

  const rentalIdParam = useMemo(() => {
    const value = searchParams.get('rentalId');
    return value ? String(value).trim() : '';
  }, [searchParams]);
  const seededVerificationDocuments = useMemo(
    () => (Array.isArray(location.state?.verificationDocuments) ? location.state.verificationDocuments.filter(Boolean) : []),
    [location.state]
  );
  const seededVerificationSummary = useMemo(
    () => (location.state?.verificationSummary && typeof location.state.verificationSummary === 'object' ? location.state.verificationSummary : null),
    [location.state]
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError('');

      try {
        let customerRecord = null;
        let userRecord = null;
        let latestRentalRecord = null;
        const resolvedCustomerId = customerId || customerIdQueryParam;

        if (resolvedCustomerId) {
          const { data } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('*')
            .eq('id', resolvedCustomerId)
            .maybeSingle();
          customerRecord = data || null;
        }

        const candidateEmail = emailParam || String(customerRecord?.email || '').trim().toLowerCase();

        if (authUserIdParam) {
          const { data } = await supabase
            .from(TABLE_NAMES.USERS)
            .select('*')
            .eq('id', authUserIdParam)
            .maybeSingle();
          userRecord = data || null;
        }

        if (!userRecord && candidateEmail) {
          const { data } = await supabase
            .from(TABLE_NAMES.USERS)
            .select('*')
            .ilike('email', candidateEmail)
            .maybeSingle();
          userRecord = data || null;
        }

        if (!customerRecord && candidateEmail) {
          const { data } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('*')
            .ilike('email', candidateEmail)
            .maybeSingle();
          customerRecord = data || null;
        }

        const resolvedAuthUserId = authUserIdParam || userRecord?.id || '';
        const resolvedEmail = candidateEmail || String(userRecord?.email || '').trim().toLowerCase();
        const resolvedPhone = normalizeProfilePhone(
          customerRecord?.phone ||
          userRecord?.phone ||
          ''
        );
        const resolvedLicenceNumber = String(
          customerRecord?.licence_number ||
          customerRecord?.scan_metadata?.customer_licence_number ||
          customerRecord?.scan_metadata?.licence_number ||
          ''
        ).trim();
        const resolvedIdNumber = String(
          customerRecord?.id_number ||
          customerRecord?.scan_metadata?.customer_id_number ||
          customerRecord?.scan_metadata?.id_number ||
          ''
        ).trim();
        const resolvedCustomerName = String(
          customerRecord?.full_name ||
          userRecord?.full_name ||
          userRecord?.name ||
          ''
        ).trim();

        if (rentalIdParam) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .eq('id', rentalIdParam)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && customerRecord?.id) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .eq('customer_id', customerRecord.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && resolvedEmail) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .ilike('customer_email', resolvedEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && resolvedAuthUserId) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .eq('booked_by_user_id', resolvedAuthUserId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && resolvedPhone) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .eq('customer_phone', resolvedPhone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && resolvedLicenceNumber) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .or(`customer_licence_number.ilike.${resolvedLicenceNumber},licence_number.ilike.${resolvedLicenceNumber}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        if (!latestRentalRecord && resolvedIdNumber) {
          const { data } = await supabase
            .from(TABLE_NAMES.RENTALS)
            .select('*')
            .or(`customer_id_number.ilike.${resolvedIdNumber},id_number.ilike.${resolvedIdNumber}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestRentalRecord = data || null;
        }

        const [verificationResult, rentalsResult, toursResult, rentalHistoryResult, recentRentalsResult, phoneRentalsResult, licenceRentalsResult, idNumberRentalsResult, nameRentalsResult, sharedThreadsResult] = await Promise.all([
          resolvedAuthUserId
            ? (async () => {
                const entityVerification = await VerificationService
                  .getEntityVerificationFile('user', resolvedAuthUserId)
                  .catch(() => ({ summary: null, requests: [], historyRequests: [] }));

                const entityRequests = Array.isArray(entityVerification?.requests) ? entityVerification.requests : [];
                const entityHistoryRequests = Array.isArray(entityVerification?.historyRequests)
                  ? entityVerification.historyRequests
                  : [];
                if (entityRequests.length > 0 || entityHistoryRequests.length > 0 || !resolvedAuthUserId) {
                  return entityVerification;
                }

                const adminFallback = await VerificationService
                  .getVerificationRequests({
                    entityType: 'user',
                    ownerUserId: resolvedAuthUserId,
                    limit: 20,
                  })
                  .catch(() => ({ requests: [] }));

                const fallbackRequests = Array.isArray(adminFallback?.requests)
                  ? adminFallback.requests.filter((request) => String(request?.entity_id || '') === String(resolvedAuthUserId))
                  : [];
                const fallbackActiveRequests = fallbackRequests.filter(
                  (request) => String(request?.status || '').trim().toLowerCase() !== 'archived'
                );
                const fallbackHistoryRequests = fallbackRequests.filter(
                  (request) => String(request?.status || '').trim().toLowerCase() === 'archived'
                );

                return {
                  summary: entityVerification?.summary || null,
                  requests: fallbackActiveRequests,
                  historyRequests: fallbackHistoryRequests,
                };
              })()
            : Promise.resolve({ summary: null, requests: [] }),
          resolvedEmail
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('id', { count: 'exact', head: true })
                .or(`customer_email.ilike.${resolvedEmail},booked_by_user_id.eq.${resolvedAuthUserId || '00000000-0000-0000-0000-000000000000'}`)
            : Promise.resolve({ count: 0 }),
          resolvedEmail
            ? supabase
                .from(TABLE_NAMES.TOUR_BOOKINGS)
                .select('id', { count: 'exact', head: true })
                .ilike('customer_email', resolvedEmail)
            : Promise.resolve({ count: 0 }),
          customerRecord?.id ? getCustomerRentalHistory(customerRecord.id) : Promise.resolve({ success: true, data: [] }),
          resolvedEmail || resolvedAuthUserId
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('*')
                .or(
                  [
                    resolvedEmail ? `customer_email.ilike.${resolvedEmail}` : null,
                    resolvedAuthUserId ? `booked_by_user_id.eq.${resolvedAuthUserId}` : null,
                  ].filter(Boolean).join(',')
                )
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          resolvedPhone
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('*')
                .eq('customer_phone', resolvedPhone)
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          resolvedLicenceNumber
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('*')
                .or(`customer_licence_number.ilike.${resolvedLicenceNumber},licence_number.ilike.${resolvedLicenceNumber}`)
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          resolvedIdNumber
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('*')
                .or(`customer_id_number.ilike.${resolvedIdNumber},id_number.ilike.${resolvedIdNumber}`)
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          resolvedCustomerName
            ? supabase
                .from(TABLE_NAMES.RENTALS)
                .select('*')
                .ilike('customer_name', resolvedCustomerName)
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          MessageService.listSharedThreads().catch(() => ({ threads: [] })),
        ]);

        const [tourRowsResult, marketplaceListingsResult, marketplaceVehicleProfilesResult] = await Promise.all([
          resolvedEmail
            ? supabase
                .from(TABLE_NAMES.TOUR_BOOKINGS)
                .select('*')
                .ilike('customer_email', resolvedEmail)
                .order('created_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
          resolvedAuthUserId
            ? supabase
                .from('app_marketplace_listings')
                .select('id, title, listing_status, review_status, updated_at, created_at')
                .eq('owner_id', resolvedAuthUserId)
                .order('updated_at', { ascending: false })
                .limit(12)
            : Promise.resolve({ data: [] }),
          resolvedAuthUserId
            ? supabase
                .from('app_vehicle_public_profiles')
                .select('id, owner_id, brand_name, model_name, status, updated_at, created_at')
                .eq('owner_id', resolvedAuthUserId)
                .order('updated_at', { ascending: false })
                .limit(24)
            : Promise.resolve({ data: [] }),
        ]);

        if (!active) return;

        const fallbackRental = latestRentalRecord;
        let mergedCustomerData = null;

        if (fallbackRental) {
          const mergedIdScanHistory = mergeVerificationDocuments(
            ...(Array.isArray(customerRecord?.customer_id_scan_history)
              ? customerRecord.customer_id_scan_history.map((url, index) => ({
                  id: `customer-history-${index}`,
                  verification_type: 'profile_id',
                  file_url: url,
                }))
              : []),
            ...(Array.isArray(fallbackRental?.customer_id_scan_history)
              ? fallbackRental.customer_id_scan_history.map((url, index) => ({
                  id: `rental-history-${index}`,
                  verification_type: 'profile_id',
                  file_url: url,
                }))
              : [])
          ).map((document) => document.file_url);

          mergedCustomerData = {
            id: customerRecord?.id || fallbackRental.customer_id || resolvedCustomerId || null,
            isRentalBased: true,
            full_name: customerRecord?.full_name || fallbackRental.customer_name || 'Unknown',
            email: customerRecord?.email || fallbackRental.customer_email || fallbackRental.email || '',
            phone: customerRecord?.phone || fallbackRental.customer_phone || fallbackRental.phone || '',
            address: customerRecord?.address || fallbackRental.customer_address || fallbackRental.address || '',
            licence_number:
              customerRecord?.licence_number ||
              customerRecord?.scan_metadata?.customer_licence_number ||
              customerRecord?.scan_metadata?.licence_number ||
              fallbackRental.customer_licence_number ||
              fallbackRental.licence_number ||
              '',
            id_number:
              customerRecord?.id_number ||
              customerRecord?.scan_metadata?.customer_id_number ||
              customerRecord?.scan_metadata?.id_number ||
              fallbackRental.customer_id_number ||
              fallbackRental.id_number ||
              '',
            date_of_birth:
              customerRecord?.date_of_birth ||
              customerRecord?.scan_metadata?.customer_dob ||
              customerRecord?.scan_metadata?.date_of_birth ||
              fallbackRental.customer_dob ||
              fallbackRental.date_of_birth ||
              '',
            nationality:
              customerRecord?.nationality ||
              customerRecord?.scan_metadata?.customer_nationality ||
              customerRecord?.scan_metadata?.nationality ||
              fallbackRental.customer_nationality ||
              fallbackRental.nationality ||
              '',
            created_at: customerRecord?.created_at || fallbackRental.created_at,
            customer_id_image: customerRecord?.customer_id_image || fallbackRental.customer_id_image || '',
            customer_id_scan_history: mergedIdScanHistory,
            id_scan_url: customerRecord?.id_scan_url || fallbackRental.customer?.id_scan_url || '',
            extra_images: customerRecord?.extra_images || [],
            scan_metadata: {
              ...(customerRecord?.scan_metadata || {}),
            },
            _source: customerRecord ? 'rental' : 'fallback_rental',
            _rentalId: fallbackRental.id,
            customer_profile: customerRecord
              ? {
                  id: customerRecord.id,
                  full_name: customerRecord.full_name,
                  email: customerRecord.email,
                  phone: customerRecord.phone,
                  nationality: customerRecord.nationality,
                }
              : null,
            is_banned: Boolean(customerRecord?.scan_metadata?.is_banned),
            ban_note: customerRecord?.scan_metadata?.ban_note || '',
            has_active_alert_note: Boolean(customerRecord?.scan_metadata?.show_admin_note_alert),
            active_alert_note: customerRecord?.scan_metadata?.admin_note || '',
          };
        } else if (customerRecord) {
          mergedCustomerData = {
            ...customerRecord,
            customer_id_scan_history: Array.isArray(customerRecord?.customer_id_scan_history)
              ? customerRecord.customer_id_scan_history
              : [],
            isRentalBased: false,
            _source: 'profile',
            licence_number:
              customerRecord?.licence_number ||
              customerRecord?.scan_metadata?.customer_licence_number ||
              customerRecord?.scan_metadata?.licence_number ||
              '',
            id_number:
              customerRecord?.id_number ||
              customerRecord?.scan_metadata?.customer_id_number ||
              customerRecord?.scan_metadata?.id_number ||
              '',
            date_of_birth:
              customerRecord?.date_of_birth ||
              customerRecord?.scan_metadata?.customer_dob ||
              customerRecord?.scan_metadata?.date_of_birth ||
              '',
            nationality:
              customerRecord?.nationality ||
              customerRecord?.scan_metadata?.customer_nationality ||
              customerRecord?.scan_metadata?.nationality ||
              '',
            is_banned: Boolean(customerRecord?.scan_metadata?.is_banned),
            ban_note: customerRecord?.scan_metadata?.ban_note || '',
            has_active_alert_note: Boolean(customerRecord?.scan_metadata?.show_admin_note_alert),
            active_alert_note: customerRecord?.scan_metadata?.admin_note || '',
          };
        } else if (userRecord) {
          mergedCustomerData = {
            id: resolvedCustomerId || null,
            full_name: userRecord.full_name || userRecord.name || '',
            email: userRecord.email || resolvedEmail,
            phone: userRecord.phone || '',
            nationality: '',
            created_at: userRecord.created_at || '',
            _source: 'profile',
            isRentalBased: false,
            extra_images: [],
            is_banned: false,
            ban_note: '',
            has_active_alert_note: false,
            active_alert_note: '',
          };
        }

        const safeRentalHistory = rentalHistoryResult?.success ? rentalHistoryResult.data || [] : [];
        const safeRecentRentals = [
          ...(Array.isArray(recentRentalsResult?.data) ? recentRentalsResult.data : []),
          ...(Array.isArray(phoneRentalsResult?.data) ? phoneRentalsResult.data : []),
          ...(Array.isArray(licenceRentalsResult?.data) ? licenceRentalsResult.data : []),
          ...(Array.isArray(idNumberRentalsResult?.data) ? idNumberRentalsResult.data : []),
          ...(Array.isArray(nameRentalsResult?.data) ? nameRentalsResult.data : []),
        ];
        const rentalIdsForSecondDrivers = [...new Set(
          [
            rentalIdParam,
            latestRentalRecord?.id,
            ...safeRentalHistory.map((rental) => rental?.id),
            ...safeRecentRentals.map((rental) => rental?.id),
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )];
        const secondDriversResult = rentalIdsForSecondDrivers.length > 0
          ? await supabase
              .from('app_4c3a7a6153_rental_second_drivers')
              .select('*')
              .in('rental_id', rentalIdsForSecondDrivers)
          : { data: [] };
        const safeTourRows = Array.isArray(tourRowsResult?.data) ? tourRowsResult.data : [];
        const groupedTours = Array.from(
          safeTourRows.reduce((groups, row) => {
            const groupKey = String(row.group_id || row.tour_group_id || row.groupId || row.id);
            if (!groups.has(groupKey)) {
              groups.set(groupKey, []);
            }
            groups.get(groupKey).push(row);
            return groups;
          }, new Map()).entries()
        ).map(([groupKey, rows]) => {
          const sorted = [...rows].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          const first = sorted[0] || {};
          return {
            id: groupKey,
            title: first.package_name || first.route_name || 'Tour booking',
            status: String(first.rental_status || first.status || 'scheduled').toLowerCase(),
            date: first.scheduled_for || first.rental_start_date || first.created_at || null,
            rows: sorted,
          };
        }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        const allThreads = Array.isArray(sharedThreadsResult?.threads) ? sharedThreadsResult.threads : [];
        const customerThreads = filterCustomerThreads({
          threads: allThreads,
          authUserId: resolvedAuthUserId,
          email: resolvedEmail,
        });

        setCustomerProfile(customerRecord);
        setAppUserProfile(userRecord);
        setVerificationSummary(verificationResult?.summary || null);
        setVerificationRequests(Array.isArray(verificationResult?.requests) ? verificationResult.requests : []);
        setVerificationHistoryRequests(Array.isArray(verificationResult?.historyRequests) ? verificationResult.historyRequests : []);
        setLatestRental(latestRentalRecord || null);
        setCustomerData(mergedCustomerData);
        setRentalHistory([...safeRentalHistory, ...safeRecentRentals]);
        setSecondDrivers(secondDriversResult?.data || []);
        setTourGroups(groupedTours);
        setMarketplaceListings(Array.isArray(marketplaceListingsResult?.data) ? marketplaceListingsResult.data : []);
        setMarketplaceVehicleProfiles(Array.isArray(marketplaceVehicleProfilesResult?.data) ? marketplaceVehicleProfilesResult.data : []);
        setRelatedThreads(customerThreads);
        setShellCounts({
          rentals: Number(rentalsResult?.count || safeRentalHistory.length || 0),
          tours: Number(toursResult?.count || groupedTours.length || 0),
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || 'Unable to open the customer profile right now.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [authUserIdParam, customerId, customerIdQueryParam, emailParam, rentalIdParam]);

  const verificationDocumentsForIdentity = useMemo(
    () => mergeVerificationDocuments(verificationRequests, seededVerificationDocuments),
    [seededVerificationDocuments, verificationRequests]
  );
  const ocrIdentityFallback = useMemo(
    () => buildVerificationIdentityFallback(verificationDocumentsForIdentity),
    [verificationDocumentsForIdentity]
  );
  const displayName =
    ocrIdentityFallback.full_name ||
    customerData?.full_name ||
    customerProfile?.full_name ||
    appUserProfile?.full_name ||
    appUserProfile?.name ||
    'Customer profile';
  const displayEmail =
    customerData?.email ||
    customerProfile?.email ||
    appUserProfile?.email ||
    ocrIdentityFallback.email ||
    emailParam ||
    'Email not available';
  const identityFallback = useMemo(() => ({
    date_of_birth:
      customerData?.date_of_birth ||
      customerData?.scan_metadata?.customer_dob ||
      customerData?.scan_metadata?.date_of_birth ||
      latestRental?.customer_dob ||
      latestRental?.date_of_birth ||
      customerProfile?.date_of_birth ||
      appUserProfile?.date_of_birth ||
      ocrIdentityFallback.date_of_birth ||
      '',
    nationality:
      customerData?.nationality ||
      customerData?.scan_metadata?.customer_nationality ||
      customerData?.scan_metadata?.nationality ||
      latestRental?.customer_nationality ||
      latestRental?.nationality ||
      customerProfile?.nationality ||
      ocrIdentityFallback.nationality ||
      '',
    id_number:
      customerData?.id_number ||
      customerData?.scan_metadata?.customer_id_number ||
      customerData?.scan_metadata?.id_number ||
      latestRental?.customer_id_number ||
      latestRental?.id_number ||
      customerProfile?.id_number ||
      appUserProfile?.id_number ||
      ocrIdentityFallback.id_number ||
      '',
    licence_number:
      customerData?.licence_number ||
      customerData?.license_number ||
      customerData?.scan_metadata?.customer_licence_number ||
      customerData?.scan_metadata?.licence_number ||
      customerData?.scan_metadata?.license_number ||
      latestRental?.customer_licence_number ||
      latestRental?.licence_number ||
      latestRental?.license_number ||
      customerProfile?.licence_number ||
      customerProfile?.license_number ||
      appUserProfile?.licence_number ||
      appUserProfile?.license_number ||
      ocrIdentityFallback.licence_number ||
      '',
  }), [appUserProfile, customerData, customerProfile, latestRental, ocrIdentityFallback]);
  const effectiveVerificationSummary = verificationSummary || seededVerificationSummary;
  const verificationLabel = getVerificationLabel(effectiveVerificationSummary);
  const displayCustomerId = compactCustomerId(customerData?.id || customerId || customerIdQueryParam);
  const displayAuthUserId = compactUserId(authUserIdParam || appUserProfile?.id);
  const resolvedAuthUserId = authUserIdParam || appUserProfile?.id || '';
  const marketplaceVehicleCount = marketplaceVehicleProfiles.length;
  const marketplaceListingCount = marketplaceListings.length;
  const liveMarketplaceListingsCount = marketplaceListings.filter((listing) => String(listing?.listing_status || '').trim().toLowerCase() === 'live').length;
  const pendingMarketplaceListingsCount = marketplaceListings.filter((listing) => ['pending_review', 'pending', 'approved'].includes(String(listing?.listing_status || '').trim().toLowerCase())).length;
  const draftMarketplaceListingsCount = Math.max(marketplaceListingCount - liveMarketplaceListingsCount - pendingMarketplaceListingsCount, 0);
  const accountTypeLabel = marketplaceVehicleCount > 0
    ? 'Private owner'
    : 'Customer';
  const ownerStageLabel = marketplaceVehicleCount === 0
    ? 'Customer only'
    : liveMarketplaceListingsCount > 0
      ? 'Live listing'
      : pendingMarketplaceListingsCount > 0
        ? 'Pending review'
        : marketplaceListingCount > 0
          ? 'Listing draft'
          : verificationLabel === 'Pending review'
            ? 'Verification pending'
            : 'Vehicle saved';
  const displayRentalReference =
    latestRental?.rental_id ||
    customerData?._rentalId ||
    latestRental?.id ||
    '';
  const messageThreadKey = buildCustomerAccountThreadKey({
    entityId: resolvedAuthUserId,
    email: displayEmail,
  });
  const primaryCustomerThread =
    relatedThreads.find((thread) => isCustomerAccountStatusThread(thread, resolvedAuthUserId)) ||
    relatedThreads.find((thread) => String(thread?.thread_key || '').trim() === messageThreadKey) ||
    relatedThreads[0] ||
    null;
  const primaryCustomerThreadHref = `/admin/messages?threadKey=${encodeURIComponent(String(primaryCustomerThread?.thread_key || messageThreadKey))}`;
  const canMessageCustomer = Boolean(resolvedAuthUserId);
  const adminDisplayName = String(
    userProfile?.username ||
    userProfile?.fullName ||
    userProfile?.full_name ||
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'Admin'
  ).trim();
  const currentRole = String(
    userProfile?.role ||
    user?.role ||
    user?.user_metadata?.role ||
    ''
  ).trim().toLowerCase();
  const canManageCustomerAlerts = ['owner', 'admin'].includes(currentRole);
  const canDeleteCustomerDocuments = currentRole === 'owner';
  const canUploadCustomerDocuments = ['owner', 'admin'].includes(currentRole);

  const triggerCopyConfirmation = () => {
    setShowCopyConfirmation(true);
    if (copyConfirmationTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(copyConfirmationTimeoutRef.current);
    }
    if (typeof window !== 'undefined') {
      copyConfirmationTimeoutRef.current = window.setTimeout(() => {
        setShowCopyConfirmation(false);
      }, 1350);
    }
  };

  const handleCopyCustomerReference = async () => {
    try {
      await copyTextToClipboard(displayCustomerId);
      toast.success('Customer reference copied');
      triggerCopyConfirmation();
    } catch {
      toast.error('Could not copy customer reference');
    }
  };

  useEffect(() => () => {
    if (copyConfirmationTimeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(copyConfirmationTimeoutRef.current);
    }
  }, []);

  const deletedPrimaryIdUrls = useMemo(
    () => dedupeNormalizedUrls(customerData?.scan_metadata?.deleted_primary_id_urls),
    [customerData?.scan_metadata?.deleted_primary_id_urls]
  );
  const deletedSecondaryIdUrls = useMemo(
    () => dedupeNormalizedUrls(customerData?.scan_metadata?.deleted_secondary_id_urls),
    [customerData?.scan_metadata?.deleted_secondary_id_urls]
  );
  const deletedIdentityDocumentUrlSet = useMemo(
    () => new Set([...deletedPrimaryIdUrls, ...deletedSecondaryIdUrls]),
    [deletedPrimaryIdUrls, deletedSecondaryIdUrls]
  );
  const customerIdScans = useMemo(() => {
    const deletedPrimaryUrlSet = new Set(deletedPrimaryIdUrls);
    return mergeCustomerScanHistory(
      customerData?.id_scan_url,
      customerData?.customer_id_image,
      ...(Array.isArray(customerData?.scan_metadata?.uploaded_primary_id_urls)
        ? customerData.scan_metadata.uploaded_primary_id_urls
        : []),
      ...rentalHistory.map((rental) => rental?.customer_id_image)
    )
      .map((value) => normalizeDocumentUrl(value))
      .filter((value) => value && !deletedPrimaryUrlSet.has(value));
  }, [customerData?.customer_id_image, customerData?.id_scan_url, customerData?.scan_metadata?.uploaded_primary_id_urls, deletedPrimaryIdUrls, rentalHistory]);
  const customerSecondaryIdHistoryScans = useMemo(() => (
    (() => {
      const deletedSecondaryUrlSet = new Set(deletedSecondaryIdUrls);
      return mergeCustomerScanHistory(
        ...(Array.isArray(customerData?.scan_metadata?.second_driver_id_history)
          ? customerData.scan_metadata.second_driver_id_history
          : [])
      )
        .map((value) => normalizeDocumentUrl(value))
        .filter((value) => value && !deletedSecondaryUrlSet.has(value));
    })()
  ), [customerData?.scan_metadata?.second_driver_id_history, deletedSecondaryIdUrls]);
  const extraImages = useMemo(() => {
    const urls = new Set();

    [
      ...(Array.isArray(customerData?.extra_images) ? customerData.extra_images : []),
      ...rentalHistory.flatMap((rental) => (Array.isArray(rental?.extra_images) ? rental.extra_images : [])),
    ].forEach((value) => {
      const normalized = normalizeDocumentUrl(value);
      if (normalized && !deletedIdentityDocumentUrlSet.has(normalized)) urls.add(normalized);
    });

    return Array.from(urls);
  }, [customerData?.extra_images, deletedIdentityDocumentUrlSet, rentalHistory]);
  const secondDriverDocuments = useMemo(() => {
    const documents = [];
    const urls = new Set();
    const deletedSecondaryUrlSet = new Set(deletedSecondaryIdUrls);
    const pushDocument = (value, driver, index) => {
      const normalized = normalizeDocumentUrl(value);
      if (!normalized || urls.has(normalized) || deletedSecondaryUrlSet.has(normalized)) return;

      urls.add(normalized);
      documents.push({
        url: normalized,
        driverName: driver?.full_name || driver?.name || `Driver ${index + 1}`,
        createdAt: driver?.created_at || latestRental?.created_at || null,
      });
    };

    secondDrivers.forEach((driver, index) => {
      pushDocument(driver?.id_scan_url, driver, index);
      pushDocument(driver?.customer_id_image, driver, index);
      pushDocument(driver?.id_image, driver, index);
      if (Array.isArray(driver?.uploaded_images)) {
        driver.uploaded_images.forEach((image) => pushDocument(image, driver, index));
      }
      if (Array.isArray(driver?.extra_images)) {
        driver.extra_images.forEach((image) => pushDocument(image, driver, index));
      }
    });

    return documents;
  }, [deletedSecondaryIdUrls, latestRental?.created_at, secondDrivers]);
  const profileMediaDocuments = useMemo(() => {
    const customerIdScanUrlSet = new Set(customerIdScans.map((url) => normalizeDocumentUrl(url)).filter(Boolean));
    const secondDriverDocumentUrlSet = new Set(secondDriverDocuments.map((document) => normalizeDocumentUrl(document?.url)).filter(Boolean));
    const secondaryHistoryUrlSet = new Set(customerSecondaryIdHistoryScans.map((url) => normalizeDocumentUrl(url)).filter(Boolean));

    const primaryDocs = customerIdScans.map((url, index) => ({
      id: `profile-media-${index}`,
      verification_type: 'profile_id',
      created_at: customerData?.created_at || latestRental?.created_at || null,
      file_url: url,
      status: effectiveVerificationSummary?.status || effectiveVerificationSummary?.verificationStatus || 'uploaded',
      owner_email: customerData?.email || displayEmail,
      submission_source_label: 'Customer profile media',
      isProfileMediaFallback: true,
    }));

    const secondaryIdDocs = [
      ...secondDriverDocuments.map((document, index) => ({
        id: `second-id-media-${index}`,
        verification_type: 'profile_id',
        created_at: document.createdAt || customerData?.created_at || latestRental?.created_at || null,
        file_url: document.url,
        status: effectiveVerificationSummary?.status || effectiveVerificationSummary?.verificationStatus || 'uploaded',
        owner_email: customerData?.email || displayEmail,
        submission_source_label: document.driverName ? `Second ID · ${document.driverName}` : 'Second ID',
        secondaryDriverName: document.driverName || '',
        isSecondaryIdDocument: true,
        isProfileMediaFallback: true,
      })),
      ...customerSecondaryIdHistoryScans
        .filter((url) => !secondDriverDocumentUrlSet.has(normalizeDocumentUrl(url)))
        .map((url, index) => ({
          id: `second-id-history-${index}`,
          verification_type: 'profile_id',
          created_at: customerData?.created_at || latestRental?.created_at || null,
          file_url: url,
          status: effectiveVerificationSummary?.status || effectiveVerificationSummary?.verificationStatus || 'uploaded',
          owner_email: customerData?.email || displayEmail,
          submission_source_label: 'Second ID',
          secondaryDriverName: '',
          isSecondaryIdDocument: true,
          isProfileMediaFallback: true,
        })),
    ];

    const supportingDocs = extraImages
      .filter((url) => {
        const normalized = normalizeDocumentUrl(url);
        if (!normalized) return false;
        if (customerIdScanUrlSet.has(normalized)) return false;
        if (secondDriverDocumentUrlSet.has(normalized)) return false;
        if (secondaryHistoryUrlSet.has(normalized)) return false;
        return true;
      })
      .map((url, index) => ({
        id: `extra-media-${index}`,
        verification_type: customerData?.licence_number ? 'driver_license' : 'supporting_document',
        created_at: customerData?.created_at || latestRental?.created_at || null,
        file_url: url,
        status: effectiveVerificationSummary?.status || effectiveVerificationSummary?.verificationStatus || 'uploaded',
        owner_email: customerData?.email || displayEmail,
        submission_source_label: 'Supporting upload',
        isProfileMediaFallback: true,
      }));

    return [...primaryDocs, ...secondaryIdDocs, ...supportingDocs];
  }, [customerData?.created_at, customerData?.email, customerData?.licence_number, customerIdScans, customerSecondaryIdHistoryScans, displayEmail, effectiveVerificationSummary?.status, effectiveVerificationSummary?.verificationStatus, extraImages, latestRental?.created_at, secondDriverDocuments]);
  const verificationDocuments = useMemo(
    () => mergeVerificationDocuments(verificationRequests),
    [verificationRequests]
  );
  const verificationHistoryDocuments = useMemo(
    () => mergeVerificationDocuments(verificationHistoryRequests),
    [verificationHistoryRequests]
  );
  const fallbackVerificationDocuments = useMemo(
    () => mergeVerificationDocuments(seededVerificationDocuments, profileMediaDocuments),
    [profileMediaDocuments, seededVerificationDocuments]
  );
  const visibleVerificationDocuments = useMemo(
    () => mergeVerificationDocuments(verificationDocuments, fallbackVerificationDocuments),
    [fallbackVerificationDocuments, verificationDocuments]
  );
  const visibleVerificationDocumentsWithLabels = useMemo(() => {
    let profileIdIndex = 0;
    const secondaryDocumentUrlSet = new Set([
      ...secondDriverDocuments.map((document) => normalizeDocumentUrl(document?.url)),
      ...customerSecondaryIdHistoryScans.map((url) => normalizeDocumentUrl(url)),
    ].filter(Boolean));

    return visibleVerificationDocuments
      .filter((document) => {
        const normalizedFileUrl = normalizeDocumentUrl(document?.file_url);
        if (!normalizedFileUrl) return true;
        return !deletedIdentityDocumentUrlSet.has(normalizedFileUrl);
      })
      .map((document) => {
        const type = String(document?.verification_type || '').toLowerCase();
        const normalizedFileUrl = normalizeDocumentUrl(document?.file_url);
        const isKnownSecondaryUrl = secondaryDocumentUrlSet.has(normalizedFileUrl);
        if (document?.isSecondaryIdDocument) {
          return {
            ...document,
            display_label: document.secondaryDriverName ? `Secondary ID · ${document.secondaryDriverName}` : 'Secondary ID',
          };
        }

        if (isKnownSecondaryUrl) {
          return {
            ...document,
            isSecondaryIdDocument: true,
            display_label: document.secondaryDriverName ? `Secondary ID · ${document.secondaryDriverName}` : 'Secondary ID',
          };
        }

        if (type === 'profile_id') {
          profileIdIndex += 1;
          return {
            ...document,
            isSecondaryIdDocument: profileIdIndex > 1 || Boolean(document?.isSecondaryIdDocument),
            display_label: profileIdIndex === 1 ? 'Primary ID' : 'Secondary ID',
          };
        }

        if (type === 'driver_license') {
          return {
            ...document,
            display_label: 'Driver license',
          };
        }

        return {
          ...document,
          display_label: String(document?.verification_type || 'Verification document')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()),
        };
      });
  }, [customerSecondaryIdHistoryScans, deletedIdentityDocumentUrlSet, secondDriverDocuments, visibleVerificationDocuments]);
  const visibleVerificationHistoryDocuments = useMemo(
    () => verificationHistoryDocuments.filter((document) => {
      const normalizedFileUrl = normalizeDocumentUrl(document?.file_url);
      if (!normalizedFileUrl) return true;
      return !deletedIdentityDocumentUrlSet.has(normalizedFileUrl);
    }),
    [deletedIdentityDocumentUrlSet, verificationHistoryDocuments]
  );
  const secondaryIdVerificationDocuments = useMemo(
    () => visibleVerificationDocumentsWithLabels.filter((document) => (
      Boolean(document?.isSecondaryIdDocument) ||
      String(document?.id || '').startsWith('second-id-media') ||
      String(document?.submission_source_label || '').trim().toLowerCase().startsWith('second id') ||
      String(document?.display_label || '').trim().toLowerCase().startsWith('secondary id')
    )),
    [visibleVerificationDocumentsWithLabels]
  );
  const primarySecondaryIdVerificationDocument = secondaryIdVerificationDocuments[0] || null;
  const collapsedSecondaryIdVerificationDocuments = useMemo(
    () => secondaryIdVerificationDocuments.slice(1),
    [secondaryIdVerificationDocuments]
  );
  const visibleVerificationDocumentsForCards = useMemo(() => {
    if (secondaryIdVerificationDocuments.length <= 1) {
      return visibleVerificationDocumentsWithLabels;
    }

    const secondaryIdsToCollapse = new Set(
      collapsedSecondaryIdVerificationDocuments.map((document) => String(document?.id || document?.file_url || ''))
    );
    return visibleVerificationDocumentsWithLabels.filter((document) => (
      !secondaryIdsToCollapse.has(String(document?.id || document?.file_url || ''))
    ));
  }, [collapsedSecondaryIdVerificationDocuments, secondaryIdVerificationDocuments.length, visibleVerificationDocumentsWithLabels]);
  const verificationComparisonProfile = useMemo(() => ({
    full_name:
      customerData?.full_name ||
      customerProfile?.full_name ||
      appUserProfile?.full_name ||
      appUserProfile?.name ||
      '',
    email: customerData?.email || customerProfile?.email || appUserProfile?.email || '',
    date_of_birth:
      customerData?.date_of_birth ||
      customerProfile?.date_of_birth ||
      appUserProfile?.date_of_birth ||
      '',
    id_number:
      customerData?.id_number ||
      customerProfile?.id_number ||
      appUserProfile?.id_number ||
      '',
    licence_number:
      customerData?.licence_number ||
      customerProfile?.licence_number ||
      appUserProfile?.licence_number ||
      '',
    license_number:
      customerData?.license_number ||
      customerProfile?.license_number ||
      appUserProfile?.license_number ||
      '',
    display_name: customerData?.full_name || customerProfile?.full_name || appUserProfile?.full_name || '',
  }), [appUserProfile, customerData, customerProfile]);
  const profileIdDocument = visibleVerificationDocumentsWithLabels.find((document) => String(document?.verification_type || '').toLowerCase() === 'profile_id') || null;
  const driverLicenseDocument = visibleVerificationDocumentsWithLabels.find((document) => String(document?.verification_type || '').toLowerCase() === 'driver_license') || null;
  const extraVerificationDocuments = visibleVerificationDocumentsWithLabels.filter((document) => !['profile_id', 'driver_license'].includes(String(document?.verification_type || '').toLowerCase()));
  const primaryVerificationDocument = profileIdDocument || driverLicenseDocument || extraVerificationDocuments[0] || null;
  const verificationReviewHref = resolvedAuthUserId
    ? `/admin/verification?entityType=user&entityId=${encodeURIComponent(resolvedAuthUserId)}&status=all`
    : '';
  const latestRentalHref = latestRental?.id ? `/admin/rentals/${encodeURIComponent(String(latestRental.id))}` : '';
  const visiblePendingVerificationCount = visibleVerificationDocumentsWithLabels.filter((document) => ['pending', 'uploaded'].includes(String(document?.status || 'pending').toLowerCase())).length;
  const visibleApprovedVerificationCount = visibleVerificationDocumentsWithLabels.filter((document) => String(document?.status || '').toLowerCase() === 'approved').length;
  const pendingVerificationCount = Number(
    Number(effectiveVerificationSummary?.pendingCount || 0) > 0 || visibleVerificationDocuments.length === 0
      ? Number(effectiveVerificationSummary?.pendingCount || 0)
      : visiblePendingVerificationCount
  );
  const approvedVerificationCount = Number(
    Number(effectiveVerificationSummary?.approvedCount || 0) > 0 || visibleVerificationDocuments.length === 0
      ? Number(effectiveVerificationSummary?.approvedCount || 0)
      : visibleApprovedVerificationCount
  );
  const latestRentalAmount = Number(
    latestRental?.display_amount ||
    latestRental?.total_amount ||
    latestRental?.final_amount ||
    latestRental?.amount_paid ||
    0
  );
  const latestRentalRemainingAmount = Number(
    latestRental?.remaining_amount ||
    latestRental?.balance_due ||
    latestRental?.amount_due ||
    0
  );
  const customerRentalsSearchValue = String(
    customerData?.email ||
    customerProfile?.email ||
    latestRental?.customer_email ||
    customerData?.id ||
    customerId ||
    customerIdQueryParam ||
    displayName ||
    ''
  ).trim();
  const customerRentalsHref = customerRentalsSearchValue
    ? `/admin/rentals?search=${encodeURIComponent(customerRentalsSearchValue)}`
    : '/admin/rentals';
  const unifiedRentalHistory = useMemo(() => {
    const rentals = [...(Array.isArray(rentalHistory) ? rentalHistory : [])];
    if (latestRental?.id && !rentals.some((entry) => String(entry?.id || '') === String(latestRental.id))) {
      rentals.unshift(latestRental);
    }

    const deduped = new Map();
    rentals.forEach((entry) => {
      const key = String(
        entry?.id ||
        entry?.rental_id ||
        `${entry?.customer_id || 'customer'}-${entry?.created_at || ''}`
      ).trim();
      if (!key) return;
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    });

    return Array.from(deduped.values()).sort(
      (left, right) => new Date(getRentalHistoryTimestamp(right)).getTime() - new Date(getRentalHistoryTimestamp(left)).getTime()
    );
  }, [latestRental, rentalHistory]);
  const rentalActivityTotals = useMemo(() => {
    const counts = {
      total: unifiedRentalHistory.length,
      active: 0,
      completed: 0,
      cancelled: 0,
      scheduled: 0,
    };

    unifiedRentalHistory.forEach((entry) => {
      const normalizedStatus = getRentalHistoryStatus(entry);
      if (normalizedStatus === 'active') counts.active += 1;
      else if (normalizedStatus === 'completed') counts.completed += 1;
      else if (normalizedStatus === 'cancelled') counts.cancelled += 1;
      else if (normalizedStatus === 'scheduled') counts.scheduled += 1;
    });

    return counts;
  }, [unifiedRentalHistory]);
  const systemSourceLabel = customerData?._source === 'rental'
    ? 'Rental record'
    : customerData?._source === 'fallback_rental'
      ? 'Historical rental'
      : 'Customer profile';
  const customerAttentionItems = [
    verificationLabel !== 'Verified'
      ? {
          label: verificationLabel,
          tone: getVerificationTone(verificationLabel),
        }
      : null,
    latestRentalRemainingAmount > 0
      ? {
          label: `Balance due ${latestRentalRemainingAmount} MAD`,
          tone: 'bg-rose-50 text-rose-700 ring-rose-200',
        }
      : null,
    customerData?.has_active_alert_note
      ? {
          label: 'Staff note alert',
          tone: 'bg-rose-50 text-rose-700 ring-rose-200',
        }
      : null,
    customerData?.is_banned
      ? {
          label: 'Banned customer',
          tone: 'bg-rose-50 text-rose-700 ring-rose-200',
        }
      : null,
  ].filter(Boolean);
  const workspaceTabs = [
    { key: 'messages', label: 'Messages', count: relatedThreads.length },
    { key: 'verification', label: 'Verification', count: visibleVerificationDocumentsWithLabels.length + visibleVerificationHistoryDocuments.length },
    { key: 'listings', label: 'Listings', count: marketplaceListingCount },
  ];
  const rentalHistoryPreview = unifiedRentalHistory.slice(0, 5);
  const listingsPreview = marketplaceListings.slice(0, 3);
  const verificationHistoryPreview = [...visibleVerificationDocumentsWithLabels, ...visibleVerificationHistoryDocuments].slice(0, 4);
  const nextActionCards = [
    rentalActivityTotals.total > 0
      ? {
          label: 'Rental history',
          value: `${rentalActivityTotals.total} rental${rentalActivityTotals.total === 1 ? '' : 's'}`,
          href: customerRentalsHref,
          icon: CalendarDays,
        }
      : null,
    verificationReviewHref
      ? {
          label: 'Verification queue',
          value: `${pendingVerificationCount} pending`,
          href: verificationReviewHref,
          icon: ShieldCheck,
        }
      : null,
    primaryCustomerThreadHref
      ? {
          label: 'Customer thread',
          value: relatedThreads.length > 0 ? `${relatedThreads.length} active` : 'Start message',
          href: primaryCustomerThreadHref,
          icon: MessageSquare,
        }
      : null,
  ].filter(Boolean);
  const tabButtonClass = (tab) => (
    `rounded-2xl px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? 'bg-slate-950 text-white shadow-sm'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`
  );

  const getVerificationDocumentLabel = (document) => {
    if (String(document?.display_label || '').trim()) {
      return document.display_label;
    }
    const type = String(document?.verification_type || '').toLowerCase();
    if (type === 'profile_id') return 'Profile ID';
    if (type === 'driver_license') return 'Driver license';
    return String(document?.verification_type || 'Verification document')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getDocumentIdentityKey = (document) => (
    normalizeDocumentUrl(document?.file_url) || String(document?.id || '')
  );

  const getCustomerIdentityDocumentType = (document) => {
    const label = String(document?.display_label || '').trim().toLowerCase();
    if (label === 'primary id') return 'primary';
    if (label.startsWith('secondary id') || document?.isSecondaryIdDocument) return 'secondary';
    return null;
  };

  async function handleDeleteCustomerDocument(document) {
    const identityType = getCustomerIdentityDocumentType(document);
    const documentUrl = normalizeDocumentUrl(document?.file_url);
    const documentKey = getDocumentIdentityKey(document);

    if (!identityType || !documentUrl) return;
    if (!canDeleteCustomerDocuments) {
      toast.error('Only the owner can delete ID documents.');
      return;
    }
    if (!customerProfile?.id) {
      toast.error('Customer profile record is required before deleting documents.');
      return;
    }

    const confirmed = window.confirm(
      `Delete this ${identityType === 'primary' ? 'primary' : 'secondary'} ID document?`
    );
    if (!confirmed) return;

    try {
      setDeletingDocumentKey(documentKey);
      const existingScanMetadata = customerProfile?.scan_metadata || {};
      const updatedAt = new Date().toISOString();
      const nextDeletedPrimaryUrls = identityType === 'primary'
        ? dedupeNormalizedUrls([...(existingScanMetadata?.deleted_primary_id_urls || []), documentUrl])
        : dedupeNormalizedUrls(existingScanMetadata?.deleted_primary_id_urls);
      const nextDeletedSecondaryUrls = identityType === 'secondary'
        ? dedupeNormalizedUrls([...(existingScanMetadata?.deleted_secondary_id_urls || []), documentUrl])
        : dedupeNormalizedUrls(existingScanMetadata?.deleted_secondary_id_urls);
      const nextSecondDriverIdHistory = identityType === 'secondary'
        ? withoutNormalizedUrl(existingScanMetadata?.second_driver_id_history, documentUrl)
        : dedupeNormalizedUrls(existingScanMetadata?.second_driver_id_history);
      const nextUploadedPrimaryIdUrls = identityType === 'primary'
        ? withoutNormalizedUrl(existingScanMetadata?.uploaded_primary_id_urls, documentUrl)
        : dedupeNormalizedUrls(existingScanMetadata?.uploaded_primary_id_urls);
      const nextScanMetadata = {
        ...existingScanMetadata,
        deleted_primary_id_urls: nextDeletedPrimaryUrls,
        deleted_secondary_id_urls: nextDeletedSecondaryUrls,
        second_driver_id_history: nextSecondDriverIdHistory,
        uploaded_primary_id_urls: nextUploadedPrimaryIdUrls,
      };
      const nextIdScanUrl = identityType === 'primary' && normalizeDocumentUrl(customerProfile?.id_scan_url) === documentUrl
        ? null
        : customerProfile?.id_scan_url || null;
      const nextCustomerIdImage = identityType === 'primary' && normalizeDocumentUrl(customerProfile?.customer_id_image) === documentUrl
        ? null
        : customerProfile?.customer_id_image || null;
      const nextExtraImages = withoutNormalizedUrl(customerProfile?.extra_images, documentUrl);

      const { error } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          id_scan_url: nextIdScanUrl,
          customer_id_image: nextCustomerIdImage,
          extra_images: nextExtraImages,
          updated_at: updatedAt,
        })
        .eq('id', customerProfile.id);

      if (error) throw error;

      let nextSecondDriversState = secondDrivers;
      if (identityType === 'secondary' && secondDrivers.length > 0) {
        const mutatedDrivers = secondDrivers.map((driver) => {
          const nextUploadedImages = withoutNormalizedUrl(driver?.uploaded_images, documentUrl);
          const nextDriverExtraImages = withoutNormalizedUrl(driver?.extra_images, documentUrl);
          const nextDriverPatch = {
            id_scan_url: normalizeDocumentUrl(driver?.id_scan_url) === documentUrl ? null : driver?.id_scan_url || null,
            customer_id_image: normalizeDocumentUrl(driver?.customer_id_image) === documentUrl ? null : driver?.customer_id_image || null,
            id_image: normalizeDocumentUrl(driver?.id_image) === documentUrl ? null : driver?.id_image || null,
            uploaded_images: nextUploadedImages,
            extra_images: nextDriverExtraImages,
          };
          const changed = (
            nextDriverPatch.id_scan_url !== (driver?.id_scan_url || null) ||
            nextDriverPatch.customer_id_image !== (driver?.customer_id_image || null) ||
            nextDriverPatch.id_image !== (driver?.id_image || null) ||
            JSON.stringify(nextDriverPatch.uploaded_images) !== JSON.stringify(Array.isArray(driver?.uploaded_images) ? driver.uploaded_images : []) ||
            JSON.stringify(nextDriverPatch.extra_images) !== JSON.stringify(Array.isArray(driver?.extra_images) ? driver.extra_images : [])
          );

          return changed
            ? { ...driver, ...nextDriverPatch, _changed: true }
            : { ...driver, _changed: false };
        });

        const changedDrivers = mutatedDrivers.filter((driver) => driver._changed && driver?.id);
        if (changedDrivers.length > 0) {
          await Promise.all(changedDrivers.map(async (driver) => {
            const { _changed, ...payload } = driver;
            const { error: updateError } = await supabase
              .from(SECOND_DRIVER_TABLE)
              .update({
                id_scan_url: payload.id_scan_url,
                customer_id_image: payload.customer_id_image,
                id_image: payload.id_image,
                uploaded_images: payload.uploaded_images,
                extra_images: payload.extra_images,
                updated_at: updatedAt,
              })
              .eq('id', driver.id);

            if (updateError) throw updateError;
          }));
        }

        nextSecondDriversState = mutatedDrivers.map(({ _changed, ...driver }) => driver);
        setSecondDrivers(nextSecondDriversState);
      }

      applyUpdatedCustomerScanMetadata(nextScanMetadata, updatedAt, {
        id_scan_url: nextIdScanUrl,
        customer_id_image: nextCustomerIdImage,
        extra_images: nextExtraImages,
      });
      if (previewDocument && getDocumentIdentityKey(previewDocument) === documentKey) {
        setPreviewDocument(null);
      }
      toast.success(`${identityType === 'primary' ? 'Primary' : 'Secondary'} ID deleted.`);
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Unable to delete this ID document right now.');
    } finally {
      setDeletingDocumentKey('');
    }
  }

  const handleCustomerDocumentUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file || !customerProfile?.id) return;
    if (!canUploadCustomerDocuments) {
      toast.error('Only admins or owners can upload ID documents.');
      if (event?.target) event.target.value = '';
      return;
    }

    try {
      setUploadingCustomerDocument(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `customer_ids/${customerProfile.id}/${Date.now()}_${safeName}`;
      const { data, error } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(data.path);

      const publicUrl = String(publicData?.publicUrl || '').trim();
      if (!publicUrl) {
        throw new Error('Could not resolve uploaded document URL.');
      }

      const existingScanMetadata = customerProfile?.scan_metadata || {};
      const updatedAt = new Date().toISOString();
      const nextUploadedPrimaryIdUrls = dedupeNormalizedUrls([
        ...(existingScanMetadata?.uploaded_primary_id_urls || []),
        publicUrl,
      ]);
      const nextDeletedPrimaryUrls = withoutNormalizedUrl(existingScanMetadata?.deleted_primary_id_urls, publicUrl);
      const nextScanMetadata = {
        ...existingScanMetadata,
        uploaded_primary_id_urls: nextUploadedPrimaryIdUrls,
        deleted_primary_id_urls: nextDeletedPrimaryUrls,
      };
      const nextIdScanUrl = customerProfile?.id_scan_url || customerData?.id_scan_url || publicUrl;

      const { error: updateError } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          id_scan_url: nextIdScanUrl,
          updated_at: updatedAt,
        })
        .eq('id', customerProfile.id);

      if (updateError) throw updateError;

      applyUpdatedCustomerScanMetadata(nextScanMetadata, updatedAt, {
        id_scan_url: nextIdScanUrl,
      });
      toast.success('ID document uploaded successfully.');
    } catch (uploadError) {
      console.error('Failed to upload customer ID document:', uploadError);
      toast.error(uploadError?.message || 'Unable to upload this ID document right now.');
    } finally {
      setUploadingCustomerDocument(false);
      if (event?.target) event.target.value = '';
    }
  };

  const renderCompactDocumentTile = (document) => {
    const identityType = getCustomerIdentityDocumentType(document);
    const documentKey = getDocumentIdentityKey(document);
    const canDeleteDocument = canDeleteCustomerDocuments && Boolean(identityType && document?.file_url);

    return (
      <div key={document.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80">
      <button
        type="button"
        onClick={() => {
          if (document?.file_url) setPreviewDocument(document);
        }}
        className="block h-44 w-full overflow-hidden bg-white sm:h-52"
      >
        {String(document?.file_url || '').trim() ? (
          <img
            src={document.file_url}
            alt={getVerificationDocumentLabel(document)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <FileBadge2 className="h-10 w-10" />
          </div>
        )}
      </button>
      <div className="border-t border-slate-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {getVerificationDocumentLabel(document)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {`Submitted ${formatDate(document.created_at)}`}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getVerificationDocumentStatusMeta(document?.status).className}`}>
            {getVerificationDocumentStatusMeta(document?.status).label}
          </span>
        </div>
        {document?.file_url ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPreviewDocument(document)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-800"
            >
              <Eye className="h-4 w-4" />
              Open preview
            </button>
            {canDeleteDocument ? (
              <button
                type="button"
                onClick={() => void handleDeleteCustomerDocument(document)}
                disabled={deletingDocumentKey === documentKey}
                className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deletingDocumentKey === documentKey ? 'Deleting…' : 'Delete ID'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    );
  };

  const renderSecondaryIdDocumentsGroup = ({ detailed = false } = {}) => {
    if (collapsedSecondaryIdVerificationDocuments.length === 0) return null;

    return (
      <details className={ADMIN_SOFT_CARD_CLASS}>
        <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Secondary ID documents</p>
            <p className="mt-1 text-sm text-slate-500">
              {collapsedSecondaryIdVerificationDocuments.length} additional second-driver ID {collapsedSecondaryIdVerificationDocuments.length === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-2xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            Tap to expand
          </span>
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {collapsedSecondaryIdVerificationDocuments.map((document) => (
            detailed ? (
              <VerificationDocumentCard
                key={document.id}
                title={getVerificationDocumentLabel(document)}
                document={{ ...document, owner_email: customerData?.email || displayEmail }}
                reviewHref={verificationReviewHref}
                comparisonProfile={verificationComparisonProfile}
                canDelete={canDeleteCustomerDocuments && Boolean(getCustomerIdentityDocumentType(document))}
                isDeleting={deletingDocumentKey === getDocumentIdentityKey(document)}
                onDelete={() => void handleDeleteCustomerDocument(document)}
              />
            ) : renderCompactDocumentTile(document)
          ))}
        </div>
      </details>
    );
  };

  useEffect(() => {
    setCustomerProfileNote(customerData?.active_alert_note || customerData?.scan_metadata?.admin_note || '');
    setCustomerBanNote(customerData?.ban_note || customerData?.scan_metadata?.ban_note || '');
    setCustomerAlertEnabled(Boolean(
      customerData?.has_active_alert_note ||
      customerData?.scan_metadata?.show_admin_note_alert
    ));
    setCustomerNoteHistory(
      Array.isArray(customerData?.scan_metadata?.staff_notes_history)
        ? customerData.scan_metadata.staff_notes_history
        : []
    );
  }, [
    customerData?.active_alert_note,
    customerData?.ban_note,
    customerData?.has_active_alert_note,
    customerData?.scan_metadata,
  ]);

  const applyUpdatedCustomerScanMetadata = (
    nextScanMetadata,
    updatedAt = new Date().toISOString(),
    extraCustomerPatch = {}
  ) => {
    setCustomerData((prev) => (prev ? {
      ...prev,
      ...extraCustomerPatch,
      scan_metadata: nextScanMetadata,
      has_active_alert_note: Boolean(nextScanMetadata?.show_admin_note_alert && nextScanMetadata?.admin_note),
      active_alert_note: nextScanMetadata?.admin_note || '',
      is_banned: Boolean(nextScanMetadata?.is_banned),
      ban_note: nextScanMetadata?.ban_note || '',
      updated_at: updatedAt,
    } : prev));
    setCustomerProfile((prev) => (prev ? {
      ...prev,
      ...extraCustomerPatch,
      scan_metadata: nextScanMetadata,
      updated_at: updatedAt,
    } : prev));
  };

  const handleSaveCustomerNote = async () => {
    if (!customerProfile?.id) return;
    if (!canManageCustomerAlerts) {
      toast.error('Only admins or owners can manage customer alerts.');
      return;
    }

    try {
      setSavingCustomerNote(true);
      const trimmedNote = String(customerProfileNote || '').trim();
      const existingHistory = Array.isArray(customerProfile?.scan_metadata?.staff_notes_history)
        ? customerProfile.scan_metadata.staff_notes_history
        : [];
      const latestNote = existingHistory[0];
      const shouldAppendHistory = trimmedNote && (
        !latestNote ||
        latestNote.note_text !== trimmedNote ||
        Boolean(latestNote.is_alert) !== Boolean(customerAlertEnabled)
      );
      const nextHistory = shouldAppendHistory
        ? [
            {
              id: `staff_note_${Date.now()}`,
              note_text: trimmedNote,
              is_alert: Boolean(customerAlertEnabled),
              created_at: new Date().toISOString(),
              created_by: user?.id || null,
              created_by_name: adminDisplayName,
            },
            ...existingHistory,
          ]
        : existingHistory;
      const nextScanMetadata = {
        ...(customerProfile?.scan_metadata || {}),
        admin_note: trimmedNote,
        show_admin_note_alert: Boolean(customerAlertEnabled && trimmedNote),
        staff_notes_history: nextHistory,
      };

      const { error } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerProfile.id);

      if (error) throw error;

      setCustomerNoteHistory(nextHistory);
      applyUpdatedCustomerScanMetadata(nextScanMetadata);
      toast.success('Customer note saved.');
    } catch (saveError) {
      toast.error(saveError?.message || 'Unable to save the customer note right now.');
    } finally {
      setSavingCustomerNote(false);
    }
  };

  const handleDeleteCustomerNote = async (noteId) => {
    if (!customerProfile?.id || !noteId) return;
    if (!canManageCustomerAlerts) {
      toast.error('Only admins or owners can manage customer alerts.');
      return;
    }

    try {
      setSavingCustomerNote(true);
      const existingHistory = Array.isArray(customerProfile?.scan_metadata?.staff_notes_history)
        ? customerProfile.scan_metadata.staff_notes_history
        : [];
      const nextHistory = existingHistory.filter((note) => note?.id !== noteId);
      const nextLatestNote = nextHistory[0] || null;
      const nextAdminNote = nextLatestNote?.note_text || '';
      const nextAlertEnabled = Boolean(nextLatestNote?.is_alert && nextAdminNote);
      const nextScanMetadata = {
        ...(customerProfile?.scan_metadata || {}),
        admin_note: nextAdminNote,
        show_admin_note_alert: nextAlertEnabled,
        staff_notes_history: nextHistory,
      };

      const { error } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerProfile.id);

      if (error) throw error;

      setCustomerProfileNote(nextAdminNote);
      setCustomerAlertEnabled(nextAlertEnabled);
      setCustomerNoteHistory(nextHistory);
      applyUpdatedCustomerScanMetadata(nextScanMetadata);
      toast.success('Customer note removed.');
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Unable to remove the customer note right now.');
    } finally {
      setSavingCustomerNote(false);
    }
  };

  const handleToggleCustomerBan = async (nextBanned) => {
    if (!customerProfile?.id) return;
    if (!canManageCustomerAlerts) {
      toast.error('Only admins or owners can manage ban status.');
      return;
    }

    try {
      setSavingCustomerBan(true);
      const nextBanNote = String(customerBanNote || '').trim();
      const nextScanMetadata = {
        ...(customerProfile?.scan_metadata || {}),
        is_banned: Boolean(nextBanned),
        ban_note: nextBanNote,
      };

      const { error } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerProfile.id);

      if (error) throw error;

      applyUpdatedCustomerScanMetadata(nextScanMetadata);
      toast.success(nextBanned ? 'Customer marked as banned.' : 'Customer ban removed.');
    } catch (banError) {
      toast.error(banError?.message || 'Unable to update customer ban status right now.');
    } finally {
      setSavingCustomerBan(false);
    }
  };

  const handleSaveCustomerBanNote = async () => {
    if (!customerProfile?.id) return;
    if (!canManageCustomerAlerts) {
      toast.error('Only admins or owners can manage ban notes.');
      return;
    }

    try {
      setSavingCustomerBan(true);
      const nextBanNote = String(customerBanNote || '').trim();
      const nextScanMetadata = {
        ...(customerProfile?.scan_metadata || {}),
        is_banned: Boolean(customerProfile?.scan_metadata?.is_banned),
        ban_note: nextBanNote,
      };

      const { error } = await supabase
        .from(CUSTOMER_TABLE)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerProfile.id);

      if (error) throw error;

      applyUpdatedCustomerScanMetadata(nextScanMetadata);
      toast.success('Ban note saved.');
    } catch (banError) {
      toast.error(banError?.message || 'Unable to save the ban note right now.');
    } finally {
      setSavingCustomerBan(false);
    }
  };

  const refreshRelatedThreads = async () => {
    try {
      const response = await MessageService.listSharedThreads();
      setRelatedThreads(filterCustomerThreads({
        threads: response?.threads,
        authUserId: resolvedAuthUserId,
        email: displayEmail,
      }));
    } catch {
      // keep existing visible state if refresh fails
    }
  };

  const handleSendCustomerMessage = async () => {
    const body = messageBody.trim();
    if (!resolvedAuthUserId) {
      toast.error('This customer is not linked to a signed-in account yet.');
      return;
    }
    if (!body) {
      toast.error('Write a short message first.');
      return;
    }

    try {
      setSendingMessage(true);
      let resolvedThreadKey = String(primaryCustomerThread?.thread_key || '').trim();

      if (!resolvedThreadKey) {
        try {
          const ensuredThreadResponse = await MessageService.ensureThreadByContext({
            contextType: 'user',
            contextId: resolvedAuthUserId,
            family: MESSAGE_FAMILIES.accountTrust,
            threadType: MESSAGE_THREAD_TYPES.accountStatus,
            senderRole: 'admin',
            waitingOn: 'customer',
            priority: 'normal',
          });

          resolvedThreadKey = String(ensuredThreadResponse?.threadState?.thread_key || '').trim();
        } catch {
          resolvedThreadKey = '';
        }
      }

      await MessageService.sendSharedMessage({
        family: MESSAGE_FAMILIES.accountTrust,
        threadType: MESSAGE_THREAD_TYPES.accountStatus,
        ...(resolvedThreadKey ? { threadKey: resolvedThreadKey } : {}),
        entityType: 'user',
        entityId: resolvedAuthUserId,
        recipientUserId: resolvedAuthUserId,
        recipientRole: 'customer',
        senderRole: 'admin',
        messageType: 'admin_customer_note',
        subject: `Message for ${displayName}`,
        body,
        metadata: {
          href: '/account/messages',
          adminHref: `/admin/customers/profile?${new URLSearchParams({
            customerId: customerData?.id || customerId || customerIdQueryParam || '',
            authUserId: resolvedAuthUserId,
            email: displayEmail,
          }).toString()}`,
          customerEmail: displayEmail,
          customerName: displayName,
          entityEmail: displayEmail,
          entityName: displayName,
          senderName: adminDisplayName,
          source: 'admin_customer_profile',
        },
      });
      toast.success('Message sent.');
      setMessageBody('');
      setMessageDialogOpen(false);
      await refreshRelatedThreads();
    } catch (error) {
      toast.error(error?.message || 'Unable to send the message right now.');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.6rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">Customer profile</p>
            <p className="mt-2 text-lg font-semibold text-rose-950">Customer profile unavailable</p>
            <p className="mt-2">{error}</p>
          </div>
          <Button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full border border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <AdminModuleHero
        icon={<User className="h-7 w-7" />}
        eyebrow="Customer profile"
        title={displayName}
        description={(
          <>
            <button
              type="button"
              onClick={handleCopyCustomerReference}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 active:scale-[0.99]"
              title="Tap to copy customer reference"
            >
              {displayCustomerId}
            </button>
            <span className="mx-2 text-slate-300">·</span>
            <span>{displayEmail || 'No email'}</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>{systemSourceLabel}</span>
          </>
        )}
        titleClassName="break-words"
        actions={(
          <>
            <Button
              type="button"
              onClick={() => navigate(-1)}
              variant="outline"
              className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <span className={`inline-flex items-center rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ${getVerificationTone(verificationLabel)}`}>
              {verificationLabel}
            </span>
            <Button
              type="button"
              onClick={() => setMessageDialogOpen(true)}
              disabled={!canMessageCustomer}
              className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send className="mr-2 h-4 w-4" />
              Message customer
            </Button>
            {verificationReviewHref ? (
              <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                <Link to={verificationReviewHref}>Open verification</Link>
              </Button>
            ) : null}
            {latestRentalHref ? (
              <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                <Link to={latestRentalHref}>Open rental</Link>
              </Button>
            ) : null}
          </>
        )}
      />

      <div className="mt-6 grid gap-6 px-4 sm:px-6 lg:px-8">
        {nextActionCards.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-3">
            {nextActionCards.map((card) => (
              <Link
                key={card.label}
                to={card.href}
                className={`${ADMIN_MAIN_CARD_CLASS} transition hover:border-slate-300 hover:bg-slate-50/50`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600">
                    {card.icon ? <card.icon className="h-5 w-5" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className={ADMIN_EYEBROW_CLASS}>{card.label}</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{card.value}</p>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ) : null}

        {customerData?.has_active_alert_note || customerData?.is_banned ? (
          <section className="grid gap-4">
            {customerData?.has_active_alert_note ? (
              <AlertBanner tone="amber" title="Staff alert note">
                <p className="whitespace-pre-wrap">{customerData.active_alert_note}</p>
              </AlertBanner>
            ) : null}

            {customerData?.is_banned ? (
              <AlertBanner tone="red" title="Banned customer">
                <p className="whitespace-pre-wrap">{customerData.ban_note || 'This customer is currently banned. Review the verification and account notes before proceeding.'}</p>
              </AlertBanner>
            ) : null}
          </section>
        ) : null}

        <details className={ADMIN_MAIN_CARD_CLASS}>
          <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className={ADMIN_EYEBROW_CLASS}>Risk Controls</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Ban & Notes</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {customerData?.is_banned ? (
                <span className="inline-flex items-center rounded-2xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                  Banned
                </span>
              ) : null}
              {customerData?.has_active_alert_note ? (
                <span className="inline-flex items-center rounded-2xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  Alert note
                </span>
              ) : null}
              {!canManageCustomerAlerts ? (
                <span className="inline-flex items-center rounded-2xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  Admin or owner only
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-2xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                Manage
              </span>
            </div>
          </summary>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className={ADMIN_SOFT_CARD_CLASS}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Rental restriction</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {customerData?.is_banned ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl border-slate-200 bg-white"
                      onClick={handleSaveCustomerBanNote}
                      disabled={savingCustomerBan || !canManageCustomerAlerts}
                    >
                      {savingCustomerBan ? 'Saving...' : 'Save Ban Note'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className={`rounded-2xl ${customerData?.is_banned ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-950 hover:bg-slate-800'} text-white`}
                    onClick={() => handleToggleCustomerBan(!customerData?.is_banned)}
                    disabled={savingCustomerBan || !canManageCustomerAlerts}
                  >
                    {savingCustomerBan ? 'Saving...' : customerData?.is_banned ? 'Remove Ban' : 'Mark as Banned'}
                  </Button>
                </div>
              </div>
              <textarea
                ref={customerBanTextareaRef}
                value={customerBanNote}
                onChange={(event) => setCustomerBanNote(event.target.value)}
                rows={4}
                disabled={!canManageCustomerAlerts}
                className="mt-4 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="Ban note..."
              />
            </div>

            <div className={ADMIN_SOFT_CARD_CLASS}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Internal notes</p>
                </div>
                <Button
                  type="button"
                  className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700"
                  onClick={handleSaveCustomerNote}
                  disabled={savingCustomerNote || !canManageCustomerAlerts}
                >
                  {savingCustomerNote ? 'Saving...' : 'Save Note'}
                </Button>
              </div>
              <textarea
                ref={customerNoteTextareaRef}
                value={customerProfileNote}
                onChange={(event) => setCustomerProfileNote(event.target.value)}
                rows={5}
                disabled={!canManageCustomerAlerts}
                className="mt-4 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="Internal note..."
              />
              <label className="mt-3 flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={customerAlertEnabled}
                  onChange={(event) => setCustomerAlertEnabled(event.target.checked)}
                  disabled={!canManageCustomerAlerts}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:cursor-not-allowed"
                />
                Show this note as a rental alert pop-up when the customer is selected
              </label>
            </div>
          </div>

          {customerNoteHistory.length > 0 ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Staff note history</p>
                </div>
                <span className="inline-flex items-center rounded-2xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {customerNoteHistory.length} saved
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {customerNoteHistory.slice(0, 5).map((note) => (
                  <div key={note.id || `${note.created_at}-${note.note_text}`} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {note.created_by_name || 'Team'} • {formatDate(note.created_at)}
                        </p>
                        {note.is_alert ? (
                          <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            Rental alert
                          </span>
                        ) : null}
                      </div>
                      {canManageCustomerAlerts ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomerNote(note.id)}
                          disabled={savingCustomerNote}
                          className="inline-flex items-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.note_text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </details>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Rentals', value: rentalActivityTotals.total },
          { label: 'Threads', value: relatedThreads.length },
          { label: 'Vehicles', value: marketplaceVehicleCount },
          { label: 'Listings', value: marketplaceListingCount },
        ].map((stat) => (
          <div key={stat.label} className={ADMIN_MAIN_CARD_CLASS}>
            <p className={ADMIN_EYEBROW_CLASS}>{stat.label}</p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.02em] text-slate-900">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <section className={ADMIN_MAIN_CARD_CLASS}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Identity & Documents</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">Core customer profile and saved ID documents together.</p>
              </div>
              {verificationReviewHref ? (
                <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                  <Link to={verificationReviewHref}>Open verification</Link>
                </Button>
              ) : null}
            </div>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['Full name', displayName],
                ['Phone', customerData?.phone || appUserProfile?.phone || ocrIdentityFallback.phone || 'Not available'],
                ['Email', displayEmail],
                ['Date of birth', identityFallback.date_of_birth || 'Not available'],
                ['Nationality', identityFallback.nationality || 'Not available'],
                ['ID number', identityFallback.id_number || 'Not available'],
                ['Licence', identityFallback.licence_number || 'Not available'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 text-slate-500" />
                  <h3 className="text-base font-semibold text-slate-900">ID Documents</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Primary and secondary ID scans saved for this customer.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canUploadCustomerDocuments ? (
                    <>
                      <input
                        ref={customerDocumentInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(event) => void handleCustomerDocumentUpload(event)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white"
                        disabled={uploadingCustomerDocument}
                        onClick={() => customerDocumentInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {uploadingCustomerDocument ? 'Uploading…' : 'Upload ID document'}
                      </Button>
                    </>
                  ) : null}
                  <span className={`inline-flex items-center rounded-2xl px-3 py-1.5 text-sm font-semibold ring-1 ${getVerificationTone(verificationLabel)}`}>
                    {verificationLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
              {visibleVerificationDocumentsWithLabels.length > 0 ? (
                <>
                  {visibleVerificationDocumentsForCards.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {visibleVerificationDocumentsForCards.map((document) => renderCompactDocumentTile(document))}
                    </div>
                  ) : null}
                  {renderSecondaryIdDocumentsGroup()}
                </>
              ) : (
                <div className="flex items-start gap-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-300">
                    <FileBadge2 className="h-9 w-9" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">No ID documents uploaded</p>
                    <p className="mt-1 text-sm text-slate-500">No customer identity documents are available yet.</p>
                  </div>
                </div>
              )}

              {visibleVerificationHistoryDocuments.length > 0 ? (
                <div className={ADMIN_SOFT_CARD_CLASS}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Verification history</p>
                      <p className="mt-1 text-sm text-slate-500">Previously approved documents kept for admin reference.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {visibleVerificationHistoryDocuments.length} stored
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {visibleVerificationHistoryDocuments.map((document) => {
                      const statusMeta = getVerificationDocumentStatusMeta(document?.status);
                      return (
                        <div key={`${document.id}-history-card`} className="flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-4">
                          <button
                            type="button"
                            onClick={() => {
                              if (document?.file_url) setPreviewDocument(document);
                            }}
                            className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white"
                          >
                            {String(document?.file_url || '').trim() ? (
                              <img
                                src={document.file_url}
                                alt={getVerificationDocumentLabel(document)}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-300">
                                <FileBadge2 className="h-8 w-8" />
                              </div>
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{getVerificationDocumentLabel(document)}</p>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusMeta.className}`}>
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              {`Archived ${formatDate(document?.submission_metadata?.archivedAt || document?.updated_at || document?.created_at)}`}
                            </p>
                            {document?.file_url ? (
                              <button
                                type="button"
                                onClick={() => setPreviewDocument(document)}
                                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-800"
                              >
                                <Eye className="h-4 w-4" />
                                Open preview
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className={ADMIN_MAIN_CARD_CLASS}>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Activity & Risk</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Live attention signals, rental activity, and marketplace footprint.</p>

            <div className={`mt-5 ${ADMIN_SOFT_CARD_CLASS}`}>
              <p className={ADMIN_EYEBROW_CLASS}>Needs attention</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {customerAttentionItems.length > 0 ? customerAttentionItems.map((item) => (
                  <span key={item.label} className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${item.tone}`}>
                    {item.label}
                  </span>
                )) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    No active issues
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className={ADMIN_SOFT_CARD_CLASS}>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Rental activity</h3>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Total rentals', rentalActivityTotals.total],
                    ['Active rentals', rentalActivityTotals.active],
                    ['Completed rentals', rentalActivityTotals.completed],
                    ['Cancelled rentals', rentalActivityTotals.cancelled],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className={ADMIN_EYEBROW_CLASS}>{label}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ['Last rental', latestRental ? formatDate(latestRental.rental_start_date || latestRental.created_at) : 'Not available'],
                    ['Amount', latestRentalAmount > 0 ? `${latestRentalAmount} MAD` : 'Not available'],
                    ['Outstanding', latestRentalRemainingAmount > 0 ? `${latestRentalRemainingAmount} MAD` : '0 MAD'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <span className="font-semibold text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Recent rental history</p>
                    <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                      <Link to={customerRentalsHref}>Open full rental history</Link>
                    </Button>
                  </div>
                  {rentalHistoryPreview.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {rentalHistoryPreview.slice(0, 3).map((entry) => (
                        <Link
                          key={`activity-${entry.id || entry.rental_id}`}
                          to={`/admin/rentals/${entry.id}`}
                          className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50/50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {entry.rental_id || entry.vehicle?.name || entry.display_name || 'Rental'}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {formatDate(entry.rental_start_date || entry.created_at)}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {getRentalHistoryStatus(entry)}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                      No rentals yet.
                    </div>
                  )}
                </div>
              </div>

              <div className={ADMIN_SOFT_CARD_CLASS}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Verification state</h3>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${getVerificationTone(verificationLabel)}`}>
                    {verificationLabel}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                    Pending: {pendingVerificationCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                    Approved: {approvedVerificationCount}
                  </span>
                </div>
              </div>

              <div className={ADMIN_SOFT_CARD_CLASS}>
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Marketplace footprint</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ['Vehicles', marketplaceVehicleCount],
                    ['Listings', marketplaceListingCount],
                    ['Live', liveMarketplaceListingsCount],
                    ['Pending', pendingMarketplaceListingsCount],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <span className="font-semibold text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <details className={ADMIN_SOFT_CARD_CLASS}>
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  System info
                </summary>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ['Customer ID', displayCustomerId],
                    ['Created', formatDate(customerData?.created_at || customerProfile?.created_at || appUserProfile?.created_at)],
                    ['Data source', systemSourceLabel],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <span className="font-semibold text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>
        </div>
      </section>

      <section className={ADMIN_MAIN_CARD_CLASS}>
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Customer workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Quick access to customer messages, verification, and listings without leaving this profile.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspaceTabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={tabButtonClass(tab.key)}>
                {tab.label}
                <span className={`ml-2 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-white text-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-5">
          {activeTab === 'messages' ? (
            primaryCustomerThread ? (
              <div className="space-y-4">
                <ThreadPreviewCard thread={primaryCustomerThread} openHref={primaryCustomerThreadHref} />
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/60 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-600 shadow-sm">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Customer thread</p>
                      <p className="mt-1 text-sm text-slate-500">No messages yet.</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setMessageDialogOpen(true)}
                    disabled={!canMessageCustomer}
                    className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Start message
                  </Button>
                </div>
              </div>
            )
          ) : null}

          {activeTab === 'verification' ? (
            visibleVerificationDocumentsWithLabels.length > 0 || visibleVerificationHistoryDocuments.length > 0 ? (
              <div className="space-y-4">
                {visibleVerificationDocumentsWithLabels.length > 0 ? (
                  <>
                    {visibleVerificationDocumentsForCards.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {visibleVerificationDocumentsForCards.map((document) => (
                          <VerificationDocumentCard
                            key={document.id}
                            title={getVerificationDocumentLabel(document)}
                            document={{ ...document, owner_email: customerData?.email || displayEmail }}
                            reviewHref={verificationReviewHref}
                            comparisonProfile={verificationComparisonProfile}
                          />
                        ))}
                      </div>
                    ) : null}
                    {renderSecondaryIdDocumentsGroup({ detailed: true })}
                  </>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                    No active verification documents right now. Archived approved documents will still appear below in history.
                  </div>
                )}
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">Status history</p>
                  <div className="mt-3 space-y-3">
                    {verificationHistoryPreview.map((document) => {
                      const statusMeta = getVerificationDocumentStatusMeta(document?.status);
                      const archivedAt = document?.submission_metadata?.archivedAt || document?.updated_at || document?.created_at;
                      return (
                        <div key={`${document.id}-history`} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{getVerificationDocumentLabel(document)}</p>
                            <p className="text-sm text-slate-500">
                              {String(document?.status || '').toLowerCase() === 'archived'
                                ? `Archived ${formatDate(archivedAt)}`
                                : formatDate(document.created_at)}
                            </p>
                            {['rejected', 'suspended'].includes(String(document?.status || '').toLowerCase()) && document?.rejection_reason ? (
                              <p className="mt-1 text-sm font-medium text-rose-600">{document.rejection_reason}</p>
                            ) : null}
                          </div>
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {(visibleVerificationDocumentsWithLabels.length + visibleVerificationHistoryDocuments.length) > verificationHistoryPreview.length ? (
                    <p className="mt-3 text-sm font-medium text-slate-500">
                      Showing latest {verificationHistoryPreview.length} verification items.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No verification documents yet.
              </div>
            )
          ) : null}

          {activeTab === 'listings' ? (
            marketplaceListings.length > 0 ? (
              <div className="grid gap-3">
                {listingsPreview.map((listing) => (
                  <div key={listing.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{listing.title || `Listing ${compactListingId(listing.id)}`}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">{String(listing.listing_status || 'draft').replace(/_/g, ' ')}</p>
                      </div>
                      <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                        <Link to={buildAdminMarketplaceListingPath(listing.id)}>Open</Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {marketplaceListings.length > listingsPreview.length ? (
                  <p className="text-sm font-medium text-slate-500">
                    Showing latest {listingsPreview.length} of {marketplaceListings.length} listings.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No listings yet.
              </div>
            )
          ) : null}
        </div>
      </section>

      </div>

      {showCopyConfirmation ? (
        <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-6">
          <div className="animate-[copy-confirm-pop_280ms_ease-out] rounded-[28px] border border-violet-200/80 bg-white/95 px-8 py-6 text-center shadow-[0_30px_80px_rgba(76,29,149,0.18)] backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-700 shadow-inner">
              <CheckCircle className="h-7 w-7" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
              Copied
            </p>
            <p className="mt-2 text-lg font-bold tracking-[-0.03em] text-slate-950">
              Customer reference copied
            </p>
          </div>
        </div>
      ) : null}

      {previewDocument ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPreviewDocument(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 xl:left-[max(2rem,calc(50vw-32rem))] xl:right-[max(2rem,calc(50vw-32rem))] xl:top-20 xl:w-auto xl:max-w-none xl:translate-x-0 xl:translate-y-0">
            <DialogHeader className="border-b border-slate-100 px-6 py-4">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {getVerificationDocumentLabel(previewDocument)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Preview the selected customer verification document.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6">
              {String(previewDocument?.file_url || '').trim() ? (
                isImagePreviewUrl(String(previewDocument?.file_url || '').trim()) ? (
                  <img
                    src={previewDocument.file_url}
                    alt={getVerificationDocumentLabel(previewDocument)}
                    className="max-h-[70vh] w-full rounded-2xl object-contain bg-slate-50"
                  />
                ) : (
                  <iframe
                    src={previewDocument.file_url}
                    title={getVerificationDocumentLabel(previewDocument)}
                    className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-slate-50"
                  />
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  No preview available for this document.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
          <DialogContent className="max-w-xl rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="text-xl font-semibold text-slate-900">Message customer</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-slate-500">
              Send a direct admin note to {displayName}. This stays connected to the shared Message Center thread.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={ADMIN_EYEBROW_CLASS}>To</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{displayEmail}</p>
                </div>
                <div>
                  <p className={ADMIN_EYEBROW_CLASS}>Thread</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {primaryCustomerThread ? 'Existing shared thread' : 'New shared thread'}
                  </p>
                </div>
              </div>
            </div>

            {primaryCustomerThread ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Recent conversation</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {primaryCustomerThread.subject || 'Shared customer thread'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {primaryCustomerThread.latest_message || 'No recent message yet.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMessageDialogOpen(false);
                      navigate(`/admin/messages?threadKey=${encodeURIComponent(String(primaryCustomerThread.thread_key || messageThreadKey))}`);
                    }}
                    className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  >
                    Open thread
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <label className={ADMIN_EYEBROW_CLASS}>Message</label>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                rows={6}
                placeholder="Write a short operational note for this customer..."
                className="mt-3 w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </div>

            {relatedThreads.length > 0 ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-emerald-800">
                  This customer already has {relatedThreads.length} shared {relatedThreads.length === 1 ? 'thread' : 'threads'} linked to Message Center.
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMessageDialogOpen(false)}
              className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendCustomerMessage}
              disabled={sendingMessage || !messageBody.trim() || !canMessageCustomer}
              className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingMessage ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes copy-confirm-pop {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminCustomerProfile;
