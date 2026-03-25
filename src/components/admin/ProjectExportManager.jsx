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

const ProjectExportManager = () => {
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
    if (window.confirm('Are you sure you want to delete this export? This action cannot be undone.')) {
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
      pending: { variant: 'secondary', label: 'Pending' },
      processing: { variant: 'default', label: 'Processing' },
      completed: { variant: 'success', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' },
      expired: { variant: 'outline', label: 'Expired' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Export</h2>
          <p className="text-muted-foreground">
            Generate and download complete project archives for local development
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading || isGenerating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
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
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Generate Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Generate New Export
          </CardTitle>
          <CardDescription>
            Create a compressed archive containing the complete project structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Full Project Archive</h4>
                <p className="text-sm text-muted-foreground">
                  Includes all source files, configurations, and documentation
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Format: .tar.gz • Excludes: node_modules, .git, dist, logs
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
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Generate Export
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
                      <span className="font-medium">Current Export</span>
                      {getStatusBadge(currentJob.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created: {formatDate(currentJob.created_at)}
                    </p>
                    {currentJob.file_size && (
                      <p className="text-sm text-muted-foreground">
                        Size: {formatFileSize(currentJob.file_size)}
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
                        Download
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