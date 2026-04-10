import React from 'react';
import { Play, Square, Edit, X, CheckCircle } from 'lucide-react';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const GiantActionButtons = ({ booking, onStart, onFinish, onEdit, onCancel }) => {
  const canStart = booking.status === 'confirmed';
  const isOnTour = booking.status === 'on_tour';
  const isCompleted = booking.status === 'completed';
  const canCancel = ['confirmed', 'pending'].includes(booking.status);

  return (
    <div className="space-y-4">
      {/* Primary Action - MASSIVE Button */}
      {canStart && (
        <button
          onClick={() => onStart && onStart(booking)}
          className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-6 px-8 rounded-3xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          style={{ minHeight: '100px' }}
        >
          <div className="flex items-center justify-center">
            <Play className="h-12 w-12 mr-4" />
            <div className="text-left">
              <div className="text-3xl font-black">{tr('START TOUR', 'DEMARRER LE TOUR')}</div>
              <div className="text-lg font-semibold opacity-90">{tr('▶️ Tap to begin', '▶️ Touchez pour commencer')}</div>
            </div>
          </div>
        </button>
      )}

      {isOnTour && (
        <button
          onClick={() => onFinish && onFinish(booking)}
          className="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-6 px-8 rounded-3xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          style={{ minHeight: '100px' }}
        >
          <div className="flex items-center justify-center">
            <Square className="h-12 w-12 mr-4" />
            <div className="text-left">
              <div className="text-3xl font-black">{tr('FINISH TOUR', 'TERMINER LE TOUR')}</div>
              <div className="text-lg font-semibold opacity-90">{tr('⏹ Tap to complete', '⏹ Touchez pour terminer')}</div>
            </div>
          </div>
        </button>
      )}

      {isCompleted && (
        <div className="w-full bg-gray-200 text-gray-600 py-6 px-8 rounded-3xl"
             style={{ minHeight: '100px' }}>
          <div className="flex items-center justify-center">
            <CheckCircle className="h-12 w-12 mr-4" />
            <div className="text-left">
              <div className="text-3xl font-black">{tr('TOUR COMPLETED', 'TOUR TERMINE')}</div>
              <div className="text-lg font-semibold opacity-90">{tr('✅ All done!', '✅ Tout est termine !')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Actions - Still BIG but smaller */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!isCompleted && (
          <button
            onClick={() => onEdit && onEdit(booking)}
            className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white py-4 px-6 rounded-2xl transition-all duration-200 shadow-md hover:shadow-lg"
            style={{ minHeight: '80px' }}
          >
            <div className="flex items-center justify-center">
              <Edit className="h-8 w-8 mr-3" />
              <div className="text-left">
                <div className="text-xl font-bold">{tr('EDIT', 'MODIFIER')}</div>
                <div className="text-sm font-semibold opacity-90">{tr('✏️ Make changes', '✏️ Modifier la reservation')}</div>
              </div>
            </div>
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => onCancel && onCancel(booking)}
            className="bg-gray-400 hover:bg-red-500 active:bg-red-600 text-white py-4 px-6 rounded-2xl transition-all duration-200 shadow-md hover:shadow-lg"
            style={{ minHeight: '80px' }}
          >
            <div className="flex items-center justify-center">
              <X className="h-8 w-8 mr-3" />
              <div className="text-left">
                <div className="text-xl font-bold">{tr('CANCEL', 'ANNULER')}</div>
                <div className="text-sm font-semibold opacity-90">{tr('❌ Remove booking', '❌ Supprimer la reservation')}</div>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Helpful Instructions */}
      <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-2xl text-center">
        <div className="text-lg font-bold text-blue-900 mb-2">
          💡 {tr('QUICK TIPS', 'CONSEILS RAPIDES')}
        </div>
        <div className="text-base font-semibold text-blue-800">
          {canStart && tr('👆 Tap the green button to start the tour', '👆 Touchez le bouton vert pour demarrer le tour')}
          {isOnTour && tr('👆 Tap the red button when tour is finished', '👆 Touchez le bouton rouge quand le tour est termine')}
          {isCompleted && tr('✅ This tour is all done! Great job!', '✅ Ce tour est termine. Bon travail !')}
        </div>
      </div>
    </div>
  );
};

export default GiantActionButtons;
