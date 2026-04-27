import { fetchSystemSettings } from './systemSettingsApi';
import { adminApiRequest } from './adminApi';

const DEFAULT_MESSAGE_MEDIA_POLICY = {
  messagingPhotoSharingEnabled: true,
  messagingMaxPhotosPerMessage: 3,
  messagingPhotoRetentionDays: 7,
  messagingDraftRetentionHours: 24,
  messagingAllowCameraCapture: true,
};

const AUTOMATIC_RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_AUTOMATIC_CLEANUP_KEY = 'saharax:message-media:last-auto-cleanup-at';

class MessageMediaRetentionService {
  static async getPolicy() {
    let settings = null;
    try {
      settings = await fetchSystemSettings();
    } catch {
      settings = DEFAULT_MESSAGE_MEDIA_POLICY;
    }
    return {
      messagingPhotoSharingEnabled: true,
      messagingMaxPhotosPerMessage: Math.max(
        1,
        Math.min(
          10,
          Number(settings?.messagingMaxPhotosPerMessage ?? DEFAULT_MESSAGE_MEDIA_POLICY.messagingMaxPhotosPerMessage) ||
            DEFAULT_MESSAGE_MEDIA_POLICY.messagingMaxPhotosPerMessage
        )
      ),
      messagingPhotoRetentionDays: Math.max(
        1,
        Math.min(
          30,
          Number(settings?.messagingPhotoRetentionDays ?? DEFAULT_MESSAGE_MEDIA_POLICY.messagingPhotoRetentionDays) ||
            DEFAULT_MESSAGE_MEDIA_POLICY.messagingPhotoRetentionDays
        )
      ),
      messagingDraftRetentionHours: Math.max(
        1,
        Math.min(
          168,
          Number(settings?.messagingDraftRetentionHours ?? DEFAULT_MESSAGE_MEDIA_POLICY.messagingDraftRetentionHours) ||
            DEFAULT_MESSAGE_MEDIA_POLICY.messagingDraftRetentionHours
        )
      ),
      messagingAllowCameraCapture: Boolean(
        settings?.messagingAllowCameraCapture ?? DEFAULT_MESSAGE_MEDIA_POLICY.messagingAllowCameraCapture
      ),
    };
  }

  static async cleanupExpiredMessageMedia(retentionDays) {
    const safeDays = Math.max(1, Math.min(30, Number(retentionDays) || DEFAULT_MESSAGE_MEDIA_POLICY.messagingPhotoRetentionDays));
    return adminApiRequest('/api/messages?action=cleanup-media', {
      method: 'POST',
      body: JSON.stringify({
        retentionDays: safeDays,
      }),
    });
  }

  static async maybeRunAutomaticCleanup(userRole) {
    if (typeof window === 'undefined') {
      return { ran: false, reason: 'no_window' };
    }

    const normalizedRole = String(userRole || '').toLowerCase();
    if (!['owner', 'admin'].includes(normalizedRole)) {
      return { ran: false, reason: 'insufficient_role' };
    }

    const policy = await this.getPolicy();
    if (!policy.messagingPhotoSharingEnabled) {
      return { ran: false, reason: 'photo_sharing_disabled' };
    }

    const lastRunAt = Number(window.localStorage.getItem(LAST_AUTOMATIC_CLEANUP_KEY) || 0);
    if (lastRunAt && Date.now() - lastRunAt < AUTOMATIC_RETENTION_CHECK_INTERVAL_MS) {
      return { ran: false, reason: 'recently_ran' };
    }

    const result = await this.cleanupExpiredMessageMedia(policy.messagingPhotoRetentionDays);
    window.localStorage.setItem(LAST_AUTOMATIC_CLEANUP_KEY, String(Date.now()));

    return {
      ran: true,
      ...result,
      retentionDays: policy.messagingPhotoRetentionDays,
    };
  }
}

export default MessageMediaRetentionService;
