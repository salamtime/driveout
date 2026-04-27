import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import i18n from '../../i18n';

/**
 * Delete Media Confirmation Dialog
 * Shows confirmation dialog before deleting media files
 */
const DeleteMediaDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  mediaData, 
  isDeleting = false 
}) => {
  if (!isOpen) return null;
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString(isFrench ? 'fr-FR' : 'en-US', {
      timeZone: 'Africa/Casablanca',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileTypeLabel = (fileType) => {
    if (fileType?.startsWith('image/')) return tr('Image', 'Image');
    if (fileType?.startsWith('video/')) return tr('Video', 'Vidéo');
    return tr('File', 'Fichier');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">
              {tr('Delete Media File', 'Supprimer le fichier média')}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-4">
              {tr('Are you sure you want to delete this media file? This action cannot be undone.', 'Voulez-vous vraiment supprimer ce fichier média ? Cette action est irréversible.')}
            </p>

            {/* Media Info */}
            {mediaData && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{tr('File:', 'Fichier :')}</span>
                  <span className="text-sm text-gray-900">
                    {mediaData.original_filename || tr('Unknown', 'Inconnu')}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{tr('Type:', 'Type :')}</span>
                  <span className="text-sm text-gray-900">
                    {getFileTypeLabel(mediaData.file_type)}
                  </span>
                </div>

                {mediaData.file_size && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{tr('Size:', 'Taille :')}</span>
                    <span className="text-sm text-gray-900">
                      {formatFileSize(mediaData.file_size)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{tr('Phase:', 'Phase :')}</span>
                  <span className="text-sm text-gray-900 capitalize">
                    {mediaData.phaseLabel || (mediaData.phase === 'out' ? tr('Opening', 'Ouverture') : tr('Closing', 'Clôture'))}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{tr('Uploaded:', 'Téléversé :')}</span>
                  <span className="text-sm text-gray-900">
                    {formatTimestamp(mediaData.uploaded_at)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800">
                  {tr('Warning', 'Avertissement')}
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  {tr('This will permanently delete the media file from both the database and storage. The action will be logged in the audit trail.', "Cela supprimera définitivement le fichier média de la base de données et du stockage. L'action sera enregistrée dans la piste d'audit.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tr('Cancel', 'Annuler')}
          </button>
          
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {tr('Deleting...', 'Suppression...')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {tr('Delete', 'Supprimer')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteMediaDialog;
