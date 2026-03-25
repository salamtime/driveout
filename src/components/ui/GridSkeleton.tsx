import React from 'react';

const GridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="bg-gray-200 rounded-lg h-48 w-full"></div>
          <div className="mt-2 space-y-2">
            <div className="bg-gray-200 rounded h-4 w-3/4"></div>
            <div className="bg-gray-200 rounded h-4 w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GridSkeleton;