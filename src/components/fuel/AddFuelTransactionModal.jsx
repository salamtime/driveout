import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, FileText, Trash2, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import FuelTransactionService from '../../services/FuelTransactionService';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_VEHICLE_TANK_LITERS, litersToLines, roundTo } from '../../utils/fuelMath';
import { formatVehicleLabel } from '../../utils/vehicleLabels';

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'tank_refill', label: '⛽ Tank In' },
  { value: 'tank_out', label: '🛢️ Tank Out' },
  { value: 'vehicle_refill', label: '🚗 Direct Fill' },
  { value: 'withdrawal', label: '🔄 Transfer' }
];

const QUICK_LITER_PRESETS = [5, 10, 15, 20];

const normalizeDecimalInput = (value = '') => value.replace(',', '.');

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

  const getCachedVehicleFuelState = (vehicleId = '') =>
    (Array.isArray(vehicleStates) ? vehicleStates : []).find((state) => String(state.id) === String(vehicleId)) || null;

  const loadContextData = async (vehicleId = '') => {
    const cachedVehicleState = vehicleId ? getCachedVehicleFuelState(vehicleId) : null;
    if (cachedVehicleState) {
      setVehicleFuelState(cachedVehicleState);
    }

    const [tank, vehicleState] = await Promise.all([
      providedTankSummary ? Promise.resolve(providedTankSummary) : FuelTransactionService.getFuelTankData(),
      vehicleId ? FuelTransactionService.getVehicleFuelState(vehicleId) : Promise.resolve(null),
    ]);

    setTankSummary(tank);
    setVehicleFuelState(vehicleState || cachedVehicleState);
  };

  // Populate form when editing
  useEffect(() => {
    if (isOpen) {
      loadContextData(editTransaction?.vehicle_id || initialVehicleId || '');
      if (editTransaction) {
        console.log('📝 EDIT MODE: Populating form with transaction:', editTransaction);
        
        // Extract the real ID from prefixed ID (e.g., "refill-123" -> "123")
        const realId = editTransaction.id?.replace(/^(refill|withdrawal)-/, '') || editTransaction.id;
        
        setFormData({
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
          filled_by: editTransaction.performed_by_name || editTransaction.filled_by || editTransaction.created_by || userProfile?.fullName || userProfile?.email || '',
          notes: editTransaction.notes || '',
          invoice_image: editTransaction.invoice_image || null // Preserve original image data
        });
        
        // Handle existing invoice image preview
        if (editTransaction.invoice_image) {
          console.log('🖼️ Processing existing invoice image:', editTransaction.invoice_image);
          
          // Check if it's a base64 image (has 'data' property with base64 string)
          if (editTransaction.invoice_image.data) {
            console.log('✅ Base64 image detected, setting preview');
            setImagePreview(editTransaction.invoice_image.data);
            setExistingImageInfo({
              name: editTransaction.invoice_image.name || 'Existing invoice',
              size: editTransaction.invoice_image.size || null,
              type: editTransaction.invoice_image.type || 'image'
            });
          } 
          // Check if it's a storage URL (has 'url' property)
          else if (editTransaction.invoice_image.url) {
            console.log('✅ Storage URL detected, setting preview');
            setImagePreview(editTransaction.invoice_image.url);
            setExistingImageInfo({
              name: editTransaction.invoice_image.name || 'Existing invoice',
              size: editTransaction.invoice_image.size || null,
              type: editTransaction.invoice_image.type || 'storage'
            });
          }
          // Check if it's a PDF
          else if (editTransaction.invoice_image.type === 'application/pdf') {
            console.log('✅ PDF detected');
            setImagePreview('pdf');
            setExistingImageInfo({
              name: editTransaction.invoice_image.name || 'Existing invoice.pdf',
              size: editTransaction.invoice_image.size || null,
              type: 'application/pdf'
            });
          }
          else {
            console.log('⚠️ Unknown invoice image format');
            setImagePreview(null);
            setExistingImageInfo(null);
          }
        } else {
          setImagePreview(null);
          setExistingImageInfo(null);
        }
      } else {
        console.log('➕ ADD MODE: Resetting form');
        // Reset form for new transaction
        setFormData({
          transaction_date: new Date().toISOString().split('T')[0],
          transaction_type: transactionType,
          source: transactionType,
          vehicle_id: initialVehicleId || '',
          amount: '',
          cost: '',
          unit_price: '',
          fuel_type: 'gasoline',
          fuel_station: transactionType === 'vehicle_refill' ? 'Direct Fill' : transactionType === 'withdrawal' ? 'Main Tank' : '',
          location: '',
          odometer_reading: getVehicleCurrentOdometer(initialVehicleId || ''),
          filled_by: userProfile?.fullName || userProfile?.email || '',
          notes: '',
          invoice_image: null
        });
        setImagePreview(null);
        setExistingImageInfo(null);
      }
      setErrors({});
      setShowAdvancedDetails(false);
    }
  }, [isOpen, editTransaction, transactionType, userProfile, initialVehicleId, providedTankSummary]);

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
        const amount = parseFloat(prev.amount) || 0;
        const unitPrice = parseFloat(normalizedValue) || 0;
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

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'vehicle_id') {
      loadContextData(value);
    }

    // Calculate total cost when amount or unit price changes
    if (name === 'amount' || name === 'unit_price') {
      const amount = name === 'amount' ? parseFloat(value) || 0 : parseFloat(formData.amount) || 0;
      const unitPrice = name === 'unit_price'
        ? parseFloat(normalizeDecimalInput(value)) || 0
        : parseFloat(normalizeDecimalInput(formData.unit_price)) || 0;
      
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
      fuel_station: nextType === 'vehicle_refill' ? 'Direct Fill' : nextType === 'withdrawal' ? 'Main Tank' : nextType === 'tank_out' ? 'Main Tank' : '',
      cost: nextType === 'withdrawal' ? '' : prev.cost
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

  const handleImageUpload = (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({
        ...prev,
        invoice_image: 'Please upload a JPG, PNG, or PDF file'
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

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview('pdf');
    }

    setFormData(prev => ({
      ...prev,
      invoice_image: file
    }));

    // Clear existing image info when uploading new file
    setExistingImageInfo(null);

    // Clear error
    setErrors(prev => ({
      ...prev,
      invoice_image: ''
    }));
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleImageUpload(file);
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
      newErrors.transaction_date = 'Transaction date is required';
    }

    if (!formData.transaction_type) {
      newErrors.transaction_type = 'Transaction type is required';
    }

    if (formData.transaction_type === 'vehicle_refill' && !formData.vehicle_id) {
      newErrors.vehicle_id = 'Vehicle is required for vehicle refills';
    }

    if (formData.transaction_type === 'withdrawal' && !formData.vehicle_id) {
      newErrors.vehicle_id = 'Vehicle is required for withdrawals';
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
      newErrors.amount = 'This vehicle fuel tank is already full. Tank transfer is blocked.';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (formData.transaction_type === 'tank_refill' && parseFloat(formData.amount || 0) > remainingTankLiters) {
      newErrors.amount = `Max ${remainingTankLiters}L remaining`;
    }

    if (formData.transaction_type === 'tank_out' && parseFloat(formData.amount || 0) > currentTankLiters) {
      newErrors.amount = `Max ${currentTankLiters}L available`;
    }

    if (
      (formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') &&
      (!formData.unit_price || parseFloat(normalizeDecimalInput(formData.unit_price)) <= 0)
    ) {
      newErrors.unit_price = 'Price per liter must be greater than 0';
    }

    if (
      (formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') &&
      formData.cost &&
      parseFloat(formData.cost) <= 0
    ) {
      newErrors.cost = 'Cost must be greater than 0';
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
          console.log('📤 New image file uploaded, converting to base64...');
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
          console.log('✅ Image converted to base64');
        } else {
          // Existing image data - preserve it
          console.log('💾 Preserving existing image data');
          imageData = formData.invoice_image;
        }
      } else {
        console.log('🗑️ No image data (will be set to null)');
      }

      const transactionData = {
        ...formData,
        invoice_image: imageData,
        receipt_media: imageData,
        actor: userProfile
      };

      let result;
      const isEditMode = !!editTransaction;

      if (isEditMode) {
        // Update existing transaction
        console.log('🔄 Updating transaction:', formData.id, 'with image:', imageData ? 'YES' : 'NO');
        result = await FuelTransactionService.updateTransaction(formData.id, transactionData);
      } else {
        // Create new transaction
        console.log('➕ Creating new transaction with image:', imageData ? 'YES' : 'NO');
        result = await FuelTransactionService.createTransaction(transactionData);
      }
      
      if (result.success) {
        console.log('✅ Transaction saved successfully:', result.transaction);
        // Call onSave callback if provided
        if (onSave && typeof onSave === 'function') {
          onSave(result.transaction);
        }
        if (onSuccess && typeof onSuccess === 'function') {
          onSuccess(result.transaction);
        }
        onClose();
      } else {
        setErrors({ submit: result.error || `Failed to ${isEditMode ? 'update' : 'create'} transaction` });
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
      setErrors({ submit: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const unitPrice = formData.amount && formData.cost ? 
    (parseFloat(formData.cost) / parseFloat(formData.amount)).toFixed(2) : '0.00';

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
  const projectedTankLiters = roundTo(Math.min(tankCapacity, currentTankLiters + (Number(formData.amount || 0) || 0)), 2);
  const projectedTankPercent = tankCapacity > 0 ? Math.min(100, (projectedTankLiters / tankCapacity) * 100) : 0;

  const projectedVehicleLines = (() => {
    if (!vehicleFuelState || !formData.amount) return null;
    const currentLiters = Number(vehicleFuelState.current_fuel_liters || 0);
    const addedLiters = Number(formData.amount || 0);
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
    const vehicleRemaining = Math.max(0, roundTo(vehicleTankCapacity - currentFuelLiters, 2));
    const tankAvailable =
      formData.transaction_type === 'withdrawal'
        ? Math.max(0, roundTo(Number(tankSummary?.current_volume_liters || 0), 2))
        : vehicleRemaining;
    const maxLiters = Math.max(0, roundTo(Math.min(vehicleRemaining, tankAvailable), 2));

    if (maxLiters <= 0) {
      return [];
    }

    const options = [];
    for (let value = 0.5; value <= maxLiters; value += 0.5) {
      options.push(roundTo(value, 2));
    }

    if (!options.includes(maxLiters)) {
      options.push(maxLiters);
    }

    return options;
  })();

  const maxVehicleLiters = litersPickerOptions.length ? Number(litersPickerOptions[litersPickerOptions.length - 1]) : 0;

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

  const quickLiterOptions = (() => {
    if (formData.transaction_type !== 'vehicle_refill' && formData.transaction_type !== 'withdrawal') {
      return [];
    }

    const filtered = QUICK_LITER_PRESETS.filter((value) => value <= maxVehicleLiters);
    if (maxVehicleLiters > 0 && !filtered.includes(maxVehicleLiters)) {
      filtered.push(maxVehicleLiters);
    }
    return Array.from(new Set(filtered)).sort((a, b) => a - b);
  })();

  // Log for debugging
  console.log('🔍 MODAL: Render', {
    isEditMode,
    editTransaction: editTransaction?.id,
    formData: formData,
    imagePreview: imagePreview ? (imagePreview === 'pdf' ? 'PDF' : 'Image') : null,
    existingImageInfo,
    hasInvoiceImage: !!formData.invoice_image,
    invoiceImageType: formData.invoice_image instanceof File ? 'File' : (formData.invoice_image ? 'Data' : 'null'),
    vehiclesCount: safeVehicles.length
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${
        formData.transaction_type === 'vehicle_refill' ? 'max-w-2xl' : 'max-w-md'
      }`}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {modalTitle} {formData.transaction_type === 'tank_refill'
              ? '⛽ Tank In'
              : formData.transaction_type === 'tank_out'
                ? '🛢️ Tank Out'
              : formData.transaction_type === 'vehicle_refill'
                ? '🚗 Direct Fill'
                : '🔄 Transfer'}
          </h2>
          <button
            onClick={onClose}
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
              {formData.transaction_type === 'withdrawal' ? 'Withdrawal' : 'Refill'} Date *
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
              {Number(formData.amount || 0) > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {formData.transaction_type === 'tank_refill'
                    ? `After refill: ${projectedTankLiters}L (${projectedTankPercent.toFixed(0)}%)`
                    : `After removal: ${roundTo(Math.max(0, currentTankLiters - (Number(formData.amount || 0) || 0)), 2)}L (${tankCapacity > 0 ? Math.max(0, ((Math.max(0, currentTankLiters - (Number(formData.amount || 0) || 0))) / tankCapacity) * 100).toFixed(0) : 0}%)`}
                </div>
              )}
            </div>
          )}

          {/* Vehicle Selection (for vehicle refills and withdrawals) */}
          {(formData.transaction_type === 'vehicle_refill' || formData.transaction_type === 'withdrawal') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle *
              </label>
              {selectedVehicle?.plate_number && (
                <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Selected vehicle
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
                      {formData.transaction_type === 'vehicle_refill' ? 'Direct Fill' : 'Transfer'}
                    </span>
                  </div>
                </div>
              )}
              <div className={`rounded-xl border p-3 ${errors.vehicle_id ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formData.transaction_type === 'vehicle_refill' ? 'Select vehicle' : 'Select destination vehicle'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">{safeVehicles.length} vehicles</p>
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
                          {vehicle.plate_number || 'No Plate'}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{vehicle.name}</p>
                        <div className={`mt-1 flex items-center gap-2 text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                          <span>{vehicle.model || 'No model'}</span>
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
                                  {roundTo(Number(state.current_fuel_liters || 0), 2)}L
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
                <p className="text-yellow-600 text-sm mt-1">⚠️ No vehicles available. Please add vehicles first.</p>
              )}
            </div>
          )}

          {formData.transaction_type === 'withdrawal' && tankSummary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Main Tank Available</p>
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
                  <p className="text-xs text-slate-500">Current</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Capacity</p>
                  <p className="font-semibold text-slate-900">{tankCapacity}L</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Remaining</p>
                  <p className="font-semibold text-slate-900">{roundTo(Number(tankSummary.current_volume_liters || 0), 2)}L</p>
                </div>
              </div>
            </div>
          )}

          {(formData.transaction_type === 'vehicle_refill' || formData.transaction_type === 'withdrawal') && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  Odometer (km)
                </label>
                <span className="text-xs font-medium text-slate-500">
                  Fleet: {selectedVehicle?.current_odometer !== null && selectedVehicle?.current_odometer !== undefined && selectedVehicle?.current_odometer !== ''
                    ? `${selectedVehicle.current_odometer} km`
                    : 'Not set'}
                </span>
              </div>
              <input
                type="number"
                name="odometer_reading"
                value={formData.odometer_reading}
                onChange={handleInputChange}
                min="0"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Vehicle odometer"
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.transaction_type === 'withdrawal'
                ? 'Liters Transferred to Vehicle'
                : formData.transaction_type === 'tank_out'
                  ? 'Liters Removed'
                  : 'Liters'} *
            </label>
            {(formData.transaction_type === 'vehicle_refill' || formData.transaction_type === 'withdrawal') ? (
              <>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {quickLiterOptions.map((liters) => {
                      const isActive = Number(formData.amount) === Number(liters);
                      return (
                        <button
                          key={liters}
                          type="button"
                          disabled={isVehicleFullForTransfer || litersPickerOptions.length === 0}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, amount: String(liters) }));
                            if (errors.amount) {
                              setErrors((prev) => ({ ...prev, amount: '' }));
                            }
                          }}
                          className={`rounded-xl border px-4 py-3 text-base font-bold transition ${
                            isActive
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'border-gray-300 bg-white text-gray-800 hover:border-blue-300 hover:bg-blue-50'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {liters}L
                        </button>
                      );
                    })}
                    {maxVehicleLiters > 0 && (
                      <button
                        type="button"
                        disabled={isVehicleFullForTransfer || litersPickerOptions.length === 0}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, amount: String(maxVehicleLiters) }));
                          if (errors.amount) {
                            setErrors((prev) => ({ ...prev, amount: '' }));
                          }
                        }}
                        className={`rounded-xl border px-4 py-3 text-base font-bold transition ${
                          Number(formData.amount) === Number(maxVehicleLiters)
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Full
                      </button>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Custom liters
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      step="0.5"
                      min="0.5"
                      max={maxVehicleLiters || undefined}
                      disabled={isVehicleFullForTransfer || litersPickerOptions.length === 0}
                      className={`mt-2 w-full rounded-xl border px-4 py-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.amount ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder={isVehicleFullForTransfer || litersPickerOptions.length === 0 ? 'Tank full' : 'Enter liters'}
                      required
                    />
                  </div>
                </div>
                {(isVehicleFullForTransfer || litersPickerOptions.length === 0) && (
                  <p className="mt-2 text-xs font-medium text-red-600">Vehicle tank is full.</p>
                )}
              </>
            ) : (
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
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
                  Price per Liter (MAD) *
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Cost (MAD)
                </label>
                <input
                  type="text"
                  name="cost"
                  value={formData.cost}
                  inputMode="decimal"
                  className={`w-full rounded-xl border px-4 py-4 text-lg font-semibold [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                    errors.cost ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00 MAD"
                  readOnly
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
                Reason
              </label>
              <input
                type="text"
                name="purpose"
                value={formData.purpose || ''}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reason"
              />
            </div>
          )}

          {/* Receipt / image upload */}
          {(formData.transaction_type === 'tank_refill' || formData.transaction_type === 'vehicle_refill') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.transaction_type === 'tank_refill' ? 'Invoice Image' : 'Receipt / Fuel Photo'}
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
                        Camera
                      </button>
                      <button
                        type="button"
                        onClick={openImportPicker}
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                      >
                        <Upload className="h-4 w-4" />
                        Import
                      </button>
                    </div>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileInputChange}
                    />
                    <input
                      ref={importInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/*,.pdf"
                      onChange={handleFileInputChange}
                    />
                    <p className="text-gray-500 text-sm mt-3">
                      or drag and drop
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {formData.transaction_type === 'tank_refill' ? 'JPG, PNG, PDF up to 5MB' : 'JPG, PNG, PDF up to 5MB'}
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
                          {formData.invoice_image?.name || existingImageInfo?.name || 'Existing invoice'}
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
                      title="Remove image"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {imagePreview && imagePreview !== 'pdf' && (
                    <div className="mt-3">
                      <img
                        src={imagePreview}
                        alt="Invoice preview"
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
                <p className="text-sm font-semibold text-gray-900">More Details</p>
                <p className="text-xs text-gray-500">Operator, location, and notes</p>
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
                        Direct Fill Date
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

                {formData.transaction_type !== 'withdrawal' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fuel Station
                    </label>
                    <input
                      type="text"
                      name="fuel_station"
                      value={formData.fuel_station}
                      onChange={handleInputChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Station name"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filled By
                  </label>
                  <input
                    type="text"
                    name="filled_by"
                    value={formData.filled_by}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Operator name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Location"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional notes about this transaction..."
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
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 rounded-xl px-4 py-4 text-base font-semibold text-white transition-colors disabled:opacity-50 ${
                formData.transaction_type === 'vehicle_refill'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              disabled={isLoading || isVehicleFullForTransfer}
            >
              {isLoading
                ? 'Saving...'
                : formData.transaction_type === 'vehicle_refill'
                  ? (isEditMode ? 'Update Direct Fill' : 'Refill Vehicle Now')
                  : `${isEditMode ? 'Update' : 'Save'} ${formData.transaction_type === 'withdrawal' ? 'Withdrawal' : 'Refill'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFuelTransactionModal;
