import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PublicCatalogService from '../services/PublicCatalogService';
import PublicBookingService from '../services/PublicBookingService';
import VerificationService from '../services/VerificationService';
import CustomerExperienceService from '../services/CustomerExperienceService';
import PhoneInputWithCountryCode from '../components/forms/PhoneInputWithCountryCode';
import GrowthLoopApiService from '../services/GrowthLoopApiService';
import { buildMarketplaceRequestPath } from '../utils/marketplaceShareLinks';
import {
  getMarketplaceRequestDisplay,
  isTerminalMarketplaceRequestStatus,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../utils/marketplaceRequestState';
import { markMarketplaceListingRequested } from '../utils/marketplaceRequestCache';
import { getMarketplaceWalletGuidance } from '../utils/marketplaceUiGuidance';

const SHARE_ATTRIBUTION_KEY = 'saharax_share_attribution';

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const buildHalfDayHourOptions = (listing) => {
  const min = Number(listing?.halfDayMinHours || 0) || 4;
  const max = Number(listing?.halfDayMaxHours || 0) || Math.max(min, 5);
  const options = [];

  for (let value = min; value <= max; value += 1) {
    options.push(value);
  }

  return options;
};

const getVerificationStatus = (userProfile, user) =>
  String(
    userProfile?.verificationStatus ||
      user?.user_metadata?.verification_status ||
      user?.app_metadata?.verification_status ||
      ''
  )
    .trim()
    .toLowerCase();

const PublicBookingRequest = ({ embeddedInAccount = false, accountBasePath = '/account/marketplace' }) => {
  const { listingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [existingRequest, setExistingRequest] = useState(null);
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [existingRequestLoading, setExistingRequestLoading] = useState(false);
  const [accountSnapshot, setAccountSnapshot] = useState(null);
  const [form, setForm] = useState({
    customerName: userProfile?.fullName || user?.user_metadata?.full_name || '',
    customerEmail: user?.email || '',
    customerPhone: userProfile?.phone || user?.user_metadata?.phone || '',
    startDate: '',
    startTime: '10:00',
    rentalType: 'daily',
    duration: 1,
    message: '',
  });
  const isMarketplaceRoute = location.pathname.startsWith('/marketplace');
  const detailHref = listing
    ? listing.inventorySource === 'marketplace' || isMarketplaceRoute
      ? (embeddedInAccount ? `${accountBasePath}/${listing.id}` : `/marketplace/${listing.id}`)
      : `/rent/${listing.id}`
    : isMarketplaceRoute || embeddedInAccount ? accountBasePath : '/rent';
  const browseHref = isMarketplaceRoute || embeddedInAccount ? accountBasePath : '/rent';
  const translate = (en, fr) => en || fr;
  const isOwnerViewingOwnListing = Boolean(user?.id && listing?.ownerId && String(user.id) === String(listing.ownerId));
  const returnPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
  const minimumBookingHours = Number(listing?.minimumBookingHours ?? listing?.minimum_booking_hours ?? 0) || 0;
  const halfDayHourOptions = buildHalfDayHourOptions(listing);
  const verificationStatus = String(
    verificationSummary?.status || getVerificationStatus(userProfile, user)
  ).trim().toLowerCase();
  const isVerifiedAccount = Boolean(user?.id) && (
    verificationSummary?.complete === true ||
    ['approved', 'verified'].includes(verificationStatus)
  );

  useEffect(() => {
    let active = true;

    const loadListing = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await PublicCatalogService.getListingById(listingId);
        if (!active) return;
        if (!data) {
          setError('This listing could not be found.');
          return;
        }
        setListing(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.message || 'Failed to load request listing.');
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
        setVerificationLoading(false);
        return;
      }

      try {
        setVerificationLoading(true);
        const result = await VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true });
        if (active) {
          setVerificationSummary(result?.summary || null);
        }
      } catch {
        if (active) {
          setVerificationSummary(null);
        }
      } finally {
        if (active) {
          setVerificationLoading(false);
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

    const loadAccountSnapshot = async () => {
      if (!user?.id) {
        setAccountSnapshot(null);
        return;
      }

      try {
        const result = await CustomerExperienceService.getCustomerAccountSnapshot(user, { forceRefresh: true });
        if (active) {
          setAccountSnapshot(result || null);
        }
      } catch {
        if (active) {
          setAccountSnapshot(null);
        }
      }
    };

    void loadAccountSnapshot();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    const loadExistingRequest = async () => {
      if (!user?.id || !listing?.id || isOwnerViewingOwnListing) {
        setExistingRequest(null);
        setExistingRequestLoading(false);
        return;
      }

      try {
        setExistingRequestLoading(true);
        const result = await PublicBookingService.getExistingMarketplaceRequest(
          listing?.sourceId || listing?.id,
          listing?.id
        );
        if (active) {
          setExistingRequest(result || null);
        }
      } catch {
        if (active) {
          setExistingRequest(null);
        }
      } finally {
        if (active) {
          setExistingRequestLoading(false);
        }
      }
    };

    void loadExistingRequest();

    return () => {
      active = false;
    };
  }, [isOwnerViewingOwnListing, listing?.id, user?.id]);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  useEffect(() => {
    if (!listing) return;
    if (form.rentalType !== 'hourly' || minimumBookingHours <= 1) return;
    if (Number(form.duration || 1) >= minimumBookingHours) return;
    setForm((current) => ({
      ...current,
      duration: minimumBookingHours,
    }));
  }, [form.duration, form.rentalType, listing, minimumBookingHours]);

  useEffect(() => {
    if (!listing) return;

    setForm((current) => {
      const nextRentalType = current.rentalType === 'half_day' || current.rentalType === 'daily'
        ? current.rentalType
        : listing?.halfDayPrice
          ? 'half_day'
          : 'daily';

      const nextDuration = nextRentalType === 'half_day'
        ? Math.max(halfDayHourOptions[0] || 4, Number(current.duration || 0) || 0)
        : Math.max(1, Number(current.duration || 1) || 1);

      if (nextRentalType === current.rentalType && nextDuration === current.duration) {
        return current;
      }

      return {
        ...current,
        rentalType: nextRentalType,
        duration: nextDuration,
      };
    });
  }, [halfDayHourOptions, listing]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const startDate = String(params.get('startDate') || '').trim();
    const startTime = String(params.get('startTime') || '').trim();
    const rentalType = String(params.get('rentalType') || '').trim();
    const duration = Number(params.get('duration') || 0);
    const start = String(params.get('start') || '').trim();
    const end = String(params.get('end') || '').trim();

    const parsedStart = start ? new Date(start) : null;
    const parsedEnd = end ? new Date(end) : null;
    const safeParsedStart = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
    const safeParsedEnd = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
    const derivedStartDate = safeParsedStart ? safeParsedStart.toISOString().slice(0, 10) : '';
    const derivedStartTime = safeParsedStart ? safeParsedStart.toISOString().slice(11, 16) : '';
    const derivedDurationHours =
      safeParsedStart && safeParsedEnd
        ? Math.max(1, Math.round((safeParsedEnd.getTime() - safeParsedStart.getTime()) / (1000 * 60 * 60)))
        : 0;

    setForm((current) => ({
      ...current,
      startDate: startDate || derivedStartDate || current.startDate,
      startTime: startTime || derivedStartTime || current.startTime,
      rentalType: rentalType || current.rentalType,
      duration: duration > 0 ? duration : derivedDurationHours > 0 ? derivedDurationHours : current.duration,
    }));
  }, [location.search]);

  const requestResumePath = useMemo(() => {
    if (!listing?.id) return returnPath;

    const params = {
      source: 'verification-gate',
      startDate: form.startDate,
      startTime: form.startTime,
      rentalType: form.rentalType,
      duration: form.duration,
      vehicleId: listing.vehicleId || listing.vehiclePublicProfileId || '',
    };

    if (form.startDate && form.startTime) {
      const startValue = new Date(`${form.startDate}T${form.startTime}`);
      if (!Number.isNaN(startValue.getTime())) {
        params.start = startValue.toISOString();
        const endValue = new Date(startValue);
        if (form.rentalType === 'half_day') {
          endValue.setHours(endValue.getHours() + Number(form.duration || 0));
        } else {
          endValue.setDate(endValue.getDate() + Number(form.duration || 0));
        }
        params.end = endValue.toISOString();
      }
    }

    return buildMarketplaceRequestPath(listing.id, params);
  }, [form.duration, form.rentalType, form.startDate, form.startTime, listing?.id, listing?.vehicleId, listing?.vehiclePublicProfileId, returnPath]);
  const submitErrorHelper = useMemo(
    () =>
      getMarketplaceWalletGuidance(error, {
        tr: translate,
        locale: 'en',
        returnTo: requestResumePath || returnPath,
      }),
    [error, requestResumePath, returnPath]
  );
  const wallet = accountSnapshot?.wallet || CustomerExperienceService.getEmptyWallet();
  const requiredDepositAmount = Math.max(
    0,
    Number(listing?.depositAmount || listing?.deposit_amount || listing?.raw?.deposit_amount || 0)
  );
  const walletBalance = Math.max(0, Number(wallet?.balance || 0));
  const walletVerificationState = String(wallet?.verificationState || 'not_active').trim().toLowerCase();
  const walletPreflightHelper = useMemo(() => {
    if (!user?.id || !isVerifiedAccount || requiredDepositAmount <= 0) return null;

    if (!wallet?.id) {
      return {
        title: 'Open wallet before sending the request',
        body: `This vehicle requires ${requiredDepositAmount} MAD in wallet balance to cover the damage deposit before you can send the request.`,
        actionLabel: 'Open wallet',
        actionHref: '/account/revenue',
        actionState: requestResumePath ? { from: requestResumePath } : undefined,
      };
    }

    if (walletVerificationState === 'restricted') {
      return {
        title: 'Resolve your wallet before sending the request',
        body: 'Your wallet is restricted right now. Open Wallet to fix the issue before sending this request.',
        actionLabel: 'Open wallet',
        actionHref: '/account/revenue',
        actionState: requestResumePath ? { from: requestResumePath } : undefined,
      };
    }

    if (walletBalance < requiredDepositAmount) {
      return {
        title: 'Add funds before sending the request',
        body: `You need ${requiredDepositAmount} MAD in your wallet to cover the damage deposit for this vehicle.`,
        actionLabel: 'Open wallet',
        actionHref: '/account/revenue',
        actionState: requestResumePath ? { from: requestResumePath } : undefined,
      };
    }

    return null;
  }, [isVerifiedAccount, requestResumePath, requiredDepositAmount, user?.id, wallet?.id, walletBalance, walletVerificationState]);

  const handleVerificationRedirect = () => {
    navigate('/account/verification', {
      state: {
        from: requestResumePath,
        resumeBookingFlow: 'marketplace_request',
        bookingContext: {
          listingId: listing?.id || '',
          vehicleId: listing?.vehicleId || listing?.vehiclePublicProfileId || '',
          startDate: form.startDate,
          endDate: '',
        },
      },
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!listing) return;
    if (!isVerifiedAccount) {
      setError('');
      handleVerificationRedirect();
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await PublicBookingService.createMarketplaceRequest({
        listing,
        userId: userProfile?.id || user?.id || null,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        startDate: form.startDate,
        startTime: form.startTime,
        duration: form.duration,
        rentalType: form.rentalType,
        message: form.message,
      });

      try {
        const storedAttribution = JSON.parse(window.localStorage.getItem(SHARE_ATTRIBUTION_KEY) || '{}');
        if (storedAttribution?.type === 'boost' && storedAttribution?.code) {
          await GrowthLoopApiService.trackBooking({
            code: storedAttribution.code,
            bookingRequestId: result?.id,
            listingId: listing?.id,
          });
        }
      } catch (trackingError) {
        console.warn('Unable to attribute booking to boost link:', trackingError);
      }

      if (result?.duplicate_request_blocked) {
        setExistingRequest(result);
        setSuccess(null);
      } else {
        setSuccess(result);
        setExistingRequest(result || null);
      }

      const cachePayload = {
        listingId: listing?.id,
        requestId: result?.id,
        status: result?.request_status || result?.requestStatus || 'requested',
      };

      const cacheListingIds = [
        listing?.id,
        listing?.sourceId,
        result?.listing_id,
        result?.vehicle_public_profile_id,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const cacheIdentities = [
        userProfile?.id || '',
        user?.id || '',
        userProfile?.email || '',
        user?.email || '',
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

      cacheIdentities.forEach((identity) => {
        cacheListingIds.forEach((cachedListingId) => {
          markMarketplaceListingRequested({
            userId: identity,
            ...cachePayload,
            listingId: cachedListingId,
          });
        });
      });
    } catch (submitError) {
      setError(submitError?.message || 'Unable to send booking request right now.');
    } finally {
      setSaving(false);
    }
  };

  const effectiveExistingRequest = isTerminalMarketplaceRequestStatus(existingRequest) ? null : existingRequest;
  const existingRequestStatus = normalizeMarketplaceRequestLifecycleStatus(effectiveExistingRequest || '');
  const existingRequestDisplay = effectiveExistingRequest ? getMarketplaceRequestDisplay(existingRequestStatus) : null;
  const existingRequestHref = effectiveExistingRequest?.id
    ? `/account/messages?requestId=${encodeURIComponent(String(effectiveExistingRequest.id))}`
    : '';
  const isResolvingBookingAccess = Boolean(user?.id && !isOwnerViewingOwnListing && (verificationLoading || existingRequestLoading));

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-14">
        <div className="mx-auto max-w-6xl animate-pulse rounded-[32px] border border-slate-200 bg-white p-8">
          <div className="h-64 rounded-[28px] bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6 py-14">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-rose-700">
          <h1 className="text-2xl font-semibold text-rose-900">Request unavailable</h1>
          <p className="mt-3">{error}</p>
          <Link to={browseHref} className="mt-6 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white">
            Back to browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to={detailHref}
            className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 transition hover:text-violet-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to listing
          </Link>
          <span className="rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-black text-violet-700 shadow-sm sm:text-sm">
            {listing.badge}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <aside className="space-y-6">
            <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-[0_20px_60px_rgba(79,70,229,0.08)]">
              <div className="bg-white px-4 py-5">
                <img
                  src={listing.imageUrl}
                  alt={listing.title}
                  className="mx-auto h-72 w-full max-w-[440px] object-contain sm:h-80 lg:h-[22rem]"
                />
              </div>
              <div className="space-y-5 border-t border-violet-50 p-5 sm:p-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-500">{listing.category}</p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{listing.title}</h1>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-violet-50 px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">Price</p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {listing.dailyPrice || listing.halfDayPrice || 0} {listing.currencyCode}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Flow</p>
                    <p className="mt-1 text-lg font-black text-slate-950">Owner review</p>
                  </div>
                </div>
                <p className="line-clamp-5 text-sm leading-7 text-slate-600">{listing.description}</p>
              </div>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_24px_70px_rgba(79,70,229,0.08)] sm:p-8">
            <div className="mb-7">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-500">Booking request</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Request this vehicle</h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Choose your date and send it to the owner for approval.
              </p>
            </div>

            {isOwnerViewingOwnListing ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
                <h3 className="text-2xl font-semibold text-emerald-900">This is your listing</h3>
                <p className="mt-3 text-sm leading-6 text-emerald-800">
                  Your own marketplace vehicle should be managed from your owner workspace, not requested as a customer booking.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to={
                      listing?.vehiclePublicProfileId
                        ? `/account/vehicles/${encodeURIComponent(String(listing.vehiclePublicProfileId))}/profile?tab=listing`
                        : accountBasePath
                    }
                    state={{ from: returnPath }}
                    className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
                  >
                    Open My Vehicles
                  </Link>
                  <Link to={detailHref} className="rounded-full border border-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-800">
                    Back to listing
                  </Link>
                </div>
              </div>
            ) : success ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
                <h3 className="text-2xl font-semibold text-emerald-900">Request sent</h3>
                <p className="mt-3 text-sm text-emerald-800">
                  Your request was submitted successfully. Reference: <span className="font-semibold">{success.request_reference || success.reference || success.id}</span>
                </p>
                <div className="mt-5 grid gap-3 rounded-3xl bg-white/70 p-4 text-sm text-emerald-900 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Status</p>
                    <p className="mt-1 font-semibold">Pending owner review</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Requested</p>
                    <p className="mt-1 font-semibold">{formatDateTime(success.requested_start_at)} → {formatDateTime(success.requested_end_at)}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to={browseHref} className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">
                    Back to browse
                  </Link>
                  {!user?.id ? (
                    <Link to="/login" className="rounded-full border border-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-800">
                      Sign in to follow up
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : effectiveExistingRequest ? (
              <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
                <h3 className="text-2xl font-semibold text-amber-950">Request already sent</h3>
                <p className="mt-3 text-sm text-amber-900">
                  You already have an open request for this vehicle. We kept the existing booking timeline instead of creating a duplicate.
                </p>
                <div className="mt-5 grid gap-3 rounded-3xl bg-white/70 p-4 text-sm text-amber-950 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Status</p>
                    <p className="mt-1 font-semibold">{existingRequestDisplay?.label || 'Requested'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Requested</p>
                    <p className="mt-1 font-semibold">
                      {formatDateTime(effectiveExistingRequest?.requested_start_at || effectiveExistingRequest?.requestedStartAt)} → {formatDateTime(effectiveExistingRequest?.requested_end_at || effectiveExistingRequest?.requestedEndAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {existingRequestHref ? (
                    <Link to={existingRequestHref} className="rounded-full bg-amber-700 px-5 py-3 text-sm font-semibold text-white">
                      Open in messages
                    </Link>
                  ) : null}
                  <Link to={detailHref} className="rounded-full border border-amber-300 px-5 py-3 text-sm font-semibold text-amber-900">
                    Back to listing
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 pb-4 sm:pb-0">
                {!isVerifiedAccount && !isResolvingBookingAccess ? (
                  <div className="rounded-[28px] border border-violet-200 bg-violet-50 p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">Verification required</p>
                    <h3 className="text-2xl font-semibold text-violet-950">Verify your account to request this vehicle</h3>
                    <p className="mt-3 text-sm leading-6 text-violet-800">
                      This helps owners trust your booking.
                    </p>
                    <button
                      type="button"
                      onClick={handleVerificationRedirect}
                      className="mt-5 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white"
                    >
                      Verify now
                    </button>
                  </div>
                ) : null}

                {walletPreflightHelper ? (
                  <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Wallet required</p>
                    <h3 className="mt-2 text-2xl font-semibold text-amber-950">{walletPreflightHelper.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-amber-800">
                      {walletPreflightHelper.body}
                    </p>
                    <Link
                      to={walletPreflightHelper.actionHref}
                      state={walletPreflightHelper.actionState}
                      className="mt-5 inline-flex rounded-full bg-amber-700 px-6 py-3 text-sm font-semibold text-white"
                    >
                      {walletPreflightHelper.actionLabel}
                    </Link>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Full name</span>
                    <input value={form.customerName} onChange={(e) => updateField('customerName', e.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Email</span>
                    <input type="email" value={form.customerEmail} onChange={(e) => updateField('customerEmail', e.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <div>
                    <PhoneInputWithCountryCode
                      value={form.customerPhone}
                      onChange={(value) => updateField('customerPhone', value)}
                      tr={translate}
                      label="Phone"
                    />
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Rental type</span>
                    <select value={form.rentalType} onChange={(e) => updateField('rentalType', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                      <option value="daily">Daily</option>
                      <option value="half_day">Half-day package</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Requested start date</span>
                    <input type="date" value={form.startDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => updateField('startDate', e.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-700">Requested start time</span>
                    <input type="time" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-bold text-slate-700">{form.rentalType === 'half_day' ? 'Half-day hours' : 'Requested days'}</span>
                    {form.rentalType === 'half_day' ? (
                      <span className="block text-xs font-semibold text-slate-500">
                        Owner half-day window: {halfDayHourOptions[0] || 4}-{halfDayHourOptions[halfDayHourOptions.length - 1] || 5} hours.
                      </span>
                    ) : null}
                    <select value={form.duration} onChange={(e) => updateField('duration', Number(e.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                      {(form.rentalType === 'half_day'
                        ? halfDayHourOptions
                        : [1, 2, 3, 4, 5, 7]
                      ).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-bold text-slate-700">Message to owner/operator</span>
                    <textarea value={form.message} onChange={(e) => updateField('message', e.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Pickup preference, experience level, or anything that helps the owner review this request faster." />
                  </label>
                </div>

                {error ? (
                  submitErrorHelper ? (
                    <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950">
                      <p className="text-sm font-bold">{submitErrorHelper.title}</p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">{submitErrorHelper.body}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {submitErrorHelper.actionHref ? (
                          <Link
                            to={submitErrorHelper.actionHref}
                            state={submitErrorHelper.actionState}
                            className="inline-flex items-center justify-center rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
                          >
                            {submitErrorHelper.actionLabel}
                          </Link>
                        ) : null}
                        <p className="text-xs font-medium text-amber-700">{submitErrorHelper.rawMessage}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )
                ) : null}

                <div className="sticky bottom-3 z-30 flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white/95 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur sm:static sm:flex-row sm:items-center sm:justify-between sm:bg-slate-50 sm:px-6 sm:py-5 sm:shadow-none">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Request type</p>
                    <p className="mt-1 text-lg font-black text-slate-950 sm:mt-2 sm:text-xl">Marketplace review</p>
                  </div>
                  <button type="submit" disabled={saving || Boolean(walletPreflightHelper) || isResolvingBookingAccess} className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 text-sm font-black text-white shadow-[0_18px_36px_rgba(79,70,229,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-full">
                    {saving
                      ? 'Sending request...'
                      : isResolvingBookingAccess
                        ? 'Checking your booking access...'
                        : isVerifiedAccount
                          ? 'Request booking'
                          : 'Complete verification'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default PublicBookingRequest;
