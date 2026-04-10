import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Image as ImageIcon, Eye, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import i18n from '../i18n';

const VehicleImageUpload = ({ 
  vehicleId, 
  currentImageUrl = '', 
  onImageChange, 
  disabled = false, 
  className = "" 
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Storage configuration
  const BUCKET_NAME = 'vehicle-images';

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
    if (!vehicleId) {
      setError(tr('Vehicle ID is required for image upload', "L'identifiant du vehicule est requis pour televerser une image"));
      return;
    }

    // Validate image files only
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError(tr('Please select only image files (JPG, PNG)', 'Veuillez selectionner uniquement des images (JPG, PNG)'));
      return;
    }

    const file = imageFiles[0]; // Only one image per vehicle

    // File validation
    if (file.size > 10 * 1024 * 1024) {
      setError(tr('Image file size must be less than 10MB', "La taille de l'image doit etre inferieure a 10 Mo"));
      return;
    }

    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setError(tr('Only JPG and PNG image files are supported', 'Seuls les fichiers JPG et PNG sont pris en charge'));
      return;
    }

    setUploading(true);
    setError(null);
    
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create vehicle-scoped storage path
      const fileExtension = file.name.split('.').pop();
      const storagePath = `${vehicleId}/${fileId}.${fileExtension}`;
      
      // Update progress
      setUploadProgress({
        [fileId]: { progress: 0, status: 'uploading' }
      });

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Persist a stable public URL so the image still renders after logout/reload.
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);
      const finalUrl = normalizeVehicleImageUrl(urlData?.publicUrl || '');

      // Update progress
      setUploadProgress({
        [fileId]: { progress: 100, status: 'completed' }
      });

      // Notify parent component with new image URL
      onImageChange(finalUrl);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Clear progress after delay
      setTimeout(() => {
        setUploadProgress({});
      }, 3000);

    } catch (error) {
      setError(`${tr('Upload failed:', 'Échec du téléversement :')} ${error.message}`);
      setUploadProgress({
        [fileId]: { progress: 0, status: 'error', error: error.message }
      });
    } finally {
      setUploading(false);
    }
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

  const handleRemoveImage = async () => {
    if (!currentImageUrl || disabled) return;
    onImageChange('');
  };

  // Helper function to extract filename from URL
  const getImageFileName = (url) => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      return pathParts[pathParts.length - 1] || 'vehicle-image';
    } catch {
      return '/images/photo1768099277.jpg';
    }
  };

  // Test bucket access
  const testBucketAccess = async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list();
      
      if (error) {
        console.error('Bucket access error:', error);
        setError(`${tr('Bucket access error', "Erreur d'accès au compartiment")} : ${error.message}`);
      } else {
        console.log('Bucket accessible, contains:', data?.length || 0, 'files');
      }
    } catch (error) {
      console.error('Bucket test failed:', error);
    }
  };

  // Handle download image
  const handleDownloadImage = async () => {
    const resolvedUrl = normalizeVehicleImageUrl(currentImageUrl);
    if (!resolvedUrl) return;
    try {
      const response = await fetch(resolvedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getImageFileName(resolvedUrl);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      setError(tr('Failed to download image', "Impossible de télécharger l'image"));
    }
  };

  // Test bucket access on mount
  useEffect(() => {
    testBucketAccess();
  }, []);

  const progressEntries = Object.entries(uploadProgress);
  const displayImageUrl = normalizeVehicleImageUrl(currentImageUrl);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Current Image Display */}
      {displayImageUrl && (
        <div className="relative group w-full max-w-md mx-auto">
          <div className="relative rounded-lg border border-gray-300 overflow-hidden bg-gray-100">
            <div className="relative h-48 flex items-center justify-center">
              <img
                src={displayImageUrl}
                alt={tr('Vehicle', 'Véhicule')}
                className="max-w-full max-h-full object-contain"
                onLoad={() => console.log('Image loaded successfully from:', displayImageUrl)}
              />
            </div>
            
            {/* Image Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <div className="flex justify-between items-center">
                <span className="text-white text-sm truncate max-w-[60%]">
                  {getImageFileName(displayImageUrl)}
                </span>
                <div className="flex gap-2">
                  <a
                    href={displayImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    title={tr('Open in new tab', 'Ouvrir dans un nouvel onglet')}
                  >
                    <Eye className="w-4 h-4 text-white" />
                  </a>
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    title={tr('Download', 'Télécharger')}
                  >
                    <Download className="w-4 h-4 text-white" />
                  </button>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-2 bg-red-500/80 hover:bg-red-600 rounded-full transition-colors"
                      title={tr('Remove', 'Supprimer')}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Area */}
      {!disabled && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            uploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-300 hover:border-blue-400 cursor-pointer'
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          
          <div className="flex flex-col items-center gap-2">
            <Upload className={`w-8 h-8 ${uploading ? 'text-gray-400' : 'text-gray-500'}`} />
            <div>
              <p className={`text-sm font-medium ${uploading ? 'text-gray-400' : 'text-gray-700'}`}>
                {uploading ? tr('Uploading image...', "Téléversement de l'image...") : tr('Click to upload vehicle image', "Cliquez pour téléverser l'image du véhicule")}
              </p>
              <p className={`text-xs ${uploading ? 'text-gray-300' : 'text-gray-500'}`}>
                {tr('or drag and drop image here', "ou glissez-déposez l'image ici")}
              </p>
            </div>
            <p className={`text-xs ${uploading ? 'text-gray-300' : 'text-gray-400'}`}>
              JPG, PNG up to 10MB
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-red-800 font-medium">{tr('Upload Error', 'Erreur de televersement')}</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {progressEntries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">{tr('Upload Progress', 'Progression du televersement')}</h4>
          {progressEntries.map(([fileId, progress]) => (
            <div key={fileId} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">{tr('Vehicle Image', 'Image du vehicule')}</span>
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
                    {progress.status === 'completed' ? tr('Completed', 'Termine') :
                     progress.status === 'error' ? tr('Failed', 'Echec') :
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
      {!disabled && !currentImageUrl && !uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <ImageIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-blue-800 font-medium">{tr('Vehicle Image Upload Tips', "Conseils de televersement de l'image vehicule")}</p>
              <ul className="text-blue-700 mt-1 space-y-1 text-xs">
                <li>• {tr('Upload a clear photo of the vehicle', 'Televersez une photo nette du vehicule')}</li>
                <li>• {tr('Supported formats: JPG, PNG', 'Formats pris en charge : JPG, PNG')}</li>
                <li>• {tr('Maximum file size: 10MB', 'Taille maximale : 10 Mo')}</li>
                <li>• {tr('One image per vehicle (replaces existing image)', 'Une image par vehicule (remplace l image existante)')}</li>
                <li>• {tr('Images are stored in vehicle-specific folders', 'Les images sont stockees dans des dossiers propres a chaque vehicule')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Disabled State */}
      {disabled && !currentImageUrl && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">{tr('No vehicle image uploaded', 'Aucune image vehicule televersee')}</p>
        </div>
      )}
    </div>
  );
};

export default VehicleImageUpload;
