import React from 'react';

const FormSkeleton = ({ 
  sections = 3, 
  fieldsPerSection = 4,
  showButtons = true,
  className = "" 
}) => {
  return (
    <div className={`animate-pulse space-y-6 ${className}`}>
      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 bg-gray-200 rounded"></div>
            <div className="h-6 bg-gray-200 rounded w-48"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: fieldsPerSection }).map((_, fieldIndex) => (
              <div key={fieldIndex}>
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-10 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
      
      {showButtons && (
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <div className="h-10 bg-gray-200 rounded w-20"></div>
          <div className="h-10 bg-gray-200 rounded w-32"></div>
        </div>
      )}
    </div>
  );
};

export default FormSkeleton;