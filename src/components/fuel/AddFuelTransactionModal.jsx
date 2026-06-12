import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, FileText, Trash2, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import FuelTransactionService from '../../services/FuelTransactionService';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_FUEL_LINES, DEFAULT_VEHICLE_TANK_LITERS, linesToLiters, litersToLines, roundTo } from '../../utils/fuelMath';
import { formatVehicleLabel } from '../../utils/vehicleLabels';
import i18n from '../../i18n';

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'tank_refill', label: '⛽ Add to Tank' },
  { value: 'tank_out', label: '🛢️ Remove from Tank' },
  { value: 'vehicle_refill', label: '🚗 Direct Fill' },
  { value: 'withdrawal', label: '🔄 Tank Transfer' },
  { value: 'staff_fuel_use', label: '👤 Staff Fuel Use' }
];

const normalizeDecimalInput = (value = '') => String(value ?? '').replace(',', '.');
const normalizeDecimalTextInput = (value = '') => {
  const normalized = normalizeDecimalInput(value).replace(/[^\d.]/g, '');
  const [wholePart = '', ...decimalParts] = normalized.split('.');
  return decimalParts.length > 0 ? `${wholePart}.${decimalParts.join('')}` : wholePart;
};
const parseDecimalInput = (value = '') => {
  const parsed = Number(normalizeDecimalInput(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundToHalfLiter = (value) => roundTo(Math.round(parseDecimalInput(value) * 2) / 2, 1);
const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
const getLowercaseFileName = (file = null) => String(file?.name || '').trim().toLowerCase();
const FUEL_TRANSACTION_DRAFT_PREFIX = 'fuel:transaction-modal:draft';
const isHeicLikeFile = (file = null) => {
  const fileType = String(file?.type || '').trim().toLowerCase();
  const fileName = getLowercaseFileName(file);
  return fileType === 'image/heic' || fileType === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
};
const isPreviewableBrowserImage = (file = null) => {
  const fileType = String(file?.type || '').trim().toLowerCase();
  const fileName = getLowercaseFileName(file);
  if (isHeicLikeFile(file)) return false;
  return (
    fileType.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(fileName)
  );
};
const buildDraftStorageKey = ({
  editTransaction = null,
  transactionType = 'tank_refill',
  initialVehicleId = '',
}) => {
  if (editTransaction?.id) {
    return `${FUEL_TRANSACTION_DRAFT_PREFIX}:edit:${editTransaction.id}`;
  }

  return `${FUEL_TRANSACTION_DRAFT_PREFIX}:new:${transactionType}:${initialVehicleId || 'none'}`;
};
const readStoredDraft = (draftKey) => {
  if (typeof window === 'undefined' || !draftKey) return null;

  try {
    const raw = window.sessionStorage.getItem(draftKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};
const writeStoredDraft = (draftKey, draftPayload) => {
  if (typeof window === 'undefined' || !draftKey) return;

  try {
    window.sessionStorage.setItem(draftKey, JSON.stringify(draftPayload));
  } catch (_error) {
    // Ignore storage write issues
  }
};
const clearStoredDraft = (draftKey) => {
  if (typeof window === 'undefined' || !draftKey) return;

  try {
    window.sessionStorage.removeItem(draftKey);
  } catch (_error) {
    // Ignore storage delete issues
  }
};
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event?.target?.result || null);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const AddFuelTransactionModal = ({
  isOpen,
  onClose,
  onSave,
  onSuccess,
  vehicles = [],
  vehicleStates = [],
  tankSummary: providedTankSummary = null,
  editTransaction = null,
  transactionType = 'tank_refill',
  initialVehicleId = '',
}) => {
  const { userProfile } = useAuth();
  const importInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const draftReadyRef = useRef(false);
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_type: 'tank_refill',
    source: 'tank_refill',
    vehicle_id: '',
    amount: '',
    cost: '',
    unit_price: '',
    fuel_type: 'gasoline',
    fuel_station: '',
    location: '',
    odometer_reading: '',
    fuel_lines_after: '',
    filled_by: '',
    notes: '',
    invoice_image: null
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [existingImageInfo, setExistingImageInfo] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [tankSummary, setTankSummary] = useState(null);
  const [vehicleFuelState, setVehicleFuelState] = useState(null);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const isPrivilegedFuelEditor = ['owner', 'admin'].includes(userProfile?.role);
  const draftStorageKey = buildDraftStorageKey({
    editTransaction,
    transactionType,
    initialVehicleId,
  });

  const getCachedVehicleFuelState = (vehicleId = '') =>
    (Array.isArray(vehicleStates) ? vehicleStates : []).find((state) => String(state.id) === String(vehicleId)) || null;

  const loadContextData = async (vehicleId = '') => {
    if (providedTankSummary) {
      setTankSummary(providedTankSummary);
    }

    const cachedVehicleState = vehicleId ? getCachedVehicleFuelState(vehicleId) : null;
    if (cachedVehicleState) {
      setVehicleFuelState(cachedVehicleState);
    }

    const needsTankFetch = !providedTankSummary;
    const needsVehicleFetch = Boolean(vehicleId) && !cachedVehicleState;

    if (!needsTankFetch && !needsVehicleFetch) {
      return;
    }

    const [tank, vehicleState] = await Promise.all([
      needsTankFetch ? FuelTransactionService.getFuelTankData() : Promise.resolve(providedTankSummary),
      needsVehicleFetch ? FuelTransactionService.getVehicleFuelState(vehicleId) : Promise.resolve(cachedVehicleState),
    ]);

    setTankSummary(tank || providedTankSummary || null);
    setVehicleFuelState(vehicleState || cachedVehicleState || null);
  };

  // Initialize the modal form only when the modal opens or the editing context changes.
  useEffect(() => {
    if (isOpen) {
      draftReadyRef.current = false;
      loadContextData(editTransaction?.vehicle_id || initialVehicleId || '');
      const storedDraft = readStoredDraft(draftStorageKey);
      if (editTransaction) {
        // Extract the real ID from prefixed ID (e.g., "refill-123" -> "123")
        const realId = editTransaction.id?.replace(/^(refill|withdrawal)-/, '') || editTransaction.id;

        const editBaseline = {
          id: realId, // Store the real database ID
          transaction_date: editTransaction.transaction_date?.split('T')[0] || new Date().toISOString().split('T')[0],
          transaction_type: editTransaction.transaction_type || transactionType,
          source: editTransaction.source || editTransaction.transaction_type || transactionType,
          vehicle_id: editTransaction.vehicle_id || '',
          amount: editTransaction.amount?.toString() || '',
          cost: editTransaction.cost?.toString() || '',
          unit_price: editTransaction.unit_price?.toString() || '',
          fuel_type: editTransaction.fuel_type || 'gasoline',
          fuel_station: editTransaction.fuel_station || '',
          location: editTransaction.location || '',
          odometer_reading: editTransaction.odometer_reading?.toString() || '',
          fuel_lines_after: editTransaction.fuel_lines_after?.toString?.() || '',
          filled_by: editTransaction.performed_by_name || editTransaction.filled_by || editTransaction.created_by || userProfile?.fullName || userProfile?.email || '',
          notes: editTransaction.notes || '',
          invoice_image: editTransaction.invoice_image || null // Preserve original image data
        };
        const editImagePreview = (() => {
          if (!editTransaction.invoice_image) return null;

          // Check if it's a base64 image (has 'data' property with base64 string)
          if (editTransaction.invoice_image.data) {
            return editTransaction.invoice_image.data;
          }
          // Check if it's a storage URL (has 'url' property)
          if (editTransaction.invoice_image.url) {
            return editTransaction.invoice_image.url;
          }
          // Check if it's a PDF
          if (editTransaction.invoice_image.type === 'application/pdf') {
            return 'pdf';
          }

          return null;
        })();
        const editExistingImageInfo = editTransaction.invoice_image
          ? {
              name: editTransaction.invoice_image.name || (editTransaction.invoice_image.type === 'application/pdf' ? 'Existing invoice.pdf' : 'Existing invoice'),
              size: editTransaction.invoice_image.size || null,
              type: editTransaction.invoice_image.type || 'image'
            }
          : null;

        if (storedDraft?.formData && storedDraft?.mode === 'edit') {
          setFormData({
            ...editBaseline,
            ...storedDraft.formData,
            id: realId,
          });
          setImagePreview(storedDraft.imagePreview ?? editImagePreview);
          setExistingImageInfo(storedDraft.existingImageInfo ?? editExistingImageInfo);
          setShowAdvancedDetails(Boolean(storedDraft.showAdvancedDetails));
        } else {
          setFormData(editBaseline);
          setImagePreview(editImagePreview);
          setExistingImageInfo(editExistingImageInfo);
          setShowAdvancedDetails(false);
        }
      } else {
        // Reset form for new transaction
        const newTransactionBaseline = {
          transaction_date: new Date().toISOString().split('T')[0],
          transaction_type: transactionType,
          source: transactionType,
          vehicle_id: initialVehicleId || '',
          amount: '',
          cost: '',
          unit_price: '',
          fuel_type: 'gasoline',
          fuel_station:
            transactionType === 'vehicle_refill'
              ? 'Direct Fill'
              : transactionType === 'withdrawal'
                ? 'Main Tank'
                : transactionType === 'staff_fuel_use'
                  ? 'Staff Fuel Use'
                  : '',
          location: '',
          odometer_reading: getVehicleCurrentOdometer(initialVehicleId || ''),
          fuel_lines_after: '',
          filled_by: userProfile?.fullName || userProfile?.email || '',
          notes: '',
          invoice_image: null
        };

        const hasMatchingDraftType =
          storedDraft?.formData?.transaction_type === transactionType ||
          storedDraft?.formData?.source === transactionType;

        if (storedDraft?.formData && storedDraft?.mode === 'new' && hasMatchingDraftType) {
          setFormData({
            ...newTransactionBaseline,
            ...storedDraft.formData,
            transaction_type: storedDraft.formData.transaction_type || transactionType,
            source: storedDraft.formData.source || storedDraft.formData.transaction_type || transactionType,
          });
          setImagePreview(storedDraft.imagePreview ?? null);
          setExistingImageInfo(storedDraft.existingImageInfo ?? null);
          setShowAdvancedDetails(Boolean(storedDraft.showAdvancedDetails));
        } else {
          setFormData(newTransactionBaseline);
          setImagePreview(null);
          setExistingImageInfo(null);
          setShowAdvancedDetails(false);
        }
      }
      setErrors({});
      draftReadyRef.current = true;
    }
  }, [
    isOpen,
    draftStorageKey,
    editTransaction?.id,
    editTransaction?.vehicle_id,
    transactionType,
    initialVehicleId,
    userProfile?.fullName,
    userProfile?.email,
  ]);

  useEffect(() => {
    if (!isOpen || !draftReadyRef.current) return;

    writeStoredDraft(draftStorageKey, {
      mode: editTransaction ? 'edit' : 'new',
      formData,
      imagePreview,
      existingImageInfo,
      showAdvancedDetails,
      savedAt: Date.now(),
    });
  }, [
    isOpen,
    draftStorageKey,
    editTransaction,
    formData,
    imagePreview,
    existingImageInfo,
    showAdvancedDetails,
  ]);

  // Keep contextual tank / vehicle fuel data fresh without wiping the form while the modal is open.
  useEffect(() => {
    if (!isOpen) return;

    if (providedTankSummary) {
      setTankSummary(providedTankSummary);
    }

    if (!formData.vehicle_id) return;
    const cachedVehicleState = getCachedVehicleFuelState(formData.vehicle_id);
    if (cachedVehicleState) {
      setVehicleFuelState(cachedVehicleState);
    }
  }, [isOpen, providedTankSummary, vehicleStates, formData.vehicle_id]);

  useEffect(() => {
    if (!isOpen || !formData.vehicle_id) return;
    if (editTransaction && formData.odometer_reading) return;

    const suggestedOdometer = getVehicleCurrentOdometer(formData.vehicle_id);
    if (!suggestedOdometer || suggestedOdometer === formData.odometer_reading) return;

    setFormData((prev) => ({
      ...prev,
      odometer_reading: prev.odometer_reading || suggestedOdometer,
    }));
  }, [isOpen, formData.vehicle_id, formData.odometer_reading, vehicles, editTransaction]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'unit_price') {
      const normalizedValue = normalizeDecimalInput(value);
      setFormData(prev => {
        const amount = parseDecimalInput(prev.amount);
        const unitPrice = parseDecimalInput(normalizedValue);
        return {
          ...prev,
          unit_price: normalizedValue,
          cost: amount > 0 && unitPrice > 0 ? (amount * unitPrice).toFixed(2) : ''
        };
      });

      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
      return;
    }

    if (name === 'amount' && formData.transaction_type === 'vehicle_refill') {
      const normalizedValue = normalizeDecimalTextInput(value);

      setFormData((prev) => {
        const unitPrice = parseDecimalInput(prev.unit_price);
        const amount = parseDecimalInput(normalizedValue);
        return {
          ...prev,
          amount: normalizedValue,
          cost: normalizedValue !== '' && amount > 0 && unitPrice > 0 ? (amount * unitPrice).toFixed(2) : prev.cost
        };
      });

      if (errors[name]) {
        setErrors((prev) => ({
          ...prev,
          [name]: ''
        }));
      }
      return;
    }

    if (name === 'amount' && formData.transaction_type === 'withdrawal') {
      const normalizedValue = normalizeDecimalInput(value);
      const numericAmount = Number(normalizedValue);
      const roundedAmount = Number.isFinite(numericAmount) ? roundToHalfLiter(numericAmount) : 0;
      const safeAmount = roundedAmount;

      setFormData((prev) => {
        return {
          ...prev,
          amount: normalizedValue === '' ? '' : String(safeAmount),
          unit_price: '',
          cost: ''
        };
      });

      if (errors[name]) {
        setErrors((prev) => ({
          ...prev,
          [name]: ''
        }));
      }

      if (formData.transaction_type === 'withdrawal' && normalizedValue !== '') {
        const nextErrors = {};
        if (currentTankLiters > 0 && safeAmount > roundToHalfLiter(currentTankLiters)) {
          nextErrors.amount = tr(
            `Only ${roundToHalfLiter(currentTankLiters).toFixed(1)}L is available in the main tank right now.`,
            `Seulement ${roundToHalfLiter(currentTankLiters).toFixed(1)}L est disponible dans la cuve principale pour le moment.`
          );
        } else if (maxVehicleLiters > 0 && safeAmount > roundToHalfLiter(maxVehicleLiters)) {
          nextErrors.amount = tr(
            `You can only reach ${maxReachableTransferLines}/8 right now (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`,
            `Vous pouvez atteindre seulement ${maxReachableTransferLines}/8 pour le moment (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`
          );
        }

        if (Object.keys(nextErrors).length > 0) {
          setErrors((prev) => ({
            ...prev,
            ...nextErrors,
          }));
        }
      }
      return;
    }

    if (name === 'amount') {
      const normalizedValue = normalizeDecimalInput(value);
      setFormData(prev => {
        const unitPrice = parseDecimalInput(prev.unit_price);
        const amount = parseDecimalInput(normalizedValue);
        return {
          ...prev,
          amount: normalizedValue,
          cost: amount > 0 && unitPrice > 0 ? (amount * unitPrice).toFixed(2) : prev.cost
        };
      });

      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
      return;
    }

    if (name === 'cost') {
      const normalizedValue = normalizeDecimalInput(value);
      setFormData(prev => {
        const amount = parseDecimalInput(prev.amount);
        const totalCost = parseDecimalInput(normalizedValue);
        return {
          ...prev,
          cost: normalizedValue,
          unit_price: amount > 0 && totalCost > 0 ? (totalCost / amount).toFixed(2) : prev.unit_price
        };
      });

      if (errors[name]) {
        setErrors(prev => ({
          ...prev,
          [name]: ''
        }));
      }
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'vehicle_id') {
      loadContextData(value);
    }

    // Calculate total cost when amount or unit price changes
    if ((name === 'amount' || name === 'unit_price') && formData.transaction_type !== 'withdrawal') {
      const amount = name === 'amount' ? parseDecimalInput(value) : parseDecimalInput(formData.amount);
      const unitPrice = name === 'unit_price'
        ? parseDecimalInput(value)
        : parseDecimalInput(formData.unit_price);
      
      if (amount > 0 && unitPrice > 0) {
        setFormData(prev => ({
          ...prev,
          cost: (amount * unitPrice).toFixed(2)
        }));
      }
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleTransactionTypeChange = (nextType) => {
    if (isEditMode || nextType === formData.transaction_type) return;

    setFormData((prev) => ({
      ...prev,
      transaction_type: nextType,
      source: nextType,
      vehicle_id: '',
      fuel_lines_after: '',
      fuel_station:
        nextType === 'vehicle_refill'
          ? 'Direct Fill'
          : nextType === 'withdrawal'
            ? 'Main Tank'
            : nextType === 'tank_out'
              ? 'Main Tank'
              : nextType === 'staff_fuel_use'
                ? 'Staff Fuel Use'
                : '',
    }));

    setVehicleFuelState(null);
    setErrors((prev) => ({
      ...prev,
      transaction_type: '',
      vehicle_id: ''
    }));

    loadContextData('');
  };

  const getVehicleById = (vehicleId) =>
    (Array.isArray(vehicles) ? vehicles : []).find((vehicle) => String(vehicle.id) === String(vehicleId));

  const getVehicleCurrentOdometer = (vehicleId) => {
    const vehicle = getVehicleById(vehicleId);
    const odometer = vehicle?.current_odometer;
    if (odometer === null || odometer === undefined || odometer === '') {
      return '';
    }
    return String(odometer);
  };

  const handleImageUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    const hasAllowedExtension = /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(getLowercaseFileName(file));
    if (!allowedTypes.includes(file.type) && !hasAllowedExtension) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'Please upload a JPG, PNG, WEBP, HEIC, or PDF file'
      }));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'File size must be less than 5MB'
      }));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const storedFile = {
        data: dataUrl,
        name: file.name,
        type: file.type,
        size: file.size
      };

      // Create preview for images
      if (isPreviewableBrowserImage(file)) {
        setImagePreview(dataUrl);
      } else if (String(file.type || '').startsWith('image/') || isHeicLikeFile(file)) {
        setImagePreview('image-file');
      } else {
        setImagePreview('pdf');
      }

      setFormData(prev => ({
        ...prev,
        invoice_image: storedFile
      }));

      // Clear existing image info when uploading new file
      setExistingImageInfo(null);

      // Clear error
      setErrors(prev => ({
        ...prev,
        invoice_image: ''
      }));
    } catch (_error) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'Unable to read the selected file'
      }));
      return;
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleImageUpload(file);
    e.target.value = '';
  };

  const handleModalClose = () => {
    clearStoredDraft(draftStorageKey);
    onClose?.();
  };

  const openImportPicker = () => {
    importInputRef.current?.click();
  };

  const openCameraPicker = () => {
    cameraInputRef.current?.click();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    handleImageUpload(file);
  };

  const removeImage = () => {
    setFormData(prev => ({
      ...prev,
      invoice_image: null
    }));
    setImagePreview(null);
    setExistingImageInfo(null);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.transaction_date) {
      newErrors.transaction_date = 'La date de transaction est requise';
    }

    if (!formData.transaction_type) {
      newErrors.transaction_type = 'Le type de transaction est requis';
    }

    if (formData.transaction_type === 'vehicle_refill' && !formData.vehicle_id) {
      newErrors.vehicle_id = 'Le véhicule est requis pour les remplissages de véhicule';
    }

    if (formData.transaction_type === 'withdrawal' && !formData.vehicle_id) {
      newErrors.vehicle_id = 'Le véhicule est requis pour les retraits';
    }

    if (formData.transaction_type === 'staff_fuel_use' && !formData.vehicle_id) {
      newErrors.vehicle_id = "Le véhicule est requis pour l'utilisation carburant équipe";
    }

    const currentFuelLines = Number(vehicleFuelState?.current_fuel_lines || 0);
    const currentFuelLiters = Number(vehicleFuelState?.current_fuel_liters || 0);
    const vehicleTankCapacity = Number(vehicleFuelState?.tank_capacity_liters || 0);
    const isVehicleFullForTransfer =
      formData.transaction_type === 'withdrawal' &&
      !!vehicleFuelState &&
      (
        currentFuelLines >= 8 ||
        (vehicleTankCapacity > 0 && currentFuelLiters >= vehicleTankCapacity)
      );

    if (isVehicleFullForTransfer) {
      newErrors.amount = 'Le réservoir de ce véhicule est déjà plein. Le transfert depuis la cuve est bloqué.';
    }

    if (formData.transaction_type === 'staff_fuel_use') {
      const currentLines = Number(vehicleFuelState?.current_fuel_lines || 0);
      const nextLines = Number(formData.fuel_lines_after);

      if (!Number.isFinite(nextLines) || nextLines < 0 || nextLines > DEFAULT_FUEL_LINES) {
        newErrors.fuel_lines_after = 'Sélectionnez le niveau de carburant restant';
      } else if (nextLines >= currentLines) {
        newErrors.fuel_lines_after = 'Choisissez un niveau inférieur au niveau actuel';
      }
    }

    const amountValue = parseDecimalInput(formData.amount);
    const unitPriceValue = parseDecimalInput(formData.unit_price);
    const costValue = parseDecimalInput(formData.cost);

    if (!formData.amount || amountValue <= 0) {
      newErrors.amount = 'La quantité doit être supérieure à 0';
    }

    if (formData.transaction_type === 'tank_refill' && amountValue > remainingTankLiters) {
      newErrors.amount = `Maximum ${remainingTankLiters}L restants`;
    }

    if (formData.transaction_type === 'tank_out' && amountValue > currentTankLiters) {
      newErrors.amount = `Maximum ${currentTankLiters}L disponibles`;
    }

    if (formData.transaction_type === 'withdrawal') {
      const requestedAmount = roundToHalfLiter(amountValue);
      if (requestedAmount > roundToHalfLiter(currentTankLiters)) {
        newErrors.amount = tr(
          `Only ${roundToHalfLiter(currentTankLiters).toFixed(1)}L is available in the main tank right now.`,
          `Seulement ${roundToHalfLiter(currentTankLiters).toFixed(1)}L est disponible dans la cuve principale pour le moment.`
        );
      } else if (requestedAmount > 0 && requestedAmount > roundToHalfLiter(maxVehicleLiters)) {
        newErrors.amount = tr(
          `You can only reach ${maxReachableTransferLines}/8 right now (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`,
          `Vous pouvez atteindre seulement ${maxReachableTransferLines}/8 pour le moment (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`
        );
      }
    }

    if (formData.transaction_type === 'vehicle_refill' && maxVehicleLiters > 0 && amountValue > maxVehicleLiters) {
      newErrors.amount = tr(
        `Maximum ${roundTo(maxVehicleLiters, 2)}L can fit in this vehicle right now.`,
        `Maximum ${roundTo(maxVehicleLiters, 2)}L peut entrer dans ce véhicule pour le moment.`
      );
    }

    if (
      (formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') &&
      (!formData.unit_price || unitPriceValue <= 0)
    ) {
      newErrors.unit_price = 'Le prix par litre doit être supérieur à 0';
    }

    if (
      (formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') &&
      formData.cost &&
      costValue <= 0
    ) {
      newErrors.cost = 'Le coût doit être supérieur à 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Handle invoice image data
      let imageData = null;
      
      if (formData.invoice_image) {
        // Check if it's a File object (new upload) or existing data
        if (formData.invoice_image instanceof File) {
          // New file uploaded - convert to base64
          const reader = new FileReader();
          imageData = await new Promise((resolve) => {
            reader.onload = (e) => resolve({
              data: e.target.result,
              name: formData.invoice_image.name,
              type: formData.invoice_image.type,
              size: formData.invoice_image.size
            });
            reader.readAsDataURL(formData.invoice_image);
          });
        } else {
          // Existing image data - preserve it
          imageData = formData.invoice_image;
        }
      }

      const transactionData = {
        ...formData,
        amount: normalizeDecimalInput(formData.amount),
        cost: normalizeDecimalInput(formData.cost),
        unit_price: normalizeDecimalInput(formData.unit_price),
        tank_snapshot: tankSummary
          ? {
              ...tankSummary,
              current_volume_liters: currentTankLiters,
              capacity: tankCapacity,
            }
          : null,
        invoice_image: imageData,
        receipt_media: imageData,
        actor: userProfile
      };

      let result;
      const isEditMode = !!editTransaction;

      if (isEditMode) {
        // Update existing transaction
        result = await FuelTransactionService.updateTransaction(formData.id, transactionData);
      } else {
        // Create new transaction
        result = await FuelTransactionService.createTransaction(transactionData);
      }
      
      if (result.success) {
        clearStoredDraft(draftStorageKey);
        // Call onSave callback if provided
        if (onSave && typeof onSave === 'function') {
          onSave(result.transaction);
        }
        if (onSuccess && typeof onSuccess === 'function') {
          onSuccess(result.transaction);
        }
        onClose?.();
      } else {
        setErrors({ submit: result.error || `Impossible de ${isEditMode ? 'mettre à jour' : 'créer'} la transaction` });
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
      setErrors({ submit: error?.message || 'Une erreur inattendue est survenue' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const enteredAmountLiters = parseDecimalInput(formData.amount);
  const enteredCost = parseDecimalInput(formData.cost);
  const unitPrice = enteredAmountLiters > 0 && enteredCost > 0
    ? (enteredCost / enteredAmountLiters).toFixed(2)
    : '0.00';

  const isEditMode = !!editTransaction;
  const modalTitle = isEditMode ? 'Edit' : 'Add';

  // Safe vehicles array
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];

  // Determine if we should show the image preview section
  const hasImageToShow = formData.invoice_image || imagePreview;
  const tankCapacity = Number(tankSummary?.capacity || tankSummary?.capacity_liters || 500);
  const currentTankLiters = Number(
    tankSummary?.current_volume_liters ??
    tankSummary?.initial_volume ??
    0
  );
  const remainingTankLiters = Math.max(0, roundTo(tankCapacity - currentTankLiters, 2));
  const projectedTankAfterVehicleFuel = roundTo(
    Math.max(0, currentTankLiters - enteredAmountLiters),
    2
  );
  const projectedTankAfterVehicleFuelPercent = tankCapacity > 0
    ? Math.max(0, Math.min(100, (projectedTankAfterVehicleFuel / tankCapacity) * 100))
    : 0;
  const projectedTankLiters = roundTo(Math.min(tankCapacity, currentTankLiters + enteredAmountLiters), 2);
  const projectedTankPercent = tankCapacity > 0 ? Math.min(100, (projectedTankLiters / tankCapacity) * 100) : 0;

  const projectedVehicleLines = (() => {
    if (!vehicleFuelState || !formData.amount) return null;
    const currentLiters = Number(vehicleFuelState.current_fuel_liters || 0);
    const addedLiters = enteredAmountLiters;
    return litersToLines(roundTo(currentLiters + addedLiters, 3));
  })();

  const selectedVehicle = getVehicleById(formData.vehicle_id);

  const isVehicleFullForTransfer = (() => {
    if (formData.transaction_type !== 'withdrawal' || !vehicleFuelState) return false;
    const currentFuelLines = Number(vehicleFuelState.current_fuel_lines || 0);
    const currentFuelLiters = Number(vehicleFuelState.current_fuel_liters || 0);
    const vehicleTankCapacity = Number(vehicleFuelState.tank_capacity_liters || 0);
    return currentFuelLines >= 8 || (vehicleTankCapacity > 0 && currentFuelLiters >= vehicleTankCapacity);
  })();

  const litersPickerOptions = (() => {
    if (formData.transaction_type !== 'vehicle_refill' && formData.transaction_type !== 'withdrawal') {
      return [];
    }

    const vehicleTankCapacity = Number(vehicleFuelState?.tank_capacity_liters || DEFAULT_VEHICLE_TANK_LITERS);
    const currentFuelLiters = Number(vehicleFuelState?.current_fuel_liters || 0);
    const vehicleRemaining = Math.max(0, roundToHalfLiter(vehicleTankCapacity - currentFuelLiters));
    const tankAvailable =
      formData.transaction_type === 'withdrawal'
        ? Math.max(0, roundToHalfLiter(Number(tankSummary?.current_volume_liters || 0)))
        : vehicleRemaining;
    const maxLiters = Math.max(0, roundToHalfLiter(Math.min(vehicleRemaining, tankAvailable)));

    if (maxLiters <= 0) {
      return [];
    }

    const options = [];
    for (let value = 0.5; value <= maxLiters; value += 0.5) {
      options.push(roundToHalfLiter(value));
    }

    if (!options.includes(maxLiters)) {
      options.push(maxLiters);
    }

    return options;
  })();

  const maxVehicleLiters = litersPickerOptions.length ? Number(litersPickerOptions[litersPickerOptions.length - 1]) : 0;
  const currentVehicleLines = Number(vehicleFuelState?.current_fuel_lines || 0);
  const currentVehicleLiters = Number(vehicleFuelState?.current_fuel_liters || 0);
  const currentVehicleTankCapacity = Number(vehicleFuelState?.tank_capacity_liters || DEFAULT_VEHICLE_TANK_LITERS);
  const isVehicleFuelActionType = ['vehicle_refill', 'withdrawal', 'staff_fuel_use'].includes(formData.transaction_type);
  const maxReachableTransferLines = maxVehicleLiters > 0
    ? litersToLines(roundTo(currentVehicleLiters + maxVehicleLiters, 3), currentVehicleTankCapacity, DEFAULT_FUEL_LINES)
    : currentVehicleLines;
  const hasLimitedTransferRange = formData.transaction_type === 'withdrawal'
    && maxVehicleLiters > 0
    && maxReachableTransferLines < DEFAULT_FUEL_LINES;
  const maximumReachableTransferLineLabel = maxVehicleLiters > 0
    ? `${maxReachableTransferLines}/8`
    : `${currentVehicleLines}/8`;
  const selectedTransferTargetLines = formData.amount
    ? litersToLines(roundTo(currentVehicleLiters + enteredAmountLiters, 3), currentVehicleTankCapacity, DEFAULT_FUEL_LINES)
    : null;
  const selectedAddedLinesApprox = formData.amount && currentVehicleTankCapacity > 0
    ? roundTo((enteredAmountLiters / currentVehicleTankCapacity) * DEFAULT_FUEL_LINES, 1)
    : 0;
  const applyTransferTargetLine = (targetLines) => {
    const safeTargetLines = Math.max(0, Math.min(DEFAULT_FUEL_LINES, Number(targetLines) || 0));
    const targetLiters = linesToLiters(safeTargetLines, currentVehicleTankCapacity, DEFAULT_FUEL_LINES);
    const litersNeeded = Math.max(0, roundToHalfLiter(targetLiters - currentVehicleLiters));
    const requestedLiters = roundToHalfLiter(litersNeeded);

    if (formData.transaction_type === 'withdrawal' && requestedLiters > roundToHalfLiter(maxVehicleLiters || 0)) {
      setErrors((prev) => ({
        ...prev,
        amount: tr(
          `Not enough fuel in the main tank. Maximum reachable level right now: ${maximumReachableTransferLineLabel} (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`,
          `Pas assez de carburant dans la cuve principale. Niveau maximum atteignable maintenant : ${maximumReachableTransferLineLabel} (${roundToHalfLiter(maxVehicleLiters).toFixed(1)}L max).`
        ),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      amount: requestedLiters > 0 ? String(requestedLiters) : '',
      fuel_lines_after: String(safeTargetLines),
    }));

    setErrors((prev) => ({ ...prev, amount: '', fuel_lines_after: '' }));
  };

  const selectedStaffRemainingLines = formData.fuel_lines_after !== ''
    ? Number(formData.fuel_lines_after)
    : null;
  const selectedStaffConsumedLines =
    selectedStaffRemainingLines !== null && Number.isFinite(selectedStaffRemainingLines)
      ? Math.max(0, currentVehicleLines - selectedStaffRemainingLines)
      : 0;
  const selectedStaffConsumedLiters =
    selectedStaffRemainingLines !== null && Number.isFinite(selectedStaffRemainingLines)
      ? roundTo(
          Math.max(
            0,
            currentVehicleLiters - linesToLiters(selectedStaffRemainingLines, currentVehicleTankCapacity, DEFAULT_FUEL_LINES)
          ),
          2
        )
      : 0;
  const isStaffFuelUseReady =
    formData.transaction_type !== 'staff_fuel_use' ||
    (selectedStaffRemainingLines !== null && selectedStaffConsumedLiters > 0);

  const applyStaffFuelUseLine = (remainingLines) => {
    const safeRemainingLines = Math.max(0, Math.min(DEFAULT_FUEL_LINES, Number(remainingLines) || 0));
    const nextLiters = linesToLiters(safeRemainingLines, currentVehicleTankCapacity, DEFAULT_FUEL_LINES);
    const consumedLiters = roundTo(Math.max(0, currentVehicleLiters - nextLiters), 2);

    setFormData((prev) => ({
      ...prev,
      fuel_lines_after: String(safeRemainingLines),
      amount: consumedLiters > 0 ? String(consumedLiters) : '',
      unit_price: '',
      cost: '',
    }));

    setErrors((prev) => ({
      ...prev,
      amount: '',
      fuel_lines_after: '',
    }));
  };

  useEffect(() => {
    if (!isOpen) return;
    if (editTransaction) return;
    if (formData.transaction_type !== 'vehicle_refill' && formData.transaction_type !== 'withdrawal') return;
    if (!formData.vehicle_id) return;

    setFormData((prev) => ({
      ...prev,
      amount: maxVehicleLiters > 0 ? String(maxVehicleLiters) : '',
    }));
  }, [isOpen, editTransaction, formData.transaction_type, formData.vehicle_id, maxVehicleLiters]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleModalClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${
        isVehicleFuelActionType ? 'max-w-2xl' : 'max-w-md'
      }`}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {modalTitle} {formData.transaction_type === 'tank_refill'
              ? `⛽ ${tr('Add to Tank', 'Ajouter au réservoir')}`
              : formData.transaction_type === 'tank_out'
                ? `🛢️ ${tr('Remove from Tank', 'Retirer du réservoir')}`
              : formData.transaction_type === 'vehicle_refill'
                ? `🚗 ${tr('Direct Fill', 'Remplissage direct')}`
                : formData.transaction_type === 'staff_fuel_use'
                  ? `👤 ${tr('Staff Fuel Use', 'Utilisation carburant équipe')}`
                  : `🔄 ${tr('Tank Transfer', 'Transfert réservoir')}`}
          </h2>
          <button
            onClick={handleModalClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
              {errors.submit}
            </div>
          )}

          {/* Transaction Date */}
          {formData.transaction_type !== 'vehicle_refill' && formData.transaction_type !== 'tank_out' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.transaction_type === 'withdrawal'
                ? tr('Withdrawal', 'Retrait')
                : formData.transaction_type === 'staff_fuel_use'
                  ? tr('Fuel use', 'Utilisation carburant')
                  : tr('Refill', 'Remplissage')} {tr('Date', 'Date')} *
            </label>
            <input
              type="date"
              name="transaction_date"
              value={formData.transaction_date}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.transaction_date ? 'border-red-300' : 'border-gray-300'
              }`}
              required
            />
            {errors.transaction_date && (
              <p className="text-red-500 text-sm mt-1">{errors.transaction_date}</p>
            )}
          </div>
          )}

          {(formData.transaction_type === 'tank_refill' || formData.transaction_type === 'tank_out') && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Main Tank</p>
                <p className="text-sm font-semibold text-slate-700">
                  {currentTankLiters}L / {tankCapacity}L
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${tankCapacity > 0 ? Math.min(100, (currentTankLiters / tankCapacity) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Current</p>
                  <p className="font-semibold text-slate-900">{currentTankLiters}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Capacity</p>
                  <p className="font-semibold text-slate-900">{tankCapacity}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p className="font-semibold text-slate-900">{remainingTankLiters}L</p>
                </div>
              </div>
              {enteredAmountLiters > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {formData.transaction_type === 'tank_refill'
                    ? `${tr('After refill:', 'Après remplissage :')} ${projectedTankLiters}L (${projectedTankPercent.toFixed(0)}%)`
                    : `${tr('After withdrawal:', 'Après retrait :')} ${projectedTankAfterVehicleFuel}L (${projectedTankAfterVehicleFuelPercent.toFixed(0)}%)`}
                </div>
              )}
            </div>
          )}

          {/* Vehicle Selection (for vehicle refills and withdrawals) */}
          {isVehicleFuelActionType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle *
              </label>
              {selectedVehicle?.plate_number && (
                <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr('Selected vehicle', 'Véhicule sélectionné')}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-2xl font-black tracking-[0.22em] text-slate-950">
                        {selectedVehicle.plate_number}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {selectedVehicle.name}
                        {selectedVehicle.model ? ` • ${selectedVehicle.model}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-blue-700 shadow-sm">
                      {formData.transaction_type === 'vehicle_refill'
                        ? tr('Direct Fill', 'Remplissage direct')
                        : formData.transaction_type === 'staff_fuel_use'
                          ? tr('Staff Fuel Use', 'Utilisation carburant équipe')
                          : tr('Tank Transfer', 'Transfert réservoir')}
                    </span>
                  </div>
                </div>
              )}
              <div className={`rounded-xl border p-3 ${errors.vehicle_id ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formData.transaction_type === 'vehicle_refill'
                        ? tr('Select a vehicle', 'Sélectionner un véhicule')
                        : formData.transaction_type === 'staff_fuel_use'
                          ? tr('Select the vehicle used by staff', "Sélectionner le véhicule utilisé par l'équipe")
                        : tr('Select the destination vehicle', 'Sélectionner le véhicule de destination')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">{safeVehicles.length} {tr('vehicles', 'véhicules')}</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {safeVehicles.map((vehicle) => {
                    const isActive = String(formData.vehicle_id) === String(vehicle.id);
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => {
                          const cachedState = getCachedVehicleFuelState(vehicle.id);
                          setFormData((prev) => ({
                            ...prev,
                            vehicle_id: String(vehicle.id),
                            odometer_reading: getVehicleCurrentOdometer(vehicle.id),
                            amount: '',
                          }));
                          setVehicleFuelState(cachedState);
                          loadContextData(vehicle.id);
                          if (errors.vehicle_id) {
                            setErrors((prev) => ({ ...prev, vehicle_id: '' }));
                          }
                        }}
                        className={`min-w-[180px] rounded-xl border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <p className={`font-mono text-xs font-semibold tracking-wide ${isActive ? 'text-blue-100' : 'text-blue-700'}`}>
                          {vehicle.plate_number || tr('No plate', 'Sans plaque')}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{vehicle.name}</p>
                        <div className={`mt-1 flex items-center gap-2 text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                          <span>{vehicle.model || tr('No model', 'Sans modèle')}</span>
                          {(() => {
                            const state = getCachedVehicleFuelState(vehicle.id);
                            if (!state) return null;
                            return (
                              <>
                                <span className={isActive ? 'text-blue-200' : 'text-slate-300'}>•</span>
                                <span className={isActive ? 'text-white' : 'text-gray-700'}>
                                  {Number(state.current_fuel_lines || 0)}/8
                                </span>
                                <span>
                                  {roundToHalfLiter(Number(state.current_fuel_liters || 0)).toFixed(1)}L
                                </span>
                              </>
                            );
                          })()}
                        </div>
                        {(() => {
                          const state = getCachedVehicleFuelState(vehicle.id);
                          if (!state) return null;

                          const filledLines = Number(state.current_fuel_lines || 0);
                          return (
                            <div className="mt-3">
                              <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
                                <span className={isActive ? 'text-blue-100' : 'text-gray-500'}>Fuel</span>
                                <span className={isActive ? 'text-white' : 'text-gray-700'}>
                                  {filledLines}/8
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {Array.from({ length: 8 }, (_, index) => index + 1).map((segment) => (
                                  <span
                                    key={segment}
                                    className={`h-1.5 flex-1 rounded-full ${
                                      segment <= filledLines
                                        ? (isActive ? 'bg-white' : 'bg-emerald-500')
                                        : (isActive ? 'bg-white/25' : 'bg-slate-200')
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {errors.vehicle_id && (
                <p className="text-red-500 text-sm mt-1">{errors.vehicle_id}</p>
              )}
              {safeVehicles.length === 0 && (
                <p className="text-yellow-600 text-sm mt-1">⚠️ {tr('No vehicles available. Please add vehicles first.', "Aucun véhicule disponible. Veuillez d'abord ajouter des véhicules.")}</p>
              )}
            </div>
          )}

          {formData.transaction_type === 'withdrawal' && tankSummary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{tr('Main tank available', 'Cuve principale disponible')}</p>
                <p className="text-sm font-semibold text-slate-700">
                  {roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L / {tankCapacity}L
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${tankCapacity > 0 ? Math.min(100, (Number(tankSummary.current_volume_liters || 0) / tankCapacity) * 100) : 0}%`
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Current', 'Actuel')}</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Capacity', 'Capacité')}</p>
                  <p className="font-semibold text-slate-900">{tankCapacity}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Remaining', 'Restant')}</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
              </div>
              {enteredAmountLiters > 0 && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold">{tr('After transfer', 'Après transfert')}</span>
                    <span className="font-semibold">
                      {projectedTankAfterVehicleFuel}L ({projectedTankAfterVehicleFuelPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${projectedTankAfterVehicleFuelPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {formData.transaction_type === 'vehicle_refill' && tankSummary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{tr('Main tank available', 'Cuve principale disponible')}</p>
                <p className="text-sm font-semibold text-slate-700">
                  {roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L / {tankCapacity}L
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-indigo-500 transition-all duration-300"
                  style={{
                    width: `${tankCapacity > 0 ? Math.min(100, (Number(tankSummary.current_volume_liters || 0) / tankCapacity) * 100) : 0}%`
                  }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Current', 'Actuel')}</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Capacity', 'Capacité')}</p>
                  <p className="font-semibold text-slate-900">{tankCapacity}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{tr('Remaining', 'Restant')}</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
              </div>
              {enteredAmountLiters > 0 && (
                <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold">{tr('After direct fill', 'Après remplissage direct')}</span>
                    <span className="font-semibold">
                      {projectedTankAfterVehicleFuel}L ({projectedTankAfterVehicleFuelPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
                    <div
                      className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${projectedTankAfterVehicleFuelPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {isVehicleFuelActionType && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  {tr('Odometer (km)', 'Odomètre (km)')}
                </label>
                <span className="text-xs font-medium text-slate-500">
                  {tr('Fleet:', 'Fleet:')} {selectedVehicle?.current_odometer !== null && selectedVehicle?.current_odometer !== undefined && selectedVehicle?.current_odometer !== ''
                    ? `${selectedVehicle.current_odometer} km`
                    : tr('Not set', 'Non défini')}
                </span>
              </div>
              <input
                type="number"
                name="odometer_reading"
                value={formData.odometer_reading}
                onChange={handleInputChange}
                min="0"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={tr('Vehicle odometer', 'Odomètre du véhicule')}
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.transaction_type === 'withdrawal'
                ? tr('Fuel level after transfer', 'Niveau de carburant après transfert')
                : formData.transaction_type === 'staff_fuel_use'
                  ? tr('Fuel level after staff use', "Niveau de carburant après utilisation de l'équipe")
                : formData.transaction_type === 'tank_out'
                  ? tr('Liters removed', 'Litres retirés')
                  : tr('Liters', 'Litres')} *
            </label>
            {formData.transaction_type === 'staff_fuel_use' ? (
              <>
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">
                        {tr('Select the remaining fuel level', 'Sélectionnez le niveau de carburant restant')}
                      </span>
                      <span className="text-slate-500">
                        {tr('Current:', 'Actuel :')} {currentVehicleLines}/8
                      </span>
                    </div>
                    <div className="mb-2">
                      <button
                        type="button"
                        disabled={currentVehicleLines <= 0}
                        onClick={() => applyStaffFuelUseLine(0)}
                        className={`w-full rounded-xl border px-4 py-3 text-base font-bold transition ${
                          selectedStaffRemainingLines === 0
                            ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                            : 'border-gray-200 bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-slate-100'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {tr('Empty', 'Vide')}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: DEFAULT_FUEL_LINES }, (_, index) => index + 1).map((line) => {
                        const isDisabled = line >= currentVehicleLines;
                        const isActive = selectedStaffRemainingLines === line;

                        return (
                          <button
                            key={line}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => applyStaffFuelUseLine(line)}
                            className={`rounded-xl border px-3 py-3 text-base font-bold transition ${
                              isActive
                                ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                                : 'border-gray-300 bg-white text-gray-800 hover:border-rose-300 hover:bg-rose-50'
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <span className="block">{line}/8</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Current', 'Actuel')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{currentVehicleLines}/8</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Used', 'Utilisé')}</p>
                      <p className="mt-2 text-lg font-black text-rose-700">
                        {formData.amount ? `-${selectedStaffConsumedLines}/8` : tr('Not set', 'Non défini')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {formData.amount ? `${selectedStaffConsumedLiters.toFixed(2)}L` : '0.00L'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Remaining', 'Restant')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {selectedStaffRemainingLines !== null ? `${selectedStaffRemainingLines}/8` : `${currentVehicleLines}/8`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedStaffRemainingLines !== null
                      ? tr(
                          `This will save ${selectedStaffConsumedLiters.toFixed(2)}L of staff fuel use for this vehicle.`,
                          `Cela enregistrera ${selectedStaffConsumedLiters.toFixed(2)}L d'utilisation carburant équipe pour ce véhicule.`
                        )
                      : tr(
                          'Choose the remaining fuel level to calculate staff fuel use instantly.',
                          "Choisissez le niveau restant pour calculer immédiatement l'utilisation carburant équipe."
                        )}
                  </p>
                </div>
                {errors.fuel_lines_after && (
                  <p className="text-red-500 text-sm mt-2">{errors.fuel_lines_after}</p>
                )}
              </>
            ) : formData.transaction_type === 'withdrawal' ? (
              <>
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">{tr('Select the vehicle final fuel line', 'Sélectionnez la ligne finale de carburant du véhicule')}</span>
                      <span className="text-slate-500">
                        {tr('Current:', 'Actuel :')} {currentVehicleLines}/8
                      </span>
                    </div>
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{tr('Maximum reachable right now', 'Maximum atteignable maintenant')}</span>
                        <span className="font-semibold">
                          {maximumReachableTransferLineLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        {tr(
                          `${roundToHalfLiter(currentTankLiters).toFixed(1)}L is available in the main tank, so the transfer cannot go beyond ${maximumReachableTransferLineLabel}.`,
                          `${roundToHalfLiter(currentTankLiters).toFixed(1)}L est disponible dans la cuve principale, donc le transfert ne peut pas dépasser ${maximumReachableTransferLineLabel}.`
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: DEFAULT_FUEL_LINES }, (_, index) => index + 1).map((line) => {
                        const isDisabled = isVehicleFullForTransfer || line <= currentVehicleLines || line > maxReachableTransferLines;
                        const isActive = selectedTransferTargetLines === line;

                        return (
                          <button
                            key={line}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => applyTransferTargetLine(line)}
                            className={`rounded-xl border px-3 py-3 text-base font-bold transition ${
                              isActive
                                ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                                : 'border-gray-300 bg-white text-gray-800 hover:border-violet-300 hover:bg-violet-50'
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <span className="block">{line}/8</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={isVehicleFullForTransfer || maxVehicleLiters <= 0}
                      onClick={() => applyTransferTargetLine(DEFAULT_FUEL_LINES)}
                      className={`mt-3 w-full rounded-xl border px-4 py-3 text-base font-bold transition ${
                        selectedTransferTargetLines === DEFAULT_FUEL_LINES
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : hasLimitedTransferRange
                            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {hasLimitedTransferRange
                        ? tr(`Full not reachable now (max ${maximumReachableTransferLineLabel})`, `Plein impossible maintenant (max ${maximumReachableTransferLineLabel})`)
                        : 'Full'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Current', 'Actuel')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{currentVehicleLines}/8</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Added', 'Ajouté')}</p>
                      <p className="mt-2 text-lg font-black text-violet-700">
                        {formData.amount ? `+${selectedAddedLinesApprox}/8` : tr('Not set', 'Non défini')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {formData.amount ? `${roundToHalfLiter(enteredAmountLiters).toFixed(1)}L` : '0.0L'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Final', 'Final')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {selectedTransferTargetLines ? `${selectedTransferTargetLines}/8` : `${currentVehicleLines}/8`}
                      </p>
                    </div>
                  </div>
                </div>
                {isVehicleFullForTransfer && (
                  <p className="mt-2 text-xs font-medium text-red-600">{tr('The vehicle tank is already full.', 'Le réservoir du véhicule est déjà plein.')}</p>
                )}
              </>
            ) : formData.transaction_type === 'vehicle_refill' ? (
              <>
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">
                        {tr('Select the final fuel line after direct fill', 'Sélectionnez la ligne finale de carburant après remplissage direct')}
                      </span>
                      <span className="text-slate-500">
                        {tr('Current:', 'Actuel :')} {currentVehicleLines}/8
                      </span>
                    </div>
                    <div className="mb-2">
                      <button
                        type="button"
                        disabled={isVehicleFullForTransfer || currentVehicleLines > 0}
                        onClick={() => applyTransferTargetLine(0)}
                        className={`w-full rounded-xl border px-4 py-3 text-base font-bold transition ${
                          currentVehicleLines === 0 && !formData.amount
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]'
                            : 'border-gray-200 bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-slate-100'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {tr('Empty', 'Vide')}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: DEFAULT_FUEL_LINES }, (_, index) => index + 1).map((line) => {
                        const isDisabled = isVehicleFullForTransfer || line <= currentVehicleLines || line > maxReachableTransferLines;
                        const isActive = selectedTransferTargetLines === line;

                        return (
                          <button
                            key={line}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => applyTransferTargetLine(line)}
                            className={`rounded-xl border px-3 py-3 text-base font-bold transition ${
                              isActive
                                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                : 'border-gray-300 bg-white text-gray-800 hover:border-indigo-300 hover:bg-indigo-50'
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <span className="block">{line}/8</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={isVehicleFullForTransfer || maxVehicleLiters <= 0}
                      onClick={() => applyTransferTargetLine(DEFAULT_FUEL_LINES)}
                      className={`mt-3 w-full rounded-xl border px-4 py-3 text-base font-bold transition ${
                        selectedTransferTargetLines === DEFAULT_FUEL_LINES
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {tr('Full', 'Plein')}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Current', 'Actuel')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{currentVehicleLines}/8</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Added', 'Ajouté')}</p>
                      <p className="mt-2 text-lg font-black text-indigo-700">
                        {formData.amount ? `+${selectedAddedLinesApprox}/8` : tr('Not set', 'Non défini')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {formData.amount ? `${roundTo(enteredAmountLiters, 2).toFixed(2)}L` : '0.00L'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Final', 'Final')}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {selectedTransferTargetLines ? `${selectedTransferTargetLines}/8` : `${currentVehicleLines}/8`}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      {tr('Custom liters', 'Litres personnalisés')}
                    </label>
                    <input
                      type="text"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      inputMode="decimal"
                      disabled={isVehicleFullForTransfer || litersPickerOptions.length === 0}
                      className={`mt-2 w-full rounded-xl border px-4 py-4 text-lg font-semibold [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        errors.amount ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder={isVehicleFullForTransfer || litersPickerOptions.length === 0 ? tr('Tank full', 'Réservoir plein') : tr('Enter liters', 'Entrez les litres')}
                      required
                    />
                  </div>
                </div>
                {(isVehicleFullForTransfer || litersPickerOptions.length === 0) && (
                  <p className="mt-2 text-xs font-medium text-red-600">{tr('Vehicle tank is full.', 'Le réservoir du véhicule est plein.')}</p>
                )}
                {!isVehicleFullForTransfer && maxVehicleLiters <= 0 && (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    {tr('No fuel is available in the main tank for a transfer right now.', "Aucun carburant n'est disponible dans la cuve principale pour un transfert pour le moment.")}
                  </p>
                )}
              </>
            ) : (
              <input
                type="text"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={formData.transaction_type === 'tank_refill' ? remainingTankLiters || undefined : undefined}
                disabled={isVehicleFullForTransfer}
                className={`w-full rounded-xl border px-4 py-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                required
              />
            )}
            {errors.amount && (
              <p className="text-red-500 text-sm mt-1">{errors.amount}</p>
            )}
          </div>

          {/* Cost fields */}
          {(formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('Price per liter (MAD)', 'Prix par litre (MAD)')}
                  {' *'}
                </label>
                <input
                  type="text"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleInputChange}
                  inputMode="decimal"
                  className={`w-full rounded-xl border px-4 py-4 text-lg font-semibold [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                    errors.unit_price ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  required
                />
                {errors.unit_price && (
                  <p className="text-red-500 text-sm mt-1">{errors.unit_price}</p>
                )}
              </div>
            </>
          )}

          {(formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') && (
            <>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('Total cost (MAD)', 'Coût total (MAD)')}
                </label>
                <input
                  type="text"
                  name="cost"
                  value={formData.cost}
                  onChange={handleInputChange}
                  inputMode="decimal"
                  className={`w-full rounded-xl border px-4 py-4 text-lg font-semibold [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                    errors.cost ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00 MAD"
                />
                {errors.cost && (
                  <p className="text-red-500 text-sm mt-1">{errors.cost}</p>
                )}
              </div>
            </>
          )}

          {formData.transaction_type === 'tank_out' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Reason', 'Raison')}
              </label>
              <input
                type="text"
                name="purpose"
                value={formData.purpose || ''}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={tr('Reason', 'Raison')}
              />
            </div>
          )}

          {formData.transaction_type === 'staff_fuel_use' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Reason', 'Raison')}
              </label>
              <input
                type="text"
                name="purpose"
                value={formData.purpose || ''}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder={tr('Internal driving, delivery, pickup...', 'Conduite interne, livraison, récupération...')}
              />
            </div>
          )}

          {/* Receipt / image upload */}
          {(formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.transaction_type === 'tank_refill' ? tr('Invoice image', 'Image de facture') : tr('Receipt / fuel photo', 'Reçu / photo carburant')}
              </label>
              
              {!hasImageToShow ? (
                <div
                  className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={openCameraPicker}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                      >
                        <Camera className="h-4 w-4" />
                        {tr('Camera', 'Caméra')}
                      </button>
                      <button
                        type="button"
                        onClick={openImportPicker}
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                      >
                        <Upload className="h-4 w-4" />
                        {tr('Import', 'Importer')}
                      </button>
                    </div>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/*,.heic,.heif,.webp,.HEIC,.HEIF,.WEBP"
                      capture="environment"
                      onChange={handleFileInputChange}
                    />
                    <input
                      ref={importInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/*,.pdf,.heic,.heif,.webp,.HEIC,.HEIF,.WEBP,.PDF"
                      onChange={handleFileInputChange}
                    />
                    <p className="text-gray-500 text-sm mt-3">
                      {tr('or drag and drop', 'ou glissez-déposez')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {formData.transaction_type === 'tank_refill' ? 'JPG, PNG, WEBP, HEIC, PDF up to 5MB' : 'JPG, PNG, WEBP, HEIC, PDF up to 5MB'}
                  </p>
                </div>
              ) : (
                <div className="border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {imagePreview === 'pdf' ? (
                        <FileText className="h-8 w-8 text-red-500" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-blue-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formData.invoice_image?.name || existingImageInfo?.name || tr('Existing attachment', 'Pièce jointe existante')}
                        </p>
                        {(formData.invoice_image?.size || existingImageInfo?.size) && (
                          <p className="text-xs text-gray-500">
                            {((formData.invoice_image?.size || existingImageInfo?.size) / 1024 / 1024).toFixed(2)} MB
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeImage}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title={tr('Remove image', "Supprimer l'image")}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {imagePreview && imagePreview !== 'pdf' && imagePreview !== 'image-file' && (
                    <div className="mt-3">
                      <img
                        src={imagePreview}
                        alt={tr('Attachment preview', 'Aperçu de la pièce jointe')}
                        className="max-w-full h-32 object-contain rounded border"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {errors.invoice_image && (
                <p className="text-red-500 text-sm mt-1">{errors.invoice_image}</p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setShowAdvancedDetails((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{tr('More Details', 'Plus de détails')}</p>
                <p className="text-xs text-gray-500">{tr('Operator, area, and notes', 'Opérateur, zone et notes')}</p>
              </div>
              {showAdvancedDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {showAdvancedDetails && (
              <div className="space-y-4 border-t border-gray-200 px-4 py-4">
                {formData.transaction_type === 'vehicle_refill' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {tr('Fill date', 'Date du remplissage')}
                      </label>
                      <input
                        type="date"
                        name="transaction_date"
                        value={formData.transaction_date}
                        onChange={handleInputChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                  </>
                )}

                {formData.transaction_type !== 'withdrawal' && formData.transaction_type !== 'staff_fuel_use' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Station name', 'Nom de la station')}
                    </label>
                    <input
                      type="text"
                      name="fuel_station"
                      value={formData.fuel_station}
                      onChange={handleInputChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={tr('Station name', 'Nom de la station')}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Filled By', 'Rempli par')}
                  </label>
                  <input
                    type="text"
                    name="filled_by"
                    value={formData.filled_by}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tr('Operator name', "Nom de l'opérateur")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Area / location', 'Zone / lieu')}
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tr('Area, branch, or pickup point', 'Zone, agence ou point de départ')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tr('Notes', 'Notes')}
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={tr('Optional notes about this transaction...', 'Notes facultatives sur cette transaction...')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              disabled={isLoading}
            >
              {tr('Cancel', 'Annuler')}
            </button>
            <button
              type="submit"
              className={`flex-1 rounded-xl px-4 py-4 text-base font-semibold text-white transition-colors disabled:opacity-50 ${
                formData.transaction_type === 'vehicle_refill'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : formData.transaction_type === 'staff_fuel_use'
                    ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              disabled={isLoading || isVehicleFullForTransfer || !isStaffFuelUseReady}
            >
              {isLoading
                ? tr('Saving...', 'Enregistrement...')
                : formData.transaction_type === 'vehicle_refill'
                  ? (isEditMode ? tr('Update Direct Fill', 'Mettre à jour le remplissage direct') : tr('Save Direct Fill', 'Enregistrer le remplissage direct'))
                  : formData.transaction_type === 'staff_fuel_use'
                    ? (isEditMode ? tr('Update Staff Fuel Use', "Mettre à jour l'utilisation carburant équipe") : tr('Save Staff Fuel Use', "Enregistrer l'utilisation carburant équipe"))
                  : `${isEditMode ? tr('Update', 'Mettre à jour') : tr('Save', 'Enregistrer')} ${formData.transaction_type === 'withdrawal' ? tr('Withdrawal', 'retrait') : tr('Refill', 'remplissage')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFuelTransactionModal;
