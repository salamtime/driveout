import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Separator } from '../../components/ui/separator';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Settings, Database, Shield, Bell, Download, FileArchive, Loader2, Package, MapPin, Trash2, Clock3 } from 'lucide-react';
import ProjectArchiver from '../../utils/projectArchiver';
import TourMetadataSettings from '../../components/admin/TourMetadataSettings';
import PublicContentWorkspace from '../../components/admin/PublicContentWorkspace';
import MarketplaceControlWorkspace from '../../components/admin/MarketplaceControlWorkspace';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import RentalMediaRetentionService from '../../services/RentalMediaRetentionService';
import i18n from '../../i18n';

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
  const isFrench = i18n.resolvedLanguage === 'fr';
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [retentionSettings, setRetentionSettings] = useState({
    rentalMediaRetentionEnabled: false,
    rentalMediaRetentionDays: 30,
  });
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionCleanupRunning, setRetentionCleanupRunning] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadRetentionSettings = async () => {
      try {
        const settings = await RentalMediaRetentionService.getSettings();
        if (mounted) {
          setRetentionSettings(settings);
        }
      } catch (err) {
        if (mounted) {
          setError(
            isFrench
              ? `Impossible de charger les parametres de conservation des medias : ${err.message}`
              : `Failed to load media retention settings: ${err.message}`
          );
        }
      } finally {
        if (mounted) {
          setRetentionLoading(false);
        }
      }
    };

    loadRetentionSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleGenerateArchive = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setSuccess(null);
      setProgress(0);

      const archiver = new ProjectArchiver();
      
      archiver.setProgressCallback((progressPercent, processed, total) => {
        setProgress(progressPercent);
      });

      const result = await archiver.generateArchive('project-export');
      setSuccess({
        message: isFrench
          ? `Archive générée avec succès. Téléchargée sous ${result.fileName}`
          : `Archive generated successfully! Downloaded as ${result.fileName}`,
        details: isFrench
          ? `Fichiers : ${result.fileCount}, Taille : ${(result.size / 1024 / 1024).toFixed(2)} Mo`
          : `Files: ${result.fileCount}, Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`
      });

    } catch (err) {
      console.error('Generate archive error:', err);
      setError(
        isFrench
          ? `La generation de l'archive a echoue : ${err.message}`
          : `Archive generation failed: ${err.message}`
      );
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const handleSaveRetentionSettings = async () => {
    try {
      setRetentionSaving(true);
      setError(null);
      setSuccess(null);

      const saved = await RentalMediaRetentionService.saveSettings(retentionSettings);
      setRetentionSettings({
        rentalMediaRetentionEnabled: Boolean(saved?.rentalMediaRetentionEnabled ?? retentionSettings.rentalMediaRetentionEnabled),
        rentalMediaRetentionDays: Math.max(1, Number(saved?.rentalMediaRetentionDays ?? retentionSettings.rentalMediaRetentionDays) || 30),
      });
      setSuccess({
        message: isFrench ? 'Paramètres de conservation des médias enregistrés.' : 'Rental media retention settings saved.',
        details: isFrench ? `Fenêtre de conservation : ${Math.max(1, Number(retentionSettings.rentalMediaRetentionDays) || 30)} jour(s).` : `Retention window: ${Math.max(1, Number(retentionSettings.rentalMediaRetentionDays) || 30)} day(s).`,
      });
    } catch (err) {
      setError(
        isFrench
          ? `Impossible d'enregistrer les parametres de conservation des medias : ${err.message}`
          : `Failed to save media retention settings: ${err.message}`
      );
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleRunRetentionCleanup = async () => {
    try {
      setRetentionCleanupRunning(true);
      setError(null);
      setSuccess(null);

      const result = await RentalMediaRetentionService.cleanupExpiredRentalMedia(
        retentionSettings.rentalMediaRetentionDays
      );

      setSuccess({
        message: isFrench ? 'Nettoyage des médias de location terminé.' : 'Rental media cleanup completed.',
        details: isFrench ? `${result.deletedRows} enregistrement(s) média et ${result.deletedFiles} fichier(s) supprimés.` : `Deleted ${result.deletedRows} media record(s) and ${result.deletedFiles} storage file(s).`,
      });

      if (result.failedFiles?.length) {
        setError(
          isFrench
            ? `Certains fichiers de stockage n'ont pas pu etre supprimes automatiquement (${result.failedFiles.length} lot(s) en echec).`
            : `Some storage files could not be removed automatically (${result.failedFiles.length} bucket batch issue(s)).`
        );
      }
    } catch (err) {
      setError(
        isFrench
          ? `Le nettoyage des medias de location a echoue : ${err.message}`
          : `Rental media cleanup failed: ${err.message}`
      );
    } finally {
      setRetentionCleanupRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Settings className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Paramètres système' : 'System Settings'}
        title={isFrench ? 'Paramètres système' : 'System Settings'}
        description={isFrench ? 'Gérez la configuration du système, les archives, les métadonnées des tours et les outils administratifs depuis un seul endroit.' : 'Manage system configuration, archives, tour metadata, and administrative tools from one place.'}
        className="w-full"
      />

      <div className="container mx-auto py-6 space-y-6">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {isFrench ? 'Général' : 'General'}
          </TabsTrigger>
          <TabsTrigger value="public-content" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {isFrench ? 'Contenu public' : 'Public Content'}
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {isFrench ? 'Marketplace' : 'Marketplace'}
          </TabsTrigger>
          <TabsTrigger value="tour-metadata" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {isFrench ? 'Métadonnées tours' : 'Tour Metadata'}
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            {isFrench ? 'Base de données' : 'Database'}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {isFrench ? 'Sécurité' : 'Security'}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {isFrench ? 'Notifications' : 'Notifications'}
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {isFrench ? 'Paramètres généraux' : 'General Settings'}
              </CardTitle>
              <CardDescription>
                {isFrench ? 'Configurer les préférences générales et le comportement du système' : 'Configure general system preferences and behavior'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="siteName">{isFrench ? 'Nom du site' : 'Site Name'}</Label>
                  <Input
                    id="siteName"
                    placeholder={isFrench ? 'Entrer le nom du site' : 'Enter site name'}
                    defaultValue={isFrench ? 'Système de gestion QuadVenture' : 'QuadVenture Management System'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">{isFrench ? "Email administrateur" : 'Admin Email'}</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder={isFrench ? 'admin@exemple.com' : 'admin@example.com'}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Mode maintenance' : 'Maintenance Mode'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? "Activer le mode maintenance pour restreindre l'accès" : 'Enable maintenance mode to restrict access'}
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5" />
                {isFrench ? 'Conservation des medias de location' : 'Rental Media Retention'}
              </CardTitle>
              <CardDescription>
                {isFrench
                  ? 'Controlez la duree de conservation des photos et videos d inspection avant nettoyage.'
                  : 'Control how long rental inspection photos and videos stay in storage before cleanup.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>{isFrench ? 'Activer la politique de conservation' : 'Enable retention policy'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench
                      ? "Lorsqu'elle est activee, les medias d inspection expires peuvent etre nettoyes selon la fenetre de conservation ci-dessous."
                      : 'When enabled, expired rental inspection media can be cleaned from storage using the retention window below.'}
                  </p>
                </div>
                <Switch
                  checked={retentionSettings.rentalMediaRetentionEnabled}
                  disabled={retentionLoading || retentionSaving}
                  onCheckedChange={(checked) =>
                    setRetentionSettings((prev) => ({
                      ...prev,
                      rentalMediaRetentionEnabled: checked,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rentalMediaRetentionDays">{isFrench ? 'Periode de conservation (jours)' : 'Retention Period (Days)'}</Label>
                <Input
                  id="rentalMediaRetentionDays"
                  type="number"
                  min="1"
                  step="1"
                  value={retentionSettings.rentalMediaRetentionDays}
                  disabled={retentionLoading || retentionSaving}
                  onChange={(e) =>
                    setRetentionSettings((prev) => ({
                      ...prev,
                      rentalMediaRetentionDays: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-40"
                />
                <p className="text-sm text-muted-foreground">
                  {isFrench
                    ? "Cela cible les medias d inspection stockes dans Supabase Storage et supprime aussi les enregistrements correspondants de la table des medias."
                    : 'This targets rental inspection media stored in Supabase Storage and removes the matching media records from the rental media table.'}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={handleSaveRetentionSettings}
                  disabled={retentionLoading || retentionSaving}
                >
                  {retentionSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {isFrench ? 'Enregistrer la conservation' : 'Save Retention Settings'}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleRunRetentionCleanup}
                  disabled={retentionLoading || retentionCleanupRunning}
                >
                  {retentionCleanupRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {isFrench ? 'Lancer le nettoyage' : 'Run Cleanup Now'}
                </Button>
              </div>

              <Alert>
                <AlertDescription>
                  {isFrench ? (
                    <>
                      Enregistrer ce parametre vous donne le controle depuis la plateforme. Le bouton <span className="font-medium">Lancer le nettoyage</span> supprime les fichiers correspondants de Supabase Storage et retire aussi leurs lignes en base. Lorsqu il est active, le nettoyage automatique verifie egalement une fois par jour pendant qu un owner ou un admin utilise la plateforme.
                    </>
                  ) : (
                    <>
                      Saving this setting gives you control from the platform. The <span className="font-medium">Run Cleanup Now</span> button deletes matching files from Supabase Storage and removes their DB rows. When enabled, automatic cleanup now also checks once per day while an owner or admin is actively using the platform.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="public-content" className="space-y-6">
          <PublicContentWorkspace />
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-6">
          <MarketplaceControlWorkspace />
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
                {isFrench ? 'Parametres base de donnees' : 'Database Settings'}
              </CardTitle>
              <CardDescription>
                {isFrench ? 'Configuration et optimisation de la base de donnees' : 'Database configuration and optimization settings'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Sauvegarde automatique' : 'Auto Backup'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Sauvegarder automatiquement la base chaque jour' : 'Automatically backup database daily'}
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Optimisation des requetes' : 'Query Optimization'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Activer l optimisation automatique des requetes' : 'Enable automatic query optimization'}
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <Button variant="outline">
                <Database className="h-4 w-4 mr-2" />
                {isFrench ? 'Tester la connexion' : 'Test Connection'}
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
                {isFrench ? 'Parametres de securite' : 'Security Settings'}
              </CardTitle>
              <CardDescription>
                {isFrench ? 'Configurer la securite et l authentification' : 'Configure security policies and authentication'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Authentification a deux facteurs' : 'Two-Factor Authentication'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Exiger la 2FA pour les comptes admin' : 'Require 2FA for admin accounts'}
                  </p>
                </div>
                <Switch />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Expiration de session' : 'Session Timeout'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Deconnexion automatique apres 30 minutes d inactivite' : 'Auto-logout after 30 minutes of inactivity'}
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="maxLoginAttempts">{isFrench ? 'Nombre maximum de tentatives' : 'Maximum Login Attempts'}</Label>
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
                {isFrench ? 'Parametres de notification' : 'Notification Settings'}
              </CardTitle>
              <CardDescription>
                {isFrench ? 'Configurer les notifications et alertes du systeme' : 'Configure system notifications and alerts'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Notifications email' : 'Email Notifications'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Envoyer des emails pour les evenements importants' : 'Send email notifications for important events'}
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{isFrench ? 'Alertes systeme' : 'System Alerts'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isFrench ? 'Afficher les alertes systeme sur le tableau de bord' : 'Show system status alerts in dashboard'}
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="alertEmail">{isFrench ? 'Adresse email des alertes' : 'Alert Email Address'}</Label>
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
            {isFrench ? 'Archive rapide du projet' : 'Quick Project Archive'}
          </CardTitle>
          <CardDescription>
            {isFrench ? 'Generer et telecharger instantanement une archive complete du projet pour le developpement local' : 'Generate and download a complete project archive instantly for local development'}
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
                  {isFrench ? 'Fermer' : 'Dismiss'}
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
                  {isFrench ? 'Fermer' : 'Dismiss'}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <h4 className="font-medium">{isFrench ? 'Archive complete du projet' : 'Full Project Archive'}</h4>
              <p className="text-sm text-muted-foreground">
                {isFrench ? 'Télécharger le projet complet avec les fichiers source, les configurations et la documentation' : 'Download complete project with all source files, configurations, and documentation'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isFrench ? 'Format : .zip • Inclut : src/, configs, README • Exclut : node_modules, .git, dist' : 'Format: .zip • Includes: src/, configs, README • Excludes: node_modules, .git, dist'}
              </p>
              {isGenerating && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isFrench ? `Génération de l'archive... ${progress}%` : `Generating archive... ${progress}%`}</span>
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
                  {isFrench ? 'Génération...' : 'Generating...'}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {isFrench ? "Générer l'archive" : 'Generate Archive'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default SystemSettings;
