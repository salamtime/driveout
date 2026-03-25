import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Download, Trash2, Clock, FileArchive, RefreshCw } from 'lucide-react';

const ExportHistoryList = ({ 
  exports, 
  isLoading, 
  onDownload, 
  onDelete, 
  onRefresh 
}) => {
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

  const getTimeAgo = (dateString) => {
    if (!dateString) return 'Unknown';
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return formatDate(dateString);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Export History
          </CardTitle>
          <CardDescription>Manage your previous project exports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-muted-foreground">Loading export history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Export History
          <Badge variant="outline" className="ml-auto">
            {exports?.length || 0} total
          </Badge>
        </CardTitle>
        <CardDescription>
          Manage your previous project exports (kept for 30 days)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!exports || exports.length === 0 ? (
          <div className="text-center py-8">
            <FileArchive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              No exports yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Generate your first project export to see it here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {exports.map((exportJob) => (
              <div
                key={exportJob.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <FileArchive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">
                      project-export-{exportJob.id.slice(0, 8)}.{exportJob.format || 'tar.gz'}
                    </span>
                    {getStatusBadge(exportJob.status)}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Created: {getTimeAgo(exportJob.created_at)}</span>
                    {exportJob.file_size && (
                      <span>Size: {formatFileSize(exportJob.file_size)}</span>
                    )}
                    {exportJob.download_count > 0 && (
                      <span>Downloaded: {exportJob.download_count}x</span>
                    )}
                  </div>

                  {exportJob.status === 'processing' && exportJob.progress && (
                    <div className="mt-2">
                      <p className="text-xs text-blue-600">
                        {exportJob.progress.currentStep}
                      </p>
                    </div>
                  )}

                  {exportJob.status === 'failed' && exportJob.error_message && (
                    <div className="mt-2">
                      <p className="text-xs text-red-600 truncate">
                        Error: {exportJob.error_message}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {exportJob.status === 'completed' && (
                    <Button
                      onClick={() => onDownload(exportJob.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => onDelete(exportJob.id)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExportHistoryList;