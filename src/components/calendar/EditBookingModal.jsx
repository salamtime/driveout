import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Users, MapPin, Clock } from 'lucide-react';
import i18n from '../../i18n';

const EditBookingModal = ({ booking, isOpen, onClose, onSave }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
              ✏️ {tr('EDIT BOOKING', 'MODIFIER LA RÉSERVATION')}
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
              👤 {tr('CUSTOMER NAME', 'NOM DU CLIENT')}
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleInputChange('customerName', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-green-300 rounded-2xl focus:border-green-500 focus:outline-none"
              style={{ minHeight: '60px' }}
              placeholder={tr('Enter customer name...', 'Entrez le nom du client...')}
            />
          </div>

          {/* Tour Type */}
          <div className="bg-blue-50 p-4 rounded-2xl">
            <label className="block text-lg font-bold text-blue-800 mb-3">
              🏍️ {tr('TOUR TYPE', 'TYPE DE TOUR')}
            </label>
            <select
              value={formData.tourName}
              onChange={(e) => handleInputChange('tourName', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-blue-300 rounded-2xl focus:border-blue-500 focus:outline-none"
              style={{ minHeight: '60px' }}
            >
              <option value="Desert Adventure">{tr('Desert Adventure', 'Aventure désert')}</option>
              <option value="Mountain Trail">{tr('Mountain Trail', 'Sentier montagne')}</option>
              <option value="Beach Explorer">{tr('Beach Explorer', 'Exploration plage')}</option>
              <option value="City Tour">{tr('City Tour', 'Tour de ville')}</option>
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-purple-50 p-4 rounded-2xl">
              <label className="block text-lg font-bold text-purple-800 mb-3">
                📅 {tr('DATE', 'DATE')}
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
                🕒 {tr('TIME', 'HEURE')}
              </label>
              <select
                value={formData.selectedTime}
                onChange={(e) => handleInputChange('selectedTime', e.target.value)}
                className="w-full p-4 text-xl font-semibold border-2 border-orange-300 rounded-2xl focus:border-orange-500 focus:outline-none"
                style={{ minHeight: '60px' }}
              >
                <option value="09:00">{tr('09:00 AM', '09:00')}</option>
                <option value="11:00">{tr('11:00 AM', '11:00')}</option>
                <option value="14:00">{tr('02:00 PM', '14:00')}</option>
                <option value="16:00">{tr('04:00 PM', '16:00')}</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="bg-yellow-50 p-4 rounded-2xl">
            <label className="block text-lg font-bold text-yellow-800 mb-3">
              🏷️ {tr('STATUS', 'STATUT')}
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full p-4 text-xl font-semibold border-2 border-yellow-300 rounded-2xl focus:border-yellow-500 focus:outline-none"
              style={{ minHeight: '60px' }}
            >
              <option value="confirmed">✅ {tr('CONFIRMED', 'CONFIRMÉ')}</option>
              <option value="pending">⏳ {tr('PENDING', 'EN ATTENTE')}</option>
              <option value="on_tour">🚀 {tr('ON TOUR', 'EN TOUR')}</option>
              <option value="completed">🏁 {tr('COMPLETED', 'TERMINÉ')}</option>
              <option value="cancelled">❌ {tr('CANCELLED', 'ANNULÉ')}</option>
            </select>
          </div>

          {/* Participant Details */}
          {formData.participants.length > 0 && (
            <div className="bg-pink-50 p-4 rounded-2xl">
              <label className="block text-lg font-bold text-pink-800 mb-3">
                👥 {tr('PARTICIPANT DETAILS', 'DÉTAILS DES PARTICIPANTS')}
              </label>
              <div className="space-y-3">
                {formData.participants.map((participant, index) => (
                  <div key={index} className="bg-white p-3 rounded-xl border-2 border-pink-200">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={participant.name || ''}
                        onChange={(e) => handleParticipantChange(index, 'name', e.target.value)}
                        placeholder={tr('Name', 'Nom')}
                        className="p-3 text-lg font-semibold border border-pink-300 rounded-xl focus:border-pink-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        value={participant.age || ''}
                        onChange={(e) => handleParticipantChange(index, 'age', e.target.value)}
                        placeholder={tr('Age', 'Âge')}
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
            {tr('SAVE CHANGES', 'ENREGISTRER LES MODIFICATIONS')}
          </button>

          <button
            onClick={onClose}
            className="w-full bg-gray-400 hover:bg-gray-500 active:bg-gray-600 text-white py-4 px-8 rounded-2xl transition-all duration-200 shadow-md font-bold text-xl"
            style={{ minHeight: '60px' }}
          >
            {tr('CANCEL', 'ANNULER')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditBookingModal;
