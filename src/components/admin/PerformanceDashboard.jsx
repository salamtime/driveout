import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  Activity, 
  Database, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown,
  Download,
  RefreshCw
} from 'lucide-react';
import performanceMonitor from '../../utils/PerformanceMonitor';
import databaseHealthMonitor from '../../utils/DatabaseHealthMonitor';
import cacheService from '../../services/CacheService';

const PerformanceDashboard = () => {
  const [performanceStats, setPerformanceStats] = useState(null);
  const [healthReport, setHealthReport] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Get performance statistics
      const perfStats = performanceMonitor.getStats();
      setPerformanceStats(perfStats);
      
      // Get database health report
      const healthRep = await databaseHealthMonitor.generateHealthReport();
      setHealthReport(healthRep);
      
      // Get cache statistics
      const cacheRep = cacheService.getHealthReport();
      setCacheStats(cacheRep);
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportMetrics = (format = 'json') => {
    const report = performanceMonitor.generateReport();
    const dataStr = format === 'json' ? 
      JSON.stringify(report, null, 2) : 
      performanceMonitor.exportMetrics('csv');
    
    const blob = new Blob([dataStr], { 
      type: format === 'json' ? 'application/json' : 'text/csv' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getStatusBadge = (score) => {
    if (score >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 75) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>;
    if (score >= 40) return <Badge className="bg-orange-100 text-orange-800">Poor</Badge>;
    return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
  };

  const getTrendIcon = (trend) => {
    if (trend === 'improving' || trend === 'decreasing') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === 'degrading' || trend === 'increasing') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Activity className="h-4 w-4 text-gray-600" />;
  };

  if (isLoading && !performanceStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading performance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Performance Dashboard</h1>
          <p className="text-gray-600">
            Monitor application performance and database health
          </p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportMetrics('json')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportMetrics('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Performance Score */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Performance Score</p>
                <p className={`text-2xl font-bold ${getStatusColor(healthReport?.overall?.score || 0)}`}>
                  {healthReport?.overall?.score || 0}/100
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-2">
              {getStatusBadge(healthReport?.overall?.score || 0)}
            </div>
          </CardContent>
        </Card>

        {/* Query Performance */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Query Time</p>
                <p className="text-2xl font-bold">
                  {performanceStats?.queries?.averageDuration || 0}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-600" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                {performanceStats?.queries?.count || 0} total queries
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cache Hit Rate */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Cache Hit Rate</p>
                <p className="text-2xl font-bold">
                  {cacheStats?.hitRate || '0%'}
                </p>
              </div>
              <Database className="h-8 w-8 text-purple-600" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                {cacheStats?.cacheSize || 0} cached items
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error Rate */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Error Rate</p>
                <p className="text-2xl font-bold text-red-600">
                  {healthReport?.current?.errorRates?.errorRate || '0.00'}%
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500">
                {performanceStats?.errors?.count || 0} total errors
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="database">Database Health</TabsTrigger>
          <TabsTrigger value="cache">Cache Statistics</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Query Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Query Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Queries</p>
                    <p className="text-xl font-semibold">{performanceStats?.queries?.count || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Success Rate</p>
                    <p className="text-xl font-semibold">{performanceStats?.queries?.successRate || '0'}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Median Time</p>
                    <p className="text-xl font-semibold">{performanceStats?.queries?.medianDuration || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Slow Queries</p>
                    <p className="text-xl font-semibold">{performanceStats?.queries?.slowQueryCount || 0}</p>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Query Performance</span>
                    <span>{performanceStats?.queries?.successRate || 0}%</span>
                  </div>
                  <Progress value={parseFloat(performanceStats?.queries?.successRate || 0)} />
                </div>
              </CardContent>
            </Card>

            {/* API Calls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  API Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Calls</p>
                    <p className="text-xl font-semibold">{performanceStats?.apiCalls?.count || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Success Rate</p>
                    <p className="text-xl font-semibold">{performanceStats?.apiCalls?.successRate || '0'}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Avg Duration</p>
                    <p className="text-xl font-semibold">{performanceStats?.apiCalls?.averageDuration || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Slow Calls</p>
                    <p className="text-xl font-semibold">{performanceStats?.apiCalls?.slowCallCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Slow Queries */}
          {performanceStats?.queries?.count > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Slowest Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {performanceMonitor.getTopSlowQueries(5).map((query, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{query.service}.{query.method}</span>
                        {query.cached && <Badge variant="secondary" className="ml-2">Cached</Badge>}
                      </div>
                      <span className="text-red-600 font-semibold">{query.duration}ms</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Database Health Tab */}
        <TabsContent value="database" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Connection Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Connection Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {healthReport?.current?.connection?.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={healthReport?.current?.connection?.success ? 'text-green-600' : 'text-red-600'}>
                    {healthReport?.current?.connection?.success ? 'Connected' : 'Connection Failed'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Connection Time</p>
                    <p className="text-xl font-semibold">
                      {healthReport?.current?.connection?.duration?.toFixed(0) || 0}ms
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Health Status</p>
                    <p className="text-xl font-semibold">
                      {healthReport?.current?.connection?.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Query Performance Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Query Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Avg Query Time</p>
                    <p className="text-xl font-semibold">
                      {healthReport?.current?.queryPerformance?.averageDuration?.toFixed(0) || 0}ms
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Success Rate</p>
                    <p className="text-xl font-semibold">
                      {healthReport?.current?.queryPerformance?.successRate || '0'}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Slow Queries</p>
                    <p className="text-xl font-semibold">
                      {healthReport?.current?.queryPerformance?.slowQueryCount || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Health Trend</p>
                    <div className="flex items-center gap-1">
                      {getTrendIcon(healthReport?.trends?.performance?.slowQueryTrend)}
                      <span className="text-sm">
                        {healthReport?.trends?.performance?.slowQueryTrend || 'stable'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Health Issues */}
          {healthReport?.overall?.issues?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Health Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {healthReport.overall.issues.map((issue, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-red-50 rounded">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-red-800">{issue}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Cache Statistics Tab */}
        <TabsContent value="cache" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cache Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Cache Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Hit Rate</p>
                    <p className="text-xl font-semibold">{cacheStats?.hitRate || '0%'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Cache Size</p>
                    <p className="text-xl font-semibold">{cacheStats?.cacheSize || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Memory Usage</p>
                    <p className="text-xl font-semibold">{cacheStats?.memoryUsage || '0 KB'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Health Score</p>
                    <p className="text-xl font-semibold">{cacheStats?.healthScore || 0}/100</p>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Cache Efficiency</span>
                    <span>{cacheStats?.hitRate || '0%'}</span>
                  </div>
                  <Progress value={parseFloat((cacheStats?.hitRate || '0%').replace('%', ''))} />
                </div>
              </CardContent>
            </Card>

            {/* Cache Health */}
            <Card>
              <CardHeader>
                <CardTitle>Cache Health Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Hits</p>
                    <p className="text-xl font-semibold">{cacheStats?.hits || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Misses</p>
                    <p className="text-xl font-semibold">{cacheStats?.misses || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Expired Entries</p>
                    <p className="text-xl font-semibold">{cacheStats?.expiredEntries || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Near Expiry</p>
                    <p className="text-xl font-semibold">{cacheStats?.nearExpiryEntries || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cache Recommendations */}
          {cacheStats?.recommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cache Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cacheStats.recommendations.map((rec, index) => (
                    <div key={index} className="p-2 bg-blue-50 rounded">
                      <p className="text-blue-800">{rec}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {healthReport?.recommendations?.map((rec, index) => (
                  <div key={index} className={`p-4 rounded-lg border-l-4 ${
                    rec.priority === 'critical' ? 'border-red-500 bg-red-50' :
                    rec.priority === 'high' ? 'border-orange-500 bg-orange-50' :
                    rec.priority === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                    'border-blue-500 bg-blue-50'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={
                            rec.priority === 'critical' ? 'destructive' :
                            rec.priority === 'high' ? 'secondary' :
                            'outline'
                          }>
                            {rec.priority.toUpperCase()}
                          </Badge>
                          <span className="font-medium">{rec.type.replace('_', ' ').toUpperCase()}</span>
                        </div>
                        <p className="text-gray-700 mb-2">{rec.message}</p>
                        {rec.actions && Array.isArray(rec.actions) && (
                          <ul className="list-disc list-inside text-sm text-gray-600">
                            {rec.actions.map((action, actionIndex) => (
                              <li key={actionIndex}>{action}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {(!healthReport?.recommendations || healthReport.recommendations.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                    <p>No performance issues detected. System is running optimally!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PerformanceDashboard;