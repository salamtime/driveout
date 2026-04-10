import React from 'react';
import { FileUp } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';

/**
 * ExportPage - Data export and project management
 */
const ExportPage = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<FileUp className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Export projet' : 'Project Export'}
        title={isFrench ? 'Export projet' : 'Project Export'}
        description={isFrench ? 'Exportez les données, rapports et informations du projet depuis un module dédié.' : 'Export data, reports, and project information from one dedicated admin module.'}
        className="w-full"
      />

      <div className="p-4 lg:p-6">
        <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📤</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{isFrench ? "Module d'export" : 'Export Module'}</h2>
            <p className="text-gray-600 mb-6">
              {isFrench ? "Système complet d'export de données avec plusieurs formats et options de planification." : 'Comprehensive data export system with multiple formats and scheduling options.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPage;
