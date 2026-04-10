import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { 
  generateProjectExport, 
  listExports, 
  checkExportStatus,
  getDownloadUrl,
  deleteExport,
  clearError,
  setShowProgressModal,
  resetCurrentJob
} from '../../store/slices/projectExportSlice';
import ExportProgressModal from './ExportProgressModal';
import ExportHistoryList from './ExportHistoryList';
import { Download, FileArchive, Trash2, RefreshCw } from 'lucide-react';
import i18n from '../../i18n';

const ProjectExportManager = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const dispatch = useDispatch();
  const { 
    currentJob, 
    exportHistory, 
    isGenerating, 
    isLoading, 
    error, 
    showProgressModal 
  } = useSelector(state => state.projectExport);

  const [statusInterval, setStatusInterval] = useState(null);

  useEffect(() => {
    // Load export history on mount
    dispatch(listExports());
    
    return () => {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    };
  }, [dispatch]);

  useEffect(() => {
    // Start status polling when generating
    if (isGenerating && currentJob && currentJob.id) {
      const interval = setInterval(() => {
        dispatch(checkExportStatus(currentJob.id));
      }, 2000); // Poll every 2 seconds

      setStatusInterval(interval);

      return () => {
        clearInterval(interval);
        setStatusInterval(null);
      };
    } else if (statusInterval) {
      clearInterval(statusInterval);
      setStatusInterval(null);
    }
  }, [isGenerating, currentJob, dispatch]);

  const handleGenerateExport = async () => {
    try {
      dispatch(clearError());
      await dispatch(generateProjectExport({
        format: 'tar.gz',
        includeNodeModules: false,
        compressionLevel: 6
      })).unwrap();
    } catch (error) {
      console.error('Export generation failed:', error);
    }
  };

  const handleDownload = async (jobId) => {
    try {
      const downloadUrl = await dispatch(getDownloadUrl(jobId)).unwrap();
      // Open download URL in new tab
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async (jobId) => {
    if (window.confirm(tr('Are you sure you want to delete this export? This action cannot be undone.', 'Voulez-vous vraiment supprimer cet export ? Cette action est irréversible.'))) {
      try {
        await dispatch(deleteExport(jobId)).unwrap();
        dispatch(listExports()); // Refresh list
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handleRefresh = () => {
    dispatch(listExports());
  };

  const handleCloseProgressModal = () => {
    dispatch(setShowProgressModal(false));
    dispatch(resetCurrentJob());
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { variant: 'secondary', label: tr('Pending', 'En attente') },
      processing: { variant: 'default', label: tr('Processing', 'En cours') },
      completed: { variant: 'success', label: tr('Completed', 'Terminé') },
      failed: { variant: 'destructive', label: tr('Failed', 'Échoué') },
      expired: { variant: 'outline', label: tr('Expired', 'Expiré') }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return tr('Unknown', 'Inconnu');
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return tr('Unknown', 'Inconnu');
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{tr('Project Export', 'Export projet')}</h2>
          <p className="text-muted-foreground">
            {tr('Generate and download complete project archives for local development', 'Générez et téléchargez des archives complètes du projet pour le développement local')}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading || isGenerating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {tr('Refresh', 'Actualiser')}
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="link"
              size="sm"
              onClick={() => dispatch(clearError())}
              className="ml-2 p-0 h-auto"
            >
              {tr('Dismiss', 'Fermer')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Generate Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            {tr('Generate New Export', 'Générer un nouvel export')}
          </CardTitle>
          <CardDescription>
            {tr('Create a compressed archive containing the complete project structure', 'Créer une archive compressée contenant toute la structure du projet')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">{tr('Full Project Archive', 'Archive complète du projet')}</h4>
                <p className="text-sm text-muted-foreground">
                  {tr('Includes all source files, configurations, and documentation', 'Inclut tous les fichiers source, configurations et la documentation')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tr('Format: .tar.gz • Excludes: node_modules, .git, dist, logs', 'Format : .tar.gz • Exclut : node_modules, .git, dist, logs')}
                </p>
              </div>
              <Button
                onClick={handleGenerateExport}
                disabled={isGenerating || isLoading}
                className="min-w-[140px]"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {tr('Generating...', 'Génération...')}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {tr('Generate Export', "Générer l'export")}
                  </>
                )}
              </Button>
            </div>

            {/* Current Job Status */}
            {currentJob && !showProgressModal && (
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{tr('Current Export', 'Export en cours')}</span>
                      {getStatusBadge(currentJob.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Créé : {formatDate(currentJob.created_at)}
                    </p>
                    {currentJob.file_size && (
                      <p className="text-sm text-muted-foreground">
                        Taille : {formatFileSize(currentJob.file_size)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {currentJob.status === 'completed' && (
                      <Button
                        onClick={() => handleDownload(currentJob.id)}
                        size="sm"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Télécharger
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDelete(currentJob.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Export History */}
      <ExportHistoryList
        exports={exportHistory}
        isLoading={isLoading}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onRefresh={handleRefresh}
      />

      {/* Progress Modal */}
      {showProgressModal && currentJob && (
        <ExportProgressModal
          job={currentJob}
          onClose={handleCloseProgressModal}
        />
      )}
    </div>
  );
};

export default ProjectExportManager;
