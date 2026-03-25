import React from 'react';

// Grid Skeleton Component
export const GridSkeleton = ({ count = 6, columns = 3, showImage = true, showActions = true }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns} gap-6`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          {showImage && (
            <div className="w-full h-48 bg-gray-200 animate-pulse"></div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
              {showActions && (
                <div className="flex gap-1">
                  <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                </div>
              )}
            </div>
            <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Table Skeleton Component
export const TableSkeleton = ({ rows = 5, columns = 7 }) => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-6 py-3">
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
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

// Card Skeleton Component
export const CardSkeleton = ({ showImage = true }) => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {showImage && (
        <div className="w-full h-48 bg-gray-200 animate-pulse"></div>
      )}
      <div className="p-6 space-y-4">
        <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

// List Skeleton Component
export const ListSkeleton = ({ items = 5 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
              </div>
            </div>
            <div className="h-8 bg-gray-200 rounded w-20 animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Form Skeleton Component
export const FormSkeleton = ({ sections = 3, fieldsPerSection = 4 }) => {
  return (
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="bg-gray-50 rounded-lg p-6">
          <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: fieldsPerSection }).map((_, fieldIndex) => (
              <div key={fieldIndex} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse"></div>
                <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-4">
        <div className="h-10 bg-gray-200 rounded w-20 animate-pulse"></div>
        <div className="h-10 bg-gray-200 rounded w-24 animate-pulse"></div>
      </div>
    </div>
  );
};

// Dashboard Skeleton Component - ADDED
export const DashboardSkeleton = ({ widgets = 6 }) => {
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse"></div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: widgets }).map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse"></div>
              <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="space-y-3">
              <div className="h-32 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse mb-4"></div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded w-16 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default {
  GridSkeleton,
  TableSkeleton,
  CardSkeleton,
  ListSkeleton,
  FormSkeleton,
  DashboardSkeleton
};