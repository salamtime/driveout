import React from 'react';

const CardSkeleton = ({ 
  showImage = true, 
  showActions = true, 
  className = "",
  rows = 3 
}) => {
  return (
    <div className={`animate-pulse bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden ${className}`}>
      {showImage && (
        <div className="h-48 bg-gray-200"></div>
      )}
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="h-6 bg-gray-200 rounded w-3/4"></div>
          {showActions && (
            <div className="flex gap-1">
              <div className="w-6 h-6 bg-gray-200 rounded"></div>
              <div className="w-6 h-6 bg-gray-200 rounded"></div>
              <div className="w-6 h-6 bg-gray-200 rounded"></div>
            </div>
          )}
        </div>
        
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={`h-4 bg-gray-200 rounded mb-2 ${
            index === rows - 1 ? 'w-2/3' : 'w-full'
          }`}></div>
        ))}
        
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
};

export default CardSkeleton;