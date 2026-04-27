import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, Instagram, Package2, Plus, Route, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageTourPackages as canManageTourPackagesPermission } from '../../../utils/permissionHelpers';
import {
  createTourPackage,
  deleteTourPackage,
  fetchTourPackages,
  updateTourPackage,
  updateTourPackageMedia,
  updateTourPackageRoadmap,
} from '../../../services/tourPackageService';
import {
  fetchTourPackageModelPrices,
  getTourPackageStartingPrice,
  getTourPriceForModelAndDuration,
  GLOBAL_TOUR_PRICING_KEY,
} from '../../../services/tourPackagePricingService';
import TourPackagePricingManager from './TourPackagePricingManager';
import VehicleModelPricingService from '../../../services/VehicleModelPricingService';
import { uploadFile } from '../../../utils/storageUpload';
import { supabase } from '../../../utils/supabaseClient';

const TOUR_PACKAGE_RULES_MARKER = '[tour_package_rules]';

const defaultPackageRules = {
  routeType: 'mountain',
  requiresLicense: false,
  maxQuads: 5,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 30,
  websiteVisible: true,
  publicPresentation: {
    publicTitle: '',
    publicSummary: '',
    routeLabel: '',
    routeStops: [],
    mediaGallery: [],
    publicHighlights: [],
    displayOrder: 0,
    coverImageUrl: '',
    durationDisplay: '',
    stopCount: 0,
    difficultyLabel: '',
  },
};

const initialPackageForm = {
  name: '',
  description: '',
  location: 'Main Base',
  duration: 1,
  default_rate_1h: 0,
  default_rate_2h: 0,
  vip_rate_1h: 0,
  vip_rate_2h: 0,
  is_active: true,
  routeType: 'mountain',
  requiresLicense: false,
  maxQuads: 5,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 30,
  websiteVisible: true,
  publicTitle: '',
  publicSummary: '',
  routeLabel: '',
  routeStops: [],
  mediaGallery: [],
  publicHighlights: [],
  displayOrder: 0,
  coverImageUrl: '',
  durationDisplay: '',
  stopCount: 0,
  difficultyLabel: '',
};

const PACKAGE_DURATION_OPTIONS = [1, 1.5, 2];
const PACKAGE_CAPACITY_OPTIONS = [1, 2, 3, 4, 5, 6];
const DEFAULT_CUSTOM_PACKAGE_CAPACITY = '7';
const MAX_PUBLIC_TOUR_MEDIA_ITEMS = 9;
const ROADMAP_STOP_KIND_OPTIONS = [
  { id: 'start', label: 'Start' },
  { id: 'drive', label: 'Drive' },
  { id: 'stop', label: 'Stop' },
  { id: 'end', label: 'End' },
  { id: 'note', label: 'Note' },
];
const EDITOR_TABS = [
  { id: 'details', label: 'Details', icon: Package2 },
  { id: 'website', label: 'Media & roadmap', icon: ImageIcon },
  { id: 'pricing', label: 'Pricing', icon: Route },
  { id: 'advanced', label: 'Advanced', icon: Settings2 },
];

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  return safeJsonParse(text.slice(markerIndex + marker.length).trim());
};

const stripMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return text.trim();
  return text.slice(0, markerIndex).trim();
};

const appendMarkedJson = (text, marker, payload) => {
  const cleanedText = stripMarkedJson(text, marker);
  const serialized = `${marker}${JSON.stringify(payload)}`;
  return cleanedText ? `${cleanedText}\n\n${serialized}` : serialized;
};

const clampText = (value, maxLength = 240) => String(value || '').trim().slice(0, maxLength);

const safeInteger = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
};

const presentationId = (prefix, index) => `${prefix}_${Date.now()}_${index}`;

const normalizeStopMedia = (items = []) =>
  normalizeMediaGallery(items).slice(0, 3);

