import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Users, MapPin, Clock } from 'lucide-react';

const EditBookingModal = ({ booking, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    customerName: '',
    selectedDate: '',
    selectedTime: '',
    tourName: '',
    participants: [],
    status: ''
  });

  useEffect(() => {
    if (booking) {
      setFormData({
        customerName: booking.participants?.[0]?.name || '',
        selectedDate: booking.selectedDate || '',
        selectedTime: booking.selectedTime || '',
        tourName: booking.tourName || '',
        participants: booking.participants || [],
        status: booking.status || 'confirmed'
      });
    }
  }, [booking]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleParticipantChange = (index, field, value) => {
    const updatedParticipants = [...formData.participants];
    updatedParticipants[index] = {
      ...updatedParticipants[index],
      [field]: value
    };
    setFormData(prev => ({
      ...prev,
      participants: updatedParticipants
    }));
  };

  const handleSave = () => {
    const updatedBooking = {
      ...booking,
      participants: [{
        ...formData.participants[0],
        name: formData.customerName
      }],
      selectedDate: formData.selectedDate,
      selectedTime: formData.selectedTime,
      tourName: formData.tourName,
      status: formData.status
    };
    
    onSave(updatedBooking);
  };

  if (!isOpen || !booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-gray-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-500 text-white p-6 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black">
              ✏️ EDIT BOOKING
            </h2>
            <button
              onClick={onClose}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-2xl p-2 transition-colors"
              style={{ minHeight: '60px', minWidth: '60px' }}
            >
              <X className="h-8 w-8" />
            </button>
          </div>
          <p className="text-xl font-semibold mt-2 opacity-90">
            ID: {booking.id?.substring(0, 8)}...
          </p>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-6">
          {/* Customer Name */}
          <div className="bg-green-50 p-4 rounded-2xl">
            <label className="block text-lg font-bold text-green-800 mb-3">
              👤 CUSTOMER NAME
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleInputChange('customerName', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-green-300 rounded-2xl focus:border-green-500 focus:outline-none"
              style={{ minHeight: '60px' }}
              placeholder="Enter customer name..."
            />
          </div>

          {/* Tour Type */}
          <div className="bg-blue-50 p-4 rounded-2xl">
            <label className="block text-lg font-bold text-blue-800 mb-3">
              🏍️ TOUR TYPE
            </label>
            <select
              value={formData.tourName}
              onChange={(e) => handleInputChange('tourName', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-blue-300 rounded-2xl focus:border-blue-500 focus:outline-none"
              style={{ minHeight: '60px' }}
            >
              <option value="Desert Adventure">Desert Adventure</option>
              <option value="Mountain Trail">Mountain Trail</option>
              <option value="Beach Explorer">Beach Explorer</option>
              <option value="City Tour">City Tour</option>
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-purple-50 p-4 rounded-2xl">
              <label className="block text-lg font-bold text-purple-800 mb-3">
                📅 DATE
              </label>
              <input
                type="date"
                value={formData.selectedDate}
                onChange={(e) => handleInputChange('selectedDate', e.target.value)}
                className="w-full p-4 text-xl font-semibold border-2 border-purple-300 rounded-2xl focus:border-purple-500 focus:outline-none"
                style={{ minHeight: '60px' }}
              />
            </div>

            <div className="bg-orange-50 p-4 rounded-2xl">
              <label className="block text-lg font-bold text-orange-800 mb-3">
                🕒 TIME
              </label>
              <select
                value={formData.selectedTime}
                onChange={(e) => handleInputChange('selectedTime', e.target.value)}
                className="w-full p-4 text-xl font-semibold border-2 border-orange-300 rounded-2xl focus:border-orange-500 focus:outline-none"
                style={{ minHeight: '60px' }}
              >
                <option value="09:00">09:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="14:00">02:00 PM</option>
                <option value="16:00">04:00 PM</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="bg-yellow-50 p-4 rounded-2xl">
            <label className="block text-lg font-bold text-yellow-800 mb-3">
              🏷️ STATUS
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-yellow-300 rounded-2xl focus:border-yellow-500 focus:outline-none"
              style={{ minHeight: '60px' }}
            >
              <option value="confirmed">✅ CONFIRMED</option>
              <option value="pending">⏳ PENDING</option>
              <option value="on_tour">🚀 ON TOUR</option>
              <option value="completed">🏁 COMPLETED</option>
              <option value="cancelled">❌ CANCELLED</option>
            </select>
          </div>

          {/* Participant Details */}
          {formData.participants.length > 0 && (
            <div className="bg-pink-50 p-4 rounded-2xl">
              <label className="block text-lg font-bold text-pink-800 mb-3">
                👥 PARTICIPANT DETAILS
              </label>
              <div className="space-y-3">
                {formData.participants.map((participant, index) => (
                  <div key={index} className="bg-white p-3 rounded-xl border-2 border-pink-200">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={participant.name || ''}
                        onChange={(e) => handleParticipantChange(index, 'name', e.target.value)}
                        placeholder="Name"
                        className="p-3 text-lg font-semibold border border-pink-300 rounded-xl focus:border-pink-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        value={participant.age || ''}
                        onChange={(e) => handleParticipantChange(index, 'age', e.target.value)}
                        placeholder="Age"
                        className="p-3 text-lg font-semibold border border-pink-300 rounded-xl focus:border-pink-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t-2 border-gray-200 space-y-4">
          <button
            onClick={handleSave}
            className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-6 px-8 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl font-black text-2xl"
            style={{ minHeight: '80px' }}
          >
            <Save className="h-8 w-8 mr-3 inline" />
            SAVE CHANGES
          </button>

          <button
            onClick={onClose}
            className="w-full bg-gray-400 hover:bg-gray-500 active:bg-gray-600 text-white py-4 px-8 rounded-2xl transition-all duration-200 shadow-md font-bold text-xl"
            style={{ minHeight: '60px' }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditBookingModal;