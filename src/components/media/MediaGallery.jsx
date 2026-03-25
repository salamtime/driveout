import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Download, 
  Eye, 
  Image as ImageIcon, 
  Video, 
  FileText,
  Grid3X3,
  List,
  Filter,
  Search
} from 'lucide-react';
import VideoModal from '../video/VideoModal';
import MobileVideoPlayer from '../video/MobileVideoPlayer';
import { 
  getVideoFormat, 
  formatFileSize, 
  formatDuration,
  isMobileDevice,
  createVideoThumbnail,
  getVideoMetadata
} from '../../utils/videoUtils';

const MediaGallery = ({ 
  media = [], 
  title = "Media Gallery",
  onMediaClick,
  className = "",
  showThumbnails = true,
  maxItems = null,
  allowFiltering = true,
  allowSearch = true,
  viewMode: initialViewMode = 'grid' // 'grid' or 'list'
}) => {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isMobile] = useState(isMobileDevice());
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [videoThumbnails, setVideoThumbnails] = useState({});
  const [videoMetadata, setVideoMetadata] = useState({});

  // Generate video thumbnails
  useEffect(() => {
    const generateThumbnails = async () => {
      const videoItems = media.filter(item => getMediaType(item.url) === 'video');
      
      for (const item of videoItems) {
        if (!videoThumbnails[item.url]) {
          try {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src = item.url;
            
            const thumbnail = await createVideoThumbnail(video, 1);
            const metadata = await getVideoMetadata(item.url);
            
            setVideoThumbnails(prev => ({
              ...prev,
              [item.url]: thumbnail
            }));
            
            setVideoMetadata(prev => ({
              ...prev,
              [item.url]: metadata
            }));
          } catch (error) {
            console.warn('Failed to generate thumbnail for:', item.url, error);
          }
        }
      }
    };

    if (media.length > 0) {
      generateThumbnails();
    }
  }, [media, videoThumbnails]);

  const getMediaType = useCallback((url) => {
    if (!url) return 'unknown';
    
    const extension = url.split('.').pop().toLowerCase().split('?')[0];
    
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) {
      return 'video';
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
      return 'image';
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(extension)) {
      return 'document';
    }
    
    return 'unknown';
  }, []);

  const getMediaIcon = useCallback((type) => {
    switch (type) {
      case 'video':
        return <Video className="w-6 h-6" />;
      case 'image':
        return <ImageIcon className="w-6 h-6" />;
      case 'document':
        return <FileText className="w-6 h-6" />;
      default:
        return <FileText className="w-6 h-6" />;
    }
  }, []);

  const getTypeColor = useCallback((type) => {
    switch (type) {
      case 'video':
        return 'bg-blue-100 text-blue-600';
      case 'image':
        return 'bg-green-100 text-green-600';
      case 'document':
        return 'bg-purple-100 text-purple-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }, []);

  // Filter and search media
  const filteredMedia = media.filter(item => {
    const mediaType = getMediaType(item.url);
    const matchesFilter = filter === 'all' || mediaType === filter;
    const matchesSearch = !searchQuery || 
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const displayMedia = maxItems ? filteredMedia.slice(0, maxItems) : filteredMedia;

  const handleMediaClick = useCallback((mediaItem) => {
    const mediaType = getMediaType(mediaItem.url);
    
    if (mediaType === 'video') {
      setSelectedMedia(mediaItem);
      setIsVideoModalOpen(true);
    } else if (onMediaClick) {
      onMediaClick(mediaItem);
    } else {
      // Default behavior - open in new tab
      window.open(mediaItem.url, '_blank');
    }
  }, [onMediaClick]);

  const handleDownload = useCallback((mediaItem, e) => {
    e.stopPropagation();
    
    const link = document.createElement('a');
    link.href = mediaItem.url;
    link.download = mediaItem.name || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const closeVideoModal = useCallback(() => {
    setIsVideoModalOpen(false);
    setSelectedMedia(null);
  }, []);

  if (!media || media.length === 0) {
    return (
      <div className={`media-gallery-empty ${className}`}>
        <div className="text-center py-12 text-gray-500">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No media files</h3>
          <p className="text-gray-600">No media files have been uploaded yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`media-gallery ${className}`}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          
          {/* View Controls */}
          <div className="flex items-center space-x-2">
            {!isMobile && (
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters and Search */}
      {(allowFiltering || allowSearch) && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search */}
          {allowSearch && (
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search media files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Filter */}
          {allowFiltering && (
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Types</option>
                <option value="video">Videos</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Results Count */}
      {(searchQuery || filter !== 'all') && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {displayMedia.length} of {media.length} files
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}

      {/* Media Grid/List */}
      {displayMedia.length > 0 ? (
        <div className={`${
          viewMode === 'grid' && !isMobile
            ? showThumbnails 
              ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6' 
              : 'grid grid-cols-1 md:grid-cols-2 gap-4'
            : 'space-y-4'
        }`}>
          {displayMedia.map((mediaItem, index) => (
            <MediaItem
              key={index}
              mediaItem={mediaItem}
              mediaType={getMediaType(mediaItem.url)}
              isMobile={isMobile}
              viewMode={viewMode}
              showThumbnails={showThumbnails}
              thumbnail={videoThumbnails[mediaItem.url]}
              metadata={videoMetadata[mediaItem.url]}
              onMediaClick={() => handleMediaClick(mediaItem)}
              onDownload={(e) => handleDownload(mediaItem, e)}
              getMediaIcon={getMediaIcon}
              getTypeColor={getTypeColor}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">
            {searchQuery 
              ? `No files match "${searchQuery}"`
              : `No ${filter} files found`
            }
          </p>
        </div>
      )}

      {/* Load More */}
      {maxItems && media.length > maxItems && (
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600 mb-3">
            Showing {maxItems} of {media.length} items
          </p>
          <button
            onClick={() => {/* Implement load more */}}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {/* Video Modal */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={closeVideoModal}
        videoSrc={selectedMedia?.url}
        title={selectedMedia?.name || 'Video Player'}
        description={selectedMedia?.description || ''}
        metadata={{
          file_size: selectedMedia?.size || 0,
          created_at: selectedMedia?.createdAt ? new Date(selectedMedia.createdAt).toLocaleDateString() : 'Unknown',
          type: selectedMedia?.type || 'Video',
          phase: selectedMedia?.phase || 'Media',
          duration: videoMetadata[selectedMedia?.url]?.duration || 0,
          format: getVideoFormat(selectedMedia?.url || ''),
          dimensions: videoMetadata[selectedMedia?.url] ? 
            `${videoMetadata[selectedMedia.url].width}x${videoMetadata[selectedMedia.url].height}` : 'Unknown'
        }}
      />
    </div>
  );
};

// Media Item Component
const MediaItem = ({ 
  mediaItem, 
  mediaType, 
  isMobile, 
  viewMode,
  showThumbnails, 
  thumbnail,
  metadata,
  onMediaClick, 
  onDownload, 
  getMediaIcon, 
  getTypeColor 
}) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const isGridView = viewMode === 'grid' && !isMobile;
  const isListView = viewMode === 'list' || isMobile;

  if (isListView) {
    return (
      <div className="flex items-center p-4 bg-white rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
        {/* Icon/Thumbnail */}
        <div className="flex-shrink-0 mr-4">
          <div className={`p-3 rounded-lg ${getTypeColor(mediaType)}`}>
            {getMediaIcon(mediaType)}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={onMediaClick}>
          <h4 className="font-medium text-gray-900 truncate">
            {mediaItem.name || 'Untitled'}
          </h4>
          
          <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
            <span className="capitalize">{mediaType}</span>
            {mediaItem.size && (
              <span>{formatFileSize(mediaItem.size)}</span>
            )}
            {mediaType === 'video' && metadata?.duration && (
              <span>{formatDuration(metadata.duration)}</span>
            )}
            {mediaItem.createdAt && (
              <span>{new Date(mediaItem.createdAt).toLocaleDateString()}</span>
            )}
          </div>
          
          {mediaItem.description && (
            <p className="text-sm text-gray-600 mt-1 truncate">
              {mediaItem.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 ml-4">
          <button
            onClick={onDownload}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Grid View
  return (
    <div className="bg-white rounded-lg border hover:shadow-lg transition-all duration-200 overflow-hidden group cursor-pointer">
      {/* Thumbnail */}
      {showThumbnails && (
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          {mediaType === 'video' ? (
            <div className="relative w-full h-full">
              {thumbnail && !thumbnailError ? (
                <img
                  src={thumbnail}
                  alt={mediaItem.name}
                  className="w-full h-full object-cover"
                  onError={() => setThumbnailError(true)}
                />
              ) : (
                <video
                  className="w-full h-full object-cover"
                  poster={mediaItem.thumbnail}
                  onError={() => setThumbnailError(true)}
                >
                  <source src={mediaItem.url} type="video/webm" />
                  <source src={mediaItem.url} type="video/mp4" />
                </video>
              )}
              
              {/* Play Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white rounded-full p-3">
                  <Play className="w-6 h-6 text-gray-800 ml-1" />
                </div>
              </div>
              
              {/* Duration Badge */}
              {metadata?.duration && (
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                  {formatDuration(metadata.duration)}
                </div>
              )}
            </div>
          ) : mediaType === 'image' ? (
            <img
              src={mediaItem.url}
              alt={mediaItem.name}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setThumbnailError(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {getMediaIcon(mediaType)}
            </div>
          )}
          
          {/* Action Buttons Overlay */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex space-x-1">
              <button
                onClick={onMediaClick}
                className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-all"
                title="View"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={onDownload}
                className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-all"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Info */}
      <div className="p-4" onClick={onMediaClick}>
        <h4 className="font-medium text-gray-900 truncate mb-2">
          {mediaItem.name || 'Untitled'}
        </h4>
        
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span className="capitalize">{mediaType}</span>
          {mediaItem.size && (
            <span>{formatFileSize(mediaItem.size)}</span>
          )}
        </div>
        
        {mediaType === 'video' && metadata && (
          <div className="text-xs text-gray-500 mb-2">
            {metadata.duration && (
              <span>Duration: {formatDuration(metadata.duration)} • </span>
            )}
            {metadata.width && metadata.height && (
              <span>{metadata.width}x{metadata.height}</span>
            )}
          </div>
        )}
        
        {mediaItem.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {mediaItem.description}
          </p>
        )}
        
        {mediaItem.createdAt && (
          <div className="text-xs text-gray-500">
            {new Date(mediaItem.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaGallery;