import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const RentalTypeStep = ({ bookingData, updateBookingData, onNext }) => {
  const { t } = useTranslation();
  const [errors, setErrors] = useState({});
  
  // Rental type options
  const rentalTypes = [
    { id: 'hourly', label: t('rental.rentalTypes.hourly'), minDuration: 1, maxDuration: 8 },
    { id: 'daily', label: t('rental.rentalTypes.daily'), minDuration: 1, maxDuration: 14 },
    { id: 'weekly', label: t('rental.rentalTypes.weekly'), minDuration: 1, maxDuration: 4 },
    { id: 'monthly', label: t('rental.rentalTypes.monthly'), minDuration: 1, maxDuration: 3 }
  ];
  
  const [localData, setLocalData] = useState({
    rentalType: bookingData.rentalType || 'hourly',
    duration: bookingData.duration || 1
  });

  // Update duration limits when rental type changes
  useEffect(() => {
    const selectedType = rentalTypes.find(type => type.id === localData.rentalType);
    if (selectedType && (localData.duration < selectedType.minDuration || localData.duration > selectedType.maxDuration)) {
      setLocalData(prev => ({
        ...prev,
        duration: Math.max(selectedType.minDuration, Math.min(prev.duration, selectedType.maxDuration))
      }));
    }
  }, [localData.rentalType, rentalTypes]);
  
  const handleRentalTypeChange = (type) => {
    setLocalData(prev => ({ ...prev, rentalType: type }));
    setErrors({});
  };
  
  const handleDurationChange = (e) => {
    const value = parseInt(e.target.value, 10);
    const selectedType = rentalTypes.find(type => type.id === localData.rentalType);
    
    if (isNaN(value) || value < selectedType.minDuration) {
      setLocalData(prev => ({ ...prev, duration: selectedType.minDuration }));
    } else if (value > selectedType.maxDuration) {
      setLocalData(prev => ({ ...prev, duration: selectedType.maxDuration }));
    } else {
      setLocalData(prev => ({ ...prev, duration: value }));
    }
    
    setErrors({});
  };
  
  const handleSubmit = () => {
    // Make sure we have valid data
    if (!localData.rentalType || !localData.duration) {
      setErrors({
        general: 'Please select a rental type and duration'
      });
      return;
    }
    
    // Update parent component state
    updateBookingData(localData);
    
    // Move to next step
    onNext();
  };
  
  const getDurationLabel = () => {
    switch (localData.rentalType) {
      case 'hourly': return t('rental.duration.hours');
      case 'daily': return t('rental.duration.days');
      case 'weekly': return t('rental.duration.weeks');
      case 'monthly': return t('rental.duration.months');
      default: return '';
    }
  };
  
  const getSelectedTypeInfo = () => {
    return rentalTypes.find(type => type.id === localData.rentalType);
  };
  
  return (
    <div className="rental-type-step">
      <h2 className="text-2xl font-semibold mb-6">{t('rental.steps.rentalType')}</h2>
      
      {errors.general && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {errors.general}
        </div>
      )}
      
      <div className="mb-6">
        <label className="block text-gray-700 font-medium mb-2">
          {t('rental.rentalTypes.hourly')}
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {rentalTypes.map(type => (
            <button
              key={type.id}
              type="button"
              className={`
                p-4 border rounded-lg text-center transition-all
                ${localData.rentalType === type.id 
                  ? 'bg-blue-500 text-white border-blue-500' 
                  : 'bg-white border-gray-300 hover:border-blue-300'}
              `}
              onClick={() => handleRentalTypeChange(type.id)}
            >
              <div className="text-lg font-medium">{type.label}</div>
            </button>
          ))}
        </div>
      </div>
      
      <div className="mb-8">
        <label className="block text-gray-700 font-medium mb-2" htmlFor="duration">
          {t('rental.duration.label')}
        </label>
        <div className="flex items-center">
          <input
            id="duration"
            type="number"
            min={getSelectedTypeInfo()?.minDuration || 1}
            max={getSelectedTypeInfo()?.maxDuration || 10}
            value={localData.duration}
            onChange={handleDurationChange}
            className="w-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <span className="ml-3 text-gray-700">{getDurationLabel()}</span>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
        >
          {t('rental.buttons.next')}
        </button>
      </div>
    </div>
  );
};

export default RentalTypeStep;