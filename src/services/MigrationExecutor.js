import ledgerMigrationService from './LedgerMigrationService';

/**
 * Migration Executor - Provides easy interface to run ledger migration
 * Can be used from components or run as standalone script
 */
class MigrationExecutor {
  constructor() {
    this.isRunning = false;
    this.currentProgress = { message: '', percentage: 0 };
    this.progressCallbacks = [];
  }

  // =================== MAIN EXECUTION METHODS ===================

  /**
   * Run full migration with progress tracking
   */
  async executeMigration(options = {}) {
    if (this.isRunning) {
      throw new Error('Migration is already running');
    }

    const {
      dryRun = false,
      orgId = null,
      skipExisting = true,
      onProgress = null
    } = options;

    try {
      this.isRunning = true;
      this.currentProgress = { message: 'Starting migration...', percentage: 0 };

      // Add progress callback
      if (onProgress) {
        this.progressCallbacks.push(onProgress);
      }

      console.log('🚀 Starting ledger migration execution...', { dryRun, skipExisting });

      // Run the migration
      const result = await ledgerMigrationService.runFullMigration({
        dryRun,
        orgId,
        skipExisting,
        progressCallback: (progress) => {
          this.currentProgress = progress;
          this.notifyProgressCallbacks(progress);
        }
      });

      console.log('✅ Migration execution completed');
      return result;

    } catch (error) {
      console.error('❌ Migration execution failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.progressCallbacks = [];
    }
  }

  /**
   * Run dry run migration (no actual changes)
   */
  async executeDryRun(options = {}) {
    return this.executeMigration({
      ...options,
      dryRun: true
    });
  }

  /**
   * Quick analysis without migration
   */
  async analyzeOnly(orgId = null) {
    try {
      console.log('🔍 Running migration analysis only...');
      
      const analysis = await ledgerMigrationService.analyzeExistingData(orgId);
      
      console.log('✅ Analysis completed');
      return {
        success: true,
        analysis,
        summary: this.generateAnalysisSummary(analysis)
      };
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate existing migration
   */
  async validateMigration(orgId = null) {
    try {
      console.log('🔍 Validating existing migration...');
      
      const validation = await ledgerMigrationService.validateMigration(orgId);
      
      console.log('✅ Validation completed');
      return {
        success: true,
        validation,
        isValid: validation.isValid
      };
    } catch (error) {
      console.error('❌ Validation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // =================== ROLLBACK METHODS ===================

  /**
   * Rollback migration (requires confirmation)
   */
  async rollbackMigration(confirmationCode, orgId = null) {
    try {
      console.log('🔄 Executing migration rollback...');
      
      const result = await ledgerMigrationService.rollbackMigration({
        orgId,
        confirmationCode
      });
      
      console.log('✅ Rollback completed');
      return result;
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  // =================== PROGRESS TRACKING ===================

  getCurrentProgress() {
    return {
      ...this.currentProgress,
      isRunning: this.isRunning
    };
  }

  addProgressCallback(callback) {
    this.progressCallbacks.push(callback);
  }

  removeProgressCallback(callback) {
    this.progressCallbacks = this.progressCallbacks.filter(cb => cb !== callback);
  }

  notifyProgressCallbacks(progress) {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }

  // =================== UTILITY METHODS ===================

  generateAnalysisSummary(analysis) {
    const {
      rentals,
      fuelRefills,
      vehicleFuelRefills,
      vehicleAcquisitions,
      existingJournalEntries
    } = analysis;

    return {
      totalRecords: 
        rentals.count + 
        fuelRefills.count + 
        vehicleFuelRefills.count + 
        vehicleAcquisitions.count,
      totalFinancialValue: 
        rentals.totalRevenue + 
        fuelRefills.totalCost + 
        vehicleFuelRefills.totalCost + 
        vehicleAcquisitions.totalCost,
      breakdown: {
        rentals: {
          count: rentals.count,
          value: rentals.totalRevenue,
          percentage: this.calculatePercentage(rentals.totalRevenue, analysis)
        },
        fuel: {
          count: fuelRefills.count + vehicleFuelRefills.count,
          value: fuelRefills.totalCost + vehicleFuelRefills.totalCost,
          percentage: this.calculatePercentage(
            fuelRefills.totalCost + vehicleFuelRefills.totalCost, 
            analysis
          )
        },
        vehicles: {
          count: vehicleAcquisitions.count,
          value: vehicleAcquisitions.totalCost,
          percentage: this.calculatePercentage(vehicleAcquisitions.totalCost, analysis)
        }
      },
      existingMigration: {
        hasExistingEntries: existingJournalEntries.count > 0,
        entriesCount: existingJournalEntries.count,
        byType: existingJournalEntries.byType
      },
      recommendations: this.generateRecommendations(analysis)
    };
  }

  calculatePercentage(value, analysis) {
    const total = 
      analysis.rentals.totalRevenue + 
      analysis.fuelRefills.totalCost + 
      analysis.vehicleFuelRefills.totalCost + 
      analysis.vehicleAcquisitions.totalCost;
    
    return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    // Check if there's existing data to migrate
    const totalRecords = 
      analysis.rentals.count + 
      analysis.fuelRefills.count + 
      analysis.vehicleFuelRefills.count + 
      analysis.vehicleAcquisitions.count;

    if (totalRecords === 0) {
      recommendations.push({
        type: 'info',
        message: 'No financial data found to migrate. You can start using the ledger system for new transactions.'
      });
    } else {
      recommendations.push({
        type: 'success',
        message: `Found ${totalRecords} financial records ready for migration.`
      });
    }

    // Check for existing journal entries
    if (analysis.existingJournalEntries.count > 0) {
      recommendations.push({
        type: 'warning',
        message: `${analysis.existingJournalEntries.count} journal entries already exist. Use 'skipExisting' option to avoid duplicates.`
      });
    }

    // Check data quality
    if (analysis.rentals.count > 0 && analysis.rentals.totalRevenue === 0) {
      recommendations.push({
        type: 'warning',
        message: 'Some rental records may have missing or zero amounts. Review data quality before migration.'
      });
    }

    // Recommend dry run first
    if (totalRecords > 100) {
      recommendations.push({
        type: 'info',
        message: 'Large dataset detected. Consider running a dry run first to validate the migration process.'
      });
    }

    return recommendations;
  }

  // =================== PRESET MIGRATION SCENARIOS ===================

  /**
   * Conservative migration - dry run first, then real migration with validation
   */
  async conservativeMigration(options = {}) {
    const results = {
      dryRun: null,
      migration: null,
      validation: null
    };

    try {
      // Step 1: Dry run
      console.log('📋 Step 1: Running dry run...');
      results.dryRun = await this.executeDryRun(options);

      if (!results.dryRun.success) {
        throw new Error('Dry run failed: ' + results.dryRun.error);
      }

      // Step 2: Ask for confirmation (in real UI, this would be a modal)
      console.log('✅ Dry run successful. Proceeding with actual migration...');

      // Step 3: Real migration
      results.migration = await this.executeMigration({
        ...options,
        dryRun: false
      });

      if (!results.migration.success) {
        throw new Error('Migration failed: ' + results.migration.error);
      }

      // Step 4: Validation
      console.log('🔍 Step 4: Validating migration...');
      results.validation = await this.validateMigration(options.orgId);

      return {
        success: true,
        results,
        summary: {
          recordsMigrated: results.migration.report.summary.totalRecordsSuccessful,
          totalAmount: results.migration.report.summary.totalFinancialAmount,
          isValid: results.validation.isValid
        }
      };

    } catch (error) {
      console.error('❌ Conservative migration failed:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Quick migration - for small datasets or development
   */
  async quickMigration(options = {}) {
    try {
      console.log('⚡ Running quick migration...');
      
      const result = await this.executeMigration({
        ...options,
        skipExisting: true
      });

      return {
        success: result.success,
        summary: result.success ? {
          recordsMigrated: result.report.summary.totalRecordsSuccessful,
          totalAmount: result.report.summary.totalFinancialAmount
        } : null,
        error: result.error
      };
    } catch (error) {
      console.error('❌ Quick migration failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const migrationExecutor = new MigrationExecutor();
export default migrationExecutor;