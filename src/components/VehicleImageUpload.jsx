import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import i18n from '../i18n';

const REQUIRED_PHOTO_TYPES = [
  {
    key: 'hero',
    label: { en: 'Hero shot', fr: 'Photo principale' },
    tip: {
      en: 'Full vehicle, clear and centered.',
      fr: 'Véhicule entier, net et bien centré.',
    },
  },
  {
    key: 'context',
    label: { en: 'Context shot', fr: 'Photo contexte' },
    tip: {
      en: 'Vehicle shown in its real setting.',
      fr: 'Véhicule montré dans son vrai contexte.',
    },
  },
  {
    key: 'detail',
    label: { en: 'Detail shot', fr: 'Photo détail' },
    tip: {
      en: 'Interior, controls, or standout detail.',
      fr: 'Intérieur, commandes ou détail important.',
    },
  },
];

const getLabel = (entry, isFrench) => (isFrench ? entry.fr : entry.en);

const inferShotType = (item = {}, index = 0) => {
  const explicitShotType = String(item.shot_type || item.shotType || '').trim().toLowerCase();
  if (explicitShotType) return explicitShotType;
  if (Boolean(item.is_cover)) return 'hero';

  const haystack = [
    item?.name,
    item?.url,
    item?.storagePath,
    item?.storage_path,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(^|[^a-z])(hero)([^a-z]|$)/.test(haystack)) return 'hero';
  if (/(^|[^a-z])(context)([^a-z]|$)/.test(haystack)) return 'context';
  if (/(^|[^a-z])(detail)([^a-z]|$)/.test(haystack)) return 'detail';

  return REQUIRED_PHOTO_TYPES[index]?.key || null;
};

const assignPhotoSlots = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  const requiredSlots = REQUIRED_PHOTO_TYPES.map((entry) => entry.key);
  const usedSlots = new Set();
  const unassignedIndexes = [];

  normalizedItems.forEach((item, index) => {
    const shotType = String(item?.shot_type || '').trim().toLowerCase();
    if (requiredSlots.includes(shotType) && !usedSlots.has(shotType)) {
      usedSlots.add(shotType);
      item.shot_type = shotType;
      return;
    }

    item.shot_type = null;
    unassignedIndexes.push(index);
  });

  requiredSlots.forEach((slot) => {
    if (usedSlots.has(slot)) return;
    const nextIndex = unassignedIndexes.shift();
    if (nextIndex === undefined) return;
    normalizedItems[nextIndex].shot_type = slot;
    usedSlots.add(slot);
  });

  return normalizedItems.map((item, index) => ({
    ...item,
    shot_type: item.shot_type || null,
    is_cover: item.shot_type === 'hero' || (item.is_cover && !normalizedItems.some((entry, entryIndex) => entryIndex !== index && entry.shot_type === 'hero')),
  }));
};

const normalizeImageItems = (items = []) =>
  Array.isArray(items)
    ? assignPhotoSlots(items
        .filter((item) => item?.url)
        .map((item, index) => ({
          id: item.id || `media-${index + 1}`,
          url: String(item.url || '').trim(),
          type: item.type || 'image',
          name: item.name || `Image ${index + 1}`,
          is_cover: Boolean(item.is_cover) || inferShotType(item, index) === 'hero',
          shot_type: inferShotType(item, index),
          quality_status: String(item.quality_status || item.qualityStatus || '').trim().toLowerCase() || 'approved',
        })))
    : [];

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read image.'));
    };
    image.src = url;
  });

const inspectImageQuality = async (file) => {
  const image = await loadImage(file);
  const maxWidth = 240;
  const scale = Math.min(1, maxWidth / Math.max(1, image.width));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return { ok: true, brightness: 120, sharpness: 20 };
  }

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  let brightnessTotal = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let previousBrightness = null;

  for (let index = 0; index < data.length; index += 4) {
    const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
    brightnessTotal += brightness;

    if (previousBrightness !== null) {
      edgeTotal += Math.abs(brightness - previousBrightness);
      edgeCount += 1;
    }
    previousBrightness = brightness;
  }

  const averageBrightness = brightnessTotal / Math.max(1, data.length / 4);
  const averageEdge = edgeTotal / Math.max(1, edgeCount);
  const tooDark = averageBrightness < 55;
  const tooBlurry = averageEdge < 12;

  return {
    ok: !tooDark && !tooBlurry,
    tooDark,
    tooBlurry,
    brightness: averageBrightness,
    sharpness: averageEdge,
  };
};