const normalizeRouteStops = (stops = []) => (Array.isArray(stops) ? stops : [])
  .map((stop, index) => {
    const item = typeof stop === 'object' && stop !== null ? stop : {};
    const title = clampText(item.title, 90);
    const note = clampText(item.note, 180);
    const media = normalizeStopMedia(item.media || item.mediaGallery || item.media_gallery_json || []);
    const durationMinutes = Math.max(0, safeInteger(item.duration_minutes, 0));
    if (!title && !note && media.length === 0 && durationMinutes === 0) return null;
    return {
      id: clampText(item.id, 64) || `stop_${index + 1}`,
      kind: ['start', 'drive', 'stop', 'end', 'note'].includes(String(item.kind || item.type || '').toLowerCase())
        ? String(item.kind || item.type).toLowerCase()
        : 'stop',
      title,
      duration_minutes: durationMinutes,
      note,
      media,
      sort_order: safeInteger(item.sort_order, index + 1),
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.sort_order - right.sort_order)
  .map((item, index) => ({
    ...item,
    sort_order: index + 1,
  }));

const normalizeMediaGallery = (items = []) => (Array.isArray(items) ? items : [])
  .map((media, index) => {
    const item = typeof media === 'object' && media !== null ? media : {};
    const url = clampText(item.url, 900);
    if (!url) return null;
    return {
      id: clampText(item.id, 64) || `media_${index + 1}`,
      type: ['image', 'video', 'instagram'].includes(String(item.type || '').toLowerCase()) ? String(item.type).toLowerCase() : 'image',
      url,
      externalUrl: clampText(item.externalUrl || item.external_url || item.instagramUrl || item.instagram_url, 900),
      thumbnailUrl: clampText(item.thumbnailUrl || item.thumbnail_url || item.previewUrl || item.preview_url, 900),
      caption: clampText(item.caption, 120),
      duration: Math.max(0, safeInteger(item.duration, 0)),
      sort_order: safeInteger(item.sort_order, index + 1),
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.sort_order - right.sort_order)
  .map((item, index) => ({
    ...item,
    sort_order: index + 1,
  }));

const normalizeHighlights = (items = []) => (Array.isArray(items) ? items : [])
  .map((highlight, index) => {
    const item = typeof highlight === 'object' && highlight !== null ? highlight : { label: highlight };
    const label = clampText(item.label, 60);
    if (!label) return null;
    return {
      id: clampText(item.id, 64) || `highlight_${index + 1}`,
      label,
    };
  })
  .filter(Boolean);

const createRouteStop = (index = 0) => ({
  id: presentationId('stop', index),
  kind: 'stop',
  title: '',
  duration_minutes: 0,
  note: '',
  media: [],
  sort_order: index + 1,
});

const createMediaItem = (index = 0, type = 'image') => ({
  id: presentationId('media', index),
  type,
  url: '',
  externalUrl: '',
  thumbnailUrl: '',
  caption: '',
  duration: 0,
  sort_order: index + 1,
});

const getPreviewMediaItems = (pkg = {}, limit = 3) => {
  const coverImageUrl = String(pkg.coverImageUrl || '').trim();
  const galleryItems = Array.isArray(pkg.mediaGallery) ? pkg.mediaGallery : [];
  if (galleryItems.length === 0) {
    return [];
  }
  const coverGalleryItem = galleryItems.find((item) => {
    const itemUrl = String(item?.url || '').trim();
    const itemThumbnail = String(item?.thumbnailUrl || item?.thumbnail_url || '').trim();
    return coverImageUrl && (itemUrl === coverImageUrl || itemThumbnail === coverImageUrl);
  });

  const normalizedGalleryItems = galleryItems.filter((item) => item !== coverGalleryItem);
  const media = [
    ...(coverImageUrl
      ? [{
        ...(coverGalleryItem || {}),
        url: coverGalleryItem?.url || coverImageUrl,
        thumbnailUrl: coverGalleryItem?.thumbnailUrl || coverGalleryItem?.thumbnail_url || coverImageUrl,
        type: coverGalleryItem?.type || 'image',
        caption: coverGalleryItem?.caption || pkg.publicTitle || pkg.name,
        isMainCover: true,
      }]
      : []),
    ...normalizedGalleryItems,
  ]
    .map((item) => ({
      ...item,
      previewUrl:
        item?.type === 'instagram'
          ? item?.thumbnailUrl || item?.url || ''
          : item?.thumbnailUrl || item?.url || '',
    }))
    .filter((item) => item?.previewUrl)
    .slice(0, limit);

  return media;
};

const resolveCoverAfterMediaChange = (gallery = [], currentCover = '') => {
  const coverCandidate = String(currentCover || '').trim();
  if (!coverCandidate) {
    const first = gallery[0];
    return String(first?.thumbnailUrl || first?.url || '').trim();
  }

  const coverStillExists = gallery.some((item) => {
    const url = String(item?.url || '').trim();
    const thumb = String(item?.thumbnailUrl || item?.thumbnail_url || '').trim();
    return Boolean(coverCandidate && (coverCandidate === url || coverCandidate === thumb));
  });

  if (coverStillExists) return coverCandidate;

  const first = gallery[0];
  return String(first?.thumbnailUrl || first?.url || '').trim();
};

const buildMediaMatchSet = (media = {}) => {
  const candidates = [
    media?.id,
    media?.url,
    media?.thumbnailUrl,
    media?.thumbnail_url,
    media?.previewUrl,
  ];
  return new Set(candidates.map((value) => String(value || '').trim()).filter(Boolean));
};

const mediaMatchesTarget = (media = {}, target = {}) => {
  const mediaId = String(media?.id || '').trim();
  const targetId = String(target?.id || '').trim();
  if (mediaId && targetId && mediaId === targetId) return true;
  const mediaSet = buildMediaMatchSet(media);
  const targetSet = buildMediaMatchSet(target);
  for (const value of mediaSet) {
    if (targetSet.has(value)) return true;
  }
  return false;
};

const STORAGE_URL_MARKER = '/storage/v1/object/public/';

const parseStorageTargetFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const markerIndex = url.indexOf(STORAGE_URL_MARKER);
  if (markerIndex === -1) return null;
  const storagePath = url.slice(markerIndex + STORAGE_URL_MARKER.length);
  const firstSlash = storagePath.indexOf('/');
  if (firstSlash === -1) return null;
  const bucket = storagePath.slice(0, firstSlash);
  const path = decodeURIComponent(storagePath.slice(firstSlash + 1));
  if (!bucket || !path) return null;
  return { bucket, path };
};

const extractMediaStorageTargets = (media = {}) => {
  const targets = [];
  const seen = new Set();
  [media.url, media.thumbnailUrl, media.thumbnail_url, media.previewUrl].forEach((value) => {
    const target = parseStorageTargetFromUrl(String(value || '').trim());
    if (!target) return;
    const key = `${target.bucket}:${target.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  });
  return targets;
};

const removeMediaFromStorage = async (media = {}) => {
  const targets = extractMediaStorageTargets(media);
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(async (target) => {
      const { error } = await supabase.storage.from(target.bucket).remove([target.path]);
      if (error) {
        console.warn('Failed to remove media from storage:', error);
      }
    })
  );
};

const slugifyUploadSegment = (value = 'tour-package') => {
  const segment = String(value || 'tour-package')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return segment || 'tour-package';
};

const getMediaTypeFromFile = (file) => {
  if (file?.type?.startsWith('video/')) return 'video';
  return 'image';
};

const getUploadCaption = (file) =>
  String(file?.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

const createHighlight = (index = 0) => ({
  id: presentationId('highlight', index),
  label: '',
});

const moveItem = (items = [], index, direction) => {
  const next = [...items];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= next.length) return next;
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 }));
};

const moveStopMediaItem = (items = [], index, direction) =>
  moveItem(normalizeStopMedia(items), index, direction).slice(0, 3);

const formatDurationLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0h';
  if (numeric % 1 === 0) {
    return `${numeric.toFixed(0)} hour${numeric === 1 ? '' : 's'}`;
  }
  return `${numeric.toFixed(1)} hours`;
};

const normalizeFlexibleDuration = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(1));
};

const getVehicleModelCatalogName = (model) => {
  if (!model) return 'Unknown model';
  const name = String(model.name || '').trim();
  const variant = String(model.model || '').trim();
  if (name && variant && name.toLowerCase().includes(variant.toLowerCase())) {
    return name;
  }
  return [name, variant].filter(Boolean).join(' ').trim() || `Model ${model.id}`;
};

const normalizePackage = (pkg) => {
  const rules = {
    ...defaultPackageRules,
    ...(extractMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER) || {}),
  };
  const publicPresentation = {
    ...defaultPackageRules.publicPresentation,
    ...(rules.publicPresentation || {}),
  };
  const resolvedRouteStops = Array.isArray(pkg.route_stops_json) && pkg.route_stops_json.length > 0
    ? pkg.route_stops_json
    : (Array.isArray(publicPresentation.routeStops) && publicPresentation.routeStops.length > 0
      ? publicPresentation.routeStops
      : (pkg.routeStops || []));
  const resolvedMediaGallery = Array.isArray(publicPresentation.mediaGallery) && publicPresentation.mediaGallery.length > 0
    ? publicPresentation.mediaGallery
    : (pkg.mediaGallery || pkg.media_gallery_json || []);
  const resolvedHighlights = Array.isArray(publicPresentation.publicHighlights) && publicPresentation.publicHighlights.length > 0
    ? publicPresentation.publicHighlights
    : (pkg.publicHighlights || pkg.public_highlights_json || []);
  const cleanDescription = stripMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER);

  return {
    ...pkg,
    description: cleanDescription,
    routeType: String(pkg.routeType || pkg.route_type || rules.routeType),
    requiresLicense: Boolean(pkg.requiresLicense ?? pkg.requires_license ?? rules.requiresLicense),
    maxQuads: Number(pkg.maxQuads || pkg.max_quads || rules.maxQuads) || 5,
    bufferBeforeMinutes: Number(pkg.bufferBeforeMinutes || pkg.buffer_before_minutes || rules.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(pkg.bufferAfterMinutes || pkg.buffer_after_minutes || rules.bufferAfterMinutes) || 30,
    websiteVisible: Boolean(pkg.websiteVisible ?? pkg.website_visible ?? rules.websiteVisible),
    publicTitle: String(pkg.publicTitle || pkg.public_title || publicPresentation.publicTitle || '').trim(),
    publicSummary: String(pkg.publicSummary || pkg.public_summary || publicPresentation.publicSummary || '').trim(),
    routeLabel: String(pkg.routeLabel || pkg.route_label || publicPresentation.routeLabel || '').trim(),
    routeStops: normalizeRouteStops(resolvedRouteStops),
    mediaGallery: normalizeMediaGallery(resolvedMediaGallery),
    publicHighlights: normalizeHighlights(resolvedHighlights),
    displayOrder: Number(pkg.displayOrder || pkg.display_order || publicPresentation.displayOrder || 0),
    coverImageUrl: String(publicPresentation.coverImageUrl || pkg.coverImageUrl || pkg.cover_image_url || '').trim(),
    durationDisplay: String(pkg.durationDisplay || pkg.duration_display || publicPresentation.durationDisplay || '').trim(),
    stopCount: Number(pkg.stopCount ?? pkg.stop_count ?? publicPresentation.stopCount ?? 0) || 0,
    difficultyLabel: normalizeDifficultyLabel(pkg.difficultyLabel || publicPresentation.difficultyLabel || pkg.difficulty_label || ''),
  };
};

const buildPackagePayload = (formData) => {
  const normalizedStops = normalizeRouteStops(formData.routeStops);
  const normalizedHighlights = normalizeHighlights(formData.publicHighlights).slice(0, 6);
  const stopCount = normalizedStops.length;
  const rules = {
    routeType: formData.routeType,
    requiresLicense: formData.requiresLicense,
    maxQuads: Number(formData.maxQuads) || 5,
    bufferBeforeMinutes: Number(formData.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(formData.bufferAfterMinutes) || 30,
    websiteVisible: formData.websiteVisible,
    publicPresentation: {
      publicTitle: String(formData.publicTitle || '').trim(),
      publicSummary: String(formData.publicSummary || '').trim(),
      routeLabel: String(formData.routeLabel || '').trim(),
      routeStops: normalizedStops,
      mediaGallery: normalizeMediaGallery(formData.mediaGallery).slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS),
      publicHighlights: normalizedHighlights,
      displayOrder: Number(formData.displayOrder) || 0,
      coverImageUrl: String(formData.coverImageUrl || '').trim(),
      durationDisplay: String(formData.durationDisplay || '').trim(),
      stopCount,
      difficultyLabel: normalizeDifficultyLabel(formData.difficultyLabel),
    },
  };

  return {
    name: formData.name.trim(),
    description: appendMarkedJson(formData.description || '', TOUR_PACKAGE_RULES_MARKER, rules),
    duration: Number(formData.duration) || 1,
    default_rate_1h: Number(formData.default_rate_1h) || 0,
    default_rate_2h: Number(formData.default_rate_2h) || 0,
    vip_rate_1h: Number(formData.vip_rate_1h) || 0,
    vip_rate_2h: Number(formData.vip_rate_2h) || 0,
    location: formData.location || 'Main Base',
    is_active: formData.is_active !== false,
    routeType: formData.routeType,
    requiresLicense: Boolean(formData.requiresLicense),
    maxQuads: Number(formData.maxQuads) || 5,
    bufferBeforeMinutes: Number(formData.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(formData.bufferAfterMinutes) || 30,
    websiteVisible: Boolean(formData.websiteVisible),
    publicTitle: String(formData.publicTitle || '').trim(),
    publicSummary: String(formData.publicSummary || '').trim(),
    routeLabel: String(formData.routeLabel || '').trim(),
    routeStops: normalizedStops,
    mediaGallery: normalizeMediaGallery(formData.mediaGallery).slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS),
    publicHighlights: normalizedHighlights,
    displayOrder: Number(formData.displayOrder) || 0,
    coverImageUrl: String(formData.coverImageUrl || '').trim(),
    durationDisplay: String(formData.durationDisplay || '').trim(),
    stopCount,
    difficultyLabel: normalizeDifficultyLabel(formData.difficultyLabel),
  };
};

const getLegacyPackagePricingBadge = () => 'Set pricing';

const normalizeDifficultyLabel = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered.startsWith('easy')) return 'Easy';
  if (lowered.startsWith('medium') || lowered.startsWith('med')) return 'Medium';
  if (lowered.startsWith('difficult') || lowered.startsWith('hard')) return 'Difficult';
  return raw;
};

const hasTourPricingRows = (rows = [], packageId) =>
  rows.some((row) =>
    Number(row?.price_mad || 0) > 0 &&
    (String(row?.package_id) === String(packageId) || String(row?.package_id) === GLOBAL_TOUR_PRICING_KEY)
  );

const packageToForm = (pkg) => {
  const normalizedGallery = normalizeMediaGallery(pkg.mediaGallery);
  const rawCover = String(pkg.coverImageUrl || '').trim();
  const coverStillExists = normalizedGallery.some((item) => {
    const url = String(item?.url || '').trim();
    const thumb = String(item?.thumbnailUrl || item?.thumbnail_url || '').trim();
    return Boolean(rawCover && (rawCover === url || rawCover === thumb));
  });
  const resolvedCover = coverStillExists
    ? rawCover
    : String(
      normalizedGallery[0]?.thumbnailUrl ||
      normalizedGallery[0]?.thumbnail_url ||
      normalizedGallery[0]?.url ||
      ''
    ).trim();

  return {
    ...initialPackageForm,
    ...pkg,
    duration: normalizeFlexibleDuration(pkg.duration) || 1,
    publicTitle: pkg.publicTitle || '',
    publicSummary: pkg.publicSummary || '',
    routeLabel: pkg.routeLabel || '',
    routeStops: normalizeRouteStops(pkg.routeStops),
    mediaGallery: normalizedGallery,
    publicHighlights: normalizeHighlights(pkg.publicHighlights),
    displayOrder: Number(pkg.displayOrder || 0),
    coverImageUrl: resolvedCover,
    durationDisplay: pkg.durationDisplay || '',
    stopCount: Number(pkg.stopCount || 0),
    difficultyLabel: normalizeDifficultyLabel(pkg.difficultyLabel),
  };
};

const createPackageSaveSignature = (formData = initialPackageForm) => {
  try {
    return JSON.stringify(buildPackagePayload(formData));
  } catch (error) {
    console.warn('Failed to build package save signature:', error);
    return '';
  }
};

const TourPackagesWorkspace = () => {
  const { userProfile } = useAuth();
  const canManagePackages = canManageTourPackagesPermission(userProfile);

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [tourPricingRows, setTourPricingRows] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [packageForm, setPackageForm] = useState(initialPackageForm);
  const [customPackageCapacity, setCustomPackageCapacity] = useState(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
  const [editorTab, setEditorTab] = useState('details');
  const [mediaRoadmapTab, setMediaRoadmapTab] = useState('media');
  const [showDefaultPricing, setShowDefaultPricing] = useState(false);
  const [roadmapCollapsed, setRoadmapCollapsed] = useState(false);
  const [roadmapSaving, setRoadmapSaving] = useState(false);
  const mediaInputRef = useRef(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaDragActive, setMediaDragActive] = useState(false);
  const [activeMediaEditorIndex, setActiveMediaEditorIndex] = useState(null);
  const [mediaResolving, setMediaResolving] = useState(false);
  const [packageDirty, setPackageDirty] = useState(false);
  const [lastPackageSavedAt, setLastPackageSavedAt] = useState(null);
  const [packageSaveBounce, setPackageSaveBounce] = useState(false);
  const [savedPackageSignature, setSavedPackageSignature] = useState(() => createPackageSaveSignature(initialPackageForm));
  const stopMediaInputRefs = useRef({});
  const roadmapAutosaveRef = useRef(null);
  const embeddedAllowedDurations = useMemo(() => [packageForm.duration], [packageForm.duration]);
  const formatSavedTime = (value) => {
    if (!value) return '';
    const dateValue = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dateValue.getTime())) return '';
    return dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const loadPackages = async () => {
    setPackagesLoading(true);
    try {
      const [{ data, error }, pricingData] = await Promise.all([
        fetchTourPackages(),
        fetchTourPackageModelPrices().catch((pricingError) => {
          console.warn('Tour pricing matrix unavailable while loading packages:', pricingError);
          return [];
        }),
      ]);

      setTourPricingRows(Array.isArray(pricingData) ? pricingData : []);

      if (error) {
        console.error('Failed to load tour packages:', error);
        toast.error('Could not load tour packages');
        setPackages([]);
      } else {
        setPackages((data || []).map(normalizePackage));
      }
    } catch (loadError) {
      console.error('Failed to load package board:', loadError);
      toast.error('Could not load package board');
      setPackages([]);
      setTourPricingRows([]);
    } finally {
      setPackagesLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  useEffect(() => {
    const loadVehicleModels = async () => {
      try {
        const data = await VehicleModelPricingService.getActiveVehicleModels();
        setVehicleModels(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn('Failed to load vehicle models for package readiness:', error);
        setVehicleModels([]);
      }
    };

    loadVehicleModels();
  }, []);

  useEffect(() => {
    const nextSignature = createPackageSaveSignature(packageForm);
    setPackageDirty(nextSignature !== savedPackageSignature);
  }, [packageForm, savedPackageSignature]);

  const updateRouteStop = (index, changes) => {
    setPackageForm((prev) => ({
      ...prev,
      routeStops: prev.routeStops.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item
      ),
    }));
    setPackageDirty(true);
  };

  const getRoadmapStopKindLabel = (kind) =>
    ROADMAP_STOP_KIND_OPTIONS.find((option) => option.id === kind)?.label || 'Stop';

  const globalDurationChoices = useMemo(() => {
    const durations = Array.from(
      new Set(
        tourPricingRows
          .filter((row) => String(row?.package_id) === GLOBAL_TOUR_PRICING_KEY)
          .map((row) => Number(row?.duration_hours))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    ).sort((a, b) => a - b);

    return durations.length > 0 ? durations : [...PACKAGE_DURATION_OPTIONS];
  }, [tourPricingRows]);

  const packageDurationChoices = useMemo(() => {
    const currentDuration = normalizeFlexibleDuration(packageForm.duration) || 1;
    return Array.from(new Set([...globalDurationChoices, currentDuration])).sort((a, b) => a - b);
  }, [globalDurationChoices, packageForm.duration]);

  const selectedPackagePreview = useMemo(() => {
    if (!packageEditorOpen) return null;
    if (!editingPackageId) {
      return {
        id: 'draft',
        name: packageForm.name || 'New Package',
        is_active: packageForm.is_active,
        duration: packageForm.duration,
        routeType: packageForm.routeType,
        maxQuads: packageForm.maxQuads,
      };
    }

    return packages.find((pkg) => String(pkg.id) === String(editingPackageId)) || {
      id: editingPackageId,
      name: packageForm.name || 'Selected Package',
      is_active: packageForm.is_active,
      duration: packageForm.duration,
      routeType: packageForm.routeType,
      maxQuads: packageForm.maxQuads,
    };
  }, [packageEditorOpen, editingPackageId, packageForm, packages]);

  const getPackagePricingBadge = (pkg) => {
    const startingPrice = getTourPackageStartingPrice({
      rows: tourPricingRows,
      packageId: pkg?.id,
      durationHours: pkg?.duration,
    });

    if (startingPrice > 0) return `From ${startingPrice} MAD`;
    if (hasTourPricingRows(tourPricingRows, pkg?.id)) return 'Model pricing';
    return getLegacyPackagePricingBadge();
  };

  const getPackageModelPriceHighlights = (pkg) => {
    if (!pkg) return [];

    return (vehicleModels || [])
      .map((model) => {
        const price = getTourPriceForModelAndDuration({
          rows: tourPricingRows,
          packageId: pkg?.id,
          vehicleModelId: model.id,
          durationHours: pkg?.duration,
        });

        if (!(price > 0)) return null;

        return {
          modelId: String(model.id),
          label: getVehicleModelCatalogName(model),
          price,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));
  };

  const getPackageReadiness = (pkg) => {
    const currentDuration = Number(pkg?.duration || 0);
    const relevantRows = tourPricingRows.filter(
      (row) =>
        (String(row.package_id) === String(pkg?.id || '') || String(row.package_id) === GLOBAL_TOUR_PRICING_KEY) &&
        Number(row.duration_hours) === currentDuration &&
        Number(row.price_mad || 0) > 0
    );

    if (vehicleModels.length === 0) {
      return {
        label: relevantRows.length > 0 ? 'Pricing Set' : 'Pricing Incomplete',
        tone: relevantRows.length > 0 ? 'ready' : 'incomplete',
        note: relevantRows.length > 0
          ? `Prices saved for ${formatDurationLabel(currentDuration)}.`
          : `Add prices for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    const pricedModelIds = new Set(relevantRows.map((row) => String(row.vehicle_model_id)));
    const missingCount = vehicleModels.filter((model) => !pricedModelIds.has(String(model.id))).length;

    if (missingCount === 0) {
      return {
        label: 'Package Ready',
        tone: 'ready',
        note: `All active quad models are priced for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    if (pricedModelIds.size === 0) {
      return {
        label: 'Pricing Incomplete',
        tone: 'incomplete',
        note: `No quad prices set yet for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    return {
      label: 'Pricing Partial',
      tone: 'partial',
      note: `${missingCount} model${missingCount > 1 ? 's still need' : ' still needs'} a price for ${formatDurationLabel(currentDuration)}.`,
    };
  };

  const resetEditor = () => {
    setPackageEditorOpen(false);
    setEditingPackageId(null);
    setPackageForm(initialPackageForm);
    setSavedPackageSignature(createPackageSaveSignature(initialPackageForm));
    setCustomPackageCapacity(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
    setEditorTab('details');
    setMediaRoadmapTab('media');
    setActiveMediaEditorIndex(null);
    setRoadmapCollapsed(false);
  };

  const handleOpenPackageEditor = (pkg = null) => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can manage tour packages');
      return;
    }

    if (pkg) {
      const normalizedDuration = normalizeFlexibleDuration(pkg.duration) || 1;
      const nextForm = packageToForm({ ...pkg, duration: normalizedDuration });
      setPackageForm(nextForm);
      setSavedPackageSignature(createPackageSaveSignature(nextForm));
      setCustomPackageCapacity(String(Number(pkg.maxQuads || 5)));
      setEditingPackageId(pkg.id);
      setLastPackageSavedAt(pkg.updatedAt ? new Date(pkg.updatedAt) : null);
    } else {
      setPackageForm(initialPackageForm);
      setSavedPackageSignature(createPackageSaveSignature(initialPackageForm));
      setCustomPackageCapacity(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
      setEditingPackageId(null);
      setLastPackageSavedAt(null);
    }

    setEditorTab('details');
    setMediaRoadmapTab('media');
    setActiveMediaEditorIndex(null);
    setRoadmapCollapsed(false);
    setPackageEditorOpen(true);
  };

  const handleSavePackage = async () => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can create or update tour packages');
      return;
    }
    if (editingPackageId && !packageDirty) {
      toast.success('All changes are already saved');
      return;
    }
    if (!packageForm.name.trim()) {
      toast.error('Package name is required');
      return;
    }

    const payload = buildPackagePayload(packageForm);
    const result = editingPackageId
      ? await updateTourPackage(editingPackageId, payload)
      : await createTourPackage(payload);

    if (result.error) {
      console.error('Failed to save tour package:', result.error);
      toast.error(result.error.message || 'Could not save package');
      return;
    }

    const savedPackage = result?.data ? normalizePackage(result.data) : null;
    if (savedPackage) {
      const optimisticPackage = {
        ...savedPackage,
        mediaGallery: normalizeMediaGallery(packageForm.mediaGallery || []),
        coverImageUrl: String(packageForm.coverImageUrl || '').trim(),
      };
      setPackages((prev) => {
        const withoutCurrent = prev.filter((pkg) => String(pkg.id) !== String(savedPackage.id));
        return [optimisticPackage, ...withoutCurrent].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      });
      setEditingPackageId(savedPackage.id);
      setPackageForm({
        ...packageToForm(optimisticPackage),
        duration: normalizeFlexibleDuration(savedPackage.duration) || 1,
      });
      setCustomPackageCapacity(String(Number(savedPackage.maxQuads || 5)));
      setSavedPackageSignature(createPackageSaveSignature({
        ...packageToForm(optimisticPackage),
        duration: normalizeFlexibleDuration(savedPackage.duration) || 1,
      }));
      setLastPackageSavedAt(new Date());
      setPackageSaveBounce(true);
      window.setTimeout(() => setPackageSaveBounce(false), 460);
    }

    toast.success(editingPackageId ? 'Package updated' : 'Package created');
    setPackageEditorOpen(true);
    if (!editingPackageId) {
      setEditorTab('pricing');
    }
    // Avoid overwriting fresh local media with stale cached data.
  };

  const persistPackageForm = async (nextForm, successMessage = 'Package updated') => {
    if (!editingPackageId) return null;

    const payload = buildPackagePayload(nextForm);
    const result = await updateTourPackage(editingPackageId, payload);
    if (result.error) {
      throw result.error;
    }

    const savedPackage = result?.data ? normalizePackage(result.data) : null;
    if (savedPackage) {
      const optimisticPackage = {
        ...savedPackage,
        mediaGallery: normalizeMediaGallery(nextForm.mediaGallery || []),
        coverImageUrl: String(nextForm.coverImageUrl || '').trim(),
      };
      setPackages((prev) => {
        const withoutCurrent = prev.filter((pkg) => String(pkg.id) !== String(savedPackage.id));
        return [optimisticPackage, ...withoutCurrent].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      });
      setEditingPackageId(savedPackage.id);
      setPackageForm(nextForm);
      setSavedPackageSignature(createPackageSaveSignature(nextForm));
      setLastPackageSavedAt(new Date());
      toast.success(successMessage);
    }

    return savedPackage;
  };

  const persistPackageMedia = async (nextForm, successMessage = 'Media updated') => {
    if (!editingPackageId) return null;

    const payloadMedia = normalizeMediaGallery(nextForm.mediaGallery || []);
    const payloadCover = String(nextForm.coverImageUrl || '').trim();
    const result = await updateTourPackageMedia(editingPackageId, payloadMedia, payloadCover);
    if (result.error) {
      throw result.error;
    }

    const savedPackage = result?.data ? normalizePackage(result.data) : null;
    if (savedPackage) {
      const optimisticPackage = {
        ...savedPackage,
        mediaGallery: normalizeMediaGallery(nextForm.mediaGallery || []),
        coverImageUrl: String(nextForm.coverImageUrl || '').trim(),
      };
      setPackages((prev) => {
        const withoutCurrent = prev.filter((pkg) => String(pkg.id) !== String(savedPackage.id));
        return [optimisticPackage, ...withoutCurrent].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      });
      setEditingPackageId(savedPackage.id);
      setPackageForm(nextForm);
      setSavedPackageSignature(createPackageSaveSignature(nextForm));
      toast.success(successMessage);
    }

    return savedPackage;
  };

  const persistPackageRoadmap = async (nextForm, successMessage = 'Roadmap updated') => {
    if (!editingPackageId) return null;
    if (roadmapSaving) return null;

    const normalizedStops = normalizeRouteStops(Array.isArray(nextForm.routeStops) ? nextForm.routeStops : []);
    let savedPackage = null;

    setRoadmapSaving(true);
    try {
      try {
        const roadmapResult = await updateTourPackageRoadmap(editingPackageId, normalizedStops);
        savedPackage = roadmapResult?.data ? normalizePackage(roadmapResult.data) : null;
      } catch (error) {
        console.warn('Roadmap update failed, retrying with full payload:', error);
      }

      if (!savedPackage) {
        const fallbackPayload = buildPackagePayload({
          ...nextForm,
          routeStops: normalizedStops,
          stopCount: normalizedStops.length,
        });
        const fallbackResult = await updateTourPackage(editingPackageId, fallbackPayload);
        savedPackage = fallbackResult?.data ? normalizePackage(fallbackResult.data) : null;
      }

      if (!savedPackage) {
        throw new Error('Roadmap did not persist. Please retry.');
      }

      const optimisticPackage = {
        ...savedPackage,
        routeStops: normalizedStops.length > 0 ? normalizedStops : savedPackage.routeStops,
        stopCount: normalizedStops.length > 0 ? normalizedStops.length : savedPackage.stopCount || 0,
        mediaGallery: normalizeMediaGallery(nextForm.mediaGallery || []),
        coverImageUrl: String(nextForm.coverImageUrl || '').trim(),
      };
      setPackages((prev) => {
        const withoutCurrent = prev.filter((pkg) => String(pkg.id) !== String(savedPackage.id));
        return [optimisticPackage, ...withoutCurrent].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      });
      setEditingPackageId(savedPackage.id);
      setPackageForm({
        ...packageToForm(optimisticPackage),
        routeStops: normalizedStops.length > 0 ? normalizedStops : packageToForm(optimisticPackage).routeStops,
        stopCount: normalizedStops.length > 0 ? normalizedStops.length : optimisticPackage.stopCount || 0,
      });
      setSavedPackageSignature(createPackageSaveSignature({
        ...packageToForm(optimisticPackage),
        routeStops: normalizedStops.length > 0 ? normalizedStops : packageToForm(optimisticPackage).routeStops,
        stopCount: normalizedStops.length > 0 ? normalizedStops.length : optimisticPackage.stopCount || 0,
      }));
      if (successMessage) {
        toast.success(successMessage);
      }
    } finally {
      setRoadmapSaving(false);
    }

    return savedPackage;
  };

  const applyPackageFormUpdate = async (updater, successMessage = 'Package updated') => {
    const nextForm = typeof updater === 'function' ? updater(packageForm) : updater;
    setPackageForm(nextForm);

    if (!editingPackageId) {
      if (successMessage) {
        toast.success(successMessage);
      }
      return nextForm;
    }

    await persistPackageForm(nextForm, successMessage);
    return nextForm;
  };

  const handleCompleteMediaEditor = async () => {
    if (activeMediaEditorIndex === null) return;

    const currentItem = packageForm.mediaGallery?.[activeMediaEditorIndex];
    if (!currentItem) {
      setActiveMediaEditorIndex(null);
      return;
    }

    if (!String(currentItem.url || '').trim()) {
      toast.error(currentItem.type === 'instagram' ? 'Instagram link is required' : 'Media URL is required');
      return;
    }

    if (editingPackageId) {
      setMediaResolving(true);
      try {
        const saveMessage = currentItem.type === 'instagram' ? 'Instagram preview parsed' : 'Media entry saved';
        const savedPackage = await persistPackageMedia(packageForm, saveMessage);
        if (savedPackage) {
          const resolvedMedia = Array.isArray(savedPackage.mediaGallery) ? savedPackage.mediaGallery : [];
          const resolvedIndex = resolvedMedia.findIndex((item) => String(item.id) === String(currentItem.id));
          setActiveMediaEditorIndex(resolvedIndex >= 0 ? resolvedIndex : null);
        } else {
          setActiveMediaEditorIndex(null);
        }
      } catch (error) {
        console.error('Failed to resolve Instagram preview:', error);
        toast.error(error.message || 'Could not parse Instagram preview');
        return;
      } finally {
        setMediaResolving(false);
      }
    } else {
      setActiveMediaEditorIndex(null);
      toast.success(currentItem.type === 'instagram' ? 'Instagram entry ready' : 'Media entry ready');
    }
  };

  const handleMediaFiles = async (fileList = []) => {
    if (mediaUploading) return;

    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    const supportedFiles = files.filter((file) =>
      file?.type?.startsWith('image/') || file?.type?.startsWith('video/')
    );

    if (supportedFiles.length === 0) {
      toast.error('Import image or video files only');
      return;
    }

    const currentMediaCount = packageForm.mediaGallery?.length || 0;
    const availableSlots = Math.max(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS - currentMediaCount);

    if (availableSlots === 0) {
      toast.error(`Public website media supports up to ${MAX_PUBLIC_TOUR_MEDIA_ITEMS} items`);
      return;
    }

    const filesToUpload = supportedFiles.slice(0, availableSlots);
    if (supportedFiles.length > filesToUpload.length) {
      toast(`Only the first ${MAX_PUBLIC_TOUR_MEDIA_ITEMS} media items are kept for this package`);
    }

    setMediaUploading(true);
    try {
      const packageSegment = editingPackageId
        ? String(editingPackageId)
        : slugifyUploadSegment(packageForm.name || packageForm.publicTitle || 'draft-package');
      const uploadedItems = [];

      for (const file of filesToUpload) {
        const mediaType = getMediaTypeFromFile(file);
        const uploadBucket = mediaType === 'video' ? 'rental-videos' : 'vehicle-images';
        const result = await uploadFile(file, {
          bucket: uploadBucket,
          pathPrefix: `tour-packages/${packageSegment}`,
          optimizationProfile: mediaType === 'image' ? 'photo' : null,
        });

        if (!result?.success || !result?.url) {
          throw new Error(result?.error || `Could not upload ${file.name || 'media file'}`);
        }

        const itemIndex = currentMediaCount + uploadedItems.length;
        uploadedItems.push({
          ...createMediaItem(itemIndex),
          type: mediaType,
          url: result.url,
          caption: getUploadCaption(file),
          sort_order: itemIndex + 1,
        });
      }

      const nextForm = (() => {
        const firstUploadedImage = uploadedItems.find((item) => item.type === 'image');
        return {
          ...packageForm,
          coverImageUrl: packageForm.coverImageUrl || firstUploadedImage?.url || packageForm.coverImageUrl,
          mediaGallery: [...(packageForm.mediaGallery || []), ...uploadedItems].slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS),
        };
      })();

      setPackageForm(nextForm);
      setActiveMediaEditorIndex(null);

      if (editingPackageId) {
        await persistPackageMedia(
          nextForm,
          `${uploadedItems.length} media item${uploadedItems.length === 1 ? '' : 's'} imported`
        );
      } else {
        toast.success(`${uploadedItems.length} media item${uploadedItems.length === 1 ? '' : 's'} imported`);
      }
    } catch (error) {
      console.error('Tour package media upload failed:', error);
      toast.error(error.message || 'Could not import media');
    } finally {
      setMediaUploading(false);
      setMediaDragActive(false);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = '';
      }
    }
  };

  const handleStopMediaFiles = async (stopIndex, fileList = []) => {
    if (mediaUploading) return;
    if (!editingPackageId) {
      toast.error('Save the package first before adding stop media');
      return;
    }

    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    const supportedFiles = files.filter((file) =>
      file?.type?.startsWith('image/') || file?.type?.startsWith('video/')
    );

    if (supportedFiles.length === 0) {
      toast.error('Import image or video files only');
      return;
    }

    setMediaUploading(true);
    try {
      const packageSegment = editingPackageId ? editingPackageId : `draft_${Date.now()}`;
      const currentStops = packageForm.routeStops || [];
      const targetStop = currentStops[stopIndex];
      if (!targetStop) return;

      const existingMedia = normalizeStopMedia(targetStop.media || []);
      const availableSlots = Math.max(0, 3 - existingMedia.length);
      if (availableSlots === 0) {
        toast.error('Each stop can show up to 3 media items');
        return;
      }

      const filesToUpload = supportedFiles.slice(0, availableSlots);
      if (supportedFiles.length > filesToUpload.length) {
        toast('Only the first 3 media items are kept for this stop');
      }

      const uploads = await Promise.all(
        filesToUpload.map((file) =>
          uploadFile(file, {
            bucket: file.type?.startsWith('video/') ? 'rental-videos' : 'vehicle-images',
            pathPrefix: `tour-packages/${packageSegment}/stops/${targetStop.id}`,
            optimizationProfile: file.type?.startsWith('image/') ? 'photo' : null,
          })
        )
      );

      const newMedia = uploads
        .filter((upload) => upload?.success && upload.url)
        .map((upload, index) => ({
          id: presentationId('stop_media', index),
          type: filesToUpload[index]?.type?.startsWith('video/') ? 'video' : 'image',
          url: upload.url,
          thumbnailUrl: upload.url,
          caption: '',
          sort_order: existingMedia.length + index + 1,
        }));

      const nextStops = currentStops.map((stop, index) => {
        if (index !== stopIndex) return stop;
        return {
          ...stop,
          media: normalizeStopMedia([...(stop.media || []), ...newMedia]),
        };
      });
      const nextForm = {
        ...packageForm,
        routeStops: nextStops,
        stopCount: normalizeRouteStops(nextStops).length,
      };

      setPackageForm(nextForm);

      try {
        await persistPackageRoadmap(nextForm, 'Stop media saved');
      } catch (error) {
        console.error('Failed to save stop media:', error);
        toast.error(error.message || 'Could not save stop media');
        return;
      }

      toast.success('Stop media added');
    } catch (error) {
      console.error('Failed to upload stop media:', error);
      toast.error(error.message || 'Could not upload stop media');
    } finally {
      setMediaUploading(false);
    }
  };

  const handleMediaDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMediaDragActive(false);
    handleMediaFiles(event.dataTransfer?.files || []);
  };

  const handleMediaDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!mediaUploading) {
      setMediaDragActive(true);
    }
  };

  const handleMediaDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMediaDragActive(false);
  };

  const handleDeletePackage = async (pkgId) => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can delete tour packages');
      return;
    }

    const { error } = await deleteTourPackage(pkgId);
    if (error) {
      console.error('Failed to delete package:', error);
      toast.error('Could not delete package');
      return;
    }

    toast.success('Package removed');
    if (String(editingPackageId) === String(pkgId)) {
      resetEditor();
    }
    await loadPackages();
  };

  return (
    <div className="space-y-6 rounded-[2rem] bg-slate-200/70 p-5 shadow-inner shadow-slate-300/30 sm:p-7">
      {!packageEditorOpen && (
        <section className="rounded-[1.8rem] border border-violet-100 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-500">Default Pricing</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Default durations & model prices</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                Set your default tour durations and prices here. Packages will auto‑fill from these defaults so staff only pick a
                duration and a vehicle model when creating a package.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
                Auto‑fill source for packages
              </div>
              <button
                type="button"
                onClick={() => setShowDefaultPricing((prev) => !prev)}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                {showDefaultPricing ? 'Hide defaults' : 'Show defaults'}
              </button>
            </div>
          </div>
          {showDefaultPricing && (
            <div className="mt-5">
              <TourPackagePricingManager
                embedded
                showPackagePicker={false}
                selectedPackageId={GLOBAL_TOUR_PRICING_KEY}
                selectedPackage={null}
                onPricingRowsChange={setTourPricingRows}
              />
            </div>
          )}
        </section>
      )}

      <div className={`grid gap-6 ${(packageEditorOpen || showDefaultPricing) ? 'xl:grid-cols-1' : 'xl:grid-cols-[340px_minmax(0,1fr)]'}`}>
        {!packageEditorOpen && !showDefaultPricing && (
        <section className="rounded-[1.75rem] border border-white bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Packages</p>
              <h2 className="mt-2 text-[1.45rem] font-semibold text-slate-900">
                {canManagePackages ? 'Choose a package' : 'Tour packages'}
              </h2>
            </div>
            {canManagePackages && (
              <button
                type="button"
                onClick={() => handleOpenPackageEditor()}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-violet-100 transition hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" />
                Add Package
              </button>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {packagesLoading ? (
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-6 text-sm font-semibold text-slate-500">Loading packages...</div>
            ) : packages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm font-semibold text-slate-500">
                No package yet. Add your first city or mountain offer here.
              </div>
            ) : (
              packages.map((pkg) => {
                const readiness = getPackageReadiness(pkg);
                const modelPriceHighlights = getPackageModelPriceHighlights(pkg);
                const previewMedia = getPreviewMediaItems(pkg, 3);
                const readinessClasses = readiness.tone === 'ready'
                  ? 'bg-emerald-100 text-emerald-700'
                  : readiness.tone === 'partial'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700';

                return (
                  <article
                    key={pkg.id}
                    className={`relative overflow-hidden rounded-3xl border p-4 transition ${
                      String(editingPackageId) === String(pkg.id)
                        ? 'border-violet-200 bg-white shadow-sm shadow-violet-100/70'
                        : 'border-slate-300/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] hover:border-violet-200 hover:shadow-violet-100/70'
                    }`}
                  >
                    {String(editingPackageId) === String(pkg.id) ? (
                      <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-violet-300" />
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-slate-900">{pkg.name}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${pkg.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                            {pkg.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${pkg.websiteVisible ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {pkg.websiteVisible ? 'Public' : 'Internal'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
                            {formatDurationLabel(pkg.duration)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">
                            {pkg.routeType}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {getPackagePricingBadge(pkg)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                            {pkg.mediaGallery?.length || 0} media
                          </span>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${readinessClasses}`}>
                        {readiness.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                      <span>{pkg.maxQuads} quads</span>
                      <span className="truncate text-right">{readiness.note}</span>
                    </div>

                    {previewMedia.length > 0 ? (
                      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                        <div className="relative h-16 w-[122px] shrink-0">
                          {previewMedia.map((item, index) => {
                            const rotateClass = index === 0 ? '-rotate-6' : index === 1 ? 'rotate-0' : 'rotate-6';
                            const offsetClass = index === 0 ? 'left-0 top-2' : index === 1 ? 'left-5 top-1' : 'left-10 top-0';
                            return (
                              <div
                                key={`${pkg.id}-preview-${item.url}-${index}`}
                                className={`absolute ${offsetClass} h-12 w-16 overflow-hidden rounded-2xl border border-white bg-slate-100 shadow-[0_8px_20px_rgba(15,23,42,0.16)] ${rotateClass}`}
                              >
                                {item.type === 'video' ? (
                                  <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                                ) : (
                                  <img src={item.url} alt={item.caption || pkg.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Website media</p>
                          <p className="mt-1 text-sm font-semibold text-slate-700">
                            {previewMedia.length} preview item{previewMedia.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {modelPriceHighlights.length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Vehicle pricing
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modelPriceHighlights.map((item) => (
                            <span
                              key={`${pkg.id}-${item.modelId}`}
                              className="rounded-full border border-violet-100 bg-white px-3 py-1 text-xs font-bold text-violet-700"
                            >
                              {item.label} • {item.price.toLocaleString('en-MA')} MAD
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPackageEditor(pkg)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open
                      </button>
                      {canManagePackages && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenPackageEditor(pkg);
                              setEditorTab('details');
                            }}
                            className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePackage(pkg.id)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
        )}

        <section className="rounded-[1.75rem] border border-white bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.09)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">
                {canManagePackages ? (editingPackageId ? 'Selected Package' : 'New Package') : 'Read Only'}
              </p>
              <h2 className="mt-2 break-words text-[1.65rem] font-semibold text-slate-900">
                {canManagePackages
                  ? (packageEditorOpen ? (packageForm.name || 'Package editor') : 'Open a package to edit')
                  : 'Packages are managed by admin or owner'}
              </h2>
            </div>
            {canManagePackages && packageEditorOpen && (
              <button
                type="button"
                onClick={resetEditor}
                className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-violet-100 transition hover:bg-violet-700 sm:w-auto"
              >
                Back to packages
              </button>
            )}
          </div>

          {!canManagePackages ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              You can use tour packages for booking, but only admin or owner can add, edit, or delete them.
            </div>
          ) : !packageEditorOpen ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              Pick a package from the list or add a new one.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="overflow-hidden rounded-[1.5rem] border border-violet-100 bg-violet-50/70 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${packageForm.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {packageForm.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatDurationLabel(packageForm.duration)}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                        {packageForm.routeType}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Keep package details, pricing, and advanced settings separate so staff can work faster.
                    </p>
                    {selectedPackagePreview && getPackageModelPriceHighlights(selectedPackagePreview).length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {getPackageModelPriceHighlights(selectedPackagePreview).map((item) => (
                          <span
                            key={`preview-${item.modelId}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100"
                          >
                            {item.label} • {item.price.toLocaleString('en-MA')} MAD
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => setEditorTab('website')}
                      className="min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-white px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-500">Media & roadmap</p>
                      <p className="mt-2 text-sm font-black text-slate-900">{packageForm.websiteVisible ? 'Public' : 'Internal'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{packageForm.mediaGallery.length} media item{packageForm.mediaGallery.length === 1 ? '' : 's'}</p>
                      {getPreviewMediaItems(packageForm, 3).length > 0 ? (
                        <div className="relative mt-3 h-14 w-[92px] sm:w-[110px]">
                          {getPreviewMediaItems(packageForm, 3).map((item, index) => {
                            const rotateClass = index === 0 ? '-rotate-6' : index === 1 ? 'rotate-0' : 'rotate-6';
                            const offsetClass = index === 0 ? 'left-0 top-2' : index === 1 ? 'left-3 top-1 sm:left-4' : 'left-6 top-0 sm:left-8';
                            return (
                              <div
                                key={`editor-preview-${item.url}-${index}`}
                                className={`absolute ${offsetClass} h-11 w-12 overflow-hidden rounded-xl border border-white bg-slate-100 shadow-[0_8px_20px_rgba(15,23,42,0.16)] sm:w-14 ${rotateClass}`}
                              >
                                {item.type === 'video' ? (
                                  <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                                ) : (
                                  <img src={item.url} alt={item.caption || packageForm.name} className="h-full w-full object-cover" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </button>
                    <div className="min-w-0 rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Model prices</p>
                      {selectedPackagePreview && getPackageModelPriceHighlights(selectedPackagePreview).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getPackageModelPriceHighlights(selectedPackagePreview).map((item) => (
                            <span
                              key={`header-price-${item.modelId}`}
                              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700"
                            >
                              {item.label} · {item.price.toLocaleString('en-MA')} MAD
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-slate-500">Select a model to set prices</p>
                      )}
                    </div>
                    <div className="min-w-0 rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Route</p>
                      <p className="mt-2 text-lg font-semibold capitalize text-slate-900">{packageForm.routeType}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Capacity</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{packageForm.maxQuads} quads</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3 shadow-inner shadow-slate-200/70">
                <div className="grid gap-2 grid-cols-2 xl:grid-cols-4">
                  {EDITOR_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = editorTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditorTab(tab.id)}
                        className={`min-w-0 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                          active ? 'bg-violet-600 text-white shadow-sm shadow-violet-100' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-violet-700'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate text-xs sm:text-sm">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-100/80 p-4 shadow-inner shadow-slate-300/60 sm:p-5">
              {editorTab === 'details' && (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Basics</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                        <label className="text-sm font-semibold text-slate-700">Package Name</label>
                        <input
                          type="text"
                          value={packageForm.name}
                          onChange={(event) => setPackageForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                          placeholder="City Tour - 1 Hour"
                        />
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                        <label className="text-sm font-semibold text-slate-700">Location</label>
                        <input
                          type="text"
                          value={packageForm.location}
                          onChange={(event) => setPackageForm((prev) => ({ ...prev, location: event.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                          placeholder="Main Base"
                        />
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                      <label className="text-sm font-semibold text-slate-700">Description</label>
                      <textarea
                        value={packageForm.description}
                        onChange={(event) => setPackageForm((prev) => ({ ...prev, description: event.target.value }))}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900"
                        placeholder="Write the route, highlights, and what the guest should know."
                      />
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                      <label className="text-sm font-semibold text-slate-700">Short public summary</label>
                      <textarea
                        value={packageForm.publicSummary}
                        onChange={(event) => setPackageForm((prev) => ({ ...prev, publicSummary: event.target.value }))}
                        rows={3}
                        maxLength={360}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900"
                        placeholder="A clean one-line description for the public website."
                      />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-violet-100 bg-[linear-gradient(180deg,rgba(245,243,255,0.94)_0%,rgba(255,255,255,0.98)_100%)] p-5 shadow-[0_18px_42px_rgba(79,70,229,0.08)]">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-bold text-violet-700">
                        {formatDurationLabel(packageForm.duration)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold capitalize text-slate-700">
                        {packageForm.routeType}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                        {packageForm.maxQuads} quads
                      </span>
                    </div>
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                        <label className="text-sm font-semibold text-slate-700">Duration</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {packageDurationChoices.map((hours) => (
                            <button
                              key={hours}
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, duration: hours }))}
                              className={`rounded-xl px-4 py-4 text-sm font-medium transition ${
                                Number(packageForm.duration) === hours
                                  ? 'border border-violet-300 bg-violet-600 text-white shadow-sm shadow-violet-200'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {formatDurationLabel(hours)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <label className="text-sm font-semibold text-slate-700">License Rule</label>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, requiresLicense: false }))}
                              className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                !packageForm.requiresLicense
                                  ? 'border border-emerald-300 bg-emerald-500 text-white shadow-sm'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              No License Needed
                            </button>
                            <button
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, requiresLicense: true }))}
                              className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                packageForm.requiresLicense
                                  ? 'border border-amber-300 bg-amber-500 text-white shadow-sm'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              License Required
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <label className="text-sm font-semibold text-slate-700">Route Type</label>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {['city', 'mountain', 'road', 'mixed'].map((routeType) => (
                              <button
                                key={routeType}
                                type="button"
                                onClick={() => setPackageForm((prev) => ({ ...prev, routeType }))}
                                className={`rounded-xl px-4 py-4 text-sm font-semibold capitalize transition ${
                                  packageForm.routeType === routeType
                                    ? 'border border-violet-300 bg-violet-600 text-white shadow-sm shadow-violet-200'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {routeType}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <label className="text-sm font-semibold text-slate-700">Maximum Quads</label>
                          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                            {PACKAGE_CAPACITY_OPTIONS.map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setPackageForm((prev) => ({ ...prev, maxQuads: count }))}
                                className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                  Number(packageForm.maxQuads) === count
                                    ? 'border border-violet-300 bg-violet-600 text-white shadow-sm shadow-violet-200'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {count} Quad{count > 1 ? 's' : ''}
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Custom Capacity</p>
                            <div className="mt-3 flex gap-3">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={customPackageCapacity}
                                onChange={(event) => setCustomPackageCapacity(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextCapacity = Math.max(1, Number(customPackageCapacity || 1));
                                  setPackageForm((prev) => ({ ...prev, maxQuads: nextCapacity }));
                                  setCustomPackageCapacity(String(nextCapacity));
                                }}
                                className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <label className="text-sm font-semibold text-slate-700">Difficulty label</label>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {['Easy', 'Medium', 'Difficult'].map((label) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  setPackageForm((prev) => ({ ...prev, difficultyLabel: label }));
                                  setPackageDirty(true);
                                }}
                                className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                  String(packageForm.difficultyLabel || '').toLowerCase() === label.toLowerCase()
                                    ? 'border border-emerald-300 bg-emerald-500 text-white shadow-sm'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="mt-3 text-xs font-semibold text-slate-500">Shows on the public tour cards for quick difficulty context.</p>
                        </div>

                        <div className="rounded-[1.4rem] border border-white bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <label className="text-sm font-semibold text-slate-700">Public highlights</label>
                              <p className="mt-1 text-xs font-semibold text-slate-500">Short labels only. These become compact chips on the public tour page.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPackageForm((prev) => ({ ...prev, publicHighlights: [...prev.publicHighlights, createHighlight(prev.publicHighlights.length)] }));
                                setPackageDirty(true);
                              }}
                              className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                            >
                              Add highlight
                            </button>
                          </div>
                          <div className="mt-4 grid gap-3">
                            {packageForm.publicHighlights.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
                                No public highlights yet.
                              </div>
                            ) : packageForm.publicHighlights.map((highlight, index) => (
                              <div key={highlight.id || index} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <input
                                  type="text"
                                  value={highlight.label || ''}
                                  maxLength={60}
                                  onChange={(event) => {
                                    setPackageForm((prev) => ({ ...prev, publicHighlights: prev.publicHighlights.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }));
                                    setPackageDirty(true);
                                  }}
                                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900"
                                  placeholder="Guide included"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPackageForm((prev) => ({ ...prev, publicHighlights: prev.publicHighlights.filter((_, itemIndex) => itemIndex !== index) }));
                                    setPackageDirty(true);
                                  }}
                                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editorTab === 'website' && (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Media & roadmap</p>
                        <h3 className="mt-2 text-xl font-black text-slate-950">Public package assets</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-violet-100 bg-slate-50 p-1">
                        {[
                          { id: 'media', label: 'Media' },
                          { id: 'roadmap', label: 'Roadmap' },
                        ].map((tab) => {
                          const active = mediaRoadmapTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setMediaRoadmapTab(tab.id)}
                              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                                active
                                  ? 'bg-violet-600 text-white shadow-sm'
                                  : 'bg-white text-slate-600 hover:text-violet-700'
                              }`}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {mediaRoadmapTab === 'media' && (
                  <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Cover and preview media</p>
                        <h3 className="mt-2 text-xl font-black text-slate-950">What guests see first</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => mediaInputRef.current?.click()}
                          disabled={mediaUploading}
                          className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
                        >
                          {mediaUploading ? 'Importing...' : 'Import media'}
                        </button>
                        {editingPackageId ? (
                          <button
                            type="button"
                            onClick={handleSavePackage}
                            disabled={!packageDirty}
                            className={`package-save-button rounded-2xl px-4 py-3 text-sm font-bold shadow-sm transition ${
                              packageSaveBounce ? 'package-save-bounce' : ''
                            } ${
                              packageDirty
                                ? 'package-save-button-dirty border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'package-save-button-saved border border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            {packageDirty ? 'Save changes' : 'Saved'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(event) => handleMediaFiles(event.target.files)}
                    />
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <label className="text-sm font-semibold text-slate-700">Cover image URL</label>
                          <p className="mt-1 text-xs font-medium text-slate-500">This is the image used first on the website card.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await applyPackageFormUpdate(
                                (prev) => ({ ...prev, coverImageUrl: '' }),
                                'Main preview cleared'
                              );
                            }}
                            disabled={!packageForm.coverImageUrl}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Clear preview
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const firstGalleryItem = (packageForm.mediaGallery || []).find((item) => item?.thumbnailUrl || item?.url);
                              if (!firstGalleryItem) return;
                              await applyPackageFormUpdate(
                                (prev) => ({
                                  ...prev,
                                  coverImageUrl: firstGalleryItem.thumbnailUrl || firstGalleryItem.url || '',
                                }),
                                'Main preview updated'
                              );
                            }}
                            disabled={!packageForm.mediaGallery?.some((item) => item?.thumbnailUrl || item?.url)}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Use first media
                          </button>
                        </div>
                      </div>
                      <input
                        type="url"
                        value={packageForm.coverImageUrl}
                        onChange={(event) => setPackageForm((prev) => ({ ...prev, coverImageUrl: event.target.value }))}
                        onBlur={async () => {
                          if (editingPackageId) {
                            await applyPackageFormUpdate(
                              (prev) => ({ ...prev, coverImageUrl: String(prev.coverImageUrl || '').trim() }),
                              'Main cover updated'
                            );
                          }
                        }}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-700">Preview media</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Add up to 9 website media items. The card keeps a compact stacked preview.</p>
                        </div>
                        <div className="hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setPackageForm((prev) => {
                                const nextMediaGallery = [...prev.mediaGallery, createMediaItem(prev.mediaGallery.length, 'image')].slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS);
                                setActiveMediaEditorIndex(nextMediaGallery.length - 1);
                                return { ...prev, mediaGallery: nextMediaGallery };
                              })
                            }
                            disabled={packageForm.mediaGallery.length >= MAX_PUBLIC_TOUR_MEDIA_ITEMS}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Add URL
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPackageForm((prev) => {
                                const nextMediaGallery = [...prev.mediaGallery, createMediaItem(prev.mediaGallery.length, 'instagram')].slice(0, MAX_PUBLIC_TOUR_MEDIA_ITEMS);
                                setActiveMediaEditorIndex(nextMediaGallery.length - 1);
                                return { ...prev, mediaGallery: nextMediaGallery };
                              })
                            }
                            disabled={packageForm.mediaGallery.length >= MAX_PUBLIC_TOUR_MEDIA_ITEMS}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs font-bold text-fuchsia-700 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Instagram className="h-3.5 w-3.5" />
                            Add Instagram
                          </button>
                        </div>
                      </div>
                      {getPreviewMediaItems(packageForm, MAX_PUBLIC_TOUR_MEDIA_ITEMS).length > 0 ? (
                        <div className="mt-4">
                          <div className="flex flex-wrap gap-3">
                            {getPreviewMediaItems(packageForm, MAX_PUBLIC_TOUR_MEDIA_ITEMS).map((item, index) => (
                              <div
                                key={`website-media-inline-${item.previewUrl || item.url}-${index}`}
                                className="flex flex-col gap-1.5"
                              >
                                {item.isMainCover ? (
                                  <p className="pl-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                                    Main cover
                                  </p>
                                ) : (
                                  <div className="h-[14px]" aria-hidden="true" />
                                )}
                                <div className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                                  {item.type === 'video' ? (
                                    <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                                  ) : item.type === 'instagram' && item.thumbnailUrl ? (
                                    <img src={item.thumbnailUrl} alt={item.caption || 'Instagram preview'} className="h-full w-full object-cover" />
                                  ) : item.type === 'instagram' ? (
                                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#fde7ff_0%,#ede9fe_100%)]">
                                      <Instagram className="h-5 w-5 text-fuchsia-700" />
                                    </div>
                                  ) : (
                                    <img src={item.previewUrl || item.url} alt={item.caption || packageForm.name || 'Tour media'} className="h-full w-full object-cover" />
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent px-2 pb-2 pt-6">
                                    <p className="truncate text-[10px] font-bold text-white">
                                      {item.caption || (item.type === 'video' ? 'Video preview' : item.type === 'instagram' ? 'Instagram preview' : `Media ${index + 1}`)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      await removeMediaFromStorage(item);
                                      const targetUrl = String(
                                        item?.url || item?.thumbnailUrl || item?.thumbnail_url || item?.previewUrl || ''
                                      ).trim();
                                      const nextGallery = (packageForm.mediaGallery || []).filter((galleryItem) => {
                                        const galleryUrl = String(galleryItem?.url || '').trim();
                                        const galleryThumb = String(
                                          galleryItem?.thumbnailUrl || galleryItem?.thumbnail_url || ''
                                        ).trim();
                                        if (targetUrl) {
                                          return galleryUrl !== targetUrl && galleryThumb !== targetUrl;
                                        }
                                        return !mediaMatchesTarget(galleryItem, item);
                                      });
                                      const nextCover = resolveCoverAfterMediaChange(
                                        nextGallery,
                                        item?.isMainCover ? '' : packageForm.coverImageUrl
                                      );
                                      const nextForm = {
                                        ...packageForm,
                                        mediaGallery: nextGallery,
                                        coverImageUrl: nextCover,
                                      };
                                      setPackageForm(nextForm);
                                      setPackageDirty(true);
                                      if (editingPackageId) {
                                        await persistPackageMedia(nextForm, 'Media removed');
                                      } else {
                                        toast.success('Media removed');
                                      }
                                    }}
                                    className="absolute right-1 top-1 rounded-full border border-rose-200 bg-white/90 px-2 py-1 text-[10px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => mediaInputRef.current?.click()}
                        onDrop={handleMediaDrop}
                        onDragOver={handleMediaDragOver}
                        onDragLeave={handleMediaDragLeave}
                        disabled={mediaUploading || packageForm.mediaGallery.length >= MAX_PUBLIC_TOUR_MEDIA_ITEMS}
                        className={`mt-4 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center transition ${
                          mediaDragActive
                            ? 'border-violet-400 bg-violet-100/80 shadow-inner shadow-violet-200/50'
                            : 'border-violet-200 bg-white hover:border-violet-300 hover:bg-violet-50/70'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                          <ImageIcon size={20} />
                        </span>
                        <span className="mt-3 text-sm font-black text-slate-900">
                          {mediaUploading ? 'Importing media...' : 'Drop media here or click to import'}
                        </span>
                        <span className="mt-1 max-w-md text-xs font-medium text-slate-500">
                          Upload images or videos for the public preview. The first imported image becomes the cover if no cover is set.
                        </span>
                      </button>
                      <div className="mt-4 space-y-3">
                        {packageForm.mediaGallery.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">No media preview items yet.</div>
                        ) : false ? (
                          <div className="min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-white p-4 shadow-[0_12px_32px_rgba(79,70,229,0.08)]">
                            {(() => {
                              const activeMedia = packageForm.mediaGallery[activeMediaEditorIndex];
                              const activeCoverUrl = String(packageForm.coverImageUrl || '').trim();
                              const activeMediaCoverUrl = String(activeMedia?.thumbnailUrl || activeMedia?.url || '').trim();
                              const isActiveCover = Boolean(activeCoverUrl && activeMediaCoverUrl && activeCoverUrl === activeMediaCoverUrl);
                              return (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">
                                  {packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram' ? 'Instagram entry' : 'Media entry'}
                                </p>
                                <h4 className="mt-2 text-lg font-black text-slate-950">
                                  {packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram' ? 'Add Instagram preview' : 'Add preview media'}
                                </h4>
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                  Finish this entry first, then the rest of your media previews come back.
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await applyPackageFormUpdate(
                                      (prev) => ({
                                        ...prev,
                                        coverImageUrl:
                                          prev.mediaGallery[activeMediaEditorIndex]?.thumbnailUrl ||
                                          prev.mediaGallery[activeMediaEditorIndex]?.url ||
                                          prev.coverImageUrl,
                                      }),
                                      'Main cover updated'
                                    );
                                  }}
                                  className={
                                    isActiveCover
                                      ? 'rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100'
                                      : 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700'
                                  }
                                >
                                  Main cover
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCompleteMediaEditor}
                                  disabled={mediaResolving}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {mediaResolving
                                    ? 'Parsing...'
                                    : packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram'
                                      ? 'Save & parse'
                                      : 'Done'}
                                </button>
                              </div>
                            </div>
                              );
                            })()}

                            <div className="mt-4 grid gap-3 xl:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
                              <select
                                value={packageForm.mediaGallery[activeMediaEditorIndex]?.type || 'image'}
                                onChange={(event) =>
                                  setPackageForm((prev) => ({
                                    ...prev,
                                    mediaGallery: prev.mediaGallery.map((item, itemIndex) =>
                                      itemIndex === activeMediaEditorIndex ? { ...item, type: event.target.value } : item
                                    ),
                                  }))
                                }
                                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900"
                              >
                                <option value="image">Image</option>
                                <option value="video">Video</option>
                                <option value="instagram">Instagram</option>
                              </select>
                              <input
                                type="url"
                                value={packageForm.mediaGallery[activeMediaEditorIndex]?.url || ''}
                                onChange={(event) =>
                                  setPackageForm((prev) => ({
                                    ...prev,
                                    mediaGallery: prev.mediaGallery.map((item, itemIndex) =>
                                      itemIndex === activeMediaEditorIndex ? { ...item, url: event.target.value } : item
                                    ),
                                  }))
                                }
                                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900"
                                placeholder={packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram' ? 'https://instagram.com/...' : 'https://...'}
                              />
                              <input
                                type="text"
                                value={packageForm.mediaGallery[activeMediaEditorIndex]?.caption || ''}
                                onChange={(event) =>
                                  setPackageForm((prev) => ({
                                    ...prev,
                                    mediaGallery: prev.mediaGallery.map((item, itemIndex) =>
                                      itemIndex === activeMediaEditorIndex ? { ...item, caption: event.target.value } : item
                                    ),
                                  }))
                                }
                                className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900"
                                placeholder={packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram' ? 'Instagram label' : 'Caption'}
                              />
                            </div>

                            {packageForm.mediaGallery[activeMediaEditorIndex]?.type === 'instagram' ? (
                              <div className="mt-4 rounded-2xl border border-fuchsia-100 bg-[linear-gradient(180deg,#fff6ff_0%,#f5f3ff_100%)] p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-600/80">Instagram preview</p>
                                    <p className="mt-1 text-xs font-medium text-slate-500">
                                      {mediaResolving
                                        ? 'Fetching preview thumbnail from Instagram...'
                                        : packageForm.mediaGallery[activeMediaEditorIndex]?.thumbnailUrl
                                          ? 'Preview ready for the website card and media modal.'
                                          : 'Save and parse this link to keep a preview thumbnail for the website.'}
                                    </p>
                                  </div>
                                  <Instagram className="h-5 w-5 shrink-0 text-fuchsia-600" />
                                </div>
                                <div className="mt-3 overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                                  {packageForm.mediaGallery[activeMediaEditorIndex]?.thumbnailUrl ? (
                                    <img
                                      src={packageForm.mediaGallery[activeMediaEditorIndex]?.thumbnailUrl}
                                      alt={packageForm.mediaGallery[activeMediaEditorIndex]?.caption || 'Instagram preview'}
                                      className="aspect-[4/3] w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-[linear-gradient(180deg,#fde7ff_0%,#ede9fe_100%)]">
                                      <Instagram className="h-8 w-8 text-fuchsia-700" />
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-slate-900">
                                        {packageForm.mediaGallery[activeMediaEditorIndex]?.caption || 'Instagram preview'}
                                      </p>
                                      <p className="truncate text-xs font-medium text-slate-500">
                                        {packageForm.mediaGallery[activeMediaEditorIndex]?.externalUrl || packageForm.mediaGallery[activeMediaEditorIndex]?.url}
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-bold text-fuchsia-700">
                                      Reel / post
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextGallery = moveItem(packageForm.mediaGallery, activeMediaEditorIndex, -1);
                                  const nextForm = { ...packageForm, mediaGallery: nextGallery };
                                  setPackageForm(nextForm);
                                  if (editingPackageId) {
                                    await persistPackageMedia(nextForm, 'Media order updated');
                                  } else {
                                    toast.success('Media order updated');
                                  }
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextGallery = moveItem(packageForm.mediaGallery, activeMediaEditorIndex, 1);
                                  const nextForm = { ...packageForm, mediaGallery: nextGallery };
                                  setPackageForm(nextForm);
                                  if (editingPackageId) {
                                    await persistPackageMedia(nextForm, 'Media order updated');
                                  } else {
                                    toast.success('Media order updated');
                                  }
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const mediaToRemove = packageForm.mediaGallery[activeMediaEditorIndex];
                                  await removeMediaFromStorage(mediaToRemove);
                                  const nextGallery = packageForm.mediaGallery.filter((_, itemIndex) => itemIndex !== activeMediaEditorIndex);
                                  const nextCover = resolveCoverAfterMediaChange(nextGallery, packageForm.coverImageUrl);
                                  const nextForm = {
                                    ...packageForm,
                                    mediaGallery: nextGallery,
                                    coverImageUrl: nextCover,
                                  };
                                  setPackageForm(nextForm);
                                  if (editingPackageId) {
                                    await persistPackageMedia(nextForm, 'Media removed');
                                  } else {
                                    toast.success('Media removed');
                                  }
                                  setActiveMediaEditorIndex(null);
                                }}
                                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {packageForm.mediaGallery
                              .map((media, index) => ({ media, index }))
                              .filter(({ media }) => String(media?.url || '').trim())
                              .map(({ media, index }) => {
                              const currentCoverUrl = String(packageForm.coverImageUrl || '').trim();
                              const mediaCoverUrl = String(media.thumbnailUrl || media.url || '').trim();
                              const isCover = Boolean(currentCoverUrl && mediaCoverUrl && currentCoverUrl === mediaCoverUrl);
                              return (
                              <div
                                key={media.id || index}
                                onClick={() => setActiveMediaEditorIndex(index)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setActiveMediaEditorIndex(index);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition hover:border-violet-200 hover:shadow-[0_12px_28px_rgba(79,70,229,0.08)]"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-100">
                                    {media.type === 'video' ? (
                                      <video src={media.url} muted playsInline className="h-full w-full object-cover" />
                                    ) : media.type === 'instagram' && media.thumbnailUrl ? (
                                      <img src={media.thumbnailUrl} alt={media.caption || 'Instagram preview'} className="h-full w-full object-cover" />
                                    ) : media.type === 'instagram' ? (
                                      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#fde7ff_0%,#ede9fe_100%)]">
                                        <Instagram className="h-5 w-5 text-fuchsia-700" />
                                      </div>
                                    ) : (
                                      <img src={media.url} alt={media.caption || packageForm.name || 'Tour media'} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black text-slate-900">
                                      {media.caption || (media.type === 'instagram' ? 'Instagram preview' : `Media ${index + 1}`)}
                                    </p>
                                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                      {media.type === 'instagram' ? 'Instagram' : media.type === 'video' ? 'Video' : 'Image'}
                                    </p>
                                    <p className="mt-2 truncate text-xs font-medium text-slate-500">
                                      {media.type === 'instagram'
                                        ? media.externalUrl || media.url || 'Add Instagram URL'
                                        : media.url || 'Add URL'}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                                    Edit
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      const nextForm = {
                                        ...packageForm,
                                        coverImageUrl: media.thumbnailUrl || media.url || packageForm.coverImageUrl,
                                      };
                                      setPackageForm(nextForm);
                                      setPackageDirty(true);
                                      if (editingPackageId) {
                                        await persistPackageMedia(nextForm, 'Main cover updated');
                                      } else {
                                        toast.success('Main cover updated');
                                      }
                                    }}
                                    className={
                                      isCover
                                        ? 'rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-700'
                                        : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700'
                                    }
                                  >
                                    Main cover
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      const nextGallery = packageForm.mediaGallery.filter((_, itemIndex) => itemIndex !== index);
                                      const nextCover = resolveCoverAfterMediaChange(nextGallery, packageForm.coverImageUrl);
                                      const nextForm = {
                                        ...packageForm,
                                        mediaGallery: nextGallery,
                                        coverImageUrl: nextCover,
                                      };
                                      setPackageForm(nextForm);
                                      setPackageDirty(true);
                                      if (editingPackageId) {
                                        await persistPackageMedia(nextForm, 'Media removed');
                                      } else {
                                        toast.success('Media removed');
                                      }
                                    }}
                                    className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-bold text-rose-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {mediaRoadmapTab === 'roadmap' && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Route roadmap</p>
                        <p className="mt-2 text-xs font-medium text-slate-500">Simple public timeline nodes. Keep it short and operational.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const normalizedStops = normalizeRouteStops(packageForm.routeStops);
                              const nextForm = {
                                ...packageForm,
                                routeStops: normalizedStops,
                                stopCount: normalizedStops.length,
                              };
                              setPackageForm(nextForm);
                              await persistPackageRoadmap(nextForm, 'Route roadmap saved');
                              setRoadmapCollapsed(true);
                            } catch (error) {
                              console.error('Failed to save route roadmap:', error);
                              toast.error(error.message || 'Could not save route roadmap');
                            }
                          }}
                          disabled={!editingPackageId || roadmapSaving}
                          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                            editingPackageId && !roadmapSaving
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border border-slate-200 bg-white text-slate-400'
                          }`}
                        >
                          {roadmapSaving ? 'Saving…' : 'Save roadmap'}
                        </button>
                        {packageForm.routeStops.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setRoadmapCollapsed((current) => !current)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                          >
                            {roadmapCollapsed ? 'Edit roadmap' : 'Collapse'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {roadmapCollapsed && packageForm.routeStops.length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-violet-700">
                        {packageForm.routeStops.length} stop{packageForm.routeStops.length > 1 ? 's' : ''} saved
                      </div>
                    ) : (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPackageForm((prev) => ({ ...prev, routeStops: [...prev.routeStops, createRouteStop(prev.routeStops.length)] }))}
                          className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                        >
                          Add stop
                        </button>
                      </div>
                      {packageForm.routeStops.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm font-medium text-slate-500">No roadmap stops yet.</div>
                      ) : packageForm.routeStops.map((stop, index) => (
                        <div
                          key={stop.id || index}
                          className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:p-5"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">
                                  Stop {index + 1}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {ROADMAP_STOP_KIND_OPTIONS.map((option) => {
                                    const isActive = (stop.kind || 'stop') === option.id;
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => updateRouteStop(index, { kind: option.id })}
                                        className={
                                          isActive
                                            ? 'rounded-full border border-violet-200 bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]'
                                            : 'rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-700'
                                        }
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPackageForm((prev) => ({
                                      ...prev,
                                      routeStops: moveItem(prev.routeStops, index, -1),
                                    }));
                                    setPackageDirty(true);
                                  }}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPackageForm((prev) => ({
                                      ...prev,
                                      routeStops: moveItem(prev.routeStops, index, 1),
                                    }));
                                    setPackageDirty(true);
                                  }}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPackageForm((prev) => ({
                                      ...prev,
                                      routeStops: prev.routeStops.filter((_, itemIndex) => itemIndex !== index),
                                    }));
                                    setPackageDirty(true);
                                  }}
                                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                              <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Stop title</span>
                                <input
                                  type="text"
                                  value={stop.title || ''}
                                  onChange={(event) => updateRouteStop(index, { title: event.target.value })}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                                  placeholder="Villa Harris"
                                />
                              </label>
                              <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Short note</span>
                                <input
                                  type="text"
                                  value={stop.note || ''}
                                  onChange={(event) => updateRouteStop(index, { note: event.target.value })}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                                  placeholder="Quick stop note"
                                />
                              </label>
                            </div>

                            <div>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Stop media</p>
                                  <p className="mt-2 text-xs font-medium text-slate-500">Drop media here for this stop, or click to import.</p>
                                </div>
                                <input
                                  ref={(node) => {
                                    if (node) stopMediaInputRefs.current[`stop-${index}`] = node;
                                  }}
                                  type="file"
                                  accept="image/*,video/*"
                                  multiple
                                  className="hidden"
                                  onChange={(event) => handleStopMediaFiles(index, event.target.files)}
                                />
                                <button
                                  type="button"
                                  onClick={() => stopMediaInputRefs.current[`stop-${index}`]?.click()}
                                  className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                                >
                                  Add media
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => stopMediaInputRefs.current[`stop-${index}`]?.click()}
                                className="mt-4 flex w-full flex-col items-center justify-center rounded-[20px] border border-dashed border-violet-200 bg-violet-50/30 px-4 py-5 text-center transition hover:border-violet-300 hover:bg-violet-50/60"
                              >
                                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">
                                  Drop media here
                                </span>
                                <span className="mt-3 text-sm font-semibold text-slate-700">
                                  Images or MP4 clips for {stop.title || `stop ${index + 1}`}
                                </span>
                                <span className="mt-1 text-xs font-medium text-slate-500">
                                  Up to 3 items per stop
                                </span>
                              </button>

                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                {(stop.media || []).length === 0 ? (
                                  <span className="text-xs font-semibold text-slate-500">No media yet</span>
                                ) : (
                                  (stop.media || []).map((mediaItem, mediaIndex) => (
                                    <div
                                      key={mediaItem.id || mediaIndex}
                                      className="group relative h-16 w-16 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_8px_20px_rgba(79,70,229,0.06)]"
                                    >
                                      {mediaItem.type === 'video' ? (
                                        <video src={mediaItem.url} muted playsInline className="h-full w-full object-cover" />
                                      ) : (
                                        <img
                                          src={mediaItem.thumbnailUrl || mediaItem.url}
                                          alt={mediaItem.caption || stop.title || 'Stop media'}
                                          className="h-full w-full object-cover"
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateRouteStop(index, {
                                            media: (stop.media || []).filter((_, mIndex) => mIndex !== mediaIndex),
                                          });
                                        }}
                                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[10px] font-bold text-rose-600 shadow-sm group-hover:flex"
                                        aria-label="Remove media"
                                      >
                                        ×
                                      </button>
                                      <div className="absolute bottom-1 left-1 hidden items-center gap-1 group-hover:flex">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateRouteStop(index, {
                                              media: moveStopMediaItem(stop.media || [], mediaIndex, -1),
                                            });
                                          }}
                                          disabled={mediaIndex === 0}
                                          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/92 text-[10px] font-bold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                          aria-label="Move media earlier"
                                        >
                                          ↑
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateRouteStop(index, {
                                              media: moveStopMediaItem(stop.media || [], mediaIndex, 1),
                                            });
                                          }}
                                          disabled={mediaIndex === (stop.media || []).length - 1}
                                          className="flex h-5 w-5 items-center justify-center rounded-full bg-white/92 text-[10px] font-bold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                                          aria-label="Move media later"
                                        >
                                          ↓
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  )}
                </div>
              )}

              {editorTab === 'pricing' && (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)] sm:p-5">
                  <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    Prices are auto‑filled from default pricing. You can override any model price if needed.
                  </div>
                  <TourPackagePricingManager
                    embedded
                    showPackagePicker={false}
                    selectedPackageId={editingPackageId || GLOBAL_TOUR_PRICING_KEY}
                    selectedPackage={selectedPackagePreview}
                    allowedDurations={embeddedAllowedDurations}
                    onPricingRowsChange={setTourPricingRows}
                  />
                </div>
              )}

              {editorTab === 'advanced' && (
                <div className="space-y-5">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Advanced controls</p>
                        <p className="mt-2 text-sm font-semibold text-slate-500">Operational rules and visibility settings for this package.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          {packageForm.bufferBeforeMinutes} min before
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                          {packageForm.bufferAfterMinutes} min after
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${packageForm.websiteVisible ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {packageForm.websiteVisible ? 'Visible on website' : 'Internal only'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Schedule buffers</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">These rules block time before and after a tour so operations do not overlap.</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <label className="text-sm font-semibold text-slate-700">Buffer before departure</label>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={packageForm.bufferBeforeMinutes}
                          onChange={(event) =>
                            setPackageForm((prev) => ({ ...prev, bufferBeforeMinutes: event.target.value }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        />
                        <p className="mt-2 text-xs font-semibold text-slate-500">Minutes before start time.</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <label className="text-sm font-semibold text-slate-700">Buffer after return</label>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={packageForm.bufferAfterMinutes}
                          onChange={(event) =>
                            setPackageForm((prev) => ({ ...prev, bufferAfterMinutes: event.target.value }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        />
                        <p className="mt-2 text-xs font-semibold text-slate-500">Minutes after scheduled end.</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Availability controls</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">Active controls operations. Website visible controls public discovery.</p>
                    <div className="mt-4 grid gap-4">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <label className="text-sm font-semibold text-slate-700">Package status</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, is_active: true }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              packageForm.is_active
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, is_active: false }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              !packageForm.is_active
                                ? 'border border-slate-300 bg-slate-100 text-slate-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Internal Only
                          </button>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <label className="text-sm font-semibold text-slate-700">Website visibility</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, websiteVisible: true }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              packageForm.websiteVisible
                                ? 'border border-blue-300 bg-blue-50 text-blue-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Website Visible
                          </button>
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, websiteVisible: false }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              !packageForm.websiteVisible
                                ? 'border border-slate-300 bg-slate-100 text-slate-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Internal Only
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              )}
              </div>

              <div className="sticky bottom-4 z-10 overflow-hidden rounded-[1.6rem] border border-violet-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(245,243,255,0.94)_100%)] p-4 shadow-[0_18px_48px_rgba(79,70,229,0.12)] backdrop-blur">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600/80">Package actions</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {editingPackageId ? 'Save updates to this package' : 'Create the package to continue using it in bookings'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {editingPackageId
                        ? 'Changes are saved automatically while you edit.'
                        : 'Details and advanced settings are saved together here.'}
                    </p>
                    {editingPackageId ? (
                      <p className={`mt-2 text-xs font-semibold ${packageDirty ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {packageDirty ? 'Unsaved changes' : 'All changes saved'}
                        {lastPackageSavedAt && !packageDirty ? ` • ${formatSavedTime(lastPackageSavedAt)}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={resetEditor}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePackage}
                      disabled={Boolean(!editingPackageId && !packageForm.name.trim())}
                      className={`package-save-button rounded-2xl px-5 py-3 text-sm font-bold shadow-[0_16px_34px_rgba(124,58,237,0.22)] transition ${
                        packageSaveBounce ? 'package-save-bounce' : ''
                      } ${
                        editingPackageId && !packageDirty
                          ? 'package-save-button-saved border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-violet-600 text-white hover:bg-violet-700'
                      }`}
                    >
                      {editingPackageId ? (packageDirty ? 'Save Package' : 'Saved') : 'Create Package'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TourPackagesWorkspace;
