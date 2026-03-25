import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const ExportProgressModal = ({ job, onClose }) => {
  if (!job) return null;

  const progress = job.progress || {};
  const {
    currentStep = 'Initializing...',
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
      pending: { variant: 'secondary', label: 'Pending' },
      processing: { variant: 'default', label: 'Processing' },
      completed: { variant: 'success', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' }
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
            <span>Project Export Progress</span>
            {getStatusBadge()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Icon and Message */}
          <div className="flex items-center justify-center space-x-3">
            {getStatusIcon()}
            <span className="text-lg font-medium">
              {job.status === 'completed' ? 'Export Complete!' :
               job.status === 'failed' ? 'Export Failed' :
               'Generating Export...'}
            </span>
          </div>

          {/* Progress Bar */}
          {job.status === 'processing' && (
            <div className="space-y-3">
              <Progress value={overallProgress} className="w-full" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{overallProgress}% complete</span>
                {estimatedTimeRemaining > 0 && (
                  <span>~{formatTime(estimatedTimeRemaining)} remaining</span>
                )}
              </div>
            </div>
          )}

          {/* Current Step */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Current Step:</span>
              <span className="text-sm text-muted-foreground">
                Step {Math.ceil(currentStepProgress)} of {totalSteps}
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
                <span>Files Processed:</span>
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
              <p className="text-sm font-medium text-red-800 mb-1">Error Details:</p>
              <p className="text-sm text-red-700">{job.error_message}</p>
            </div>
          )}

          {/* Success Message */}
          {job.status === 'completed' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm font-medium text-green-800 mb-1">Export Ready!</p>
              <p className="text-sm text-green-700">
                Your project archive has been generated successfully. You can now download it from the export history.
              </p>
              {job.file_size && (
                <p className="text-xs text-green-600 mt-1">
                  Archive size: {Math.round(job.file_size / 1024)} KB
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {job.status === 'processing' && (
              <Button variant="outline" disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </Button>
            )}
            
            {canClose && (
              <Button onClick={onClose}>
                {job.status === 'completed' ? 'Continue' : 'Close'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportProgressModal;