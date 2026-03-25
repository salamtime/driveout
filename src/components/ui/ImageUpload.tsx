import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';

interface ImageUploadProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  placeholder = "Upload image",
  className = ""
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // Handle file drop logic here
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onChange) {
      // Convert to URL or handle file upload
      const url = URL.createObjectURL(file);
      onChange(url);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {value ? (
          <div className="relative">
            <img src={value} alt="Upload preview" className="max-h-32 mx-auto rounded" />
            <button
              type="button"
              onClick={() => onChange?.('')}
              className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 transform translate-x-2 -translate-y-2"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-sm text-gray-600">{placeholder}</p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;