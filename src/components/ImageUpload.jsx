import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

const ImageUpload = ({ currentImageUrl, onImageUpload, disabled = false, className = '' }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (disabled) return;

    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      // Create a data URL for preview (in real app, you'd upload to storage)
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target.result;
        onImageUpload(imageUrl);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
      setUploading(false);
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    onImageUpload('');
  };

  const openFileDialog = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Current Image Display */}
      {currentImageUrl && (
        <div className="relative inline-block">
          <img
            src={currentImageUrl}
            alt="Vehicle"
            className="w-full max-w-md h-48 object-cover rounded-lg border border-gray-300"
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Upload Area */}
      {!disabled && (
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
          />

          {uploading ? (
            <div className="space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-600">Uploading image...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-center">
                {currentImageUrl ? (
                  <Upload className="w-8 h-8 text-gray-400" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  {currentImageUrl ? 'Replace image' : 'Upload vehicle image'}
                </p>
                <p className="text-xs text-gray-500">
                  Drag and drop or{' '}
                  <button
                    type="button"
                    onClick={openFileDialog}
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    browse files
                  </button>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Supports: JPG, PNG, GIF (max 5MB)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disabled State */}
      {disabled && !currentImageUrl && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No image uploaded</p>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;