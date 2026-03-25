import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Separator } from '../../components/ui/separator';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Settings, Database, Shield, Bell, Download, FileArchive, Loader2, Package, MapPin } from 'lucide-react';
import ProjectArchiver from '../../utils/projectArchiver';
import TourPackagesSettings from '../../components/admin/TourPackagesSettings';
import TourMetadataSettings from '../../components/admin/TourMetadataSettings';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

// Custom tabs implementation since ui/tabs component doesn't exist
const Tabs = ({ defaultValue, className, children }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);
  
  // Pass down the active tab state to all children
  return (
    <div className={className}>
      {React.Children.map(children, child => 
        React.cloneElement(child, { activeTab, setActiveTab })
      )}
    </div>
  );
};

const TabsList = ({ className, children, activeTab, setActiveTab }) => {
  return (
    <div className={`flex space-x-1 bg-gray-100 p-1 rounded-lg ${className}`}>
      {React.Children.map(children, child => 
        React.cloneElement(child, { activeTab, setActiveTab })
      )}
    </div>
  );
};

const TabsTrigger = ({ value, className, children, activeTab, setActiveTab }) => (
  <button
    onClick={() => setActiveTab && setActiveTab(value)}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      activeTab === value
        ? 'bg-white text-gray-900 shadow-sm'
        : 'text-gray-600 hover:text-gray-900'
    } ${className}`}
  >
    {children}
  </button>
);

const TabsContent = ({ value, className, children, activeTab }) => {
  if (activeTab !== value) return null;
  return <div className={className}>{children}</div>;
};

const SystemSettings = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleGenerateArchive = async () => {
    try {
      console.log('Generate Archive button clicked - starting process...');
      
      setIsGenerating(true);
      setError(null);
      setSuccess(null);
      setProgress(0);

      console.log('Creating ProjectArchiver instance...');
      const archiver = new ProjectArchiver();
      
      console.log('Setting progress callback...');
      // Set progress callback
      archiver.setProgressCallback((progressPercent, processed, total) => {
        console.log(`Progress: ${progressPercent}% (${processed}/${total})`);
        setProgress(progressPercent);
      });

      console.log('Starting archive generation...');
      const result = await archiver.generateArchive('project-export');
      
      console.log('Archive generation completed:', result);
      
      setSuccess({
        message: `Archive generated successfully! Downloaded as ${result.fileName}`,
        details: `Files: ${result.fileCount}, Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`
      });

    } catch (err) {
      console.error('Generate archive error:', err);
      setError(`Archive generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <AdminModuleHero
        icon={<Settings className="h-8 w-8 text-white" />}
        eyebrow="System Settings"
        title="System Settings"
        description="Manage system configuration, archives, tour metadata, and administrative tools from one place."
      />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="tour-packages" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Tour Packages
          </TabsTrigger>
          <TabsTrigger value="tour-metadata" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Tour Metadata
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Configure general system preferences and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    placeholder="Enter site name"
                    defaultValue="QuadVenture Management System"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable maintenance mode to restrict access
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tour Packages Settings Tab */}
        <TabsContent value="tour-packages" className="space-y-6">
          <TourPackagesSettings />
        </TabsContent>

        {/* Tour Metadata Settings Tab */}
        <TabsContent value="tour-metadata" className="space-y-6">
          <TourMetadataSettings />
        </TabsContent>

        {/* Database Settings Tab */}
        <TabsContent value="database" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Settings
              </CardTitle>
              <CardDescription>
                Database configuration and optimization settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Backup</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically backup database daily
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Query Optimization</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable automatic query optimization
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Button variant="outline">
                <Database className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security policies and authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">
                    Require 2FA for admin accounts
                  </p>
                </div>
                <Switch />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Session Timeout</Label>
                  <p className="text-sm text-muted-foreground">
                    Auto-logout after 30 minutes of inactivity
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="maxLoginAttempts">Maximum Login Attempts</Label>
                <Input
                  id="maxLoginAttempts"
                  type="number"
                  placeholder="5"
                  defaultValue="5"
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure system notifications and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email notifications for important events
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>System Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Show system status alerts in dashboard
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="alertEmail">Alert Email Address</Label>
                <Input
                  id="alertEmail"
                  type="email"
                  placeholder="alerts@example.com"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Quick Project Archive */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Quick Project Archive
          </CardTitle>
          <CardDescription>
            Generate and download a complete project archive instantly for local development
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setError(null)}
                  className="ml-2 p-0 h-auto"
                >
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {success && (
            <Alert>
              <AlertDescription>
                <div>
                  <p className="font-medium text-green-700">{success.message}</p>
                  <p className="text-sm text-green-600 mt-1">{success.details}</p>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setSuccess(null)}
                  className="ml-2 p-0 h-auto"
                >
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <h4 className="font-medium">Full Project Archive</h4>
              <p className="text-sm text-muted-foreground">
                Download complete project with all source files, configurations, and documentation
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Format: .zip • Includes: src/, configs, README • Excludes: node_modules, .git, dist
              </p>
              {isGenerating && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating archive... {progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={handleGenerateArchive}
              disabled={isGenerating}
              className="min-w-[140px] ml-4"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Archive
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemSettings;
