import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Package, Plus, Edit, Trash2, CheckCircle, XCircle, Loader, X, Save, AlertCircle, Car, Filter, DollarSign, Clock, Calendar, CalendarDays, CalendarRange, Printer } from 'lucide-react';
import KilometerPricingHelpModal from './KilometerPricingHelpModal';
import PackageService from '../services/PackageService';
import { supabase } from '../lib/supabase';

interface RentalPackage {
  id: number;
  name: string;
  description: string;
  vehicle_model_id: string;
  included_kilometers: number | null;
  extra_km_rate: number | null;
  fixed_amount: number | null;
  fuel_charge_enabled?: boolean;
  rate_type_id: number;
  is_active: boolean;
  show_on_print?: boolean;
  showOnPrint?: boolean;
  vehicle_model?: {
    id: string;
    name: string;
    model: string;
    vehicle_type: string;
  };
}

interface RateType {
  id: number;
  name: string;
  is_kilometer_based: boolean;
}

interface VehicleModel {
  id: string;
  name: string;
  model: string;
  vehicle_type: string;
}

interface DamageDepositPreset {
  label: string;
  amount: number;
  enabled: boolean;
  isDefault: boolean;
}

interface PackageFormData {
  name: string;
  description: string;
  vehicle_model_id: string;
  included_kilometers: number | null;
  extra_km_rate: number | null;
  fixed_amount: number | null;
  fuel_charge_enabled: boolean;
  rate_type_id: number;
  is_active: boolean;
  show_on_print: boolean;
}

const HALF_HOUR_SELECTION = 'half_hour';
const HALF_DAY_SELECTION = 'half_day';
const MAX_PRINT_PACKAGES_PER_PAGE = 8;

const detectHalfDayPackage = (pkg?: { name?: string; description?: string } | null) => {
  const combinedText = `${pkg?.name || ''} ${pkg?.description || ''}`.toLowerCase();
  return combinedText.includes('half day') || combinedText.includes('half-day') || combinedText.includes('4 hour');
};

const detectHalfHourPackage = (pkg?: { name?: string; description?: string } | null) => {
  const combinedText = `${pkg?.name || ''} ${pkg?.description || ''}`.toLowerCase();
  return (
    combinedText.includes('half hour') ||
    combinedText.includes('half-hour') ||
    combinedText.includes('30 min') ||
    combinedText.includes('30-minute') ||
    combinedText.includes('30 minute') ||
    combinedText.includes('30 minutes')
  );
};

const getRateTypeIcon = (rateTypeName: string) => {
  switch(rateTypeName?.toLowerCase()) {
    case 'hourly':
      return <Clock className="w-4 h-4" />;
    case 'daily':
      return <Calendar className="w-4 h-4" />;
    case 'weekly':
      return <CalendarDays className="w-4 h-4" />;
    case 'monthly':
      return <CalendarRange className="w-4 h-4" />;
    default:
      return <Calendar className="w-4 h-4" />;
  }
};

