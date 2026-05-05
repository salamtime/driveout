import {
  buildTenantScopedStoragePath,
  optimizeFileForUpload,
} from '../utils/storageUpload';
import { supabase } from '../lib/supabase';
import { getCurrentOrganizationId } from './OrganizationService';

const CHAT_MEDIA_BUCKET = 'chat-media';
const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const buildFileName = (file, extension) => {
  const originalBaseName = String(file?.name || 'chat-photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'chat-photo';

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${originalBaseName}.${extension}`;
};

const createObjectPreview = (file) => {
  if (typeof window === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
};

const revokeObjectPreview = (url) => {
  if (!url || typeof window === 'undefined' || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }

  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore revoke failures.
  }
};

const uploadPhoto = async ({ file, threadKey = '', contextId = '', userId = '' }) => {
  const organizationId = await getCurrentOrganizationId();
  const optimized = await optimizeFileForUpload(file, {
    bucket: CHAT_MEDIA_BUCKET,
    pathPrefix: 'messages',
    optimizationProfile: 'photo',
  });

  const extension = optimized.extension || 'webp';
  const ownerSegment = String(userId || 'guest').trim() || 'guest';
  const threadSegment = String(threadKey || contextId || 'draft').trim().replace(/[^a-z0-9-_]+/gi, '-') || 'draft';
  const fileName = buildFileName(file, extension);
  const storagePath = buildTenantScopedStoragePath({
    organizationId,
    pathPrefix: `messages/${ownerSegment}/${threadSegment}`,
    fileName,
  });

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(storagePath, optimized.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: optimized.contentType,
    });

  if (error) {
    throw new Error(error.message || 'Failed to upload chat photo');
  }

  const { data: publicUrlData } = supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .getPublicUrl(data.path);

  const finalSize = optimized.finalSize || file?.size || 0;
  if (finalSize > MAX_CHAT_ATTACHMENT_BYTES) {
    try {
      await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([data.path]);
    } catch {
      // Ignore cleanup issue, the caller still needs the validation error.
    }
    throw new Error('Chat photos must stay under 5 MB after optimization');
  }

  return {
    kind: 'photo',
    bucket: CHAT_MEDIA_BUCKET,
    storagePath: data.path,
    publicUrl: publicUrlData?.publicUrl || '',
    thumbnailUrl: publicUrlData?.publicUrl || '',
    mimeType: optimized.contentType,
    originalFilename: file?.name || fileName,
    fileSize: finalSize,
    optimized: Boolean(optimized.optimized),
    bytesSaved: Math.max(0, Number(optimized.originalSize || 0) - Number(optimized.finalSize || 0)),
    width: null,
    height: null,
  };
};

const prepareDraftAttachment = (file) => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  file,
  previewUrl: createObjectPreview(file),
  name: file?.name || 'Photo',
  size: Number(file?.size || 0),
  type: String(file?.type || '').trim(),
});

const uploadDraftAttachments = async ({ attachments = [], threadKey = '', contextId = '', userId = '' }) => {
  const uploads = [];
  for (const attachment of attachments) {
    if (!attachment?.file) continue;
    const uploaded = await uploadPhoto({
      file: attachment.file,
      threadKey,
      contextId,
      userId,
    });
    uploads.push(uploaded);
  }
  return uploads;
};

const cleanupUploadedAttachments = async (attachments = []) => {
  const bucketMap = new Map();
  attachments.forEach((attachment) => {
    const bucket = String(attachment?.bucket || '').trim();
    const path = String(attachment?.storagePath || '').trim();
    if (!bucket || !path) return;
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, new Set());
    }
    bucketMap.get(bucket).add(path);
  });

  for (const [bucket, paths] of bucketMap.entries()) {
    const pathList = Array.from(paths);
    if (!pathList.length) continue;
    try {
      await supabase.storage.from(bucket).remove(pathList);
    } catch {
      // Ignore cleanup failures for now.
    }
  }
};

const MessageAttachmentService = {
  CHAT_MEDIA_BUCKET,
  MAX_CHAT_ATTACHMENT_BYTES,
  prepareDraftAttachment,
  revokeObjectPreview,
  uploadDraftAttachments,
  cleanupUploadedAttachments,
};

export default MessageAttachmentService;
