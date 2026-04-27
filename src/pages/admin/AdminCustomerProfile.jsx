import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { buildAdminMarketplaceListingPath } from '../../utils/marketplaceAdminLinks';
import MessageWidget from '../../components/messages/MessageWidget';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import useAdminModalFocus from '../../hooks/useAdminModalFocus';
import { mergeCustomerScanHistory } from '../../utils/customerIdentity';

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

const buildCustomerAccountThreadKey = ({ entityId, email }) => {
  const resolvedEntityId = String(entityId || '').trim();
  const resolvedEmail = String(email || '').trim().toLowerCase();
  return ['account_trust', 'account_status', 'user', resolvedEntityId || resolvedEmail || 'customer'].join(':');
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
  if (label === 'Pending review') return 'bg-amber-50 text-amber-700 ring-amber-200';
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
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
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
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return '';
  return normalized;
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
  if (matchState === 'mismatch') return 'bg-amber-100 text-amber-700';
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
  <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  </div>
);

const QuickActionCard = ({ icon: Icon, label, hint, href, onClick, tone = 'violet' }) => {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-violet-50 text-violet-700';

  const content = (
    <div className="rounded-[26px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:border-violet-200 hover:bg-violet-50/40">
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-3 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{label}</p>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );

  if (href) return <Link to={href}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="w-full text-left">{content}</button>;
  return content;
};

const SectionShell = ({ title, description, children }) => (
  <section className="rounded-[32px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-500">{title}</p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{description}</p>
      </div>
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

const CompactTimelineCard = ({ icon: Icon, title, meta, href, tone = 'slate' }) => {
  const toneClass =
    tone === 'violet'
      ? 'bg-violet-50 text-violet-700'
      : tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-700';

  const content = (
    <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4 transition-colors hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-2.5 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">{title}</p>
          {meta ? <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{meta}</p> : null}
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
      <div key={item.label} className="rounded-[24px] border border-slate-100 bg-slate-50/70 px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{item.value || 'Not available'}</p>
      </div>
    ))}
  </div>
);

