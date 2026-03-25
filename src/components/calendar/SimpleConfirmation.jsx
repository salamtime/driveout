import React from 'react';
import { CheckCircle, X } from 'lucide-react';

const SimpleConfirmation = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = "YES, DO IT", 
  cancelText = "NO, CANCEL", 
  onConfirm, 
  onCancel,
  type = "default" // "default", "danger", "success"
}) => {
  if (!isOpen) return null;

  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          confirmBg: 'bg-red-500 hover:bg-red-600 active:bg-red-700',
          cancelBg: 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600',
          titleColor: 'text-red-900',
          messageColor: 'text-red-800'
        };
      case 'success':
        return {
          confirmBg: 'bg-green-500 hover:bg-green-600 active:bg-green-700',
          cancelBg: 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600',
          titleColor: 'text-green-900',
          messageColor: 'text-green-800'
        };
      default:
        return {
          confirmBg: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700',
          cancelBg: 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600',
          titleColor: 'text-blue-900',
          messageColor: 'text-blue-800'
        };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl border-4 border-gray-200 max-w-md w-full mx-4">
        {/* Header */}
        <div className="p-8 text-center">
          <div className="mb-6">
            {type === 'danger' && (
              <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
            )}
            {type === 'success' && (
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            )}
            {type === 'default' && (
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">❓</span>
              </div>
            )}
          </div>
          
          <h2 className={`text-3xl font-black mb-4 ${colors.titleColor}`}>
            {title}
          </h2>
          
          <p className={`text-xl font-semibold ${colors.messageColor}`}>
            {message}
          </p>
        </div>

        {/* Action Buttons - GIANT */}
        <div className="p-6 space-y-4">
          <button
            onClick={onConfirm}
            className={`w-full ${colors.confirmBg} text-white py-6 px-8 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95`}
            style={{ minHeight: '80px' }}
          >
            <div className="text-2xl font-black">
              {confirmText}
            </div>
          </button>
          
          <button
            onClick={onCancel}
            className={`w-full ${colors.cancelBg} text-white py-6 px-8 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95`}
            style={{ minHeight: '80px' }}
          >
            <div className="text-2xl font-black">
              {cancelText}
            </div>
          </button>
        </div>

        {/* Helpful Text */}
        <div className="p-4 bg-gray-50 rounded-b-3xl text-center">
          <p className="text-lg font-bold text-gray-600">
            👆 Tap your choice above
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimpleConfirmation;