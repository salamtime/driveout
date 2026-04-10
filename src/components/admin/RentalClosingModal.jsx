import React, { useEffect, useState } from 'react';
import { X, Video, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import MobileCameraCapture from '../video/MobileCameraCapture';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

/**
 * Modal for rental closing with mandatory video capture
 */
const RentalClosingModal = ({
  rental,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [currentStep, setCurrentStep] = useState('video-capture');
  const [captureSession, setCaptureSession] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !rental) {
      setCurrentStep('video-capture');
      setCaptureSession(null);
      setIsProcessing(false);
      setError(null);
      return;
    }

    setError(null);
    setIsProcessing(true);
    setCurrentStep('video-capture');
    setCaptureSession({
      sessionToken: `closing_${rental.id || rental.rental_id || 'session'}`,
      requirements: { minDuration: 20 }
    });
    setIsProcessing(false);
  }, [isOpen, rental]);

  const handleVideoCapture = async (videoFile, metadata) => {
    if (!videoFile) {
      const message = tr('Closing video is required.', 'La video de cloture est obligatoire.');
      setError(message);
      toast.error(message);
      return;
    }

    const successMessage = tr(
      'Closing video captured successfully.',
      'La video de cloture a ete enregistree avec succes.'
    );

    toast.success(successMessage);
    if (typeof onSuccess === 'function') {
      await onSuccess({
        videoFile,
        metadata,
        rental
      });
    }
  };

  if (!isOpen || !rental) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {tr('Close Rental Contract', 'Cloturer le contrat de location')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {rental.customer_name} - {rental.vehicle_plate_number || rental.rental_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={tr('Close modal', 'Fermer la fenetre')}
          >
            <X size={22} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-amber-900">
                  {tr('Closing video required', 'Video de cloture obligatoire')}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {tr(
                    'You must record a live closing video before the rental can be completed.',
                    'Vous devez enregistrer une video de cloture en direct avant de terminer la location.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {currentStep === 'video-capture' ? (
            captureSession ? (
              <MobileCameraCapture
                sessionToken={captureSession.sessionToken}
                requirements={captureSession.requirements}
                onVideoCapture={handleVideoCapture}
                onError={setError}
                disabled={isProcessing}
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                {tr('Preparing video capture...', 'Preparation de la capture video...')}
              </div>
            )
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {tr('Cancel', 'Annuler')}
          </button>
          <div className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700">
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {tr('Waiting for closing video', 'En attente de la video de cloture')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalClosingModal;
