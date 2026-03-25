import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, subDays, subMonths } from 'date-fns';

const DateRangeFilter = ({ onDateRangeChange, startDate, endDate }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  
  const handlePresetSelect = (preset) => {
    const endDate = new Date().toISOString();
    let startDate;
    
    switch (preset) {
      case 'today':
        startDate = new Date().toISOString();
        break;
      case 'yesterday':
        startDate = subDays(new Date(), 1).toISOString();
        break;
      case 'last7Days':
        startDate = subDays(new Date(), 7).toISOString();
        break;
      case 'last30Days':
        startDate = subDays(new Date(), 30).toISOString();
        break;
      case 'lastMonth':
        startDate = subMonths(new Date(), 1).toISOString();
        break;
      case 'last3Months':
        startDate = subMonths(new Date(), 3).toISOString();
        break;
      case 'last6Months':
        startDate = subMonths(new Date(), 6).toISOString();
        break;
      default:
        startDate = subDays(new Date(), 30).toISOString();
    }
    
    onDateRangeChange({ startDate, endDate });
    setIsOpen(false);
  };
  
  const formatDisplayDate = () => {
    const start = format(parseISO(startDate), 'MMM d, yyyy');
    const end = format(parseISO(endDate), 'MMM d, yyyy');
    return `${start} - ${end}`;
  };
  
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="hidden sm:inline">{formatDisplayDate()}</span>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 py-2 w-48 bg-white rounded-md shadow-lg z-20">
          <div className="py-1">
            <button
              onClick={() => handlePresetSelect('today')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.today')}
            </button>
            <button
              onClick={() => handlePresetSelect('yesterday')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.yesterday')}
            </button>
            <button
              onClick={() => handlePresetSelect('last7Days')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.last7Days')}
            </button>
            <button
              onClick={() => handlePresetSelect('last30Days')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.last30Days')}
            </button>
            <button
              onClick={() => handlePresetSelect('lastMonth')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.lastMonth')}
            </button>
            <button
              onClick={() => handlePresetSelect('last3Months')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.last3Months')}
            </button>
            <button
              onClick={() => handlePresetSelect('last6Months')}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {t('admin.dashboard.filters.last6Months')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;