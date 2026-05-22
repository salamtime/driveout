import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Eye, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import EnhancedUnifiedIDScanModal from '../components/customers/EnhancedUnifiedIDScanModal';
import PhoneInputWithCountryCode from '../components/forms/PhoneInputWithCountryCode';
import i18n from '../i18n';
import PublicCatalogService from '../services/PublicCatalogService';
import PublicBookingService from '../services/PublicBookingService';
import VerificationService from '../services/VerificationService';
import { fetchSystemSettings } from '../services/systemSettingsApi';
import {
  addConfiguredRentalDuration,
  normalizeDailyReturnPolicy,
} from '../utils/dailyReturnPolicy';
import { formatRentalPackageAllowanceLabel } from '../utils/rentalPackageLabels';

const CERTIFIED_BADGE_SRC = '/images/certified-badge.png';
const SEGWAY_CARD_ICON_SRC = '/images/segway-icon-card.webp';
const BANK_TRANSFER_IMAGE_URL = '/images/bank-transfer-qr.png';
const BANK_TRANSFER_RIB = '007640000537500000122321';

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeInputValue = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const getDefaultReservationStart = () => {
  const now = new Date();
  now.setHours(now.getHours() + 1, 0, 0, 0);
  return now;
};

const composeLocalDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  const localDate = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(localDate.getTime()) ? null : localDate;
};

const formatReservationWindow = (date, locale = 'en-GB') => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeWhatsAppNumber = (value = '') => String(value || '').replace(/[^\d]/g, '');
const hasValidBookingPhone = (value = '') => String(value || '').replace(/[^\d]/g, '').length >= 8;

