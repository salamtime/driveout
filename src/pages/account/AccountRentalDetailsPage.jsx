import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import RentalThreadTimelineService from '../../services/RentalThreadTimelineService';
import MessageService from '../../services/MessageService';
import AccountRentalDetailDrawer from '../../components/account/AccountRentalDetailDrawer';
import MessageWidget from '../../components/messages/MessageWidget';
import AccountWorkspaceLoadingShell from '../../components/navigation/AccountWorkspaceLoadingShell';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { resolveReturnPath } from '../../utils/navigationReturn';

const AccountRentalDetailsPage = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { rentalId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rental, setRental] = useState(null);
  const [resolvedThreadKey, setResolvedThreadKey] = useState('');
  const [canonicalThreadStatus, setCanonicalThreadStatus] = useState('idle');
  const [threadResolutionError, setThreadResolutionError] = useState('');
  const currentUserLabel = String(
    user?.user_metadata?.full_name ||
    user?.user_metadata?.username ||
    user?.email ||
    'You'
  ).trim();
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });
  const backLink = resolveReturnPath(location, '/account/rentals');
  const normalizedRentalTimelineEvents = useMemo(
    () => RentalThreadTimelineService.buildTimeline(rental),
    [rental]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user || !rentalId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        setResolvedThreadKey('');
        setThreadResolutionError('');
        setCanonicalThreadStatus('idle');
        const detail = await CustomerExperienceService.getCustomerRentalDetail(user, rentalId);
        if (cancelled) return;
        setRental(detail);
        setLoading(false);

        const resolvedRentalId = String(detail?.id || rentalId || '').trim();
        if (!resolvedRentalId) {
          setResolvedThreadKey('');
          setCanonicalThreadStatus('missing');
          setThreadResolutionError(
            tr(
              'This rental does not have a stable context id yet, so the canonical thread could not be resolved.',
              'Cette location n’a pas encore d’identifiant de contexte stable, donc le fil canonique n’a pas pu être résolu.'
            )
          );
          return;
        }

        setCanonicalThreadStatus('loading');

        try {
          const threadResponse = await MessageService.getThreadByContext({
            contextType: 'rental',
            contextId: resolvedRentalId,
            threadType: 'rental_booking',
          });
          if (cancelled) return;

          const canonicalThread = threadResponse?.thread || null;
          if (canonicalThread?.thread_key) {
            setResolvedThreadKey(String(canonicalThread.thread_key).trim());
            setCanonicalThreadStatus('resolved');
            setThreadResolutionError('');
          } else {
            try {
              const ensuredThreadResponse = await MessageService.ensureThreadByContext({
                contextType: 'rental',
                contextId: resolvedRentalId,
                family: 'bookings',
                threadType: 'rental_booking',
                senderRole: 'customer',
                waitingOn: 'owner',
              });
              if (cancelled) return;

              const ensuredThreadKey = String(ensuredThreadResponse?.threadState?.thread_key || '').trim();
              if (ensuredThreadKey) {
                setResolvedThreadKey(ensuredThreadKey);
                setCanonicalThreadStatus('resolved');
                setThreadResolutionError('');
              } else {
                setResolvedThreadKey('');
                setCanonicalThreadStatus('missing');
                setThreadResolutionError(
                  tr(
                    'The rental detail is loaded, but its canonical conversation thread is not linked yet. Messaging will stay in temporary fallback mode until the real thread is available.',
                    'Le détail de la location est chargé, mais son fil de conversation canonique n’est pas encore lié. La messagerie restera en mode temporaire jusqu’à ce que le vrai fil soit disponible.'
                  )
                );
              }
            } catch (ensureThreadError) {
              if (cancelled) return;
              setResolvedThreadKey('');
              setCanonicalThreadStatus('missing');
              setThreadResolutionError(
                ensureThreadError?.message || tr(
                  'The rental detail is loaded, but its canonical conversation thread is not linked yet. Messaging will stay in temporary fallback mode until the real thread is available.',
                  'Le détail de la location est chargé, mais son fil de conversation canonique n’est pas encore lié. La messagerie restera en mode temporaire jusqu’à ce que le vrai fil soit disponible.'
                )
              );
            }
          }
        } catch (threadError) {
          if (cancelled) return;
          setResolvedThreadKey('');
          setCanonicalThreadStatus('missing');
          setThreadResolutionError(
            threadError?.message || tr(
              'The rental detail loaded, but the canonical conversation thread could not be resolved right now.',
              'Le détail de la location est chargé, mais le fil de conversation canonique n’a pas pu être résolu pour le moment.'
            )
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load rental details right now.', 'Impossible de charger les détails de location pour le moment.'));
          setRental(null);
          setResolvedThreadKey('');
          setCanonicalThreadStatus('missing');
          setThreadResolutionError('');
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, rentalId, isFrench]);

  if (loading && suppressBlockingLoader) {
    return <AccountWorkspaceLoadingShell cardCount={1} showStatsRow={false} />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {threadResolutionError && !error ? (
        <section className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {threadResolutionError}
        </section>
      ) : null}

      <AccountRentalDetailDrawer
        rental={rental}
        loading={loading}
        variant="page"
        onBack={() => navigate(backLink)}
      />

      {rental ? (
        <MessageWidget
          threadId={resolvedThreadKey}
          contextType="rental"
          contextId={String(rental?.id || rentalId || '')}
          contextLabel={tr('Rental', 'Location')}
          contextTitle={rental?.modelName || rental?.rentalId || tr('Rental conversation', 'Conversation location')}
          contextSubtitle={tr('Booking updates in context', 'Mises à jour de réservation dans le contexte')}
          contextStatus={rental?.status || ''}
          family="bookings"
          threadType="rental_booking"
          currentUserId={user?.id}
          currentUserLabel={currentUserLabel}
          currentSenderRole="customer"
          isFrench={isFrench}
          tr={tr}
          threadContextData={rental}
          fallbackTimelineEvents={normalizedRentalTimelineEvents}
          seedThread={{
            id: `rental-${rental?.id || rentalId}`,
            thread_key: '',
            family: 'bookings',
            thread_type: 'rental_booking',
            entity_type: 'rental',
            entity_id: String(rental?.id || rentalId || ''),
            subject: rental?.modelName || rental?.rentalId || 'Rental booking',
            metadata: {
              href: `/account/rentals/${encodeURIComponent(String(rental?.id || rentalId || ''))}`,
              canonicalThreadStatus,
              canonicalThreadMissing: canonicalThreadStatus === 'missing',
            },
            timeline_events: normalizedRentalTimelineEvents,
            messages: [],
          }}
        />
      ) : null}
    </div>
  );
};

export default AccountRentalDetailsPage;
