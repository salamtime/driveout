import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Database, 
  Play, 
  RotateCcw, 
  CheckCircle, 
  AlertTriangle, 
  Info,
  Loader2,
  BarChart3,
  DollarSign,
  FileText
} from 'lucide-react';
import migrationExecutor from '../../services/MigrationExecutor';

const MigrationDashboard = () => {
  const [analysis, setAnalysis] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [progress, setProgress] = useState({ message: '', percentage: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('analysis');

  useEffect(() => {
    // Load initial analysis
    loadAnalysis();
  }, []);

  const loadAnalysis = async () => {
    try {
      setError('');
      const result = await migrationExecutor.analyzeOnly();
      if (result.success) {
        setAnalysis(result);
      } else {
        setError(result.error);
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
      setError('Failed to load migration analysis');
    }
  };

  const runDryRun = async () => {
    try {
      setIsRunning(true);
      setError('');
      setProgress({ message: 'Starting dry run...', percentage: 0 });

      const result = await migrationExecutor.executeDryRun({
        onProgress: setProgress
      });

      setMigrationResult(result);
      setActiveTab('results');
    } catch (error) {
      console.error('Dry run failed:', error);
      setError('Dry run failed: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const runMigration = async () => {
    try {
      setIsRunning(true);
      setError('');
      setProgress({ message: 'Starting migration...', percentage: 0 });

      const result = await migrationExecutor.executeMigration({
        dryRun: false,
        skipExisting: true,
        onProgress: setProgress
      });

      setMigrationResult(result);
      setActiveTab('results');

      // Run validation after successful migration
      if (result.success) {
        const validationResult = await migrationExecutor.validateMigration();
        setValidation(validationResult);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setError('Migration failed: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const runValidation = async () => {
    try {
      setError('');
      const result = await migrationExecutor.validateMigration();
      setValidation(result);
      setActiveTab('validation');
    } catch (error) {
      console.error('Validation failed:', error);
      setError('Validation failed: ' + error.message);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0).replace('MAD', 'MAD');
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'info': return <Info className="h-4 w-4 text-blue-600" />;
      default: return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            Ledger Migration Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Migrate existing financial data to the double-entry ledger system
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={loadAnalysis}
            variant="outline"
            disabled={isRunning}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh Analysis
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Progress Bar */}
      {isRunning && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progress.message}</span>
                <span>{progress.percentage}%</span>
              </div>
              <Progress value={progress.percentage} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'analysis', label: 'Analysis', icon: BarChart3 },
            { id: 'results', label: 'Migration Results', icon: FileText },
            { id: 'validation', label: 'Validation', icon: CheckCircle }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Analysis Tab */}
      {activeTab === 'analysis' && analysis && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Records</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {analysis.summary.totalRecords.toLocaleString()}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(analysis.summary.totalFinancialValue)}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Existing Entries</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {analysis.summary.existingMigration.entriesCount}
                    </p>
                  </div>
                  <Database className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Data Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(analysis.summary.breakdown).map(([key, data]) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      <div>
                        <p className="font-medium capitalize">{key}</p>
                        <p className="text-sm text-gray-600">{data.count} records</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(data.value)}</p>
                      <p className="text-sm text-gray-600">{data.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.summary.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                    {getRecommendationIcon(rec.type)}
                    <p className="text-sm text-gray-700">{rec.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={runDryRun}
              disabled={isRunning || analysis.summary.totalRecords === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Dry Run
            </Button>
            
            <Button
              onClick={runMigration}
              disabled={isRunning || analysis.summary.totalRecords === 0}
              variant="outline"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Run Migration
            </Button>

            <Button
              onClick={runValidation}
              disabled={isRunning}
              variant="outline"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Validate Existing
            </Button>
          </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && migrationResult && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {migrationResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                Migration Results
                {migrationResult.report?.dryRun && (
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">DRY RUN</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {migrationResult.success ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {migrationResult.report.summary.totalRecordsSuccessful}
                      </p>
                      <p className="text-sm text-green-700">Records Migrated</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">
                        {migrationResult.report.summary.totalRecordsFailed}
                      </p>
                      <p className="text-sm text-red-700">Failed</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {migrationResult.report.summary.totalRecordsProcessed}
                      </p>
                      <p className="text-sm text-blue-700">Total Processed</p>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">
                        {formatCurrency(migrationResult.report.summary.totalFinancialAmount)}
                      </p>
                      <p className="text-sm text-purple-700">Total Amount</p>
                    </div>
                  </div>

                  {/* Detailed Results */}
                  <div className="space-y-4">
                    <h4 className="font-semibold">Detailed Results:</h4>
                    {Object.entries(migrationResult.report.details).map(([category, data]) => (
                      <div key={category} className="border border-gray-200 rounded-lg p-4">
                        <h5 className="font-medium capitalize mb-2">{category}</h5>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Processed:</span>
                            <span className="ml-2 font-medium">{data.processed || data.totalProcessed || 0}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Successful:</span>
                            <span className="ml-2 font-medium text-green-600">{data.successful || data.totalSuccessful || 0}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Failed:</span>
                            <span className="ml-2 font-medium text-red-600">{data.failed || data.totalFailed || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Migration Failed</h3>
                  <p className="text-gray-600">{migrationResult.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Validation Tab */}
      {activeTab === 'validation' && validation && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {validation.success && validation.isValid ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                Migration Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {validation.success ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${
                    validation.isValid 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    <p className={`font-medium ${
                      validation.isValid ? 'text-green-800' : 'text-yellow-800'
                    }`}>
                      {validation.isValid 
                        ? '✅ Migration validation passed - all entries are balanced and consistent'
                        : '⚠️ Migration validation found issues that need attention'
                      }
                    </p>
                  </div>

                  {/* Validation Details */}
                  <div className="space-y-3">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Balance Integrity</h4>
                      <p className="text-sm text-gray-600">
                        {validation.validation.balanceIntegrity.isValid 
                          ? '✅ All journal entries are properly balanced'
                          : `❌ ${validation.validation.balanceIntegrity.unbalancedCount} unbalanced entries found`
                        }
                      </p>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Total Amounts</h4>
                      <p className="text-sm text-gray-600">
                        {validation.validation.totalAmounts.isValid 
                          ? '✅ Total amounts match between source and ledger'
                          : '❌ Total amount discrepancies found'
                        }
                      </p>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Duplicates</h4>
                      <p className="text-sm text-gray-600">
                        {validation.validation.duplicates.isValid 
                          ? '✅ No duplicate entries detected'
                          : `❌ ${validation.validation.duplicates.duplicateCount} duplicate entries found`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Validation Failed</h3>
                  <p className="text-gray-600">{validation.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MigrationDashboard;