const VehicleImageUpload = ({
  vehicleId,
  currentImageUrl = '',
  onImageChange,
  currentImages = [],
  onImagesChange,
  disabled = false,
  className = '',
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const pendingShotTypeRef = useRef(null);
  const isStructuredMode = typeof onImagesChange === 'function';
  const normalizedImages = useMemo(() => normalizeImageItems(currentImages), [currentImages]);

  const BUCKET_NAME = 'vehicle-images';

  const currentShotMap = useMemo(
    () =>
      REQUIRED_PHOTO_TYPES.reduce((accumulator, entry) => {
        accumulator[entry.key] = normalizedImages.find((item) => item.shot_type === entry.key) || null;
        return accumulator;
      }, {}),
    [normalizedImages]
  );

  const missingPhotoTypes = REQUIRED_PHOTO_TYPES.filter((entry) => !currentShotMap[entry.key]);
  const displayImageUrl = normalizeVehicleImageUrl(currentImageUrl);

  const describeQualityError = (quality) => {
    if (quality.tooDark && quality.tooBlurry) {
      return tr('Use a brighter and sharper photo.', 'Utilisez une photo plus lumineuse et plus nette.');
    }
    if (quality.tooDark) {
      return tr('Use a brighter photo with better lighting.', 'Utilisez une photo plus lumineuse avec un meilleur éclairage.');
    }
    if (quality.tooBlurry) {
      return tr('Use a sharper photo. The image looks blurry.', "Utilisez une photo plus nette. L'image semble floue.");
    }
    return tr('This photo could not be approved.', 'Cette photo ne peut pas être approuvée.');
  };

  const updateStructuredImages = (nextImages) => {
    const normalized = normalizeImageItems(nextImages);
    onImagesChange?.(normalized);
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      uploadFiles(files, pendingShotTypeRef.current);
    }
    event.target.value = '';
    pendingShotTypeRef.current = null;
  };

  const uploadFiles = async (files, shotType = null) => {
    if (!vehicleId) {
      setError(tr('Vehicle ID is required for image upload', "L'identifiant du vehicule est requis pour televerser une image"));
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError(tr('Please select only image files (JPG, PNG)', 'Veuillez selectionner uniquement des images (JPG, PNG)'));
      return;
    }

    const file = imageFiles[0];

    if (file.size > 10 * 1024 * 1024) {
      setError(tr('Image file size must be less than 10MB', "La taille de l'image doit etre inferieure a 10 Mo"));
      return;
    }

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(tr('Only JPG, PNG, and WEBP image files are supported', 'Seuls les fichiers JPG, PNG et WEBP sont pris en charge'));
      return;
    }

    setUploading(true);
    setError(null);

    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const quality = await inspectImageQuality(file);
      if (!quality.ok) {
        setUploadProgress({
          [fileId]: { progress: 0, status: 'error', error: describeQualityError(quality) },
        });
        setError(describeQualityError(quality));
        return;
      }

      const fileExtension = file.name.split('.').pop();
      const storagePrefix = shotType ? `${shotType}__` : '';
      const storagePath = `${vehicleId}/${storagePrefix}${fileId}.${fileExtension}`;

      setUploadProgress({
        [fileId]: { progress: 0, status: 'uploading' },
      });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);
      const finalUrl = normalizeVehicleImageUrl(urlData?.publicUrl || '');

      setUploadProgress({
        [fileId]: { progress: 100, status: 'completed' },
      });

      if (isStructuredMode) {
        const nextImages = [
          ...normalizedImages.filter((item) => !shotType || item.shot_type !== shotType),
          {
            id: fileId,
            url: finalUrl,
            type: 'image',
            name: file.name,
            is_cover: shotType === 'hero',
            shot_type: shotType || null,
            quality_status: 'approved',
          },
        ];
        updateStructuredImages(nextImages);
      } else {
        onImageChange?.(finalUrl);
      }

      setTimeout(() => {
        setUploadProgress({});
      }, 3000);
    } catch (uploadError) {
      setError(`${tr('Upload failed:', 'Échec du téléversement :')} ${uploadError.message}`);
      setUploadProgress({
        [fileId]: { progress: 0, status: 'error', error: uploadError.message },
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (disabled || uploading) return;

    const files = Array.from(event.dataTransfer.files);
    const nextShotType = missingPhotoTypes[0]?.key || REQUIRED_PHOTO_TYPES[0].key;
    if (files.length > 0) {
      uploadFiles(files, isStructuredMode ? nextShotType : null);
    }
  };

  const triggerInput = (shotType = null) => {
    pendingShotTypeRef.current = shotType;
    fileInputRef.current?.click();
  };

  const handleRemoveImage = (shotType = null) => {
    if (disabled) return;

    if (isStructuredMode) {
      const nextImages = normalizedImages.filter((item) => item.shot_type !== shotType);
      updateStructuredImages(nextImages);
      return;
    }

    if (!currentImageUrl) return;
    onImageChange?.('');
  };

  const progressEntries = Object.entries(uploadProgress);

  if (isStructuredMode) {
    return (
      <div className={`space-y-4 ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />

        <section className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                {tr('Photo checklist', 'Checklist photos')}
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-950">
                {tr('3 photos required', '3 photos requises')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {missingPhotoTypes.length === 0
                  ? tr('All required photo types are uploaded.', 'Tous les types de photos requis sont téléversés.')
                  : tr('Complete the missing photo types below.', 'Complétez les types de photos manquants ci-dessous.')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tr('Uploaded', 'Téléversées')}
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">{normalizedImages.length}/3</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {REQUIRED_PHOTO_TYPES.map((entry) => {
              const image = currentShotMap[entry.key];
              return (
                <article
                  key={entry.key}
                  className={`rounded-[1.35rem] border p-4 ${
                    image ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {getLabel(entry.label, isFrench)}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {image ? tr('Uploaded', 'Téléversée') : tr('Missing', 'Manquante')}
                      </p>
                    </div>
                    {image ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-slate-400" />
                    )}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[1rem] border border-slate-200 bg-white">
                    {image?.url ? (
                      <img src={image.url} alt={getLabel(entry.label, isFrench)} className="h-32 w-full object-cover" />
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-slate-50 text-slate-400">
                        <ImageIcon className="h-7 w-7" />
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">{getLabel(entry.tip, isFrench)}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={disabled || uploading}
                      onClick={() => triggerInput(entry.key)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {image ? tr('Replace', 'Remplacer') : tr('Upload', 'Téléverser')}
                    </button>
                    {image?.url ? (
                      <>
                        <a
                          href={image.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                        >
                          <Eye className="h-4 w-4" />
                          {tr('View', 'Voir')}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(entry.key)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          <X className="h-4 w-4" />
                          {tr('Remove', 'Supprimer')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {tr('Photo tips', 'Conseils photo')}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{tr('Use bright, sharp photos', 'Utilisez des photos nettes et lumineuses')}</p>
              <p className="mt-1">{tr('Dark or blurry images are blocked before upload.', 'Les images sombres ou floues sont bloquées avant le téléversement.')}</p>
            </div>
            <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{tr('Build trust fast', 'Créez la confiance rapidement')}</p>
              <p className="mt-1">{tr('Show the full vehicle, the environment, and one strong detail.', "Montrez le véhicule entier, l'environnement et un détail fort.")}</p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <p className="font-semibold">{tr('Upload error', 'Erreur de téléversement')}</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {progressEntries.length > 0 ? (
          <div className="space-y-2">
            {progressEntries.map(([fileId, progress]) => (
              <div key={fileId} className="rounded-[1rem] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{tr('Uploading photo', 'Téléversement de la photo')}</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {progress.status === 'completed' ? tr('Completed', 'Terminé') : progress.status === 'error' ? tr('Failed', 'Échec') : `${progress.progress}%`}
                  </span>
                </div>
                {progress.status !== 'error' ? (
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${progress.status === 'completed' ? 'bg-emerald-500' : 'bg-violet-600'}`}
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                ) : null}
                {progress.error ? <p className="mt-2 text-xs text-rose-600">{progress.error}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {displayImageUrl && (
        <div className="relative group mx-auto w-full max-w-md">
          <div className="relative overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
            <div className="relative flex h-48 items-center justify-center">
              <img
                src={displayImageUrl}
                alt={tr('Vehicle', 'Véhicule')}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <div className="flex items-center justify-between">
                <span className="max-w-[60%] truncate text-sm text-white">
                  {tr('Primary photo', 'Photo principale')}
                </span>
                <div className="flex gap-2">
                  <a
                    href={displayImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
                    title={tr('Open in new tab', 'Ouvrir dans un nouvel onglet')}
                  >
                    <Eye className="h-4 w-4 text-white" />
                  </a>
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveImage()}
                      className="rounded-full bg-red-500/80 p-2 transition-colors hover:bg-red-600"
                      title={tr('Remove', 'Supprimer')}
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!disabled ? (
        <div
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            uploading
              ? 'cursor-not-allowed border-gray-200 bg-gray-50'
              : 'cursor-pointer border-gray-300 hover:border-blue-400'
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !uploading && triggerInput()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />

          <div className="flex flex-col items-center gap-2">
            <Upload className={`h-8 w-8 ${uploading ? 'text-gray-400' : 'text-gray-500'}`} />
            <div>
              <p className={`text-sm font-medium ${uploading ? 'text-gray-400' : 'text-gray-700'}`}>
                {uploading ? tr('Uploading image...', "Téléversement de l'image...") : tr('Click to upload vehicle image', "Cliquez pour téléverser l'image du véhicule")}
              </p>
              <p className={`text-xs ${uploading ? 'text-gray-300' : 'text-gray-500'}`}>
                {tr('or drag and drop image here', "ou glissez-déposez l'image ici")}
              </p>
            </div>
            <p className={`text-xs ${uploading ? 'text-gray-300' : 'text-gray-400'}`}>JPG, PNG, WEBP up to 10MB</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-medium text-red-800">{tr('Upload Error', 'Erreur de televersement')}</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VehicleImageUpload;
