/**
 * OCR Performance Dashboard Component
 * Real-time monitoring and optimization insights for OCR processing
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  Clock, 
  Database, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Zap,
  BarChart3,
  Settings
} from 'lucide-react';
import { useOCRPerformance } from '../../hooks/useOptimizedOCR';
import { OCRConfig } from '../../services/ocr/migrationGuide';

const OCRPerformanceDashboard = () => {
  const { stats, isLoading, refreshStats, getDetailedReport, clearPerformanceData } = useOCRPerformance();
  const [detailedReport, setDetailedReport] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refreshStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshStats]);

  const handleGetDetailedReport = () => {
    const report = getDetailedReport();
    setDetailedReport(report);
  };

  const handleClearCache = () => {
    OCRConfig.clearCache();
    refreshStats();
  };

  const getPerformanceRating = () => {
    if (!stats) return 0;
    
    let rating = 100;
    const avgTime = parseFloat(stats.averageProcessingTime);
    const errorRate = parseFloat(stats.errorRate);
    const cacheHitRate = parseFloat(stats.cacheHitRate);
    
    if (avgTime > 5000) rating -= 30;
    else if (avgTime > 3000) rating -= 15;
    
    if (errorRate > 10) rating -= 25;
    else if (errorRate > 5) rating -= 10;
    
    if (cacheHitRate < 30) rating -= 15;
    
    return Math.max(0, rating);
  };

  const getRatingColor = (rating) => {
    if (rating >= 80) return 'text-green-600';
    if (rating >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRatingBadge = (rating) => {
    if (rating >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (rating >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Good</Badge>;
    return <Badge className="bg-red-100 text-red-800">Needs Optimization</Badge>;
  };

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading performance data...</span>
      </div>
    );
  }

  const performanceRating = getPerformanceRating();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">OCR Performance Dashboard</h2>
          <p className="text-gray-600">Real-time monitoring and optimization insights</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'text-green-600' : 'text-gray-400'}`} />
            Auto Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={refreshStats} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Performance Rating</p>
                <p className={`text-2xl font-bold ${getRatingColor(performanceRating)}`}>
                  {performanceRating}%
                </p>
              </div>
              <div className="text-right">
                {getRatingBadge(performanceRating)}
                <div className="mt-1">
                  <TrendingUp className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Processing Time</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats?.averageProcessingTime || '0ms'}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Cache Hit Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats?.cacheHitRate || '0%'}
                </p>
              </div>
              <Database className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Processed</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats?.totalProcessed || 0}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Uptime</span>
                  <span className="font-medium">{stats?.uptime || '0s'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Error Rate</span>
                  <span className={`font-medium ${parseFloat(stats?.errorRate || '0') > 5 ? 'text-red-600' : 'text-green-600'}`}>
                    {stats?.errorRate || '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Calls/Session</span>
                  <span className="font-medium">{stats?.apiCallsPerSession || '0'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Compression Savings</span>
                  <span className="font-medium text-green-600">{stats?.totalCompressionSavings || '0%'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Recent Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.recentSessions?.map((session, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm font-mono">{session.id}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-600">{session.duration}</span>
                        {session.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-gray-500">No recent sessions</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Processing Speed</span>
                  <span>{performanceRating >= 80 ? 'Excellent' : performanceRating >= 60 ? 'Good' : 'Slow'}</span>
                </div>
                <Progress value={Math.min(100, (5000 - parseFloat(stats?.averageProcessingTime || '0')) / 50)} />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Cache Efficiency</span>
                  <span>{stats?.cacheHitRate || '0%'}</span>
                </div>
                <Progress value={parseFloat(stats?.cacheHitRate || '0')} />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Reliability</span>
                  <span>{(100 - parseFloat(stats?.errorRate || '0')).toFixed(1)}%</span>
                </div>
                <Progress value={100 - parseFloat(stats?.errorRate || '0')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button onClick={handleGetDetailedReport} variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Generate Detailed Report
                </Button>
                
                {detailedReport && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <pre className="text-sm overflow-auto">
                      {JSON.stringify(detailedReport, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Optimization Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={handleClearCache} variant="outline" className="w-full">
                  <Database className="h-4 w-4 mr-2" />
                  Clear Cache
                </Button>
                
                <Button onClick={() => OCRConfig.enableOptimizations()} variant="outline" className="w-full">
                  <Zap className="h-4 w-4 mr-2" />
                  Enable Optimizations
                </Button>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Recommendations</h4>
                <div className="space-y-1">
                  {performanceRating < 60 && (
                    <div className="flex items-center p-2 bg-yellow-50 rounded">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                      <span className="text-sm">Consider enabling image compression for better performance</span>
                    </div>
                  )}
                  {parseFloat(stats?.cacheHitRate || '0') < 30 && (
                    <div className="flex items-center p-2 bg-blue-50 rounded">
                      <Database className="h-4 w-4 text-blue-600 mr-2" />
                      <span className="text-sm">Low cache hit rate - consider processing similar documents</span>
                    </div>
                  )}
                  {parseFloat(stats?.errorRate || '0') > 5 && (
                    <div className="flex items-center p-2 bg-red-50 rounded">
                      <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                      <span className="text-sm">High error rate detected - check image quality validation</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                OCR Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Performance Tracking</h4>
                    <p className="text-sm text-gray-600">Monitor OCR performance metrics</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => OCRConfig.enablePerformanceTracking()}
                  >
                    Enable
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Clear Performance Data</h4>
                    <p className="text-sm text-gray-600">Reset all performance statistics</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearPerformanceData}
                  >
                    Clear Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OCRPerformanceDashboard;