const getRateTypeColor = (rateTypeName: string) => {
  switch(rateTypeName?.toLowerCase()) {
    case 'hourly':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'daily':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'weekly':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'monthly':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const parseIntegerInput = (value: string) => {
  const cleaned = String(value || '').replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeLookupKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizeDamageDepositPresets = (presets: unknown) => {
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) return {};

  return Object.fromEntries(
    Object.entries(presets as Record<string, unknown>).map(([vehicleModelId, rawPresets]) => [
      String(vehicleModelId),
      Array.isArray(rawPresets)
        ? rawPresets
            .map((preset: any) => {
              if (!preset || typeof preset !== 'object') return null;
              return {
                label: String(preset.label || '').trim(),
                amount: Number(preset.amount || 0) || 0,
                enabled: Boolean(preset.enabled),
                isDefault: Boolean(preset.isDefault ?? preset.is_default),
              };
            })
            .filter((preset): preset is DamageDepositPreset => Boolean(preset?.label))
        : [],
    ])
  ) as Record<string, DamageDepositPreset[]>;
};

const getDefaultDamageDepositPreset = (presets: DamageDepositPreset[] = []) => {
  const enabledPresets = Array.isArray(presets) ? presets.filter((preset) => preset?.enabled) : [];
  return enabledPresets.find((preset) => preset.isDefault) || enabledPresets[0] || null;
};

const getDamageDepositPresetsForLookup = (
  presetsByKey: Record<string, DamageDepositPreset[]> = {},
  candidates: unknown[] = []
) => {
  for (const candidate of candidates) {
    const directKey = String(candidate || '').trim();
    if (directKey && Array.isArray(presetsByKey[directKey])) {
      return presetsByKey[directKey];
    }
  }

  const normalizedCandidates = candidates.map(normalizeLookupKey).filter(Boolean);
  if (!normalizedCandidates.length) return [];

  for (const [key, presets] of Object.entries(presetsByKey || {})) {
    const normalizedKey = normalizeLookupKey(key);
    if (normalizedCandidates.includes(normalizedKey)) {
      return Array.isArray(presets) ? presets : [];
    }
  }

  return [];
};

const KilometerPricingTab: React.FC = () => {
  const { i18n } = useTranslation();
  const isFrench = i18n.language?.toLowerCase().startsWith('fr');
  const tr = (en: string, fr: string) => (isFrench ? fr : en);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [packages, setPackages] = useState<RentalPackage[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<RentalPackage[]>([]);
  const [rateTypes, setRateTypes] = useState<RateType[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [damageDepositPresetsByModelId, setDamageDepositPresetsByModelId] = useState<Record<string, DamageDepositPreset[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterVehicleModel, setFilterVehicleModel] = useState<string>('');
  const [filterRateType, setFilterRateType] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [printToggleLoading, setPrintToggleLoading] = useState<number | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  
  // Form state
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<RentalPackage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<PackageFormData>({
    name: '',
    description: '',
    vehicle_model_id: '',
    included_kilometers: null,
    extra_km_rate: null,
    fixed_amount: null,
    fuel_charge_enabled: false,
    rate_type_id: 1,
    is_active: true,
    show_on_print: false
  });
  const [packageTypeSelection, setPackageTypeSelection] = useState<string>('1');
  const [isUnlimitedKilometers, setIsUnlimitedKilometers] = useState(false);
  const [fuelLineChargePreview, setFuelLineChargePreview] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = packages;
    
    if (filterVehicleModel) {
      filtered = filtered.filter(pkg => pkg.vehicle_model_id === filterVehicleModel);
    }
    
    if (filterRateType) {
      filtered = filtered.filter(pkg => pkg.rate_type_id === parseInt(filterRateType));
    }
    
    setFilteredPackages(filtered);
  }, [filterVehicleModel, filterRateType, packages]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [packagesData, rateTypesData, vehicleModelsData, appSettingsResult] = await Promise.all([
        PackageService.getPackages(),
        PackageService.getRateTypes(),
        PackageService.getVehicleModels(),
        supabase
          .from('app_settings')
          .select('damage_deposit_presets')
          .eq('id', 1)
          .single()
      ]);
      setPackages(packagesData);
      setFilteredPackages(packagesData);
      setRateTypes(rateTypesData);
      setVehicleModels(vehicleModelsData);
      setDamageDepositPresetsByModelId(
        normalizeDamageDepositPresets(appSettingsResult?.data?.damage_deposit_presets)
      );
    } catch (err: any) {
      console.error('Error loading kilometer pricing data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      vehicle_model_id: '',
      included_kilometers: null,
      extra_km_rate: null,
      fixed_amount: null,
      fuel_charge_enabled: false,
      rate_type_id: 1,
      is_active: true,
      show_on_print: false
    });
    setPackageTypeSelection('1');
    setIsUnlimitedKilometers(false);
    setEditingPackage(null);
    setShowPackageForm(false);
    setError(null);
  };

  const handleCreatePackage = () => {
    resetForm();
    setShowPackageForm(true);
  };

  const handleEditPackage = (pkg: RentalPackage) => {
    const isHalfHour = detectHalfHourPackage(pkg);
    const isHalfDay = detectHalfDayPackage(pkg);
    const isUnlimited = (pkg.included_kilometers === null || pkg.included_kilometers === undefined) && (!pkg.extra_km_rate || pkg.extra_km_rate === 0);
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      vehicle_model_id: pkg.vehicle_model_id || '',
      included_kilometers: pkg.included_kilometers,
      extra_km_rate: pkg.extra_km_rate,
      fixed_amount: pkg.fixed_amount,
      fuel_charge_enabled: Boolean(pkg.fuel_charge_enabled),
      rate_type_id: pkg.rate_type_id,
      is_active: pkg.is_active,
      show_on_print: pkg.show_on_print === true || pkg.showOnPrint === true
    });
    setPackageTypeSelection(
      isHalfHour ? HALF_HOUR_SELECTION : isHalfDay ? HALF_DAY_SELECTION : String(pkg.rate_type_id)
    );
    setIsUnlimitedKilometers(isUnlimited);
    setShowPackageForm(true);
    setError(null);
  };

  const handleDeletePackage = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(id);
    setError(null);

    try {
      console.log('🗑️ Attempting to delete package ID:', id);
      
      // First, check if this package is used in any rentals
      const { data: rentals, error: checkError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_id')
        .eq('package_id', id);

      if (checkError) {
        console.error('Error checking rentals:', checkError);
        throw new Error('Failed to check package usage');
      }

      // If package is used in rentals, warn the user
      if (rentals && rentals.length > 0) {
        const confirmDelete = window.confirm(
          `This package is used in ${rentals.length} rental(s). Deleting it will remove the package association from these rentals. Continue?`
        );
        
        if (!confirmDelete) {
          setDeleteLoading(null);
          return;
        }
        
        // Update rentals to remove package association
        const { error: updateError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update({ package_id: null })
          .eq('package_id', id);
        
        if (updateError) {
          console.error('Error updating rentals:', updateError);
          throw new Error('Failed to update rentals');
        }
        
        console.log(`✅ Updated ${rentals.length} rentals to remove package association`);
      }

      // Check if package is used in mapping table
      const { data: mappings, error: mappingError } = await supabase
        .from('package_vehicle_type_mapping')
        .select('*')
        .eq('package_id', id);

      if (mappingError) {
        console.error('Error checking mappings:', mappingError);
        // Continue anyway, mapping might not exist
      }

      // Delete from mapping table first (if any exist)
      if (mappings && mappings.length > 0) {
        const { error: deleteMappingError } = await supabase
          .from('package_vehicle_type_mapping')
          .delete()
          .eq('package_id', id);
        
        if (deleteMappingError) {
          console.error('Error deleting mappings:', deleteMappingError);
          throw new Error('Failed to delete package mappings');
        }
        
        console.log(`✅ Deleted ${mappings.length} mapping entries`);
      }

      // Finally, delete the package itself
      const { error: deleteError } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Error deleting package:', deleteError);
        throw new Error(deleteError.message);
      }

      console.log('✅ Package deleted successfully');
      setSuccessMessage(tr('Package deleted successfully!', 'Package supprimé avec succès !'));
      
      // Refresh the packages list
      await loadData();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
      
    } catch (err: any) {
      console.error('❌ Error deleting package:', err);
      setError(err.message || tr('Failed to delete package', 'Impossible de supprimer le package'));
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleFormChange = (field: keyof PackageFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleVehicleModelChange = (vehicleModelId: string) => {
    setFormData(prev => ({
      ...prev,
      vehicle_model_id: vehicleModelId
    }));
  };

  const handleRateTypeChange = (selection: string) => {
    const hourlyRateTypeId =
      rateTypes.find((rt) => rt.name?.toLowerCase().includes('hour'))?.id || 1;
    const isHalfHour = selection === HALF_HOUR_SELECTION;
    const isHalfDay = selection === HALF_DAY_SELECTION;
    const selectedRateTypeId = isHalfHour || isHalfDay ? hourlyRateTypeId : Number(selection);

    setPackageTypeSelection(selection);
    setFormData((prev) => {
      const nextName =
        isHalfHour && !prev.name.trim()
          ? tr('Half hour package', 'Package demi-heure')
          : isHalfDay && !prev.name.trim()
            ? tr('Half day package', 'Package demi-journée')
            : prev.name;
      const nextDescription =
        isHalfHour && !prev.description.trim()
          ? tr('Fixed 30-minute rental package.', 'Package de location fixe de 30 minutes.')
          : isHalfDay && !prev.description.trim()
            ? tr('Fixed 4-hour rental package.', 'Package de location fixe de 4 heures.')
            : prev.description;

      return {
        ...prev,
        name: nextName,
        description: nextDescription,
        rate_type_id: selectedRateTypeId,
      };
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadFuelLineChargePreview = async () => {
      if (!formData.vehicle_model_id) {
        setFuelLineChargePreview(0);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('fuel_pricing')
          .select('price_per_line, hourly_price_per_line, daily_price_per_line')
          .eq('model_id', formData.vehicle_model_id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (cancelled) return;

        const selectedRateType = rateTypes.find((rateType) => rateType.id === formData.rate_type_id);
        const rateTypeName = String(selectedRateType?.name || '').toLowerCase();
        const nextPrice = rateTypeName.includes('hour')
          ? Number(data?.hourly_price_per_line ?? data?.price_per_line ?? 0) || 0
          : rateTypeName.includes('day')
            ? Number(data?.daily_price_per_line ?? data?.price_per_line ?? 0) || 0
            : Number(data?.price_per_line ?? 0) || 0;

        setFuelLineChargePreview(nextPrice);
      } catch (err) {
        console.error('Error loading fuel pricing preview for package form:', err);
        if (!cancelled) setFuelLineChargePreview(0);
      }
    };

    loadFuelLineChargePreview();

    return () => {
      cancelled = true;
    };
  }, [formData.vehicle_model_id, formData.rate_type_id, rateTypes]);

  const isPrintSelected = (pkg: RentalPackage | PackageFormData) =>
    pkg.show_on_print === true || pkg.showOnPrint === true;

  const getPrintSelectedCountForPage = (vehicleModelId: string, excludePackageId?: number | string | null) =>
    packages.filter((pkg) =>
      String(pkg.vehicle_model_id || '') === String(vehicleModelId || '') &&
      String(pkg.id || '') !== String(excludePackageId || '') &&
      isPrintSelected(pkg)
    ).length;

  const canSelectPackageForPrint = (vehicleModelId: string, excludePackageId?: number | string | null) =>
    getPrintSelectedCountForPage(vehicleModelId, excludePackageId) < MAX_PRINT_PACKAGES_PER_PAGE;

  const handleToggleShowOnPrint = async (pkg: RentalPackage, checked: boolean) => {
    if (checked && !canSelectPackageForPrint(pkg.vehicle_model_id, pkg.id)) {
      setError(tr('Maximum 8 packages allowed per model print page', 'Maximum 8 packages autorisés par page d’impression par modèle'));
      return;
    }

    setPrintToggleLoading(pkg.id);
    setError(null);

    try {
      await PackageService.updatePackage(pkg.id, {
        ...pkg,
        show_on_print: checked,
      });
      setPackages((current) =>
        current.map((item) =>
          item.id === pkg.id
            ? { ...item, show_on_print: checked, showOnPrint: checked }
            : item
        )
      );
      setSuccessMessage(
        checked
          ? tr('Package added to marketing print.', 'Package ajouté à l’impression marketing.')
          : tr('Package removed from marketing print.', 'Package retiré de l’impression marketing.')
      );
      setTimeout(() => setSuccessMessage(null), 2200);
    } catch (err: any) {
      console.error('Error updating package print visibility:', err);
      setError(err.message || tr('Could not update print visibility', 'Impossible de mettre à jour la visibilité d’impression'));
    } finally {
      setPrintToggleLoading(null);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return tr('Package name is required', 'Le nom du package est obligatoire');
    }
    if (!formData.vehicle_model_id) {
      return tr('Vehicle model is required', 'Le modèle de véhicule est obligatoire');
    }
    if (!formData.rate_type_id) {
      return tr('Rate type is required', 'Le type de tarif est obligatoire');
    }
    
    // All three pricing fields are required together
    if (!formData.fixed_amount || formData.fixed_amount <= 0) {
      return tr('Fixed amount is required and must be greater than 0', 'Le montant fixe est obligatoire et doit être supérieur à 0');
    }
    if (!isUnlimitedKilometers && (!formData.included_kilometers || formData.included_kilometers <= 0)) {
      return tr('Included kilometers is required and must be greater than 0', 'Le kilométrage inclus est obligatoire et doit être supérieur à 0');
    }
    if (!isUnlimitedKilometers && (!formData.extra_km_rate || formData.extra_km_rate <= 0)) {
      return tr('Overage rate is required and must be greater than 0', 'Le tarif de dépassement est obligatoire et doit être supérieur à 0');
    }
    if (
      formData.show_on_print &&
      !canSelectPackageForPrint(formData.vehicle_model_id, editingPackage?.id)
    ) {
      return tr('Maximum 8 packages allowed per model print page', 'Maximum 8 packages autorisés par page d’impression par modèle');
    }
    
    return null;
  };

  const handleSubmitPackage = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const validationError = validateForm();
  if (validationError) {
    setError(validationError);
    return;
  }

  setSubmitting(true);
  setError(null);

  try {
    const durationUnits =
      packageTypeSelection === HALF_HOUR_SELECTION
        ? 0.5
        : packageTypeSelection === HALF_DAY_SELECTION
          ? 4
          : Number(formData.duration_units || 1) || 1;

    const packagePayload = {
      ...formData,
      included_kilometers: isUnlimitedKilometers ? null : formData.included_kilometers,
      extra_km_rate: isUnlimitedKilometers ? 0 : formData.extra_km_rate,
      duration_units: durationUnits,
      fuel_charge_enabled: formData.fuel_charge_enabled,
      description:
        packageTypeSelection === HALF_HOUR_SELECTION
          ? [formData.description?.trim(), tr('30 minutes', '30 minutes')]
              .filter(Boolean)
              .join(' ')
              .trim()
          : packageTypeSelection === HALF_DAY_SELECTION
          ? [formData.description?.trim(), tr('4 hours', '4 heures')]
              .filter(Boolean)
              .join(' ')
              .trim()
          : formData.description,
    };

    // Log the data being sent
    console.log('📦 Submitting package data:', {
      name: packagePayload.name,
      vehicle_model_id: packagePayload.vehicle_model_id,
      rate_type_id: packagePayload.rate_type_id,
      fixed_amount: packagePayload.fixed_amount,
      included_kilometers: packagePayload.included_kilometers,
      extra_km_rate: packagePayload.extra_km_rate,
      is_active: packagePayload.is_active,
      show_on_print: packagePayload.show_on_print,
      package_type_selection: packageTypeSelection
    });

    if (editingPackage) {
      await PackageService.updatePackage(editingPackage.id, packagePayload);
      setSuccessMessage(tr('Package updated successfully!', 'Package mis à jour avec succès !'));
    } else {
      await PackageService.createPackage(packagePayload);
      setSuccessMessage(tr('Package created successfully!', 'Package créé avec succès !'));
    }
    
    setTimeout(() => setSuccessMessage(null), 3000);
    resetForm();
    await loadData();
  } catch (err: any) {
    console.error('Error saving package:', err);
    
    let errorMessage = err.message || tr('Failed to save package', "Impossible d'enregistrer le package");
    
    if (err.message?.includes('package_pricing_consistency')) {
      errorMessage = isUnlimitedKilometers
        ? tr(
            'Unlimited package is blocked by the current database rule. Run the unlimited-kilometers package SQL first.',
            'Le package illimité est bloqué par la règle actuelle de la base. Exécutez d’abord le SQL des packages à kilométrage illimité.'
          )
        : tr('Package must have fixed amount, included kilometers, AND overage rate.', 'Le package doit avoir un montant fixe, des kilomètres inclus ET un tarif de dépassement.');
    } else if (err.message?.includes('Fixed amount is required')) {
      errorMessage = tr('Fixed amount is required and must be greater than 0', 'Le montant fixe est obligatoire et doit être supérieur à 0');
    } else if (err.code === '23505') {
      errorMessage = tr('A package with this name already exists for this vehicle model.', 'Un package portant ce nom existe déjà pour ce modèle de véhicule.');
    } else if (err.code === '23503') {
      errorMessage = tr('Invalid vehicle model selected.', 'Le modèle de véhicule sélectionné est invalide.');
    } else if (err.code === '42501' || err.status === 403) {
      errorMessage = tr(
        'Package save is blocked by Supabase table permissions. Apply the rental-km-packages RLS SQL, then try again.',
        "L'enregistrement du package est bloqué par les autorisations de table Supabase. Appliquez le SQL RLS des packages kilométriques, puis réessayez."
      );
    } else if (err.message?.includes('fuel_charge_enabled')) {
      errorMessage = tr(
        'The database is missing the new package fuel policy column. Run src/migrations/add_fuel_charge_policy_to_rental_packages.sql, then try again.',
        'La base de données ne contient pas encore la nouvelle colonne de politique carburant du package. Exécutez src/migrations/add_fuel_charge_policy_to_rental_packages.sql, puis réessayez.'
      );
    }
    
    setError(errorMessage);
  } finally {
    setSubmitting(false);
  }
};

  const getVehicleModelDisplay = (model: VehicleModel | undefined) => {
    if (!model) return tr('Unknown Model', 'Modèle inconnu');
    if (model.name && model.model) {
      if (model.name.toLowerCase().includes(model.model.toLowerCase())) {
        return model.name;
      }
      return `${model.name} ${model.model}`;
    }
    return model.name || model.model || tr('Unknown', 'Inconnu');
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '0 MAD';
    return new Intl.NumberFormat('en-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount).replace('MAD', '').trim() + ' MAD';
  };

  const translatePrintPackageText = (value?: string | null) => {
    const text = String(value || '');
    if (!isFrench || !text) return text;

    return text
      .replace(/\bper\s+hour\b/gi, 'par heure')
      .replace(/\bper\s+day\b/gi, 'par jour')
      .replace(/\bper\s+week\b/gi, 'par semaine')
      .replace(/\bper\s+month\b/gi, 'par mois')
      .replace(/\bhalf\s+hour\b/gi, 'demi-heure')
      .replace(/\bhalf\s+day\b/gi, 'demi-journée')
      .replace(/\bhourly\b/gi, 'par heure')
      .replace(/\bdaily\b/gi, 'par jour')
      .replace(/\bweekly\b/gi, 'hebdomadaire')
      .replace(/\bmonthly\b/gi, 'mensuel')
      .replace(/\bunlimited\s+km\b/gi, 'km illimité')
      .replace(/\bunlimited\s+kilometers\b/gi, 'kilométrage illimité')
      .replace(/\bincluded\s+km\b/gi, 'km inclus')
      .replace(/\bextra\s+km\b/gi, 'km supp.');
  };

  const getModelDamageDepositPreset = (model?: VehicleModel) => {
    if (!model) return null;
    const modelDisplayName = [model.name, model.model].filter(Boolean).join(' ');
    const presets = getDamageDepositPresetsForLookup(damageDepositPresetsByModelId, [
      model.id,
      String(model.id || ''),
      model.model,
      model.name,
      modelDisplayName,
    ]);
    return getDefaultDamageDepositPreset(presets);
  };

  const getPackagePrintRank = (pkg: RentalPackage) => {
    if (detectHalfHourPackage(pkg)) return 0;
    if (detectHalfDayPackage(pkg)) return 2;
    const rateName = rateTypes.find((rateType) => rateType.id === pkg.rate_type_id)?.name?.toLowerCase() || '';
    if (rateName.includes('hour')) return 1;
    if (rateName.includes('day')) return 3;
    if (rateName.includes('week')) return 4;
    if (rateName.includes('month')) return 5;
    return 9;
  };

  const sortPackagesForPrint = (items: RentalPackage[]) =>
    [...items].sort((left, right) =>
      getPackagePrintRank(left) - getPackagePrintRank(right) ||
      Number(left.fixed_amount || 0) - Number(right.fixed_amount || 0) ||
      String(left.name || '').localeCompare(String(right.name || ''))
    );

  const getPrintPreviewBadge = (pkg: RentalPackage) => {
    if (pkg.included_kilometers !== null && pkg.included_kilometers !== undefined) {
      return `${pkg.included_kilometers} km`;
    }
    return tr('Unlimited km', 'Km illimité');
  };

  const getPrintPreviewSubtitle = (pkg: RentalPackage) => {
    if (detectHalfHourPackage(pkg)) return tr('30 min package', 'Forfait 30 min');
    if (detectHalfDayPackage(pkg)) return tr('4 hour package', 'Forfait 4 heures');
    const rateTypeName = rateTypes.find((rateType) => rateType.id === pkg.rate_type_id)?.name || tr('Package', 'Forfait');
    return `${translatePrintPackageText(rateTypeName)} ${tr('package', 'forfait')}`;
  };

  const buildMarketingPrintPages = () => {
    const scopedPackages = packages.filter((pkg) => {
      if (pkg.is_active === false) return false;
      if (filterVehicleModel && pkg.vehicle_model_id !== filterVehicleModel) return false;
      if (filterRateType && Number(pkg.rate_type_id) !== Number(filterRateType)) return false;
      return true;
    });

    const pageKeys = new Map<string, { model: VehicleModel | undefined; packages: RentalPackage[] }>();

    scopedPackages.forEach((pkg) => {
      const model = vehicleModels.find((vehicleModel) => vehicleModel.id === pkg.vehicle_model_id) || pkg.vehicle_model;
      const key = String(pkg.vehicle_model_id || '');

      if (!pageKeys.has(key)) {
        pageKeys.set(key, { model, packages: [] });
      }
      pageKeys.get(key)?.packages.push(pkg);
    });

    return Array.from(pageKeys.values())
      .map((page) => {
        const selectedPackages = page.packages.filter(isPrintSelected);
        const usesFallback = selectedPackages.length === 0;
        const visiblePackages = sortPackagesForPrint(usesFallback ? page.packages : selectedPackages).slice(0, MAX_PRINT_PACKAGES_PER_PAGE);

        return {
          ...page,
          packages: visiblePackages,
          usesFallback,
          damageDepositPreset: getModelDamageDepositPreset(page.model)
        };
      })
      .filter((page) => page.packages.length > 0)
      .sort((left, right) => getVehicleModelDisplay(left.model).localeCompare(getVehicleModelDisplay(right.model)));
  };

  const marketingPrintPages = buildMarketingPrintPages();
  const selectedPrintPackagesCount = packages.filter((pkg) => pkg.is_active !== false && isPrintSelected(pkg)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-purple-600 animate-spin" />
        <span className="ml-3 text-gray-600">{tr('Loading packages...', 'Chargement des packages...')}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-green-800 font-medium">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !showPackageForm && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => setShowPrintPreview(true)}
          disabled={marketingPrintPages.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
        >
          <Printer className="h-4 w-4" />
          {tr('Print Preview', 'Aperçu impression')}
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
            {marketingPrintPages.length}
          </span>
        </button>
        <button
          onClick={handleCreatePackage}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {tr('Create Package', 'Créer un package')}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Filter className="w-5 h-5 text-gray-600" />
        
        {/* Vehicle Model Filter */}
        <select
          value={filterVehicleModel}
          onChange={(e) => setFilterVehicleModel(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">{tr('All Vehicle Models', 'Tous les modèles de véhicules')}</option>
          {vehicleModels.map(model => (
            <option key={model.id} value={model.id}>
              {getVehicleModelDisplay(model)}
            </option>
          ))}
        </select>

        {/* Rate Type Filter */}
        <select
          value={filterRateType}
          onChange={(e) => setFilterRateType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">{tr('All Rate Types', 'Tous les types de tarif')}</option>
          {rateTypes.map(rt => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>

        {(filterVehicleModel || filterRateType) && (
          <button
            onClick={() => {
              setFilterVehicleModel('');
              setFilterRateType('');
            }}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            {tr('Clear filters', 'Effacer les filtres')}
          </button>
        )}
      </div>

      {/* Packages List */}
      {filteredPackages.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-2">
            {filterVehicleModel || filterRateType ? tr('No packages found matching filters', 'Aucun package trouvé avec ces filtres') : tr('No packages created yet', 'Aucun package créé pour le moment')}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            {filterVehicleModel || filterRateType 
              ? tr('Try clearing filters or select different options', 'Essayez de supprimer les filtres ou choisissez d’autres options')
              : tr('Create your first pricing package to get started', 'Créez votre premier package tarifaire pour commencer')}
          </p>
          {!filterVehicleModel && !filterRateType && (
            <button
              onClick={() => setShowHelpModal(true)}
              className="text-purple-600 hover:text-purple-700 text-sm font-medium underline"
            >
              {tr('Learn how to create packages', 'Apprendre à créer des packages')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => {
            const rateType = rateTypes.find(rt => rt.id === pkg.rate_type_id);
            const rateTypeName = rateType?.name || tr('Unknown', 'Inconnu');
            const rateTypeColor = getRateTypeColor(rateTypeName);
            const rateTypeIcon = getRateTypeIcon(rateTypeName);
            const showOnPrint = isPrintSelected(pkg);
            
            return (
              <div
                key={pkg.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{pkg.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{pkg.description}</p>
                    
                    {/* Rate Type Badge */}
                    <div className={`flex items-center gap-1 mt-2 text-xs px-2 py-1 rounded-md w-fit border ${rateTypeColor}`}>
                      {rateTypeIcon}
                      <span className="font-medium">{rateTypeName}</span>
                    </div>
                    
                    {pkg.vehicle_model && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-md w-fit">
                        <Car className="w-3 h-3" />
                        <span className="font-medium">{getVehicleModelDisplay(pkg.vehicle_model)}</span>
                      </div>
                    )}
                    {showOnPrint && (
                      <div className="mt-2 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {tr('Print', 'Impression')}
                      </div>
                    )}
                  </div>
                  {pkg.is_active ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </div>

                <label className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{tr('Show on Print', 'Afficher à l’impression')}</span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {tr('Feature this package on A4 marketing sheets.', 'Mettre ce package en avant sur les fiches marketing A4.')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={showOnPrint}
                    disabled={printToggleLoading === pkg.id}
                    onChange={(event) => handleToggleShowOnPrint(pkg, event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                  />
                </label>
                
                <div className="space-y-2 text-sm">
                  {((pkg.included_kilometers === null || pkg.included_kilometers === undefined) && (!pkg.extra_km_rate || pkg.extra_km_rate === 0)) && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {tr('Unlimited kilometers package', 'Package à kilométrage illimité')}
                    </div>
                  )}
                  {/* Fixed Amount - Main Price */}
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-1">
                    <span className="text-gray-600 font-medium">{tr('Package Price:', 'Prix du package :')}</span>
                    <span className="font-bold text-lg text-green-600">{formatCurrency(pkg.fixed_amount)}</span>
                  </div>
                  
                  {/* Kilometer Details */}
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Included KM:', 'KM inclus :')}</span>
                    <span className="font-medium text-gray-900">
                      {pkg.included_kilometers || pkg.included_kilometers === 0 ? `${pkg.included_kilometers} km` : tr('Unlimited', 'Illimité')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Overage Rate:', 'Tarif de dépassement :')}</span>
                    <span className="font-medium text-gray-900">
                      {!pkg.extra_km_rate ? tr('Not applied', 'Non appliqué') : `${pkg.extra_km_rate} MAD/km`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{tr('Fuel policy:', 'Politique carburant :')}</span>
                    <span className={`font-medium ${pkg.fuel_charge_enabled ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {pkg.fuel_charge_enabled
                        ? tr('Fuel charge enabled', 'Frais carburant activés')
                        : tr('Fuel included', 'Carburant inclus')}
                    </span>
                  </div>

                  {/* Example Calculation for this rate type */}
                  <div className="mt-3 p-2 bg-gray-50 rounded-md text-xs">
                    <p className="text-gray-500 mb-1">{tr('Example usage:', "Exemple d'utilisation :")}</p>
                    <div className="flex justify-between">
                      <span>{tr('Base', 'Prix de base')} {rateTypeName} :</span>
                      <span>{formatCurrency(pkg.fixed_amount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>{tr('Includes:', 'Comprend :')}</span>
                      <span>
                        {pkg.included_kilometers || pkg.included_kilometers === 0
                          ? `${pkg.included_kilometers} ${tr('km free', 'km offerts')}`
                          : tr('Unlimited kilometers', 'Kilométrage illimité')}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>{tr('Extra km rate:', 'Tarif km supplémentaire :')}</span>
                      <span>{!pkg.extra_km_rate ? tr('Not applied', 'Non appliqué') : `${pkg.extra_km_rate} MAD/km`}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                  <button 
                    onClick={() => handleEditPackage(pkg)}
                    disabled={deleteLoading === pkg.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      deleteLoading === pkg.id 
                        ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                        : 'text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    <Edit className="w-4 h-4" />
                    {tr('Edit', 'Modifier')}
                  </button>
                  <button 
                    onClick={() => handleDeletePackage(pkg.id)}
                    disabled={deleteLoading === pkg.id}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      deleteLoading === pkg.id 
                        ? 'text-gray-400 bg-gray-100 cursor-not-allowed' 
                        : 'text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {deleteLoading === pkg.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    {tr('Delete', 'Supprimer')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Marketing Print Preview */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm">
          <style>
            {`
              @media print {
                @page {
                  size: A4;
                  margin: 0;
                }
                html,
                body {
                  width: 210mm !important;
                  min-height: 297mm !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: white !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                body * {
                  visibility: hidden !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .marketing-print-pages,
                .marketing-print-pages * {
                  visibility: visible !important;
                }
                .marketing-print-pages {
                  position: absolute !important;
                  inset: 0 auto auto 0 !important;
                  display: block !important;
                  width: 210mm !important;
                  background: white !important;
                  gap: 0 !important;
                }
                .marketing-print-page {
                  width: 210mm !important;
                  height: 297mm !important;
                  min-height: 297mm !important;
                  margin: 0 !important;
                  padding: 10mm !important;
                  box-sizing: border-box !important;
                  box-shadow: none !important;
                  border-radius: 0 !important;
                  overflow: hidden !important;
                  break-after: page !important;
                  page-break-after: always !important;
                  background: white !important;
                }
                .marketing-print-page:last-child {
                  break-after: auto !important;
                  page-break-after: auto !important;
                }
                .marketing-print-card {
                  break-inside: avoid !important;
                  page-break-inside: avoid !important;
                }
                .marketing-print-price {
                  background: #7c3aed !important;
                  color: white !important;
                  box-shadow: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}
          </style>

          <div className="flex h-full flex-col">
            <div className="no-print flex flex-col gap-3 border-b border-white/10 bg-slate-950/85 px-4 py-3 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">
                  {tr('Marketing Print', 'Impression marketing')}
                </p>
                <h3 className="text-lg font-bold">{tr('A4 package preview', 'Aperçu A4 des packages')}</h3>
                <p className="text-sm text-slate-300">
                  {marketingPrintPages.length} {marketingPrintPages.length === 1 ? tr('model page', 'page modèle') : tr('model pages', 'pages modèles')} • {selectedPrintPackagesCount} {tr('selected packages', 'packages sélectionnés')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-violet-50"
                >
                  <Printer className="h-4 w-4" />
                  {tr('Print', 'Imprimer')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {tr('Close preview', 'Fermer l’aperçu')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-200 px-3 py-6 sm:px-8">
              <div className="marketing-print-pages mx-auto flex w-fit flex-col gap-8">
                {marketingPrintPages.map((page, pageIndex) => {
                  const modelName = getVehicleModelDisplay(page.model);
                  const damageDepositAmount = Number(page.damageDepositPreset?.amount || 0) || 0;
                  const visiblePrices = page.packages.map((pkg) => Number(pkg.fixed_amount || 0)).filter((value) => value > 0);
                  const lowestPrice = visiblePrices.length > 0 ? Math.min(...visiblePrices) : 0;
                  const highestPrice = visiblePrices.length > 0 ? Math.max(...visiblePrices) : 0;
                  return (
                    <section
                      key={`${page.model?.id || 'model'}-${pageIndex}`}
                      className="marketing-print-page flex min-h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden rounded-[28px] bg-white p-10 text-slate-950 shadow-2xl"
                    >
                      <header className="overflow-hidden rounded-[30px] border border-violet-200 bg-[linear-gradient(145deg,#ffffff_0%,#faf5ff_46%,#eefbf7_100%)] px-7 py-7">
                        <div className="flex items-start justify-between gap-6">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.36em] text-violet-600">SaharaX</p>
                            <h1 className="mt-3 text-5xl font-black tracking-tight">{modelName}</h1>
                            <p className="mt-2 text-base font-medium text-slate-600">
                              {tr('Customer package menu', 'Menu client des packages')}
                            </p>
                          </div>
                          <div className="rounded-[22px] border border-violet-200 bg-white px-5 py-4 text-right shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Packages', 'Packages')}</p>
                            <p className="mt-1 text-3xl font-black text-violet-600">{page.packages.length}</p>
                          </div>
                        </div>
                        <div className="mt-5 grid grid-cols-3 gap-3">
                          <div className="rounded-[20px] border border-white/70 bg-white/85 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{tr('Starting from', 'À partir de')}</p>
                            <p className="mt-1 text-xl font-black text-slate-950">{formatCurrency(lowestPrice)}</p>
                          </div>
                          <div className="rounded-[20px] border border-white/70 bg-white/85 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{tr('Top package', 'Forfait premium')}</p>
                            <p className="mt-1 text-xl font-black text-slate-950">{formatCurrency(highestPrice)}</p>
                          </div>
                          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">{tr('Deposit', 'Caution')}</p>
                            <p className="mt-1 text-xl font-black text-emerald-800">{formatCurrency(damageDepositAmount)}</p>
                          </div>
                        </div>
                      </header>

                      <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
                        <div className="flex items-center justify-between gap-5">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                              {tr('Printed menu note', 'Note du menu imprimé')}
                            </p>
                            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">
                              {tr('Choose your time and kilometers first. Security deposit is separate and refundable after return.', 'Choisissez d’abord votre durée et vos kilomètres. La caution est séparée et remboursable au retour.')}
                            </p>
                          </div>
                          <div className="rounded-[20px] bg-white px-5 py-3 text-right shadow-sm">
                            <p className="text-base font-black text-slate-900">
                              {page.damageDepositPreset?.label || tr('Refundable deposit', 'Caution remboursable')}
                            </p>
                            {page.damageDepositPreset?.label && (
                              <p className="mt-0.5 text-xs font-semibold text-slate-500">{tr('Shown separately on contract', 'Affichée séparément sur le contrat')}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 grid flex-1 grid-cols-2 gap-4">
                        {page.packages.map((pkg) => {
                          const isUnlimited = (pkg.included_kilometers === null || pkg.included_kilometers === undefined) && (!pkg.extra_km_rate || pkg.extra_km_rate === 0);
                          const packageName = translatePrintPackageText(pkg.name);
                          const packageDescription = translatePrintPackageText(pkg.description);
                          return (
                            <article key={pkg.id} className="marketing-print-card rounded-[26px] border border-violet-200 bg-white p-5 shadow-[0_14px_30px_rgba(124,58,237,0.08)]">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="inline-flex rounded-full bg-violet-100 px-4 py-2 text-xl font-black text-violet-700">
                                    {getPrintPreviewBadge(pkg)}
                                  </div>
                                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                                    {getPrintPreviewSubtitle(pkg)}
                                  </p>
                                  <h2 className="mt-2 text-2xl font-black text-slate-950">{packageName}</h2>
                                  {packageDescription && (
                                    <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">{packageDescription}</p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-5 flex items-end justify-between gap-4">
                                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{tr('Extra km', 'Km supp.')}</p>
                                  <p className="mt-1 text-lg font-black text-slate-900">
                                    {isUnlimited || !pkg.extra_km_rate ? tr('Included', 'Inclus') : `${pkg.extra_km_rate} MAD/km`}
                                  </p>
                                </div>
                                <div className="marketing-print-price rounded-[22px] bg-violet-600 px-5 py-4 text-right text-white shadow-lg shadow-violet-200">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">{tr('Price', 'Prix')}</p>
                                  <p className="mt-1 text-3xl font-black">{formatCurrency(pkg.fixed_amount)}</p>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 text-sm font-semibold text-slate-500">
                        <span>{tr('Printed customer menu for SaharaX packages', 'Menu client imprimé des packages SaharaX')}</span>
                        <span>{tr('Page', 'Page')} {pageIndex + 1}</span>
                      </footer>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Package Form Modal */}
      {showPackageForm && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_30px_80px_rgba(76,29,149,0.16)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[linear-gradient(135deg,#7c3aed_0%,#5b21b6_52%,#4338ca_100%)] px-6 py-5 text-white">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-100">
                  {tr('Kilometer packages', 'Packages kilométriques')}
                </p>
                <h3 className="mt-1 text-xl font-bold">
                  {editingPackage ? tr('Edit package', 'Modifier le package') : tr('Create new package', 'Créer un nouveau package')}
                </h3>
                <p className="mt-1 text-sm text-violet-100">
                  {editingPackage 
                    ? tr('Update the package details for this vehicle model.', 'Mettez à jour les détails du package pour ce modèle de véhicule.')
                    : tr('Create a fixed-price package with clear kilometer rules.', 'Créez un package à prix fixe avec des règles kilométriques claires.')}
                </p>
              </div>
              <button
                onClick={resetForm}
                className="rounded-2xl border border-white/20 bg-white/10 p-2 transition-colors hover:bg-white/20"
                disabled={submitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmitPackage} className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#fcfbff_0%,#ffffff_26%)] p-6">
              {/* Error Message in Form */}
              {error && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Vehicle Model Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Model <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.vehicle_model_id}
                    onChange={(e) => handleVehicleModelChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a vehicle model</option>
                    {vehicleModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {getVehicleModelDisplay(model)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Package will be linked directly to this vehicle model
                  </p>
                </div>

                {/* Package Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Package Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., Half hour package, 400 MAD Hourly Package, 500 MAD Daily Package, Half day package"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Brief description of this package"
                    rows={2}
                  />
                </div>

                {/* Rate Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rate Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRateTypeChange(HALF_HOUR_SELECTION)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        packageTypeSelection === HALF_HOUR_SELECTION
                          ? 'bg-violet-100 text-violet-800 border-violet-300 border-2 shadow-md scale-105'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {tr('Half hour', 'Demi-heure')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRateTypeChange(HALF_DAY_SELECTION)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        packageTypeSelection === HALF_DAY_SELECTION
                          ? 'bg-indigo-100 text-indigo-800 border-indigo-300 border-2 shadow-md scale-105'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {tr('Half day', 'Demi-journée')}
                    </button>
                    {rateTypes.map(rt => {
                      const isSelected =
                        packageTypeSelection !== HALF_DAY_SELECTION && formData.rate_type_id === rt.id;
                      const colorClass = getRateTypeColor(rt.name);
                      const icon = getRateTypeIcon(rt.name);
                      
                      return (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => handleRateTypeChange(String(rt.id))}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                            isSelected 
                              ? `${colorClass} border-2 shadow-md scale-105` 
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {icon}
                          {rt.name}
                        </button>
                      );
                    })}
                  </div>
                  {packageTypeSelection === HALF_HOUR_SELECTION && (
                    <p className="mt-2 text-xs text-violet-700">
                      {tr(
                        'Half hour packages are treated as fixed 30-minute rentals.',
                        'Les packages demi-heure sont traités comme des locations fixes de 30 minutes.'
                      )}
                    </p>
                  )}
                  {packageTypeSelection === HALF_DAY_SELECTION && (
                    <p className="mt-2 text-xs text-indigo-700">
                      {tr(
                        'Half day packages are treated as fixed 4-hour rentals.',
                        'Les packages demi-journée sont traités comme des locations fixes de 4 heures.'
                      )}
                    </p>
                  )}
                </div>

                {/* Fixed Amount - Main Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fixed Amount (MAD) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.fixed_amount || ''}
                      onChange={(e) => handleFormChange('fixed_amount', parseIntegerInput(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="400"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {packageTypeSelection === HALF_HOUR_SELECTION
                      ? tr(
                          'Total package price for a fixed 30-minute rental.',
                          'Prix total du package pour une location fixe de 30 minutes.'
                        )
                      : tr(
                          'Total package price for this rate type (e.g., 400 MAD for Hourly, 500 MAD for Daily)',
                          'Prix total du package pour ce type de tarif (ex. 400 MAD pour Horaire, 500 MAD pour Journalier)'
                        )}
                  </p>
                </div>

                {/* Included Kilometers */}
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isUnlimitedKilometers}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsUnlimitedKilometers(checked);
                        if (checked) {
                          setFormData((prev) => ({
                            ...prev,
                            included_kilometers: null,
                            extra_km_rate: 0,
                          }));
                        }
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {tr('Unlimited kilometers', 'Kilométrage illimité')}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {tr(
                          'Use this for hourly or daily packages that should ignore kilometer limits and overage charges.',
                          'Utilisez ceci pour les packages horaires ou journaliers qui doivent ignorer les limites kilométriques et les frais de dépassement.'
                        )}
                      </p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Included Kilometers {!isUnlimitedKilometers && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.included_kilometers || ''}
                    onChange={(e) => handleFormChange('included_kilometers', parseIntegerInput(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder={isUnlimitedKilometers ? tr('Unlimited', 'Illimité') : '100'}
                    required={!isUnlimitedKilometers}
                    disabled={isUnlimitedKilometers}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {isUnlimitedKilometers
                      ? tr('Unlimited packages do not use a kilometer cap.', "Les packages illimités n'utilisent pas de plafond kilométrique.")
                      : tr('Free kilometers included in the package price', 'Kilomètres offerts inclus dans le prix du package')}
                  </p>
                </div>

                {/* Overage Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overage Rate (MAD/km) {!isUnlimitedKilometers && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.extra_km_rate || ''}
                    onChange={(e) => handleFormChange('extra_km_rate', parseIntegerInput(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder={isUnlimitedKilometers ? tr('Not applied', 'Non appliqué') : '20'}
                    required={!isUnlimitedKilometers}
                    disabled={isUnlimitedKilometers}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {isUnlimitedKilometers
                      ? tr('Unlimited packages do not charge extra kilometers.', "Les packages illimités ne facturent pas de kilomètres supplémentaires.")
                      : tr('Price per kilometer beyond the included amount', 'Prix par kilomètre au-delà du montant inclus')}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData.fuel_charge_enabled}
                      onChange={(e) => handleFormChange('fuel_charge_enabled', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {tr('Enable extra fuel charge', 'Activer les frais carburant')}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {formData.fuel_charge_enabled
                          ? tr(
                              `Fuel is not included in this package. The current configured charge is ${fuelLineChargePreview || 0} MAD per missing line.`,
                              `Le carburant n’est pas inclus dans ce package. Le tarif configuré actuel est de ${fuelLineChargePreview || 0} MAD par ligne manquante.`
                            )
                          : tr(
                              'Fuel is included in this package. No extra fuel charge rule will be shown.',
                              'Le carburant est inclus dans ce package. Aucun frais carburant supplémentaire ne sera affiché.'
                            )}
                      </p>
                    </div>
                  </label>
                </div>

                {/* Example Preview based on selected rate type */}
{(formData.fixed_amount && formData.rate_type_id) && (
  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
    <p className="text-xs font-medium text-blue-800 mb-2">
      {tr(
        `Preview for selected ${
          packageTypeSelection === HALF_HOUR_SELECTION
            ? 'Half hour'
            : packageTypeSelection === HALF_DAY_SELECTION
              ? 'Half day'
              : rateTypes.find(rt => rt.id === formData.rate_type_id)?.name
        } package (150 km total):`,
        `Aperçu du package ${
          packageTypeSelection === HALF_HOUR_SELECTION
            ? 'demi-heure'
            : packageTypeSelection === HALF_DAY_SELECTION
              ? 'demi-journée'
              : rateTypes.find(rt => rt.id === formData.rate_type_id)?.name
        } sélectionné (150 km au total) :`
      )}
    </p>
    <div className="space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-blue-700">
          {isUnlimitedKilometers
            ? tr('✓ Unlimited kilometers:', '✓ Kilométrage illimité :')
            : `✓ First ${formData.included_kilometers} km:`}
        </span>
        <span className="font-medium">{formatCurrency(formData.fixed_amount)}</span>
      </div>
      {!isUnlimitedKilometers && 150 > (formData.included_kilometers || 0) && (
        <>
          <div className="flex justify-between text-orange-600">
            <span>✗ Extra km ({(150 - (formData.included_kilometers || 0))} km × {formData.extra_km_rate} MAD):</span>
            <span>+{formatCurrency((150 - (formData.included_kilometers || 0)) * (formData.extra_km_rate || 0))}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-blue-200 mt-1 pt-1">
            <span>Total for 150 km:</span>
            <span className="text-green-600">{formatCurrency((formData.fixed_amount || 0) + ((150 - (formData.included_kilometers || 0)) * (formData.extra_km_rate || 0)))}</span>
          </div>
        </>
      )}
      {(isUnlimitedKilometers || 150 <= (formData.included_kilometers || 0)) && (
        <div className="flex justify-between font-bold border-t border-blue-200 mt-1 pt-1">
          <span>Total for 150 km:</span>
          <span className="text-green-600">{formatCurrency(formData.fixed_amount)}</span>
        </div>
      )}
      <p className="text-gray-500 mt-1">
        {isUnlimitedKilometers ? (
          <>
            <span className="font-medium">Calculation:</span> {formData.fixed_amount} MAD ({tr('unlimited kilometers included', 'kilométrage illimité inclus')})
          </>
        ) : (
          <>
            <span className="font-medium">Calculation:</span> {formData.fixed_amount} MAD (first {formData.included_kilometers} km) + ({150 - (formData.included_kilometers || 0)} km × {formData.extra_km_rate} MAD)
          </>
        )}
      </p>
    </div>
  </div>
)}

                {/* Is Active */}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => handleFormChange('is_active', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-gray-700">
                        {tr('Active', 'Actif')}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {tr('Available for new rentals.', 'Disponible pour les nouvelles locations.')}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={formData.show_on_print}
                      onChange={(e) => handleFormChange('show_on_print', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-violet-800">
                        {tr('Show on Marketing Print', 'Afficher sur l’impression marketing')}
                      </span>
                      <p className="mt-1 text-xs text-violet-700/80">
                        {tr('Limit 5 packages per print page.', 'Limite de 5 packages par page d’impression.')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmitPackage}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {tr('Saving...', 'Enregistrement...')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingPackage ? tr('Update Package', 'Mettre à jour le package') : tr('Create Package', 'Créer un package')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      <KilometerPricingHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
};

export default KilometerPricingTab;
