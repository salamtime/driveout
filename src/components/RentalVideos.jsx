import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import {
  Video,
  Play,
  Download,
  Calendar,
  Clock,
  X,
  Loader2,
  AlertTriangle,
  Image as ImageIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Camera,
  Filter,
  Grid3X3,
  LayoutList,
  Trash2
} from 'lucide-react';
import i18n from '../i18n';
import DeleteMediaDialog from './media/DeleteMediaDialog';

const RentalVideos = ({ rental, onUpdate, canDeleteMedia = false }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const completedAtMs = rental?.completed_at
    ? new Date(rental.completed_at).getTime()
    : rental?.actual_end_date
      ? new Date(rental.actual_end_date).getTime()
      : null;
  const isCompletedRental =
    String(rental?.rental_status || '').toLowerCase() === 'completed' ||
    Number.isFinite(completedAtMs);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [thumbnailStates, setThumbnailStates] = useState({});
  const [downloadingStates, setDownloadingStates] = useState({});
  const [retryCount, setRetryCount] = useState(0);
  const [videoRetryCount, setVideoRetryCount] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const parseStoragePathFromPublicUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    try {
      const marker = '/storage/v1/object/public/rental-videos/';
      const markerIndex = url.indexOf(marker);
      if (markerIndex === -1) return null;
      return decodeURIComponent(url.slice(markerIndex + marker.length));
    } catch (err) {
      console.warn('Failed to parse storage path from public URL:', err);
      return null;
    }
  };

  const isVehicleMediaUpload = (item) => {
    if (!item) return false;
    const storagePath = String(item.storage_path || '');
    const originalFilename = String(item.original_filename || '');
    return storagePath.includes('/vehicle/') || originalFilename.startsWith('vehicle_');
  };

  const isPostCompletionMedia = (item) => {
    if (item?.phase === 'out') return false;
    return isVehicleMediaUpload(item);
  };

  // Load all media (images and videos) for the rental
  useEffect(() => {
    if (!rental?.id) {
      setLoading(false);
      return;
    }

    const loadMedia = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('📹 Loading media for rental:', rental.id);

        const { data: mediaRecords, error: mediaError } = await supabase
          .from('app_2f7bf469b0_rental_media')
          .select('*')
          .eq('rental_id', rental.id)
          .order('created_at', { ascending: false });

        if (mediaError) {
          console.error('Database error:', mediaError);
          throw new Error(`Failed to load media: ${mediaError.message}`);
        }

        if (mediaRecords && mediaRecords.length > 0) {
          const mediaItems = mediaRecords.map(record => {
            const normalizedFileType = record.file_type?.toLowerCase?.() || '';
            const isImage = normalizedFileType.startsWith('image/') ||
                           normalizedFileType === 'image' ||
                           record.media_category === 'image' ||
                           /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(record.original_filename || '');

            return {
              id: record.id,
              type: isImage ? 'image' : 'video',
              isImage: isImage,
              url: record.public_url,
              thumbnailUrl: isImage ? record.public_url : (record.thumbnail_url || record.poster_url),
              duration: record.duration || 0,
              timestamp: record.created_at,
              original_filename: record.original_filename,
              file_size: record.file_size,
              phase: record.phase,
              poster_url: record.poster_url,
              storage_path: record.storage_path,
              file_type: record.file_type,
              isUrlValid: !!record.public_url
            };
          });

          console.log('📹 Media loaded:', mediaItems.length, '(Images:', mediaItems.filter(m => m.isImage).length, ', Videos:', mediaItems.filter(m => !m.isImage).length, ')');
          setMedia(mediaItems);
        } else {
          setMedia([]);
        }
      } catch (err) {
        console.error('Error loading media:', err);
        setError(`Failed to load media: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadMedia();
  }, [rental?.id, retryCount]);

  // Filter media based on selected type
  const filteredMedia = media.filter(item => {
    if (filterType === 'all') return true;
    if (filterType === 'images') return item.isImage;
    if (filterType === 'videos') return !item.isImage;
    return true;
  });

  const imageCount = media.filter(m => m.isImage).length;
  const videoCount = media.filter(m => !m.isImage).length;

  // Generate thumbnail from video
  const generateThumbnailFromVideo = async (videoUrl, itemId) => {
    return new Promise((resolve) => {
      setThumbnailStates(prev => ({ ...prev, [itemId]: 'generating' }));

      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'metadata';

      const timeout = setTimeout(() => {
        console.log('⏱️ Thumbnail generation timed out for:', itemId);
        setThumbnailStates(prev => ({ ...prev, [itemId]: 'error' }));
        resolve(null);
      }, 15000);

      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(1, video.duration * 0.1);
        } catch (e) {
          console.error('Error seeking video:', e);
          clearTimeout(timeout);
          setThumbnailStates(prev => ({ ...prev, [itemId]: 'error' }));
          resolve(null);
        }
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

          clearTimeout(timeout);
          setThumbnailStates(prev => ({ ...prev, [itemId]: 'success' }));
          resolve(thumbnail);
        } catch (e) {
          console.error('Error generating thumbnail:', e);
          clearTimeout(timeout);
          setThumbnailStates(prev => ({ ...prev, [itemId]: 'error' }));
          resolve(null);
        }
      };

      video.onerror = () => {
        console.error('Error loading video for thumbnail');
        clearTimeout(timeout);
        setThumbnailStates(prev => ({ ...prev, [itemId]: 'error' }));
        resolve(null);
      };

      video.src = videoUrl;
      video.load();
    });
  };

  // Generate missing thumbnails for videos
  useEffect(() => {
    const generateMissingThumbnails = async () => {
      for (const item of media) {
        if (!item.isImage && !item.thumbnailUrl && item.url && item.isUrlValid && !thumbnailStates[item.id]) {
          try {
            const thumbnail = await generateThumbnailFromVideo(item.url, item.id);
            if (thumbnail) {
              setMedia(prev => prev.map(m =>
                m.id === item.id ? { ...m, generatedThumbnail: thumbnail } : m
              ));
            }
          } catch (err) {
            console.error('Error in thumbnail generation:', err);
          }
        }
      }
    };

    if (media.length > 0) {
      generateMissingThumbnails();
    }
  }, [media.length]);

  const handleDownload = async (item, event) => {
    event?.stopPropagation();

    if (!item.url || !item.isUrlValid) {
      setError('URL is not available for download');
      return;
    }

    try {
      setDownloadingStates(prev => ({ ...prev, [item.id]: true }));

      try {
        const response = await fetch(item.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = item.original_filename || `rental_${item.isImage ? 'image' : 'video'}_${item.id}.${item.isImage ? 'jpg' : 'mp4'}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
      } catch (fetchError) {
        console.warn('Blob download failed:', fetchError);
      }

      try {
        const link = document.createElement('a');
        link.href = item.url;
        link.download = item.original_filename || `rental_${item.isImage ? 'image' : 'video'}_${item.id}.${item.isImage ? 'jpg' : 'mp4'}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch (linkError) {
        console.warn('Direct download failed:', linkError);
      }
    } catch (err) {
      console.error('Download failed:', err);
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingStates(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleMediaKeyDown = (event, item) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleMediaClick(item);
    }
  };

  const handleMediaClick = (item) => {
    if (!item.isUrlValid) {
      setError('URL is not accessible');
      return;
    }

    if (item.isImage) {
      setViewingImage(item);
    } else {
      const isMov = item.original_filename?.toLowerCase().endsWith('.mov');
      if (isMov) {
        window.open(item.url, '_blank');
      } else {
        setPlayingVideo(item);
        setVideoRetryCount(0);
      }
    }
  };

  const closeVideoModal = () => {
    setPlayingVideo(null);
    setVideoRetryCount(0);
  };

  const closeImageLightbox = () => {
    setViewingImage(null);
  };

  const navigateImage = (direction) => {
    const images = filteredMedia.filter(m => m.isImage);
    const currentIndex = images.findIndex(img => img.id === viewingImage?.id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next'
      ? (currentIndex + 1) % images.length
      : (currentIndex - 1 + images.length) % images.length;

    setViewingImage(images[newIndex]);
  };

  const handleRetry = () => {
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getPhaseLabel = (itemOrPhase) => {
    const phase = typeof itemOrPhase === 'string' ? itemOrPhase : itemOrPhase?.phase;
    if (phase === 'out') return tr('Opening', 'Départ');
    if (phase === 'media') return tr('Media', 'Médias');
    return isPostCompletionMedia(itemOrPhase) ? tr('Media', 'Médias') : tr('Closing', 'Retour');
  };
  const getPhaseColor = (itemOrPhase) => {
    const phase = typeof itemOrPhase === 'string' ? itemOrPhase : itemOrPhase?.phase;
    if (phase === 'out') return 'bg-green-100 text-green-800';
    if (phase === 'media') return 'bg-violet-100 text-violet-800';
    return isPostCompletionMedia(itemOrPhase) ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800';
  };

  const handleDeleteMedia = async () => {
    if (!canDeleteMedia || !deleteTarget?.id) return;

    try {
      setIsDeleting(true);
      const storagePaths = Array.from(
        new Set(
          [
            deleteTarget.storage_path,
            parseStoragePathFromPublicUrl(deleteTarget.thumbnail_url || deleteTarget.thumbnailUrl),
            parseStoragePathFromPublicUrl(deleteTarget.poster_url),
          ].filter(Boolean)
        )
      );

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('rental-videos')
          .remove(storagePaths);

        if (storageError) {
          console.warn('Vehicle media storage cleanup warning:', storageError);
        }
      }

      const { error: mediaDeleteError } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .delete()
        .eq('id', deleteTarget.id);

      if (mediaDeleteError) throw mediaDeleteError;

      if (playingVideo?.id === deleteTarget.id) {
        setPlayingVideo(null);
      }
      if (viewingImage?.id === deleteTarget.id) {
        setViewingImage(null);
      }

      setMedia((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to delete vehicle media:', err);
      setError(err.message || 'Failed to delete media');
    } finally {
      setIsDeleting(false);
    }
  };

  // Compact thumbnail component for grid view
  const CompactThumbnail = ({ item }) => {
    const thumbnailSrc = item.isImage ? item.url : (item.thumbnailUrl || item.generatedThumbnail);
    const isGenerating = !item.isImage && thumbnailStates[item.id] === 'generating';
    const hasError = !item.isImage && thumbnailStates[item.id] === 'error';

    return (
      <div
        className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden group cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
        onClick={() => handleMediaClick(item)}
        onKeyDown={(event) => handleMediaKeyDown(event, item)}
        role="button"
        tabIndex={0}
        aria-label={`${item.isImage ? tr('View', 'Voir') : tr('Play', 'Lire')} ${getPhaseLabel(item)} ${item.isImage ? tr('image', 'image') : tr('video', 'vidéo')}: ${item.original_filename}`}
      >
        {item.isImage ? (
          <img
            src={item.url}
            alt={`${getPhaseLabel(item)} ${tr('condition', 'état')}`}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af"%3ENo Image%3C/text%3E%3C/svg%3E';
            }}
          />
        ) : thumbnailSrc && !isGenerating && !hasError ? (
          <img
            src={thumbnailSrc}
            alt={`${getPhaseLabel(item)} ${tr('video thumbnail', 'aperçu vidéo')}`}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
              e.target.style.display = 'none';
              setThumbnailStates(prev => ({ ...prev, [item.id]: 'error' }));
            }}
          />
        ) : isGenerating ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
            <Video className="w-8 h-8 text-white" />
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 flex items-center justify-center transition-all">
          <div className="bg-white bg-opacity-90 rounded-full p-2 transform scale-0 group-hover:scale-100 transition-transform">
            {item.isImage ? (
              <ZoomIn className="w-5 h-5 text-gray-800" />
            ) : (
              <Play className="w-5 h-5 text-gray-800 fill-current" />
            )}
          </div>
        </div>

        {/* Type indicator */}
        <div className="absolute top-1 left-1">
          <div className={`p-1 rounded ${item.isImage ? 'bg-amber-500' : 'bg-blue-500'}`}>
            {item.isImage ? (
              <Camera className="w-3 h-3 text-white" />
            ) : (
              <Video className="w-3 h-3 text-white" />
            )}
          </div>
        </div>

        {/* Phase badge */}
        <div className="absolute top-1 right-1">
              <Badge className={`text-[10px] px-1 py-0 ${getPhaseColor(item)}`}>
                {item.phase === 'out' ? 'O' : isPostCompletionMedia(item) ? 'M' : 'C'}
              </Badge>
            </div>

        {/* Duration for videos */}
        {!item.isImage && item.duration > 0 && (
          <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white px-1 py-0.5 rounded text-[10px]">
            {formatDuration(item.duration)}
          </div>
        )}

        {/* Download button on hover */}
        <button
          type="button"
          className="absolute bottom-1 left-1 bg-white bg-opacity-90 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-100"
          onClick={(e) => handleDownload(item, e)}
          disabled={downloadingStates[item.id]}
        >
          {downloadingStates[item.id] ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3 text-gray-700" />
          )}
        </button>
        {canDeleteMedia && (
          <button
            type="button"
            className="absolute bottom-1 left-8 bg-white bg-opacity-90 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(item);
            }}
            disabled={isDeleting}
          >
            <Trash2 className="w-3 h-3 text-red-600" />
          </button>
        )}
      </div>
    );
  };

  // List view item component
  const ListViewItem = ({ item }) => {
    const thumbnailSrc = item.isImage ? item.url : (item.thumbnailUrl || item.generatedThumbnail);

    return (
      <div className="flex items-center gap-3 p-2 bg-white border rounded-lg hover:shadow-md transition-shadow">
        <div
          className="relative w-16 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden cursor-pointer"
          onClick={() => handleMediaClick(item)}
          onKeyDown={(event) => handleMediaKeyDown(event, item)}
          role="button"
          tabIndex={0}
          aria-label={`${item.isImage ? 'View' : 'Play'} ${getPhaseLabel(item)} ${item.isImage ? 'image' : 'video'}: ${item.original_filename}`}
        >
          {thumbnailSrc ? (
            <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
              <Video className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center transition-all">
            {item.isImage ? (
              <ZoomIn className="w-4 h-4 text-white opacity-0 hover:opacity-100" />
            ) : (
              <Play className="w-4 h-4 text-white fill-current opacity-0 hover:opacity-100" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`text-[10px] ${getPhaseColor(item)}`}>
              {getPhaseLabel(item)}
            </Badge>
            <span className="text-xs text-gray-500">
              {item.isImage ? tr('Photo', 'Photo') : tr('Video', 'Vidéo')}
            </span>
          </div>
          <p className="text-sm text-gray-700 truncate">{item.original_filename}</p>
          <p className="text-xs text-gray-500">
            {formatFileSize(item.file_size)}
            {!item.isImage && item.duration > 0 && ` • ${formatDuration(item.duration)}`}
          </p>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleMediaClick(item)}
          >
            {item.isImage ? <ZoomIn className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => handleDownload(item, e)}
            disabled={downloadingStates[item.id]}
          >
            {downloadingStates[item.id] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </Button>
          {canDeleteMedia && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(item);
              }}
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Calculate grid columns based on item count
  const getGridClass = () => {
    const count = filteredMedia.length;
    if (count === 1) return 'grid-cols-1 max-w-xs';
    if (count === 2) return 'grid-cols-2 max-w-md';
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-4 max-w-2xl';
    if (count <= 6) return 'grid-cols-3 sm:grid-cols-6';
    if (count <= 9) return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9';
    return 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8';
  };

  if (loading) {
    return (
      <Card className="overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Camera className="w-5 h-5 text-violet-700" />
            {tr('Vehicle Media', 'Médias véhicule')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">{tr('Loading media...', 'Chargement des médias...')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Camera className="w-5 h-5 text-violet-700" />
            {tr('Vehicle Media', 'Médias véhicule')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-[0_12px_30px_rgba(239,68,68,0.08)]">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-800">{tr('Error', 'Erreur')}</span>
            </div>
            <p className="text-red-700 text-sm mb-3">{error}</p>
            <Button onClick={handleRetry} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              {tr('Retry', 'Réessayer')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden rounded-[28px] border border-violet-100/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <Camera className="w-5 h-5 text-violet-700" />
              {tr('Vehicle Media', 'Médias véhicule')}
              {media.length > 0 && (
                <Badge variant="secondary" className="ml-1 border border-violet-100 bg-violet-50 text-violet-700">
                  {media.length}
                </Badge>
              )}
            </CardTitle>

            {media.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* View mode toggle */}
                <div className="flex overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm">
                  <button
                    type="button"
                    className={`p-1.5 ${viewMode === 'grid' ? 'bg-violet-100 text-violet-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    onClick={() => setViewMode('grid')}
                    title={tr('Grid view', 'Vue grille')}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className={`p-1.5 ${viewMode === 'list' ? 'bg-violet-100 text-violet-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    onClick={() => setViewMode('list')}
                    title={tr('List view', 'Vue liste')}
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                </div>

                {/* Filter buttons */}
                <div className="flex gap-1">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('all')}
                    className={`text-xs h-7 px-2 ${filterType === 'all' ? 'bg-violet-700 text-white hover:bg-violet-800 hover:text-white' : 'border-violet-100 text-slate-600 hover:bg-violet-50'}`}
                  >
                    {tr('All', 'Tous')} ({media.length})
                  </Button>
                  {imageCount > 0 && (
                    <Button
                      variant={filterType === 'images' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterType('images')}
                      className={`text-xs h-7 px-2 ${filterType === 'images' ? 'bg-violet-700 text-white hover:bg-violet-800 hover:text-white' : 'border-violet-100 text-slate-600 hover:bg-violet-50'}`}
                    >
                      <ImageIcon className="w-3 h-3 mr-1" />
                      {imageCount}
                    </Button>
                  )}
                  {videoCount > 0 && (
                    <Button
                      variant={filterType === 'videos' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterType('videos')}
                      className={`text-xs h-7 px-2 ${filterType === 'videos' ? 'bg-violet-700 text-white hover:bg-violet-800 hover:text-white' : 'border-violet-100 text-slate-600 hover:bg-violet-50'}`}
                    >
                      <Video className="w-3 h-3 mr-1" />
                      {videoCount}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {media.length === 0 ? (
            <div className="rounded-2xl border border-violet-100 bg-slate-50/70 py-8 text-center text-gray-500">
              <Camera className="mx-auto mb-3 h-10 w-10 text-violet-300" />
              <p className="font-medium">{tr('No media recorded yet', 'Aucun média enregistré pour le moment')}</p>
              <p className="text-sm">
                {isCompletedRental
                  ? tr('Vehicle photos and videos added after completion will appear here', 'Les photos et vidéos ajoutées après la clôture apparaîtront ici')
                  : tr('Photos and videos will appear here', 'Les photos et vidéos apparaîtront ici')}
              </p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="rounded-2xl border border-violet-100 bg-slate-50/70 py-8 text-center text-gray-500">
              <Filter className="mx-auto mb-3 h-10 w-10 text-violet-300" />
              <p className="font-medium">{tr('No matching media found', 'Aucun média correspondant trouvé')}</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className={`grid ${getGridClass()} gap-2 mx-auto`}>
              {filteredMedia.map((item) => (
                <CompactThumbnail key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredMedia.map((item) => (
                <ListViewItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Player Modal */}
      {playingVideo && (
        <Dialog open={!!playingVideo} onOpenChange={(open) => !open && closeVideoModal()}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0">
            <DialogHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  {playingVideo.original_filename}
                </DialogTitle>
                <Button variant="ghost" size="sm" onClick={closeVideoModal} className="h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <DialogDescription>
                {getPhaseLabel(playingVideo)} {tr('vehicle condition recording', "enregistrement de l'état du véhicule")}
              </DialogDescription>
            </DialogHeader>

            <div className="p-4">
              <div className="relative bg-black rounded-lg overflow-hidden mb-4">
                <video
                  key={`${playingVideo.id}-${videoRetryCount}`}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[60vh]"
                  poster={playingVideo.thumbnailUrl || playingVideo.generatedThumbnail}
                  onError={() => {
                    if (videoRetryCount < 3) {
                      setTimeout(() => setVideoRetryCount(prev => prev + 1), 1500);
                    } else {
                      setError('Video playback failed');
                    }
                  }}
                >
                  <source src={`${playingVideo.url}?t=${Date.now()}`} type="video/mp4" />
                  <source src={`${playingVideo.url}?t=${Date.now()}`} type="video/webm" />
                </video>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center gap-4">
                  <Badge className={getPhaseColor(playingVideo)}>
                    {getPhaseLabel(playingVideo)}
                  </Badge>
                  <span>{formatDuration(playingVideo.duration)}</span>
                  <span>{formatFileSize(playingVideo.file_size)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDownload(playingVideo, e)}
                    disabled={downloadingStates[playingVideo.id]}
                  >
                    {downloadingStates[playingVideo.id] ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {tr('Download', 'Télécharger')}
                  </Button>
                  {canDeleteMedia && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setDeleteTarget(playingVideo)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {tr('Delete', 'Supprimer')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Image Lightbox Modal */}
      {viewingImage && (
        <Dialog open={!!viewingImage} onOpenChange={(open) => !open && closeImageLightbox()}>
          <DialogContent className="max-w-5xl max-h-[95vh] p-0 bg-black/95">
            <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/70 to-transparent">
              <div className="flex items-center justify-between text-white">
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  {viewingImage.original_filename}
                </DialogTitle>
                <Button variant="ghost" size="sm" onClick={closeImageLightbox} className="h-8 w-8 p-0 text-white hover:bg-white/20">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <DialogDescription className="sr-only">
                {getPhaseLabel(viewingImage)} {tr('vehicle condition image', "image de l'état du véhicule")}
              </DialogDescription>
            </DialogHeader>

            <div className="relative flex items-center justify-center min-h-[400px] p-4">
              {/* Navigation arrows */}
              {filteredMedia.filter(m => m.isImage).length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 rounded-full p-2 text-white transition-colors"
                    onClick={() => navigateImage('prev')}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 rounded-full p-2 text-white transition-colors"
                    onClick={() => navigateImage('next')}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              <img
                src={viewingImage.url}
                alt={`${getPhaseLabel(viewingImage.phase)} ${tr('condition', 'état')}`}
                className="max-w-full max-h-[80vh] object-contain rounded"
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center justify-between text-white text-sm">
                <div className="flex items-center gap-3">
                  <Badge className={getPhaseColor(viewingImage)}>
                    {getPhaseLabel(viewingImage)}
                  </Badge>
                  <span>{formatFileSize(viewingImage.file_size)}</span>
                  <span className="text-white/70">{formatTimestamp(viewingImage.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDownload(viewingImage, e)}
                    disabled={downloadingStates[viewingImage.id]}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                  >
                    {downloadingStates[viewingImage.id] ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {tr('Download', 'Télécharger')}
                  </Button>
                  {canDeleteMedia && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(viewingImage)}
                      disabled={isDeleting}
                      className="border-red-300 bg-white/10 text-red-100 hover:bg-red-500/20 hover:text-white"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {tr('Delete', 'Supprimer')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canDeleteMedia && (
        <DeleteMediaDialog
          isOpen={Boolean(deleteTarget)}
          onClose={() => !isDeleting && setDeleteTarget(null)}
          onConfirm={handleDeleteMedia}
          mediaData={deleteTarget ? {
            ...deleteTarget,
            file_type: deleteTarget.file_type || (deleteTarget.isImage ? 'image/jpeg' : 'video/mp4'),
            uploaded_at: deleteTarget.timestamp,
            phase: deleteTarget.phase,
            phaseLabel: getPhaseLabel(deleteTarget),
          } : null}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
};

export default RentalVideos;
