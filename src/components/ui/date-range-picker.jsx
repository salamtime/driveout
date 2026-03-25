import React, { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Calendar } from 'lucide-react';

/**
 * DateRangePicker - Date range selection component
 * 
 * Features:
 * - Start and end date selection
 * - Proper date formatting
 * - Validation and error handling
 * - Responsive design
 */
export const DateRangePicker = ({ 
  startDate, 
  endDate, 
  onDateChange, 
  className = '', 
  placeholder = 'Select date range' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // Handle date change
  const handleDateChange = (field, value) => {
    if (field === 'start') {
      setTempStartDate(value);
    } else {
      setTempEndDate(value);
    }
  };

  // Apply date range
  const applyDateRange = () => {
    if (tempStartDate && tempEndDate && onDateChange) {
      onDateChange({
        startDate: tempStartDate,
        endDate: tempEndDate
      });
    }
    setIsOpen(false);
  };

  // Reset to current values
  const resetDates = () => {
    setTempStartDate(startDate);
    setTempEndDate(endDate);
    setIsOpen(false);
  };

  // Get display text
  const getDisplayText = () => {
    if (!startDate || !endDate) return placeholder;
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    if (!start || !end) return placeholder;
    return `${start} – ${end}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-start text-left font-normal ${className}`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Start Date
              </label>
              <Input
                type="date"
                value={formatDateForInput(tempStartDate)}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                End Date
              </label>
              <Input
                type="date"
                value={formatDateForInput(tempEndDate)}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetDates}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyDateRange}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;