const getOrCreateBookingSessionKey = (listingId) => {
  if (typeof window === 'undefined') return `website-${listingId || 'booking'}`;

  const storageKey = `instant-booking-session:${listingId || 'booking'}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const nextValue =
    typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `website-${listingId || 'booking'}-${Date.now()}`;

  window.sessionStorage.setItem(storageKey, nextValue);
  return nextValue;
};

const PublicInstantBooking = () => {
  useTranslation();
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const isAuthenticated = Boolean(user);
  const defaultReservationStart = useMemo(() => getDefaultReservationStart(), []);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [licenseStatusMessage, setLicenseStatusMessage] = useState('');
  const [success, setSuccess] = useState(null);
  const [ownerWhatsAppNumber, setOwnerWhatsAppNumber] = useState('');
  const [dailyReturnPolicy, setDailyReturnPolicy] = useState(() => normalizeDailyReturnPolicy());
  const [showCertifiedInfo, setShowCertifiedInfo] = useState(false);
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);
  const [showLicenseSection, setShowLicenseSection] = useState(false);
  const [showDepositInfo, setShowDepositInfo] = useState(false);
  const [bookingSecurityOption, setBookingSecurityOption] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [bookingSessionKey] = useState(() => getOrCreateBookingSessionKey(listingId));
  const [form, setForm] = useState({
    customerName: userProfile?.fullName || user?.user_metadata?.full_name || '',
    customerEmail: user?.email || '',
    customerPhone: userProfile?.phone || user?.user_metadata?.phone || '',
    customerLicenseNumber: '',
    customerIdNumber: '',
    customerDateOfBirth: '',
    customerNationality: '',
    customerPlaceOfBirth: '',
    customerIssueDate: '',
    notes: '',
    licenseDocumentName: '',
    licenseDocumentUrl: '',
    reservationDate: formatDateInputValue(defaultReservationStart),
    reservationStartTime: formatTimeInputValue(defaultReservationStart),
  });

  const rentalType = searchParams.get('rentalType') || 'hourly';
  const selectedPackage = useMemo(
    () => ({
      id: searchParams.get('packageId') || '',
      name: searchParams.get('packageName') || '',
      amount: Number(searchParams.get('packageAmount') || 0),
      kind: searchParams.get('packageKind') || '',
      includedKilometers: searchParams.get('includedKilometers') || '',
      extraKmRate: searchParams.get('extraKmRate') || '',
      durationUnits: Number(searchParams.get('durationUnits') || 1),
    }),
    [searchParams]
  );
  const selectedPackageDisplayName = useMemo(
    () => formatRentalPackageAllowanceLabel(selectedPackage, {
      rentalType,
      fallbackDurationUnits: selectedPackage.durationUnits || 1,
      tr,
    }),
    [rentalType, selectedPackage, selectedPackage.durationUnits, isFrench]
  );
  const selectedCity = searchParams.get('city') || '';

  const baseRateAmount = useMemo(() => {
    if (!listing) return 0;
    return Number(rentalType === 'daily' ? listing.dailyPrice : listing.hourlyPrice) || 0;
  }, [listing, rentalType]);

  const packageSavings = useMemo(() => {
    const selectedAmount = Number(selectedPackage.amount || 0);
    return Math.max(0, baseRateAmount - selectedAmount);
  }, [baseRateAmount, selectedPackage.amount]);

  const bookingDepositAmount = useMemo(() => {
    const selectedAmount = Number(selectedPackage.amount || 0);
    if (!selectedAmount) return 0;
    return Math.max(100, Math.round((selectedAmount * 0.3) / 50) * 50);
  }, [selectedPackage.amount]);

  const paymentAmount = useMemo(() => {
    if (bookingSecurityOption === 'deposit') return bookingDepositAmount;
    if (bookingSecurityOption === 'full') return Number(selectedPackage.amount || 0);
    return 0;
  }, [bookingDepositAmount, bookingSecurityOption, selectedPackage.amount]);

  const bookingLifecycleStatus = useMemo(() => {
    if (paymentStatus === 'payment_submitted') return 'payment_submitted';
    if (bookingSecurityOption === 'continue') return 'pending';
    if (bookingSecurityOption === 'scan_hold') return 'verified';
    if (bookingSecurityOption === 'deposit' || bookingSecurityOption === 'full') return 'awaiting_payment';
    return 'pending';
  }, [bookingSecurityOption, paymentStatus]);

  const bookingStatusMessage = useMemo(() => {
    if (bookingLifecycleStatus === 'payment_submitted') {
      return tr('Payment submitted. We will confirm shortly.', 'Paiement soumis. Nous confirmerons sous peu.');
    }
    if (bookingLifecycleStatus === 'awaiting_payment') {
      return tr('Waiting for payment to secure your booking', 'En attente du paiement pour sécuriser votre réservation');
    }
    if (bookingLifecycleStatus === 'verified') {
      return tr('License noted. Your booking is ready for confirmation.', 'Permis enregistré. Votre réservation est prête à être confirmée.');
    }
    if (!bookingSecurityOption) {
      return '';
    }
    return '';
  }, [bookingLifecycleStatus, bookingSecurityOption, isFrench]);

  const securityOptions = useMemo(
    () => [
      {
        id: 'continue',
        title: tr('Continue without securing', 'Continuer sans sécuriser'),
        subtitle: '',
      },
      {
        id: 'scan_hold',
        title: tr('Scan license', 'Scanner le permis'),
        subtitle: tr('hold 30 min', 'maintien 30 min'),
      },
      {
        id: 'deposit',
        title: tr('Pay deposit by Bank', "Payer l'acompte par Bank"),
        subtitle: tr('hold 4 hours', 'maintien 4 heures'),
        badge: tr('Recommended', 'Recommandé'),
      },
      {
        id: 'full',
        title: tr('Pay full amount by bank', 'Payer la totalité par banque'),
        subtitle: tr('fully secured', 'réservation sécurisée'),
      },
    ],
    [isFrench]
  );

  const showOptionalPayment = bookingSecurityOption === 'deposit' || bookingSecurityOption === 'full';
  const verificationStatus = String(
    verificationSummary?.status ||
    userProfile?.verificationStatus ||
    user?.user_metadata?.verification_status ||
    user?.app_metadata?.verification_status ||
    ''
  )
    .trim()
    .toLowerCase();
  const isVerifiedAccount = Boolean(isAuthenticated) && ['approved', 'verified'].includes(verificationStatus);

  const reservationStartDate = useMemo(
    () => composeLocalDateTime(form.reservationDate, form.reservationStartTime),
    [form.reservationDate, form.reservationStartTime]
  );

  const reservationEndDate = useMemo(
    () => addConfiguredRentalDuration(
      reservationStartDate,
      selectedPackage.durationUnits || 1,
      rentalType,
      dailyReturnPolicy
    ),
    [dailyReturnPolicy, reservationStartDate, selectedPackage.durationUnits, rentalType]
  );

  const reservationDurationHelper = useMemo(() => {
    const units = Math.max(rentalType === 'hourly' ? 0.5 : 1, Number(selectedPackage.durationUnits || 1));
    if (rentalType === 'daily') {
      if (units === 1) {
        return tr(
          `Return is fixed for the next day at ${dailyReturnPolicy.dailyReturnFixedTime}.`,
          `Le retour est fixé au lendemain à ${dailyReturnPolicy.dailyReturnFixedTime}.`
        );
      }
      return tr(
        `${units}-day booking returns at ${dailyReturnPolicy.dailyReturnFixedTime} on the final day.`,
        `Une location de ${units} jours revient à ${dailyReturnPolicy.dailyReturnFixedTime} le dernier jour.`
      );
    }
    if (units === 0.5) return tr('This is a 30-minute rental.', "C'est une location de 30 minutes.");
    if (units === 1) return tr('This is a 1-hour rental.', "C'est une location d'1 heure.");
    return tr(`This is a ${units}-hour rental.`, `C'est une location de ${units} heures.`);
  }, [dailyReturnPolicy.dailyReturnFixedTime, rentalType, selectedPackage.durationUnits, isFrench]);

  const compactDurationLabel = useMemo(() => {
    const units = Math.max(rentalType === 'hourly' ? 0.5 : 1, Number(selectedPackage.durationUnits || 1));
    if (rentalType === 'daily') {
      return units === 1 ? tr('1 day', '1 jour') : tr(`${units} days`, `${units} jours`);
    }
    if (units === 0.5) return tr('30 min', '30 min');
    return units === 1 ? tr('1 hour', '1 heure') : tr(`${units} hours`, `${units} heures`);
  }, [rentalType, selectedPackage.durationUnits, isFrench]);

  const dateTimeSummary = useMemo(() => {
    if (!reservationStartDate) return tr('Select date & time', 'Choisissez la date et l’heure');
    return formatReservationWindow(reservationStartDate, isFrench ? 'fr-FR' : 'en-GB');
  }, [reservationStartDate, isFrench]);

  const detailBackHref = useMemo(() => {
    const next = new URLSearchParams();
    next.set('rentalType', rentalType);
    if (selectedPackage.id) {
      next.set('packageId', selectedPackage.id);
    }
    if (selectedPackage.durationUnits) {
      next.set('durationUnits', String(selectedPackage.durationUnits));
    }
    if (selectedCity) {
      next.set('city', selectedCity);
    }
    const query = next.toString();
    return `/rent/${listingId}${query ? `?${query}` : ''}`;
  }, [listingId, rentalType, selectedCity, selectedPackage.durationUnits, selectedPackage.id]);

  useEffect(() => {
    let active = true;

    const loadListing = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await PublicCatalogService.getListingById(listingId);
        if (!active) return;
        if (!data || data.inventorySource !== 'certified_fleet') {
          setError(tr('This instant booking page is only available for certified fleet vehicles.', "Cette page de réservation instantanée est uniquement disponible pour les véhicules de flotte certifiée."));
          return;
        }
        setListing(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || tr('Failed to load booking vehicle.', 'Impossible de charger le véhicule à réserver.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadListing();
    return () => {
      active = false;
    };
  }, [listingId]);

  useEffect(() => {
    let active = true;

    const loadVerificationSummary = async () => {
      if (!user?.id) {
        setVerificationSummary(null);
        return;
      }

      try {
        const result = await VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true });
        if (active) {
          setVerificationSummary(result?.summary || null);
        }
      } catch {
        if (active) {
          setVerificationSummary(null);
        }
      }
    };

    void loadVerificationSummary();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const settings = await fetchSystemSettings();
        if (!active) return;
        setOwnerWhatsAppNumber(settings?.companyPhone || '');
        setDailyReturnPolicy(normalizeDailyReturnPolicy(settings));
      } catch {
        if (!active) return;
        setOwnerWhatsAppNumber('');
        setDailyReturnPolicy(normalizeDailyReturnPolicy());
      }
    };

    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleLicenseScanComplete = (scannedData) => {
    const scannedLicenseNumber =
      scannedData?.customer_licence_number ||
      scannedData?.licence_number ||
      scannedData?.license_number ||
      scannedData?.document_number ||
      scannedData?.id_number ||
      scannedData?.idNumber ||
      '';
    const scannedName =
      scannedData?.customer_name ||
      scannedData?.full_name ||
      scannedData?.fullName ||
      scannedData?.name ||
      '';
    const scannedImageUrl =
      scannedData?.imageUrl ||
      scannedData?.publicUrl ||
      scannedData?.id_scan_url ||
      '';
    const scannedIdNumber =
      scannedData?.customer_id_number ||
      scannedData?.id_number ||
      scannedData?.idNumber ||
      scannedData?.document_number ||
      '';
    const scannedDateOfBirth =
      scannedData?.customer_dob ||
      scannedData?.date_of_birth ||
      scannedData?.dateOfBirth ||
      scannedData?.dob ||
      '';
    const scannedNationality =
      scannedData?.customer_nationality ||
      scannedData?.nationality ||
      '';
    const scannedPlaceOfBirth =
      scannedData?.customer_place_of_birth ||
      scannedData?.place_of_birth ||
      scannedData?.placeOfBirth ||
      '';
    const scannedIssueDate =
      scannedData?.customer_issue_date ||
      scannedData?.issue_date ||
      scannedData?.issueDate ||
      '';
    const scannedEmail =
      scannedData?.customer_email ||
      scannedData?.email ||
      '';
    const scannedPhone =
      scannedData?.customer_phone ||
      scannedData?.phone ||
      '';

    setError('');
    setLicenseStatusMessage(
      scannedData?.ocrSkipped
        ? tr('License image saved. You can continue and fill the fields manually.', "L'image du permis a été enregistrée. Vous pouvez continuer et remplir les champs manuellement.")
        : scannedData?.ocrUnavailable
          ? tr('License image saved. OCR is unavailable right now, so please review the fields.', "L'image du permis a été enregistrée. L'OCR est indisponible pour le moment, veuillez vérifier les champs.")
          : tr('License scanned successfully. Your details were auto-filled.', 'Permis scanné avec succès. Vos informations ont été remplies automatiquement.')
    );
    setPaymentStatus((current) => (current === 'payment_submitted' ? current : 'verified'));
    setForm((current) => ({
      ...current,
      customerName: scannedName || current.customerName,
      customerEmail: scannedEmail || current.customerEmail,
      customerPhone: scannedPhone || current.customerPhone,
      customerLicenseNumber: scannedLicenseNumber || current.customerLicenseNumber,
      customerIdNumber: scannedIdNumber || current.customerIdNumber,
      customerDateOfBirth: scannedDateOfBirth || current.customerDateOfBirth,
      customerNationality: scannedNationality || current.customerNationality,
      customerPlaceOfBirth: scannedPlaceOfBirth || current.customerPlaceOfBirth,
      customerIssueDate: scannedIssueDate || current.customerIssueDate,
      licenseDocumentName: scannedLicenseNumber ? `License ${scannedLicenseNumber}` : current.licenseDocumentName,
      licenseDocumentUrl: scannedImageUrl || current.licenseDocumentUrl,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!listing) return;

    if (!hasValidBookingPhone(form.customerPhone)) {
      setShowLicenseSection(false);
      setError(tr('Enter a valid phone number before confirming.', 'Entrez un numéro de téléphone valide avant de confirmer.'));
      return;
    }

    if (!String(form.customerName || '').trim()) {
      setError(tr('Enter your full name before confirming.', 'Entrez votre nom complet avant de confirmer.'));
      return;
    }

    if (
      bookingSecurityOption === 'scan_hold' &&
      !form.licenseDocumentUrl &&
      !form.customerLicenseNumber
    ) {
      setShowLicenseSection(true);
      setScanModalOpen(true);
      setError('');
      setLicenseStatusMessage(
        tr(
          'Scan or import the driver license first, then confirm the reservation.',
          'Scannez ou importez d’abord le permis, puis confirmez la réservation.'
        )
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await PublicBookingService.createCertifiedBooking({
        listing,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        customerLicenseNumber: form.customerLicenseNumber,
        licenseDocumentUrl: form.licenseDocumentUrl,
        rentalType,
        packageSelection: selectedPackage,
        startDate: form.reservationDate,
        startTime: form.reservationStartTime,
        durationUnits: selectedPackage.durationUnits || 1,
        notes: [
          form.notes,
          `Website booking status: ${bookingLifecycleStatus}`,
          `Website security option: ${bookingSecurityOption}`,
          `Booking security option: ${bookingSecurityOption}`,
          `Booking payment status: ${paymentStatus}`,
          paymentAmount ? `Booking payment amount: ${paymentAmount} MAD` : '',
          form.customerLicenseNumber ? `License number: ${form.customerLicenseNumber}` : '',
          form.customerIdNumber ? `ID number: ${form.customerIdNumber}` : '',
          form.customerDateOfBirth ? `Date of birth: ${form.customerDateOfBirth}` : '',
          form.customerNationality ? `Nationality: ${form.customerNationality}` : '',
          form.customerPlaceOfBirth ? `Place of birth: ${form.customerPlaceOfBirth}` : '',
          form.customerIssueDate ? `Issue date: ${form.customerIssueDate}` : '',
          form.licenseDocumentUrl ? `License document: ${form.licenseDocumentUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        websiteBookingStatus: bookingLifecycleStatus,
        bookingSecurityOption,
        bookingSessionKey,
      });

      setSuccess(result);
    } catch (submitError) {
      setError(submitError?.message || tr('Unable to create booking right now.', 'Impossible de créer la réservation pour le moment.'));
    } finally {
      setSaving(false);
    }
  };

  const whatsappConfirmationUrl = useMemo(() => {
    if (!success) return '';

    const cleanOwnerPhone = normalizeWhatsAppNumber(ownerWhatsAppNumber);
    if (!cleanOwnerPhone) return '';

    const bookingReference = success.rental_id || success.id || 'Booking';
    const bookingLink = success.id ? `${window.location.origin}/admin/rentals/${success.id}` : '';
    const lines = [
      tr('New website reservation', 'Nouvelle réservation site web'),
      `${tr('Reference', 'Référence')}: ${bookingReference}`,
      `${tr('Customer', 'Client')}: ${form.customerName}`,
      `${tr('Phone', 'Téléphone')}: ${form.customerPhone}`,
      form.customerEmail ? `${tr('Email', 'E-mail')}: ${form.customerEmail}` : null,
      `${tr('Vehicle', 'Véhicule')}: ${listing?.title || listing?.model || '—'}`,
      `${tr('Reservation window', 'Fenêtre de réservation')}: ${formatReservationWindow(reservationStartDate, isFrench ? 'fr-FR' : 'en-GB')} - ${formatReservationWindow(reservationEndDate, isFrench ? 'fr-FR' : 'en-GB')}`,
      bookingLink ? `${tr('Booking link', 'Lien de réservation')}: ${bookingLink}` : null,
    ].filter(Boolean);

    return `https://wa.me/${cleanOwnerPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [
    success,
    ownerWhatsAppNumber,
    form.customerName,
    form.customerPhone,
    form.customerEmail,
    listing?.title,
    listing?.model,
    reservationStartDate,
    reservationEndDate,
    isFrench,
  ]);

  const paymentWhatsappUrl = useMemo(() => {
    if (!showOptionalPayment || !paymentAmount) return '';

    const cleanOwnerPhone = normalizeWhatsAppNumber(ownerWhatsAppNumber);
    if (!cleanOwnerPhone) return '';
    const bookingReference = success?.rental_id || success?.id || '—';

    const lines = [
      tr('Hello, I sent a transfer for my booking.', "Bonjour, j'ai envoyé un virement pour ma réservation."),
      '',
      `${tr('Reference', 'Référence')}: ${bookingReference}`,
      `${tr('Name', 'Nom')}: ${form.customerName || '—'}`,
      `${tr('Vehicle', 'Véhicule')}: ${listing?.model || listing?.title || '—'}`,
      `${tr('Time', 'Heure')}: ${dateTimeSummary}`,
      `${tr('Amount', 'Montant')}: ${paymentAmount} ${listing?.currencyCode || 'MAD'}`,
      '',
      tr('I am sending proof of payment.', "J'envoie la preuve de paiement."),
    ];

    return `https://wa.me/${cleanOwnerPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [
    showOptionalPayment,
    paymentAmount,
    ownerWhatsAppNumber,
    form.customerName,
    success?.rental_id,
    success?.id,
    listing?.model,
    listing?.title,
    listing?.currencyCode,
    dateTimeSummary,
    isFrench,
  ]);

  const handlePaymentIntent = () => {
    if (!paymentWhatsappUrl) return;
    setPaymentStatus('payment_submitted');
    window.open(paymentWhatsappUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (paymentStatus !== 'payment_submitted' || !success?.id) return;

    PublicBookingService.updateWebsiteBookingState(success.id, {
      bookingSecurityOption,
      websiteBookingStatus: 'payment_submitted',
      actorName: 'website',
      reason: 'Customer clicked I sent the payment on website checkout',
    }).catch(() => {});
  }, [paymentStatus, success?.id, bookingSecurityOption]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-4 py-4 pb-[148px] sm:px-6 sm:py-8 sm:pb-[200px]">
        <div className="mx-auto max-w-xl animate-pulse">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-white" />
            <div className="h-11 w-44 rounded-full border border-violet-100 bg-white" />
          </div>

          <section className="rounded-[32px] border border-slate-200 bg-white p-4 pb-12 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-6 sm:pb-20">
            <div className="mb-4 h-48 overflow-hidden rounded-[28px] bg-slate-100 sm:h-56" />

            <div className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="h-10 w-28 rounded-2xl bg-slate-200" />
                  <div className="mt-3 h-5 w-44 rounded-full bg-slate-200" />
                </div>
                <div className="h-14 w-14 rounded-[18px] bg-slate-200 sm:h-16 sm:w-16" />
              </div>
              <div className="mt-4 flex justify-end">
                <div className="h-8 w-24 rounded-full bg-white ring-1 ring-slate-200" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="h-14 rounded-[22px] bg-slate-100" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-14 rounded-[22px] bg-slate-100" />
                <div className="h-14 rounded-[22px] bg-slate-100" />
              </div>
              <div className="h-24 rounded-[26px] bg-slate-100" />
              <div className="h-14 rounded-full bg-violet-100" />
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-14">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-rose-700">
          <h1 className="text-2xl font-semibold text-rose-900">{tr('Booking unavailable', 'Réservation indisponible')}</h1>
          <p className="mt-3">{error}</p>
          <Link to="/rent" className="mt-6 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white">
            {tr('Back to browse', 'Retour à la navigation')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-4 py-4 pb-[148px] sm:px-6 sm:py-8 sm:pb-[200px]">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(detailBackHref)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
            title={tr('Back to package', 'Retour au forfait')}
            aria-label={tr('Back to package', 'Retour au forfait')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowCertifiedInfo(true)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-violet-100 transition hover:border-violet-300 hover:bg-violet-50/40"
            aria-label={tr('Open certified fleet details', 'Ouvrir les détails de la flotte certifiée')}
          >
            <img src={CERTIFIED_BADGE_SRC} alt="Certified fleet" className="h-6 w-6 object-contain" />
            <span>{tr('Certified Fleet', 'Flotte certifiée')}</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">
              <Eye className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>

        <section className="rounded-[32px] border border-slate-200 bg-white p-4 pb-12 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-6 sm:pb-20">
          <div className="mb-4 overflow-hidden rounded-[28px] bg-white">
            <img src={listing.imageUrl} alt={listing.title} className="h-48 w-full object-cover sm:h-56" />
          </div>

          <div className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[2rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2.35rem]">
                  {listing.model || listing.title}
                </p>
                <p className="mt-2 text-[1.02rem] font-semibold leading-snug text-slate-900 sm:text-lg">
                  {`${selectedPackageDisplayName} • ${selectedPackage.amount || 0} ${listing.currencyCode}`}
                </p>
              </div>
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] bg-white shadow-sm sm:h-16 sm:w-16">
                <img
                  src={SEGWAY_CARD_ICON_SRC}
                  alt={listing.brand || 'Segway'}
                  className="h-full w-full rounded-[18px] object-cover"
                />
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0" />
              <button
                type="button"
                onClick={() => setShowSummaryDetails((current) => !current)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
              >
                {showSummaryDetails ? tr('Hide ↑', 'Masquer ↑') : tr('View details ↓', 'Voir les détails ↓')}
              </button>
            </div>
            {showSummaryDetails ? (
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span>{tr('Damage deposit', 'Caution')}</span>
                    <button
                      type="button"
                      onClick={() => setShowDepositInfo(true)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                      aria-label={tr('Damage deposit info', 'Informations sur la caution')}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-semibold text-slate-900">{listing.depositAmount || 0} {listing.currencyCode}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span>{tr('Includes', 'Comprend')}</span>
                  <span className="text-right font-semibold text-slate-900">{tr('Fuel • helmet • RC insurance', 'Carburant • casque • assurance RC')}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{tr('Included km', 'Km inclus')}</span>
                  <span className="font-semibold text-slate-900">{selectedPackage.includedKilometers || '—'}</span>
                </div>
                {selectedPackage.extraKmRate ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>{tr('Extra km', 'Km supplémentaire')}</span>
                    <span className="font-semibold text-slate-900">{selectedPackage.extraKmRate} MAD/km</span>
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">{reservationDurationHelper}</p>
              </div>
            ) : null}
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                <h3 className="text-2xl font-semibold text-emerald-900">
                  {showOptionalPayment
                    ? tr('Complete your payment to secure booking', 'Finalisez votre paiement pour sécuriser la réservation')
                    : tr('Booking created', 'Réservation créée')}
                </h3>
                <p className="mt-3 text-sm text-emerald-800">
                  {tr('Your booking was created successfully. Reference:', 'Votre réservation a bien été créée. Référence :')} <span className="font-semibold">{success.rental_id || success.id}</span>
                </p>
                {bookingStatusMessage ? (
                  <p className="mt-2 text-sm font-semibold text-emerald-900">{bookingStatusMessage}</p>
                ) : null}
                <p className="mt-2 text-sm text-emerald-800">
                  {form.customerEmail
                    ? (
                      <>
                        {tr('We saved your reservation with', 'Nous avons enregistré votre réservation avec')} <span className="font-semibold">{form.customerEmail}</span> {tr('so the rental team can confirm the details with you.', "afin que l'équipe de location puisse confirmer les détails avec vous.")}
                      </>
                    ) : (
                      <>
                        {tr('Your reservation was saved with your phone number.', 'Votre réservation a été enregistrée avec votre numéro de téléphone.')} {tr('Use WhatsApp below to send the confirmation directly to our team.', "Utilisez WhatsApp ci-dessous pour envoyer la confirmation directement à notre équipe.")}
                      </>
                    )}
                </p>
              </div>

              {showOptionalPayment ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Amount', 'Montant')}</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{paymentAmount} {listing.currencyCode}</p>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">RIB</p>
                    <p className="mt-1 break-all text-base font-bold text-slate-900">{BANK_TRANSFER_RIB}</p>
                  </div>
                  <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                    <p className="text-sm font-semibold text-slate-900">{tr('Scan to pay instantly', 'Scannez pour payer instantanément')}</p>
                    <img
                      src={BANK_TRANSFER_IMAGE_URL}
                      alt={tr('Bank transfer QR code', 'QR code de virement bancaire')}
                      className="mx-auto mt-4 w-full max-w-[240px] rounded-[20px] bg-white p-2 shadow-sm"
                    />
                    <p className="mt-3 text-sm text-slate-500">
                      {tr('Open your banking app and scan this QR code', 'Ouvrez votre application bancaire et scannez ce QR code')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePaymentIntent}
                    disabled={!paymentWhatsappUrl}
                    className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[18px] bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(91,33,182,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tr('I sent the payment', "J'ai envoyé le paiement")}
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Link to="/website" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">
                  {tr('Back to browse', 'Retour à la navigation')}
                </Link>
                {!showOptionalPayment && !form.customerEmail && whatsappConfirmationUrl ? (
                  <a
                    href={whatsappConfirmationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-800"
                  >
                    {tr('Confirm on WhatsApp', 'Confirmer sur WhatsApp')}
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <form id="instant-booking-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">{tr('Checkout', 'Confirmation')}</p>
                <h2 className="text-[1.35rem] font-semibold text-slate-900 sm:text-[1.5rem]">{tr('Complete your reservation', 'Finalisez votre réservation')}</h2>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-medium text-slate-700">{tr('Date & Time', 'Date et heure')}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                  <input
                    type="date"
                    value={form.reservationDate}
                    min={formatDateInputValue(new Date())}
                    onChange={(e) => updateField('reservationDate', e.target.value)}
                    required
                    className="min-h-[56px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none focus:border-violet-400"
                  />
                  <input
                    type="time"
                    value={form.reservationStartTime}
                    onChange={(e) => updateField('reservationStartTime', e.target.value)}
                    required
                    className="min-h-[56px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none focus:border-violet-400"
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">{dateTimeSummary}</p>
              </div>

              <div className="space-y-3">
                <PhoneInputWithCountryCode
                  value={form.customerPhone}
                  onChange={(value) => updateField('customerPhone', value)}
                  label={tr('Phone', 'Téléphone')}
                  autoFocus
                  required
                />
                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-700">{tr('Full name', 'Nom complet')}</span>
                  <input
                    value={form.customerName}
                    onChange={(e) => updateField('customerName', e.target.value)}
                    required
                    placeholder={tr('Full name', 'Nom complet')}
                    className="min-h-[56px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none focus:border-violet-400"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-700">{tr('Email', 'E-mail')}</span>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => updateField('customerEmail', e.target.value)}
                    placeholder="name@email.com"
                    className="min-h-[56px] w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-900 outline-none focus:border-violet-400"
                  />
                  <p className="text-xs text-slate-500">{tr('Optional for confirmation', 'Optionnel pour la confirmation')}</p>
                </label>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  onClick={() => setShowLicenseSection((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tr('Scan license (optional)', 'Scanner le permis (optionnel)')}</p>
                    <p className="mt-1 text-sm text-slate-500">{tr('We auto-fill your details', 'Nous remplissons automatiquement vos informations')}</p>
                  </div>
                  <span className="text-sm font-semibold text-violet-700">
                    {showLicenseSection ? tr('Hide ↑', 'Masquer ↑') : tr('View ↓', 'Voir ↓')}
                  </span>
                </button>

                {showLicenseSection ? (
                  <div className="mt-4 space-y-3">
                    {isAuthenticated ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setScanModalOpen(true)}
                          className="min-h-[56px] w-full rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white"
                        >
                          {tr('Scan or import license', 'Scanner ou importer le permis')}
                        </button>
                        {form.customerLicenseNumber || form.licenseDocumentName ? (
                          <div className="flex flex-wrap gap-2 text-sm text-slate-700">
                            {form.customerLicenseNumber ? (
                              <span className="rounded-full bg-white px-3 py-1 font-medium ring-1 ring-violet-100">
                                {tr('License:', 'Permis :')} {form.customerLicenseNumber}
                              </span>
                            ) : null}
                            {form.licenseDocumentName &&
                            form.licenseDocumentName.trim() !== `License ${form.customerLicenseNumber}`.trim() ? (
                              <span className="rounded-full bg-white px-3 py-1 font-medium ring-1 ring-violet-100">
                                {form.licenseDocumentName}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm leading-6 text-slate-600">
                        {tr('Finish your booking first, then sign in or create an account to upload your license before vehicle release.', "Finalisez d'abord votre réservation, puis connectez-vous ou créez un compte pour télécharger votre permis avant la remise du véhicule.")}
                      </p>
                    )}

                    {licenseStatusMessage ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {licenseStatusMessage}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                {isVerifiedAccount ? (
                  <div className="rounded-[22px] border border-emerald-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {tr('Your account is verified', 'Votre compte est vérifié')}
                      </p>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        {tr('Verified', 'Vérifié')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {tr(
                        'Your reservation is already secured with your verified profile.',
                        'Votre réservation est déjà sécurisée grâce à votre profil vérifié.'
                      )}
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {tr(
                        'No extra security step is needed before you confirm.',
                        "Aucune étape de sécurité supplémentaire n'est nécessaire avant de confirmer."
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{tr('Secure your booking (optional)', 'Sécurisez votre réservation (optionnel)')}</p>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {securityOptions.map((option) => {
                        const active = bookingSecurityOption === option.id;
                        const showOptionWarning = option.id === 'continue' && active;
                        return (
                          <div key={option.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setBookingSecurityOption(option.id);
                                if (option.id === 'scan_hold') {
                                  setShowLicenseSection(true);
                                }
                                if (option.id === 'deposit' || option.id === 'full') {
                                  setShowPaymentDetails(true);
                                } else {
                                  setShowPaymentDetails(false);
                                }
                              }}
                              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                                active
                                  ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-100'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? 'border-violet-500 bg-violet-500' : 'border-slate-300 bg-white'}`}>
                                <span className={`h-2.5 w-2.5 rounded-full bg-white ${active ? 'opacity-100' : 'opacity-0'}`} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{option.title}</span>
                                  {option.badge ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                      {option.badge}
                                    </span>
                                  ) : null}
                                </span>
                                {option.subtitle ? (
                                  <span className="mt-1 block text-xs text-slate-500">{option.subtitle}</span>
                                ) : null}
                              </span>
                            </button>

                            <div
                              className={`overflow-hidden transition-all duration-200 ease-out ${
                                showOptionWarning ? 'mt-2 max-h-40 opacity-100' : 'max-h-0 opacity-0'
                              }`}
                            >
                              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-left">
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-amber-900">
                                    {tr('Reservation not guaranteed', 'Réservation non garantie')}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">
                                    {tr(
                                      'This booking may be released at any time if not secured.',
                                      'Cette réservation peut être libérée à tout moment si elle n’est pas sécurisée.'
                                    )}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    {tr(
                                      'Scan your license or pay a deposit to secure your vehicle.',
                                      'Scannez votre permis ou payez un acompte pour sécuriser votre véhicule.'
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {!isVerifiedAccount && showOptionalPayment ? (
                  <div className="mt-4 rounded-[22px] border border-violet-100 bg-white p-4">
                    <button
                      type="button"
                      onClick={() => setShowPaymentDetails((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{tr('Send payment via bank transfer', 'Envoyer le paiement par virement bancaire')}</p>
                      </div>
                      <span className="text-sm font-semibold text-violet-700">
                        {showPaymentDetails ? tr('Hide ↑', 'Masquer ↑') : tr('Show payment details ↓', 'Voir les détails ↓')}
                      </span>
                    </button>

                    {showPaymentDetails ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Amount', 'Montant')}</p>
                          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                            {paymentAmount} {listing.currencyCode}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Transfer to this account', 'Virement vers ce compte')}</p>
                          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">RIB</p>
                          <p className="mt-1 break-all text-base font-bold text-slate-900">{BANK_TRANSFER_RIB}</p>
                        </div>

                        <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                          <p className="text-sm font-semibold text-slate-900">{tr('Scan to pay instantly', 'Scannez pour payer instantanément')}</p>
                          <img
                            src={BANK_TRANSFER_IMAGE_URL}
                            alt={tr('Bank transfer QR code', 'QR code de virement bancaire')}
                            className="mx-auto mt-4 w-full max-w-[240px] rounded-[20px] bg-white p-2 shadow-sm"
                          />
                          <p className="mt-3 text-sm text-slate-500">
                            {tr('Open your banking app and scan this QR code', 'Ouvrez votre application bancaire et scannez ce QR code')}
                          </p>
                        </div>

                        <p className="text-center text-xs text-slate-500">
                          {tr('Your booking will be confirmed after payment verification', 'Votre réservation sera confirmée après vérification du paiement')}
                        </p>

                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
              {bookingStatusMessage ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                  {bookingStatusMessage}
                </div>
              ) : null}
              <div className="h-8 sm:h-12" aria-hidden="true" />
            </form>
          )}
        </section>
      </div>
      {!success ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 backdrop-blur sm:px-4">
          <div className="mx-auto max-w-xl">
            <div className="mb-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-slate-500 sm:text-[12px]">
              <span className="whitespace-nowrap">✔ {tr('No account required', 'Aucun compte requis')}</span>
              <span className="hidden text-slate-300 sm:inline">•</span>
              <span className="whitespace-nowrap">✔ {tr('Instant confirmation', 'Confirmation instantanée')}</span>
            </div>
            <button
              form="instant-booking-form"
              type="submit"
              disabled={saving}
              className="flex min-h-[54px] w-full items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(91,33,182,0.24)] transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-base"
            >
              <span className="truncate">
                {saving
                  ? tr('Creating booking...', 'Création de la réservation...')
                  : `${showOptionalPayment ? tr('Confirm & send payment', 'Confirmer et envoyer le paiement') : tr('Confirm', 'Confirmer')} — ${selectedPackage.amount || 0} ${listing.currencyCode}`}
              </span>
            </button>
          </div>
        </div>
      ) : null}
      {showCertifiedInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" onClick={() => setShowCertifiedInfo(false)}>
          <div
            className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={CERTIFIED_BADGE_SRC}
                  alt={tr('Certified fleet', 'Flotte certifiée')}
                  className="h-14 w-14 object-contain"
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{tr('Certified fleet', 'Flotte certifiée')}</p>
                  <p className="mt-1 text-sm text-slate-500">{tr('Why this badge matters', 'Pourquoi ce badge compte')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertifiedInfo(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                aria-label={tr('Close certified fleet information', "Fermer les informations sur la flotte certifiée")}
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Direct booking from our managed fleet', '• Réservation directe depuis notre flotte gérée')}
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Verified pricing and package rules', '• Tarifs et règles de forfait vérifiés')}
              </div>
              <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
                {tr('• Pickup support from the local certified partner', '• Assistance de retrait par le partenaire certifié local')}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showDepositInfo ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-4 sm:items-center" onClick={() => setShowDepositInfo(false)}>
          <div
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">{tr('More info', "Plus d'infos")}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{tr('Damage deposit', 'Caution')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositInfo(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">
                {tr('Your deposit is returned at the end of the rental when the vehicle comes back in the same condition.', 'Votre caution est restituée à la fin de la location lorsque le véhicule revient dans le même état.')}
              </p>
              <p>
                {tr('This deposit covers any damage caused to the vehicle during your rental.', 'Cette caution couvre tout dommage causé au véhicule pendant votre location.')}
              </p>
              <p>
                {tr('Keep a copy of the vehicle video before departure as your condition record.', "Conservez une copie de la vidéo du véhicule avant le départ comme preuve de l'état.")}
              </p>
              <p>
                {tr('Registration and insurance papers stay under your responsibility during the rental.', "Les papiers d'immatriculation et d'assurance restent sous votre responsabilité pendant la location.")}
              </p>
              <p className="font-semibold text-slate-900">
                {tr('Lost papers may lead to a fine of up to 2,000 MAD.', "La perte de ces papiers peut entraîner une amende pouvant aller jusqu'à 2 000 MAD.")}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <EnhancedUnifiedIDScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onScanComplete={handleLicenseScanComplete}
        onImageSaved={handleLicenseScanComplete}
        title={tr('Scan driver license', 'Scanner le permis du conducteur')}
        autoProcessOnSelect={true}
        allowSaveWithoutOcr={isAuthenticated}
        saveWithoutOcrLabel={tr('Save image only', "Enregistrer l'image seulement")}
      />
    </div>
  );
};

export default PublicInstantBooking;
