import React from 'react';
import CardSkeleton from './CardSkeleton';

const GridSkeleton = ({ 
  count = 6, 
  columns = 3,
  showImage = true,
  showActions = true,
  className = "" 
}) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  };

  return (
    <div className={`grid ${gridCols[columns] || gridCols[3]} gap-6 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton
          key={index}
          showImage={showImage}
          showActions={showActions}
        />
      ))}
    </div>
  );
};

export default GridSkeleton;