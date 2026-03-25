import React from 'react';

const TableSkeleton = ({ 
  columns = 5, 
  rows = 8, 
  showHeader = true,
  className = "" 
}) => {
  return (
    <div className={`animate-pulse bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          {showHeader && (
            <thead className="bg-gray-50">
              <tr>
                {Array.from({ length: columns }).map((_, index) => (
                  <th key={index} className="px-6 py-3">
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                    <div className={`h-4 bg-gray-200 rounded ${
                      colIndex === 0 ? 'w-32' : colIndex === columns - 1 ? 'w-16' : 'w-20'
                    }`}></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableSkeleton;