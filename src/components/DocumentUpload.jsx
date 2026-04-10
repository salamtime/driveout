import React, { useState, useRef } from 'react';
import { Upload, File, X, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

const DocumentUpload = ({ 
  vehicleId, 
  documents = [], 
  onDocumentsChange, 
  disabled = false, 
  className = "" 
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const [documentCategory, setDocumentCategory] = useState('legal');
  const fileInputRef = useRef(null);

  // FIXED: Use existing vehicle-documents bucket instead of vehicle-media
  const BUCKET_NAME = 'vehicle-documents';
  const DOCUMENT_CATEGORIES = [
    { value: 'legal', label: tr('Legal file', 'Document légal') },
    { value: 'purchase-invoice', label: tr('Purchase invoice', "Facture d'achat") },
    { value: 'registration', label: tr('Registration', 'Immatriculation') },
    { value: 'annual-tax', label: tr('Annual vehicle tax receipt', 'Reçu de taxe annuelle véhicule') },
    { value: 'insurance', label: tr('Insurance', 'Assurance') },
    { value: 'maintenance', label: tr('Maintenance', 'Maintenance') },
    { value: 'other', label: tr('Other', 'Autre') },
  ];

  console.log('🔍 DocumentUpload Debug:', {
    vehicleId,
    documentsLength: documents.length,
    disabled
  });

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
    if (!vehicleId) {
      setError(tr('Vehicle ID is required for document upload', "L'identifiant du véhicule est requis pour téléverser un document"));
      return;
    }

    setUploading(true);
    setError(null);
    
    const newDocuments = [];
    const totalFiles = files.length;

    try {
      console.log(`📤 Starting upload of ${totalFiles} files for vehicle ${vehicleId}`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
          // FIXED: Vehicle-scoped storage path using existing bucket
          const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `${vehicleId}/${documentCategory}__${fileId}_${safeFileName}`;
          
          console.log(`📁 Uploading file ${i + 1}/${totalFiles}: ${file.name}`);
          console.log(`📍 Storage path: ${storagePath}`);

          // Update progress
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: { progress: 0, status: 'uploading' }
          }));

          // FIXED: Upload to vehicle-scoped path in existing bucket
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error(`❌ Upload error for ${file.name}:`, uploadError);
            throw uploadError;
          }

          console.log(`✅ File uploaded successfully: ${storagePath}`);

          // Get public URL
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(storagePath);

          // Create document object for local state (no database record needed for now)
          const documentObj = {
            id: fileId,
            name: file.name,
            type: file.type,
            size: file.size,
            url: urlData.publicUrl,
            storagePath: storagePath,
            uploadedAt: new Date().toISOString(),
            uploadedBy: 'Current User',
            category: DOCUMENT_CATEGORIES.find((category) => category.value === documentCategory)?.label || getCategoryFromType(file.type),
            categoryKey: documentCategory,
            vehicleId: vehicleId
          };

          newDocuments.push(documentObj);

          // Update progress
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: { progress: 100, status: 'completed' }
          }));

        } catch (fileError) {
          console.error(`❌ Error uploading ${file.name}:`, fileError);
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: { progress: 0, status: 'error', error: fileError.message }
          }));
        }
      }

      // FIXED: Update parent component with new documents
      if (newDocuments.length > 0) {
        const updatedDocuments = [...documents, ...newDocuments];
        onDocumentsChange(updatedDocuments);
        console.log(`✅ Successfully uploaded ${newDocuments.length}/${totalFiles} files`);
      }

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('❌ Upload process error:', error);
      setError(`${tr('Upload failed:', 'Échec du téléversement :')} ${error.message}`);
    } finally {
      setUploading(false);
      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress({});
      }, 3000);
    }
  };

  const getCategoryFromType = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'Document';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet';
    return 'Other';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled || uploading) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const progressEntries = Object.entries(uploadProgress);

  return (
    <div className={`space-y-4 ${className}`}>
      {!disabled && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-medium text-gray-700">
            {tr('Document type', 'Type de document')}
          </label>
          <select
            value={documentCategory}
            onChange={(event) => setDocumentCategory(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          disabled || uploading
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-blue-400 cursor-pointer'
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />
        
        <div className="flex flex-col items-center gap-2">
          <Upload className={`w-8 h-8 ${disabled || uploading ? 'text-gray-400' : 'text-gray-500'}`} />
          <div>
            <p className={`text-sm font-medium ${disabled || uploading ? 'text-gray-400' : 'text-gray-700'}`}>
              {uploading ? 'Uploading documents...' : 'Click to upload documents'}
            </p>
            <p className={`text-xs ${disabled || uploading ? 'text-gray-300' : 'text-gray-500'}`}>
              or drag and drop files here
            </p>
          </div>
          <p className={`text-xs ${disabled || uploading ? 'text-gray-300' : 'text-gray-400'}`}>
            PDF, DOC, DOCX, TXT, JPG, PNG up to 10MB each
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-red-800 font-medium">Upload Error</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {progressEntries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Upload Progress</h4>
          {progressEntries.map(([fileId, progress]) => (
            <div key={fileId} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">File {fileId.split('_')[1]}</span>
                <div className="flex items-center gap-1">
                  {progress.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  {progress.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className={`text-xs font-medium ${
                    progress.status === 'completed' ? 'text-green-600' :
                    progress.status === 'error' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {progress.status === 'completed' ? 'Completed' :
                     progress.status === 'error' ? 'Failed' :
                     `${progress.progress}%`}
                  </span>
                </div>
              </div>
              
              {progress.status !== 'error' && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      progress.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
              )}
              
              {progress.error && (
                <p className="text-xs text-red-600 mt-1">{progress.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Instructions */}
      {!disabled && documents.length === 0 && !uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <File className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-blue-800 font-medium">Document Upload Tips</p>
              <ul className="text-blue-700 mt-1 space-y-1 text-xs">
                <li>• Upload registration, insurance, and maintenance documents</li>
                <li>• Supported formats: PDF, DOC, DOCX, TXT, JPG, PNG</li>
                <li>• Maximum file size: 10MB per file</li>
                <li>• Multiple files can be uploaded at once</li>
                <li>• Files are stored in vehicle-specific folders for organization</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
