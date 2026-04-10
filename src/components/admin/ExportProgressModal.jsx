import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import i18n from '../../i18n';

const ExportProgressModal = ({ job, onClose }) => {
  if (!job) return null;
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  const progress = job.progress || {};
  const {
    currentStep = tr('Initializing...', 'Initialisation...'),
    totalSteps = 4,
    currentStepProgress = 0,
    filesProcessed = 0,
    totalFiles = 0,
    estimatedTimeRemaining = 0
  } = progress;

  const overallProgress = Math.round((currentStepProgress / totalSteps) * 100);

  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    const statusConfig = {
      pending: { variant: 'secondary', label: tr('Pending', 'En attente') },
      processing: { variant: 'default', label: tr('Processing', 'En cours') },
      completed: { variant: 'success', label: tr('Completed', 'Terminé') },
      failed: { variant: 'destructive', label: tr('Failed', 'Échoué') }
    };

    const config = statusConfig[job.status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const canClose = job.status === 'completed' || job.status === 'failed';

  return (
    <Dialog open={true} onOpenChange={canClose ? onClose : undefined}>
      <DialogContent className="sm:max-w-md" hideCloseButton={!canClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{tr('Project Export Progress', "Progression de l'export projet")}</span>
            {getStatusBadge()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Icon and Message */}
          <div className="flex items-center justify-center space-x-3">
            {getStatusIcon()}
            <span className="text-lg font-medium">
              {job.status === 'completed' ? tr('Export Complete!', 'Export terminé !') :
               job.status === 'failed' ? tr('Export Failed', "Échec de l'export") :
               tr('Generating Export...', "Génération de l'export...")}
            </span>
          </div>

          {/* Progress Bar */}
          {job.status === 'processing' && (
            <div className="space-y-3">
              <Progress value={overallProgress} className="w-full" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{isFrench ? `${overallProgress}% terminé` : `${overallProgress}% complete`}</span>
                {estimatedTimeRemaining > 0 && (
                  <span>{isFrench ? `~${formatTime(estimatedTimeRemaining)} restantes` : `~${formatTime(estimatedTimeRemaining)} remaining`}</span>
                )}
              </div>
            </div>
          )}

          {/* Current Step */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{tr('Current Step:', 'Étape actuelle :')}</span>
              <span className="text-sm text-muted-foreground">
                {isFrench ? `Étape ${Math.ceil(currentStepProgress)} sur ${totalSteps}` : `Step ${Math.ceil(currentStepProgress)} of ${totalSteps}`}
              </span>
            </div>
            <p className="text-sm bg-muted p-3 rounded">
              {currentStep}
            </p>
          </div>

          {/* File Progress */}
          {totalFiles > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{tr('Files Processed:', 'Fichiers traités :')}</span>
                <span className="font-mono">
                  {filesProcessed.toLocaleString()} / {totalFiles.toLocaleString()}
                </span>
              </div>
              <Progress 
                value={(filesProcessed / totalFiles) * 100} 
                className="w-full h-2" 
              />
            </div>
          )}

          {/* Error Message */}
          {job.status === 'failed' && job.error_message && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm font-medium text-red-800 mb-1">{tr('Error Details:', "Détails de l'erreur :")}</p>
              <p className="text-sm text-red-700">{job.error_message}</p>
            </div>
          )}

          {/* Success Message */}
          {job.status === 'completed' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm font-medium text-green-800 mb-1">{tr('Export Ready!', 'Export prêt !')}</p>
              <p className="text-sm text-green-700">
                {tr('Your project archive has been generated successfully. You can now download it from the export history.', "L'archive du projet a été générée avec succès. Vous pouvez maintenant la télécharger depuis l'historique des exports.")}
              </p>
              {job.file_size && (
                <p className="text-xs text-green-600 mt-1">
                  {tr('Archive size:', "Taille de l'archive :")} {Math.round(job.file_size / 1024)} KB
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {job.status === 'processing' && (
              <Button variant="outline" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {tr('Processing...', 'Traitement...')}
              </Button>
            )}
            
            {canClose && (
              <Button onClick={onClose}>
                {job.status === 'completed' ? tr('Continue', 'Continuer') : tr('Close', 'Fermer')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportProgressModal;
