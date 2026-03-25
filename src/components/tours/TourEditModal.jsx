import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { X, Save, Calendar, Clock, Users, DollarSign, MapPin, FileText, Image, Tag, Trash2 } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

const TourEditModal = ({ isOpen, onClose, tour, onSave, onDelete, isSaving }) => {
  const { t } = useTranslation();
  const { user } = useSelector(state => state.auth);
  const permissions = usePermissions();
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    description: '',
    price: '',
    duration: '',
    maxParticipants: '',
    minParticipants: '',
    location: '',
    type: 'city',
    difficulty: 'easy',
    availableTimes: [],
    equipment: [],
    route: '',
    image_url: '',
    active: true
  });
  const [newTime, setNewTime] = useState('');
  const [newEquipment, setNewEquipment] = useState('');
  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (tour) {
      setFormData({
        id: tour.id || null,
        name: tour.name || '',
        description: tour.description || '',
        price: tour.price?.toString() || '',
        duration: tour.duration || '',
        maxParticipants: tour.maxParticipants?.toString() || '',
        minParticipants: tour.minParticipants?.toString() || '',
        location: tour.location || '',
        type: tour.type || 'city',
        difficulty: tour.difficulty || 'easy',
        availableTimes: Array.isArray(tour.availableTimes) ? tour.availableTimes : [],
        equipment: Array.isArray(tour.equipment) ? tour.equipment : [],
        route: tour.route || '',
        image_url: tour.image_url || '',
        active: tour.active !== undefined ? tour.active : true
      });
    } else {
      // Reset for new tour
      setFormData({
        id: null,
        name: '',
        description: '',
        price: '',
        duration: '',
        maxParticipants: '',
        minParticipants: '',
        location: '',
        type: 'city',
        difficulty: 'easy',
        availableTimes: [],
        equipment: [],
        route: '',
        image_url: '',
        active: true
      });
    }
    setErrors({});
    setNewTime('');
    setNewEquipment('');
  }, [tour, isOpen]);

  if (!isOpen) return null;

  const isEditMode = !!tour?.id;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user types in field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const addTime = () => {
    if (newTime && !formData.availableTimes.includes(newTime)) {
      setFormData(prev => ({
        ...prev,
        availableTimes: [...prev.availableTimes, newTime]
      }));
      setNewTime('');
    }
  };

  const removeTime = (timeToRemove) => {
    setFormData(prev => ({
      ...prev,
      availableTimes: prev.availableTimes.filter(time => time !== timeToRemove)
    }));
  };

  const addEquipment = () => {
    if (newEquipment && !formData.equipment.includes(newEquipment)) {
      setFormData(prev => ({
        ...prev,
        equipment: [...prev.equipment, newEquipment]
      }));
      setNewEquipment('');
    }
  };

  const removeEquipment = (equipmentToRemove) => {
    setFormData(prev => ({
      ...prev,
      equipment: prev.equipment.filter(eq => eq !== equipmentToRemove)
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = t('validation.nameRequired', 'Tour name is required');
    }
    
    if (!formData.description.trim()) {
      newErrors.description = t('validation.descriptionRequired', 'Description is required');
    }
    
    if (!formData.price || isNaN(formData.price) || parseFloat(formData.price) <= 0) {
      newErrors.price = t('validation.invalidPrice', 'Please enter a valid price');
    }
    
    if (!formData.duration.trim()) {
      newErrors.duration = t('validation.durationRequired', 'Duration is required');
    }
    
    if (!formData.maxParticipants || isNaN(formData.maxParticipants) || parseInt(formData.maxParticipants) <= 0) {
      newErrors.maxParticipants = t('validation.invalidMaxParticipants', 'Please enter a valid maximum participants number');
    }
    
    if (!formData.minParticipants || isNaN(formData.minParticipants) || parseInt(formData.minParticipants) <= 0) {
      newErrors.minParticipants = t('validation.invalidMinParticipants', 'Please enter a valid minimum participants number');
    }
    
    if (parseInt(formData.minParticipants) > parseInt(formData.maxParticipants)) {
      newErrors.minParticipants = t('validation.minGreaterThanMax', 'Minimum participants cannot be greater than maximum');
    }
    
    if (!formData.location.trim()) {
      newErrors.location = t('validation.locationRequired', 'Location is required');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    // Create submission data with proper data types
    const submissionData = {
      ...formData,
      price: parseFloat(formData.price),
      maxParticipants: parseInt(formData.maxParticipants),
      minParticipants: parseInt(formData.minParticipants)
    };
    
    onSave(submissionData);
  };

  const handleDeleteClick = () => {
    setDeleteError('');
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!tour?.id) return;
    
    setIsDeleting(true);
    setDeleteError('');
    
    try {
      await onDelete(tour.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      setDeleteError(error.message || 'Failed to delete tour');
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = user && (user.role === 'owner' || user.role === 'admin' || permissions.isAdmin || permissions.isOwner);

  const tourTypes = [
    { value: 'city', label: t('tours.types.city', 'City Tour') },
    { value: 'mountain', label: t('tours.types.mountain', 'Mountain Tour') },
    { value: 'desert', label: t('tours.types.desert', 'Desert Tour') },
    { value: 'adventure', label: t('tours.types.adventure', 'Adventure Tour') },
    { value: 'cultural', label: t('tours.types.cultural', 'Cultural Tour') },
    { value: 'custom', label: t('tours.types.custom', 'Custom Tour') }
  ];

  const difficultyLevels = [
    { value: 'easy', label: t('tours.difficulty.easy', 'Easy') },
    { value: 'medium', label: t('tours.difficulty.medium', 'Medium') },
    { value: 'hard', label: t('tours.difficulty.hard', 'Hard') }
  ];

  // Modal visibility class with z-index
  const modalClass = isOpen 
    ? 'fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-50 overflow-y-auto h-full w-full'
    : 'hidden';

  return (
    <div className={modalClass}>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-gray-900">
            {isEditMode 
              ? t('tours.editTour', 'Edit Tour')
              : t('tours.addTour', 'Add New Tour')}
          </h3>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-gray-500 hover:text-gray-700 disabled:text-gray-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Tour Name */}
              <div>
                <label htmlFor="name" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('tours.name', 'Tour Name')}*
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Enter tour name"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('tours.description', 'Description')}*
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.description ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Describe the tour experience"
                />
                {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
              </div>

              {/* Price */}
              <div>
                <label htmlFor="price" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 mr-2" />
                  {t('tours.price', 'Price')}* (USD)
                </label>
                <input
                  type="number"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  min="0"
                  step="0.01"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.price ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
                {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price}</p>}
              </div>

              {/* Duration */}
              <div>
                <label htmlFor="duration" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 mr-2" />
                  {t('tours.duration', 'Duration')}*
                </label>
                <input
                  type="text"
                  id="duration"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.duration ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="e.g., 2 hours, 90 minutes, 1.5 hours"
                />
                {errors.duration && <p className="mt-1 text-sm text-red-600">{errors.duration}</p>}
              </div>

              {/* Location */}
              <div>
                <label htmlFor="location" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 mr-2" />
                  {t('tours.location', 'Location')}*
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.location ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Starting point or main location"
                />
                {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Participants */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minParticipants" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 mr-2" />
                    {t('tours.minParticipants', 'Min Participants')}*
                  </label>
                  <input
                    type="number"
                    id="minParticipants"
                    name="minParticipants"
                    value={formData.minParticipants}
                    onChange={handleInputChange}
                    disabled={isSaving}
                    min="1"
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.minParticipants ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {errors.minParticipants && <p className="mt-1 text-sm text-red-600">{errors.minParticipants}</p>}
                </div>
                
                <div>
                  <label htmlFor="maxParticipants" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 mr-2" />
                    {t('tours.maxParticipants', 'Max Participants')}*
                  </label>
                  <input
                    type="number"
                    id="maxParticipants"
                    name="maxParticipants"
                    value={formData.maxParticipants}
                    onChange={handleInputChange}
                    disabled={isSaving}
                    min="1"
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.maxParticipants ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {errors.maxParticipants && <p className="mt-1 text-sm text-red-600">{errors.maxParticipants}</p>}
                </div>
              </div>

              {/* Type and Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="type" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <Tag className="w-4 h-4 mr-2" />
                    {t('tours.type', 'Tour Type')}
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {tourTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="difficulty" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <Tag className="w-4 h-4 mr-2" />
                    {t('tours.difficulty', 'Difficulty')}
                  </label>
                  <select
                    id="difficulty"
                    name="difficulty"
                    value={formData.difficulty}
                    onChange={handleInputChange}
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {difficultyLevels.map(level => (
                      <option key={level.value} value={level.value}>{level.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label htmlFor="image_url" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <Image className="w-4 h-4 mr-2" />
                  {t('tours.imageUrl', 'Image URL')}
                </label>
                <input
                  type="url"
                  id="image_url"
                  name="image_url"
                  value={formData.image_url}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              {/* Route */}
              <div>
                <label htmlFor="route" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 mr-2" />
                  {t('tours.route', 'Route Description')}
                </label>
                <textarea
                  id="route"
                  name="route"
                  value={formData.route}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the tour route and stops"
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="active"
                  name="active"
                  checked={formData.active}
                  onChange={handleInputChange}
                  disabled={isSaving}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
                  {t('tours.active', 'Tour is active and bookable')}
                </label>
              </div>
            </div>
          </div>

          {/* Available Times */}
          <div className="mt-6">
            <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
              <Clock className="w-4 h-4 mr-2" />
              {t('tours.availableTimes', 'Available Times')}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.availableTimes.map((time, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                >
                  {time}
                  <button
                    type="button"
                    onClick={() => removeTime(time)}
                    disabled={isSaving}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                disabled={isSaving}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addTime}
                disabled={isSaving || !newTime}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                Add Time
              </button>
            </div>
          </div>

          {/* Equipment */}
          <div className="mt-6">
            <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
              <Tag className="w-4 h-4 mr-2" />
              {t('tours.equipment', 'Equipment Provided')}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.equipment.map((item, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeEquipment(item)}
                    disabled={isSaving}
                    className="ml-2 text-green-600 hover:text-green-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value)}
                disabled={isSaving}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Safety gear, Helmets, Water bottles"
              />
              <button
                type="button"
                onClick={addEquipment}
                disabled={isSaving || !newEquipment.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 transition-colors"
              >
                Add Equipment
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex justify-between items-center pt-6 border-t">
            {/* Delete button - only show for existing tours and authorized users */}
            <div>
              {isEditMode && canDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isSaving}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 hover:border-red-400 transition-colors flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Tour
                </button>
              )}
            </div>
            
            {/* Save/Cancel buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isSaving}
                className="px-6 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
                onClick={onClose}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {isEditMode ? t('tours.saving', 'Saving...') : t('tours.creating', 'Creating...')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isEditMode ? t('tours.saveChanges', 'Save Changes') : t('tours.createTour', 'Create Tour')}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1001]">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Delete Tour
            </h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "{tour?.name}"? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TourEditModal;