import React, { useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import i18n from '../../i18n';

const baseInputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100';

const actionCopy = {
  reject: {
    eyebrow: ['Listing review', "Revue de l'annonce"],
    title: ['Reject listing', "Refuser l'annonce"],
    primary: ['Reject listing', "Refuser l'annonce"],
    reasonLabel: ['Reason for rejection', 'Motif du refus'],
    reasonPlaceholder: ['Explain why this listing cannot move forward right now.', "Expliquez pourquoi cette annonce ne peut pas avancer pour le moment."],
    feedbackLabel: ['Internal review note', 'Note interne de revue'],
    feedbackPlaceholder: ['Optional note for the internal moderation history.', "Note optionnelle pour l'historique interne de revue."],
    messageLabel: ['Official message to owner', 'Message officiel au propriétaire'],
    messagePlaceholder: ['Write the official message the owner should receive about this listing.', "Rédigez le message officiel que le propriétaire doit recevoir au sujet de cette annonce."],
    reasonRequired: true,
    sendDefault: true,
    presetTitle: ['Official listing review templates', "Modèles officiels de revue d'annonce"],
    presetDescription: ['Use a preset for common listing issues, then adjust the final message if needed.', "Utilisez un modèle pour les problèmes les plus fréquents d'annonce, puis ajustez le message final si nécessaire."],
  },
  request_changes: {
    eyebrow: ['Listing review', "Revue de l'annonce"],
    title: ['Request listing changes', "Demander des modifications d'annonce"],
    primary: ['Send change request', 'Envoyer la demande'],
    reasonLabel: ['What needs to change?', 'Que faut-il modifier ?'],
    reasonPlaceholder: ['Highlight the main listing issue that blocks approval.', "Mettez en avant le problème principal de l'annonce qui bloque l'approbation."],
    feedbackLabel: ['Internal review note', 'Note interne de revue'],
    feedbackPlaceholder: ['Optional note for the internal moderation history.', "Note optionnelle pour l'historique interne de revue."],
    messageLabel: ['Official message to owner', 'Message officiel au propriétaire'],
    messagePlaceholder: ['Write the official change request the owner should receive.', "Rédigez la demande officielle de modification que le propriétaire doit recevoir."],
    reasonRequired: true,
    sendDefault: true,
    presetTitle: ['Official listing review templates', "Modèles officiels de revue d'annonce"],
    presetDescription: ['Use a preset for common listing issues, then adjust the final message if needed.', "Utilisez un modèle pour les problèmes les plus fréquents d'annonce, puis ajustez le message final si nécessaire."],
  },
  message_owner: {
    eyebrow: ['Listing review', "Revue de l'annonce"],
    title: ['Send review feedback', 'Envoyer un retour de revue'],
    primary: ['Send review feedback', 'Envoyer le retour'],
    reasonLabel: ['Review topic', 'Sujet de revue'],
    reasonPlaceholder: ['Optional label for this listing review note.', "Étiquette optionnelle pour cette note de revue d'annonce."],
    feedbackLabel: ['Internal review note', 'Note interne de revue'],
    feedbackPlaceholder: ['Optional note for the internal moderation history.', "Note optionnelle pour l'historique interne de revue."],
    messageLabel: ['Official message to owner', 'Message officiel au propriétaire'],
    messagePlaceholder: ['Write the official message the owner should receive about this listing.', "Rédigez le message officiel que le propriétaire doit recevoir au sujet de cette annonce."],
    reasonRequired: false,
    sendDefault: true,
    presetTitle: ['Official listing review templates', "Modèles officiels de revue d'annonce"],
    presetDescription: ['Use a preset for common listing issues, then adjust the final message if needed.', "Utilisez un modèle pour les problèmes les plus fréquents d'annonce, puis ajustez le message final si nécessaire."],
  },
};

const LISTING_REVIEW_PRESETS = [
  {
    id: 'better_photos',
    label: ['Better photos needed', 'Meilleures photos nécessaires'],
    reason: ['Vehicle photos need improvement', "Les photos du véhicule doivent être améliorées"],
    message: [
      'Please upload clearer and more complete vehicle photos. Make sure the vehicle is well lit, fully visible, and presented from multiple angles.',
      'Veuillez téléverser des photos du véhicule plus claires et plus complètes. Assurez-vous que le véhicule soit bien éclairé, entièrement visible et présenté sous plusieurs angles.',
    ],
    suggestions: [
      ['Add more exterior photos', 'Ajoutez plus de photos extérieures'],
      ['Include interior or detail views if relevant', 'Ajoutez des vues intérieures ou des détails si nécessaire'],
      ['Use brighter and sharper images', 'Utilisez des images plus lumineuses et plus nettes'],
    ],
  },
  {
    id: 'description_quality',
    label: ['Improve description', 'Améliorer la description'],
    reason: ['Listing description needs more detail', "La description de l'annonce manque de détails"],
    message: [
      'Please improve the listing description so renters can better understand the vehicle, its condition, and what is included.',
      "Veuillez améliorer la description de l'annonce afin que les locataires comprennent mieux le véhicule, son état et ce qui est inclus.",
    ],
    suggestions: [
      ['Add key vehicle details', 'Ajoutez les détails clés du véhicule'],
      ['Clarify what is included', 'Précisez ce qui est inclus'],
      ['Make the description more complete and clear', 'Rendez la description plus complète et plus claire'],
    ],
  },
  {
    id: 'pricing_review',
    label: ['Review pricing', 'Revoir le prix'],
    reason: ['Pricing needs review before approval', "Le prix doit être revu avant approbation"],
    message: [
      'Please review the listing pricing before we continue. The current price or deposit setup needs adjustment for approval.',
      "Veuillez revoir le prix de l'annonce avant de poursuivre. Le prix actuel ou la configuration de la caution doit être ajusté pour l'approbation.",
    ],
    suggestions: [
      ['Review base price', 'Revoyez le prix de base'],
      ['Review deposit amount', 'Revoyez le montant de la caution'],
      ['Make sure pricing is complete and realistic', 'Assurez-vous que le prix est complet et cohérent'],
    ],
  },
  {
    id: 'listing_details',
    label: ['Complete listing details', "Compléter l'annonce"],
    reason: ['Some listing details are still incomplete', "Certaines informations de l'annonce sont encore incomplètes"],
    message: [
      'Please complete the missing listing details before we continue the review. The current listing does not yet provide enough information for renters.',
      "Veuillez compléter les informations manquantes de l'annonce avant de poursuivre la revue. L'annonce actuelle ne fournit pas encore assez d'informations aux locataires.",
    ],
    suggestions: [
      ['Complete missing fields', 'Complétez les champs manquants'],
      ['Review pickup and location details', 'Vérifiez les détails de lieu et de remise'],
      ['Check availability and booking information', 'Vérifiez les informations de disponibilité et de réservation'],
    ],
  },
  {
    id: 'docs_match_listing',
    label: ['Listing does not match vehicle', "L'annonce ne correspond pas au véhicule"],
    reason: ['Listing content does not match the verified vehicle', "Le contenu de l'annonce ne correspond pas au véhicule vérifié"],
    message: [
      'Please review this listing carefully. Some listing details or images do not appear to match the verified vehicle record.',
      "Veuillez vérifier attentivement cette annonce. Certaines informations ou images ne semblent pas correspondre au véhicule vérifié.",
    ],
    suggestions: [
      ['Update the images to match the vehicle', 'Mettez à jour les images pour correspondre au véhicule'],
      ['Correct the listing details', "Corrigez les détails de l'annonce"],
      ['Make sure the published vehicle is the verified one', 'Assurez-vous que le véhicule publié est bien celui qui a été vérifié'],
    ],
  },
];

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
  const [selectedPresetId, setSelectedPresetId] = useState('');

  React.useEffect(() => {
    if (!open) {
      setReason('');
      setFeedback('');
      setSuggestions('');
      setMessageBody('');
      setSendToOwner(copy.sendDefault);
      setError('');
      setSelectedPresetId('');
    }
  }, [open, copy.sendDefault]);

  if (!open) return null;

  const applyPreset = (preset) => {
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setReason(tr(preset.reason[0], preset.reason[1]));
    setMessageBody(tr(preset.message[0], preset.message[1]));
    setSuggestions(
      (preset.suggestions || [])
        .map((item) => tr(item[0], item[1]))
        .join('\n')
    );
    setFeedback((current) => current || tr('Listing review template applied.', "Modèle de revue d'annonce appliqué."));
  };

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
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <div className="flex min-h-full items-start justify-center">
        <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.26)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">
              {tr(copy.eyebrow?.[0] || 'Listing review', copy.eyebrow?.[1] || "Revue de l'annonce")}
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

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="space-y-4">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {tr(copy.presetTitle?.[0] || 'Official templates', copy.presetTitle?.[1] || 'Modèles officiels')}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {tr(
                copy.presetDescription?.[0] || 'Use a preset, then adjust the final message if needed.',
                copy.presetDescription?.[1] || 'Utilisez un modèle, puis ajustez le message final si nécessaire.'
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LISTING_REVIEW_PRESETS.map((preset) => {
                const selected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
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
              <strong>{tr('Send listing review feedback to owner', "Envoyer le retour de revue d'annonce au propriétaire")}</strong>
              <span className="mt-1 block text-xs text-slate-500">
                {tr(
                  'The owner will see this in the vehicle workspace and message thread connected to this listing.',
                  "Le propriétaire verra cela dans l'espace véhicule et dans le fil de messages lié à cette annonce."
                )}
              </span>
            </span>
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          </div>
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
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
    </div>
  );
};

export default MarketplaceModerationModal;
