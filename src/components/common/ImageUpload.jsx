import React, { useState, useRef, useEffect } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
// Mock storage functions since real implementation is missing
const uploadFile = async (file, path) => {
  console.warn('uploadFile not fully implemented');
  return {
    success: true,
    data: {
      path: path,
      url: URL.createObjectURL(file)
    }
  };
};

const deleteFile = async (path) => {
  console.warn('deleteFile not fully implemented');
  return {
    success: true
  };
};

const getPublicUrl = (path) => {
  if (!path) return null;
  // For now, just return the path
  return path;
};

const ImageUpload = ({ 
  value = null, 
  onChange = () => {}, 
  disabled = false,
  maxSize = 5 * 1024 * 1024, // 5MB
  label = "Upload Image",
  className = "",
  vehicleId = null,
  // Legacy props support
  currentImageUrl = null,
  onImageUpload = null,
  onImageRemove = null,
}) => {
  // Handle legacy props
  const imageUrl = value || currentImageUrl;
  const handleChange = onChange || onImageUpload || (() => {});
  const handleRemove = onImageRemove || (() => handleChange(null));
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(value ? getPublicUrl(value) : null);
  const fileInputRef = useRef(null);
  
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  
  useEffect(() => {
    if (imageUrl) {
      setPreviewUrl(getPublicUrl(imageUrl));
    } else {
      setPreviewUrl(null);
    }
  }, [imageUrl]);
  
  const handleFileChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      
      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error('Invalid file type. Please select a JPG, PNG, WebP, or GIF image.');
        return;
      }
      
      // Validate file size
      if (file.size > maxSize) {
        toast.error(`File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`);
        return;
      }
      
      setIsUploading(true);
      
      // Generate unique path for vehicle image
      const fileName = vehicleId 
        ? `vehicle_${vehicleId}_${Date.now()}.${file.name.split('.').pop()}`
        : `vehicle_${Date.now()}.${file.name.split('.').pop()}`;
      
      // Upload file
      const uploadResult = await uploadFile(file, fileName);
      
      if (!uploadResult.success) {
        toast.error(`Upload failed: ${uploadResult.error?.message || 'Unknown error'}`);
        return;
      }
      
      // Set preview
      setPreviewUrl(uploadResult.data.url);
      
      // Call onChange with the file path
      handleChange(uploadResult.data.path);
      
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleRemoveImage = async () => {
    if (!imageUrl) return;
    
    try {
      setIsUploading(true);
      
      // Delete the file from storage
      const deleteResult = await deleteFile(imageUrl);
      
      if (!deleteResult.success) {
        toast.error(`Failed to remove image: ${deleteResult.error?.message || 'Unknown error'}`);
        return;
      }
      
      // Clear preview and value
      setPreviewUrl(null);
      handleRemove();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      toast.success('Image removed successfully');
    } catch (error) {
      console.error('Image removal error:', error);
      toast.error(`Failed to remove image: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      
      {previewUrl ? (
        <div className="relative w-full h-64 overflow-hidden rounded-md border border-gray-200">
          <img 
            src={previewUrl} 
            alt="Uploaded image" 
            className="w-full h-full object-cover"
          />
          
          {!disabled && (
            <button 
              type="button"
              onClick={handleRemoveImage}
              disabled={isUploading}
              className="absolute top-2 right-2 p-1 bg-red-600 rounded-full text-white hover:bg-red-700 transition-colors"
              aria-label="Remove image"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      ) : (
        <div 
          className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="mt-2 text-sm text-gray-500">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <UploadCloud className="w-8 h-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Click to upload an image</p>
              <p className="text-xs text-gray-400 mt-1">
                JPG, PNG, WebP, GIF up to {maxSize / (1024 * 1024)}MB
              </p>
            </div>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileChange}
            disabled={disabled || isUploading}
          />
        </div>
      )}
    </div>
  );
};

export default ImageUpload;