import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, EyeOff, Flag, Star } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import RentalReviewService from '../../services/RentalReviewService';
import RentalReviewComposer from '../../components/account/RentalReviewComposer';
import { Textarea } from '../../components/ui/textarea';

const formatDateTime = (value, locale = 'en') => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const ReviewsAdminPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('published');
  const [reviews, setReviews] = useState([]);
  const [pendingReviewTasks, setPendingReviewTasks] = useState([]);
  const [busyReviewId, setBusyReviewId] = useState('');
  const [moderationNotes, setModerationNotes] = useState({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [response, pendingResponse] = await Promise.all([
          RentalReviewService.getModerationQueue({ status: statusFilter }),
          RentalReviewService.getPendingReviews().catch(() => ({ tasks: [] })),
        ]);
        if (cancelled) return;
        setReviews(Array.isArray(response?.reviews) ? response.reviews : []);
        setPendingReviewTasks(Array.isArray(pendingResponse?.tasks) ? pendingResponse.tasks : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Unable to load reviews right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const counts = useMemo(() => (
    reviews.reduce((acc, review) => {
      const key = String(review?.review_status || 'published').trim().toLowerCase() || 'published';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  ), [reviews]);

  const handleModerate = async (reviewId, reviewStatus) => {
    try {
      setBusyReviewId(reviewId);
      const response = await RentalReviewService.moderateReview({
        reviewId,
        reviewStatus,
        moderationReason: moderationNotes[reviewId] || '',
      });
      const updated = response?.review || null;
      setReviews((current) => current.map((row) => (
        String(row?.id || '') === String(reviewId) && updated ? updated : row
      )));
    } catch (moderateError) {
      setError(moderateError?.message || 'Unable to update review status.');
    } finally {
      setBusyReviewId('');
    }
  };

  return (
    <div className="space-y-6">
      <AdminModuleHero
        eyebrow="Marketplace Review"
        title="Rental Reviews"
        description="Moderate owner ratings, hide low-signal reviews, and keep pending post-rental reviews moving."
      />

      <section className="rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,_rgba(255,251,235,1)_0%,_rgba(255,255,255,1)_100%)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">After-completion prompts</p>
            <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">
              {pendingReviewTasks.length
                ? `${pendingReviewTasks.length} review${pendingReviewTasks.length > 1 ? 's' : ''} waiting on you`
                : 'No reviews are waiting on you right now'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Completed rentals surface here automatically so owners and staff can rate customers without hunting through the rental list.
            </p>
          </div>
          <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-800">
            Pending {pendingReviewTasks.length}
          </span>
        </div>

        {pendingReviewTasks.length ? (
          <div className="mt-5 space-y-4">
            {pendingReviewTasks.map((task) => (
              <RentalReviewComposer
                key={`${task.rentalId}-${task.revieweeUserId}-${task.reviewerRole}`}
                task={task}
                tr={(en, fr) => en}
                compact
                defaultExpanded={pendingReviewTasks.length === 1}
                onSubmitted={(_, submittedTask) => {
                  setPendingReviewTasks((current) =>
                    current.filter((row) => !(
                      String(row?.rentalId || '') === String(submittedTask?.rentalId || '') &&
                      String(row?.revieweeUserId || '') === String(submittedTask?.revieweeUserId || '') &&
                      String(row?.reviewerRole || '') === String(submittedTask?.reviewerRole || '') &&
                      String(row?.revieweeRole || '') === String(submittedTask?.revieweeRole || '')
                    ))
                  );
                }}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {['published', 'flagged', 'hidden', 'removed', 'all'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                statusFilter === status
                  ? 'bg-violet-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              {status} {status !== 'all' ? `(${counts[status] || 0})` : ''}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading reviews…</div>
        ) : reviews.length ? (
          reviews.map((review) => (
            <article key={review.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {Number(review?.rating || 0).toFixed(1)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {review?.review_status || 'published'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {review?.reviewer_role} → {review?.reviewee_role}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-500">
                    Rental {String(review?.rental_id || '').slice(0, 8)} • {formatDateTime(review?.created_at)}
                  </p>
                  <p className="mt-3 text-sm text-slate-700">
                    {review?.comment || 'No written comment on this review.'}
                  </p>
                  <div className="mt-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Moderation note
                    </label>
                    <Textarea
                      value={moderationNotes[review.id] ?? review?.moderation_reason ?? ''}
                      onChange={(event) => setModerationNotes((current) => ({
                        ...current,
                        [review.id]: event.target.value,
                      }))}
                      className="mt-2 min-h-[88px] rounded-2xl border-slate-200 bg-slate-50"
                      placeholder="Why was this review published, flagged, hidden, or removed?"
                      maxLength={500}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => handleModerate(review.id, 'published')}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => handleModerate(review.id, 'flagged')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700"
                  >
                    <Flag className="h-4 w-4" />
                    Flag
                  </button>
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => handleModerate(review.id, 'hidden')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    <EyeOff className="h-4 w-4" />
                    Hide
                  </button>
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => handleModerate(review.id, 'removed')}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            No reviews match this filter right now.
          </div>
        )}
      </section>
    </div>
  );
};

export default ReviewsAdminPage;
