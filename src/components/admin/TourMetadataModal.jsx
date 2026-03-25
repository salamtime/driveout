import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

/**
 * Modal component for creating or editing tour metadata
 * @param {Object} props - Component props
 * @param {Object} props.initialData - Initial tour metadata data
 * @param {Function} props.onSave - Save handler function
 * @param {Function} props.onCancel - Cancel handler function
 * @param {boolean} props.isEditing - Whether we're editing or creating
 */
const TourMetadataModal = ({ initialData = {}, onSave, onCancel, isEditing = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
  });
  const [errors, setErrors] = useState({});

  // Initialize form with data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        location: initialData.location || '',
      });
    }
  }, [initialData]);

  const handleInputChange = (field, value) => {
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Tour name is required';
    }
    
    if (!formData.location.trim()) {
      newErrors.location = 'Tour location is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium">
          {isEditing ? 'Edit Tour Metadata' : 'Add New Tour Metadata'}
        </h4>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tour Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Mountain Adventure"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Tour Location *</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="e.g., North Ridge"
              className={errors.location ? 'border-red-500' : ''}
            />
            {errors.location && <p className="text-red-500 text-sm">{errors.location}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </form>
    </div>
  );
};

export default TourMetadataModal;