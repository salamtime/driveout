/**
 * Performance Monitoring Utilities
 * Tracks query times, database health, and application performance metrics
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      queries: [],
      apiCalls: [],
      pageLoads: [],
      userInteractions: [],
      errors: []
    };
    
    this.thresholds = {
      slowQuery: 1000,        // 1 second
      slowApiCall: 2000,      // 2 seconds
      slowPageLoad: 3000,     // 3 seconds
      criticalError: 5000     // 5 seconds
    };
    
    this.isMonitoring = false;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    
    // Initialize performance observer if available
    this.initializePerformanceObserver();
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize Performance Observer for web vitals
   */
  initializePerformanceObserver() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        // Observe navigation timing
        const navObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation') {
              this.recordPageLoad({
                url: entry.name,
                loadTime: entry.loadEventEnd - entry.loadEventStart,
                domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                firstPaint: entry.responseEnd - entry.requestStart,
                transferSize: entry.transferSize || 0
              });
            }
          }
        });
        
        navObserver.observe({ entryTypes: ['navigation'] });

        // Observe resource timing
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
              this.recordApiCall({
                url: entry.name,
                duration: entry.responseEnd - entry.requestStart,
                transferSize: entry.transferSize || 0,
                method: 'unknown'
              });
            }
          }
        });
        
        resourceObserver.observe({ entryTypes: ['resource'] });
      } catch (error) {
        console.warn('Performance Observer not fully supported:', error);
      }
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    this.isMonitoring = true;
    this.startTime = Date.now();
    console.log(`🔍 Performance monitoring started - Session: ${this.sessionId}`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    console.log('⏹️ Performance monitoring stopped');
    return this.generateReport();
  }

  /**
   * Record database query performance
   */
  recordQuery(queryInfo) {
    if (!this.isMonitoring) return;

    const queryMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      service: queryInfo.service,
      method: queryInfo.method,
      duration: queryInfo.duration,
      success: queryInfo.success,
      cached: queryInfo.cached || false,
      recordCount: queryInfo.recordCount || 0,
      error: queryInfo.error || null,
      isSlow: queryInfo.duration > this.thresholds.slowQuery
    };

    this.metrics.queries.push(queryMetric);
    
    if (queryMetric.isSlow) {
      console.warn(`🐌 Slow query detected: ${queryInfo.service}.${queryInfo.method} took ${queryInfo.duration}ms`);
    }

    // Keep only last 1000 queries to prevent memory issues
    if (this.metrics.queries.length > 1000) {
      this.metrics.queries = this.metrics.queries.slice(-1000);
    }

    return queryMetric.id;
  }

  /**
   * Record API call performance
   */
  recordApiCall(apiInfo) {
    if (!this.isMonitoring) return;

    const apiMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      url: apiInfo.url,
      method: apiInfo.method,
      duration: apiInfo.duration,
      success: apiInfo.success !== false,
      statusCode: apiInfo.statusCode || 200,
      transferSize: apiInfo.transferSize || 0,
      error: apiInfo.error || null,
      isSlow: apiInfo.duration > this.thresholds.slowApiCall
    };

    this.metrics.apiCalls.push(apiMetric);

    if (apiMetric.isSlow) {
      console.warn(`🐌 Slow API call detected: ${apiInfo.method} ${apiInfo.url} took ${apiInfo.duration}ms`);
    }

    // Keep only last 500 API calls
    if (this.metrics.apiCalls.length > 500) {
      this.metrics.apiCalls = this.metrics.apiCalls.slice(-500);
    }

    return apiMetric.id;
  }

  /**
   * Record page load performance
   */
  recordPageLoad(pageInfo) {
    if (!this.isMonitoring) return;

    const pageMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      url: pageInfo.url,
      loadTime: pageInfo.loadTime,
      domContentLoaded: pageInfo.domContentLoaded,
      firstPaint: pageInfo.firstPaint,
      transferSize: pageInfo.transferSize || 0,
      isSlow: pageInfo.loadTime > this.thresholds.slowPageLoad
    };

    this.metrics.pageLoads.push(pageMetric);

    if (pageMetric.isSlow) {
      console.warn(`🐌 Slow page load detected: ${pageInfo.url} took ${pageInfo.loadTime}ms`);
    }

    return pageMetric.id;
  }

  /**
   * Record user interaction performance
   */
  recordUserInteraction(interactionInfo) {
    if (!this.isMonitoring) return;

    const interactionMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      type: interactionInfo.type, // 'click', 'scroll', 'input', etc.
      element: interactionInfo.element,
      duration: interactionInfo.duration,
      success: interactionInfo.success !== false,
      error: interactionInfo.error || null
    };

    this.metrics.userInteractions.push(interactionMetric);

    // Keep only last 200 interactions
    if (this.metrics.userInteractions.length > 200) {
      this.metrics.userInteractions = this.metrics.userInteractions.slice(-200);
    }

    return interactionMetric.id;
  }

  /**
   * Record error
   */
  recordError(errorInfo) {
    const errorMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      type: errorInfo.type, // 'query', 'api', 'ui', 'validation'
      message: errorInfo.message,
      stack: errorInfo.stack,
      context: errorInfo.context || {},
      severity: errorInfo.severity || 'error', // 'warning', 'error', 'critical'
      isCritical: errorInfo.severity === 'critical'
    };

    this.metrics.errors.push(errorMetric);

    if (errorMetric.isCritical) {
      console.error(`🚨 Critical error recorded:`, errorMetric);
    }

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors = this.metrics.errors.slice(-100);
    }

    return errorMetric.id;
  }

  /**
   * Get current performance statistics
   */
  getStats() {
    const now = Date.now();
    const sessionDuration = now - this.startTime;

    const queryStats = this.calculateQueryStats();
    const apiStats = this.calculateApiStats();
    const pageStats = this.calculatePageStats();
    const errorStats = this.calculateErrorStats();

    return {
      session: {
        id: this.sessionId,
        duration: sessionDuration,
        isMonitoring: this.isMonitoring,
        startTime: this.startTime
      },
      queries: queryStats,
      apiCalls: apiStats,
      pageLoads: pageStats,
      errors: errorStats,
      overall: {
        totalQueries: this.metrics.queries.length,
        totalApiCalls: this.metrics.apiCalls.length,
        totalPageLoads: this.metrics.pageLoads.length,
        totalErrors: this.metrics.errors.length,
        totalInteractions: this.metrics.userInteractions.length
      }
    };
  }

  /**
   * Calculate query statistics
   */
  calculateQueryStats() {
    const queries = this.metrics.queries;
    if (queries.length === 0) return { count: 0 };

    const durations = queries.map(q => q.duration);
    const successfulQueries = queries.filter(q => q.success);
    const cachedQueries = queries.filter(q => q.cached);
    const slowQueries = queries.filter(q => q.isSlow);

    return {
      count: queries.length,
      averageDuration: this.calculateAverage(durations),
      medianDuration: this.calculateMedian(durations),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successfulQueries.length / queries.length * 100).toFixed(2),
      cacheHitRate: (cachedQueries.length / queries.length * 100).toFixed(2),
      slowQueryCount: slowQueries.length,
      slowQueryRate: (slowQueries.length / queries.length * 100).toFixed(2),
      totalRecords: queries.reduce((sum, q) => sum + (q.recordCount || 0), 0)
    };
  }

  /**
   * Calculate API call statistics
   */
  calculateApiStats() {
    const apiCalls = this.metrics.apiCalls;
    if (apiCalls.length === 0) return { count: 0 };

    const durations = apiCalls.map(a => a.duration);
    const successfulCalls = apiCalls.filter(a => a.success);
    const slowCalls = apiCalls.filter(a => a.isSlow);

    return {
      count: apiCalls.length,
      averageDuration: this.calculateAverage(durations),
      medianDuration: this.calculateMedian(durations),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successfulCalls.length / apiCalls.length * 100).toFixed(2),
      slowCallCount: slowCalls.length,
      slowCallRate: (slowCalls.length / apiCalls.length * 100).toFixed(2),
      totalTransferSize: apiCalls.reduce((sum, a) => sum + (a.transferSize || 0), 0)
    };
  }

  /**
   * Calculate page load statistics
   */
  calculatePageStats() {
    const pageLoads = this.metrics.pageLoads;
    if (pageLoads.length === 0) return { count: 0 };

    const loadTimes = pageLoads.map(p => p.loadTime);
    const slowPages = pageLoads.filter(p => p.isSlow);

    return {
      count: pageLoads.length,
      averageLoadTime: this.calculateAverage(loadTimes),
      medianLoadTime: this.calculateMedian(loadTimes),
      minLoadTime: Math.min(...loadTimes),
      maxLoadTime: Math.max(...loadTimes),
      slowPageCount: slowPages.length,
      slowPageRate: (slowPages.length / pageLoads.length * 100).toFixed(2)
    };
  }

  /**
   * Calculate error statistics
   */
  calculateErrorStats() {
    const errors = this.metrics.errors;
    if (errors.length === 0) return { count: 0 };

    const criticalErrors = errors.filter(e => e.isCritical);
    const errorsByType = this.groupBy(errors, 'type');
    const errorsBySeverity = this.groupBy(errors, 'severity');

    return {
      count: errors.length,
      criticalCount: criticalErrors.length,
      criticalRate: (criticalErrors.length / errors.length * 100).toFixed(2),
      byType: Object.keys(errorsByType).reduce((acc, type) => {
        acc[type] = errorsByType[type].length;
        return acc;
      }, {}),
      bySeverity: Object.keys(errorsBySeverity).reduce((acc, severity) => {
        acc[severity] = errorsBySeverity[severity].length;
        return acc;
      }, {})
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    const stats = this.getStats();
    const recommendations = this.generateRecommendations(stats);

    return {
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sessionDuration: stats.session.duration,
      summary: {
        totalQueries: stats.overall.totalQueries,
        averageQueryTime: stats.queries.averageDuration || 0,
        cacheHitRate: stats.queries.cacheHitRate || '0.00',
        errorRate: stats.errors.count > 0 ? 
          ((stats.errors.count / (stats.overall.totalQueries + stats.overall.totalApiCalls)) * 100).toFixed(2) : '0.00',
        performanceScore: this.calculatePerformanceScore(stats)
      },
      detailed: stats,
      recommendations,
      topSlowQueries: this.getTopSlowQueries(5),
      topErrors: this.getTopErrors(5),
      performanceTrends: this.calculateTrends()
    };
  }

  /**
   * Calculate overall performance score (0-100)
   */
  calculatePerformanceScore(stats) {
    let score = 100;

    // Penalize slow queries
    if (stats.queries.slowQueryRate > 20) score -= 20;
    else if (stats.queries.slowQueryRate > 10) score -= 10;

    // Penalize low cache hit rate
    const cacheHitRate = parseFloat(stats.queries.cacheHitRate || 0);
    if (cacheHitRate < 30) score -= 15;
    else if (cacheHitRate < 50) score -= 8;

    // Penalize errors
    if (stats.errors.count > 10) score -= 15;
    else if (stats.errors.count > 5) score -= 8;

    // Penalize slow API calls
    if (stats.apiCalls.slowCallRate > 15) score -= 10;
    else if (stats.apiCalls.slowCallRate > 8) score -= 5;

    return Math.max(0, score);
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(stats) {
    const recommendations = [];

    if (parseFloat(stats.queries.slowQueryRate || 0) > 10) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'High percentage of slow queries detected. Consider optimizing database queries or adding indexes.'
      });
    }

    if (parseFloat(stats.queries.cacheHitRate || 0) < 50) {
      recommendations.push({
        type: 'caching',
        priority: 'medium',
        message: 'Low cache hit rate. Consider increasing cache TTL or preloading frequently accessed data.'
      });
    }

    if (stats.errors.criticalCount > 0) {
      recommendations.push({
        type: 'reliability',
        priority: 'critical',
        message: 'Critical errors detected. Immediate attention required to fix application stability issues.'
      });
    }

    if (parseFloat(stats.apiCalls.slowCallRate || 0) > 15) {
      recommendations.push({
        type: 'network',
        priority: 'medium',
        message: 'High percentage of slow API calls. Consider optimizing network requests or implementing request batching.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'Performance metrics look good. Continue monitoring for any degradation.'
      });
    }

    return recommendations;
  }

  /**
   * Get top slow queries
   */
  getTopSlowQueries(limit = 5) {
    return this.metrics.queries
      .filter(q => q.isSlow)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(q => ({
        service: q.service,
        method: q.method,
        duration: q.duration,
        timestamp: q.timestamp,
        cached: q.cached
      }));
  }

  /**
   * Get top errors
   */
  getTopErrors(limit = 5) {
    const errorCounts = {};
    
    this.metrics.errors.forEach(error => {
      const key = `${error.type}:${error.message}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([error, count]) => {
        const [type, message] = error.split(':');
        return { type, message, count };
      });
  }

  /**
   * Calculate performance trends
   */
  calculateTrends() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentQueries = this.metrics.queries.filter(q => q.timestamp > oneHourAgo);
    const recentErrors = this.metrics.errors.filter(e => e.timestamp > oneHourAgo);
    
    return {
      recentQueryCount: recentQueries.length,
      recentAverageQueryTime: recentQueries.length > 0 ? 
        this.calculateAverage(recentQueries.map(q => q.duration)) : 0,
      recentErrorCount: recentErrors.length,
      trend: this.calculateTrendDirection(recentQueries)
    };
  }

  /**
   * Calculate trend direction
   */
  calculateTrendDirection(recentQueries) {
    if (recentQueries.length < 10) return 'insufficient_data';
    
    const midpoint = Math.floor(recentQueries.length / 2);
    const firstHalf = recentQueries.slice(0, midpoint);
    const secondHalf = recentQueries.slice(midpoint);
    
    const firstHalfAvg = this.calculateAverage(firstHalf.map(q => q.duration));
    const secondHalfAvg = this.calculateAverage(secondHalf.map(q => q.duration));
    
    const difference = secondHalfAvg - firstHalfAvg;
    const threshold = firstHalfAvg * 0.1; // 10% threshold
    
    if (Math.abs(difference) < threshold) return 'stable';
    return difference > 0 ? 'degrading' : 'improving';
  }

  /**
   * Utility functions
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    return Math.round(numbers.reduce((sum, num) => sum + num, 0) / numbers.length);
  }

  calculateMedian(numbers) {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  /**
   * Export metrics data
   */
  exportMetrics(format = 'json') {
    const data = {
      sessionId: this.sessionId,
      exportTime: Date.now(),
      metrics: this.metrics,
      stats: this.getStats()
    };

    if (format === 'csv') {
      return this.convertToCSV(data);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert metrics to CSV format
   */
  convertToCSV(data) {
    const queries = data.metrics.queries.map(q => ({
      type: 'query',
      timestamp: q.timestamp,
      service: q.service,
      method: q.method,
      duration: q.duration,
      success: q.success,
      cached: q.cached
    }));

    const errors = data.metrics.errors.map(e => ({
      type: 'error',
      timestamp: e.timestamp,
      errorType: e.type,
      message: e.message,
      severity: e.severity
    }));

    const allData = [...queries, ...errors];
    
    if (allData.length === 0) return 'No data available';

    const headers = Object.keys(allData[0]);
    const csvContent = [
      headers.join(','),
      ...allData.map(row => headers.map(header => row[header] || '').join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics = {
      queries: [],
      apiCalls: [],
      pageLoads: [],
      userInteractions: [],
      errors: []
    };
    console.log('📊 Performance metrics cleared');
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;

// Export utility functions
export const {
  startMonitoring,
  stopMonitoring,
  recordQuery,
  recordApiCall,
  recordPageLoad,
  recordUserInteraction,
  recordError,
  getStats,
  generateReport,
  exportMetrics,
  clearMetrics
} = performanceMonitor;