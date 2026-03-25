import { supabase } from '../utils/supabaseClient';
import performanceMonitor from './PerformanceMonitor';
import cacheService from '../services/CacheService';

/**
 * Database Health Monitoring System
 * Monitors database performance, connection health, and query patterns
 */
class DatabaseHealthMonitor {
  constructor() {
    this.healthMetrics = {
      connectionTests: [],
      queryPerformance: [],
      errorRates: [],
      resourceUsage: []
    };
    
    this.thresholds = {
      connectionTimeout: 5000,    // 5 seconds
      slowQuery: 1000,           // 1 second
      errorRateHigh: 5,          // 5% error rate
      criticalErrorRate: 10      // 10% error rate
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.lastHealthCheck = null;
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs = 60000) { // Default: 1 minute
    if (this.isMonitoring) {
      console.log('Database health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🏥 Starting database health monitoring...');
    
    // Perform initial health check
    this.performHealthCheck();
    
    // Set up periodic health checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('Database health monitoring is not running');
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('⏹️ Database health monitoring stopped');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const healthCheck = {
      timestamp: Date.now(),
      connection: await this.testConnection(),
      queryPerformance: await this.testQueryPerformance(),
      errorRates: this.calculateErrorRates(),
      cacheHealth: this.getCacheHealth(),
      resourceUsage: await this.checkResourceUsage()
    };

    this.lastHealthCheck = healthCheck;
    this.recordHealthMetrics(healthCheck);
    
    // Log health status
    const overallHealth = this.calculateOverallHealth(healthCheck);
    console.log(`🏥 Database Health Check - Score: ${overallHealth.score}/100 (${overallHealth.status})`);
    
    // Alert on critical issues
    if (overallHealth.score < 50) {
      console.error('🚨 Critical database health issues detected!', overallHealth.issues);
      performanceMonitor.recordError({
        type: 'database_health',
        message: 'Critical database health issues detected',
        context: overallHealth.issues,
        severity: 'critical'
      });
    }

    return healthCheck;
  }

  /**
   * Test database connection
   */
  async testConnection() {
    const startTime = performance.now();
    
    try {
      // Simple connection test
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .limit(1);

      const duration = performance.now() - startTime;
      const isHealthy = !error && duration < this.thresholds.connectionTimeout;

      const connectionTest = {
        success: !error,
        duration,
        isHealthy,
        error: error?.message || null,
        timestamp: Date.now()
      };

      this.healthMetrics.connectionTests.push(connectionTest);
      
      // Keep only last 100 connection tests
      if (this.healthMetrics.connectionTests.length > 100) {
        this.healthMetrics.connectionTests = this.healthMetrics.connectionTests.slice(-100);
      }

      return connectionTest;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      const connectionTest = {
        success: false,
        duration,
        isHealthy: false,
        error: error.message,
        timestamp: Date.now()
      };

      this.healthMetrics.connectionTests.push(connectionTest);
      return connectionTest;
    }
  }

  /**
   * Test query performance with sample queries
   */
  async testQueryPerformance() {
    const testQueries = [
      {
        name: 'simple_select',
        query: () => supabase.from('vehicles').select('id').limit(1)
      },
      {
        name: 'count_query',
        query: () => supabase.from('vehicles').select('*', { count: 'exact', head: true })
      },
      {
        name: 'join_query',
        query: () => supabase
          .from('bookings')
          .select('id, vehicles(name)')
          .limit(5)
      }
    ];

    const results = [];

    for (const test of testQueries) {
      const startTime = performance.now();
      
      try {
        const { data, error } = await test.query();
        const duration = performance.now() - startTime;
        
        results.push({
          name: test.name,
          success: !error,
          duration,
          isSlow: duration > this.thresholds.slowQuery,
          error: error?.message || null,
          recordCount: Array.isArray(data) ? data.length : (data ? 1 : 0)
        });
      } catch (error) {
        const duration = performance.now() - startTime;
        
        results.push({
          name: test.name,
          success: false,
          duration,
          isSlow: true,
          error: error.message,
          recordCount: 0
        });
      }
    }

    const performanceTest = {
      timestamp: Date.now(),
      tests: results,
      averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      slowQueryCount: results.filter(r => r.isSlow).length,
      successRate: (results.filter(r => r.success).length / results.length * 100).toFixed(2)
    };

    this.healthMetrics.queryPerformance.push(performanceTest);
    
    // Keep only last 50 performance tests
    if (this.healthMetrics.queryPerformance.length > 50) {
      this.healthMetrics.queryPerformance = this.healthMetrics.queryPerformance.slice(-50);
    }

    return performanceTest;
  }

  /**
   * Calculate current error rates
   */
  calculateErrorRates() {
    const performanceStats = performanceMonitor.getStats();
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Get recent errors
    const recentErrors = performanceStats.errors?.count || 0;
    const totalQueries = performanceStats.overall?.totalQueries || 0;
    
    const errorRate = totalQueries > 0 ? (recentErrors / totalQueries * 100) : 0;
    
    const errorRateData = {
      timestamp: now,
      errorCount: recentErrors,
      totalQueries,
      errorRate: errorRate.toFixed(2),
      isHigh: errorRate > this.thresholds.errorRateHigh,
      isCritical: errorRate > this.thresholds.criticalErrorRate
    };

    this.healthMetrics.errorRates.push(errorRateData);
    
    // Keep only last 100 error rate measurements
    if (this.healthMetrics.errorRates.length > 100) {
      this.healthMetrics.errorRates = this.healthMetrics.errorRates.slice(-100);
    }

    return errorRateData;
  }

  /**
   * Get cache health information
   */
  getCacheHealth() {
    const cacheStats = cacheService.getStats();
    const hitRate = parseFloat(cacheStats.hitRate || 0);
    
    return {
      hitRate: cacheStats.hitRate,
      cacheSize: cacheStats.cacheSize,
      memoryUsage: cacheStats.memoryUsage,
      isHealthy: hitRate > 30 && cacheStats.cacheSize < 2000,
      recommendations: hitRate < 30 ? ['Improve cache hit rate'] : []
    };
  }

  /**
   * Check resource usage (simplified version)
   */
  async checkResourceUsage() {
    // In a real implementation, this would check actual database metrics
    // For now, we'll simulate based on query patterns
    const performanceStats = performanceMonitor.getStats();
    
    const resourceUsage = {
      timestamp: Date.now(),
      queryLoad: performanceStats.overall?.totalQueries || 0,
      averageQueryTime: performanceStats.queries?.averageDuration || 0,
      memoryUsage: this.estimateMemoryUsage(),
      connectionCount: 1, // Simplified - would be actual connection count
      isHealthy: (performanceStats.queries?.averageDuration || 0) < 1000
    };

    this.healthMetrics.resourceUsage.push(resourceUsage);
    
    // Keep only last 100 resource usage measurements
    if (this.healthMetrics.resourceUsage.length > 100) {
      this.healthMetrics.resourceUsage = this.healthMetrics.resourceUsage.slice(-100);
    }

    return resourceUsage;
  }

  /**
   * Estimate memory usage based on cache and query patterns
   */
  estimateMemoryUsage() {
    const cacheStats = cacheService.getStats();
    const cacheMemory = parseFloat(cacheStats.memoryUsage?.replace(' KB', '') || 0);
    
    // Estimate total memory usage (cache + query buffers + overhead)
    const estimatedTotal = cacheMemory * 1.5; // Add 50% overhead estimate
    
    return {
      cache: `${cacheMemory} KB`,
      estimated: `${estimatedTotal.toFixed(2)} KB`,
      isHigh: estimatedTotal > 1000 // Alert if over 1MB
    };
  }

  /**
   * Calculate overall health score
   */
  calculateOverallHealth(healthCheck) {
    let score = 100;
    const issues = [];

    // Connection health (30 points)
    if (!healthCheck.connection.success) {
      score -= 30;
      issues.push('Database connection failed');
    } else if (!healthCheck.connection.isHealthy) {
      score -= 15;
      issues.push('Slow database connection');
    }

    // Query performance (25 points)
    if (healthCheck.queryPerformance.slowQueryCount > 0) {
      score -= 15;
      issues.push(`${healthCheck.queryPerformance.slowQueryCount} slow queries detected`);
    }
    
    if (parseFloat(healthCheck.queryPerformance.successRate) < 90) {
      score -= 10;
      issues.push('Low query success rate');
    }

    // Error rates (25 points)
    if (healthCheck.errorRates.isCritical) {
      score -= 25;
      issues.push('Critical error rate detected');
    } else if (healthCheck.errorRates.isHigh) {
      score -= 15;
      issues.push('High error rate detected');
    }

    // Cache health (10 points)
    if (!healthCheck.cacheHealth.isHealthy) {
      score -= 10;
      issues.push('Cache performance issues');
    }

    // Resource usage (10 points)
    if (!healthCheck.resourceUsage.isHealthy) {
      score -= 10;
      issues.push('High resource usage');
    }

    score = Math.max(0, score);

    let status;
    if (score >= 90) status = 'Excellent';
    else if (score >= 75) status = 'Good';
    else if (score >= 60) status = 'Fair';
    else if (score >= 40) status = 'Poor';
    else status = 'Critical';

    return { score, status, issues };
  }

  /**
   * Record health metrics for trending
   */
  recordHealthMetrics(healthCheck) {
    // This could be extended to store metrics in a time-series database
    // For now, we'll just log significant changes
    
    if (this.lastHealthCheck) {
      const previousScore = this.calculateOverallHealth(this.lastHealthCheck).score;
      const currentScore = this.calculateOverallHealth(healthCheck).score;
      const scoreDiff = currentScore - previousScore;
      
      if (Math.abs(scoreDiff) > 10) {
        const trend = scoreDiff > 0 ? 'improved' : 'degraded';
        console.log(`📈 Database health ${trend} by ${Math.abs(scoreDiff)} points`);
      }
    }
  }

  /**
   * Get health trends over time
   */
  getHealthTrends() {
    const connectionTests = this.healthMetrics.connectionTests.slice(-20);
    const performanceTests = this.healthMetrics.queryPerformance.slice(-20);
    const errorRates = this.healthMetrics.errorRates.slice(-20);
    
    return {
      connection: {
        successRate: connectionTests.length > 0 ? 
          (connectionTests.filter(t => t.success).length / connectionTests.length * 100).toFixed(2) : '0',
        averageDuration: connectionTests.length > 0 ?
          connectionTests.reduce((sum, t) => sum + t.duration, 0) / connectionTests.length : 0
      },
      performance: {
        averageQueryTime: performanceTests.length > 0 ?
          performanceTests.reduce((sum, t) => sum + t.averageDuration, 0) / performanceTests.length : 0,
        slowQueryTrend: this.calculateTrend(performanceTests.map(t => t.slowQueryCount))
      },
      errors: {
        averageErrorRate: errorRates.length > 0 ?
          errorRates.reduce((sum, e) => sum + parseFloat(e.errorRate), 0) / errorRates.length : 0,
        errorTrend: this.calculateTrend(errorRates.map(e => parseFloat(e.errorRate)))
      }
    };
  }

  /**
   * Calculate trend direction
   */
  calculateTrend(values) {
    if (values.length < 5) return 'insufficient_data';
    
    const midpoint = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);
    
    const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    const threshold = Math.max(firstAvg * 0.1, 0.1); // 10% threshold, minimum 0.1
    
    if (Math.abs(difference) < threshold) return 'stable';
    return difference > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Generate comprehensive health report
   */
  generateHealthReport() {
    const latestHealthCheck = this.lastHealthCheck || {};
    const overallHealth = this.calculateOverallHealth(latestHealthCheck);
    const trends = this.getHealthTrends();
    
    return {
      timestamp: Date.now(),
      overall: overallHealth,
      current: latestHealthCheck,
      trends,
      recommendations: this.generateHealthRecommendations(overallHealth, trends),
      monitoring: {
        isActive: this.isMonitoring,
        totalChecks: this.healthMetrics.connectionTests.length,
        lastCheckTime: this.lastHealthCheck?.timestamp || null
      }
    };
  }

  /**
   * Generate health recommendations
   */
  generateHealthRecommendations(overallHealth, trends) {
    const recommendations = [];
    
    if (overallHealth.score < 60) {
      recommendations.push({
        type: 'critical',
        priority: 'high',
        message: 'Database health is poor. Immediate attention required.',
        actions: overallHealth.issues
      });
    }
    
    if (trends.performance.slowQueryTrend === 'increasing') {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Query performance is degrading. Consider optimizing slow queries.',
        actions: ['Review slow query log', 'Add database indexes', 'Optimize query patterns']
      });
    }
    
    if (trends.errors.errorTrend === 'increasing') {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Error rate is increasing. Check application logs for issues.',
        actions: ['Review error logs', 'Check database constraints', 'Validate data integrity']
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'maintenance',
        priority: 'low',
        message: 'Database health is good. Continue regular monitoring.',
        actions: ['Maintain current monitoring', 'Review performance periodically']
      });
    }
    
    return recommendations;
  }

  /**
   * Export health metrics
   */
  exportHealthMetrics(format = 'json') {
    const data = {
      exportTime: Date.now(),
      healthMetrics: this.healthMetrics,
      latestHealthCheck: this.lastHealthCheck,
      trends: this.getHealthTrends()
    };

    if (format === 'csv') {
      return this.convertHealthMetricsToCSV(data);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert health metrics to CSV
   */
  convertHealthMetricsToCSV(data) {
    const connectionTests = data.healthMetrics.connectionTests.map(test => ({
      type: 'connection',
      timestamp: test.timestamp,
      success: test.success,
      duration: test.duration,
      isHealthy: test.isHealthy,
      error: test.error || ''
    }));

    const performanceTests = data.healthMetrics.queryPerformance.map(test => ({
      type: 'performance',
      timestamp: test.timestamp,
      averageDuration: test.averageDuration,
      slowQueryCount: test.slowQueryCount,
      successRate: test.successRate
    }));

    const allData = [...connectionTests, ...performanceTests];
    
    if (allData.length === 0) return 'No health data available';

    const headers = Object.keys(allData[0]);
    const csvContent = [
      headers.join(','),
      ...allData.map(row => headers.map(header => row[header] || '').join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Clear health metrics
   */
  clearHealthMetrics() {
    this.healthMetrics = {
      connectionTests: [],
      queryPerformance: [],
      errorRates: [],
      resourceUsage: []
    };
    this.lastHealthCheck = null;
    console.log('🧹 Database health metrics cleared');
  }
}

// Create singleton instance
const databaseHealthMonitor = new DatabaseHealthMonitor();

export default databaseHealthMonitor;

// Export utility functions
export const {
  startMonitoring,
  stopMonitoring,
  performHealthCheck,
  generateHealthReport,
  getHealthTrends,
  exportHealthMetrics,
  clearHealthMetrics
} = databaseHealthMonitor;