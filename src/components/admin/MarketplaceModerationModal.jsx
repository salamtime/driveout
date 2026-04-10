import React, { useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import i18n from '../../i18n';

const baseInputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100';

const actionCopy = {
  reject: {
    title: ['Reject listing', 'Refuser le listing'],
    primary: ['Reject listing', 'Refuser le listing'],
    reasonLabel: ['Reason', 'Raison'],
    reasonPlaceholder: ['Explain why this listing cannot move forward right now.', "Expliquez pourquoi ce listing ne peut pas avancer pour le moment."],
    feedbackLabel: ['Suggestions for owner', 'Suggestions pour le proprietaire'],
    feedbackPlaceholder: ['Tell the owner what to improve before resubmitting.', "Indiquez au proprietaire quoi ameliorer avant de resoumettre."],
    messageLabel: ['Message to owner', 'Message au proprietaire'],
    messagePlaceholder: ['Optional message that will appear in the owner workspace.', "Message optionnel qui apparaitra dans l'espace proprietaire."],
    reasonRequired: true,
    sendDefault: true,
  },
  request_changes: {
    title: ['Request changes', 'Demander des modifications'],
    primary: ['Send change request', 'Envoyer la demande'],
    reasonLabel: ['What needs to change?', 'Que faut-il modifier ?'],
    reasonPlaceholder: ['Highlight the core issue that blocks approval.', "Mettez en avant le point principal qui bloque l'approbation."],
    feedbackLabel: ['Improvement guidance', "Conseils d'amelioration"],
    feedbackPlaceholder: ['Be specific so the owner can update the listing quickly.', 'Soyez precis pour que le proprietaire puisse corriger rapidement.'],
    messageLabel: ['Message to owner', 'Message au proprietaire'],
    messagePlaceholder: ['Optional message shown directly in the owner workspace.', "Message optionnel affiche directement dans l'espace proprietaire."],
    reasonRequired: true,
    sendDefault: true,
  },
  message_owner: {
    title: ['Message owner', 'Message au proprietaire'],
    primary: ['Send message', 'Envoyer le message'],
    reasonLabel: ['Internal topic', 'Sujet interne'],
    reasonPlaceholder: ['Optional label for this moderation note.', 'Etiquette optionnelle pour cette note de moderation.'],
    feedbackLabel: ['Admin note', 'Note admin'],
    feedbackPlaceholder: ['Optional note for internal moderation history.', 'Note optionnelle pour l’historique de moderation.'],
    messageLabel: ['Message body', 'Contenu du message'],
    messagePlaceholder: ['Write the message the owner should receive.', 'Ecrivez le message que le proprietaire doit recevoir.'],
    reasonRequired: false,
    sendDefault: true,
  },
};

const MarketplaceModerationModal = ({
  mode,
  open,
  loading,
  onClose,
  onSubmit,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const copy = useMemo(() => actionCopy[mode] || actionCopy.request_changes, [mode]);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendToOwner, setSendToOwner] = useState(copy.sendDefault);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!open) {
      setReason('');
      setFeedback('');
      setSuggestions('');
      setMessageBody('');
      setSendToOwner(copy.sendDefault);
      setError('');
    }
  }, [open, copy.sendDefault]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (copy.reasonRequired && !reason.trim()) {
      setError(tr('Please add a clear reason before continuing.', 'Ajoutez une raison claire avant de continuer.'));
      return;
    }

    if (mode === 'message_owner' && !messageBody.trim()) {
      setError(tr('Please write a message for the owner.', 'Ecrivez un message pour le proprietaire.'));
      return;
    }

    await onSubmit({
      reason: reason.trim(),
      feedback: feedback.trim(),
      suggestions: suggestions
        .split('\n')
        .map((item) => item.replace(/^[\s*-]+/, '').trim())
        .filter(Boolean),
      messageBody: messageBody.trim(),
      sendToOwner,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.26)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">
              {tr('Marketplace moderation', 'Moderation marketplace')}
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {tr(copy.title[0], copy.title[1])}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            aria-label={tr('Close moderation modal', 'Fermer la fenetre de moderation')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              {tr(copy.reasonLabel[0], copy.reasonLabel[1])}
              {copy.reasonRequired ? <span className="text-rose-500"> *</span> : null}
            </span>
            <textarea
              className={`${baseInputClass} min-h-24 resize-y`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={tr(copy.reasonPlaceholder[0], copy.reasonPlaceholder[1])}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              {tr(copy.feedbackLabel[0], copy.feedbackLabel[1])}
            </span>
            <textarea
              className={`${baseInputClass} min-h-28 resize-y`}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={tr(copy.feedbackPlaceholder[0], copy.feedbackPlaceholder[1])}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              {tr('Suggestions checklist', "Checklist d'amelioration")}
            </span>
            <textarea
              className={`${baseInputClass} min-h-24 resize-y`}
              value={suggestions}
              onChange={(event) => setSuggestions(event.target.value)}
              placeholder={tr('One suggestion per line: add more images, improve description, review pricing...', 'Une suggestion par ligne : ajouter des images, ameliorer la description, revoir le prix...')}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              {tr(copy.messageLabel[0], copy.messageLabel[1])}
            </span>
            <textarea
              className={`${baseInputClass} min-h-28 resize-y`}
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              placeholder={tr(copy.messagePlaceholder[0], copy.messagePlaceholder[1])}
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendToOwner}
              onChange={(event) => setSendToOwner(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span>
              <strong>{tr('Send feedback to owner', 'Envoyer le retour au proprietaire')}</strong>
              <span className="mt-1 block text-xs text-slate-500">
                {tr('The owner will see this on their vehicle page and business dashboard.', 'Le proprietaire verra cela sur sa fiche vehicule et son tableau de bord business.')}
              </span>
            </span>
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {tr(copy.primary[0], copy.primary[1])}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MarketplaceModerationModal;
