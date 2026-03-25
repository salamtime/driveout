import React from 'react';
import { FileUp } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

/**
 * ExportPage - Data export and project management
 */
const ExportPage = () => {
  return (
    <div className="p-4 lg:p-6">
      <AdminModuleHero
        icon={<FileUp className="h-8 w-8 text-white" />}
        eyebrow="Project Export"
        title="Project Export"
        description="Export data, reports, and project information from one dedicated admin module."
      />

      <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📤</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Export Module</h2>
          <p className="text-gray-600 mb-6">
            Comprehensive data export system with multiple formats and scheduling options.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExportPage;
