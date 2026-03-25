/**
 * OCR Performance Monitor - Real-time performance tracking and optimization
 * Provides detailed metrics, bottleneck detection, and optimization suggestions
 */

class OCRPerformanceMonitor {
  constructor() {
    this.metrics = {
      totalProcessed: 0,
      totalTime: 0,
      averageTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      compressionSavings: 0,
      apiCalls: 0,
      errors: 0,
      sessions: []
    };
    
    this.thresholds = {
      slowProcessing: 5000, // 5 seconds
      largeFile: 5 * 1024 * 1024, // 5MB
      lowQuality: 60, // Quality score below 60
      highCompressionRatio: 0.3 // 70% compression or more
    };
    
    this.startTime = Date.now();
  }

  /**
   * Start tracking a new OCR session
   */
  startSession(sessionId, metadata = {}) {
    const session = {
      id: sessionId,
      startTime: performance.now(),
      metadata,
      steps: [],
      warnings: [],
      recommendations: []
    };
    
    this.metrics.sessions.push(session);
    console.log(`📊 Performance tracking started for session: ${sessionId}`);
    
    return session;
  }

  /**
   * Log a processing step with timing
   */
  logStep(sessionId, stepName, duration, metadata = {}) {
    const session = this.findSession(sessionId);
    if (!session) return;

    const step = {
      name: stepName,
      duration,
      timestamp: performance.now(),
      metadata
    };
    
    session.steps.push(step);
    
    // Check for performance issues
    this.analyzeStepPerformance(session, step);
    
    console.log(`⏱️ ${stepName}: ${duration.toFixed(2)}ms`);
  }

  /**
   * Complete a session and generate performance report
   */
  completeSession(sessionId, result = {}) {
    const session = this.findSession(sessionId);
    if (!session) return null;

    session.endTime = performance.now();
    session.totalDuration = session.endTime - session.startTime;
    session.result = result;
    
    // Update global metrics
    this.updateGlobalMetrics(session);
    
    // Generate performance report
    const report = this.generateSessionReport(session);
    
    console.log(`📈 Session ${sessionId} completed in ${session.totalDuration.toFixed(2)}ms`);
    console.log('📋 Performance Report:', report);
    
    return report;
  }

  /**
   * Analyze step performance and detect issues
   */
  analyzeStepPerformance(session, step) {
    // Detect slow processing
    if (step.duration > this.thresholds.slowProcessing) {
      session.warnings.push({
        type: 'slow_processing',
        step: step.name,
        duration: step.duration,
        message: `${step.name} took ${step.duration.toFixed(2)}ms (>5s threshold)`
      });
    }
    
    // Detect large file processing
    if (step.metadata.fileSize > this.thresholds.largeFile) {
      session.warnings.push({
        type: 'large_file',
        step: step.name,
        fileSize: step.metadata.fileSize,
        message: `Processing large file (${this.formatBytes(step.metadata.fileSize)})`
      });
    }
    
    // Detect low quality images
    if (step.metadata.qualityScore < this.thresholds.lowQuality) {
      session.warnings.push({
        type: 'low_quality',
        step: step.name,
        quality: step.metadata.qualityScore,
        message: `Low image quality detected (score: ${step.metadata.qualityScore})`
      });
    }
  }

  /**
   * Update global performance metrics
   */
  updateGlobalMetrics(session) {
    this.metrics.totalProcessed++;
    this.metrics.totalTime += session.totalDuration;
    this.metrics.averageTime = this.metrics.totalTime / this.metrics.totalProcessed;
    
    // Count cache hits/misses
    if (session.result.performance?.cached) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
    
    // Count API calls
    const apiSteps = session.steps.filter(step => step.name.includes('API') || step.name.includes('api'));
    this.metrics.apiCalls += apiSteps.length;
    
    // Count errors
    if (!session.result.success) {
      this.metrics.errors++;
    }
    
    // Calculate compression savings
    const compressionSteps = session.steps.filter(step => step.metadata.compressionRatio);
    compressionSteps.forEach(step => {
      this.metrics.compressionSavings += (1 - step.metadata.compressionRatio) * 100;
    });
  }

  /**
   * Generate comprehensive session report
   */
  generateSessionReport(session) {
    const report = {
      sessionId: session.id,
      duration: session.totalDuration,
      success: session.result.success,
      steps: session.steps.length,
      warnings: session.warnings.length,
      breakdown: {},
      performance: {
        rating: this.calculatePerformanceRating(session),
        bottlenecks: this.identifyBottlenecks(session),
        recommendations: this.generateRecommendations(session)
      }
    };
    
    // Calculate step breakdown
    session.steps.forEach(step => {
      report.breakdown[step.name] = (report.breakdown[step.name] || 0) + step.duration;
    });
    
    return report;
  }

