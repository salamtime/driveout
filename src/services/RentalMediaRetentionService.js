import { supabase } from '../utils/supabaseClient';

const DEFAULT_RETENTION_SETTINGS = {
  rentalMediaRetentionEnabled: false,
  rentalMediaRetentionDays: 30,
};
const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const SETTINGS_ROW_ID = 1;
const AUTOMATIC_RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_AUTOMATIC_CLEANUP_KEY = 'saharax:rental-media:last-auto-cleanup-at';

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

const inferPrimaryBucket = (mediaRecord) => {
  const fromPublicUrl = parseStorageTargetFromUrl(mediaRecord.public_url);
  if (fromPublicUrl?.bucket) return fromPublicUrl.bucket;

  if (mediaRecord.file_type?.startsWith('video/')) {
    if (mediaRecord.public_url?.includes('/rental-media-opening/')) {
      return 'rental-media-opening';
    }
    if (mediaRecord.public_url?.includes('/rental-media-closing/')) {
      return 'rental-media-closing';
    }
  }

  return 'rental-videos';
};

const getStorageTargets = (mediaRecord) => {
  const targets = [];
  const seen = new Set();

  const addTarget = (bucket, path) => {
    if (!bucket || !path) return;
    const key = `${bucket}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ bucket, path });
  };

  const primaryBucket = inferPrimaryBucket(mediaRecord);
  if (mediaRecord.storage_path) {
    addTarget(primaryBucket, mediaRecord.storage_path);
  }

  const publicTarget = parseStorageTargetFromUrl(mediaRecord.public_url);
  if (publicTarget) {
    addTarget(publicTarget.bucket, publicTarget.path);
  }

  const thumbnailTarget = parseStorageTargetFromUrl(mediaRecord.thumbnail_url);
  if (thumbnailTarget) {
    addTarget(thumbnailTarget.bucket, thumbnailTarget.path);
  }

  return targets;
};

class RentalMediaRetentionService {
  static async getSettings() {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('rental_media_retention_enabled, rental_media_retention_days')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load retention settings: ${error.message}`);
    }

    return {
      rentalMediaRetentionEnabled: Boolean(
        data?.rental_media_retention_enabled ?? DEFAULT_RETENTION_SETTINGS.rentalMediaRetentionEnabled
      ),
      rentalMediaRetentionDays: Math.max(
        1,
        Number(data?.rental_media_retention_days ?? DEFAULT_RETENTION_SETTINGS.rentalMediaRetentionDays) || 30
      ),
    };
  }

  static async saveSettings(nextSettings) {
    const payload = {
      id: SETTINGS_ROW_ID,
      rental_media_retention_enabled: Boolean(nextSettings.rentalMediaRetentionEnabled),
      rental_media_retention_days: Math.max(1, Number(nextSettings.rentalMediaRetentionDays) || 30),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert([payload])
      .select('rental_media_retention_enabled, rental_media_retention_days')
      .single();

    if (error) {
      throw new Error(`Failed to save retention settings: ${error.message}`);
    }

    return {
      rentalMediaRetentionEnabled: Boolean(data?.rental_media_retention_enabled),
      rentalMediaRetentionDays: Math.max(1, Number(data?.rental_media_retention_days) || 30),
    };
  }

  static async cleanupExpiredRentalMedia(retentionDays) {
    const safeDays = Math.max(1, Number(retentionDays) || 30);
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: mediaRows, error } = await supabase
      .from('app_2f7bf469b0_rental_media')
      .select('id, rental_id, storage_path, public_url, thumbnail_url, phase, file_type, original_filename, created_at')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(`Failed to load expired rental media: ${error.message}`);
    }

    const rows = mediaRows || [];
    if (rows.length === 0) {
      return {
        deletedRows: 0,
        deletedFiles: 0,
        failedFiles: [],
      };
    }

    const bucketMap = new Map();
    rows.forEach((row) => {
      getStorageTargets(row).forEach((target) => {
        if (!bucketMap.has(target.bucket)) {
          bucketMap.set(target.bucket, new Set());
        }
        bucketMap.get(target.bucket).add(target.path);
      });
    });

    const failedFiles = [];
    let deletedFiles = 0;

    for (const [bucket, paths] of bucketMap.entries()) {
      const pathList = Array.from(paths);
      if (!pathList.length) continue;

      const { data: removed, error: removeError } = await supabase.storage
        .from(bucket)
        .remove(pathList);

      if (removeError) {
        failedFiles.push({ bucket, paths: pathList, error: removeError.message });
        continue;
      }

      deletedFiles += removed?.length || pathList.length;
    }

    const rowIds = rows.map((row) => row.id);
    const { error: deleteError } = await supabase
      .from('app_2f7bf469b0_rental_media')
      .delete()
      .in('id', rowIds);

    if (deleteError) {
      throw new Error(`Expired files were removed from storage, but deleting DB rows failed: ${deleteError.message}`);
    }

    return {
      deletedRows: rowIds.length,
      deletedFiles,
      failedFiles,
    };
  }

  static async maybeRunAutomaticCleanup(userRole) {
    if (typeof window === 'undefined') {
      return { ran: false, reason: 'no_window' };
    }

    const normalizedRole = String(userRole || '').toLowerCase();
    if (!['owner', 'admin'].includes(normalizedRole)) {
      return { ran: false, reason: 'insufficient_role' };
    }

    const settings = await this.getSettings();
    if (!settings.rentalMediaRetentionEnabled) {
      return { ran: false, reason: 'disabled' };
    }

    const lastRunAt = Number(window.localStorage.getItem(LAST_AUTOMATIC_CLEANUP_KEY) || 0);
    if (lastRunAt && Date.now() - lastRunAt < AUTOMATIC_RETENTION_CHECK_INTERVAL_MS) {
      return { ran: false, reason: 'recently_ran' };
    }

    const result = await this.cleanupExpiredRentalMedia(settings.rentalMediaRetentionDays);
    window.localStorage.setItem(LAST_AUTOMATIC_CLEANUP_KEY, String(Date.now()));

    return {
      ran: true,
      ...result,
    };
  }
}

export default RentalMediaRetentionService;
