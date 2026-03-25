import React, { useEffect, useState } from 'react';
import { File, Download, Eye, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const VehicleDocuments = ({ 
  documents = [], 
  onDocumentsChange,
  onDeleteDocument, 
  canDelete = true, 
  className = '', 
  vehicleId, 
  loadFromStorage = true 
}) => {
  const [loading, setLoading] = useState(false);
  const [vehicleMedia, setVehicleMedia] = useState([]);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [lastSyncedSignature, setLastSyncedSignature] = useState('');
  
  // FIXED: Use existing vehicle-documents bucket instead of vehicle-media
  const BUCKET_NAME = 'vehicle-documents';
  
  // Debug logging
  console.log('🔍 VehicleDocuments Debug:', {
    vehicleId,
    documentsLength: documents.length,
    loadFromStorage,
    vehicleMediaLength: vehicleMedia.length
  });
  
  // FIXED: Load media only for specific vehicle_id from storage
  useEffect(() => {
    if (loadFromStorage && vehicleId) {
      console.log('📥 Loading media from storage for vehicle:', vehicleId);
      loadVehicleMedia();
    } else {
      // Clear vehicle media when not loading from storage or no vehicleId
      console.log('🚫 Clearing vehicle media state');
      setVehicleMedia([]);
    }
    
    // FIXED: Cleanup on unmount to prevent bleed-over between vehicles
    return () => {
      console.log('🧹 Cleaning up vehicle media state on unmount');
      setVehicleMedia([]);
    };
  }, [vehicleId, loadFromStorage]);

  // FIXED: Load media from storage with proper vehicle_id scoping
  const loadVehicleMedia = async () => {
    if (!vehicleId) {
      console.warn('⚠️ No vehicleId provided, skipping media load');
      return;
    }

    setLoading(true);
    console.log('🔄 Loading vehicle media from storage for vehicle:', vehicleId);
    
    try {
      // FIXED: List files in vehicle-specific folder using existing bucket
      const { data: files, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(vehicleId.toString(), {
          limit: 100,
          offset: 0
        });

      if (error) {
        console.error('❌ Storage list error:', error);
        throw error;
      }

      console.log('📄 Found files in vehicle storage folder:', files?.length || 0, files);

      if (files && files.length > 0) {
        // Filter valid files (exclude folders and placeholder files)
        const validFiles = files.filter(file => 
          file.name && 
          !file.name.endsWith('/') && 
          file.name !== '.emptyFolderPlaceholder'
        );

        console.log('✅ Valid files after filtering:', validFiles.length, validFiles);

        // Convert files to document objects
        // CRITICAL: Always ensure array
        const safeValidFiles = Array.isArray(validFiles) ? validFiles : [];
        const documents = safeValidFiles.map(file => {
          const fullPath = `${vehicleId}/${file.name}`;
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fullPath);

          // Extract original filename from the timestamp pattern
          const originalName = extractOriginalFilename(file.name);
          const fileType = getMimeTypeFromName(originalName);

          return {
            id: file.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: originalName,
            type: fileType,
            size: file.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath: fullPath,
            uploadedAt: file.created_at || new Date().toISOString(),
            category: getCategoryFromType(fileType),
            vehicleId: vehicleId
          };
        });

        console.log('✅ Processed vehicle media:', documents.length);
        setVehicleMedia(documents);
        if (onDocumentsChange) {
          const signature = JSON.stringify(
            documents.map((doc) => ({
              id: doc.id,
              storagePath: doc.storagePath,
              url: doc.url,
              name: doc.name,
            }))
          );

          if (signature !== lastSyncedSignature) {
            setLastSyncedSignature(signature);
            onDocumentsChange(documents);
          }
        }
      } else {
        console.log('📭 No media found for vehicle:', vehicleId);
        setVehicleMedia([]);
        if (onDocumentsChange && lastSyncedSignature !== '[]') {
          setLastSyncedSignature('[]');
          onDocumentsChange([]);
        }
      }
      
    } catch (error) {
      console.error('❌ Error loading vehicle media:', error);
      setVehicleMedia([]);
      if (onDocumentsChange && lastSyncedSignature !== '[]') {
        setLastSyncedSignature('[]');
        onDocumentsChange([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Extract original filename from stored filename
  const extractOriginalFilename = (storedName) => {
    // Handle the pattern: timestamp_randomstring.extension
    if (/^\d{13}_/.test(storedName)) {
      const parts = storedName.split('_');
      if (parts.length >= 2) {
        // Remove timestamp (first part) and keep the rest
        return parts.slice(1).join('_');
      }
    }
    
    return storedName;
  };

  const getMimeTypeFromName = (name) => {
    const extension = name.split('.').pop()?.toLowerCase() || '';
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  };

  const getCategoryFromType = (mimeType) => {
    if (!mimeType) return 'Other';
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'Document';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet';
    return 'Other';
  };

  // CRITICAL: Safe array access - Combine documents based on loadFromStorage setting
  const safeDocuments = Array.isArray(documents) ? documents : [];
  const safeVehicleMedia = Array.isArray(vehicleMedia) ? vehicleMedia : [];
  const allDocuments = loadFromStorage
    ? [...safeDocuments, ...safeVehicleMedia].filter((doc, index, list) => {
        const docKey = doc?.storagePath || doc?.url || doc?.id;
        return list.findIndex((item) => (item?.storagePath || item?.url || item?.id) === docKey) === index;
      })
    : safeDocuments;
  
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCategoryColor = (category) => {
    switch (category?.toLowerCase()) {
      case 'pdf': return 'bg-red-100 text-red-800';
      case 'document': return 'bg-blue-100 text-blue-800';
      case 'spreadsheet': return 'bg-green-100 text-green-800';
      case 'image': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isImage = (doc) => {
    return doc.type && doc.type.startsWith('image/');
  };

  const handleView = (doc) => {
    if (doc.url) {
      window.open(doc.url, '_blank');
    }
  };

  const handleDownload = async (doc) => {
    try {
      console.log('📥 Downloading document:', doc.name, 'URL:', doc.url);
      const response = await fetch(doc.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = doc.name;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('✅ Download completed successfully');
    } catch (error) {
      console.error('❌ Download failed:', error);
      alert('Failed to download document');
    }
  };

  // FIXED: True deletion - remove from storage using existing bucket
  const handleDelete = async (doc) => {
    if (!canDelete) return;
    
    // Confirmation dialog
    const confirmMessage = `Are you sure you want to delete "${doc.name}"?\n\nThis action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setDeletingDocumentId(doc.id);
    console.log('🗑️ Starting deletion process for document:', doc.name);
    console.log('📍 Storage path:', doc.storagePath);
    console.log('🆔 Document ID:', doc.id);
    console.log('🚗 Vehicle ID:', doc.vehicleId || vehicleId);
    
    try {
      // FIXED: Delete from storage using existing bucket
      if (doc.storagePath) {
        console.log('🔄 Deleting from storage:', doc.storagePath);
        const { error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([doc.storagePath]);

        if (storageError) {
          console.error('❌ Storage deletion error:', storageError);
          throw new Error(`Failed to delete from storage: ${storageError.message}`);
        }
        
        console.log('✅ Successfully deleted from storage');
      }
      
      // FIXED: Update local state immediately
      setVehicleMedia(prev => Array.isArray(prev) ? prev.filter(d => d.id !== doc.id) : []);
      
      // Call parent component's delete handler if provided
      if (onDeleteDocument) {
        console.log('📢 Notifying parent component of deletion');
        await onDeleteDocument(doc.id);
      }
      
      // Show success message
      console.log('✅ Document deletion completed successfully');
      alert(`Document "${doc.name}" has been deleted permanently.`);
      
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      alert(`Failed to delete document: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mr-2" />
          <span className="text-sm text-gray-600">Loading vehicle media...</span>
        </div>
      </div>
    );
  }

  if (allDocuments.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-amber-800 font-medium">No Media Found</p>
            <p className="text-amber-700">
              {loadFromStorage 
                ? `No documents or media have been uploaded for this vehicle yet.`
                : 'No documents uploaded yet for this new vehicle.'
              }
            </p>
          </div>
        </div>
        
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <File className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No media available</p>
          {loadFromStorage && vehicleId && (
            <button
              type="button"
              onClick={loadVehicleMedia}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Documents Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <File className="w-4 h-4" />
            Vehicle Media ({allDocuments.length})
            {vehicleId && <span className="text-xs text-gray-500">• Vehicle ID: {vehicleId}</span>}
          </h4>
          {loadFromStorage && vehicleId && (
            <button
              type="button"
              onClick={loadVehicleMedia}
              className="text-xs text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allDocuments.map((doc) => (
            <div key={doc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              {/* Document Preview */}
              <div className="aspect-video bg-gray-50 flex items-center justify-center relative">
                {isImage(doc) ? (
                  <img
                    src={doc.url}
                    alt={doc.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4">
                    <File className="w-12 h-12 text-gray-400 mb-2" />
                    <span className="text-xs text-gray-500 text-center">{doc.category}</span>
                  </div>
                )}
                
                {/* Category Badge */}
                {doc.category && (
                  <div className="absolute top-2 left-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getCategoryColor(doc.category)}`}>
                      {doc.category}
                    </span>
                  </div>
                )}

                {/* Vehicle ID Badge (for debugging) */}
                {doc.vehicleId && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-gray-800 text-white">
                      V{doc.vehicleId}
                    </span>
                  </div>
                )}

                {/* Deletion Loading Overlay */}
                {deletingDocumentId === doc.id && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-3 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-red-600 animate-spin" />
                      <span className="text-sm text-gray-700">Deleting...</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Document Info */}
              <div className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="text-sm font-medium text-gray-900 truncate flex-1">{doc.name}</h5>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span>{formatFileSize(doc.size)}</span>
                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleView(doc)}
                      className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                      title="View Document"
                      disabled={deletingDocumentId === doc.id}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                      title="Download Document"
                      disabled={deletingDocumentId === doc.id}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingDocumentId === doc.id}
                      className={`p-1 transition-colors ${
                        deletingDocumentId === doc.id
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-gray-500 hover:text-red-600'
                      }`}
                      title={deletingDocumentId === doc.id ? 'Deleting...' : 'Delete Document'}
                    >
                      {deletingDocumentId === doc.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VehicleDocuments;
