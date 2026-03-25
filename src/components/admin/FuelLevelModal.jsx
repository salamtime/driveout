import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Fuel, AlertCircle } from 'lucide-react';

const FuelLevelModal = ({ isOpen, onClose, onSave, currentLevel = null, title = "Fuel Level Reading", description = "Select the current fuel level" }) => {
  const [selectedLevel, setSelectedLevel] = useState(currentLevel || 8);
  const [saving, setSaving] = useState(false);

  const FUEL_LEVELS = [
    { value: 0, label: 'Empty', color: 'bg-red-500' },
    { value: 1, label: '1/8', color: 'bg-orange-500' },
    { value: 2, label: '2/8', color: 'bg-orange-400' },
    { value: 3, label: '3/8', color: 'bg-yellow-500' },
    { value: 4, label: '4/8 (Half)', color: 'bg-yellow-400' },
    { value: 5, label: '5/8', color: 'bg-lime-500' },
    { value: 6, label: '6/8', color: 'bg-green-400' },
    { value: 7, label: '7/8', color: 'bg-green-500' },
    { value: 8, label: 'Full', color: 'bg-green-600' }
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedLevel);
      onClose();
    } catch (error) {
      console.error('Error saving fuel level:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Tap on a fuel level to select it. The gauge shows 8 levels from empty (0) to full (8).
            </AlertDescription>
          </Alert>

          {/* Visual Fuel Gauge */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Empty</span>
              <span className="font-semibold">Selected: {FUEL_LEVELS[selectedLevel].label}</span>
              <span>Full</span>
            </div>
            
            <div className="grid grid-cols-9 gap-1">
              {FUEL_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setSelectedLevel(level.value)}
                  className={`
                    h-20 rounded-lg transition-all duration-200 border-2
                    ${selectedLevel === level.value 
                      ? `${level.color} border-blue-600 scale-105 shadow-lg` 
                      : `${level.color} border-gray-300 opacity-50 hover:opacity-75`
                    }
                  `}
                  title={level.label}
                >
                  <div className="text-white font-bold text-xs">{level.value}</div>
                </button>
              ))}
            </div>

            {/* Level Labels */}
            <div className="grid grid-cols-9 gap-1 text-xs text-center text-gray-600">
              {FUEL_LEVELS.map((level) => (
                <div key={level.value} className="truncate">
                  {level.value === 0 ? 'E' : level.value === 8 ? 'F' : level.value}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Level Display */}
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Current Selection</div>
            <div className="text-2xl font-bold text-gray-900">{FUEL_LEVELS[selectedLevel].label}</div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? 'Saving...' : 'Save Fuel Level'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FuelLevelModal;
