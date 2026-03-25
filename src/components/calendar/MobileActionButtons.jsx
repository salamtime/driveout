import React from 'react';
import { Play, Square, Edit, X, CheckCircle } from 'lucide-react';

const MobileActionButtons = ({ booking, onStart, onFinish, onEdit, onCancel }) => {
  const canStart = booking.status === 'confirmed';
  const isOnTour = booking.status === 'on_tour';
  const isCompleted = booking.status === 'completed';
  const canCancel = ['confirmed', 'pending'].includes(booking.status);

  return (
    <div className="space-y-3">
      {/* Primary Actions */}
      <div className="grid grid-cols-2 gap-3">
        {canStart && (
          <button
            onClick={() => onStart && onStart(booking)}
            className="flex items-center justify-center py-4 px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 transition-colors font-semibold shadow-sm"
            style={{ minHeight: '60px' }}
          >
            <Play className="h-5 w-5 mr-2" />
            Start Tour
          </button>
        )}

        {isOnTour && (
          <button
            onClick={() => onFinish && onFinish(booking)}
            className="flex items-center justify-center py-4 px-4 bg-red-600 text-white rounded-xl hover:bg-red-700 active:bg-red-800 transition-colors font-semibold shadow-sm"
            style={{ minHeight: '60px' }}
          >
            <Square className="h-5 w-5 mr-2" />
            Finish Tour
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center justify-center py-4 px-4 bg-gray-100 text-gray-600 rounded-xl font-semibold col-span-2">
            <CheckCircle className="h-5 w-5 mr-2" />
            Tour Completed
          </div>
        )}

        {/* Edit Button - Always Available */}
        {!isCompleted && (
          <button
            onClick={() => onEdit && onEdit(booking)}
            className="flex items-center justify-center py-4 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors font-semibold shadow-sm"
            style={{ minHeight: '60px' }}
          >
            <Edit className="h-5 w-5 mr-2" />
            Edit
          </button>
        )}
      </div>

      {/* Secondary Actions */}
      <div className="grid grid-cols-1 gap-3">
        {canCancel && (
          <button
            onClick={() => onCancel && onCancel(booking)}
            className="flex items-center justify-center py-3 px-4 bg-gray-100 text-red-600 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors font-medium border border-red-200"
            style={{ minHeight: '50px' }}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel Booking
          </button>
        )}
      </div>

      {/* Quick Action Info */}
      <div className="text-center text-xs text-gray-500 pt-2">
        <p>💡 Tip: Swipe right to start • Swipe left to cancel</p>
      </div>
    </div>
  );
};

export default MobileActionButtons;