import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

const MultiSelectDropdown = ({ 
  options = [], 
  selectedValues = [], 
  onChange, 
  placeholder = "Select options...",
  className = "",
  disabled = false,
  label = "",
  error = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (optionValue) => {
    const isSelected = selectedValues.includes(optionValue);
    let newSelection;
    
    if (isSelected) {
      newSelection = selectedValues.filter(value => value !== optionValue);
    } else {
      newSelection = [...selectedValues, optionValue];
    }
    
    onChange(newSelection);
  };

  const handleRemove = (valueToRemove, event) => {
    event.stopPropagation();
    const newSelection = selectedValues.filter(value => value !== valueToRemove);
    onChange(newSelection);
  };

  const getSelectedLabels = () => {
    return selectedValues.map(value => {
      const option = options.find(opt => opt.value === value);
      return option ? option.label : value;
    });
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div
        className={`
          relative w-full min-h-[42px] px-3 py-2 border rounded-lg cursor-pointer
          transition-colors duration-200
          ${disabled 
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed' 
            : isOpen 
              ? 'border-blue-500 ring-2 ring-blue-200' 
              : 'border-gray-300 hover:border-gray-400'
          }
          ${error ? 'border-red-300 ring-2 ring-red-200' : ''}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap gap-1 items-center min-h-[26px]">
          {selectedValues.length > 0 ? (
            getSelectedLabels().map((label, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
              >
                {label}
                {!disabled && (
                  <button
                    onClick={(e) => handleRemove(selectedValues[index], e)}
                    className="ml-1 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-gray-500 text-sm">{placeholder}</span>
          )}
        </div>
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown 
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'transform rotate-180' : ''
            }`} 
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.length > 0 ? (
            options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`
                    px-3 py-2 cursor-pointer transition-colors duration-150
                    hover:bg-gray-50 flex items-center justify-between
                    ${isSelected ? 'bg-blue-50' : ''}
                  `}
                  onClick={() => handleToggle(option.value)}
                >
                  <div className="flex items-center flex-1">
                    <span className={`text-sm ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-900'}`}>
                      {option.label}
                    </span>
                    {option.subtitle && (
                      <span className="text-xs text-gray-500 ml-2">
                        {option.subtitle}
                      </span>
                    )}
                  </div>
                  
                  {isSelected && (
                    <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">
              No options available
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default MultiSelectDropdown;