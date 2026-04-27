import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Fuel } from 'lucide-react';
import i18n from '../../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const getFuelSelectionDisplayLabel = (level) => {
  return `${level}/8`;
};

const FuelLevelModal = ({
  isOpen,
  onClose,
  onSave,
  currentLevel = null,
  title = "Fuel Level Reading",
  description = "Select the current fuel level",
  variant = 'standard',
}) => {
  const [selectedLevel, setSelectedLevel] = useState(currentLevel || 8);
  const [isSaving, setIsSaving] = useState(false);
  const isLightVariant = variant === 'light';

  const FUEL_LEVELS = [
    { value: 0, label: tr('Empty', 'Vide'), color: 'bg-red-500' },
    { value: 1, label: '1/8', color: 'bg-orange-500' },
    { value: 2, label: '2/8', color: 'bg-orange-400' },
    { value: 3, label: '3/8', color: 'bg-yellow-500' },
    { value: 4, label: tr('4/8 (Half)', '4/8 (Moitié)'), color: 'bg-yellow-400' },
    { value: 5, label: '5/8', color: 'bg-lime-500' },
    { value: 6, label: '6/8', color: 'bg-green-400' },
    { value: 7, label: '7/8', color: 'bg-green-500' },
    { value: 8, label: tr('Full', 'Plein'), color: 'bg-green-600' }
  ];

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
      return;
    }

    setSelectedLevel(currentLevel ?? 8);
  }, [currentLevel, isOpen]);

  const handleSave = async () => {
    const selectedValue = selectedLevel;
    try {
      setIsSaving(true);
      await onSave(selectedValue);
      onClose();
    } catch (error) {
      console.error('Error saving fuel level:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && isSaving) return;
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={isLightVariant ? "mx-auto w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[28px] border border-violet-100 bg-white p-0 shadow-[0_30px_80px_rgba(76,29,149,0.16)] sm:rounded-[32px]" : "max-w-md"}>
        <DialogHeader className={isLightVariant ? "border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-slate-50 px-5 pb-4 pt-5 text-left" : ""}>
          <DialogTitle className={isLightVariant ? "flex items-center gap-3 text-[1.7rem] font-bold tracking-[-0.04em] text-slate-950" : "flex items-center gap-2"}>
            <span className={isLightVariant ? "rounded-[18px] border border-violet-100 bg-violet-50 p-3 text-violet-700 shadow-sm" : ""}>
              <Fuel className="w-5 h-5" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription className={isLightVariant ? "mt-2 text-sm leading-6 text-slate-500" : ""}>{description}</DialogDescription>
        </DialogHeader>

        <div className={isLightVariant ? "space-y-5 px-5 pb-5 pt-4" : "space-y-4 py-4"}>
          {/* Visual Fuel Gauge */}
          <div className="space-y-2">
            <div className={`mb-2 flex items-center justify-between ${isLightVariant ? 'text-xs font-semibold uppercase tracking-[0.16em] text-slate-500' : 'text-sm text-gray-600'}`}>
              <span>{tr('Empty', 'Vide')}</span>
              <span className={isLightVariant ? 'text-slate-700' : 'font-semibold'}>{tr('Selected:', 'Sélectionné :')} {FUEL_LEVELS[selectedLevel].label}</span>
              <span>{tr('Full', 'Plein')}</span>
            </div>
            
            <div className="grid grid-cols-9 gap-1">
              {FUEL_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setSelectedLevel(level.value)}
                  disabled={isSaving}
                  className={`
                    ${isLightVariant ? 'h-24 rounded-[18px]' : 'h-20 rounded-lg'} transition-all duration-200 border-2
                    ${selectedLevel === level.value 
                      ? `${level.color} ${isLightVariant ? 'border-violet-600 scale-[1.03] shadow-[0_14px_30px_rgba(76,29,149,0.16)]' : 'border-blue-600 scale-105 shadow-lg'}` 
                      : `${level.color} border-gray-300 opacity-50 hover:opacity-75`
                    }
                    ${isSaving ? 'cursor-not-allowed opacity-60' : ''}
                  `}
                  title={level.label}
                >
                  <div className={`${isLightVariant ? 'text-base' : 'text-xs'} font-bold text-white`}>{level.value}</div>
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
          <div className={isLightVariant ? "rounded-[24px] border border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 px-4 py-5 text-center shadow-[0_12px_30px_rgba(76,29,149,0.06)]" : "bg-gray-50 rounded-lg p-4 text-center"}>
            <div className={isLightVariant ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500" : "text-sm text-gray-600 mb-1"}>{tr('Current Selection', 'Sélection actuelle')}</div>
            <div className={isLightVariant ? "mt-3 flex items-center justify-center" : ""}>
              <div className={isLightVariant ? "rounded-[20px] bg-white/80 px-5 py-3 shadow-[0_10px_24px_rgba(76,29,149,0.08)]" : ""}>
                <div className={isLightVariant ? "text-[2.05rem] font-extrabold leading-[0.95] tracking-[-0.045em] text-slate-950" : "text-2xl font-bold text-gray-900"}>{getFuelSelectionDisplayLabel(selectedLevel)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={isLightVariant ? "grid grid-cols-2 gap-3 px-5 pb-5 pt-1" : "flex gap-3 justify-end"}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className={isLightVariant ? "h-14 rounded-[20px] border-slate-200 text-base font-semibold" : ""}
          >
            {tr('Cancel', 'Annuler')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className={isLightVariant ? "h-14 rounded-[20px] bg-violet-700 text-base font-bold text-white shadow-[0_14px_34px_rgba(76,29,149,0.24)] hover:bg-violet-800" : "bg-blue-600 hover:bg-blue-700 text-white"}
          >
            {isSaving ? tr('Saving...', 'Enregistrement...') : tr('Save Fuel Level', 'Enregistrer le niveau de carburant')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FuelLevelModal;
