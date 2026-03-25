import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTours, selectAllTours, selectTourCategories, selectToursLoading } from '../../store/slices/toursSlice';
import tourService from '../../services/TourService';

const TourSelector = ({ selectedTour, onTourSelect, onCustomTour }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const tours = useSelector(selectAllTours) || [];
  const categories = useSelector(selectTourCategories) || [];
  const loading = useSelector(selectToursLoading);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'dropdown'
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');

  useEffect(() => {
    dispatch(fetchTours());
  }, [dispatch]);

  const filteredTours = selectedCategory === 'all' 
    ? (tours || []) 
    : (tours || []).filter(tour => tour.category === selectedCategory);

  const handleTourSelect = (tour) => {
    onTourSelect(tour);
    setSelectedTimeSlot(''); // Reset time slot when tour changes
  };

  const handleTimeSlotSelect = (tour, timeSlot) => {
    setSelectedTimeSlot(timeSlot);
    onTourSelect({
      ...tour,
      selectedTime: timeSlot
    });
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryColor = (category) => {
    const cat = categories.find(c => c.id === category);
    switch (cat?.color) {
      case 'blue': return 'text-blue-600 bg-blue-100';
      case 'green': return 'text-green-600 bg-green-100';
      case 'gray': return 'text-gray-600 bg-gray-100';
      default: return 'text-blue-600 bg-blue-100';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading tours...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          {t('admin.bookings.modal.selectTour')} *
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'cards' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('dropdown')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'dropdown' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium ${
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Tours ({tours.length})
        </button>
        {(categories || []).map(category => {
          const count = tours.filter(t => t.category === category.id).length;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium ${
                selectedCategory === category.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {category.icon} {category.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Tour Selection */}
      {viewMode === 'dropdown' ? (
        // Dropdown View
        <div>
          <select
            value={selectedTour?.id || ''}
            onChange={(e) => {
              const tour = tours.find(t => t.id === e.target.value);
              if (tour) handleTourSelect(tour);
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a tour program...</option>
            {(filteredTours || []).map(tour => (
              <option key={tour.id} value={tour.id}>
                {tour.icon} {tour.name} - {tour.duration}min - ${tour.price}
              </option>
            ))}
          </select>
        </div>
      ) : (
        // Card View
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          {(filteredTours || []).map(tour => (
            <div
              key={tour.id}
              onClick={() => handleTourSelect(tour)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                selectedTour?.id === tour.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{tour.icon}</span>
                  <div>
                    <h4 className="font-semibold text-gray-900">{tour.name}</h4>
                    <p className="text-sm text-gray-600">{tour.duration} minutes</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-600">${tour.price}</div>
                  <div className="text-xs text-gray-500">per person</div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-3">{tour.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(tour.category)}`}>
                  {tour.category}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(tour.difficulty)}`}>
                  {tour.difficulty}
                </span>
                <span className="px-2 py-1 rounded-full text-xs font-medium text-gray-600 bg-gray-100">
                  {tour.minParticipants}-{tour.maxParticipants} people
                </span>
              </div>
              
              {selectedTour?.id === tour.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Available Times:</p>
                  <div className="flex flex-wrap gap-2">
                    {(tour.availableTimes || []).map(time => (
                      <button
                        key={time}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTimeSlotSelect(tour, time);
                        }}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          selectedTimeSlot === time
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Custom Tour Option */}
      <div className="border-t pt-4">
        <button
          onClick={onCustomTour}
          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors flex items-center justify-center space-x-2"
        >
          <span className="text-xl">⚙️</span>
          <span className="font-medium">+ Create Custom Tour</span>
        </button>
      </div>

      {/* Selected Tour Summary */}
      {selectedTour && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Selected Tour:</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Tour:</span> {selectedTour.icon} {selectedTour.name}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {selectedTour.duration} minutes
            </div>
            <div>
              <span className="font-medium">Price:</span> ${selectedTour.price} per person
            </div>
            <div>
              <span className="font-medium">Time:</span> {selectedTour.selectedTime || 'Not selected'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TourSelector;