const AlertBanner = ({ tone = 'slate', title, children }) => {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : tone === 'red'
        ? 'border-red-200 bg-red-50/90 text-red-900'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
          : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <div className="mt-1 text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

const PreviewCard = ({ title, subtitle, imageUrl, href }) => (
  <div className="rounded-[26px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
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
        <p className="text-xl font-black tracking-tight text-violet-700">{title}</p>
        {subtitle ? <p className="mt-2 text-sm font-bold uppercase tracking-[0.22em] text-slate-400">{subtitle}</p> : null}
        {href ? (
          <div className="mt-4">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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

const VerificationDocumentCard = ({ title, document, reviewHref, comparisonProfile }) => {
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
    <div className="rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
          {previewUrl && canPreviewImage ? (
            <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-violet-300">
              <FileBadge2 className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-black tracking-tight text-violet-700">{title}</p>
            {documentNeedsChange ? (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
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
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ocrSucceeded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {ocrSucceeded ? 'Scan completed' : 'OCR attempted'}
              </span>
              {confirmedFieldsCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
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
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Scanned details</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    Compare the customer profile with the scanned document values.
                  </p>
                </div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                  Admin review
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {comparisonRows.map((row) => (
                  <div key={`${document?.id || title}-${row.key}`} className="rounded-[18px] border border-white bg-white/90 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-950">{row.label}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${getComparisonBadgeTone(row.matchState)}`}>
                        {getComparisonBadgeLabel(row.matchState)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 xl:grid-cols-3">
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Current profile</p>
                        <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">{row.profileValue || 'Not provided'}</p>
                      </div>
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">OCR extracted</p>
                        <p className="mt-2 min-w-0 break-all text-sm font-semibold leading-6 text-slate-900">{row.extractedValue || 'Not detected'}</p>
                      </div>
                      <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Customer confirmed</p>
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
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
                Preview
              </a>
            ) : null}
            {reviewHref ? (
              <Link
                to={reviewHref}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
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
    <div className="rounded-[26px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-500">Active thread</p>
          <p className="mt-2 text-lg font-black tracking-tight text-slate-950">
            {thread?.subject || thread?.entity_email || 'Shared customer thread'}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            {latestMessage?.body || thread?.latest_message || 'No recent message yet.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
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
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
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
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
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
    <div className="rounded-[26px] border border-violet-100 bg-slate-50/70 p-4 shadow-sm">
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
            <p className="text-base font-bold text-slate-950">{driver?.full_name || `Driver ${index + 1}`}</p>
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
  const [activeTab, setActiveTab] = useState('rentals');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [shellCounts, setShellCounts] = useState({
    rentals: 0,
    tours: 0,
  });
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

        const [verificationResult, rentalsResult, toursResult, rentalHistoryResult, secondDriversResult, sharedThreadsResult] = await Promise.all([
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
          (rentalIdParam || latestRentalRecord?.id)
            ? supabase
                .from('app_4c3a7a6153_rental_second_drivers')
                .select('*')
                .eq('rental_id', rentalIdParam || latestRentalRecord?.id)
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
            ...(Array.isArray(customerRecord?.scan_metadata?.id_scan_history)
              ? customerRecord.scan_metadata.id_scan_history.map((url, index) => ({
                  id: `customer-scan-meta-${index}`,
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
              id_scan_history: mergedIdScanHistory,
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
              : Array.isArray(customerRecord?.scan_metadata?.id_scan_history)
                ? customerRecord.scan_metadata.id_scan_history
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
        setRentalHistory(safeRentalHistory);
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
  const primaryCustomerThread = relatedThreads.find((thread) => String(thread?.thread_key || '').trim() === messageThreadKey) || relatedThreads[0] || null;
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
  const customerIdScans = useMemo(() => {
    return mergeCustomerScanHistory(
      customerData?.id_scan_url,
      customerData?.customer_id_image,
      ...(Array.isArray(customerData?.customer_id_scan_history) ? customerData.customer_id_scan_history : []),
      ...(Array.isArray(customerData?.scan_metadata?.id_scan_history) ? customerData.scan_metadata.id_scan_history : []),
      ...rentalHistory.map((rental) => rental?.customer_id_image)
    ).map((value) => normalizeDocumentUrl(value)).filter(Boolean);
  }, [customerData?.customer_id_image, customerData?.customer_id_scan_history, customerData?.id_scan_url, customerData?.scan_metadata?.id_scan_history, rentalHistory]);
  const extraImages = useMemo(() => {
    const urls = new Set();

    [
      ...(Array.isArray(customerData?.extra_images) ? customerData.extra_images : []),
      ...rentalHistory.flatMap((rental) => (Array.isArray(rental?.extra_images) ? rental.extra_images : [])),
    ].forEach((value) => {
      const normalized = normalizeDocumentUrl(value);
      if (normalized) urls.add(normalized);
    });

    return Array.from(urls);
  }, [customerData?.extra_images, rentalHistory]);
  const profileMediaDocuments = useMemo(() => {
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

    const supportingDocs = extraImages.map((url, index) => ({
      id: `extra-media-${index}`,
      verification_type: customerData?.licence_number ? 'driver_license' : 'supporting_document',
      created_at: customerData?.created_at || latestRental?.created_at || null,
      file_url: url,
      status: effectiveVerificationSummary?.status || effectiveVerificationSummary?.verificationStatus || 'uploaded',
      owner_email: customerData?.email || displayEmail,
      submission_source_label: 'Supporting upload',
      isProfileMediaFallback: true,
    }));

    return [...primaryDocs, ...supportingDocs];
  }, [customerData?.created_at, customerData?.email, customerData?.licence_number, customerIdScans, displayEmail, effectiveVerificationSummary?.status, effectiveVerificationSummary?.verificationStatus, extraImages, latestRental?.created_at]);
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

    return visibleVerificationDocuments.map((document) => {
      const type = String(document?.verification_type || '').toLowerCase();
      if (type === 'profile_id') {
        profileIdIndex += 1;
        return {
          ...document,
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
  }, [visibleVerificationDocuments]);
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
          tone: 'bg-amber-50 text-amber-700 ring-amber-200',
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
    { key: 'rentals', label: 'Rentals', count: rentalHistory.length },
    { key: 'messages', label: 'Messages', count: relatedThreads.length },
    { key: 'verification', label: 'Verification', count: visibleVerificationDocumentsWithLabels.length + verificationHistoryDocuments.length },
    { key: 'listings', label: 'Listings', count: marketplaceListingCount },
  ];
  const rentalHistoryPreview = rentalHistory.slice(0, 3);
  const listingsPreview = marketplaceListings.slice(0, 3);
  const verificationHistoryPreview = [...visibleVerificationDocumentsWithLabels, ...verificationHistoryDocuments].slice(0, 4);
  const nextActionCards = [
    latestRentalHref
      ? {
          label: 'Latest rental',
          value: latestRental ? formatDate(latestRental.rental_start_date || latestRental.created_at) : 'Open now',
          href: latestRentalHref,
        }
      : null,
    verificationReviewHref
      ? {
          label: 'Verification queue',
          value: `${pendingVerificationCount} pending`,
          href: verificationReviewHref,
        }
      : null,
    primaryCustomerThreadHref
      ? {
          label: 'Customer thread',
          value: relatedThreads.length > 0 ? `${relatedThreads.length} active` : 'Start message',
          href: primaryCustomerThreadHref,
        }
      : null,
  ].filter(Boolean);
  const tabButtonClass = (tab) => (
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
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
      await MessageService.sendSharedMessage({
        family: MESSAGE_FAMILIES.accountTrust,
        threadType: MESSAGE_THREAD_TYPES.accountStatus,
        threadKey: messageThreadKey,
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
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-rose-500">Customer profile</p>
            <p className="mt-2 text-lg font-black text-rose-950">Customer profile unavailable</p>
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
    <div className="space-y-6">
      <section className="sticky top-4 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => navigate(-1)}
                variant="ghost"
                className="h-9 rounded-full px-3 text-slate-600"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${getVerificationTone(verificationLabel)}`}>
                {verificationLabel}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{displayName}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">{displayCustomerId}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setMessageDialogOpen(true)}
              disabled={!canMessageCustomer}
              className="rounded-full bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send className="mr-2 h-4 w-4" />
              Message customer
            </Button>
            {verificationReviewHref ? (
              <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white">
                <Link to={verificationReviewHref}>Open verification</Link>
              </Button>
            ) : null}
            {latestRentalHref ? (
              <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white">
                <Link to={latestRentalHref}>Open rental</Link>
              </Button>
            ) : null}
          </div>
        </div>
        {nextActionCards.length > 0 ? (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
            {nextActionCards.map((card) => (
              <Link
                key={card.label}
                to={card.href}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-violet-200 hover:bg-white hover:shadow-sm"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{card.label}</p>
                <p className="mt-2 text-sm font-black text-slate-950">{card.value}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Rentals', value: shellCounts.rentals },
          { label: 'Threads', value: relatedThreads.length },
          { label: 'Vehicles', value: marketplaceVehicleCount },
          { label: 'Listings', value: marketplaceListingCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{stat.label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-500" />
                  <h2 className="text-lg font-black text-slate-950">Identity & Documents</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">Core customer profile and saved ID documents together.</p>
              </div>
              {verificationReviewHref ? (
                <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white">
                  <Link to={verificationReviewHref}>Open verification</Link>
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ['Full name', displayName],
                ['Phone', customerData?.phone || appUserProfile?.phone || ocrIdentityFallback.phone || 'Not available'],
                ['Email', displayEmail],
                ['Date of birth', identityFallback.date_of_birth || 'Not available'],
                ['Nationality', identityFallback.nationality || 'Not available'],
                ['ID number', identityFallback.id_number || 'Not available'],
                ['Licence', identityFallback.licence_number || 'Not available'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-950">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 text-slate-500" />
                    <h3 className="text-base font-black text-slate-950">ID Documents</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Primary and secondary ID scans saved for this customer.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${getVerificationTone(verificationLabel)}`}>
                    {verificationLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
              {visibleVerificationDocumentsWithLabels.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {visibleVerificationDocumentsWithLabels.map((document) => (
                  <div key={document.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
                    <button
                      type="button"
                      onClick={() => {
                        if (document?.file_url) setPreviewDocument(document);
                      }}
                      className="block h-56 w-full overflow-hidden bg-white"
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
                          <p className="text-sm font-bold text-slate-950">
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
                ))}
                </div>
              ) : (
                <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-300">
                    <FileBadge2 className="h-9 w-9" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-950">No ID documents uploaded</p>
                    <p className="mt-1 text-sm text-slate-500">No customer identity documents are available yet.</p>
                  </div>
                </div>
              )}

              {verificationHistoryDocuments.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">Verification history</p>
                      <p className="mt-1 text-sm text-slate-500">Previously approved documents kept for admin reference.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {verificationHistoryDocuments.length} stored
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {verificationHistoryDocuments.map((document) => {
                      const statusMeta = getVerificationDocumentStatusMeta(document?.status);
                      return (
                        <div key={`${document.id}-history-card`} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
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
                              <p className="text-sm font-bold text-slate-950">{getVerificationDocumentLabel(document)}</p>
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

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-black text-slate-950">Activity & Risk</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Live attention signals, rental activity, and marketplace footprint.</p>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Needs attention</p>
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
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-black text-slate-950">Rental activity</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ['Rentals', shellCounts.rentals],
                    ['Last rental', latestRental ? formatDate(latestRental.rental_start_date || latestRental.created_at) : 'Not available'],
                    ['Amount', latestRentalAmount > 0 ? `${latestRentalAmount} MAD` : 'Not available'],
                    ['Outstanding', latestRentalRemainingAmount > 0 ? `${latestRentalRemainingAmount} MAD` : '0 MAD'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <span className="font-semibold text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-black text-slate-950">Verification state</h3>
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

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-black text-slate-950">Marketplace footprint</h3>
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
                      <span className="font-semibold text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <details className="rounded-2xl border border-slate-100 bg-white p-4">
                <summary className="cursor-pointer list-none text-sm font-black text-slate-950">
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
                      <span className="font-semibold text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Customer workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Jump into rentals, messages, verification, and listings without leaving this profile.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspaceTabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={tabButtonClass(tab.key)}>
                {tab.label}
                <span className={`ml-2 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-white text-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-5">
          {activeTab === 'rentals' ? (
            rentalHistory.length > 0 ? (
              <div className="grid gap-3">
                {rentalHistoryPreview.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-black text-slate-950">{entry.vehicle?.name || entry.display_name || 'SEGWAY'}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">{formatDate(entry.rental_start_date || entry.created_at)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{Number(entry.display_amount || 0)} MAD</p>
                      </div>
                      <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white">
                        <Link to={`/admin/rentals/${entry.id}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {rentalHistory.length > rentalHistoryPreview.length ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rentals')}
                      className="text-sm font-semibold text-violet-700 hover:text-violet-800"
                    >
                      Showing latest {rentalHistoryPreview.length} of {rentalHistory.length}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No rentals yet.
              </div>
            )
          ) : null}

          {activeTab === 'messages' ? (
            primaryCustomerThread ? (
              <div className="space-y-4">
                <ThreadPreviewCard thread={primaryCustomerThread} openHref={primaryCustomerThreadHref} />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No messages yet.
              </div>
            )
          ) : null}

          {activeTab === 'verification' ? (
            visibleVerificationDocumentsWithLabels.length > 0 || verificationHistoryDocuments.length > 0 ? (
              <div className="space-y-4">
                {visibleVerificationDocumentsWithLabels.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {visibleVerificationDocumentsWithLabels.map((document) => (
                      <VerificationDocumentCard
                        key={document.id}
                        title={getVerificationDocumentLabel(document)}
                        document={{ ...document, owner_email: customerData?.email || displayEmail }}
                        reviewHref={verificationReviewHref}
                        comparisonProfile={verificationComparisonProfile}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                    No active verification documents right now. Archived approved documents will still appear below in history.
                  </div>
                )}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-bold text-slate-950">Status history</p>
                  <div className="mt-3 space-y-3">
                    {verificationHistoryPreview.map((document) => {
                      const statusMeta = getVerificationDocumentStatusMeta(document?.status);
                      const archivedAt = document?.submission_metadata?.archivedAt || document?.updated_at || document?.created_at;
                      return (
                        <div key={`${document.id}-history`} className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{getVerificationDocumentLabel(document)}</p>
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
                  {(visibleVerificationDocumentsWithLabels.length + verificationHistoryDocuments.length) > verificationHistoryPreview.length ? (
                    <p className="mt-3 text-sm font-medium text-slate-500">
                      Showing latest {verificationHistoryPreview.length} verification items.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No verification documents yet.
              </div>
            )
          ) : null}

          {activeTab === 'listings' ? (
            marketplaceListings.length > 0 ? (
              <div className="grid gap-3">
                {listingsPreview.map((listing) => (
                  <div key={listing.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-black text-slate-950">{listing.title || `Listing ${compactListingId(listing.id)}`}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">{String(listing.listing_status || 'draft').replace(/_/g, ' ')}</p>
                      </div>
                      <Button asChild variant="outline" className="rounded-full border-slate-200 bg-white">
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
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-medium text-slate-500">
                No listings yet.
              </div>
            )
          ) : null}
        </div>
      </section>

      {customerData?.has_active_alert_note ? (
        <AlertBanner tone="amber" title="Active rental alert note">
          <p className="whitespace-pre-wrap">{customerData.active_alert_note}</p>
        </AlertBanner>
      ) : null}

      {customerData?.is_banned ? (
        <AlertBanner tone="red" title="Banned customer">
          <p className="whitespace-pre-wrap">{customerData.ban_note || 'This customer is currently banned. Review the verification and account notes before proceeding.'}</p>
        </AlertBanner>
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
              <DialogTitle className="text-xl font-black text-slate-950">
                {getVerificationDocumentLabel(previewDocument)}
              </DialogTitle>
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
          <DialogContent className="max-w-xl rounded-[32px] border border-violet-100 bg-white p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="text-2xl font-black tracking-tight text-slate-950">Message customer</DialogTitle>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
              Send a direct admin note to {displayName}. This stays connected to the shared Message Center thread.
            </p>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">To</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{displayEmail}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Thread</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {primaryCustomerThread ? 'Existing shared thread' : 'New shared thread'}
                  </p>
                </div>
              </div>
            </div>

            {primaryCustomerThread ? (
              <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-500">Recent conversation</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {primaryCustomerThread.subject || 'Shared customer thread'}
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
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
                    className="rounded-full border-violet-200 bg-white text-violet-700 hover:bg-violet-100"
                  >
                    Open thread
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Message</label>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                rows={6}
                placeholder="Write a short operational note for this customer..."
                className="mt-3 w-full resize-none rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            {relatedThreads.length > 0 ? (
              <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 px-4 py-4">
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
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendCustomerMessage}
              disabled={sendingMessage || !messageBody.trim() || !canMessageCustomer}
              className="rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingMessage ? 'Sending…' : 'Send message'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCustomerProfile;
