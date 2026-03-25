import React from 'react';
import { useTranslation } from 'react-i18next';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, vehicle, isDeleting }) => {
  const { t } = useTranslation();

  if (!isOpen || !vehicle) return null;

  const modalClass = isOpen 
    ? 'fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-50 overflow-y-auto h-full w-full'
    : 'hidden';

  return (
    <div className={modalClass}>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 my-8">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {t('admin.fleet.deleteVehicleConfirmation')}
            </h3>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="text-gray-500 hover:text-gray-700 disabled:text-gray-400 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="mt-2">
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    {t('admin.fleet.deleteWarningMessage', { name: vehicle.name })}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              {t('admin.fleet.deleteDescription')}
            </p>
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <div className="flex items-center gap-3">
                <img 
                  src={vehicle.image || '/assets/images/atv-placeholder.jpg'} 
                  alt={vehicle.name} 
                  className="w-16 h-16 object-cover rounded-md"
                />
                <div>
                  <h4 className="font-medium text-gray-900">{vehicle.name}</h4>
                  <p className="text-sm text-gray-500">{vehicle.model} • {vehicle.year}</p>
                  <p className="text-xs text-gray-400">ID: {vehicle.id}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={isDeleting}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onConfirm(vehicle.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors"
            >
              {isDeleting ? t('common.deleting') : t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;