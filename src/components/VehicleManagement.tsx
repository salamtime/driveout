import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, Search, Car, Calendar, AlertTriangle, X, FileText, Gauge, Wrench, Shield, Image as ImageIcon, StickyNote, File, Clock, CheckCircle, AlertCircle, DollarSign, LayoutGrid, List, RefreshCw, ExternalLink, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import VehicleModelService from '../services/VehicleModelService';
import VehicleModelMigrationRunner from './VehicleModelMigrationRunner';
import SegwayCleanupRunner from './SegwayCleanupRunner';
import VehicleImageUpload from './VehicleImageUpload';
import { normalizeVehicleImageUrl } from '../utils/vehicleImage';
import DocumentUpload from './DocumentUpload';
import VehicleDocuments from './VehicleDocuments';
import VehicleModelEditModal from './admin/VehicleModelEditModal';
import MaintenanceTrackingService from '../services/MaintenanceTrackingService';
import FuelTransactionService from '../services/FuelTransactionService';
import alertService from '../services/AlertService';
import GridSkeleton from './ui/GridSkeleton';
import { TBL } from '../config/tables';
import VehicleGridView from './VehicleGridView';
import VehicleListView from './VehicleListView';
import AdminModuleHero from './admin/AdminModuleHero';
import FleetLocationsManager from './admin/FleetLocationsManager';
import { resolveTankCapacityLiters } from '../utils/vehicleModelSpecs';
import i18n from '../i18n';
import FleetLocationService from '../services/FleetLocationService';
import WebsiteBookingLifecycleService from '../services/WebsiteBookingLifecycleService';
import VehicleDispositionService from '../services/VehicleDispositionService';

const scheduleBackgroundTask = (callback: () => void) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 800 });
  }

  return window.setTimeout(callback, 0);
};
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en: string, fr: string) => (isFrenchLocale() ? fr : en);

interface Vehicle {
  id: number;
  name: string;
  model: string;
  vehicle_type: string;
  power_cc: number;
  capacity: number;
  color: string;
  location_id: number | null;
  status: 'available' | 'rented' | 'impounded' | 'tour' | 'maintenance' | 'out_of_service' | 'sold' | 'disposed';
  image_url: string;
  features: string[];
  plate_number: string;
  current_odometer: string | null;
  engine_hours: string | null;
  last_oil_change_date: string | null;
  last_oil_change_odometer: string | null;
  next_oil_change_due: string | null;
  next_oil_change_odometer: string | null;
  registration_number: string;
  registration_expiry_date: string | null;
  insurance_policy_number: string;
  insurance_provider: string;
  insurance_expiry_date: string | null;
  general_notes: string;
  notes: string;
  created_at: string;
  updated_at: string;
  vehicle_model_id: string;
  documents?: VehicleDocument[];
  document_count?: number;
  // New acquisition fields
  purchase_cost_mad: number | null;
  purchase_date: string | null;
  purchase_supplier: string | null;
  purchase_invoice_url: string | null;
  registration_date?: string | null;
  sold_date?: string | null;
  sale_price_mad?: number | null;
  sold_buyer_name?: string | null;
  sale_proof_url?: string | null;
  sale_proof_name?: string | null;
  sale_notes?: string | null;
  location_name?: string | null;
}

interface FleetLocation {
  id: number;
  name: string;
  code?: string | null;
  address?: string | null;
  is_active: boolean;
  is_default: boolean;
  display_order: number;
}

interface VehicleDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  category?: string;
}

interface VehicleModel {
  id: string;
  name: string;
  model: string;
  vehicle_type: string;
  power_cc_min: number;
  power_cc_max: number;
  capacity_min: number;
  capacity_max: number;
  description: string;
  image_url: string | null;
  features: string[];
  tank_capacity_liters?: number | null;
  is_active: boolean;
  vehicles?: { count: number }[];
}

interface MaintenanceRecord {
  id: string;
  vehicle_id: number;
  service_date: string;
  maintenance_type: string;
  status: string;
  description: string;
  cost?: number;
  odometer_reading?: number;
  next_service_date?: string;
  technician_name: string;
  created_at: string;
  updated_at: string;
}