  /**
   * Calculate performance rating (0-100)
   */
  calculatePerformanceRating(session) {
    let rating = 100;
    
    // Deduct points for slow processing
    if (session.totalDuration > 10000) rating -= 30; // >10s
    else if (session.totalDuration > 5000) rating -= 15; // >5s
    else if (session.totalDuration > 3000) rating -= 5; // >3s
    
    // Deduct points for warnings
    rating -= session.warnings.length * 10;
    
    // Deduct points for errors
    if (!session.result.success) rating -= 50;
    
    // Bonus for cache hits
    if (session.result.performance?.cached) rating += 10;
    
    return Math.max(0, Math.min(100, rating));
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(session) {
    const bottlenecks = [];
    const totalDuration = session.totalDuration;
    
    session.steps.forEach(step => {
      const percentage = (step.duration / totalDuration) * 100;
      
      if (percentage > 40) {
        bottlenecks.push({
          step: step.name,
          duration: step.duration,
          percentage: percentage.toFixed(1),
          severity: 'high'
        });
      } else if (percentage > 25) {
        bottlenecks.push({
          step: step.name,
          duration: step.duration,
          percentage: percentage.toFixed(1),
          severity: 'medium'
        });
      }
    });
    
    return bottlenecks;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(session) {
    const recommendations = [];
    
    // Analyze warnings for recommendations
    session.warnings.forEach(warning => {
      switch (warning.type) {
        case 'slow_processing':
          recommendations.push({
            type: 'optimization',
            priority: 'high',
            message: 'Consider enabling image compression or reducing image size',
            action: 'Enable automatic compression for files >2MB'
          });
          break;
          
        case 'large_file':
          recommendations.push({
            type: 'preprocessing',
            priority: 'medium',
            message: 'Large files detected - automatic compression recommended',
            action: 'Implement automatic file size optimization'
          });
          break;
          
        case 'low_quality':
          recommendations.push({
            type: 'quality',
            priority: 'medium',
            message: 'Low quality image may affect OCR accuracy',
            action: 'Suggest image quality improvements to user'
          });
          break;
      }
    });
    
    // Cache recommendations
    const cacheHitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses);
    if (cacheHitRate < 0.3) {
      recommendations.push({
        type: 'caching',
        priority: 'low',
        message: 'Low cache hit rate detected',
        action: 'Consider increasing cache size or improving cache key generation'
      });
    }
    
    return recommendations;
  }

  /**
   * Get real-time performance statistics
   */
  getPerformanceStats() {
    const uptime = Date.now() - this.startTime;
    const cacheHitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0;
    const errorRate = this.metrics.errors / this.metrics.totalProcessed || 0;
    
    return {
      uptime: this.formatDuration(uptime),
      totalProcessed: this.metrics.totalProcessed,
      averageProcessingTime: this.metrics.averageTime.toFixed(2) + 'ms',
      cacheHitRate: (cacheHitRate * 100).toFixed(1) + '%',
      errorRate: (errorRate * 100).toFixed(1) + '%',
      totalCompressionSavings: this.metrics.compressionSavings.toFixed(1) + '%',
      apiCallsPerSession: (this.metrics.apiCalls / Math.max(1, this.metrics.totalProcessed)).toFixed(1),
      recentSessions: this.metrics.sessions.slice(-5).map(s => ({
        id: s.id,
        duration: s.totalDuration?.toFixed(2) + 'ms' || 'In progress',
        success: s.result?.success ?? 'Unknown'
      }))
    };
  }

  /**
   * Generate performance optimization report
   */
  generateOptimizationReport() {
    const stats = this.getPerformanceStats();
    const recentSessions = this.metrics.sessions.slice(-10);
    
    const report = {
      summary: stats,
      trends: {
        averageProcessingTime: this.calculateTrend('duration'),
        errorRate: this.calculateTrend('errors'),
        cacheEfficiency: this.calculateTrend('cache')
      },
      recommendations: this.generateGlobalRecommendations(),
      topBottlenecks: this.getTopBottlenecks(recentSessions)
    };
    
    return report;
  }

  /**
   * Helper methods
   */
  findSession(sessionId) {
    return this.metrics.sessions.find(s => s.id === sessionId);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  calculateTrend(metric) {
    // Simplified trend calculation
    const recentSessions = this.metrics.sessions.slice(-10);
    if (recentSessions.length < 2) return 'insufficient_data';
    
    // Implementation would calculate actual trends
    return 'stable';
  }

  generateGlobalRecommendations() {
    const recommendations = [];
    
    if (this.metrics.averageTime > 5000) {
      recommendations.push('Consider implementing more aggressive image compression');
    }
    
    if (this.metrics.errors / this.metrics.totalProcessed > 0.1) {
      recommendations.push('High error rate detected - review image validation');
    }
    
    return recommendations;
  }

  getTopBottlenecks(sessions) {
    const stepDurations = {};
    
    sessions.forEach(session => {
      session.steps?.forEach(step => {
        stepDurations[step.name] = (stepDurations[step.name] || []).concat(step.duration);
      });
    });
    
    return Object.entries(stepDurations)
      .map(([name, durations]) => ({
        step: name,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        occurrences: durations.length
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5);
  }

  /**
   * Clear old session data to prevent memory leaks
   */
  cleanup(maxSessions = 100) {
    if (this.metrics.sessions.length > maxSessions) {
      const toRemove = this.metrics.sessions.length - maxSessions;
      this.metrics.sessions.splice(0, toRemove);
      console.log(`🧹 Cleaned up ${toRemove} old performance sessions`);
    }
  }
}

// Export singleton instance
export const ocrPerformanceMonitor = new OCRPerformanceMonitor();
export default ocrPerformanceMonitor;