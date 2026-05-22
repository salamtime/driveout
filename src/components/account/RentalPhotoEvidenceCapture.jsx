import React from 'react';
import { Camera } from 'lucide-react';
import PhotoCapture from '../video/PhotoCapture';
import RentalEvidenceGallery from './RentalEvidenceGallery';

const RentalPhotoEvidenceCapture = ({
  title,
  subtitle,
  helper,
  sessionToken,
  photos = [],
  minPhotos = 3,
  maxPhotos = 6,
  onSubmit,
  saving = false,
  disabled = false,
  variant = 'card',
  submitLabel = '',
  tr = (value) => value,
}) => {
  const safeTitle = title || tr('Photo capture', 'Capture photo');
  const safeSubtitle = subtitle || tr('Capture clear evidence photos.', 'Capturez des photos de preuve claires.');
  const isFlush = variant === 'flush';

  return (
    <div className={isFlush ? 'space-y-0' : 'space-y-4'}>
      {!isFlush ? (
        <RentalEvidenceGallery
          title={safeTitle}
          subtitle={safeSubtitle}
          photos={photos}
          emptyLabel={tr('No photos uploaded yet.', 'Aucune photo téléversée.')}
        />
      ) : null}

      <section className={isFlush ? 'bg-white' : 'rounded-[1.35rem] border border-violet-200 bg-violet-50/60 p-4 shadow-sm'}>
        <div className={isFlush ? 'flex items-start gap-3 px-4 py-4 sm:px-5' : 'flex items-start gap-3'}>
          <span className={isFlush ? 'inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700' : 'inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm'}>
            <Camera className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-950">
              {isFlush ? safeTitle : tr('Camera-first evidence capture', 'Capture de preuve en priorité caméra')}
            </p>
            {helper || safeSubtitle ? (
              <p className="mt-1 text-sm text-slate-600">
                {helper || safeSubtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className={isFlush ? 'overflow-hidden bg-white' : 'mt-4 overflow-hidden rounded-[1.25rem] border border-violet-100 bg-white'}>
          <PhotoCapture
            sessionToken={sessionToken}
            requirements={{ minPhotos, maxPhotos }}
            onPhotosCapture={onSubmit}
            disabled={disabled || saving}
            title={safeTitle}
            subtitle={safeSubtitle}
            captureLabel={tr('Take photo', 'Prendre une photo')}
            submitLabel={saving ? tr('Saving…', 'Enregistrement…') : (submitLabel || tr('Save photos', 'Enregistrer les photos'))}
            retakeLabel={tr('Retake photos', 'Reprendre les photos')}
            loadingLabel={tr('Initializing camera…', 'Initialisation de la caméra…')}
            hideInstructions
            hideHeader={isFlush}
            flush={isFlush}
          />
        </div>
      </section>
    </div>
  );
};

export default RentalPhotoEvidenceCapture;