const VehicleManagement: React.FC = () => {
  // Console log for canonical path identification
  console.log('VEHICLE_FORM_CANONICAL_PATH: /workspace/react_template/src/components/VehicleManagement.tsx');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [impoundedVehicleIds, setImpoundedVehicleIds] = useState<Set<string>>(new Set());
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicleFuelStateMap, setVehicleFuelStateMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [viewingVehicle, setViewingVehicle] = useState<Vehicle | null>(null);
  const [activeTab, setActiveTab] = useState<'vehicles' | 'models' | 'out_of_service' | 'locations' | 'archive'>('vehicles');
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [showAddModelForm, setShowAddModelForm] = useState(false);
  const [modelFormData, setModelFormData] = useState({
    name: '',
    model: '',
    vehicle_type: 'quad',
    description: '',
    tank_capacity_liters: '',
    image_url: '',
  });
  const [modelFormError, setModelFormError] = useState('');
  const [showMigration, setShowMigration] = useState(false);
  const [showSegwayCleanup, setShowSegwayCleanup] = useState(false);
  const [vehicleImageUrl, setVehicleImageUrl] = useState('');
  const [modelImageDraftId, setModelImageDraftId] = useState(`vehicle-model-draft-${Date.now()}`);
  const [vehicleDocuments, setVehicleDocuments] = useState<VehicleDocument[]>([]);
  
  const [editingVehicleModel, setEditingVehicleModel] = useState<VehicleModel | null>(null);
  const [showEditModelModal, setShowEditModelModal] = useState(false);
  const [modelEditError, setModelEditError] = useState('');
  const [showMaintenanceSummary, setShowMaintenanceSummary] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [fleetLocations, setFleetLocations] = useState<FleetLocation[]>([]);
  const [vehicleDispositions, setVehicleDispositions] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Out of Service tab filters
  const [oosSearchTerm, setOosSearchTerm] = useState('');
  const [oosModelFilter, setOosModelFilter] = useState<string>('all');
  const [oosTypeFilter, setOosTypeFilter] = useState<string>('all');

  const getEmptyFormData = () => ({
    name: '',
    model: '',
    vehicle_model_id: '',
    vehicle_type: 'quad',
    power_cc: 0,
    capacity: 1,
    color: '',
    plate_number: '',
    status: 'available',
    current_odometer: '',
    engine_hours: '',
    last_oil_change_date: '',
    last_oil_change_odometer: '',
    next_oil_change_due: '',
    next_oil_change_odometer: '',
    registration_number: '',
    registration_expiry_date: '',
    insurance_policy_number: '',
    insurance_provider: '',
    insurance_expiry_date: '',
    general_notes: '',
    notes: '',
    // New acquisition fields
    purchase_cost_mad: '',
    purchase_date: '',
    purchase_supplier: '',
    purchase_invoice_url: '',
    location_id: ''
  });

  const [formData, setFormData] = useState(getEmptyFormData());

  const availableModelsForType = useMemo(
    () =>
      vehicleModels.filter((model) => {
        if (!formData.vehicle_type) return true;
        return String(model.vehicle_type || '').toLowerCase() === String(formData.vehicle_type || '').toLowerCase();
      }),
    [vehicleModels, formData.vehicle_type]
  );

  const selectedVehicleModel = useMemo(
    () => vehicleModels.find((model) => String(model.id) === String(formData.vehicle_model_id || '')) || null,
    [vehicleModels, formData.vehicle_model_id]
  );

  const isAtvType = (vehicleType: string) => String(vehicleType || '').toUpperCase() === 'ATV';

  const syncVehicleFromModel = (modelId: string, nextVehicleType = formData.vehicle_type) => {
    const selectedModel = vehicleModels.find((model) => String(model.id) === String(modelId || ''));
    if (!selectedModel) {
      setFormData((current) => ({ ...current, vehicle_model_id: modelId || '' }));
      return;
    }

    const modelDisplay = [selectedModel.name, selectedModel.model]
      .filter(Boolean)
      .join(' ')
      .trim();
    const inheritedImageUrl = normalizeVehicleImageUrl(selectedModel.image_url || '');

    setFormData((current) => ({
      ...current,
      vehicle_model_id: selectedModel.id,
      model: selectedModel.model || current.model,
      capacity: isAtvType(nextVehicleType)
        ? (selectedModel.capacity_max || selectedModel.capacity_min || current.capacity || 1)
        : current.capacity,
      power_cc: isAtvType(nextVehicleType)
        ? (selectedModel.power_cc_max || selectedModel.power_cc_min || current.power_cc || 0)
        : current.power_cc,
      name:
        !current.name.trim() || current.name.trim() === current.model.trim() || current.name.trim() === modelDisplay
          ? modelDisplay || current.name
          : current.name,
    }));

    if (isAtvType(nextVehicleType) && inheritedImageUrl) {
      setVehicleImageUrl((currentImageUrl) => {
        const normalizedCurrent = normalizeVehicleImageUrl(currentImageUrl || '');
        const normalizedEditingImage = normalizeVehicleImageUrl(editingVehicle?.image_url || '');
        const normalizedSelectedImage = normalizeVehicleImageUrl(selectedVehicleModel?.image_url || '');
        if (
          !normalizedCurrent ||
          normalizedCurrent === normalizedEditingImage ||
          normalizedCurrent === normalizedSelectedImage
        ) {
          return inheritedImageUrl;
        }
        return currentImageUrl;
      });
    }
  };

  const getVehicleDocumentCount = async (vehicleId: number): Promise<number> => {
    try {
      const { data: files, error } = await supabase.storage
        .from('vehicle-documents')
        .list(vehicleId.toString(), {
          limit: 1000,
          offset: 0
        });

      if (error) {
        console.error('Error counting documents for vehicle', vehicleId, ':', error);
        return 0;
      }

      const validFiles = files ? files.filter(file => 
        file.name && 
        !file.name.endsWith('/') && 
        file.name !== '.emptyFolderPlaceholder'
      ) : [];

      return validFiles.length;
    } catch (error) {
      console.error('Error counting documents for vehicle', vehicleId, ':', error);
      return 0;
    }
  };

  const loadVehicleDocumentCounts = async (vehicleList: Vehicle[]) => {
    try {
      const vehiclesWithCounts = await Promise.all(
        vehicleList.map(async (vehicle) => {
          const documentCount = await getVehicleDocumentCount(vehicle.id);
          return {
            ...vehicle,
            document_count: documentCount
          };
        })
      );
      
      return vehiclesWithCounts;
    } catch (error) {
      console.error('Error loading vehicle document counts:', error);
      return vehicleList.map(vehicle => ({ ...vehicle, document_count: 0 }));
    }
  };

  const refreshVehicleDocumentCount = async (vehicleId: number) => {
    try {
      console.log('🔄 Refreshing document count for vehicle:', vehicleId);
      const newCount = await getVehicleDocumentCount(vehicleId);
      
      setVehicles(prev => prev.map(vehicle => 
        vehicle.id === vehicleId 
          ? { ...vehicle, document_count: newCount }
          : vehicle
      ));
      
      if (editingVehicle?.id === vehicleId) {
        setEditingVehicle(prev => prev ? { ...prev, document_count: newCount } : prev);
      }
      
      if (viewingVehicle?.id === vehicleId) {
        setViewingVehicle(prev => prev ? { ...prev, document_count: newCount } : prev);
      }
      
      console.log('✅ Document count refreshed for vehicle', vehicleId, '- New count:', newCount);
    } catch (error) {
      console.error('❌ Error refreshing document count:', error);
    }
  };

  // CRITICAL FIX: Load maintenance records from database using MaintenanceTrackingService
  const loadMaintenanceData = async () => {
    try {
      console.log('🔧 Loading maintenance records from database...');
      const records = await MaintenanceTrackingService.getAllMaintenanceRecords();
      console.log('✅ Loaded maintenance records:', records.length);
      setMaintenanceRecords(records);
    } catch (error) {
      console.error('❌ Error loading maintenance records:', error);
      setMaintenanceRecords([]);
    }
  };

  // Fixed useEffect with proper dependency handling
  useEffect(() => {
    try {
      loadMaintenanceData();
    } catch (error) {
      console.error('Error setting up subscriptions:', error);
    }
  }, []);

  const sanitizeFormData = (data: any) => {
    const sanitized = { ...data };
    
    if (sanitized.current_odometer === '' || sanitized.current_odometer === undefined) {
      sanitized.current_odometer = null;
    } else if (typeof sanitized.current_odometer === 'string') {
      const parsed = parseFloat(sanitized.current_odometer);
      sanitized.current_odometer = isNaN(parsed) ? null : parsed;
    }
    
    if (sanitized.engine_hours === '' || sanitized.engine_hours === undefined) {
      sanitized.engine_hours = null;
    } else if (typeof sanitized.engine_hours === 'string') {
      const parsed = parseFloat(sanitized.engine_hours);
      sanitized.engine_hours = isNaN(parsed) ? null : parsed;
    }
    
    if (sanitized.last_oil_change_odometer === '' || sanitized.last_oil_change_odometer === undefined) {
      sanitized.last_oil_change_odometer = null;
    } else if (typeof sanitized.last_oil_change_odometer === 'string') {
      const parsed = parseFloat(sanitized.last_oil_change_odometer);
      sanitized.last_oil_change_odometer = isNaN(parsed) ? null : parsed;
    }
    
    if (sanitized.next_oil_change_odometer === '' || sanitized.next_oil_change_odometer === undefined) {
      sanitized.next_oil_change_odometer = null;
    } else if (typeof sanitized.next_oil_change_odometer === 'string') {
      const parsed = parseFloat(sanitized.next_oil_change_odometer);
      sanitized.next_oil_change_odometer = isNaN(parsed) ? null : parsed;
    }
    
    if (sanitized.last_oil_change_date === '' || sanitized.last_oil_change_date === undefined) {
      sanitized.last_oil_change_date = null;
    }
    
    if (sanitized.next_oil_change_due === '' || sanitized.next_oil_change_due === undefined) {
      sanitized.next_oil_change_due = null;
    }
    
    if (sanitized.registration_expiry_date === '' || sanitized.registration_expiry_date === undefined) {
      sanitized.registration_expiry_date = null;
    }
    
    if (sanitized.insurance_expiry_date === '' || sanitized.insurance_expiry_date === undefined) {
      sanitized.insurance_expiry_date = null;
    }
    
    // Process acquisition fields
    if (sanitized.purchase_cost_mad === '' || sanitized.purchase_cost_mad === undefined) {
      sanitized.purchase_cost_mad = null;
    } else if (typeof sanitized.purchase_cost_mad === 'string') {
      const parsed = parseFloat(sanitized.purchase_cost_mad);
      sanitized.purchase_cost_mad = isNaN(parsed) ? null : parsed;
    }
    
    if (sanitized.purchase_date === '' || sanitized.purchase_date === undefined) {
      sanitized.purchase_date = null;
    }
    
    if (!sanitized.power_cc || sanitized.power_cc === '' || sanitized.power_cc === undefined) {
      sanitized.power_cc = 0;
    } else if (typeof sanitized.power_cc === 'string') {
      sanitized.power_cc = parseInt(sanitized.power_cc) || 0;
    }
    
    if (!sanitized.capacity || sanitized.capacity === '' || sanitized.capacity < 1 || sanitized.capacity === undefined) {
      sanitized.capacity = 1;
    } else if (typeof sanitized.capacity === 'string') {
      sanitized.capacity = parseInt(sanitized.capacity) || 1;
    }
    
    sanitized.name = sanitized.name ? sanitized.name.trim() : '';
    sanitized.model = sanitized.model ? sanitized.model.trim() : '';
    sanitized.color = sanitized.color ? sanitized.color.trim() : '';
    sanitized.plate_number = sanitized.plate_number ? sanitized.plate_number.trim() : '';
    sanitized.registration_number = sanitized.registration_number ? sanitized.registration_number.trim() : '';
    sanitized.insurance_policy_number = sanitized.insurance_policy_number ? sanitized.insurance_policy_number.trim() : '';
    sanitized.insurance_provider = sanitized.insurance_provider ? sanitized.insurance_provider.trim() : '';
    sanitized.general_notes = sanitized.general_notes ? sanitized.general_notes.trim() : '';
    sanitized.notes = sanitized.notes ? sanitized.notes.trim() : '';
    sanitized.purchase_supplier = sanitized.purchase_supplier ? sanitized.purchase_supplier.trim() : '';
    sanitized.purchase_invoice_url = sanitized.purchase_invoice_url ? sanitized.purchase_invoice_url.trim() : '';
    if (sanitized.location_id === '' || sanitized.location_id === undefined) {
      sanitized.location_id = null;
    } else if (typeof sanitized.location_id === 'string') {
      const parsedLocationId = parseInt(sanitized.location_id, 10);
      sanitized.location_id = Number.isNaN(parsedLocationId) ? null : parsedLocationId;
    }

    if (sanitized.vehicle_model_id === '' || sanitized.vehicle_model_id === undefined) {
      sanitized.vehicle_model_id = null;
    } else {
      sanitized.vehicle_model_id = String(sanitized.vehicle_model_id).trim() || null;
    }
    
    sanitized.image_url = sanitized.image_url || '';
    
    return sanitized;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const editVehicleId = location.state?.editVehicleId;
    if (!editVehicleId || loading || vehicles.length === 0) {
      return;
    }

    const vehicleToEdit = vehicles.find((vehicle) => String(vehicle.id) === String(editVehicleId));
    if (vehicleToEdit) {
      handleEdit(vehicleToEdit);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, loading, vehicles]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch vehicles
      const vehicleSelectColumns = 'id, name, model, vehicle_type, power_cc, capacity, color, location_id, status, image_url, features, plate_number, current_odometer, engine_hours, last_oil_change_date, last_oil_change_odometer, next_oil_change_due, next_oil_change_odometer, registration_number, registration_date, registration_expiry_date, insurance_policy_number, insurance_provider, insurance_expiry_date, general_notes, notes, created_at, updated_at, vehicle_model_id, purchase_cost_mad, purchase_date, purchase_supplier, purchase_invoice_url, sold_date, sale_price_mad, sold_buyer_name, sale_proof_url, sale_proof_name, sale_notes';
      const fallbackVehicleSelectColumns = 'id, name, model, vehicle_type, power_cc, capacity, color, location_id, status, image_url, features, plate_number, current_odometer, engine_hours, last_oil_change_date, last_oil_change_odometer, next_oil_change_due, next_oil_change_odometer, registration_number, registration_expiry_date, insurance_policy_number, insurance_provider, insurance_expiry_date, general_notes, notes, created_at, updated_at, vehicle_model_id, purchase_cost_mad, purchase_date, purchase_supplier, purchase_invoice_url';
      let { data: vehiclesData, error: vehiclesError } = await supabase
        .from(TBL.VEHICLES)
        .select(vehicleSelectColumns)
        .order('created_at', { ascending: false })
        .limit(50);

      if (vehiclesError?.message?.includes('registration_date') || vehiclesError?.message?.includes('sold_date') || vehiclesError?.message?.includes('sale_') || vehiclesError?.message?.includes('sold_buyer')) {
        const fallbackResult = await supabase
          .from(TBL.VEHICLES)
          .select(fallbackVehicleSelectColumns)
          .order('created_at', { ascending: false })
          .limit(50);
        vehiclesData = fallbackResult.data;
        vehiclesError = fallbackResult.error;
      }

      if (vehiclesError) {
        console.error('Vehicles fetch failed:', vehiclesError);
        throw vehiclesError;
      }

      const fetchedLocations = await FleetLocationService.listLocations(true).catch((locationError) => {
        console.error('Fleet locations fetch failed:', locationError);
        return [];
      });
      setVehicleDispositions(VehicleDispositionService.listDispositions());
      const locationNameById = new Map(
        (fetchedLocations || []).map((fleetLocation: FleetLocation) => [String(fleetLocation.id), fleetLocation.name])
      );
      setFleetLocations(fetchedLocations as FleetLocation[]);

      const vehicleIds = (vehiclesData || []).map((vehicle) => vehicle.id).filter(Boolean);
      let initialImpoundedVehicleIds = new Set<string>();
      let activeRentalVehicleIds = new Set<string>();
      let blockingScheduledVehicleIds = new Set<string>();
      let openMaintenanceVehicleIds = new Set<string>();

      if (vehicleIds.length > 0) {
        const { data: rentalOverlayData, error: rentalOverlayError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('vehicle_id, rental_status, is_impounded, impounded_at, released_from_impound_at, updated_at, booking_source, website_booking_status, is_vehicle_locked, hold_expires_at')
          .in('vehicle_id', vehicleIds)
          .order('updated_at', { ascending: false });

        if (rentalOverlayError) {
          console.error('Vehicle rental status overlay fetch failed:', rentalOverlayError);
        } else {
          initialImpoundedVehicleIds = new Set(
            (rentalOverlayData || [])
              .filter((record: any) =>
                Boolean(record?.vehicle_id) &&
                (
                  Boolean(record?.is_impounded) ||
                  String(record?.rental_status || '').toLowerCase() === 'impounded'
                ) &&
                !record?.released_from_impound_at
              )
              .map((record: any) => String(record.vehicle_id))
          );

          activeRentalVehicleIds = new Set(
            (rentalOverlayData || [])
              .filter((record: any) => {
                if (!record?.vehicle_id) return false;
                const status = String(record?.rental_status || '').toLowerCase();
                return ['active', 'in_progress', 'checked_out'].includes(status);
              })
              .map((record: any) => String(record.vehicle_id))
          );

          blockingScheduledVehicleIds = new Set(
            (rentalOverlayData || [])
              .filter((record: any) =>
                Boolean(record?.vehicle_id) &&
                WebsiteBookingLifecycleService.shouldRentalBlockInventory(record, new Date())
              )
              .map((record: any) => String(record.vehicle_id))
          );
        }

        const { data: openMaintenanceData, error: openMaintenanceError } = await supabase
          .from('app_687f658e98_maintenance')
          .select('vehicle_id, status')
          .in('vehicle_id', vehicleIds)
          .in('status', ['scheduled', 'in_progress', 'pending']);

        if (openMaintenanceError) {
          console.error('Open maintenance overlay fetch failed:', openMaintenanceError);
        } else {
          openMaintenanceVehicleIds = new Set(
            (openMaintenanceData || [])
              .filter((record: any) => Boolean(record?.vehicle_id))
              .map((record: any) => String(record.vehicle_id))
          );
        }
      }

      setImpoundedVehicleIds(initialImpoundedVehicleIds);

      const baseVehicles = (vehiclesData || []).map((vehicle) => {
        const isStaleRentedStatus =
          String(vehicle?.status || '').toLowerCase() === 'rented' &&
          !activeRentalVehicleIds.has(String(vehicle.id));
        const isStaleScheduledStatus =
          String(vehicle?.status || '').toLowerCase() === 'scheduled' &&
          !blockingScheduledVehicleIds.has(String(vehicle.id));
        const isStaleMaintenanceStatus =
          String(vehicle?.status || '').toLowerCase() === 'maintenance' &&
          !openMaintenanceVehicleIds.has(String(vehicle.id));

        return {
          ...vehicle,
          status: isStaleRentedStatus || isStaleScheduledStatus || isStaleMaintenanceStatus ? 'available' : vehicle.status,
          document_count: 0,
          location_name: vehicle.location_id ? locationNameById.get(String(vehicle.location_id)) || null : null,
        };
      });
      setVehicles(baseVehicles as Vehicle[]);
      setLoading(false);
      
      if (vehiclesData) {
        alertService.updateAllOilChangeAlerts(vehiclesData);
      }

      scheduleBackgroundTask(async () => {
        if (vehicleIds.length > 0) {
          supabase
            .from('app_4c3a7a6153_rentals')
            .select('vehicle_id, rental_status, is_impounded, impounded_at, released_from_impound_at, updated_at')
            .in('vehicle_id', vehicleIds)
            .order('updated_at', { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                console.error('Vehicle rental status overlay fetch failed:', error);
                return;
              }

              const impoundedVehicleIds = new Set(
                (data || [])
                  .filter((record: any) =>
                    Boolean(record?.vehicle_id) &&
                    (
                      Boolean(record?.is_impounded) ||
                      String(record?.rental_status || '').toLowerCase() === 'impounded'
                    ) &&
                    !record?.released_from_impound_at
                  )
                  .map((record: any) => String(record.vehicle_id))
              );

              setImpoundedVehicleIds(impoundedVehicleIds);
            })
            .catch((rentalOverlayError) => {
              console.error('Vehicle rental status overlay fetch failed:', rentalOverlayError);
            });
        }

        if (vehicleIds.length > 0) {
          supabase
            .from('vehicle_fuel_state')
            .select('vehicle_id, current_fuel_liters, current_fuel_lines, max_fuel_lines, tank_capacity_liters, last_source, last_updated_at')
            .in('vehicle_id', vehicleIds)
            .then(({ data, error }) => {
              if (!error) {
                const nextFuelStateMap: Record<string, any> = {};
                (data || []).forEach((state: any) => {
                  const stateKey = String(state?.vehicle_id || state?.id || '');
                  if (stateKey) {
                    nextFuelStateMap[stateKey] = state;
                  }
                });
                setVehicleFuelStateMap(nextFuelStateMap);
                return;
              }

              return FuelTransactionService.getVehicleFuelStates()
                .then((fuelStates) => {
                  const fallbackFuelStateMap: Record<string, any> = {};
                  (fuelStates || []).forEach((state: any) => {
                    const stateKey = String(state?.vehicle_id || state?.id || '');
                    if (stateKey) {
                      fallbackFuelStateMap[stateKey] = state;
                    }
                  });
                  setVehicleFuelStateMap(fallbackFuelStateMap);
                })
                .catch((fuelError) => {
                  console.error('Fuel state fetch failed:', fuelError);
                  setVehicleFuelStateMap({});
                });
            })
            .catch((fuelError) => {
              console.error('Fuel state fetch failed:', fuelError);
              setVehicleFuelStateMap({});
            });
        }

        const priorityVehicles = (vehiclesData || []).slice(0, 12) as Vehicle[];
        const remainingVehicles = (vehiclesData || []).slice(12) as Vehicle[];

        const [priorityVehiclesWithCounts, modelsResult] = await Promise.all([
          priorityVehicles.length > 0 ? loadVehicleDocumentCounts(priorityVehicles) : Promise.resolve([] as Vehicle[]),
          supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select('*')
            .order('name', { ascending: true }),
        ]);

        const prioritizedVehicleMap = new Map(priorityVehiclesWithCounts.map((vehicle) => [vehicle.id, vehicle]));
        const firstPassVehicles = baseVehicles.map((vehicle) => prioritizedVehicleMap.get(vehicle.id) || vehicle);
        setVehicles(firstPassVehicles as Vehicle[]);

        if (remainingVehicles.length > 0) {
          scheduleBackgroundTask(async () => {
            const remainingVehiclesWithCounts = await loadVehicleDocumentCounts(remainingVehicles);
            const remainingVehicleMap = new Map(remainingVehiclesWithCounts.map((vehicle) => [vehicle.id, vehicle]));
            setVehicles((currentVehicles) => currentVehicles.map((vehicle) => remainingVehicleMap.get(vehicle.id) || vehicle));
          });
        }

        const { data: modelsData, error: modelsError } = modelsResult;
        if (modelsError) {
          console.error('Models fetch error:', modelsError);
          setVehicleModels([]);
        } else if (modelsData && modelsData.length > 0) {
          const processedModels = modelsData.map(model => ({
            ...model,
            power_cc_min: parseInt(model.power_cc_min) || 0,
            power_cc_max: parseInt(model.power_cc_max) || 0,
            capacity_min: parseInt(model.capacity_min) || 0,
            capacity_max: parseInt(model.capacity_max) || 0,
            tank_capacity_liters: resolveTankCapacityLiters(model.tank_capacity_liters, model.model, model.name),
            vehicles: [{
              count: baseVehicles.filter(v => v.vehicle_model_id === model.id).length
            }]
          }));

          setVehicleModels(processedModels);
        } else {
          setVehicleModels([]);
        }
      });

      scheduleBackgroundTask(() => {
        loadMaintenanceData();
      });

    } catch (error) {
      console.error('Error in fetchData:', error);
      setError(`Impossible de charger les données : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateVehicleStatus = async (vehicleId: number, status: string) => {
    try {
      const { error } = await supabase
        .from(TBL.VEHICLES)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', vehicleId);

      if (error) throw error;

      setVehicles(prev => prev.map(v => 
        v.id === vehicleId ? { ...v, status } : v
      ));
    } catch (error) {
      console.error('Error updating vehicle status:', error);
    }
  };

  // Return vehicle to service handler
  const handleReturnToService = async (vehicle: Vehicle) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir remettre "${vehicle.name}" (${vehicle.plate_number}) en service ?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from(TBL.VEHICLES)
        .update({ 
          status: 'available',
          updated_at: new Date().toISOString()
        })
        .eq('id', vehicle.id);

      if (error) throw error;

      alert(`${vehicle.name} has been returned to service successfully!`);
      await fetchData();
    } catch (error) {
      console.error('Error returning vehicle to service:', error);
      alert(`Impossible de remettre le véhicule en service : ${error.message}`);
    }
  };

  const getOilChangeProgress = (vehicle: Vehicle) => {
    if (!vehicle.current_odometer || !vehicle.last_oil_change_odometer || !vehicle.next_oil_change_odometer) {
      return 0;
    }
    
    const current = parseFloat(vehicle.current_odometer);
    const last = parseFloat(vehicle.last_oil_change_odometer);
    const next = parseFloat(vehicle.next_oil_change_odometer);
    
    const totalInterval = next - last;
    const currentProgress = current - last;
    
    return Math.min(Math.max(currentProgress / totalInterval, 0), 1);
  };

  const isOilChangeDue = (vehicle: Vehicle) => {
    if (!vehicle.current_odometer || !vehicle.next_oil_change_odometer) return false;
    
    const current = parseFloat(vehicle.current_odometer);
    const next = parseFloat(vehicle.next_oil_change_odometer);
    
    return current >= (next - 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submitting) {
      return;
    }
    
    setSubmitting(true);
    
    try {
      const sanitizedData = sanitizeFormData({
        ...formData,
        image_url: vehicleImageUrl || ''
      });

      // ⭐⭐⭐ DUPLICATE PLATE NUMBER CHECK ⭐⭐⭐
      if (sanitizedData.plate_number && sanitizedData.plate_number.trim()) {
        const { data: existingVehicle, error: checkError } = await supabase
          .from(TBL.VEHICLES)
          .select('id, name, model, plate_number')
          .eq('plate_number', sanitizedData.plate_number.trim())
          .maybeSingle();

        if (checkError) {
          console.error('Error checking plate number:', checkError);
        } else if (existingVehicle) {
          // For editing: only error if plate belongs to DIFFERENT vehicle
          // For new vehicle: any match is an error
          const isDuplicate = editingVehicle 
            ? existingVehicle.id !== editingVehicle.id
            : true;

          if (isDuplicate) {
            alert(`❌ DUPLICATE PLATE NUMBER!\n\nPlate: "${sanitizedData.plate_number}"\nAlready assigned to: ${existingVehicle.name} (${existingVehicle.model})\nID: ${existingVehicle.id}`);
            setSubmitting(false);
            return;
          }
        }
      }
      // ⭐⭐⭐ END OF DUPLICATE CHECK ⭐⭐⭐

      if (editingVehicle) {
        const { data: updatedVehicle, error } = await supabase
          .from(TBL.VEHICLES)
          .update({
            ...sanitizedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingVehicle.id)
          .select()
          .single();

        if (error) {
          throw new Error(`Impossible de mettre à jour le véhicule : ${error.message}`);
        }

        if (vehicleDocuments.length > 0) {
          // In real implementation, save documents to storage and update vehicle record
        }
        
        // CRITICAL: Trigger AlertService after successful save
        if (sanitizedData.current_odometer && sanitizedData.next_oil_change_odometer) {
          alertService.createOrUpdateOilChangeAlert(
            editingVehicle.id.toString(),
            sanitizedData.name,
            sanitizedData.current_odometer,
            sanitizedData.next_oil_change_odometer
          );
        }
        
        alert('Véhicule mis à jour avec succès !');
      } else {
        const { data: newVehicle, error } = await supabase
          .from(TBL.VEHICLES)
          .insert([{
            ...sanitizedData,
            features: [],
            location_id: sanitizedData.location_id ?? null,
            vehicle_model_id: sanitizedData.vehicle_model_id ?? null
          }])
          .select()
          .single();

        if (error) {
          throw new Error(`Impossible de créer le véhicule : ${error.message}`);
        }

        if (vehicleDocuments.length > 0 && newVehicle) {
          // In real implementation, save documents to storage and link to vehicle
        }
        
        // CRITICAL: Trigger AlertService after successful save
        if (newVehicle && sanitizedData.current_odometer && sanitizedData.next_oil_change_odometer) {
          alertService.createOrUpdateOilChangeAlert(
            newVehicle.id.toString(),
            sanitizedData.name,
            sanitizedData.current_odometer,
            sanitizedData.next_oil_change_odometer
          );
        }
        
        alert('Vehicle created successfully!');
      }

      resetForm();
      await fetchData();
      
    } catch (error) {
      console.error('❌ Error saving vehicle:', error);
      alert(`Failed to save vehicle: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(getEmptyFormData());
    
    setVehicleImageUrl('');
    setModelImageDraftId(`vehicle-model-draft-${Date.now()}`);
    setVehicleDocuments([]);
    
    setShowAddForm(false);
    setEditingVehicle(null);
    setViewingVehicle(null);
    
  };

  const openAddVehicleModal = () => {
    resetForm();
    
    setFormData(getEmptyFormData());
    setVehicleImageUrl('');
    setModelImageDraftId(`vehicle-model-draft-${Date.now()}`);
    setVehicleDocuments([]);
    
    setEditingVehicle(null);
    setViewingVehicle(null);
    
    setShowAddForm(true);
  };

  const handleEdit = async (vehicle: Vehicle) => {
    try {
      const { data: fullVehicle, error } = await supabase
        .from(TBL.VEHICLES)
        .select('*')
        .eq('id', vehicle.id)
        .single();
      
      if (error) {
        throw error;
      }
      
      setFormData({
        name: fullVehicle.name || '',
        model: fullVehicle.model || '',
        vehicle_model_id: fullVehicle.vehicle_model_id || '',
        vehicle_type: fullVehicle.vehicle_type || 'quad',
        power_cc: fullVehicle.power_cc || 0,
        capacity: fullVehicle.capacity || 1,
        color: fullVehicle.color || '',
        plate_number: fullVehicle.plate_number || '',
        status: fullVehicle.status || 'available',
        current_odometer: fullVehicle.current_odometer?.toString() || '',
        engine_hours: fullVehicle.engine_hours?.toString() || '',
        last_oil_change_date: fullVehicle.last_oil_change_date || '',
        last_oil_change_odometer: fullVehicle.last_oil_change_odometer?.toString() || '',
        next_oil_change_due: fullVehicle.next_oil_change_due || '',
        next_oil_change_odometer: fullVehicle.next_oil_change_odometer?.toString() || '',
        registration_number: fullVehicle.registration_number || '',
        registration_expiry_date: fullVehicle.registration_expiry_date || '',
        insurance_policy_number: fullVehicle.insurance_policy_number || '',
        insurance_provider: fullVehicle.insurance_provider || '',
        insurance_expiry_date: fullVehicle.insurance_expiry_date || '',
        general_notes: fullVehicle.general_notes || '',
        notes: fullVehicle.notes || '',
        // Load acquisition fields
        purchase_cost_mad: fullVehicle.purchase_cost_mad?.toString() || '',
        purchase_date: fullVehicle.purchase_date || '',
        purchase_supplier: fullVehicle.purchase_supplier || '',
        purchase_invoice_url: fullVehicle.purchase_invoice_url || '',
        location_id: fullVehicle.location_id?.toString() || ''
      });
      
      setVehicleImageUrl(normalizeVehicleImageUrl(fullVehicle.image_url || ''));
      setVehicleDocuments(fullVehicle.documents || []);
      setEditingVehicle(fullVehicle);
      setViewingVehicle(null);
      
      setShowAddForm(true);
      
    } catch (error) {
      alert(`Failed to load vehicle details: ${error.message}`);
    }
  };

  const handleView = (vehicle: Vehicle) => {
    navigate(`/admin/fleet/${vehicle.id}`);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce véhicule ?')) {
      try {
        const { error } = await supabase
          .from(TBL.VEHICLES)
          .delete()
          .eq('id', id);

        if (error) throw error;
        fetchData();
      } catch (error) {
        console.error('Error deleting vehicle:', error);
      }
    }
  };

  const handleDeleteModel = async (model: VehicleModel) => {
    const vehicleCount = model.vehicles?.[0]?.count || 0;
    
    let confirmMessage = `Êtes-vous sûr de vouloir supprimer le modèle de véhicule "${model.name}" ?`;
    
    if (vehicleCount > 0) {
      confirmMessage += `\n\nWarning: This model is currently used by ${vehicleCount} vehicle(s). Deletion will be blocked if vehicles are still referencing this model.`;
    }
    
    confirmMessage += '\n\nThis action cannot be undone.';

    if (window.confirm(confirmMessage)) {
      setDeletingModelId(model.id);
      try {
        await VehicleModelService.deleteVehicleModel(model.id);
        
        alert(`Vehicle model "${model.name}" has been deleted successfully.`);
        
        await fetchData();
      } catch (error) {
        console.error('Error deleting model:', error);
        alert(error.message || 'Failed to delete vehicle model.');
      } finally {
        setDeletingModelId(null);
      }
    }
  };

  const handleEditModel = (model: VehicleModel) => {
    setEditingVehicleModel(model);
    setShowEditModelModal(true);
    setModelEditError('');
  };

  const handleModelEditSave = async (updatedModel: VehicleModel) => {
    try {
      await fetchData();
      toast.success(
        tr(
          `Vehicle model "${updatedModel.name}" updated successfully.`,
          `Le modèle de véhicule "${updatedModel.name}" a été mis à jour avec succès.`
        )
      );
    } catch (error) {
      console.error('Error after model update:', error);
    }
  };

  const handleModelEditError = (error: string) => {
    setModelEditError(error);
    toast.error(
      tr(
        `Vehicle model update failed: ${error}`,
        `Erreur lors de la mise à jour du modèle de véhicule : ${error}`
      )
    );
  };

  const closeEditModal = () => {
    setShowEditModelModal(false);
    setEditingVehicleModel(null);
    setModelEditError('');
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setModelFormError('');
    
    try {
      if (!modelFormData.name.trim()) {
        throw new Error('Le nom du modèle est requis');
      }
      if (!modelFormData.model.trim()) {
        throw new Error("L'identifiant du modèle est requis");
      }

      await VehicleModelService.createVehicleModel({
        name: modelFormData.name.trim(),
        model: modelFormData.model.trim(),
        vehicle_type: modelFormData.vehicle_type,
        description: modelFormData.description.trim(),
        image_url: modelFormData.image_url?.trim() || null,
        power_cc_min: 0,
        power_cc_max: 0,
        capacity_min: 1,
        capacity_max: 1,
        features: [],
        tank_capacity_liters: resolveTankCapacityLiters(modelFormData.tank_capacity_liters, modelFormData.model, modelFormData.name),
      });

      setModelFormData({
        name: '',
        model: '',
        vehicle_type: 'quad',
        description: '',
        tank_capacity_liters: '',
        image_url: '',
      });
      setModelImageDraftId(`vehicle-model-draft-${Date.now()}`);
      setShowAddModelForm(false);
      await fetchData();
      
      alert('Vehicle model added successfully!');
    } catch (error) {
      console.error('Error adding model:', error);
      setModelFormError(error.message || 'Impossible de créer le modèle de véhicule');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const updatedDocuments = vehicleDocuments.filter(doc => doc.id !== documentId);
      setVehicleDocuments(updatedDocuments);
      
      if (viewingVehicle) {
        setViewingVehicle({
          ...viewingVehicle,
          documents: updatedDocuments
        });
        
        await refreshVehicleDocumentCount(viewingVehicle.id);
      }
      
      if (editingVehicle) {
        setEditingVehicle({
          ...editingVehicle,
          documents: updatedDocuments
        });
        
        await refreshVehicleDocumentCount(editingVehicle.id);
      }
      
    } catch (error) {
      console.error('Error handling document deletion in parent:', error);
      throw error;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'tour': return 'bg-violet-100 text-violet-800';
      case 'rented': return 'bg-blue-100 text-blue-800';
      case 'impounded': return 'bg-amber-100 text-amber-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'out_of_service': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isMaintenanceDue = (vehicle: Vehicle) => {
    if (isOilChangeDue(vehicle)) return true;
    
    if (!vehicle.next_oil_change_due) return false;
    const dueDate = new Date(vehicle.next_oil_change_due);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 30;
  };

  const displayVehicles = useMemo(
    () =>
      vehicles.map((vehicle) =>
        impoundedVehicleIds.has(String(vehicle.id))
          ? { ...vehicle, status: 'impounded' as const }
          : vehicle
      ),
    [vehicles, impoundedVehicleIds]
  );
  const dispositionByVehicleId = useMemo(
    () => new Map(vehicleDispositions.map((record) => [String(record.vehicle_id), record])),
    [vehicleDispositions]
  );

  const filteredVehicles = useMemo(() => displayVehicles.filter(vehicle => {
    if (vehicle.status === 'out_of_service' || vehicle.status === 'sold' || vehicle.status === 'disposed' || dispositionByVehicleId.has(String(vehicle.id))) return false;
    const normalizedSearchTerm = deferredSearchTerm.toLowerCase();
    const matchesSearch = vehicle.name.toLowerCase().includes(normalizedSearchTerm) ||
                         vehicle.model.toLowerCase().includes(normalizedSearchTerm) ||
                         vehicle.plate_number.toLowerCase().includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    const matchesType = typeFilter === 'all' || vehicle.vehicle_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  }), [displayVehicles, dispositionByVehicleId, deferredSearchTerm, statusFilter, typeFilter]);

  const archivedVehicles = useMemo(() => displayVehicles
    .filter((vehicle) => {
      const disposition = dispositionByVehicleId.get(String(vehicle.id));
      return Boolean(disposition) || vehicle.status === 'sold' || vehicle.status === 'disposed';
    })
    .map((vehicle) => ({
      ...vehicle,
      disposition: dispositionByVehicleId.get(String(vehicle.id)) || null,
    })), [displayVehicles, dispositionByVehicleId]);

  // Filter out of service vehicles
  const outOfServiceVehicles = displayVehicles.filter(vehicle => {
    if (vehicle.status !== 'out_of_service') return false;

    const matchesSearch = vehicle.name.toLowerCase().includes(oosSearchTerm.toLowerCase()) ||
                         vehicle.plate_number.toLowerCase().includes(oosSearchTerm.toLowerCase()) ||
                         vehicle.registration_number.toLowerCase().includes(oosSearchTerm.toLowerCase());
    
    const matchesModel = oosModelFilter === 'all' || vehicle.model.toLowerCase().includes(oosModelFilter.toLowerCase());
    const matchesType = oosTypeFilter === 'all' || vehicle.vehicle_type === oosTypeFilter;
    
    return matchesSearch && matchesModel && matchesType;
  });

  const openMaintenanceRecords = maintenanceRecords.filter(record =>
    ['scheduled', 'in_progress', 'pending'].includes(record.status)
  );
  const completedMaintenanceCount = maintenanceRecords.filter(record => record.status === 'completed').length;
  const maintenanceTotalCost = maintenanceRecords.reduce((sum, record) => sum + (record.cost || 0), 0);
  const vehiclesCurrentlyInMaintenance = new Set(openMaintenanceRecords.map((record) => record.vehicle_id)).size;

  // Calculate how long vehicle has been out of service
  const getDaysOutOfService = (vehicle: Vehicle) => {
    const updatedDate = new Date(vehicle.updated_at);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - updatedDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminModuleHero
          className="w-full"
          icon={<Car className="h-8 w-8 text-white" />}
          eyebrow={tr('Fleet Management', 'Gestion de flotte')}
          title={tr('Fleet Management', 'Gestion de flotte')}
          description={tr('Manage your fleet, vehicle models, maintenance activity, and out-of-service units.', 'Gérez votre flotte, les modèles de véhicules, l’activité de maintenance et les unités hors service.')}
        />
        <div className="p-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="text-5xl leading-none animate-pulse">⏳</div>
              <h2 className="text-xl font-semibold text-slate-900">
                {tr('Loading fleet...', 'Chargement de la flotte...')}
              </h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminModuleHero
          className="w-full"
          icon={<Car className="h-8 w-8 text-white" />}
          eyebrow={tr('Fleet Management', 'Gestion de flotte')}
          title={tr('Fleet Management', 'Gestion de flotte')}
          description={tr('Manage your fleet, vehicle models, maintenance activity, and out-of-service units.', 'Gérez votre flotte, les modèles de véhicules, l’activité de maintenance et les unités hors service.')}
        />

        <div className="p-6">
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-400" />
            <h3 className="mb-2 text-lg font-semibold text-red-800">{tr('Failed to Load Data', 'Échec du chargement')}</h3>
            <p className="mb-4 text-red-600">{error}</p>
            <button
              onClick={fetchData}
              className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
            >
              {tr('Try Again', 'Réessayer')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isNewVehicle = !viewingVehicle && !editingVehicle;
  const loadFromStorageValue = !isNewVehicle;
  
  console.log('🔍 VehicleManagement Debug:', {
    isNewVehicle,
    loadFromStorageValue,
    viewingVehicle: !!viewingVehicle,
    editingVehicle: !!editingVehicle,
    vehicleDocumentsLength: vehicleDocuments.length,
    vehicleModelsCount: vehicleModels.length
  });

  return (
      <div className="min-h-screen bg-slate-50">
        <AdminModuleHero
          className="w-full"
          icon={<Car className="h-8 w-8 text-white" />}
          eyebrow={tr('Fleet Management', 'Gestion de flotte')}
          title={tr('Fleet Management', 'Gestion de flotte')}
          description={tr('Manage your fleet, vehicle models, maintenance activity, and out-of-service units.', 'Gérez votre flotte, les modèles de véhicules, l’activité de maintenance et les unités hors service.')}
        />

      <div className="p-6">

      {showSegwayCleanup && activeTab === 'models' && (
        <SegwayCleanupRunner onComplete={fetchData} />
      )}

      {showMigration && activeTab === 'models' && !showSegwayCleanup && (
        <VehicleModelMigrationRunner onComplete={fetchData} />
      )}

      {/* Tab Navigation */}
      <div className="mt-6 mb-6 rounded-[28px] border border-violet-100 bg-white p-2 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
        <nav className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`flex items-center justify-center gap-2 rounded-[22px] px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === 'vehicles'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <Car className="h-4 w-4" />
            <span>{tr('Fleet', 'Flotte')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'vehicles'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {filteredVehicles.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center justify-center gap-2 rounded-[22px] px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === 'models'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>{tr('Vehicle Models', 'Modèles véhicule')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'models'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {vehicleModels.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('out_of_service')}
            className={`flex items-center justify-center gap-2 rounded-[22px] px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === 'out_of_service'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{tr('Out of Service', 'Hors service')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'out_of_service'
                ? 'bg-white/20 text-white'
                : 'bg-rose-50 text-rose-600'
            }`}>
              {outOfServiceVehicles.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`flex items-center justify-center gap-2 rounded-[22px] px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === 'locations'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <MapPin className="h-4 w-4" />
            <span>{tr('Fleet Locations', 'Emplacements flotte')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'locations'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {fleetLocations.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`flex items-center justify-center gap-2 rounded-[22px] px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === 'archive'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>{tr('Sold Archive', 'Archives vendus')}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'archive'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {archivedVehicles.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <>
          {/* Controls */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,1.2fr)_auto] xl:grid-cols-[minmax(360px,1.4fr)_auto]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={tr('Search vehicles...', 'Rechercher des véhicules...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">{tr('All Status', 'Tous les statuts')}</option>
                  <option value="available">{tr('Available', 'Disponible')}</option>
<option value="scheduled">{tr('Scheduled', 'Planifié')}</option>
                  <option value="rented">{tr('Rented', 'Loué')}</option>
                  <option value="impounded">{tr('Impounded', 'Mis en fourrière')}</option>
                  <option value="tour">{tr('Tour', 'Tour')}</option>
                  <option value="maintenance">{tr('Maintenance', 'Maintenance')}</option>
                </select>
                
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">{tr('All Types', 'Tous les types')}</option>
                  <option value="quad">Quad</option>
                  <option value="ATV">ATV</option>
                  <option value="UTV">UTV</option>
                  <option value="buggy">Buggy</option>
                  <option value="car">Car</option>
                  <option value="motorhome">Motorhome</option>
                  <option value="jet_ski">Jet Ski</option>
                  <option value="electric_bike">Electric Bike</option>
                  <option value="electric_motorbike">Electric Motorbike</option>
                  <option value="electric_motorcycle">Electric Motorcycle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="scooter">Scooter</option>
                </select>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="flex items-center rounded-2xl border border-violet-100 bg-white p-1 shadow-sm">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-xl p-2 transition-all ${viewMode === 'grid' ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]' : 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'}`}
                  title={tr('Grid View', 'Vue grille')}
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-xl p-2 transition-all ${viewMode === 'list' ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_24px_rgba(79,70,229,0.24)]' : 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'}`}
                  title={tr('List View', 'Vue liste')}
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={openAddVehicleModal}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)] transition-all hover:scale-[1.01] hover:shadow-[0_18px_36px_rgba(79,70,229,0.34)]"
              >
                <Plus className="w-4 h-4" />
                {tr('Add Vehicle', 'Ajouter un véhicule')}
              </button>
            </div>
          </div>

          <div className="mb-6 overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <button
              type="button"
              onClick={() => setShowMaintenanceSummary((current) => !current)}
              className="flex w-full flex-col items-start gap-4 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-5 text-left xl:flex-row xl:items-center xl:justify-between"
            >
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{tr('Maintenance Summary', 'Résumé maintenance')}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {tr('Quick maintenance counts for Fleet. Open Quad Maintenance only when you need the full repair workflow.', 'Compteurs rapides de maintenance pour la flotte. Ouvrez la maintenance quad seulement si vous avez besoin du workflow complet de réparation.')}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto xl:flex-nowrap xl:justify-end">
                <div className="hidden rounded-2xl border border-violet-100 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm lg:flex lg:flex-wrap lg:items-center lg:gap-4 xl:flex-nowrap">
                  <span>{tr('Open:', 'Ouverts :')} {openMaintenanceRecords.length}</span>
                  <span>{tr('In maintenance:', 'En maintenance :')} {vehiclesCurrentlyInMaintenance}</span>
                </div>
                <span className="rounded-full border border-violet-100 bg-white p-2 text-violet-700 shadow-sm">
                  {showMaintenanceSummary ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </span>
              </div>
            </button>

            {showMaintenanceSummary && (
              <div className="border-t border-violet-100 px-5 pb-5">
                <div className="grid grid-cols-1 gap-4 pt-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Open Records', 'Dossiers ouverts')}</p>
                      <p className="mt-2 text-2xl font-bold text-violet-700">{openMaintenanceRecords.length}</p>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Vehicles In Maintenance', 'Véhicules en maintenance')}</p>
                      <p className="mt-2 text-2xl font-bold text-indigo-700">{vehiclesCurrentlyInMaintenance}</p>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Completed Records', 'Dossiers terminés')}</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-600">{completedMaintenanceCount}</p>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{tr('Total Cost', 'Coût total')}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{maintenanceTotalCost.toFixed(2)} MAD</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/admin/maintenance')}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)] transition-all hover:scale-[1.01] hover:shadow-[0_18px_36px_rgba(79,70,229,0.34)] 2xl:self-start"
                  >
                    <Wrench className="h-4 w-4" />
                    {tr('Open Quad Maintenance', 'Ouvrir maintenance quad')}
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {viewMode === 'grid' ? (
            <VehicleGridView
              vehicles={filteredVehicles}
              vehicleFuelStateMap={vehicleFuelStateMap}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              getStatusColor={getStatusColor}
              isMaintenanceDue={isMaintenanceDue}
              getOilChangeProgress={getOilChangeProgress}
              isOilChangeDue={isOilChangeDue}
            />
          ) : (
            <VehicleListView
              vehicles={filteredVehicles}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              getStatusColor={getStatusColor}
            />
          )}

          {filteredVehicles.length === 0 && (
            <div className="text-center py-12">
              <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">{tr('No vehicles found matching your criteria', 'Aucun véhicule ne correspond à vos critères')}</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'locations' && (
        <FleetLocationsManager onLocationsChanged={fetchData} />
      )}

      {/* Out of Service Tab */}
      {activeTab === 'out_of_service' && (
        <>
          {/* Filters */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,1.2fr)_auto] xl:grid-cols-[minmax(360px,1.4fr)_auto]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={tr('Search by plate, name, or registration...', 'Rechercher par plaque, nom ou immatriculation...')}
                  value={oosSearchTerm}
                  onChange={(e) => setOosSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <select
                  value={oosModelFilter}
                  onChange={(e) => setOosModelFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">{tr('All Models', 'Tous les modèles')}</option>
                  {[...new Set(vehicles.filter(v => v.status === 'out_of_service').map(v => v.model))].map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                
                <select
                  value={oosTypeFilter}
                  onChange={(e) => setOosTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="all">{tr('All Types', 'Tous les types')}</option>
                  <option value="quad">Quad</option>
                  <option value="ATV">ATV</option>
                  <option value="motorcycle">Motorcycle</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 xl:justify-self-end"
              title={tr('Refresh', 'Actualiser')}
            >
              <RefreshCw className="w-4 h-4" />
              {tr('Refresh', 'Actualiser')}
            </button>
          </div>

          {/* Out of Service Vehicles Grid */}
          {outOfServiceVehicles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {outOfServiceVehicles.map((vehicle) => {
                const daysOutOfService = getDaysOutOfService(vehicle);
                return (
                  <div key={vehicle.id} className="bg-white rounded-lg shadow-md border-2 border-red-200 overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Vehicle Image */}
                    <div className="h-48 bg-gray-200 relative">
                      {normalizeVehicleImageUrl(vehicle.image_url) ? (
                        <img 
                          src={normalizeVehicleImageUrl(vehicle.image_url)} 
                          alt={vehicle.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="w-16 h-16 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                          {tr('Out of Service', 'Hors service')}
                        </span>
                      </div>
                    </div>

                    {/* Vehicle Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{vehicle.name}</h3>
                          <p className="text-sm text-gray-600">{vehicle.model}</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tr('Plate:', 'Plaque :')}</span>
                          <span>{vehicle.plate_number}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tr('Type:', 'Type :')}</span>
                          <span className="capitalize">{vehicle.vehicle_type}</span>
                        </div>
                        {vehicle.registration_number && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tr('Registration:', 'Immatriculation :')}</span>
                            <span>{vehicle.registration_number}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-red-600" />
                          <span className="text-red-600 font-medium">
                            {daysOutOfService} {daysOutOfService === 1 ? tr('day', 'jour') : tr('days', 'jours')} {tr('out of service', 'hors service')}
                          </span>
                        </div>
                      </div>

                      {/* Reason for out of service */}
                      {(vehicle.general_notes || vehicle.notes) && (
                        <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-xs font-medium text-red-800 mb-1">{tr('Reason:', 'Raison :')}</p>
                          <p className="text-sm text-red-700">
                            {vehicle.general_notes || vehicle.notes}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                          <button
                            onClick={() => handleView(vehicle)}
                            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                          {tr('Open Profile', 'Ouvrir le profil')}
                        </button>
                        <button
                          onClick={() => handleReturnToService(vehicle)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {tr('Return to Service', 'Remettre en service')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('All Vehicles In Service', 'Tous les véhicules sont en service')}</h3>
              <p className="text-gray-500">{tr('No vehicles are currently out of service', 'Aucun véhicule n’est actuellement hors service')}</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'archive' && (
        <>
          <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{tr('Sold Vehicle Archive', 'Archive des véhicules vendus')}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {tr('Vehicles with a sale or disposal history live here so the active fleet stays clean.', 'Les véhicules avec un historique de vente ou de sortie apparaissent ici afin de garder la flotte active claire.')}
                </p>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
              >
                <RefreshCw className="w-4 h-4" />
                {tr('Refresh', 'Actualiser')}
              </button>
            </div>
          </div>

          {archivedVehicles.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {archivedVehicles.map((vehicle: any) => {
                const disposition = vehicle.disposition;
                const eventType = disposition?.event_type || vehicle.status || 'sold';
                const salePrice = disposition?.sale_price_mad ?? vehicle.sale_price_mad ?? 0;
                const saleDate = disposition?.event_date || vehicle.sold_date;
                const buyerName = disposition?.buyer_name || vehicle.sold_buyer_name;
                return (
                  <div key={vehicle.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                    <div className="relative h-44 bg-slate-100">
                      {normalizeVehicleImageUrl(vehicle.image_url) ? (
                        <img
                          src={normalizeVehicleImageUrl(vehicle.image_url)}
                          alt={vehicle.name}
                          className="h-full w-full object-cover opacity-80"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Car className="h-14 w-14 text-slate-300" />
                        </div>
                      )}
                      <span className="absolute right-3 top-3 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-semibold text-white">
                        {eventType === 'sold' ? tr('Sold', 'Vendu') : tr('Disposed', 'Sorti')}
                      </span>
                    </div>
                    <div className="space-y-4 p-5">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{vehicle.plate_number || vehicle.name}</h3>
                            <p className="text-sm text-slate-500">{vehicle.model} • {vehicle.vehicle_type}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            ID {vehicle.id}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('Purchase', 'Achat')}</p>
                          <p className="mt-1 font-semibold text-slate-900">{Number(vehicle.purchase_cost_mad || 0).toLocaleString()} MAD</p>
                          <p className="text-xs text-slate-500">{vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US') : tr('Date not set', 'Date non définie')}</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{tr('Sale', 'Vente')}</p>
                          <p className="mt-1 font-semibold text-slate-900">{Number(salePrice || 0).toLocaleString()} MAD</p>
                          <p className="text-xs text-slate-500">{saleDate ? new Date(saleDate).toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US') : tr('Date not set', 'Date non définie')}</p>
                        </div>
                      </div>
                      {buyerName ? (
                        <p className="text-sm text-slate-600">
                          <span className="font-medium text-slate-900">{tr('Buyer', 'Acheteur')}:</span> {buyerName}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleView(vehicle)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {tr('Open Vehicle Profile', 'Ouvrir le profil véhicule')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <FileText className="mx-auto mb-4 h-14 w-14 text-slate-300" />
              <h3 className="text-lg font-semibold text-slate-900">{tr('No sold vehicles archived yet', 'Aucun véhicule vendu archivé')}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {tr('Add sold history from a vehicle profile and it will appear here automatically.', 'Ajoutez un historique de vente depuis un profil véhicule et il apparaîtra ici automatiquement.')}
              </p>
            </div>
          )}
        </>
      )}

      {/* Vehicle Models Tab */}
      {activeTab === 'models' && (
        <>
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{tr('Vehicle Models', 'Modèles véhicule')} ({vehicleModels.length})</h2>
              <p className="mt-1 text-sm text-gray-600">{tr('Manage the reusable model catalog used when creating and organizing fleet vehicles.', 'Gérez le catalogue réutilisable de modèles utilisé pour créer et organiser les véhicules de la flotte.')}</p>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                title={tr('Refresh Models', 'Actualiser les modèles')}
              >
                <RefreshCw className="w-4 h-4" />
                {tr('Refresh', 'Actualiser')}
              </button>
              <button
                onClick={() => {
                  setModelFormError('');
                  setModelImageDraftId(`vehicle-model-draft-${Date.now()}`);
                  setModelFormData({
                    name: '',
                    model: '',
                    vehicle_type: 'quad',
                    description: '',
                    tank_capacity_liters: '',
                    image_url: '',
                  });
                  setShowAddModelForm(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)] transition-all hover:scale-[1.01] hover:shadow-[0_18px_36px_rgba(79,70,229,0.34)]"
              >
                <Plus className="w-4 h-4" />
                {tr('Add Model', 'Ajouter un modèle')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicleModels.map((model) => {
              // Convert string values to numbers for proper display
              const powerMin = parseInt(model.power_cc_min as any) || 0;
              const powerMax = parseInt(model.power_cc_max as any) || 0;
              const capacityMin = parseInt(model.capacity_min as any) || 0;
              const capacityMax = parseInt(model.capacity_max as any) || 0;
              const tankCapacityLiters = resolveTankCapacityLiters(model.tank_capacity_liters, model.model, model.name);
              
              return (
                <div key={model.id} className="rounded-[24px] border border-violet-100 bg-white p-6 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
                  {model.image_url ? (
                    <img
                      src={normalizeVehicleImageUrl(model.image_url)}
                      alt={[model.name, model.model].filter(Boolean).join(' ')}
                      className="mb-4 h-40 w-full rounded-2xl object-cover"
                    />
                  ) : null}
                  <div className="mb-2 flex justify-between items-start">
                    <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditModel(model)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                        title={tr('Edit Model', 'Modifier le modèle')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model)}
                        disabled={deletingModelId === model.id}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                          deletingModelId === model.id
                            ? 'cursor-not-allowed border-slate-200 text-slate-400'
                            : 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                        title={deletingModelId === model.id ? tr('Deleting...', 'Suppression...') : tr('Delete Model', 'Supprimer le modèle')}
                      >
                        {deletingModelId === model.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">{model.description || tr('No description available', 'Aucune description disponible')}</p>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
                    <div>{tr('Model', 'Modèle')}: {model.model || 'N/D'}</div>
                    <div>{tr('Type', 'Type')}: {model.vehicle_type || 'N/D'}</div>
                    <div>{tr('Power', 'Puissance')} : {
                      powerMin === 0 && powerMax === 0 
                        ? 'N/D' 
                        : `${powerMin}-${powerMax}cc`
                    }</div>
                    <div>{tr('Capacity', 'Capacité')} : {
                      capacityMin === 0 && capacityMax === 0
                        ? 'N/D'
                        : `${capacityMin}-${capacityMax}`
                    }</div>
                    <div>{tr('Fuel Tank', 'Réservoir')}: {tankCapacityLiters ? `${tankCapacityLiters}L` : 'N/D'}</div>
                    <div>{tr('Active Vehicles', 'Véhicules actifs')}: {model.vehicles?.[0]?.count || 0}</div>
                    <div>{tr('Status', 'Statut')}: {model.is_active ? tr('Active', 'Actif') : tr('Inactive', 'Inactif')}</div>
                  </div>
                  
                  {model.features && model.features.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-gray-700 mb-1">{tr('Features:', 'Caractéristiques :')}</p>
                      <div className="flex flex-wrap gap-1">
                        {model.features.map((feature, index) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {vehicleModels.length === 0 && (
            <div className="text-center py-12">
              <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">{tr('No vehicle models found', 'Aucun modèle de véhicule trouvé')}</p>
            </div>
          )}
        </>
      )}

      {/* Vehicle Model Edit Modal */}
      <VehicleModelEditModal
        vehicleModel={editingVehicleModel}
        isOpen={showEditModelModal}
        onClose={closeEditModal}
        onSave={handleModelEditSave}
        onError={handleModelEditError}
      />

      {/* Vehicle Modal - keeping existing implementation */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-screen overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Car className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {viewingVehicle ? tr('Vehicle Details', 'Détails du véhicule') : editingVehicle ? tr('Edit Vehicle', 'Modifier le véhicule') : tr('Add New Vehicle', 'Ajouter un nouveau véhicule')}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {viewingVehicle ? tr('View comprehensive vehicle information', 'Voir les informations complètes du véhicule') : tr('Create a new vehicle with comprehensive fleet management', 'Créer un nouveau véhicule avec une gestion de flotte complète')}
                  </p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information Section */}
              <div className="bg-blue-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-blue-900">{tr('Basic Information', 'Informations de base')}</h3>
                  <span className="text-red-500">*</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Vehicle Name', 'Nom du véhicule')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder={tr('e.g., ATV-001, Raptor-Blue', 'ex. ATV-001, Raptor-Bleu')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Model', 'Modèle')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData({...formData, model: e.target.value})}
                      placeholder={tr('e.g., Yamaha Raptor 700, Honda TRX450R', 'ex. Yamaha Raptor 700, Honda TRX450R')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Vehicle Type', 'Type de véhicule')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.vehicle_type}
                      onChange={(e) => {
                        const nextVehicleType = e.target.value;
                        setFormData((current) => ({ ...current, vehicle_type: nextVehicleType }));
                        if (formData.vehicle_model_id) {
                          syncVehicleFromModel(formData.vehicle_model_id, nextVehicleType);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                      required
                    >
                      <option value="quad">Quad</option>
                      <option value="ATV">ATV</option>
                      <option value="UTV">UTV</option>
                      <option value="buggy">Buggy</option>
                      <option value="car">Car</option>
                      <option value="motorhome">Motorhome</option>
                      <option value="jet_ski">Jet Ski</option>
                      <option value="electric_bike">Electric Bike</option>
                      <option value="electric_motorbike">Electric Motorbike</option>
                      <option value="electric_motorcycle">Electric Motorcycle</option>
                      <option value="motorcycle">Motorcycle</option>
                      <option value="scooter">Scooter</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Vehicle model', 'Modèle du véhicule')}
                    </label>
                    <select
                      value={formData.vehicle_model_id}
                      onChange={(e) => syncVehicleFromModel(e.target.value, formData.vehicle_type)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    >
                      <option value="">{tr('Select a model', 'Sélectionner un modèle')}</option>
                      {availableModelsForType.map((model) => (
                        <option key={model.id} value={model.id}>
                          {[model.name, model.model].filter(Boolean).join(' ')}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-500">
                      {tr(
                        'ATV vehicles inherit their default image and rider capacity from the selected model.',
                        'Les véhicules ATV héritent de leur image par défaut et de leur capacité de passagers depuis le modèle sélectionné.'
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">
                      {tr('Model preview', 'Aperçu du modèle')}
                    </p>
                    {selectedVehicleModel?.image_url ? (
                      <img
                        src={normalizeVehicleImageUrl(selectedVehicleModel.image_url)}
                        alt={[selectedVehicleModel.name, selectedVehicleModel.model].filter(Boolean).join(' ')}
                        className="mt-3 h-28 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="mt-3 flex h-28 items-center justify-center rounded-xl border border-dashed border-blue-100 bg-slate-50 text-sm text-slate-400">
                        {tr('No model image yet', 'Pas encore d’image modèle')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Engine Power (CC)', 'Puissance moteur (CC)')}</label>
                    <input
                      type="number"
                      value={formData.power_cc}
                      onChange={(e) => setFormData({...formData, power_cc: parseInt(e.target.value) || 0})}
                      placeholder={tr('e.g., 700, 450, 1000', 'ex. 700, 450, 1000')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                      min="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Seating Capacity', 'Capacité de places')}</label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value) || 1})}
                      placeholder="1, 2, 4, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                      min="1"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Color', 'Couleur')}</label>
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({...formData, color: e.target.value})}
                      placeholder={tr('e.g., Red, Blue, Black, Camo', 'ex. Rouge, Bleu, Noir, Camo')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Plate Number', "Numéro d'immatriculation")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.plate_number}
                      onChange={(e) => setFormData({...formData, plate_number: e.target.value})}
                      placeholder={tr('e.g., ABC-123, XYZ-456', 'ex. ABC-123, XYZ-456')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Status', 'Statut')}</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    >
                      <option value="available">{tr('Available', 'Disponible')}</option>
                      <option value="scheduled">{tr('Scheduled', 'Planifié')}</option>
                      <option value="rented">{tr('Rented', 'Loué')}</option>
                      <option value="impounded">{tr('Impounded', 'Mis en fourrière')}</option>
                      <option value="tour">{tr('Tour', 'Tour')}</option>
                      <option value="maintenance">{tr('Maintenance', 'Maintenance')}</option>
                      <option value="out_of_service">{tr('Out of Service', 'Hors service')}</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Current location', 'Emplacement actuel')}</label>
                  <select
                    value={formData.location_id}
                    onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!!viewingVehicle}
                  >
                    <option value="">{tr('No location selected', 'Aucun emplacement sélectionné')}</option>
                    {fleetLocations
                      .filter((fleetLocation) => fleetLocation.is_active !== false)
                      .map((fleetLocation) => (
                        <option key={fleetLocation.id} value={fleetLocation.id}>
                          {fleetLocation.name}
                          {fleetLocation.is_default ? ` ${tr('(Default)', '(Par défaut)')}` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Insurance fields inline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Insurance Policy Number', "Numéro de police d'assurance")}</label>
                    <input
                      type="text"
                      value={formData.insurance_policy_number}
                      onChange={(e) => setFormData({...formData, insurance_policy_number: e.target.value})}
                      placeholder={tr('e.g., POL-2025-001', 'ex. POL-2025-001')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Insurance Provider', 'Assureur')}</label>
                    <input
                      type="text"
                      value={formData.insurance_provider}
                      onChange={(e) => setFormData({...formData, insurance_provider: e.target.value})}
                      placeholder={tr('e.g., Wafa Assurance', 'ex. Wafa Assurance')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Insurance Expiry Date', "Date d'expiration de l'assurance")}</label>
                    <input
                      type="date"
                      value={formData.insurance_expiry_date}
                      onChange={(e) => setFormData({...formData, insurance_expiry_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                </div>

                {/* Registration fields inline */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Registration Number', "Numéro d'immatriculation administratif")}</label>
                    <input
                      type="text"
                      value={formData.registration_number}
                      onChange={(e) => setFormData({...formData, registration_number: e.target.value})}
                      placeholder={tr('e.g., REG-001-2025', 'ex. REG-001-2025')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr("Registration Expiry Date", "Date d'expiration de l'immatriculation")}</label>
                    <input
                      type="date"
                      value={formData.registration_expiry_date}
                      onChange={(e) => setFormData({...formData, registration_expiry_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                </div>
              </div>

              {/* Fleet Information Section - WITH NEW FIELDS */}
              <div className="bg-orange-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Gauge className="w-5 h-5 text-orange-600" />
                  <h3 className="text-lg font-semibold text-orange-900">{tr('Fleet Information', 'Informations de flotte')}</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      {tr('Current Odometer (km)', 'Odomètre actuel (km)')}
                    </label>
                    <input
                      type="number"
                      value={formData.current_odometer}
                      onChange={(e) => setFormData({...formData, current_odometer: e.target.value})}
                      placeholder="e.g., 15000"
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                      min="0"
                      step="0.1"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {tr('Engine Hours', 'Heures moteur')}
                    </label>
                    <input
                      type="number"
                      value={formData.engine_hours}
                      onChange={(e) => setFormData({...formData, engine_hours: e.target.value})}
                      placeholder="e.g., 250.5"
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {tr('Last Oil Change Date', 'Date du dernier changement d’huile')}
                    </label>
                    <input
                      type="date"
                      value={formData.last_oil_change_date}
                      onChange={(e) => setFormData({...formData, last_oil_change_date: e.target.value})}
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      {tr('Last Oil Change Odometer (km)', "Odomètre du dernier changement d’huile (km)")}
                    </label>
                    <input
                      type="number"
                      value={formData.last_oil_change_odometer}
                      onChange={(e) => setFormData({...formData, last_oil_change_odometer: e.target.value})}
                      placeholder="e.g., 14500"
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>

                {/* NEW FIELDS: Next Oil Change Planning */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Next Oil Change Date
                    </label>
                    <input
                      type="date"
                      value={formData.next_oil_change_due}
                      onChange={(e) => setFormData({...formData, next_oil_change_due: e.target.value})}
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      Prochain odomètre de vidange (km)
                    </label>
                    <input
                      type="number"
                      value={formData.next_oil_change_odometer}
                      onChange={(e) => setFormData({...formData, next_oil_change_odometer: e.target.value})}
                      placeholder="e.g., 15000"
                      className="w-full p-2 border rounded-md"
                      disabled={!!viewingVehicle}
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>

              {/* Acquisition Information */}
              <div className="bg-green-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-green-900">Acquisition</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Purchase Cost (MAD)', "Coût d'achat (MAD)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.purchase_cost_mad}
                      onChange={(e) => setFormData({...formData, purchase_cost_mad: e.target.value})}
                      placeholder="e.g., 45000.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Purchase Date', "Date d'achat")}</label>
                    <input
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Supplier / Seller', 'Fournisseur / vendeur')}</label>
                    <input
                      type="text"
                      value={formData.purchase_supplier}
                      onChange={(e) => setFormData({...formData, purchase_supplier: e.target.value})}
                      placeholder={tr('e.g., Segway Morocco', 'ex. Segway Maroc')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('Invoice/Receipt URL', 'URL de la facture / du reçu')}</label>
                    <input
                      type="url"
                      value={formData.purchase_invoice_url}
                      onChange={(e) => setFormData({...formData, purchase_invoice_url: e.target.value})}
                      placeholder="https://example.com/invoice.pdf"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                </div>
              </div>

              {/* Vehicle Image Section - NOW USING NEW COMPONENT */}
              <div className="bg-purple-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-purple-900">{tr('Vehicle Image', 'Image du véhicule')}</h3>
                </div>
                {isAtvType(formData.vehicle_type) && selectedVehicleModel?.image_url && (
                  <div className="mb-4 rounded-xl border border-purple-100 bg-white px-4 py-3 text-sm text-purple-700">
                    {tr(
                      'This ATV is using the image from its selected model. Upload another image only if this unit needs a custom photo.',
                      'Cet ATV utilise l’image de son modèle sélectionné. Téléversez une autre image seulement si cette unité a besoin d’une photo personnalisée.'
                    )}
                  </div>
                )}
                
                <VehicleImageUpload
                  vehicleId={editingVehicle?.id?.toString() || viewingVehicle?.id?.toString() || 'new'}
                  currentImageUrl={vehicleImageUrl}
                  onImageChange={setVehicleImageUrl}
                  disabled={!!viewingVehicle}
                  className="w-full"
                />
              </div>

              {/* Legal & Administrative Documents Section */}
              <div className="bg-indigo-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <File className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-indigo-900">{tr('Documents (Legal & Administrative)', 'Documents (juridiques et administratifs)')}</h3>
                  {vehicleDocuments.length > 0 && (
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2 py-1 rounded-full">
                      {vehicleDocuments.length}
                    </span>
                  )}
                </div>
                
                <VehicleDocuments
                  key={`vehicle-docs-${isNewVehicle ? 'new' : (viewingVehicle?.id || editingVehicle?.id)}`}
                  vehicleId={(viewingVehicle?.id || editingVehicle?.id || null)?.toString()}
                  documents={vehicleDocuments}
                  onDeleteDocument={handleDeleteDocument}
                  canDelete={true}
                  loadFromStorage={loadFromStorageValue}
                  className="w-full"
                />
                
                {!viewingVehicle && (
                  <div className="mt-4">
                    <DocumentUpload
                      vehicleId={editingVehicle?.id?.toString() || null}
                      documents={vehicleDocuments}
                      onDocumentsChange={setVehicleDocuments}
                      disabled={!!viewingVehicle}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* Additional Notes Section */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <StickyNote className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">{tr('Additional Notes', 'Notes supplémentaires')}</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('General Notes', 'Notes générales')}</label>
                    <textarea
                      value={formData.general_notes}
                      onChange={(e) => setFormData({...formData, general_notes: e.target.value})}
                      rows={4}
                      placeholder={tr('Any additional notes about this vehicle, special instructions, known issues, modifications, etc...', 'Toute note supplémentaire sur ce véhicule, instructions spéciales, problèmes connus, modifications, etc...')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{tr('System Notes', 'Notes système')}</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows={4}
                      placeholder={tr('Internal notes for staff, booking system notes, etc...', 'Notes internes pour le personnel, notes du système de réservation, etc...')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
                      disabled={!!viewingVehicle}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                {!viewingVehicle && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 ${
                      submitting
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        {editingVehicle ? tr('Updating...', 'Mise à jour...') : tr('Creating...', 'Création...')}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        {editingVehicle ? tr('Update Vehicle', 'Mettre à jour le véhicule') : tr('Create Vehicle', 'Créer le véhicule')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModelForm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,#f8f6ff_0%,#ffffff_28%)] shadow-[0_24px_60px_rgba(76,29,149,0.18)]">
            <div className="border-b border-violet-100 px-6 py-6">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">{tr('Vehicle Models', 'Modèles véhicule')}</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{tr('Add New Vehicle Model', 'Ajouter un nouveau modèle de véhicule')}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {tr(
                  'Create one clean ATV model record and reuse it across fleet vehicles and the Tours website.',
                  'Créez une fiche modèle ATV propre et réutilisez-la dans la flotte et sur le site Tours.'
                )}
              </p>
            </div>
            <div className="p-6">
              
              {modelFormError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-600">{modelFormError}</p>
                </div>
              )}
              
              <form onSubmit={handleAddModel} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Model Name *', 'Nom du modèle *')}</label>
                    <input
                      type="text"
                      value={modelFormData.name}
                      onChange={(e) => setModelFormData({...modelFormData, name: e.target.value})}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                      placeholder="SEGWAY"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Model Identifier *', 'Identifiant du modèle *')}</label>
                    <input
                      type="text"
                      value={modelFormData.model}
                      onChange={(e) => setModelFormData({...modelFormData, model: e.target.value})}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                      placeholder="AT6"
                      required
                    />
                  </div>
                </div>
                
                <div className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">{tr('Image', 'Image')}</p>
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-700">{tr('Model image', 'Image du modèle')}</label>
                    <VehicleImageUpload
                      vehicleId={`vehicle-models/${modelImageDraftId}`}
                      currentImageUrl={modelFormData.image_url}
                      onImageChange={(nextUrl) => setModelFormData({ ...modelFormData, image_url: nextUrl })}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Vehicle Type', 'Type de véhicule')}</label>
                    <select
                      value={modelFormData.vehicle_type}
                      onChange={(e) => setModelFormData({...modelFormData, vehicle_type: e.target.value})}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                    >
                      <option value="quad">Quad</option>
                      <option value="ATV">ATV</option>
                      <option value="UTV">UTV</option>
                      <option value="buggy">Buggy</option>
                      <option value="car">Car</option>
                      <option value="motorhome">Motorhome</option>
                      <option value="jet_ski">Jet Ski</option>
                      <option value="electric_bike">Electric Bike</option>
                      <option value="electric_motorbike">Electric Motorbike</option>
                      <option value="electric_motorcycle">Electric Motorcycle</option>
                      <option value="motorcycle">Motorcycle</option>
                      <option value="scooter">Scooter</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Fuel Tank Capacity (L)', 'Capacité du réservoir (L)')}</label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={modelFormData.tank_capacity_liters}
                      onChange={(e) => setModelFormData({...modelFormData, tank_capacity_liters: e.target.value})}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                      placeholder="23"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Description', 'Description')}</label>
                  <textarea
                    value={modelFormData.description}
                    onChange={(e) => setModelFormData({...modelFormData, description: e.target.value})}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-300"
                    placeholder={tr('Optional description of the vehicle model', 'Description facultative du modèle de véhicule')}
                  />
                </div>
                
                <div className="flex justify-end gap-3 border-t border-violet-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModelForm(false);
                      setModelFormError('');
                      setModelFormData({
                        name: '',
                        model: '',
                        vehicle_type: 'quad',
                        description: '',
                        tank_capacity_liters: '',
                        image_url: '',
                      });
                      setModelImageDraftId(`vehicle-model-draft-${Date.now()}`);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(79,70,229,0.24)] transition-all hover:scale-[1.01]"
                  >
                    {tr('Add Model', 'Ajouter un modèle')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default VehicleManagement;
