import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Eye, File, RefreshCw, Trash2, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VerificationService from '../services/VerificationService';
import i18n from '../i18n';

const DELETE_TIMEOUT_MS = 15000;
const LOAD_TIMEOUT_MS = 12000;

const VehicleDocuments = ({ 
  documents = [], 
  onDocumentsChange,
  onDeleteDocument, 
  canDelete = true, 
  className = '', 
  vehicleId, 
  loadFromStorage = true,
  documentStatusMap = {},
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(false);
  const [vehicleMedia, setVehicleMedia] = useState([]);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [lastSyncedSignature, setLastSyncedSignature] = useState('');
  const [viewerIndex, setViewerIndex] = useState(null);
  
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
      const listResult = await Promise.race([
        supabase.storage
          .from(BUCKET_NAME)
          .list(vehicleId.toString(), {
            limit: 100,
            offset: 0
          }),
        new Promise((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('Loading vehicle media timed out.'));
          }, LOAD_TIMEOUT_MS);
        }),
      ]);

      const { data: files, error } = listResult || {};

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
          const categoryMeta = getCategoryFromStoredName(file.name, fileType);

          return {
            id: file.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: originalName,
            type: fileType,
            size: file.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath: fullPath,
            uploadedAt: file.created_at || new Date().toISOString(),
            category: categoryMeta.category,
            categoryKey: categoryMeta.categoryKey,
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
    const withoutCategory = String(storedName || '').replace(/^[a-z-]+__/, '');
    // Handle the pattern: timestamp_randomstring.extension
    if (/^\d{13}_/.test(withoutCategory)) {
      const parts = withoutCategory.split('_');
      if (parts.length >= 2) {
        // Remove timestamp (first part) and keep the rest
        return parts.slice(1).join('_');
      }
    }
    
    if (/^\d+_[a-z0-9]+_/i.test(withoutCategory)) {
      return withoutCategory.split('_').slice(2).join('_');
    }

    return withoutCategory;
  };

  const getCategoryFromStoredName = (storedName, mimeType) => {
    const categoryKey = String(storedName || '').split('__')[0];
    const categoryMap = {
      'legal': tr('Legal file', 'Document légal'),
      'purchase-invoice': tr('Purchase invoice', "Facture d'achat"),
      'registration': tr('Registration', 'Immatriculation'),
      'annual-tax': tr('Annual vehicle tax receipt', 'Reçu de taxe annuelle véhicule'),
      'insurance': tr('Insurance', 'Assurance'),
      'maintenance': tr('Maintenance', 'Maintenance'),
      'other': tr('Other', 'Autre'),
    };

    if (categoryMap[categoryKey]) {
      return {
        category: categoryMap[categoryKey],
        categoryKey,
      };
    }

    return {
      category: getCategoryFromType(mimeType),
      categoryKey: null,
    };
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
  const allDocuments = useMemo(() => {
    const mergedDocuments = loadFromStorage ? [...safeDocuments, ...safeVehicleMedia] : safeDocuments;
    const seenKeys = new Set();

    return mergedDocuments.filter((doc) => {
      const source = String(doc?.source || '').trim().toLowerCase();
      const verificationCategoryKey = String(doc?.categoryKey || '').trim().toLowerCase();
      const verificationKey =
        source === 'verification'
          ? `verification:${verificationCategoryKey || 'unknown'}`
          : null;
      const fallbackKey = doc?.storagePath || doc?.url || doc?.id;
      const docKey = verificationKey || fallbackKey;

      if (!docKey || seenKeys.has(docKey)) {
        return false;
      }

      seenKeys.add(docKey);
      return true;
    });
  }, [loadFromStorage, safeDocuments, safeVehicleMedia]);
  
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

  const isPdf = (doc) => {
    return doc.type === 'application/pdf' || doc.name?.toLowerCase?.().endsWith('.pdf');
  };

  const renderDocumentPreview = (doc, tone = 'default') => {
    const baseClassName =
      tone === 'emerald'
        ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
        : 'border-slate-200 bg-slate-50 text-slate-500';

    if (isImage(doc)) {
      return (
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border ${baseClassName}`}>
          <img src={doc.url} alt={doc.name} className="h-full w-full object-cover" loading="lazy" />
        </span>
      );
    }

    return (
      <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[1rem] border ${baseClassName}`}>
        <File className="h-4 w-4" />
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em]">
          {isPdf(doc) ? 'PDF' : tr('File', 'Fichier')}
        </span>
      </span>
    );
  };

  const handleView = (doc) => {
    const index = allDocuments.findIndex((document) => (document?.storagePath || document?.url || document?.id) === (doc?.storagePath || doc?.url || doc?.id));
    setViewerIndex(index >= 0 ? index : 0);
  };

  const selectedDocument = viewerIndex === null ? null : allDocuments[viewerIndex];

  const showPreviousDocument = () => {
    if (viewerIndex === null || allDocuments.length <= 1) return;
    setViewerIndex((current) => (current === 0 ? allDocuments.length - 1 : current - 1));
  };

  const showNextDocument = () => {
    if (viewerIndex === null || allDocuments.length <= 1) return;
    setViewerIndex((current) => (current >= allDocuments.length - 1 ? 0 : current + 1));
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
      if (String(doc?.source || '').trim().toLowerCase() === 'verification' && doc?.id) {
        const verificationIds = Array.isArray(doc?.verificationRequestIds) && doc.verificationRequestIds.length
          ? doc.verificationRequestIds
          : [doc.id];

        console.log('🔄 Deleting verification-backed document set:', verificationIds);

        for (const verificationId of verificationIds) {
          await Promise.race([
            VerificationService.deleteVerificationRequest({ id: verificationId }),
            new Promise((_, reject) => {
              window.setTimeout(() => {
                reject(new Error('Delete timed out. Please refresh and try again.'));
              }, DELETE_TIMEOUT_MS);
            }),
          ]);
        }

        console.log('✅ Successfully deleted verification request set');
      } else if (doc.storagePath) {
        // FIXED: Delete from storage using existing bucket
        console.log('🔄 Deleting from storage:', doc.storagePath);
        const deleteResult = await Promise.race([
          supabase.storage
            .from(BUCKET_NAME)
            .remove([doc.storagePath]),
          new Promise((_, reject) => {
            window.setTimeout(() => {
              reject(new Error('Delete timed out. Please refresh and try again.'));
            }, DELETE_TIMEOUT_MS);
          }),
        ]);

        const { error: storageError } = deleteResult || {};

        if (storageError) {
          console.error('❌ Storage deletion error:', storageError);
          throw new Error(`Failed to delete from storage: ${storageError.message}`);
        }
        
        console.log('✅ Successfully deleted from storage');
      }
      
      // FIXED: Update local state immediately
      setVehicleMedia(prev => Array.isArray(prev) ? prev.filter(d => d.id !== doc.id) : []);

      if (onDocumentsChange) {
        const remainingDocuments = allDocuments.filter((item) => {
          const itemKey =
            String(item?.source || '').trim().toLowerCase() === 'verification'
              ? `verification:${String(item?.categoryKey || '').trim().toLowerCase()}`
              : item?.storagePath || item?.url || item?.id;
          const deletedKey =
            String(doc?.source || '').trim().toLowerCase() === 'verification'
              ? `verification:${String(doc?.categoryKey || '').trim().toLowerCase()}`
              : doc?.storagePath || doc?.url || doc?.id;
          return itemKey !== deletedKey;
        });
        onDocumentsChange(remainingDocuments);
      }
      
      // Call parent component's delete handler if provided
      if (onDeleteDocument) {
        console.log('📢 Notifying parent component of deletion');
        Promise.resolve(onDeleteDocument(doc.id)).catch((callbackError) => {
          console.warn('⚠️ Parent document deletion callback failed:', callbackError);
        });
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

  const imageDocuments = allDocuments.filter((doc) => isImage(doc));
  const taxReceiptDocuments = allDocuments.filter((doc) => String(doc?.categoryKey || doc?.category || '').toLowerCase().includes('annual-tax'));
  const legalDocuments = allDocuments.filter((doc) => !isImage(doc) && !taxReceiptDocuments.includes(doc));

  const renderDocumentActions = (doc) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleView(doc)}
        className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
        title={tr('View Document', 'Voir le document')}
        disabled={deletingDocumentId === doc.id}
      >
        <Eye className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDownload(doc)}
        className="p-1 text-gray-500 hover:text-green-600 transition-colors"
        title={tr('Download Document', 'Télécharger le document')}
        disabled={deletingDocumentId === doc.id}
      >
        <Download className="w-4 h-4" />
      </button>
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
          title={deletingDocumentId === doc.id ? tr('Deleting...', 'Suppression...') : tr('Delete Document', 'Supprimer le document')}
        >
          {deletingDocumentId === doc.id ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );

  const getDocumentStatusMeta = (doc) => {
    const categoryKey = String(doc?.categoryKey || '').trim().toLowerCase();
    if (!categoryKey) return null;
    return documentStatusMap?.[categoryKey] || null;
  };

  if (loading && allDocuments.length === 0) {
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
            <p className="text-amber-800 font-medium">{tr('No Media Found', 'Aucun média trouvé')}</p>
            <p className="text-amber-700">
              {loadFromStorage 
                ? tr('No documents or media have been uploaded for this vehicle yet.', "Aucun document ou média n'a encore été téléversé pour ce véhicule.")
                : tr('No documents uploaded yet for this new vehicle.', "Aucun document n'a encore été téléversé pour ce nouveau véhicule.")
              }
            </p>
          </div>
        </div>
        
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <File className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">{tr('No media available', 'Aucun média disponible')}</p>
          {loadFromStorage && vehicleId && (
            <button
              type="button"
              onClick={loadVehicleMedia}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
            >
              {tr('Refresh', 'Actualiser')}
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
            {tr('Vehicle Media', 'Médias du véhicule')} ({allDocuments.length})
            {vehicleId && <span className="text-xs text-gray-500">• {tr('Vehicle ID', 'ID véhicule')}: {vehicleId}</span>}
          </h4>
          {loadFromStorage && vehicleId && (
            <button
              type="button"
              onClick={loadVehicleMedia}
              className="text-xs text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {tr('Refresh', 'Actualiser')}
            </button>
          )}
        </div>
        
        {imageDocuments.length > 0 ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Images', 'Images')}</p>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {imageDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="relative h-28 w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleView(doc)}
                    className="h-full w-full text-left"
                  >
                    <img src={doc.url} alt={doc.name} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute bottom-2 left-2 max-w-[8rem] truncate rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
                      {doc.name}
                    </span>
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingDocumentId === doc.id}
                      className={`absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/92 shadow-sm transition ${
                        deletingDocumentId === doc.id
                          ? 'cursor-not-allowed text-slate-400'
                          : 'text-slate-600 hover:text-rose-600'
                      }`}
                      title={deletingDocumentId === doc.id ? tr('Deleting...', 'Suppression...') : tr('Delete Document', 'Supprimer le document')}
                    >
                      {deletingDocumentId === doc.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {legalDocuments.length > 0 ? (
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Legal documents', 'Documents légaux')}</p>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {legalDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button type="button" onClick={() => handleView(doc)} className="flex min-w-0 items-center gap-3 text-left">
                    {renderDocumentPreview(doc)}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{doc.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="truncate">{doc.category} • {formatFileSize(doc.size)}</span>
                        {getDocumentStatusMeta(doc) ? (
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getDocumentStatusMeta(doc).tone}`}>
                            {getDocumentStatusMeta(doc).label}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  {renderDocumentActions(doc)}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {taxReceiptDocuments.length > 0 ? (
          <details className="overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/50" open>
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-emerald-800">
              {tr('Tax receipts', 'Reçus de taxe')} ({taxReceiptDocuments.length})
            </summary>
            <div className="divide-y divide-emerald-100 bg-white">
              {taxReceiptDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button type="button" onClick={() => handleView(doc)} className="flex min-w-0 items-center gap-3 text-left">
                    {renderDocumentPreview(doc, 'emerald')}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{doc.name}</span>
                      <span className="block truncate text-xs text-slate-500">{formatFileSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                    </span>
                  </button>
                  {renderDocumentActions(doc)}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {selectedDocument ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setViewerIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{selectedDocument.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedDocument.category || tr('Document', 'Document')} • {viewerIndex + 1} / {allDocuments.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocument.url ? (
                  <a
                    href={selectedDocument.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {tr('Open', 'Ouvrir')}
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setViewerIndex(null)}
                  className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  aria-label={tr('Close viewer', 'Fermer la visionneuse')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-[55vh] flex-1 items-center justify-center bg-slate-100">
              {allDocuments.length > 1 ? (
                <button
                  type="button"
                  onClick={showPreviousDocument}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg hover:bg-white"
                  aria-label={tr('Previous document', 'Document précédent')}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}

              <div className="flex h-full max-h-[72vh] w-full snap-x snap-mandatory overflow-x-auto">
                <div className="flex w-full shrink-0 snap-center items-center justify-center p-3 sm:p-6">
                  {isImage(selectedDocument) ? (
                    <img
                      src={selectedDocument.url}
                      alt={selectedDocument.name}
                      className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-lg"
                    />
                  ) : isPdf(selectedDocument) ? (
                    <iframe
                      src={selectedDocument.url}
                      title={selectedDocument.name}
                      className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-white shadow-lg"
                    />
                  ) : (
                    <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
                      <File className="mx-auto mb-3 h-12 w-12 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-900">{selectedDocument.name}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {tr('This file type cannot be previewed here. You can still open or download it.', 'Ce type de fichier ne peut pas être prévisualisé ici. Vous pouvez toujours l’ouvrir ou le télécharger.')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {allDocuments.length > 1 ? (
                <button
                  type="button"
                  onClick={showNextDocument}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg hover:bg-white"
                  aria-label={tr('Next document', 'Document suivant')}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
              <span>{tr('Swipe or use arrows to browse documents.', 'Balayez ou utilisez les flèches pour parcourir les documents.')}</span>
              <button
                type="button"
                onClick={() => handleDownload(selectedDocument)}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                {tr('Download', 'Télécharger')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VehicleDocuments;
