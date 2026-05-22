import React, { useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';

const normalizePhotos = (photos = []) =>
  (Array.isArray(photos) ? photos : [])
    .map((photo, index) => ({
      id: String(photo?.id || `photo-${index}`).trim(),
      publicUrl: String(photo?.publicUrl || photo?.public_url || '').trim(),
      thumbnailUrl: String(photo?.thumbnailUrl || photo?.thumbnail_url || photo?.publicUrl || photo?.public_url || '').trim(),
      originalFilename: String(photo?.originalFilename || photo?.original_filename || '').trim(),
    }))
    .filter((photo) => photo.publicUrl || photo.thumbnailUrl);

const RentalEvidenceGallery = ({
  title,
  subtitle = '',
  photos = [],
  emptyLabel = 'No photos uploaded yet.',
  variant = 'card',
  hideHeader = false,
}) => {
  const normalizedPhotos = useMemo(() => normalizePhotos(photos), [photos]);
  const [activePhoto, setActivePhoto] = useState(null);
  const isFlat = variant === 'flat';
  const galleryContent = (
    <>
      {!hideHeader ? (
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <Camera className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-950">{title}</p>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
      ) : null}

      {normalizedPhotos.length > 0 ? (
        <div className={`${hideHeader ? '' : 'mt-4'} grid grid-cols-3 gap-3 sm:grid-cols-4`}>
          {normalizedPhotos.map((photo) => {
            const imageUrl = photo.thumbnailUrl || photo.publicUrl;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActivePhoto(photo)}
                className="overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50 transition hover:border-violet-200"
              >
                <img
                  src={imageUrl}
                  alt={photo.originalFilename || title}
                  className="h-24 w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className={`${hideHeader ? '' : 'mt-4'} rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500`}>
          {emptyLabel}
        </div>
      )}
    </>
  );

  return (
    <>
      {isFlat ? (
        <div>{galleryContent}</div>
      ) : (
        <section className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
          {galleryContent}
        </section>
      )}

      {activePhoto ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setActivePhoto(null)}
            className="absolute inset-0"
            aria-label="Close evidence viewer"
          />
          <div className="relative z-[1] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.38)]">
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm"
              aria-label="Close evidence viewer"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={activePhoto.publicUrl || activePhoto.thumbnailUrl}
              alt={activePhoto.originalFilename || title}
              className="max-h-[80vh] w-full object-contain bg-slate-950/5"
            />
          </div>
        </div>
      ) : null}
    </>
  );
};

export default RentalEvidenceGallery;
