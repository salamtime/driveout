import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Star } from 'lucide-react';
import RentalReviewService from '../../services/RentalReviewService';
import { Textarea } from '../ui/textarea';

const buildTaskTitle = (task, tr) => {
  if (task?.revieweeRole === 'owner') {
    return tr('Rate your rental experience', 'Notez votre expérience de location');
  }

  return tr('Rate this customer', 'Notez ce client');
};

const buildTaskSubtitle = (task, tr) => {
  if (task?.revieweeRole === 'owner') {
    return tr(
      'Your rating and comment can appear on the owner marketplace profile.',
      'Votre note et votre commentaire peuvent apparaître sur le profil marketplace du propriétaire.'
    );
  }

  return tr(
    'This review stays internal and helps your team track customer trust.',
    'Cet avis reste interne et aide votre équipe à suivre la fiabilité du client.'
  );
};

const buildVisibilityLabel = (task, tr) => (
  task?.revieweeRole === 'owner'
    ? tr('Public owner review', 'Avis public propriétaire')
    : tr('Private internal review', 'Avis interne privé')
);

const RentalReviewComposer = ({
  task,
  tr,
  onSubmitted,
  defaultExpanded = false,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const title = useMemo(() => buildTaskTitle(task, tr), [task, tr]);
  const subtitle = useMemo(() => buildTaskSubtitle(task, tr), [task, tr]);
  const visibilityLabel = useMemo(() => buildVisibilityLabel(task, tr), [task, tr]);

  if (!task) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setSubmitError(tr('Choose a star rating first.', 'Choisissez une note en étoiles d’abord.'));
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');
      setSuccessMessage('');

      const response = await RentalReviewService.createReview({
        rentalId: task.rentalId,
        marketplaceRequestId: task.marketplaceRequestId || null,
        rating,
        comment,
      });

      setSuccessMessage(
        tr('Review saved successfully.', 'Avis enregistré avec succès.')
      );
      setExpanded(false);

      if (typeof onSubmitted === 'function') {
        onSubmitted(response?.review || null, task);
      }
    } catch (error) {
      setSubmitError(
        error?.message || tr('Unable to save the review right now.', 'Impossible d’enregistrer l’avis pour le moment.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={`rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(135deg,_rgba(255,251,235,1)_0%,_rgba(255,255,255,1)_100%)] ${
      compact ? 'p-4' : 'p-5 sm:p-6'
    } shadow-[0_16px_40px_rgba(245,158,11,0.08)]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              {tr('Review pending', 'Avis en attente')}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
              {visibilityLabel}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-black tracking-[-0.03em] text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          {task?.rentalLabel ? (
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {tr('Rental', 'Location')}: {task.rentalLabel}
            </p>
          ) : null}
          {task?.customerName && task?.revieweeRole === 'customer' ? (
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {tr('Customer', 'Client')}: {task.customerName}
            </p>
          ) : null}
        </div>

        {!successMessage ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            {expanded ? tr('Hide form', 'Masquer le formulaire') : tr('Leave review', 'Laisser un avis')}
          </button>
        ) : null}
      </div>

      {successMessage ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{successMessage}</p>
        </div>
      ) : null}

      {submitError ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

      {expanded && !successMessage ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{tr('Your rating', 'Votre note')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                      active
                        ? 'border-amber-300 bg-amber-100 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-amber-200 hover:text-amber-600'
                    }`}
                    aria-label={`${value} star${value > 1 ? 's' : ''}`}
                  >
                    <Star className={`h-5 w-5 ${active ? 'fill-current' : ''}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-slate-900" htmlFor={`review-comment-${task.rentalId}`}>
              {tr('Comment (optional)', 'Commentaire (optionnel)')}
            </label>
            <Textarea
              id={`review-comment-${task.rentalId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="mt-2 min-h-[110px] rounded-2xl border-slate-200 bg-white"
              placeholder={
                task?.revieweeRole === 'owner'
                  ? tr('Share what went well and what could improve.', 'Partagez ce qui s’est bien passé et ce qui peut être amélioré.')
                  : tr('Add a short private note about this customer.', 'Ajoutez une courte note privée sur ce client.')
              }
              maxLength={1000}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(91,33,182,0.24)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? tr('Saving...', 'Enregistrement...') : tr('Submit review', 'Envoyer l’avis')}
            </button>
            <p className="text-xs font-semibold text-slate-500">{visibilityLabel}</p>
          </div>
        </form>
      ) : null}
    </section>
  );
};

export default RentalReviewComposer;
