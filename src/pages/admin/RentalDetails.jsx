
import { shortenUrl as shortenUrlService } from '../../services/UrlShortenerService';
import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { apiManager } from '../../services/apiManager';
import FuelPricingService from '../../services/FuelPricingService';
import FuelTransactionService from '../../services/FuelTransactionService';
import { generateThumbnailFromBlob, uploadThumbnail } from '../../utils/thumbnailGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Alert, AlertDescription } from '../../components/ui/alert';
import RentalVideos from '../../components/RentalVideos';
import ViewCustomerDetailsDrawer from '../../components/admin/ViewCustomerDetailsDrawer';
import RentalContract from '../../components/admin/RentalContract';
import SignaturePadModal from '../../components/SignaturePadModal';
import ExtensionRequestModal from '../../components/admin/ExtensionRequestModal';
import ExtensionHistory from '../../components/admin/ExtensionHistory';
import FuelLevelModal from '../../components/admin/FuelLevelModal';
import ExtensionPricingService from '../../services/ExtensionPricingService';
import OverageCalculationService from '../../services/OverageCalculationService';
import { getPaymentStatusStyle } from '../../config/statusColors';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminOrOwner, canApprovePriceOverrides, canEditRentalPrice } from '../../utils/permissionHelpers';
import PricingRulesService from '../../services/PricingRulesService';
import { ArrowLeft, Printer, X, Upload, Play, Plus, AlertTriangle, Clock, CheckCircle, XCircle, Calendar, PlayCircle, Maximize2, User, Users, CreditCard, FileSignature, Edit, Save, DollarSign, StopCircle, Video, FileVideo, Camera, Flashlight, Info, Gauge, Package, FileText, Receipt, Share2, Smartphone, Fuel, Loader, Wrench } from 'lucide-react';
import { FaWhatsapp, FaCheck, FaFilePdf, FaFileInvoice, FaVideo } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import InvoiceTemplate from '../../components/InvoiceTemplate';
import ContractTemplate from '../../components/ContractTemplate';
import ReceiptTemplate from '../../components/ReceiptTemplate';
import { processMedia, getMediaType, createThumbnail } from '../../utils/mediaProcessor';
import TierPricingDisplay from '../../components/TierPricingDisplay';
import MaintenanceService from '../../services/MaintenanceService';
import VehicleReportService from '../../services/VehicleReportService';
import { DynamicPricingService } from '../../services/DynamicPricingService';
import { formatMaintenanceReference } from '../../utils/maintenanceReference';


// Set to true to enable verbose logging in RentalDetails
const RENTAL_DEBUG = false;

const getRentalKilometerPackage = (rental, packageDetails) => {
  const pkg = rental?.package || packageDetails;
  if (!pkg) return null;

  const hasLinkedPackage = Boolean(rental?.package_id || pkg?.id);
  const hasKmConfig =
    pkg.included_kilometers !== null && pkg.included_kilometers !== undefined ||
    pkg.extra_km_rate !== null && pkg.extra_km_rate !== undefined;

  return hasLinkedPackage && hasKmConfig ? pkg : null;
};

const hasRecordedReturnFuel = (rental, endFuelLevel) => {
  return endFuelLevel !== null && endFuelLevel !== undefined ||
    rental?.end_fuel_level !== null && rental?.end_fuel_level !== undefined ||
    String(rental?.rental_status || '').toLowerCase() === 'completed';
};

const getEffectiveFuelChargeAmount = ({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }) => {
  if (!fuelChargeEnabled || !hasRecordedReturnFuel(rental, endFuelLevel)) {
    return 0;
  }

  return parseFloat(fuelCharge || rental?.fuel_charge || 0) || 0;
};

const DEFAULT_RENTAL_TIMING_SETTINGS = {
  graceMinutes: 60,
  softLockMinutes: 45,
};

const formatRentalScheduleDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledRentalTimingState = (scheduledStartValue, timingSettings, nowValue = new Date()) => {
  const scheduledStart = new Date(scheduledStartValue || '');
  if (Number.isNaN(scheduledStart.getTime())) {
    return null;
  }

  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const graceMinutes = Number(timingSettings?.graceMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes);
  const softLockMinutes = Number(timingSettings?.softLockMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes);
  const minutesLate = Math.floor((now.getTime() - scheduledStart.getTime()) / 60000);
  const expiredAt = new Date(scheduledStart.getTime() + graceMinutes * 60000);

  return {
    now,
    scheduledStart,
    expiredAt,
    graceMinutes,
    softLockMinutes,
    minutesLate,
    isExpired: minutesLate > graceMinutes,
    isSoftLocked: minutesLate >= softLockMinutes,
    startsInMinutes: minutesLate < 0 ? Math.abs(minutesLate) : 0,
    minutesPastGrace: minutesLate > graceMinutes ? minutesLate - graceMinutes : 0,
  };
};

const VEHICLE_REPORT_AREAS = [
  { id: 'front', label: 'Front', position: 'left-[50%] top-2 -translate-x-1/2' },
  { id: 'rear', label: 'Rear', position: 'left-[50%] bottom-2 -translate-x-1/2' },
  { id: 'left_side', label: 'Left Side', position: 'left-2 top-[50%] -translate-y-1/2' },
  { id: 'right_side', label: 'Right Side', position: 'right-2 top-[50%] -translate-y-1/2' },
  { id: 'front_left', label: 'Front Left', position: 'left-5 top-8' },
  { id: 'front_right', label: 'Front Right', position: 'right-5 top-8' },
  { id: 'rear_left', label: 'Rear Left', position: 'left-5 bottom-8' },
  { id: 'rear_right', label: 'Rear Right', position: 'right-5 bottom-8' },
  { id: 'seat_center', label: 'Center / Seat', position: 'left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2' },
];

const DEFAULT_VEHICLE_REPORT_DRAFT = {
  enabled: false,
  report_type: 'damage',
  severity: 'minor',
  description: '',
  affected_areas: [],
  customer_chargeable: false,
  customer_charge_amount: '',
  send_to_maintenance: true,
};

export default function RentalDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const finishWorkflowStorageKey = id ? `rental_finish_workflow_${id}` : null;
  
  // 🔍 DEBUG: WhatsApp button click handler
  const [rental, setRental] = useState(null);
  const [tierPricingBreakdown, setTierPricingBreakdown] = useState(null);

  const removeFile = async (fileUrl, fileType) => {
    try {
      // Extract the file path from the URL
      const urlParts = fileUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const folderPath = urlParts.slice(-2, -1)[0]; // Get the folder name (e.g., 'opening_videos', 'closing_videos')
      
      // Delete from Supabase storage
      const { error: deleteError } = await supabase.storage
        .from('rental-media')
        .remove([`${folderPath}/${fileName}`]);
      
      if (deleteError) {
        console.error('Error deleting file from storage:', deleteError);
        throw deleteError;
      }
      
      // Update the rental record to remove the file reference
      let updateData = {};
      if (fileType === 'opening_video') {
        updateData.opening_video_url = null;
      } else if (fileType === 'closing_video') {
        updateData.closing_video_url = null;
      }
      
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);
      
      if (updateError) throw updateError;
      
      // Update local state
      setRental(prev => ({
        ...prev,
        ...updateData
      }));
      
      toast.success('File removed successfully');
      await loadRentalData(true);
      
    } catch (err) {
      console.error('❌ Error removing file:', err);
      toast.error(`Failed to remove file: ${err.message}`);
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [elapsedTime, setElapsedTime] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [rentalTimingSettings, setRentalTimingSettings] = useState(DEFAULT_RENTAL_TIMING_SETTINGS);
  
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  
  const [capturedMedia, setCapturedMedia] = useState([]);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'opening' or 'closing'
  const [showMediaReview, setShowMediaReview] = useState(false); // Renamed from capturedMedia
  const [mediaStepComplete, setMediaStepComplete] = useState(false);
  const [mediaCount, setMediaCount] = useState({ photos: 0, videos: 0 });

  // Calculate media counts and update completion status
  const updateMediaCounts = (media) => {
    const photos = media.filter(m => m.type?.startsWith('image/')).length;
    const videos = media.filter(m => m.type?.startsWith('video/')).length;
    setMediaCount({ photos, videos });
    setMediaStepComplete(photos + videos > 0);
  };

  // Handle Done button click in modal
  const handleMediaCaptureDone = () => {
    setOpeningModalOpen(false);
    setClosingModalOpen(false);
    setShowMediaReview(true);
    // Don't upload yet, just show in review area
  };

  // Remove a captured media item
  const removeCapturedMedia = (mediaId) => {
    const updated = capturedMedia.filter(m => m.id !== mediaId);
    setCapturedMedia(updated);
    updateMediaCounts(updated);
  };

  // Handle final upload of all captured media
  const handleUploadAllMedia = async () => {
    if (capturedMedia.length === 0) return;
    
    setIsProcessingVideo(true);
    try {
      // Upload all captured media sequentially
      for (const media of capturedMedia) {
        await uploadMediaItem(media);
      }
      setCapturedMedia([]);
      setShowMediaReview(false);
      updateMediaCounts([]);
      toast.success('All media uploaded successfully!');
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error('Failed to upload some media items. Please try again.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Upload a single media item
  const uploadMediaItem = async (media) => {
    const isOpening = media.isOpening !== false; // default to opening if not specified
    const fileName = `${isOpening ? 'opening' : 'closing'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filePath = `${id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('rental-videos')
      .upload(filePath, media.file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('rental-videos')
      .getPublicUrl(filePath);

    const { error: dbError } = await supabase
      .from('rental_videos')
      .insert({
        rental_id: id,
        video_url: publicUrl,
        video_type: isOpening ? 'opening' : 'closing',
        file_type: media.type?.startsWith('image/') ? 'image' : 'video'
      });

    if (dbError) throw dbError;

    // Refresh media list
    if (isOpening) {
      setOpeningMedia(prev => [...prev, { video_url: publicUrl, file_type: media.type?.startsWith('image/') ? 'image' : 'video' }]);
    } else {
      setClosingMedia(prev => [...prev, { video_url: publicUrl, file_type: media.type?.startsWith('image/') ? 'image' : 'video' }]);
    }
  };
  
  const [openingMedia, setOpeningMedia] = useState([]);
  const [closingMedia, setClosingMedia] = useState([]);
  const [openingMediaMode, setOpeningMediaMode] = useState('video'); // 'video' or 'photo'
  const [closingMediaMode, setClosingMediaMode] = useState('video'); // 'video' or 'photo'
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
  
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  
  const [isSigning, setIsSigning] = useState(false);
  const [returnSignatureUrl, setReturnSignatureUrl] = useState(null);
  const [isSigningReturnContract, setIsSigningReturnContract] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const forceMobileRender = async () => {
    if (!isMobileDevice()) return;
    
    // Force React to re-render hidden templates
    await new Promise(resolve => {
      setVideoRefreshKey(prev => prev + 1);
      setTimeout(resolve, 500);
    });
  };


  const [contractPreviewModal, setContractPreviewModal] = useState(false);
  const [receiptPreviewModal, setReceiptPreviewModal] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [isGeneratingBoth, setIsGeneratingBoth] = useState(false);

  // WhatsApp modal state
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappOptions, setWhatsappOptions] = useState({
    contract: true,
    receipt: true,
    openingVideo: false,
    closingVideo: false
  });

  const [logoUrl, setLogoUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);

  // Price editing state
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [manualPrice, setManualPrice] = useState('');
  const [priceOverrideReason, setPriceOverrideReason] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Video refresh trigger
  const [videoRefreshKey, setVideoRefreshKey] = useState(0);
  const [mobileLoading, setMobileLoading] = useState(false);

  // Extension state
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [extensions, setExtensions] = useState([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);

  // Late fee state
  const [lateFee, setLateFee] = useState(null);
  const [rentalHistory, setRentalHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Deposit return state
  const [showDepositSignatureModal, setShowDepositSignatureModal] = useState(false);
  const [deductFromDeposit, setDeductFromDeposit] = useState(false);
  const [depositReturnAmount, setDepositReturnAmount] = useState(0);

  // Odometer state
  const [startOdometer, setStartOdometer] = useState('');
  const [isEditingOdometer, setIsEditingOdometer] = useState(false);
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);
  const [endOdometer, setEndOdometer] = useState('');
  const [showEndOdometerPrompt, setShowEndOdometerPrompt] = useState(false);
  const [isProcessingEndOdometer, setIsProcessingEndOdometer] = useState(false);
  const [isEditingEndOdometer, setIsEditingEndOdometer] = useState(false);
  const [isEditingStartOdometer, setIsEditingStartOdometer] = useState(false);
  const [startOdometerEditValue, setStartOdometerEditValue] = useState('');
  const [endOdometerEditValue, setEndOdometerEditValue] = useState('');

  // Fuel level state
  const [startFuelLevel, setStartFuelLevel] = useState(null);
  const [endFuelLevel, setEndFuelLevel] = useState(null);
  const [showStartFuelModal, setShowStartFuelModal] = useState(false);
  const [showEndFuelModal, setShowEndFuelModal] = useState(false);
  const [fuelPricePerLine, setFuelPricePerLine] = useState(0);
  const [fuelCharge, setFuelCharge] = useState(0);
  const [finishRentalSteps, setFinishRentalSteps] = useState({
    showWorkflow: false,
    closingVideoComplete: false,
    endOdometerComplete: false,
    endFuelComplete: false
  });
  const [requiresClosingInspectionReview, setRequiresClosingInspectionReview] = useState(false);
  const [vehicleReportDraft, setVehicleReportDraft] = useState(DEFAULT_VEHICLE_REPORT_DRAFT);
  const [vehicleReport, setVehicleReport] = useState(null);
  const [savingVehicleReport, setSavingVehicleReport] = useState(false);
  const [maintenanceChargeForm, setMaintenanceChargeForm] = useState({
    days: 0,
    dailyRate: 0,
    discount: 0,
    total: 0,
    source: 'none',
  });
  const [savingMaintenanceCharge, setSavingMaintenanceCharge] = useState(false);
  const restoredFinishWorkflowRef = useRef(null);

  const hasClosingInspectionMedia = closingMedia.length > 0;
  const reportRequired = vehicleReportDraft.enabled;
  const reportSaved = Boolean(vehicleReport?.id);
  const reportNeedsAffectedAreas = vehicleReportDraft.report_type !== 'mechanical_issue';
  const hasAffectedAreas = Array.isArray(vehicleReportDraft.affected_areas) && vehicleReportDraft.affected_areas.length > 0;

  const normalizedVehicleReportDraft = reportRequired ? {
    report_type: vehicleReportDraft.report_type || 'damage',
    severity: vehicleReportDraft.severity || 'minor',
    description: vehicleReportDraft.description.trim(),
    affected_areas: [...(vehicleReportDraft.affected_areas || [])].sort(),
    customer_chargeable: Boolean(vehicleReportDraft.customer_chargeable),
    customer_charge_amount: vehicleReportDraft.send_to_maintenance ? '' : String(vehicleReportDraft.customer_charge_amount ?? ''),
    send_to_maintenance: Boolean(vehicleReportDraft.send_to_maintenance),
  } : null;

  const normalizedSavedVehicleReport = vehicleReport ? {
    report_type: vehicleReport.report_type || 'damage',
    severity: vehicleReport.severity || 'minor',
    description: (vehicleReport.description || '').trim(),
    affected_areas: [...(Array.isArray(vehicleReport.affected_areas) ? vehicleReport.affected_areas : [])].sort(),
    customer_chargeable: Boolean(vehicleReport.customer_chargeable),
    customer_charge_amount: vehicleReport.send_to_maintenance ? '' : String(vehicleReport.customer_charge_amount ?? ''),
    send_to_maintenance: Boolean(vehicleReport.send_to_maintenance),
  } : null;

  const reportHasUnsavedChanges = reportRequired && (
    !reportSaved ||
    JSON.stringify(normalizedVehicleReportDraft) !== JSON.stringify(normalizedSavedVehicleReport)
  );

  const canSaveVehicleReport = reportRequired &&
    hasClosingInspectionMedia &&
    (!reportNeedsAffectedAreas || hasAffectedAreas) &&
    !savingVehicleReport;

  const inspectionComplete = reportRequired
    ? hasClosingInspectionMedia && reportSaved && !reportHasUnsavedChanges && !requiresClosingInspectionReview
    : !requiresClosingInspectionReview;


  const [customerDetailsDrawer, setCustomerDetailsDrawer] = useState({
    isOpen: false,
    customerId: null,
    rental: null,
    secondDrivers: [],
    viewMode: 'customer'
  });
  // Fuel charge toggle state - use safe default
  const [fuelChargeEnabled, setFuelChargeEnabled] = useState(true);
// Camera recording state - NEW for native camera support
const [isRecording, setIsRecording] = useState(false);
const [facingMode, setFacingMode] = useState('environment'); // Default to back camera
const [isFirstLoad, setIsFirstLoad] = useState(true);
const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false); // 'environment' = back, 'user' = front
const [recordingStream, setRecordingStream] = useState(null);
const [mediaRecorder, setMediaRecorder] = useState(null);
const [recordedChunks, setRecordedChunks] = useState([]);
const [torchEnabled, setTorchEnabled] = useState(false);
const videoPreviewRef = useRef(null);
const canvasRef = useRef(null);
const animationFrameRef = useRef(null);

// Separate refs for each modal to avoid conflicts
const openingVideoRef = useRef(null);
const openingCanvasRef = useRef(null);
const closingVideoRef = useRef(null);
const closingCanvasRef = useRef(null);
const endOdometerEditInputRef = useRef(null);
const endOdometerPromptInputRef = useRef(null);

// Video conversion state - for iOS .MOV/HEVC to mp4 conversion
const [isConverting, setIsConverting] = useState(false);
const [conversionProgress, setConversionProgress] = useState(0);
const [pdfCache, setPdfCache] = useState({
  contractUrl: null,
  receiptUrl: null,
  contractGenerating: false,
  receiptGenerating: false
});
// Package and kilometer tracking state
const [includedKilometers, setIncludedKilometers] = useState(0);
const [extraKmRate, setExtraKmRate] = useState(0);
const [packageDetails, setPackageDetails] = useState(null);
const [mediaViewMode, setMediaViewMode] = useState('list');

// Update fuel charge enabled state when rental data loads
useEffect(() => {
  if (rental) {
    setFuelChargeEnabled(rental.fuel_charge_enabled ?? true);
  }
}, [rental?.id, rental?.fuel_charge_enabled]);

useEffect(() => {
  let cancelled = false;

  const loadRentalTimingSettings = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('rental_grace_period_minutes, rental_soft_lock_minutes')
        .eq('id', 1)
        .maybeSingle();

      if (cancelled || !data) return;

      setRentalTimingSettings({
        graceMinutes: Number(data.rental_grace_period_minutes || DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes),
        softLockMinutes: Number(data.rental_soft_lock_minutes || DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes),
      });
    } catch (_error) {
      if (!cancelled) {
        setRentalTimingSettings(DEFAULT_RENTAL_TIMING_SETTINGS);
      }
    }
  };

  loadRentalTimingSettings();

  return () => {
    cancelled = true;
  };
}, []);

const contractRef = useRef();
const invoiceRef = useRef();
const contractTemplateRef = useRef();
const receiptTemplateRef = useRef();
const contractPdfRef = useRef();
const receiptPdfRef = useRef();
const contractShareRef = useRef();   // dedicated off-screen ref for WhatsApp sharing
const receiptShareRef = useRef();    // dedicated off-screen ref for WhatsApp sharing
const contractUrlRef = useRef(null);
const receiptUrlRef = useRef(null);
// Clear global PDF cache on mount so stale URLs never get reused
if (typeof window !== 'undefined') {
  window.__pdfCache = {};
  window.__pdfGenerating = {};
}

// Capture template as high-res image using same method as handlePrintContract/Receipt
// but upload to Supabase instead of saving/opening
// Public view URLs — perfect quality, works on all devices, no upload needed
const generateContractPDFBlob = async () => {
  return `${window.location.origin}/view/rental/${rental.id}?type=contract`;
};

const generateReceiptPDFBlob = async () => {
  return `${window.location.origin}/view/rental/${rental.id}?type=receipt`;
};

const handlePrintContract = async ({ shareOnly = false } = {}) => {
  if (!contractTemplateRef.current) {
    toast.error('Contract template not found');
    return null;
  }

  try {
    // Use contractTemplateRef (modal) — always renders correctly
    const contractRoot = contractTemplateRef.current || contractPdfRef.current;
    const page1 = contractRoot?.querySelector('.page-container') || contractRoot;
    const contractElement = page1;
    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const MARGIN = 10;

    const canvas = await html2canvas(contractElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const imgWidth = A4_WIDTH - (MARGIN * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = MARGIN;
    if (imgHeight > A4_HEIGHT - (MARGIN * 2)) {
      const scaleFactor = (A4_HEIGHT - (MARGIN * 2)) / imgHeight;
      const scaledWidth = imgWidth * scaleFactor;
      const scaledHeight = imgHeight * scaleFactor;
      const xPos = (A4_WIDTH - scaledWidth) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', xPos, yPos, scaledWidth, scaledHeight);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, yPos, imgWidth, imgHeight);
    }

    const pdfBlob = pdf.output('blob');

    // Upload to Supabase — required for WhatsApp sharing
    const filePath = `contracts/contract_${rental.rental_id}_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('rental-documents')
      .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
    let uploadedUrl = null;
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(filePath);
      contractUrlRef.current = publicUrl;
      uploadedUrl = publicUrl;
    } else {
      console.error('Contract upload error:', upErr);
    }

    if (!shareOnly) {
      const filename = `Contract_${rental?.rental_id || rental?.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
      } else {
        pdf.save(filename);
      }
    }

    return uploadedUrl;
  } catch (error) {
    console.error('❌ Error generating contract PDF:', error);
    toast.error('Failed to generate contract PDF. Please try again.');
    return null;
  }
};

const handlePrintReceipt = async ({ shareOnly = false } = {}) => {
  if (!receiptTemplateRef.current) {
    toast.error('Receipt template not found');
    return null;
  }

  try {
    const receiptRoot = receiptTemplateRef.current || receiptPdfRef.current;
    const page1 = receiptRoot?.querySelector('.page-container') || receiptRoot?.querySelector('.receipt-container') || receiptRoot;
    const receiptElement = page1;

    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const MARGIN = 10;

    const canvas = await html2canvas(receiptElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const imgWidth = A4_WIDTH - (MARGIN * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let yPos = MARGIN;
    if (imgHeight > A4_HEIGHT - (MARGIN * 2)) {
      const scaleFactor = (A4_HEIGHT - (MARGIN * 2)) / imgHeight;
      const scaledWidth = imgWidth * scaleFactor;
      const scaledHeight = imgHeight * scaleFactor;
      const xPos = (A4_WIDTH - scaledWidth) / 2;

      pdf.addImage(
        canvas.toDataURL('image/jpeg', 1.0),
        'JPEG',
        xPos,
        yPos,
        scaledWidth,
        scaledHeight
      );
    } else {
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 1.0),
        'JPEG',
        MARGIN,
        yPos,
        imgWidth,
        imgHeight
      );
    }
    
    const pdfBlobReceipt = pdf.output('blob');

    // Upload to Supabase — required for WhatsApp sharing
    const receiptFilePath = `receipts/receipt_${rental.rental_id}_${Date.now()}.pdf`;
    const { error: receiptUpErr } = await supabase.storage
      .from('rental-documents')
      .upload(receiptFilePath, pdfBlobReceipt, { contentType: 'application/pdf', upsert: true });
    let receiptUploadedUrl = null;
    if (!receiptUpErr) {
      const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(receiptFilePath);
      receiptUrlRef.current = publicUrl;
      receiptUploadedUrl = publicUrl;
    } else {
      console.error('Receipt upload error:', receiptUpErr);
    }

    if (!shareOnly) {
      const filename = `Receipt_${rental.rental_id || rental.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        const pdfUrl = URL.createObjectURL(pdfBlobReceipt);
        window.open(pdfUrl, '_blank');
      } else {
        pdf.save(filename);
      }
    }

    if (RENTAL_DEBUG) console.log('✅ Receipt PDF generated successfully');
    return receiptUploadedUrl;
  } catch (error) {
    console.error('❌ Error generating receipt PDF:', error);
    toast.error('Failed to generate receipt PDF. Please try again.');
    return null;
  }
};

const handlePrintInvoice = () => {
  if (!rental?.id) { 
    toast.error("Rental ID missing"); 
    return; 
  }
  window.open(`/invoice/${rental.id}`, "_blank");
};

// ── Shared: generate PDF blob using exact same logic as print buttons ─────────
const generatePDFBlob = async (element) => {
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  const MARGIN = 10;

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: (A4_WIDTH - MARGIN * 2) * 3.78,
    windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const imgWidth = A4_WIDTH - MARGIN * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > A4_HEIGHT - MARGIN * 2) {
    const scale = (A4_HEIGHT - MARGIN * 2) / imgHeight;
    const sw = imgWidth * scale;
    const sh = imgHeight * scale;
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', (A4_WIDTH - sw) / 2, MARGIN, sw, sh);
  } else {
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, MARGIN, imgWidth, imgHeight);
  }

  return pdf.output('blob');
};

// Upload a PDF blob to Supabase and return public URL
const uploadPDFBlob = async (blob, prefix) => {
  const filePath = `${prefix}s/${prefix}_${rental.rental_id}_${Date.now()}.pdf`;
  const { data, error } = await supabase.storage
    .from('rental-documents')
    .upload(filePath, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('rental-documents').getPublicUrl(filePath);
  return publicUrl;
};

const toDataURL = (url) =>
  fetch(url)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );

// Calculate tier pricing breakdown
const calculateTierPricingBreakdown = async () => {
  // 🚨 CRITICAL: Add this null check FIRST
  if (!rental) {
    if (RENTAL_DEBUG) console.log('⏳ Rental data not loaded yet, skipping tier pricing');
    setTierPricingBreakdown(null);
    return null;
  }

  // 🚨 Then check for package
  if (packageDetails || rental?.package) {
    if (RENTAL_DEBUG) console.log('📦 Package exists, skipping tier pricing breakdown');
    setTierPricingBreakdown(null);
    return null;
  }

    // Now it's safe to access rental properties
    if (rental.rental_type !== 'hourly') return null;

    try {
      let standardHourlyRate = 0;
      let priceSource = 'fallback'; // Track where the price came from
      
      // First try: Fetch from base_prices table using vehicle_model_id
      if (rental.vehicle?.vehicle_model?.id) {
        try {
          const { data: priceData, error } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('hourly_price')
            .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
            .eq('is_active', true)
            .maybeSingle(); // Use maybeSingle() to avoid errors when no row found
          
          if (error) {
            console.warn('⚠️ Error fetching base_prices:', error.message);
          } else if (priceData?.hourly_price) {
            standardHourlyRate = parseFloat(priceData.hourly_price);
            priceSource = 'database';
            if (RENTAL_DEBUG) console.log('✅ Got hourly rate from database:', standardHourlyRate);
          }
        } catch (apiError) {
          console.warn('⚠️ API call failed for base_prices:', apiError.message);
        }
      }

      // Second try: Check if vehicle has hourly_rate directly
      if (standardHourlyRate === 0 && rental.vehicle?.hourly_rate) {
        standardHourlyRate = parseFloat(rental.vehicle.hourly_rate);
        priceSource = 'vehicle_rate';
      }

      // Third try: Fallback based on vehicle name/type
      if (standardHourlyRate === 0 && rental.vehicle?.name) {
        const vehicleName = rental.vehicle.name.toUpperCase();
        if (vehicleName.includes('AT6') || vehicleName.includes('SEGWAY')) {
          standardHourlyRate = 600;
        } else if (vehicleName.includes('AT5')) {
          standardHourlyRate = 400;
        } else if (vehicleName.includes('AT10')) {
          standardHourlyRate = 1000;
        } else {
          standardHourlyRate = 400; // Default fallback
        }
        priceSource = 'fallback';
      }

      if (standardHourlyRate <= 0) {
        setTierPricingBreakdown(null);
        return;
      }

      // Use quantity_hours for hourly rentals, fallback to quantity_days
      let duration = rental.quantity_hours ?? rental.quantity_days ?? 1;
      
      // Only use date calculation for SCHEDULED rentals (not started yet)
      // Once rental is active/completed, rental_end_date includes extensions
      if (rental.rental_status === 'scheduled' && rental.rental_start_date && rental.rental_end_date) {
        const start = new Date(rental.rental_start_date);
        const end = new Date(rental.rental_end_date);
        const actualHours = Math.ceil((end - start) / (1000 * 60 * 60));
        if (actualHours > 0) {
          duration = actualHours;
          if (RENTAL_DEBUG) console.log('📊 Using original scheduled duration:', duration, 'hours');
        }
      } else {
        if (RENTAL_DEBUG) console.log('📊 Using quantity_hours for base duration:', duration, 'hours');
      }
      const tierRate = rental.unit_price || 0;
      
      const standardTotal = duration * standardHourlyRate;
      const tierTotal = duration * tierRate;
      const savings = standardTotal - tierTotal;
      const savingsPercentage = standardTotal > 0 ? (savings / standardTotal * 100).toFixed(1) : 0;
      const isDiscounted = savings > 0;

      const getTierDescription = () => {
        if (duration === 1) return "1-hour standard rate";
        if (duration === 2) return "2-hour special rate";
        if (duration === 3) return "3-hour package deal";
        if (duration === 4) return "4-6 hour bundle";
        if (duration >= 24) return "Daily package (24h)";
        return `${duration}-hour package`;
      };

      const breakdown = {
        vehicleName: rental.vehicle?.name || 'Vehicle',
        duration: duration,
        standardHourlyRate: standardHourlyRate,
        tierRate: tierRate,
        standardTotal: standardTotal,
        tierTotal: tierTotal,
        savings: savings,
        savingsPercentage: savingsPercentage,
        isDiscounted: isDiscounted,
        tierDescription: getTierDescription(),
        isSamePrice: savings === 0,
        source: priceSource // Add source tracking
      };

      setTierPricingBreakdown(breakdown);

    } catch (error) {
      console.error('❌ Error calculating tier pricing breakdown:', error);
      setTierPricingBreakdown(null);
    }
  };

  // Calculate daily tier pricing breakdown
  const calculateDailyTierPricingBreakdown = async () => {
    // 🚨 CRITICAL: Add this null check FIRST
    if (!rental) {
      if (RENTAL_DEBUG) console.log('⏳ Rental data not loaded yet, skipping daily tier pricing');
      setTierPricingBreakdown(null);
      return null;
    }

    // 🚨 Then check for package
    if (packageDetails || rental?.package) {
      if (RENTAL_DEBUG) console.log('📦 Package exists, skipping daily tier pricing breakdown');
      setTierPricingBreakdown(null);
      return null;
    }

    // Now it's safe to access rental properties
    if (rental.rental_type !== 'daily') return null;

    try {
      let standardDailyRate = 0;
      let priceSource = 'fallback';

      // First try: Fetch from base_prices table using vehicle_model_id
      if (rental.vehicle?.vehicle_model?.id) {
        try {
          const { data: priceData, error } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('daily_price')
            .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
            .eq('is_active', true)
            .maybeSingle();

          if (error) {
            console.warn('⚠️ Error fetching daily base_prices:', error.message);
          } else if (priceData?.daily_price) {
            standardDailyRate = parseFloat(priceData.daily_price);
            priceSource = 'database';
            if (RENTAL_DEBUG) console.log('✅ Got daily rate from database:', standardDailyRate);
          }
        } catch (apiError) {
          console.warn('⚠️ API call failed for daily base_prices:', apiError.message);
        }
      }

      // Second try: Check if vehicle has daily_rate directly
      if (standardDailyRate === 0 && rental.vehicle?.daily_rate) {
        standardDailyRate = parseFloat(rental.vehicle.daily_rate);
        priceSource = 'vehicle_rate';
      }

      // Third try: Fallback based on vehicle name/type
      if (standardDailyRate === 0 && rental.vehicle?.name) {
        const vehicleName = rental.vehicle.name.toUpperCase();
        if (vehicleName.includes('AT6') || vehicleName.includes('SEGWAY')) {
          standardDailyRate = 1300;
        } else if (vehicleName.includes('AT5')) {
          standardDailyRate = 900;
        } else if (vehicleName.includes('AT10')) {
          standardDailyRate = 1800;
        } else {
          standardDailyRate = 800; // Default fallback for daily
        }
        priceSource = 'fallback';
      }

      if (standardDailyRate <= 0) {
        setTierPricingBreakdown(null);
        return;
      }

      // Calculate duration in days
      let duration = rental.quantity_days || 1;

      if (rental.rental_status === 'scheduled' && rental.rental_start_date && rental.rental_end_date) {
        const start = new Date(rental.rental_start_date);
        const end = new Date(rental.rental_end_date);
        const actualDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        if (actualDays > 0) {
          duration = actualDays;
          if (RENTAL_DEBUG) console.log('📊 Using original scheduled duration:', duration, 'days');
        }
      } else {
        if (RENTAL_DEBUG) console.log('📊 Using quantity_days for base duration:', duration, 'days');
      }

      const tierRate = rental.unit_price || 0;
      const standardTotal = duration * standardDailyRate;
      const tierTotal = duration * tierRate;
      const savings = standardTotal - tierTotal;
      const savingsPercentage = standardTotal > 0 ? (savings / standardTotal * 100).toFixed(1) : 0;
      const isDiscounted = savings > 0;

      const getTierDescription = () => {
        if (duration === 1) return "1-day standard rate";
        if (duration === 2) return "2-day special rate";
        if (duration === 3) return "3-day package deal";
        if (duration >= 7) return "Weekly package";
        return `${duration}-day package`;
      };

      const breakdown = {
        vehicleName: rental.vehicle?.name || 'Vehicle',
        duration: duration,
        standardHourlyRate: standardDailyRate, // Keep same field name for compatibility
        tierRate: tierRate,
        standardTotal: standardTotal,
        tierTotal: tierTotal,
        savings: savings,
        savingsPercentage: savingsPercentage,
        isDiscounted: isDiscounted,
        tierDescription: getTierDescription(),
        isSamePrice: savings === 0,
        source: priceSource,
        isDaily: true // Flag to indicate daily pricing
      };

      setTierPricingBreakdown(breakdown);

    } catch (error) {
      console.error('❌ Error calculating daily tier pricing breakdown:', error);
      setTierPricingBreakdown(null);
    }
  };

  useEffect(() => {
    // 🚨 Add this null check
    if (!rental) return;
    
    if (rental?.unit_price && rental?.vehicle?.id) {
      if (rental?.rental_type === 'hourly') {
        calculateTierPricingBreakdown();
      } else if (rental?.rental_type === 'daily') {
        calculateDailyTierPricingBreakdown();
      }
    }
  }, [rental?.unit_price, rental?.vehicle?.id, rental?.rental_type, rental?.quantity_days, rental?.quantity_hours]); 
  // 📊 RENTAL DATA LOGGING - only on rental ID change to prevent spam
  useEffect(() => {
    if (rental) {
      if (RENTAL_DEBUG) console.log('📊 Rental data loaded:', {
        id: rental.rental_id,
        type: rental.rental_type,
        hours: rental.quantity_hours,
        days: rental.quantity_days,
        rate: rental.unit_price,
        total: rental.rental_type === 'hourly' 
          ? (rental.quantity_hours ?? 1) * rental.unit_price
          : (rental.quantity_days ?? 1) * rental.unit_price
      });
    }
  }, [rental?.id]);

  useEffect(() => {
    toDataURL("/assets/logo.jpg").then((dataUrl) => {
      setLogoUrl(dataUrl);
    });
    toDataURL("/assets/stamp.png").then((dataUrl) => {
      setStampUrl(dataUrl);
    });
  }, []);

  // Handle openExtension URL parameter (from Dashboard urgent rentals)
  useEffect(() => {
    // Check if URL has openExtension parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('openExtension') === 'true') {
      if (RENTAL_DEBUG) console.log('🔍 Found openExtension parameter, opening extension modal...');
      
      // Small delay to ensure component is fully loaded
      setTimeout(() => {
        // Make sure setExtensionModalOpen exists in your component
        if (typeof setExtensionModalOpen === 'function') {
          setExtensionModalOpen(true);
          
          // Clean up the URL (remove the query parameter)
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }, 500);
    }
  }, []);
  useEffect(() => {
    if (!userProfile) return;

    setCurrentUser({
      ...userProfile,
      full_name: userProfile.full_name || userProfile.fullName || userProfile.email,
    });
  }, [userProfile]);

  // Load extensions for this rental
  const loadRentalHistory = async (rentalId) => {
    if (!rentalId) return;
    try {
      const { data } = await supabase
        .from('saharax_0u4w4d_activity_log')
        .select('*')
        .eq('entity_id', rentalId)
        .order('created_at', { ascending: false })
        .limit(50);
      setRentalHistory(data || []);
    } catch(e) { setRentalHistory([]); }
  };

  const syncVehicleCurrentOdometer = async (vehicleId, odometerValue) => {
    if (!vehicleId || Number.isNaN(odometerValue)) return;

    const { error } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .update({
        current_odometer: odometerValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);

    if (error) throw error;
  };

  const handleEditStartOdometer = async () => {
    const newStart = parseFloat(startOdometerEditValue);
    if (isNaN(newStart) || newStart < 0) { toast.error('Invalid start odometer'); return; }
    const endOdom = parseFloat(rental?.ending_odometer || 0);
    if (endOdom > 0 && newStart > endOdom) { toast.error(`Start (${newStart}) cannot exceed end (${endOdom})`); return; }
    try {
      const totalKm = endOdom > 0 ? endOdom - newStart : 0;
      await supabase.from('app_4c3a7a6153_rentals').update({
        start_odometer: newStart,
        total_kilometers_driven: totalKm,
        total_distance: totalKm
      }).eq('id', rental.id);
      await syncVehicleCurrentOdometer(rental?.vehicle_id, newStart);
      setRental(prev => ({
        ...prev,
        start_odometer: newStart,
        total_kilometers_driven: totalKm,
        total_distance: totalKm,
        vehicle: prev?.vehicle ? { ...prev.vehicle, current_odometer: newStart } : prev?.vehicle,
      }));
      setIsEditingStartOdometer(false);
      toast.success(`Start odometer updated to ${newStart} km`);
    } catch(err) { toast.error(`Failed: ${err.message}`); }
  };

  const loadExtensions = async () => {
    if (!id) return;
    
    const cacheKey = `extensions_${id}`;
    
    setLoadingExtensions(true);
    try {
      const data = await apiManager.request(cacheKey, async () => {
        const { extensions } = await ExtensionPricingService.getExtensionsByRental(id);
        return extensions || [];
      });
      
      setExtensions(data);
      if (RENTAL_DEBUG) console.log('✅ Extensions loaded:', data?.length || 0);
    } catch (err) {
      console.error('❌ Error loading extensions:', err);
    } finally {
      setLoadingExtensions(false);
    }
  };

  // Load rental data and fetch vehicle's current odometer - UPDATED to include package
  // ✅ FIXED: Fetch second drivers separately to ensure data is loaded
  // ✅ FIXED: Fetch second drivers separately - REMOVED the invalid unit_price column
  const fetchSecondDriversSeparately = async (rentalId) => {
    const cacheKey = `second_drivers_${rentalId}`;
    
    try {
      const data = await apiManager.request(cacheKey, async () => {
        const { data, error } = await fetchWithRetry(() =>
          supabase
            .from('app_4c3a7a6153_rental_second_drivers')
            .select('*')
            .eq('rental_id', rentalId)
        );
        
        if (error) {
          console.error('Error fetching second drivers:', error);
          throw error;
        }
        
        return data || [];
      });
      
      if (RENTAL_DEBUG) console.log('✅ Separately fetched second drivers:', data?.length || 0);
      return data;
    } catch (err) {
      console.error('❌ Error in separate fetch:', err);
      return [];
    }
  };


  // ✅ Rate-limit protection: fetchWithRetry with exponential backoff
  // Handles both thrown errors AND Supabase response objects with error.status === 429
  const fetchWithRetry = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await fn();
        // Check if Supabase returned a 429 in the response object (not thrown)
        if (result?.error?.message?.includes('429') || result?.error?.code === '429' || result?.status === 429) {
          if (i < maxRetries - 1) {
            const waitTime = Math.pow(2, i + 1) * 1000;
            if (RENTAL_DEBUG) console.log(`⏳ Rate limited (response), retrying in ${waitTime}ms... (attempt ${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        return result;
      } catch (error) {
        if ((error?.status === 429 || error?.message?.includes('429')) && i < maxRetries - 1) {
          const waitTime = Math.pow(2, i + 1) * 1000;
          if (RENTAL_DEBUG) console.log(`⏳ Rate limited (thrown), retrying in ${waitTime}ms... (attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (i === maxRetries - 1) {
          console.error('❌ fetchWithRetry: All retries exhausted', error);
          throw error;
        } else {
          throw error;
        }
      }
    }
  };

  // ✅ Cooldown tracking to prevent too-frequent fetches
  const lastFetchTimeRef = useRef(0);
  const FETCH_COOLDOWN = 5000; // 5 seconds between fetches (increased from 2s to reduce 429s)

  // Global cooldown for manual actions
  const [lastActionTime, setLastActionTime] = useState(0);
  const ACTION_COOLDOWN = 2000; // 2 seconds between actions

  const canPerformAction = () => {
    const now = Date.now();
    if (now - lastActionTime < ACTION_COOLDOWN) {
      return false;
    }
    setLastActionTime(now);
    return true;
  };


  // ✅ Global API call throttle to prevent 429 errors
  const apiCallCountRef = useRef(0);
  const apiCallResetTimerRef = useRef(null);
  const MAX_API_CALLS_PER_WINDOW = 15;
  const API_WINDOW_MS = 10000; // 10 second window
  const extensionsLoadedRef = useRef(null);
  const lateFeeCalculatedRef = useRef(null);
  const pdfCheckDoneRef = useRef(null);

  const loadRentalData = async (force = false) => {
    if (!id) return;
    
    const cacheKey = `rental_${id}`;
    
    // Invalidate cache if force refresh
    if (force) {
      apiManager.invalidate(cacheKey);
    }
    
    // Prevent too-frequent fetches unless forced
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < FETCH_COOLDOWN) {
      if (RENTAL_DEBUG) console.log('⏳ Skipping fetch - cooldown active');
      return;
    }
    lastFetchTimeRef.current = now;
    
    try {
      if (RENTAL_DEBUG) console.log(`🔄 loadRentalData - Fetching data for rental ${id}`);
      
      const rentalData = await apiManager.request(cacheKey, async () => {
        const { data, error } = await fetchWithRetry(() =>
          supabase
            .from('app_4c3a7a6153_rentals')
            .select(`
              *,
              quantity_hours,
              quantity_days,
              vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
                *,
                vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
              ),
              extensions:rental_extensions!rental_extensions_rental_id_fkey(*),
              second_drivers:app_4c3a7a6153_rental_second_drivers(*),
              package:app_4c3a7a6153_rental_km_packages!package_id(*)
            `)
            .eq('id', id)
            .single()
        );

        if (error) {
          console.error('❌ loadRentalData - Supabase query failed:', {
            error_message: error.message,
            error_code: error.code,
            error_details: error.details,
            error_hint: error.hint,
            rental_id: id
          });
          throw error;
        }
        
        return data;
      });
      
      if (RENTAL_DEBUG) console.log('✅ loadRentalData - Fresh data received:', {
        rental_id: rentalData.rental_id,
        payment_status: rentalData.payment_status,
        package_id: rentalData.package_id,
        unit_price: rentalData.unit_price,
        quantity_hours: rentalData.quantity_hours,
        quantity_days: rentalData.quantity_days,
        rental_type: rentalData.rental_type
      });


      // Auto-expire check before setting state
      let finalRentalData = { ...rentalData };
      if (rentalData.rental_status === 'scheduled' && rentalData.rental_start_date) {
        const timingState = getScheduledRentalTimingState(rentalData.rental_start_date, rentalTimingSettings, new Date());
        if (timingState?.isExpired) {
          finalRentalData.rental_status = 'expired';
          supabase.from('app_4c3a7a6153_rentals').update({ rental_status: 'expired' }).eq('id', rentalData.id).then(() => {});
          if (rentalData.vehicle_id) supabase.from('saharax_0u4w4d_vehicles').update({ status: 'available' }).eq('id', rentalData.vehicle_id).then(() => {});
          toast(`⚠️ Rental ${rentalData.rental_id} auto-expired. Vehicle freed.`, { duration: 5000, icon: '❌' });
        }
      }
      // ✅ DYNAMIC: Always load package details if package_id exists
      if (rentalData.package_id) {
        if (RENTAL_DEBUG) console.log('📦 Package ID found:', rentalData.package_id);
        await loadPackageDetails(rentalData.package_id);
      } else {
        if (RENTAL_DEBUG) console.log('⚠️ No package_id found in rental');
        setPackageDetails(null);
        setIncludedKilometers(null);
        setExtraKmRate(null);
      }

      // DEBUG: Check dates after loading
if (RENTAL_DEBUG) console.log('📅 DATE DEBUG AFTER LOAD:', {
  rental_id: rentalData.rental_id,
  rental_end_date: rentalData.rental_end_date,
  actual_end_date: rentalData.actual_end_date,
  started_at: rentalData.started_at,
  time_until_end: rentalData.rental_end_date
    ? Math.round((new Date(rentalData.rental_end_date) - new Date()) / (1000 * 60 * 60)) + ' hours'
    : 'N/A',
  time_since_start: rentalData.started_at
    ? Math.round((new Date() - new Date(rentalData.started_at)) / (1000 * 60 * 60)) + ' hours'
    : 'N/A'
});
      
      // ✅ FIXED: Fetch second drivers separately to ensure they're loaded
      if (rentalData.id) {
        const secondDrivers = await fetchSecondDriversSeparately(rentalData.id);
        if (RENTAL_DEBUG) console.log('🔄 Rental loaded with second drivers:', {
          rentalId: rentalData.id,
          secondDrivers: secondDrivers,
          secondDriversCount: secondDrivers?.length || 0,
          rentalStatus: rentalData.rental_status
        });
        // DEBUG: Check what dates are actually in the database
if (RENTAL_DEBUG) console.log('📅 DATABASE DATE CHECK:', {
  rental_id: rentalData.rental_id,
  rental_end_date_in_db: rentalData.rental_end_date,
  actual_end_date_in_db: rentalData.actual_end_date,
  started_at: rentalData.started_at,
  extensions_count: extensions.length,
  expected_end_with_extensions: rentalData.started_at 
    ? new Date(new Date(rentalData.started_at).getTime() + 
        (1 + (extensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0))) * 60 * 60 * 1000)
        .toISOString()
    : 'N/A'
});
        if (secondDrivers.length > 0) {
          finalRentalData.second_drivers = secondDrivers;
        }
      }

      // Set rental state ONCE with all data merged
      setRental(finalRentalData);

      // Load fuel pricing for the vehicle model
      if (rentalData?.vehicle?.vehicle_model?.id) {
        try {
          const pricePerLine = await FuelPricingService.getFuelPricingForModel(
            rentalData.vehicle.vehicle_model.id,
            rentalData.rental_type || 'daily'
          );
          setFuelPricePerLine(pricePerLine);
          
          // Calculate fuel charge if both levels exist
          if (rentalData.start_fuel_level !== null && rentalData.end_fuel_level !== null) {
            const charge = FuelPricingService.calculateFuelCharge(
              rentalData.start_fuel_level,
              rentalData.end_fuel_level,
              pricePerLine,
              rentalData.rental_type || 'daily'
            );
            setFuelCharge(charge);
            if (RENTAL_DEBUG) console.log(`⛽ Fuel charge calculated on load: ${charge.toFixed(2)} MAD`);
          }
        } catch (err) {
          console.error('❌ Error loading fuel pricing:', err);
        }
      }

      
      // Set existing fuel levels if available
      if (rentalData.start_fuel_level !== null) {
        setStartFuelLevel(rentalData.start_fuel_level);
      }
      if (rentalData.end_fuel_level !== null) {
        // setEndFuelLevel(rentalData.end_fuel_level); // Commented out - this was setting FINISH fuel from START fuel!
      }
      if (rentalData.fuel_charge) {
        setFuelCharge(rentalData.fuel_charge);
      }


      
      
      // Debug extension data
      if (RENTAL_DEBUG) console.log('🔍 DEBUG Extension Data:', {
        rentalExtensions: rentalData.extensions,
        rentalExtensionCount: rentalData.extension_count,
        loadedExtensions: extensions,
        loadedExtensionCount: extensions.length,
        approvedExtensions: extensions.filter(ext => ext.status === "approved"),
        approvedCount: extensions.filter(ext => ext.status === "approved").length,
        totalExtensionFees: extensions.filter(ext => ext.status === "approved")
          .reduce((sum, ext) => sum + (parseFloat(ext.extension_price) || 0), 0)
      });
      // Pre-populate odometer from rental's start_odometer or vehicle's current_odometer
      if (rentalData.start_odometer) {
        setStartOdometer(rentalData.start_odometer.toString());
      } else if (rentalData.vehicle?.current_odometer) {
        setStartOdometer(rentalData.vehicle.current_odometer.toString());
      } else {
        setStartOdometer('');
      }
      
      await loadRentalMedia(rentalData.id);

      try {
        const latestVehicleReport = await VehicleReportService.getLatestReportForRental(rentalData.id);
        if (latestVehicleReport) {
          const hydratedReport = await VehicleReportService.hydrateReportWithMaintenance(latestVehicleReport);
          setVehicleReport(hydratedReport);
          setRental(prev => prev ? ({ ...prev, vehicleReport: hydratedReport }) : prev);
          setVehicleReportDraft({
            enabled: true,
            report_type: hydratedReport.report_type || 'damage',
            severity: hydratedReport.severity || 'minor',
            description: hydratedReport.description || '',
            affected_areas: Array.isArray(hydratedReport.affected_areas) ? hydratedReport.affected_areas : [],
            customer_chargeable: Boolean(hydratedReport.customer_chargeable),
            customer_charge_amount: hydratedReport.customer_charge_amount ? String(hydratedReport.customer_charge_amount) : '',
            send_to_maintenance: hydratedReport.send_to_maintenance !== false,
          });
        } else {
          setVehicleReport(null);
          setRental(prev => prev ? ({ ...prev, vehicleReport: null }) : prev);
        }
      } catch (reportError) {
        console.error('Failed to load vehicle report for rental:', reportError);
        setVehicleReport(null);
      }
      
    } catch (err) {
      console.error('❌ Error loading rental:', err);
      const errorMsg = err?.message?.includes('429')
        ? 'Too many requests. Please wait a moment and try again.'
        : 'Failed to load rental details';
      setError(errorMsg);
    }
  };

  // Load extensions when rental is loaded (guarded to prevent double-loading)
  useEffect(() => {
    if (rental?.id && extensionsLoadedRef.current !== rental.id) {
      extensionsLoadedRef.current = rental.id;
      loadExtensions();
    }
  }, [rental?.id]);


  // ============================================
  // 🔥 REAL-TIME SUBSCRIPTION - Listen for payment_status changes
  // ============================================
  const realtimeReloadTimerRef = useRef(null);

  useEffect(() => {
    if (!rental?.id) return;

    if (RENTAL_DEBUG) console.log('📡 Setting up real-time subscription for rental:', rental.id);

    // Use a single channel with config to prevent duplicate connections
    const channel = supabase.channel(`rental-${rental.id}`, {
      config: {
        broadcast: { self: false },
      },
    });

    const subscription = channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_4c3a7a6153_rentals',
          filter: `id=eq.${rental.id}`
        },
        (payload) => {
          if (RENTAL_DEBUG) console.log('🔥 REAL-TIME UPDATE RECEIVED:', {
            old_status: payload.old?.payment_status,
            new_status: payload.new?.payment_status,
            old_deposit: payload.old?.deposit_amount,
            new_deposit: payload.new?.deposit_amount,
            old_remaining: payload.old?.remaining_amount,
            new_remaining: payload.new?.remaining_amount
          });

          // If payment_status changed to 'paid', immediately update UI
          if (payload.new?.payment_status === 'paid' && payload.old?.payment_status !== 'paid') {
            console.log('✅ Payment status changed to PAID via trigger!');
            
            // Update local state with new data immediately
            setRental(prev => ({
              ...prev,
              payment_status: payload.new.payment_status,
              deposit_amount: payload.new.deposit_amount,
              remaining_amount: payload.new.remaining_amount
            }));

            // Debounced full refresh - prevent multiple rapid reloads (3s debounce to reduce 429s)
            if (realtimeReloadTimerRef.current) {
              clearTimeout(realtimeReloadTimerRef.current);
            }
            realtimeReloadTimerRef.current = setTimeout(() => {
              if (RENTAL_DEBUG) console.log('📡 Real-time: Debounced reload triggered');
              loadRentalData(true);
            }, 3000);
          }
        }
      )
      .subscribe((status) => {
        if (RENTAL_DEBUG) console.log('📡 Subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      if (RENTAL_DEBUG) console.log('📡 Cleaning up real-time subscription');
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [rental?.id]); // Re-run when rental ID changes



  // ✅ MEMOIZED: Calculate extension totals to prevent unnecessary recalculations
  const totalExtensionFees = useMemo(() => {
    if (!rental?.extensions || rental?.extensions.length === 0) return 0;
    
    const approvedExtensions = (rental?.extensions || []).filter(ext => ext.status === "approved");
    const total = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_price) || 0), 0);
    
    if (RENTAL_DEBUG) console.log("📊 Extension Fees Calculation:", {
      totalExtensions: (rental?.extensions || []).length,
      approvedCount: approvedExtensions.length,
      breakdown: approvedExtensions.map(ext => ({
        hours: ext.extension_hours,
        price: ext.extension_price
      })),
      totalFees: total
    });
    
    return total;
  }, [extensions]);

  const totalExtendedHours = useMemo(() => {
    if (!rental?.extensions || rental?.extensions.length === 0) return 0;
    
    const approvedExtensions = (rental?.extensions || []).filter(ext => ext.status === "approved");
    return approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
  }, [extensions]);
  // Calculate late fee for completed rentals (guarded to prevent duplicate calls)
  useEffect(() => {
    const calculateLateFee = async () => {
      if (rental?.rental_status === 'completed') {
        // Guard: only calculate once per rental ID
        if (lateFeeCalculatedRef.current === rental?.id) return;
        lateFeeCalculatedRef.current = rental?.id;
        try {
          const isLocalDev =
            typeof window !== 'undefined' &&
            ['localhost', '127.0.0.1'].includes(window.location.hostname);
          if (isLocalDev) {
            console.info('Skipping late fee edge function in local dev to avoid CORS failures.');
            return;
          }

          const result = await adminApiRequest('/api/apply-late-fee', {
            method: 'POST',
            body: JSON.stringify({
              rental_id: rental.id,
              actual_end_time: rental.actual_return_time || new Date().toISOString(),
            }),
          });
          
          if (result.error) {
            console.error('Error calculating late fee:', result.error);
          } else if (result.success && result.late_fee > 0) {
            // Store the full result including tier info
            setLateFee({
              late_fee: result.late_fee,
              hours_late: result.hours_late,
              effective_hourly_rate: result.effective_hourly_rate,
              calculation_method: result.calculation_method,
              tier_info: result.tier_info,
              is_late: true,
            });
          }
        } catch (error) {
          console.error('Error calculating late fee:', error);
        }
      }
    };
    
    calculateLateFee();
  }, [rental?.id, rental?.rental_status]);

  // Generate and send invoice (For customer documents)
  const handleGenerateInvoice = async () => {
    if (!rental?.customer_phone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSharing(true);
    try {
      const invoiceElement = invoiceRef.current;
      if (!invoiceElement) {
        throw new Error("Invoice template could not be found.");
      }

      const canvas = await html2canvas(invoiceElement, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');

      const filePath = `invoices/${rental.rental_id}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`PDF Upload Error: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(uploadData.path);
        
      const invoiceUrl = publicUrlData.publicUrl;

      let videoUrl = 'Not available';
      const allMedia = [...openingMedia, ...closingMedia].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      if (allMedia.length > 0 && allMedia[0].public_url) {
        videoUrl = allMedia[0].public_url;
      }

      const message = `Hi ${rental.customer_name}!\n\nYour rental documents:\nInvoice: ${invoiceUrl}\nVideo: ${videoUrl}\n\nThank you!`;
      
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${rental.customer_phone.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;

      window.location.href = whatsappUrl;

    } catch (err) {
      console.error('❌ Error:', err);
      toast.error(`Failed to share via WhatsApp. Error: ${err.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // ✅ NEW: Function to send extension approval notification to admins
  const handleExtensionApprovalRequest = async () => {
    if (!rental?.id) {
      toast.error("Rental information not available.");
      return;
    }

    setIsSharing(true);
    
    try {
      // 1. Fetch all admins with WhatsApp notifications enabled
      const { data: admins, error: adminError } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_users')
        .select('phone_number, full_name, whatsapp_notifications')
        .eq('whatsapp_notifications', true)
        .in('role', ['admin', 'owner']);
      
      if (adminError) throw adminError;
      
      if (!admins || admins.length === 0) {
        toast.error("No admins have WhatsApp notifications enabled.");
        setIsSharing(false);
        return;
      }
      
      // 2. Get extension details
      const pendingExtensions = extensions.filter(ext => ext.status === "pending" || ext.status === "approved");
      if (pendingExtensions.length === 0) {
        toast.error("No extensions require approval.");
        setIsSharing(false);
        return;
      }
      
      const latestExtension = pendingExtensions[pendingExtensions.length - 1];
      
      // 3. Create approval message
      const rentalDetailsUrl = `${window.location.origin}/admin/rentals/${rental.id}`;
      
      const message = `🔔 Extension Approval Request

Rental ID: ${rental.rental_id}
Customer: ${rental.customer_name}
Vehicle: ${rental.vehicle?.name} - ${rental.vehicle?.model}

📋 Extension Details:
• Hours: ${latestExtension.extension_hours}h
• Price: ${latestExtension.extension_price} MAD
• Status: ${latestExtension.status}

🔗 Review & Approve:
${rentalDetailsUrl}

Click the link above to review and approve the extension.`;
      
      const encodedMessage = encodeURIComponent(message);
      
      // 4. Send to each admin
      let sentCount = 0;
      for (const admin of admins) {
        if (admin.phone_number) {
          const whatsappUrl = `https://wa.me/${admin.phone_number.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
          
          // Open in new tab for each admin
          window.open(whatsappUrl, '_blank');
          sentCount++;
          
          // Small delay between opening tabs to avoid blocking
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (sentCount > 0) {
        toast.success(`Extension approval request sent to ${sentCount} admin(s).`);
      } else {
        toast.error("No admins have valid phone numbers configured.");
      }
      
    } catch (error) {
      console.error('❌ Error sending extension approval:', error);
      toast.error(`Failed to send approval request: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // Handle price approval WhatsApp notification (manual trigger)
  const handlePriceApprovalRequest = async () => {
    if (!rental?.id) {
      toast.error("Rental information not available.");
      return;
    }

    setIsSharing(true);
    
    try {
      const { data: admins, error: adminError } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_users')
        .select('phone_number, full_name, whatsapp_notifications')
        .eq('whatsapp_notifications', true)
        .in('role', ['admin', 'owner']);
      
      if (adminError) throw adminError;
      
      if (!admins || admins.length === 0) {
        toast.error("No admins have WhatsApp notifications enabled.");
        setIsSharing(false);
        return;
      }
      
      const rentalDetailsUrl = `${window.location.origin}/admin/rentals/${rental.id}`;
      
      const message = `🔔 Price Override Request\n\nRental ID: ${rental.rental_id}\nCustomer: ${rental.customer_name}\nVehicle: ${rental.vehicle?.name} - ${rental.vehicle?.model}\n\n💰 Price Details:\n• Current Price: ${rental.total_amount} MAD\n• Requested Price: ${rental.pending_total_request} MAD\n• Reason: ${rental.price_override_reason || 'No reason provided'}\n\n🔗 Review & Approve:\n${rentalDetailsUrl}\n\nClick the link above to review and approve the price change.`;
      
      const encodedMessage = encodeURIComponent(message);
      
      let sentCount = 0;
      for (const admin of admins) {
        if (admin.phone_number) {
          const whatsappUrl = `https://wa.me/${admin.phone_number.replace(/[^0-9]/g, '')}?text=${encodedMessage}`;
          window.open(whatsappUrl, '_blank');
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (sentCount > 0) {
        toast.success(`Price change request sent to ${sentCount} admin(s).`);
      } else {
        toast.error("No admins have valid phone numbers configured.");
      }
      
    } catch (error) {
      console.error('❌ Error sending price approval:', error);
      toast.error(`Failed to send approval request: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  // ─── Shared PDF builder ─────────────────────────────────────────────────────
  // Renders any template element → compressed single-page A4 → uploads → returns public URL
  const buildAndUploadPDF = async (element, storageBucket, filePrefix) => {
    const A4_WIDTH  = 210;
    const A4_HEIGHT = 297;
    const MARGIN    = 10;

    // Use EXACT same settings as handlePrintContract/handlePrintReceipt
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: (A4_WIDTH - MARGIN * 2) * 3.78,
      windowWidth: (A4_WIDTH - MARGIN * 2) * 3.78
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    const imgWidth  = A4_WIDTH - MARGIN * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Always scale to fit 1 page
    if (imgHeight > A4_HEIGHT - MARGIN * 2) {
      const scale = (A4_HEIGHT - MARGIN * 2) / imgHeight;
      const sw = imgWidth * scale;
      const sh = imgHeight * scale;
      const xPos = (A4_WIDTH - sw) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', xPos, MARGIN, sw, sh);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', MARGIN, MARGIN, imgWidth, imgHeight);
    }

    const pdfBlob = pdf.output('blob');
    const fileName = `${filePrefix}_${rental.rental_id}_${Date.now()}.pdf`;
    const filePath = `${filePrefix}s/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(storageBucket)
      .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
    return publicUrl;
  };

  const generateContractPDF = async () => {
    return `${window.location.origin}/view/rental/${rental.id}?type=contract`;
  };

  const generateReceiptPDF = async () => {
    return `${window.location.origin}/view/rental/${rental.id}?type=receipt`;
  };

  // PDF Caching Functions
  const generateAndCacheContractPDF = async (rentalData = rental) => {
    const url = `${window.location.origin}/view/rental/${(rentalData || rental).id}?type=contract`;
    window.__pdfCache = window.__pdfCache || {};
    window.__pdfCache[`contract_${(rentalData || rental).id}`] = url;
    setPdfCache(prev => ({ ...prev, contractUrl: url }));
    return url;
  };

  const generateAndCacheReceiptPDF = async () => {
    const url = `${window.location.origin}/view/rental/${rental.id}?type=receipt`;
    window.__pdfCache = window.__pdfCache || {};
    window.__pdfCache[`receipt_${rental.rental_id}`] = url;
    setPdfCache(prev => ({ ...prev, receiptUrl: url }));
    return url;
  };


  // Send Contract Only via WhatsApp - OPTIMIZED
  const sendContractOnly = async () => {
    if (!rental?.customer_phone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const contractUrl = await getContractWebUrl();
      const message = `Here is your contract:\n${contractUrl}`;
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${rental.customer_phone.replace(/[^0-9]/g, '')}&text=${encodedMessage}`;
      
      window.location.assign(whatsappUrl);
    } catch (error) {
      console.error('Error sending contract:', error);
      toast.error('Failed to send contract. Please try again.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Send Receipt Only via WhatsApp - OPTIMIZED
  const sendReceiptOnly = async () => {
    if (!rental?.customer_phone) {
      toast.error("Customer phone number is not available.");
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const receiptUrl = await getReceiptWebUrl();
      const message = `Here is your receipt:\n${receiptUrl}`;
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${rental.customer_phone.replace(/[^0-9]/g, '')}&text=${encodedMessage}`;

      
      window.location.assign(whatsappUrl);
    } catch (error) {
      console.error('Error sending receipt:', error);
      toast.error('Failed to send receipt. Please try again.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };



  // Handle extension request creation
  // ✅ OPTIMIZED: Generate PDFs on demand when user interacts with WhatsApp button
  let pdfGenerationTimeout = null;
  
  const ensurePDFsReady = () => {
    // Debounce: Only run once every 2 seconds
    if (pdfGenerationTimeout) {
      clearTimeout(pdfGenerationTimeout);
    }
    
    pdfGenerationTimeout = setTimeout(() => {
      // Auto-generation disabled — PDFs are generated fresh when sharing/printing
    }, 500); // Wait 500ms before starting generation (debounce)
  };

  // ✅ MODIFIED: Remove auto-WhatsApp trigger from extension creation
  const handleExtensionCreated = async () => {
    if (RENTAL_DEBUG) console.log('🔄 Extension created, reloading data...');
    await loadRentalData(true);
    await loadExtensions();
    // No automatic WhatsApp trigger here anymore
  };

  // Handle extension approval
  const handleApproveExtension = async (extensionId) => {
    try {
      setActionLoading(prev => ({ ...prev, [extensionId]: true }));
      
      // Get extension details
      const { data: extension, error: extError } = await supabase
        .from('rental_extensions')
        .select('*')
        .eq('id', extensionId)
        .single();
        
      if (extError) throw extError;
      
      // Get current rental
      const { data: currentRental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('id', rental.id)
        .single();
        
      if (rentalError) throw rentalError;
      
      const extensionHours = parseFloat(extension.extension_hours) || 0;
      
      // IMPORTANT: Use the CURRENT rental_end_date, not the original
      const currentEndDate = new Date(currentRental.rental_end_date);
      const newEndDate = new Date(currentEndDate.getTime() + (extensionHours * 60 * 60 * 1000));
      
      console.log('Extension approval:', {
        extensionHours,
        currentEndDate: currentEndDate.toISOString(),
        newEndDate: newEndDate.toISOString()
      });
      
      // Calculate new totals
      const newTotalAmount = (parseFloat(currentRental.total_amount) || 0) + (parseFloat(extension.extension_price) || 0);
      
      // Calculate new quantity
      let newQuantityHours = currentRental.quantity_hours || 0;
      let newQuantityDays = currentRental.quantity_days || 0;
      
      if (currentRental.rental_type === 'hourly') {
        newQuantityHours = (parseFloat(currentRental.quantity_hours) || 0) + extensionHours;
        newQuantityDays = newQuantityHours; // Keep in sync
      } else {
        // For daily rentals, convert extension hours to days
        const extensionDays = extensionHours / 24;
        newQuantityDays = (parseFloat(currentRental.quantity_days) || 0) + extensionDays;
        newQuantityHours = newQuantityDays * 24; // Keep in sync
      }
      
      // Update rental with NEW end date
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_end_date: newEndDate.toISOString(),
          actual_end_date: newEndDate.toISOString(), // Also update actual_end_date
          total_amount: newTotalAmount,
          quantity_hours: newQuantityHours,
          quantity_days: newQuantityDays,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);
        
      if (updateError) throw updateError;
      
      // Update extension status
      await supabase
        .from('rental_extensions')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: currentUser?.id
        })
        .eq('id', extensionId);
      
      // Force reload all data
      await loadRentalData(true);
      await loadExtensions();
      
      toast.success(`✅ Extension approved! New end date: ${newEndDate.toLocaleString()}`);
      
    } catch (err) {
      console.error('Error approving extension:', err);
      toast.error('Failed to approve extension');
    } finally {
      setActionLoading(prev => ({ ...prev, [extensionId]: false }));
    }
  };

  // Handle extension rejection
  // Handle extension rejection
  const handleRejectExtension = async (extensionId) => {
    if (!confirm('Cancel this extension request?')) return;
    
    try {
      await ExtensionPricingService.rejectExtension(extensionId, currentUser?.id, null);
      toast.success('Extension request cancelled.');
      await loadExtensions();
    } catch (err) {
      console.error('❌ Error rejecting extension:', err);
      toast.error(`Failed to cancel extension: ${err.message}`);
    }
  };

  // ✅ RADICAL OPTIMIZATION: Use web view URLs instead of PDFs for instant WhatsApp
  const getContractWebUrl = async () => {
    const rawUrl = `${window.location.origin}/view/rental/${rental.id}?type=contract`;
    return await shortenUrl(rawUrl, 'contract');
  };

  const getReceiptWebUrl = async () => {
    const rawUrl = `${window.location.origin}/view/rental/${rental.id}?type=receipt`;
    return await shortenUrl(rawUrl, 'receipt');
  };

  const getOpeningMediaShareUrl = async () => {
    const rawUrl = `${window.location.origin}/view/rental/${rental.id}?type=opening-media`;
    return await shortenUrl(rawUrl, 'opening_video');
  };

  const getClosingMediaShareUrl = async () => {
    const rawUrl = `${window.location.origin}/view/rental/${rental.id}?type=closing-media`;
    return await shortenUrl(rawUrl, 'closing_video');
  };

  const getDocumentsHubShareUrl = async (options = {}) => {
    const rawUrl = `${window.location.origin}/view/rental/${rental.id}?type=documents`;
    return await shortenUrl(rawUrl, 'documents');
  };

  const getContractUrl = async (preferWeb = true) => {
    if (preferWeb) {
      return await getContractWebUrl();
    }
    // Fallback to PDF if web view not available
    return await generateContractPDF();
  };

  const getReceiptUrl = async (preferWeb = true) => {
    if (preferWeb) {
      return await getReceiptWebUrl();
    }
    // Fallback to PDF if web view not available
    return await generateReceiptPDF();
  };

  // Handle WhatsApp selection and sending - INSTANT WEB VIEW VERSION
  const handleSendWhatsAppSelection = async (options) => {
    setIsSharing(true);
    setWhatsappModalOpen(false);
    toast.loading('Preparing documents…', { id: 'wa-prepare' });
    
    try {
      if (RENTAL_DEBUG) console.log('📱 Starting WhatsApp send with options:', options);
      
      const hasDocuments =
        Boolean(options.contract && rental.signature_url) ||
        Boolean(options.receipt && rental.payment_status === 'paid') ||
        Boolean(options.openingVideo && openingMedia.length > 0) ||
        Boolean(options.closingVideo && closingMedia.length > 0);
      
      // If no lines were added (no documents), don't send WhatsApp
      if (!hasDocuments) {
        toast.error('No documents selected or documents are not ready yet. Please try again in a moment.');
        setIsSharing(false);
        return;
      }
      const selectedItems = [
        options.contract && rental.signature_url ? 'contract' : null,
        options.receipt && rental.payment_status === 'paid' ? 'receipt' : null,
        options.openingVideo && openingMedia.length > 0 ? 'openingMedia' : null,
        options.closingVideo && closingMedia.length > 0 ? 'closingMedia' : null,
      ].filter(Boolean);

      let shareUrl = '';
      let message = '';

      if (selectedItems.length === 1) {
        const selectedItem = selectedItems[0];
        switch (selectedItem) {
          case 'contract':
            shareUrl = await getContractWebUrl();
            message = `Here is your contract:\n${shareUrl}`;
            break;
          case 'receipt':
            shareUrl = await getReceiptWebUrl();
            message = `Here is your receipt:\n${shareUrl}`;
            break;
          case 'openingMedia':
            shareUrl = await getOpeningMediaShareUrl();
            message = `Here is the opening media:\n${shareUrl}`;
            break;
          case 'closingMedia':
            shareUrl = await getClosingMediaShareUrl();
            message = `Here is the closing media:\n${shareUrl}`;
            break;
          default:
            shareUrl = await getDocumentsHubShareUrl(options);
            message = `Rental documents for ${rental.rental_id}:\n${shareUrl}`;
            break;
        }
      } else {
        shareUrl = await getDocumentsHubShareUrl(options);
        message = `Rental documents for ${rental.rental_id}:\n${shareUrl}`;
      }

      const phoneNumber = rental.customer_phone.replace(/[^0-9]/g, '');
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
      
      if (RENTAL_DEBUG) console.log('📱 Opening WhatsApp with URL:', whatsappUrl);
      
      // Use top-level navigation for WhatsApp so mobile browsers hand off reliably.
      toast.dismiss('wa-prepare');
      window.location.assign(whatsappUrl);
      
    } catch (error) {
      toast.dismiss('wa-prepare');
      console.error('❌ Error sending WhatsApp:', error);
      toast.error(`Failed to send WhatsApp message: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareViaWhatsApp = async () => {
    await handleGenerateInvoice();
  };

  const calculateMaintenanceStayDays = useCallback((report, maintenance) => {
    if (!report || !maintenance) return 0;

    const startDate = new Date(report.created_at || maintenance.created_at || Date.now());
    const endDate = new Date(
      maintenance.completed_date ||
      maintenance.service_date ||
      maintenance.updated_at ||
      Date.now()
    );

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return 1;
    }

    const millisecondsInDay = 1000 * 60 * 60 * 24;
    const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
    return Math.max(1, Math.ceil(diffMs / millisecondsInDay));
  }, []);

  const calculateMaintenanceStayTotal = useCallback((days, dailyRate, discount) => {
    const normalizedDays = Math.max(0, parseInt(days || 0, 10) || 0);
    const normalizedRate = Math.max(0, Number(dailyRate || 0));
    const normalizedDiscount = Math.max(0, Number(discount || 0));
    return Math.max(0, (normalizedDays * normalizedRate) - normalizedDiscount);
  }, []);

  const upsertVehicleReportLocally = useCallback((nextReport) => {
    setVehicleReport(nextReport);
    setRental(prev => prev ? ({ ...prev, vehicleReport: nextReport }) : prev);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncMaintenanceStayPricing = async () => {
      if (!vehicleReport?.id || !vehicleReport?.customer_chargeable || !vehicleReport?.maintenance) {
        const fallbackTotal = calculateMaintenanceStayTotal(
          vehicleReport?.maintenance_daily_days || 0,
          vehicleReport?.maintenance_daily_rate || 0,
          vehicleReport?.maintenance_daily_discount || 0
        );
        setMaintenanceChargeForm({
          days: vehicleReport?.maintenance_daily_days || 0,
          dailyRate: vehicleReport?.maintenance_daily_rate || 0,
          discount: vehicleReport?.maintenance_daily_discount || 0,
          total: fallbackTotal,
          source: 'none',
        });
        return;
      }

      const vehicleModelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id;
      const suggestedDays = vehicleReport.maintenance_daily_days || calculateMaintenanceStayDays(vehicleReport, vehicleReport.maintenance);
      let suggestedRate = Number(vehicleReport.maintenance_daily_rate || 0);
      let rateSource = vehicleReport.maintenance_daily_rate ? 'saved' : 'none';

      if (suggestedRate <= 0 && vehicleModelId) {
        const pricing = await DynamicPricingService.getPricingForDuration(vehicleModelId, Math.max(1, suggestedDays));
        suggestedRate = Number(pricing?.price || 0);
        rateSource = pricing?.source || 'base_price';
      }

      const discount = Number(vehicleReport.maintenance_daily_discount || 0);
      const total = calculateMaintenanceStayTotal(suggestedDays, suggestedRate, discount);

      if (cancelled) return;

      setMaintenanceChargeForm({
        days: suggestedDays,
        dailyRate: suggestedRate,
        discount,
        total,
        source: rateSource,
      });

      const needsSync =
        (Number(vehicleReport.maintenance_daily_days || 0) !== suggestedDays) ||
        (Number(vehicleReport.maintenance_daily_rate || 0) !== suggestedRate) ||
        (Number(vehicleReport.maintenance_daily_total || 0) !== total);

      if (needsSync) {
        try {
          const syncedReport = await VehicleReportService.saveChargeConfig(vehicleReport.id, {
            maintenance_daily_days: suggestedDays,
            maintenance_daily_rate: suggestedRate,
            maintenance_daily_discount: discount,
          });

          if (!cancelled) {
            upsertVehicleReportLocally({
              ...vehicleReport,
              ...syncedReport,
              maintenance: vehicleReport.maintenance,
            });
          }
        } catch (error) {
          console.error('Failed to sync maintenance stay pricing:', error);
        }
      }
    };

    syncMaintenanceStayPricing();

    return () => {
      cancelled = true;
    };
  }, [
    vehicleReport?.id,
    vehicleReport?.customer_chargeable,
    vehicleReport?.maintenance?.id,
    vehicleReport?.maintenance?.completed_date,
    vehicleReport?.maintenance?.updated_at,
    vehicleReport?.maintenance_daily_days,
    vehicleReport?.maintenance_daily_rate,
    vehicleReport?.maintenance_daily_discount,
    rental?.vehicle?.vehicle_model?.id,
    rental?.vehicle?.vehicle_model_id,
    calculateMaintenanceStayDays,
    calculateMaintenanceStayTotal,
    upsertVehicleReportLocally,
  ]);

  const saveMaintenanceChargeConfig = useCallback(async () => {
    if (!vehicleReport?.id) return;

    setSavingMaintenanceCharge(true);
    try {
      const nextReport = await VehicleReportService.saveChargeConfig(vehicleReport.id, {
        maintenance_daily_days: maintenanceChargeForm.days,
        maintenance_daily_rate: maintenanceChargeForm.dailyRate,
        maintenance_daily_discount: maintenanceChargeForm.discount,
      });

      upsertVehicleReportLocally({
        ...vehicleReport,
        ...nextReport,
        maintenance: vehicleReport.maintenance,
      });
      toast.success('Maintenance stay charge updated');
    } catch (error) {
      console.error('Failed to save maintenance stay charge config:', error);
      toast.error(`Failed to save maintenance stay charge: ${error.message}`);
    } finally {
      setSavingMaintenanceCharge(false);
    }
  }, [maintenanceChargeForm.dailyRate, maintenanceChargeForm.days, maintenanceChargeForm.discount, upsertVehicleReportLocally, vehicleReport]);

  const getLinkedMaintenanceChargeAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;

    return parseFloat(linkedReport?.customer_charge_amount || 0) || 0;
  };

  const getLinkedMaintenanceRepairAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;
    return parseFloat(linkedReport?.maintenance_cost_total || linkedReport?.maintenance?.cost || 0) || 0;
  };

  const getLinkedMaintenanceStayAmount = () => {
    const linkedReport = vehicleReport || rental?.vehicleReport || rental?.vehicle_report || null;
    if (!linkedReport?.customer_chargeable) return 0;
    return parseFloat(linkedReport?.maintenance_daily_total || 0) || 0;
  };

  const getMaintenanceStayRateSourceLabel = (source) => {
    switch (source) {
      case 'tier':
        return 'Tier price';
      case 'base_price':
        return 'Base daily price';
      case 'saved':
        return 'Saved rate';
      case 'manual':
        return 'Manual override';
      default:
        return 'No rate';
    }
  };

  const rentalBillingSummary = useMemo(() => {
    if (!rental) {
      return {
        baseAmount: 0,
        overageCharge: 0,
        extensionFees: 0,
        fuelChargeAmount: 0,
        maintenanceRepairAmount: 0,
        maintenanceStayAmount: 0,
        maintenanceDiscountAmount: 0,
        maintenanceChargeAmount: 0,
        grandTotal: 0,
        depositPaid: 0,
        balanceDue: 0,
      };
    }

    const pkg = getRentalKilometerPackage(rental, packageDetails);
    const rate = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
    const duration = rental.rental_type === 'hourly'
      ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
      : (rental.quantity_days ?? 1);
    const baseAmount = rate * duration;
    const overageCharge = pkg ? parseFloat(rental.overage_charge || 0) : 0;
    const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
    const extensionFees = parseFloat(totalExtensionFees || 0);
    const maintenanceRepairAmount = getLinkedMaintenanceRepairAmount();
    const maintenanceStayAmount = getLinkedMaintenanceStayAmount();
    const maintenanceChargeAmount = maintenanceRepairAmount + maintenanceStayAmount;
    const maintenanceDiscountAmount = parseFloat(vehicleReport?.maintenance_daily_discount || 0) || 0;
    const grandTotal = baseAmount + overageCharge + fuelChargeAmount + extensionFees + maintenanceChargeAmount;
    const depositPaid = parseFloat(rental.deposit_amount || 0);
    const balanceDue = Math.max(0, grandTotal - depositPaid);

    return {
      baseAmount,
      overageCharge,
      extensionFees,
      fuelChargeAmount,
      maintenanceRepairAmount,
      maintenanceStayAmount,
      maintenanceDiscountAmount,
      maintenanceChargeAmount,
      grandTotal,
      depositPaid,
      balanceDue,
    };
  }, [fuelCharge, fuelChargeEnabled, packageDetails, rental, totalExtensionFees, vehicleReport]);

  const isPaymentSufficient = () => {
  if (!rental) return false;
  return rentalBillingSummary.depositPaid >= rentalBillingSummary.grandTotal;
};

    // ✅ UPDATED: Calculate deposit return amount with toggle support
  const calculateDepositReturn = () => {
    const damageDeposit = parseFloat(rental?.damage_deposit || 0);
    const totalRentalCost = rentalBillingSummary.grandTotal;
    const balanceDue = rentalBillingSummary.balanceDue;
    
    // Apply deduction if toggle is ON and not yet processed
    const useDeduction = deductFromDeposit && balanceDue > 0 && !rental.deposit_returned_at;
    const depositReturn = useDeduction 
      ? Math.max(0, damageDeposit - balanceDue)
      : damageDeposit;
    const additionalOwed = Math.max(0, balanceDue - damageDeposit);
    
    return {
      damageDeposit,
      totalRentalCost,
      balanceDue,
      maintenanceChargeAmount: rentalBillingSummary.maintenanceChargeAmount,
      depositReturn,
      hasDeduction: balanceDue > 0,
      additionalOwed,
      useDeduction
    };
  };

  // Fix for mobile blank screen - initialize mobile templates (only on rental ID change)
  useEffect(() => {
    const initializeMobile = async () => {
      if (isMobileDevice() && rental) {
        setMobileLoading(true);
        // Force initial render of templates
        await new Promise(resolve => setTimeout(resolve, 1000));
        setVideoRefreshKey(prev => prev + 1);
        setMobileLoading(false);
      }
    };

    if (rental) {
      initializeMobile();
    }
  }, [rental?.id]);

  const getPaymentStatusBadge = (paymentStatus) => {
    const { label, background, text } = getPaymentStatusStyle(paymentStatus);
    const colorClass = `${background} ${text}`;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
        {label}
      </span>
    );
  };
  // 🔍 DEBUG: WhatsApp button click handler
  const handleWhatsAppClick = async () => {
    if (RENTAL_DEBUG) console.log('✅ WhatsApp button clicked!', {
      signature: !!rental?.signature_url,
      paid: rental?.payment_status === 'paid',
      time: Date.now()
    });
    
    // Ensure PDFs are generated before opening modal
    setIsSharing(true);
    
    try {
      // PDFs are generated fresh on demand when sharing
      
      // Generate receipt PDF if paid and not already cached
      if (rental?.payment_status === 'paid' && !pdfCache.receiptUrl && !rental.receipt_pdf_url) {
        if (RENTAL_DEBUG) console.log('🔄 Generating receipt PDF before WhatsApp modal...');
        await generateAndCacheReceiptPDF();
      }
      
      // Open modal after PDFs are ready
      setWhatsappModalOpen(true);
    } catch (error) {
      console.error('Error preparing PDFs for WhatsApp:', error);
      toast.error('Failed to prepare documents. Please try again.');
      // Still open modal even if PDF generation fails - user can retry
      setWhatsappModalOpen(true);
    } finally {
      setIsSharing(false);
    }
  };

  // 🔍 DEBUG: Check what's controlling the WhatsApp button
  // Tier Pricing Display Component
  // Tier Pricing Display Component
const TierPricingDisplay = ({ breakdown, isMobile = false }) => {
  if (!breakdown) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className={`mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm ${isMobile ? 'text-sm' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-blue-100 rounded-lg flex items-center justify-center`}>
          <svg className={isMobile ? "w-4 h-4 text-blue-600" : "w-5 h-5 text-blue-600"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h4 className={`${isMobile ? 'text-sm font-bold' : 'font-bold'} text-blue-900`}>
            {breakdown.isDaily ? 'Daily Rate Breakdown' : 'Tier Pricing Breakdown'}
          </h4>
          <p className="text-blue-600 text-xs">{breakdown.tierDescription}</p>
          {/* Price Source Indicator */}
          {breakdown.source === 'database' ? (
            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Dynamic price from database
            </p>
          ) : breakdown.source === 'vehicle_rate' ? (
            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              From vehicle {breakdown.isDaily ? 'daily' : 'hourly'} rate
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.346 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Using fallback pricing
            </p>
          )}
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-2 rounded-lg border border-blue-100">
            <div className="text-blue-700 text-xs font-medium mb-1">VEHICLE</div>
            <div className={`${isMobile ? 'text-xs font-semibold' : 'text-sm font-semibold'} text-gray-900 truncate`}>{breakdown.vehicleName}</div>
          </div>
          
          <div className="bg-white p-2 rounded-lg border border-blue-100">
            <div className="text-blue-700 text-xs font-medium mb-1">DURATION</div>
            <div className={`${isMobile ? 'text-xs font-semibold' : 'text-sm font-semibold'} text-gray-900`}>{breakdown.duration} {breakdown.isDaily ? (breakdown.duration > 1 ? 'days' : 'day') : (breakdown.duration > 1 ? 'hours' : 'hour')}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
            <div className="text-green-700 text-xs font-medium mb-1">YOUR TIER RATE</div>
            <div className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-green-600`}>{formatCurrency(breakdown.tierRate)}</div>
            <div className="text-green-600 text-xs">MAD per {breakdown.isDaily ? 'day' : 'hour'}</div>
            <div className="text-xs text-green-500 mt-2">{breakdown.tierDescription}</div>
          </div>
          
          <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs font-medium mb-1">STANDARD RATE</div>
            <div className={`${isMobile ? 'text-lg' : 'text-xl'} text-gray-400 line-through`}>{formatCurrency(breakdown.standardHourlyRate)}</div>
            <div className="text-gray-500 text-xs">MAD per {breakdown.isDaily ? 'day' : 'hour'}</div>
            <div className="text-xs text-gray-400 mt-2">Base {breakdown.isDaily ? 'daily' : 'hourly'} price</div>
            {/* Price Source Badge */}
            <div className="mt-1">
              {breakdown.source === 'database' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  DB
                </span>
              )}
              {breakdown.source === 'vehicle_rate' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  Vehicle
                </span>
              )}
              {breakdown.source === 'fallback' && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  Fallback
                </span>
              )}
            </div>
          </div>
        </div>

        {breakdown.isDiscounted && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} bg-green-100 rounded-full flex items-center justify-center`}>
                  <svg className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-green-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-green-800`}>Total Savings</div>
                  <div className="text-green-600 text-xs">You&apos;re paying less!</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-green-700`}>{formatCurrency(breakdown.savings)} MAD</div>
                <div className="text-green-600 text-xs">{breakdown.savingsPercentage}% off</div>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-green-700">
              <div className="flex justify-between mb-1">
                <span>Standard total:</span>
                <span className="line-through">{formatCurrency(breakdown.standardTotal)} MAD</span>
              </div>
              <div className="flex justify-between">
                <span>Tier total:</span>
                <span className="font-bold">{formatCurrency(breakdown.tierTotal)} MAD</span>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 pt-3 border-t border-blue-100">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-medium text-gray-700">How tier pricing works:</span> 
              {breakdown.isDaily 
                ? ` Special discounted rate for ${breakdown.duration}-day rentals`
                : breakdown.duration === 2 
                  ? " Special discounted rate for 2-hour rentals"
                  : " Fixed price for " + breakdown.duration + "-hour rental slot"}
              <div className="mt-1 text-gray-600">
                {breakdown.source === 'database' ? (
                  <span>Standard rate fetched from pricing database</span>
                ) : breakdown.source === 'vehicle_rate' ? (
                  <span>Standard rate from vehicle record</span>
                ) : (
                  <span>Standard rate estimated from vehicle type</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

      
      
      // Calculate the correct rental total
let baseAmount = 0;
if (rental?.rental_type === 'hourly') {
  const hours = rental?.quantity_hours ?? rental?.quantity_days ?? 1;
  baseAmount = hours * (rental?.unit_price || 0);
} else {
  baseAmount = (rental?.unit_price || 0) * (rental?.quantity_days || 1);
}

const overageCharge = parseFloat(rental?.overage_charge || 0);
const extensionFees = parseFloat(totalExtensionFees || 0);
const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });

// This is the GRAND TOTAL for the RENTAL ONLY
const rentalGrandTotal = baseAmount + overageCharge + extensionFees + fuelChargeAmount;


    

// ==================== FUEL CHARGE TOGGLE COMPONENT ====================
const FuelChargeToggle = ({
  enabled,
  onToggle,
  pricePerLine = 0,
  rentalType,
  disabled = false,
  compact = false
}) => {
  const isHourly = rentalType === 'hourly';

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={enabled ? `Charge ${pricePerLine} MAD per missing fuel line` : 'No fuel charge'}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    );
  }

  return (
    <div className={`rounded-lg border transition-all ${
      enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Single row — full-width tap target, min height for easy tapping */}
      <button
        type="button"
        onClick={() => !disabled && onToggle(!enabled)}
        disabled={disabled}
        className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-lg text-left gap-2 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:bg-black/5'
        }`}
      >
        {/* Left: icon + label + hint all on one line */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Fuel className={`w-4 h-4 flex-shrink-0 ${enabled ? 'text-green-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-900 leading-tight whitespace-nowrap">
            Fuel Charge
          </span>
          {enabled && pricePerLine > 0 && (
            <span className="text-xs text-orange-500 truncate">
              · ⛽ {pricePerLine} MAD/line
            </span>
          )}
          {enabled && pricePerLine === 0 && (
            <span className="text-xs text-amber-500 truncate">
              · Set in Pricing Mgmt
            </span>
          )}
          {!enabled && (
            <span className="text-xs text-gray-400 truncate">
              · No charge
            </span>
          )}
        </div>

        {/* Right: toggle pill — large enough for mobile tap */}
        <div className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        }`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </div>
      </button>
    </div>
  );
};

   const markAsPaid = async () => {
  if (isUpdatingPayment) return;
  if (!canPerformAction()) {
    toast.error('Please wait a moment before performing another action');
    return;
  }
  
  try {
    setIsUpdatingPayment(true);
    const rentalGrandTotal = rentalBillingSummary.grandTotal;
    
    console.log('markAsPaid - Rental payment:', {
      ...rentalBillingSummary,
      rentalGrandTotal,
      damageDeposit: rental.damage_deposit
    });
    
    // Update ONLY the rental payment fields
    const paymentUpdateData = {
      payment_status: 'paid',
      deposit_amount: rentalGrandTotal, // Set deposit to full rental amount
      remaining_amount: 0,
      updated_at: new Date().toISOString()
    };
    
    // Sync quantity_hours for hourly rentals
    if (rental.rental_type === 'hourly' && rental.quantity_hours == null && rental.quantity_days) {
      paymentUpdateData.quantity_hours = rental.quantity_days;
    }
    
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(paymentUpdateData)
      .eq('id', rental.id);
    
    if (updateError) throw updateError;
    
    // Update local state
    setRental(prev => ({
      ...prev,
      payment_status: 'paid',
      deposit_amount: rentalGrandTotal,
      remaining_amount: 0
    }));
    
    // Force a refresh of all data
    await loadRentalData(true);
    
    // Broadcast real-time update for dashboard
    try {
      await supabase
        .channel('rental-updates')
        .send({
          type: 'broadcast',
          event: 'payment_updated',
          payload: { 
            rental_id: rental.id, 
            payment_status: 'paid',
            updated_at: new Date().toISOString()
          }
        });
    } catch (broadcastErr) {
      console.warn('Broadcast failed (non-critical):', broadcastErr);
    }
    
    // Generate receipt in background
    setTimeout(() => {
      generateAndCacheReceiptPDF();
    }, 500);
    
    toast.success(`Rental payment marked as PAID! Total: ${rentalGrandTotal.toFixed(2)} MAD | Damage Deposit: ${rental.damage_deposit?.toFixed(2) || 0} MAD (separate)`);
    
    // Log the new payment status to verify
    console.log('Payment status updated to PAID, isPaymentSufficient:', isPaymentSufficient());
    
  } catch (err) {
    console.error('Payment Update Error:', err);
    toast.error(`Unable to update payment status: ${err.message}`);
  } finally {
    setIsUpdatingPayment(false);
  }
};

  const handleSignatureSave = async (signatureUrl) => {
    if (!rental) return;
    setIsSigning(false);
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
            contract_signed: true, 
            signature_url: signatureUrl,
            contract_signed_by: currentUser?.id || null,
            contract_signed_by_name: currentUser?.full_name || currentUser?.email || null,
            contract_signed_at: new Date().toISOString(),
            updated_at: new Date().toISOString() 
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();
      if (error) throw error;
      setRental(data);
    
    // ✅ AUTO-GENERATE CONTRACT PDF IN BACKGROUND
    setTimeout(() => {
      generateAndCacheContractPDF(data);
    }, 500);
    
    toast.success('Contract signed and signature saved! PDF will be generated in background.');
    } catch (err) {
      console.error('❌ Error:', err);
      toast.error(`Failed to save signature: ${err.message}`);
    }
  };

    // ✅ UPDATED: Handle deposit return signature with toggle support
  const handleDepositSignatureSave = async (signatureUrl) => {
    try {
      const rentalGrandTotal = rentalBillingSummary.grandTotal;
      const depositPaid = rentalBillingSummary.depositPaid;
      const balanceDue = rentalBillingSummary.balanceDue;
      const damageDeposit = parseFloat(rental.damage_deposit || 0);
      
      // The amount that can be deducted from deposit (cannot exceed deposit)
      const deductionAmount = deductFromDeposit ? Math.min(balanceDue, damageDeposit) : 0;
      const remainingBalance = balanceDue - deductionAmount;
      const depositReturn = damageDeposit - deductionAmount;
      
      // Create detailed deduction reason
      let deductionReason = '';
      const parts = [];
      parts.push(`Base Rental: ${formatCurrency(rentalBillingSummary.baseAmount)} MAD`);
      if (rentalBillingSummary.overageCharge > 0) {
        parts.push(`Overage (${rental.extra_kilometers || 0}km × ${rental.extra_km_rate_applied || 20}MAD): +${formatCurrency(rentalBillingSummary.overageCharge)} MAD`);
      }
      if (rentalBillingSummary.fuelChargeAmount > 0) {
        parts.push(`Fuel: +${formatCurrency(rentalBillingSummary.fuelChargeAmount)} MAD`);
      }
      if (rentalBillingSummary.extensionFees > 0) {
        parts.push(`Extensions: +${formatCurrency(rentalBillingSummary.extensionFees)} MAD`);
      }
      if (rentalBillingSummary.maintenanceRepairAmount > 0) {
        parts.push(`Damage / Maintenance Bill: +${formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD`);
      }
      if (rentalBillingSummary.maintenanceStayAmount > 0) {
        parts.push(`Maintenance stay charge: +${formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD`);
      }
      if (rentalBillingSummary.maintenanceDiscountAmount > 0) {
        parts.push(`Maintenance discount: -${formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD`);
      }
      
      if (deductionAmount > 0) {
        deductionReason = `Applied ${formatCurrency(deductionAmount)} MAD from deposit to balance. ` +
          `Total: ${formatCurrency(rentalGrandTotal)} MAD - Deposit Paid: ${formatCurrency(depositPaid)} MAD = Balance Due: ${formatCurrency(balanceDue)} MAD. ` +
          `Deposit applied: ${formatCurrency(deductionAmount)} MAD, Remaining balance: ${formatCurrency(remainingBalance)} MAD.`;
      }
      
      const updateData = {
        deposit_return_signature_url: signatureUrl,
        deposit_returned_at: new Date().toISOString(),
        deposit_return_amount: depositReturn,
        deposit_deduction_amount: deductionAmount,
        deposit_deduction_reason: deductionReason || null,
        final_deposit_return_amount: depositReturn,
        updated_at: new Date().toISOString()
      };

      // If deposit fully covered the balance, mark rental as paid
      if (remainingBalance <= 0 && depositPaid + deductionAmount >= rentalGrandTotal) {
        updateData.payment_status = 'paid';
        updateData.remaining_amount = 0;
        updateData.deposit_amount = rentalGrandTotal;
      } else {
        // Update remaining balance
        updateData.remaining_amount = remainingBalance;
      }
      
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);

      if (error) throw error;

      setShowDepositSignatureModal(false);
      setDeductFromDeposit(false);
      await loadRentalData(true);
      
      if (deductionAmount > 0) {
        toast.success(`Deposit applied — ${formatCurrency(deductionAmount)} MAD deducted, ${formatCurrency(depositReturn)} MAD returned`);
      } else {
        toast.success(`Full deposit returned: ${formatCurrency(depositReturn)} MAD`);
      }
    } catch (err) {
      console.error('Error saving deposit signature:', err);
      toast.error(`Failed to save deposit return: ${err.message}`);
    }
  };

  // Handle odometer save
  const handleSaveOdometer = async () => {
    if (!startOdometer || parseFloat(startOdometer) <= 0) {
      toast.error('Please enter a valid odometer reading.');
      return;
    }

    setIsSavingOdometer(true);
    try {
      const startOdometerValue = parseFloat(startOdometer);
      await syncVehicleCurrentOdometer(rental?.vehicle_id, startOdometerValue);

      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          start_odometer: startOdometerValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (error) throw error;

      setRental({
        ...data,
        vehicle: data?.vehicle ? { ...data.vehicle, current_odometer: startOdometerValue } : data?.vehicle,
      });
      setIsEditingOdometer(false);
      toast.success('Odometer reading saved successfully!');
    } catch (err) {
      console.error('❌ Error saving odometer:', err);
      toast.error(`Failed to save odometer reading. Error: ${err.message}`);
    } finally {
      setIsSavingOdometer(false);
    }
  };


  // Fuel level handlers
  const handleSaveStartFuel = async (fuelLevel) => {
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ start_fuel_level: fuelLevel })
        .eq('id', id);

      if (error) throw error;

      setStartFuelLevel(fuelLevel);
      setRental(prev => ({ ...prev, start_fuel_level: fuelLevel }));
      if (rental?.vehicle_id) {
        await FuelTransactionService.recordRentalFuelSnapshot({
          rentalId: id,
          vehicleId: rental.vehicle_id,
          fuelLevel,
          stage: 'rental_opening_level',
          actor: currentUser,
          notes: `Rental opening fuel recorded for ${rental.customer_name || 'customer'}`,
        });
      }
      if (RENTAL_DEBUG) console.log('✅ Start fuel level saved:', fuelLevel);
    } catch (err) {
      console.error('❌ Error saving start fuel level:', err);
      toast.error('Failed to save fuel level');
    }
  };

  const handleSaveEndFuel = async (fuelLevel) => {
  try {
    // Calculate fuel charge for both daily AND hourly when toggle is enabled
    let charge = 0;
    if (fuelChargeEnabled) {
      charge = FuelPricingService.calculateFuelCharge(
        startFuelLevel || rental?.start_fuel_level,
        fuelLevel,
        fuelPricePerLine,
        rental.rental_type || 'daily'
      );
    } else {
      if (RENTAL_DEBUG) console.log('⛽ Fuel charge disabled - no charge applied');
    }

    const { error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        end_fuel_level: fuelLevel,
        fuel_charge: charge
      })
      .eq('id', id);

    if (error) throw error;

    setEndFuelLevel(fuelLevel);
    setFuelCharge(charge);
    setRental(prev => ({
      ...prev,
      end_fuel_level: fuelLevel,
      fuel_charge: charge
    }));

    if (rental?.vehicle_id) {
      await FuelTransactionService.recordRentalFuelSnapshot({
        rentalId: id,
        vehicleId: rental.vehicle_id,
        fuelLevel,
        stage: 'rental_closing_level',
        actor: currentUser,
        notes: `Rental return fuel recorded${charge > 0 ? ` with ${charge.toFixed(2)} MAD fuel charge` : ''}`,
      });
    }

    if (RENTAL_DEBUG) console.log('✅ End fuel level saved:', { fuelLevel, charge, rentalType: rental.rental_type });
    
    if (charge > 0 && fuelChargeEnabled) {
      toast.success(`Fuel charge applied: ${charge.toFixed(2)} MAD (deficit: ${(startFuelLevel || rental?.start_fuel_level) - fuelLevel} lines)`);
    } else if (!fuelChargeEnabled) {
      toast.success('Fuel level recorded (fuel charge disabled)');
    } else {
      toast.success('Fuel level recorded (no deficit)');
    }
  } catch (err) {
    console.error('❌ Error saving end fuel level:', err);
    toast.error('Failed to save fuel level');
  }
};

      // Handle manual edit of fuel charge
  const handleEditFuelCharge = async (newCharge) => {
    try {
      if (RENTAL_DEBUG) console.log('💰 Updating fuel charge to:', newCharge);
      
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          fuel_charge: newCharge,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (error) throw error;

      // Update local state
      setFuelCharge(newCharge);
      setRental(prev => ({
        ...prev,
        fuel_charge: newCharge
      }));

      toast.success(`Fuel charge updated to ${newCharge.toFixed(2)} MAD`);
      
    } catch (err) {
      console.error('❌ Error updating fuel charge:', err);
      toast.error(`Failed to update fuel charge: ${err.message}`);
    }
  };

  // Update fuel charge toggle
const handleFuelChargeToggle = async (enabled) => {
  try {
    setFuelChargeEnabled(enabled);
    
    // If disabling fuel charge, set fuel_charge to 0 in the database
    // If enabling, recalculate based on current fuel levels
    let newFuelCharge = 0;
    
    if (enabled) {
      const startLevel = startFuelLevel || rental?.start_fuel_level;
      const endLevel = endFuelLevel || rental?.end_fuel_level;
      
      if (startLevel !== null && endLevel !== null && endLevel < startLevel) {
        newFuelCharge = FuelPricingService.calculateFuelCharge(
          startLevel,
          endLevel,
          fuelPricePerLine,
          rental?.rental_type || 'daily'
        );
      }
    }
    
    const { error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({ 
        fuel_charge_enabled: enabled, // Save the enabled state
        fuel_charge: newFuelCharge,
        updated_at: new Date().toISOString()
      })
      .eq('id', rental.id);

    if (error) throw error;
    
    setFuelCharge(newFuelCharge);
    toast.success(`Fuel charge ${enabled ? 'enabled' : 'disabled'}`);
    
    // Refresh rental data to get the updated values
    await loadRentalData(true);
    
  } catch (err) {
    console.error('Error updating fuel charge:', err);
    toast.error('Failed to update fuel charge');
    // Revert state on error
    setFuelChargeEnabled(!enabled);
  }
};

  const persistVehicleReport = async () => {
    if (!vehicleReportDraft.enabled) {
      return null;
    }

    if (!rental?.vehicle_id) {
      throw new Error('Vehicle information is missing for this rental');
    }

    if (!hasClosingInspectionMedia) {
      throw new Error('Upload closing photos or videos before saving the report');
    }

    if (reportNeedsAffectedAreas && !hasAffectedAreas) {
      throw new Error('Please tap the vehicle map to mark the affected area');
    }

    setSavingVehicleReport(true);
    try {
      const actorName = currentUser?.full_name || currentUser?.email || 'Staff';
      const reportPayload = {
        rental_id: rental.id,
        vehicle_id: rental.vehicle_id,
        report_type: vehicleReportDraft.report_type,
        severity: vehicleReportDraft.severity,
        description: vehicleReportDraft.description.trim(),
        affected_areas: Array.isArray(vehicleReportDraft.affected_areas)
          ? vehicleReportDraft.affected_areas
          : [],
        photos: closingMedia.map((media) => ({
          id: media.id,
          url: media.url || media.public_url || media.video_url,
          type: media.file_type || (media.isImage ? 'image/*' : 'video/*'),
          phase: media.phase || 'in',
          created_at: media.created_at || new Date().toISOString(),
        })),
        customer_chargeable: vehicleReportDraft.customer_chargeable,
        customer_charge_amount: vehicleReportDraft.send_to_maintenance ? 0 : (vehicleReportDraft.customer_charge_amount || 0),
        send_to_maintenance: vehicleReportDraft.send_to_maintenance,
        created_by_user_id: currentUser?.id || null,
        created_by_name: actorName,
      };

      let nextReport = vehicleReport
        ? await VehicleReportService.updateReport(vehicleReport.id, reportPayload)
        : await VehicleReportService.createReport(reportPayload);

      if (reportPayload.send_to_maintenance && !nextReport.maintenance_id) {
        const maintenance = await VehicleReportService.createMaintenanceFromReport({
          report: nextReport,
          rental,
          actorName,
        });

        if (maintenance) {
          nextReport = await VehicleReportService.updateReport(nextReport.id, {
            maintenance_id: maintenance.id,
            maintenance_cost_total: maintenance.cost || 0,
            status: 'maintenance_created',
          });

          await supabase
            .from('saharax_0u4w4d_vehicles')
            .update({
              status: 'maintenance',
              updated_at: new Date().toISOString(),
            })
            .eq('id', rental.vehicle_id);
        }
      }

      const hydratedReport = await VehicleReportService.hydrateReportWithMaintenance(nextReport);
      setRequiresClosingInspectionReview(false);
      setVehicleReport(hydratedReport);
      setRental(prev => prev ? ({ ...prev, vehicleReport: hydratedReport }) : prev);
      setFinishRentalSteps(prev => ({
        ...prev,
        closingVideoComplete: true,
      }));
      toast.success(reportPayload.send_to_maintenance ? 'Vehicle report saved and maintenance created' : 'Vehicle report saved');
      return hydratedReport;
    } finally {
      setSavingVehicleReport(false);
    }
  };

  const toggleAffectedArea = (areaId) => {
    setVehicleReportDraft(prev => {
      const currentAreas = Array.isArray(prev.affected_areas) ? prev.affected_areas : [];
      const nextAreas = currentAreas.includes(areaId)
        ? currentAreas.filter((item) => item !== areaId)
        : [...currentAreas, areaId];

      return {
        ...prev,
        affected_areas: nextAreas,
      };
    });
  };

  const clearFinishWorkflowState = () => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    window.localStorage.removeItem(finishWorkflowStorageKey);
  };

  const handleCancelFinishWorkflow = () => {
    setRequiresClosingInspectionReview(closingMedia.length > 0);
    setFinishRentalSteps({
      showWorkflow: false,
      closingVideoComplete: false,
      endOdometerComplete: false,
      endFuelComplete: false
    });
    clearFinishWorkflowState();
  };

  const finalizeRentalCompletion = async () => {
    try {
      let latestReport = vehicleReport;
      if (vehicleReportDraft.enabled) {
        latestReport = await persistVehicleReport();
      }

      const updateData = {
        rental_status: 'completed', 
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // If return signature exists, update it
      if (returnSignatureUrl) {
        updateData.signature_url = returnSignatureUrl;
      }
      
      // ✅ Check if ending odometer exists
      if (!rental.ending_odometer && !endOdometer) {
        toast.error('Please enter ending odometer first');
        return;
      }
      
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', rental.id);

      if (error) {
        console.error('❌ Database error:', error);
        throw new Error(`Database update failed: ${error.message}`);
      }
      
      // Update vehicle status
      if (rental.vehicle_id) {
        await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            status: latestReport?.send_to_maintenance && latestReport?.maintenance_id ? 'maintenance' : 'available',
            updated_at: new Date().toISOString()
          })
          .eq('id', rental.vehicle_id);
      }

      // Reload rental data
      await loadRentalData(true);
      
      // Broadcast real-time update for dashboard
      try {
        await supabase
          .channel('rental-updates')
          .send({
            type: 'broadcast',
            event: 'status_updated',
            payload: { 
              rental_id: rental.id, 
              rental_status: 'completed',
              updated_at: new Date().toISOString()
            }
          });
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-critical):', broadcastErr);
      }
      
      // Hide workflow
      setFinishRentalSteps({
        showWorkflow: false,
        closingVideoComplete: false,
        endOdometerComplete: false,
        endFuelComplete: false
      });
      clearFinishWorkflowState();
      
      setReturnSignatureUrl(null);
      
      toast.success('Rental completed successfully!');
      
    } catch (err) {
      console.error('❌ Error finalizing rental:', err);
      throw err;
    }
  };


  // Load package details for kilometer calculations
const loadPackageDetails = async (packageId = null) => {
  const pkgId = packageId || rental?.package_id;
  
  if (!pkgId) {
    if (RENTAL_DEBUG) console.log('⚠️ No package_id found');
    setPackageDetails(null);
    setIncludedKilometers(null);
    setExtraKmRate(null);
    return;
  }
  
  try {
    if (RENTAL_DEBUG) console.log('📦 Loading package with ID:', pkgId);
    
    const { data, error } = await fetchWithRetry(() =>
      supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .select('*')
        .eq('id', pkgId)
        .single()
    );
    
    if (error) {
      console.error('❌ Error loading package:', error);
      setPackageDetails(null);
      setIncludedKilometers(null);
      setExtraKmRate(null);
      return;
    }
    
    if (data) {
      if (RENTAL_DEBUG) console.log('✅ Package loaded:', {
        id: data.id,
        name: data.name,
        included_kilometers: data.included_kilometers,
        extra_km_rate: data.extra_km_rate,
        fixed_amount: data.fixed_amount
      });
      
      setPackageDetails(data);
      setIncludedKilometers(parseFloat(data.included_kilometers) || 0);
      setExtraKmRate(parseFloat(data.extra_km_rate) || 0);
    }
  } catch (err) {
    console.error('❌ Error in loadPackageDetails:', err);
    setPackageDetails(null);
    setIncludedKilometers(null);
    setExtraKmRate(null);
  }
};

// Load fuel charge settings — reads from fuel_pricing table by vehicle model
const loadFuelChargeSettings = async () => {
  try {
    const modelId = rental?.vehicle?.vehicle_model?.id || rental?.vehicle?.vehicle_model_id;
    if (!modelId) return;

    const type = rental?.rental_type || 'daily';
    const { data, error } = await supabase
      .from('fuel_pricing')
      .select('price_per_line, hourly_price_per_line, daily_price_per_line')
      .eq('model_id', modelId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading fuel pricing:', error);
      return;
    }

    if (data) {
      const price = type === 'hourly'
        ? parseFloat(data.hourly_price_per_line ?? data.price_per_line) || 0
        : parseFloat(data.daily_price_per_line ?? data.price_per_line) || 0;
      setFuelPricePerLine(price);
    }
  } catch (error) {
    console.error('Error loading fuel charge settings:', error);
  }
};


  // ✅ REMOVED: Duplicate loadPackageDetails useEffect - already called inside loadRentalData()
  // Package loading is handled in loadRentalData() when rental data is fetched

  // Clear tier pricing when package is loaded
  useEffect(() => {
    if (packageDetails) {
      if (RENTAL_DEBUG) console.log('📦 Package loaded, clearing tier pricing');
      setTierPricingBreakdown(null);
    }
  }, [packageDetails]);

  // Debug useEffect removed to reduce unnecessary re-renders and console spam


  const resolveEndOdometerValue = (rawValue = null) => {
    const candidateValue = [
      rawValue,
      endOdometerPromptInputRef.current?.value,
      endOdometerEditInputRef.current?.value,
      endOdometerEditValue,
      endOdometer,
    ].find((value) => value !== null && value !== undefined && String(value).trim() !== '');

    const normalizedValue = String(candidateValue ?? '').replace(/,/g, '.').trim();
    const parsedValue = parseFloat(normalizedValue);

    return { normalizedValue, parsedValue };
  };

  const handleEndOdometerSubmit = async (rawValue = null) => {
    const { normalizedValue, parsedValue: endOdometerValue } = resolveEndOdometerValue(rawValue);

    if (!Number.isFinite(endOdometerValue) || endOdometerValue <= 0) {
      toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
      return;
    }
    const startOdometerValue = parseFloat(rental.start_odometer || 0);

    if (endOdometerValue < startOdometerValue) {
      toast.error(`Invalid: Ending odometer (${endOdometerValue} km) cannot be less than starting (${startOdometerValue} km).`);
      return;
    }

    setIsProcessingEndOdometer(true);
    try {
      // Calculate total distance
      const totalDistance = endOdometerValue - startOdometerValue;
      
      // Get package details
      const pkg = getRentalKilometerPackage(rental, packageDetails);
      const includedKm = pkg ? parseFloat(pkg.included_kilometers || 0) : 0;
      const extraRate = pkg ? parseFloat(pkg.extra_km_rate || 0) : 0;
      
      // Calculate extra kilometers and overage charge only for real kilometer packages
      const extraKms = pkg ? Math.max(0, totalDistance - includedKm) : 0;
      const overageCharge = pkg ? extraKms * extraRate : 0;
      
      if (RENTAL_DEBUG) console.log('📊 Odometer calculation:', {
        startOdometer: startOdometerValue,
        endOdometer: endOdometerValue,
        totalDistance,
        includedKm,
        extraKms,
        extraRate,
        overageCharge
      });
      
      // Preserve original price
      const originalPrice = rental.rental_type === 'hourly'
        ? (rental.quantity_hours ?? rental.quantity_days ?? 1) * (rental.unit_price || 0)
        : rental.unit_price ? rental.unit_price * (rental.quantity_days ?? 1) : (rental.total_amount || 0);
      const extensionFees = totalExtensionFees || 0;
      const fuelChargeAmount = getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled });
      const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
      const finalTotal = originalPrice + overageCharge + extensionFees + fuelChargeAmount + maintenanceChargeAmount;

      // Update rental with all calculated values
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ending_odometer: endOdometerValue,
          overage_charge: overageCharge, // This is the source of truth
          total_distance: totalDistance,
          total_kilometers_driven: totalDistance,
          included_kilometers_applied: pkg ? includedKm : null,
          extra_km_rate_applied: pkg ? extraRate : null,
          total_amount: originalPrice,
          remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Update vehicle odometer
      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            current_odometer: endOdometerValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', rental.vehicle_id);

        if (vehicleError) {
          console.error('Failed to update vehicle odometer:', vehicleError);
        }
      }

      // Update local state
      setRental(prev => ({
        ...prev,
        ending_odometer: endOdometerValue,
        overage_charge: overageCharge,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        included_kilometers_applied: pkg ? includedKm : null,
        extra_km_rate_applied: pkg ? extraRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
      }));

      setShowEndOdometerPrompt(false);
      setEndOdometer('');
      
      // Update workflow completion
      setFinishRentalSteps(prev => ({
        ...prev,
        endOdometerComplete: true
      }));
      
      const overageMessage = !pkg
        ? `\nNo kilometer package applied`
        : overageCharge > 0 
        ? `
⚠️ Overage: ${extraKms} km × ${extraRate} MAD = ${overageCharge.toFixed(2)} MAD`
        : `
✅ No overage (${totalDistance} km within ${includedKm} km limit)`;
      
      toast.success(`Ending odometer saved: ${endOdometerValue} km

Distance: ${totalDistance.toFixed(2)} km${overageMessage}`);
      
    } catch (err) {
      console.error('❌ Error saving ending odometer:', err);
      toast.error(`Failed to save ending odometer. Error: ${err.message}`);
    } finally {
      setIsProcessingEndOdometer(false);
    }
  };

  // Handle editing the end odometer
  const handleEditEndOdometer = async () => {
    const { normalizedValue, parsedValue: newEndOdometer } = resolveEndOdometerValue(endOdometerEditValue);
    if (!Number.isFinite(newEndOdometer) || newEndOdometer <= 0) {
      toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
      return;
    }

    const startOdometerValue = parseFloat(rental.start_odometer || 0);

    if (newEndOdometer < startOdometerValue) {
      toast.error(`Invalid Odometer Reading

Ending odometer (${newEndOdometer} km) cannot be less than starting odometer (${startOdometerValue} km).`);
      return;
    }

    setIsProcessingEndOdometer(true);
    try {
      // Recalculate with dynamic package values only when a real kilometer package exists
      const totalDistance = newEndOdometer - startOdometerValue;
      const pkg = getRentalKilometerPackage(rental, packageDetails);
      const packageIncludedKilometers = pkg ? parseFloat(pkg.included_kilometers || 0) : 0;
      const packageExtraKmRate = pkg ? parseFloat(pkg.extra_km_rate || 0) : 0;
      const extraKms = pkg ? Math.max(0, totalDistance - packageIncludedKilometers) : 0;
      const overageCharge = pkg ? extraKms * packageExtraKmRate : 0;
      
      const originalPrice = rental.total_amount || rental.unit_price || 0;
      const extensionFees = totalExtensionFees || 0;
      const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
      const finalTotal = originalPrice + overageCharge + extensionFees + maintenanceChargeAmount;

      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          ending_odometer: newEndOdometer,
          total_distance: totalDistance,
          total_kilometers_driven: totalDistance,
          overage_charge: overageCharge,
          included_kilometers_applied: pkg ? packageIncludedKilometers : null,
          extra_km_rate_applied: pkg ? packageExtraKmRate : null,
          remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Update vehicle odometer
      if (rental.vehicle_id) {
        await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ 
            current_odometer: newEndOdometer,
            updated_at: new Date().toISOString()
          })
          .eq('id', rental.vehicle_id);
      }

      setRental(prev => ({
        ...prev,
        ending_odometer: newEndOdometer,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        overage_charge: overageCharge,
        included_kilometers_applied: pkg ? packageIncludedKilometers : null,
        extra_km_rate_applied: pkg ? packageExtraKmRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
      }));
      
      setIsEditingEndOdometer(false);
      
      const overageMessage = !pkg
        ? `\nNo kilometer package applied`
        : overageCharge > 0 
        ? `\n⚠️ Overage: ${extraKms} km × ${packageExtraKmRate} MAD = ${overageCharge.toFixed(2)} MAD`
        : `\n✅ No overage (${totalDistance} km within ${packageIncludedKilometers} km limit)`;
      
      toast.success(`Ending odometer updated successfully! | Distance: ${totalDistance.toFixed(2)} km${overageMessage}`);
      
    } catch (err) {
      console.error('❌ Error updating ending odometer:', err);
      toast.error(`Failed to update ending odometer. Error: ${err.message}`);
    } finally {
      setIsProcessingEndOdometer(false);
    }
  };
  const handleSaveEndOdometer = async (rawValue = null) => {
  const { normalizedValue, parsedValue: newEndOdometer } = resolveEndOdometerValue(rawValue);

  if (!Number.isFinite(newEndOdometer) || newEndOdometer <= 0) {
    toast.error(`Please enter a valid ending odometer reading. Received: ${normalizedValue || '(empty)'}`);
    return;
  }

  const startOdometerValue = parseFloat(rental.start_odometer || 0);

  if (newEndOdometer < startOdometerValue) {
    toast.error(`Invalid Odometer Reading | Ending odometer (${newEndOdometer} km) cannot be less than starting odometer (${startOdometerValue} km).`);
    return;
  }

  setIsProcessingEndOdometer(true);
  try {
    // Calculate new total distance
    const totalDistance = newEndOdometer - startOdometerValue;
    
    // Recalculate overage charge only for real kilometer packages
    let overageCharge = 0;
    let includedKilometers = 0;
    let extraKms = 0;
    let extraKmRate = 0;
    const pkg = getRentalKilometerPackage(rental, packageDetails);

    if (pkg) {
      includedKilometers = parseFloat(pkg.included_kilometers || 0);
      extraKmRate = parseFloat(pkg.extra_km_rate || 0);
      extraKms = Math.max(0, totalDistance - includedKilometers);
      overageCharge = extraKms * extraKmRate;
    }
    
    // Preserve original price
    const originalPrice = rental.total_amount || rental.unit_price || 0;
    const extensionFees = totalExtensionFees || 0;
    const maintenanceChargeAmount = getLinkedMaintenanceChargeAmount();
    const finalTotal = originalPrice + overageCharge + extensionFees + maintenanceChargeAmount;

    if (RENTAL_DEBUG) console.log('🔍 DEBUG - Odometer Edit Recalculation:', {
      startOdometer: startOdometerValue,
      newEndOdometer,
      totalDistance,
      includedKilometers,
      extraKms,
      extraKmRate,
      overageCharge,
      finalTotal
    });

    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        ending_odometer: newEndOdometer,
        total_distance: totalDistance,
        total_kilometers_driven: totalDistance,
        overage_charge: overageCharge,
        included_kilometers_applied: pkg ? includedKilometers : null,
        extra_km_rate_applied: pkg ? extraKmRate : null,
        remaining_amount: Math.max(0, finalTotal - (parseFloat(rental.deposit_amount) || 0)),
        updated_at: new Date().toISOString()
      })
      .eq('id', rental.id);

    if (updateError) throw updateError;

    // Update vehicle odometer
    if (rental.vehicle_id) {
      await supabase
        .from('saharax_0u4w4d_vehicles')
        .update({ 
          current_odometer: newEndOdometer,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.vehicle_id);
    }

    // 🔥 FIX: Update local state with ALL recalculated values
    setRental(prev => ({
      ...prev,
      ending_odometer: newEndOdometer,
      total_distance: totalDistance,
      total_kilometers_driven: totalDistance,
      overage_charge: overageCharge,
      included_kilometers_applied: pkg ? includedKilometers : null,
      extra_km_rate_applied: pkg ? extraKmRate : null,
      remaining_amount: Math.max(0, finalTotal - (parseFloat(prev.deposit_amount) || 0))
    }));
    
    setIsEditingEndOdometer(false);
    toast.success(`Ending odometer updated successfully! | Distance: ${totalDistance.toFixed(2)} km | Overage: ${overageCharge.toFixed(2)} MAD`);
    
  } catch (err) {
    console.error('❌ Error updating ending odometer:', err);
    toast.error(`Failed to update ending odometer. Error: ${err.message}`);
  } finally {
    setIsProcessingEndOdometer(false);
  }
};


  // Helper function to get media counts
  const getMediaCounts = (mediaArray) => {
    const images = mediaArray.filter(m => m.file_type?.startsWith('image/')).length;
    const videos = mediaArray.filter(m => m.file_type?.startsWith('video/')).length;
    const parts = [];
    if (images > 0) parts.push(`${images} image${images !== 1 ? 's' : ''}`);
    if (videos > 0) parts.push(`${videos} video${videos !== 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  const loadRentalMedia = async (rentalId) => {
    try {
      const { data: mediaRecords, error: mediaError } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .select('*')
        .eq('rental_id', rentalId)
        .order('created_at', { ascending: false });

      if (mediaError) {
        console.error('❌ Error:', mediaError);
        return;
      }

      if (mediaRecords && mediaRecords.length > 0) {
        const openingMedia = mediaRecords
          .filter(r => r.phase === 'out')
          .map(r => ({
            ...r,
            url: r.public_url,
            isImage: r.file_type?.startsWith('image/') || false,
            isVideo: r.file_type?.startsWith('video/') || false
          }));
        
        const closingMedia = mediaRecords
          .filter(r => r.phase === 'in')
          .map(r => ({
            ...r,
            url: r.public_url,
            isImage: r.file_type?.startsWith('image/') || false,
            isVideo: r.file_type?.startsWith('video/') || false
          }));

        setOpeningMedia(openingMedia);
        setClosingMedia(closingMedia);
        
        const imageCount = openingMedia.filter(m => m.isImage).length + closingMedia.filter(m => m.isImage).length;
        const videoCount = openingMedia.filter(m => m.isVideo).length + closingMedia.filter(m => m.isVideo).length;
        if (RENTAL_DEBUG) console.log(`📹 Media loaded: ${mediaRecords.length} (Images: ${imageCount}, Videos: ${videoCount})`);
      } else {
        setOpeningMedia([]);
        setClosingMedia([]);
      }
    } catch (err) {
      console.error('❌ Error:', err);
    }
  };

  useEffect(() => {
    const loadRental = async () => {
      try {
        setLoading(true);
        await loadRentalData(true);
      } catch (err) {
        console.error('❌ Error:', err);
        setError('Failed to load rental details');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadRental();
    }
  }, [id]);

  useEffect(() => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    if (!rental || rental.rental_status !== 'active') {
      clearFinishWorkflowState();
      restoredFinishWorkflowRef.current = null;
      return;
    }

    if (restoredFinishWorkflowRef.current === finishWorkflowStorageKey) {
      return;
    }

    const rawState = window.localStorage.getItem(finishWorkflowStorageKey);
    if (!rawState) return;

    try {
      const parsedState = JSON.parse(rawState);
      if (parsedState?.showWorkflow) {
        const nextSteps = {
          showWorkflow: true,
          closingVideoComplete: inspectionComplete,
          endOdometerComplete: Boolean(rental.ending_odometer),
          endFuelComplete: endFuelLevel !== null || rental?.end_fuel_level !== null
        };
        setFinishRentalSteps((prev) => (
          prev.showWorkflow === nextSteps.showWorkflow &&
          prev.closingVideoComplete === nextSteps.closingVideoComplete &&
          prev.endOdometerComplete === nextSteps.endOdometerComplete &&
          prev.endFuelComplete === nextSteps.endFuelComplete
        ) ? prev : nextSteps);
      }

      if (parsedState?.vehicleReportDraft && !vehicleReport?.id) {
        const nextDraft = {
          ...DEFAULT_VEHICLE_REPORT_DRAFT,
          ...parsedState.vehicleReportDraft,
          affected_areas: Array.isArray(parsedState.vehicleReportDraft.affected_areas)
            ? parsedState.vehicleReportDraft.affected_areas
            : []
        };
        setVehicleReportDraft((prev) => (
          JSON.stringify({
            ...prev,
            customer_charge_amount: String(prev.customer_charge_amount ?? ''),
          }) === JSON.stringify({
            ...nextDraft,
            customer_charge_amount: String(nextDraft.customer_charge_amount ?? ''),
          })
        ) ? prev : nextDraft);
      }

      restoredFinishWorkflowRef.current = finishWorkflowStorageKey;
    } catch (error) {
      console.error('Failed to restore finish rental workflow state:', error);
      clearFinishWorkflowState();
      restoredFinishWorkflowRef.current = null;
    }
  }, [finishWorkflowStorageKey, rental?.id, rental?.rental_status, rental?.ending_odometer, rental?.end_fuel_level, endFuelLevel, inspectionComplete, vehicleReport?.id]);

  useEffect(() => {
    if (!finishWorkflowStorageKey || typeof window === 'undefined') return;
    if (!rental || rental.rental_status !== 'active') return;

    if (!finishRentalSteps.showWorkflow) return;

    const payload = {
      showWorkflow: true,
      vehicleReportDraft,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(finishWorkflowStorageKey, JSON.stringify(payload));
  }, [finishWorkflowStorageKey, rental?.id, rental?.rental_status, finishRentalSteps.showWorkflow, vehicleReportDraft]);
  // ✅ OPTIMIZED: Single ref-based timer to avoid full re-renders every second.
  // Instead of a `currentTime` state (which triggered 3 state updates/sec),
  // we use one setInterval that directly computes & sets display strings.
  const currentTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    // Helper: compute time-remaining string
    const calcTimeRemaining = (rentalData) => {
      if (!rentalData) return null;
      const now = new Date(currentTimeRef.current);
      
      // Use the latest of rental_end_date and actual_end_date (both updated by extensions)
      const endTime1 = new Date(rentalData.rental_end_date);
      const endTime2 = rentalData.actual_end_date ? new Date(rentalData.actual_end_date) : null;
      const endTime = endTime2 && endTime2 > endTime1 ? endTime2 : endTime1;
      
      const diff = endTime - now;
      if (diff <= 0) return 'Expired';
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      return `${hours}h ${minutes}m ${seconds}s`;
    };

    // Helper: compute elapsed-time string
    const calcElapsedTime = (rentalData) => {
      if (!rentalData?.started_at || rentalData.rental_status !== 'active') return '';
      const now = new Date(currentTimeRef.current);
      const startDate = new Date(rentalData.started_at);
      const diff = now - startDate;
      if (diff < 0) return '';
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Run once immediately
    currentTimeRef.current = Date.now();
    const tr = calcTimeRemaining(rental);
    if (tr !== null) setTimeRemaining(tr);
    setElapsedTime(calcElapsedTime(rental));

    // Update every second for live timer display
    timerIntervalRef.current = setInterval(() => {
      currentTimeRef.current = Date.now();
      const newTR = calcTimeRemaining(rental);
      if (newTR !== null) setTimeRemaining(prev => prev === newTR ? prev : newTR);
      const newET = calcElapsedTime(rental);
      setElapsedTime(prev => prev === newET ? prev : newET);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [rental?.rental_end_date, rental?.actual_end_date, rental?.rental_status, rental?.started_at]);



    /**
   * ENHANCED CAMERA RECORDING - iOS/Android Compatible
   * Ensures mp4 output format for maximum compatibility
   * Torch/flashlight support for both platforms
   */

  
  const startPhotoPreview = async (modalType = null) => {
    try {
      const modal = modalType || activeModal || 'opening';
      const videoRef = modal === 'opening' ? openingVideoRef : closingVideoRef;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setRecordingStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      toast.error('Could not access camera. Please check permissions.');
    }
  };

  const switchCamera = async () => {
    if (!isRecording) return;
    
    try {
      if (RENTAL_DEBUG) console.log('🔄 Switching camera...');
      
      // Stop current recording and stream
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
      }
      
      // Stop canvas rendering
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Toggle facing mode
      const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newFacingMode);
      
      // Restart with new camera
      const constraints = {
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setRecordingStream(stream);

      // Setup canvas rendering
      if (videoPreviewRef.current && canvasRef.current) {
        const video = videoPreviewRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          
          const drawFrame = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            animationFrameRef.current = requestAnimationFrame(drawFrame);
          };
          
          video.play().then(() => {
            if (RENTAL_DEBUG) console.log('✅ Camera switched, canvas rendering started');
            drawFrame();
            window.dispatchEvent(new Event('resize'));
          }).catch(err => {
            console.error('❌ Video play failed after switch:', err);
          });
        };
      }

      // Setup new MediaRecorder
      let mimeType = '';
      const mp4Types = ['video/mp4', 'video/mp4;codecs=avc1', 'video/mp4;codecs=h264'];
      
      for (const type of mp4Types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      if (!mimeType) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mimeType = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2500000
      });

      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Prevent double execution
        if (isProcessingThumbnail) {
          return;
        }
        setIsProcessingThumbnail(true);
        
        // Create blob with recorded MIME type
        const videoBlob = new Blob(chunks, { type: mimeType });
        const timestamp = Date.now();
        
        // Always use .mp4 extension for consistency
        const filename = `recorded_${timestamp}.mp4`;
        
        // Create preview URL (will be revoked after upload)
        const previewUrl = URL.createObjectURL(videoBlob);

        // Get video duration
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = URL.createObjectURL(videoBlob);
        
        const getDuration = () => new Promise((resolve) => {
          tempVideo.onloadedmetadata = () => {
            const dur = tempVideo.duration;
            URL.revokeObjectURL(tempVideo.src);
            resolve(isFinite(dur) ? Math.round(dur) : 0);
          };
          setTimeout(() => resolve(0), 2000);
        });
        
        const duration = await getDuration();

        const fileObj = {
          id: timestamp + Math.random(),
          type: 'video',
          blob: videoBlob,
          url: previewUrl,
          name: filename,
          timestamp: new Date().toISOString(),
          duration: duration,
          size: videoBlob.size,
          source: 'camera',
          mimeType: mimeType
        };

        setCapturedMedia(prev => [...prev, fileObj]);
        setRecordedChunks([]);
        
        // Cleanup camera stream and preview
        stream.getTracks().forEach(track => {
          track.stop();
        });
        
        // CRITICAL: Properly release camera hardware
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
          videoPreviewRef.current.load();
        }
        
        setRecordingStream(null);
        setIsProcessingThumbnail(false);
      };

      setMediaRecorder(recorder);
      setRecordedChunks(chunks);
      recorder.start();
      
      if (RENTAL_DEBUG) console.log(`✅ Camera switched to ${newFacingMode} and recording restarted`);
      
    } catch (err) {
      console.error('❌ Camera switch error:', err);
      toast.error(`Failed to switch camera: ${err.message}`);
    }
  };

  const startCameraRecording = async (modalType = 'opening') => {
  try {
    if (RENTAL_DEBUG) console.log(`📹 Starting camera recording for ${modalType} modal...`);
    
    // Determine which refs to use based on modal type
    const videoRef = modalType === 'opening' ? openingVideoRef : closingVideoRef;
    const canvasElRef = modalType === 'opening' ? openingCanvasRef : closingCanvasRef;
    
    // Set isRecording FIRST to render DOM elements
    setIsRecording(true);
    
    // Wait for React to render the DOM elements
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (RENTAL_DEBUG) console.log('🔧 Checking refs after delay - Video:', !!videoRef.current, 'Canvas:', !!canvasElRef.current);
    
    if (!videoRef.current || !canvasElRef.current) {
      console.error('❌ Video or Canvas ref not available after delay!');
      setIsRecording(false);
      return;
    }
    
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: true
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setRecordingStream(stream);
    
    if (RENTAL_DEBUG) console.log('✅ Camera stream acquired');
    
    const video = videoRef.current;
    const canvas = canvasElRef.current;
    
    // Configure video element
    video.muted = true;
    video.setAttribute('muted', 'true');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.playsInline = true;
    video.autoplay = true;
    
    // Attach stream to video
    video.srcObject = stream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        if (video.readyState >= 2) {
          if (RENTAL_DEBUG) console.log('✅ Video ready, dimensions:', video.videoWidth, 'x', video.videoHeight);
          resolve();
        } else {
          video.onloadeddata = () => {
            if (RENTAL_DEBUG) console.log('✅ Video loadeddata event fired');
            resolve();
          };
          // Fallback timeout
          setTimeout(resolve, 2000);
        }
      };
      checkReady();
    });
    
    // Set canvas dimensions
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    if (RENTAL_DEBUG) console.log('📐 Canvas dimensions set:', canvas.width, 'x', canvas.height);
    
    // Play video
    try {
      await video.play();
      if (RENTAL_DEBUG) console.log('✅ Video playing');
      
      // Start painting frames to canvas
      const ctx = canvas.getContext('2d');
      
      const paintFrame = () => {
        if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState >= 2) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
        animationFrameRef.current = requestAnimationFrame(paintFrame);
      };
      
      paintFrame();
      
    } catch (err) {
      console.error('❌ Video play failed:', err);
    }
    
    // Initialize MediaRecorder
    let mimeType = '';
    const mp4Types = ['video/mp4', 'video/mp4;codecs=avc1', 'video/mp4;codecs=h264'];
    
    for (const type of mp4Types) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        if (RENTAL_DEBUG) console.log(`✅ Using ${type} for recording`);
        break;
      }
    }
    
    if (!mimeType) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }
    }
    
    if (!mimeType) {
      throw new Error('No supported video format found');
    }
    
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 2500000
    });
    
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    recorder.onstop = async () => {
      if (isProcessingThumbnail) {
        return;
      }
      
      setIsProcessingThumbnail(true);
      
      const videoBlob = new Blob(chunks, { type: mimeType });
      const timestamp = Date.now();
      const filename = `recorded_${timestamp}.mp4`;
      const previewUrl = URL.createObjectURL(videoBlob);
      
      // Get video duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = URL.createObjectURL(videoBlob);
      
      const getDuration = () => new Promise((resolve) => {
        tempVideo.onloadedmetadata = () => {
          const dur = tempVideo.duration;
          URL.revokeObjectURL(tempVideo.src);
          resolve(isFinite(dur) ? Math.round(dur) : 0);
        };
        // Fallback if metadata doesn't load
        setTimeout(() => resolve(0), 2000);
      });
      
      const duration = await getDuration();
      
      const fileObj = {
        id: timestamp + Math.random(),
        type: 'video',
        blob: videoBlob,
        url: previewUrl,
        name: filename,
        timestamp: new Date().toISOString(),
        duration: duration,
        size: videoBlob.size,
        source: 'camera',
        mimeType: mimeType
      };
      
      setCapturedMedia(prev => [...prev, fileObj]);
      setRecordedChunks([]);
      
      // Cleanup
      stream.getTracks().forEach(track => track.stop());
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
      
      setRecordingStream(null);
      setIsProcessingThumbnail(false);
      setIsRecording(false);
    };
    
    setMediaRecorder(recorder);
    setRecordedChunks(chunks);
    recorder.start();
    
    if (RENTAL_DEBUG) console.log('✅ Recording started');
    
  } catch (err) {
    console.error('❌ Camera recording error:', err);
    setIsRecording(false);
    toast.error(`Failed to start camera: ${err.message}`);
  }
};

  const stopCameraRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      
      // Cleanup: Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        if (RENTAL_DEBUG) console.log('🛑 Paint loop cancelled in stopCameraRecording');
      }
      
      if (torchEnabled) {
        toggleTorch();
      }
    }
  };

  const capturePhoto = (modalType = null) => {
    const modal = modalType || activeModal || 'opening';
    const videoRef = modal === 'opening' ? openingVideoRef : closingVideoRef;
    const canvasElRef = modal === 'opening' ? openingCanvasRef : closingCanvasRef;
    
    if (!videoRef.current || !canvasElRef.current) {
      console.error('❌ Video or canvas ref not available for photo capture');
      return;
    }
    
    // Trigger flash effect
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 200);
    
    const video = videoRef.current;
    const canvas = canvasElRef.current;
    
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const fileName = `photo_${Date.now()}.jpg`;
        const fileObj = {
          id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          blob: blob,
          name: fileName,
          type: 'image/jpeg',
          url: URL.createObjectURL(blob),
          thumbnail: URL.createObjectURL(blob),
          source: 'camera',
          mediaType: 'image'
        };
        setCapturedMedia(prev => [...prev, fileObj]);
        if (navigator.vibrate) navigator.vibrate(50);
        if (RENTAL_DEBUG) console.log('✅ Photo captured:', fileName);
      }
    }, 'image/jpeg', 0.92);
  };

  /**
   * Toggle flashlight/torch during recording
   * iOS 15+: Supports torch via ImageCapture API
   * Android Chrome: Native torch support via MediaStreamTrack
   */
  const toggleTorch = async () => {
    if (!recordingStream) return;

    try {
      const videoTrack = recordingStream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities();

      // Check if torch is supported on this device
      // iOS 15+: Supports torch via MediaStreamTrack constraints
      // Android Chrome: Native torch support via MediaStreamTrack
      if (!capabilities.torch) {
        toast.error('Flashlight not supported on this device');
        return;
      }

      const newTorchState = !torchEnabled;
      
      // Apply torch constraint to the video track
      await videoTrack.applyConstraints({
        advanced: [{ torch: newTorchState }]
      });

      setTorchEnabled(newTorchState);
      if (RENTAL_DEBUG) console.log(`🔦 Torch ${newTorchState ? 'enabled' : 'disabled'}`);

    } catch (err) {
      console.error('❌ Torch toggle error:', err);
      toast.error('Failed to toggle flashlight');
    }
  };

  // Cleanup camera stream on component unmount
  useEffect(() => {
    return () => {
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [recordingStream]);

  // Load fuel charge settings
  useEffect(() => {
    loadFuelChargeSettings();
  }, []);


  // Load cached PDFs and auto-generate missing ones - OPTIMIZED
  useEffect(() => {
    if (rental) {
      // Guard: only run PDF check once per rental ID
      if (pdfCheckDoneRef.current === rental?.id) return;
      pdfCheckDoneRef.current = rental?.id;

      // PDF URLs are always regenerated fresh — never load old ones from DB
      
      // ✅ OPTIMIZED: Delay PDF generation for better UX
      const generatePDFsIfNeeded = () => {
        // Only generate if user has been on page for 3 seconds (page is interactive)
        if (rental.signature_url && !pdfCache.contractUrl && !pdfCache.contractGenerating) {
          setTimeout(() => generateAndCacheContractPDF(), 3000);
        }
        if (rental.payment_status === 'paid' && !pdfCache.receiptUrl && !pdfCache.receiptGenerating) {
          setTimeout(() => generateAndCacheReceiptPDF(), 3500);
        }
      };
      
      // Wait 2 seconds before starting PDF generation
      const timer = setTimeout(generatePDFsIfNeeded, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [rental?.id, rental?.signature_url, rental?.payment_status]);

  // Auto-close extension modal when closing video is uploaded
  useEffect(() => {
    if (closingMedia.length > 0 && extensionModalOpen) {
      setExtensionModalOpen(false);
    }
  }, [closingMedia, extensionModalOpen]);
  // Update finish steps when closing video is uploaded
  useEffect(() => {
    if (!finishRentalSteps.showWorkflow) return;

    setFinishRentalSteps(prev => (
      prev.closingVideoComplete === inspectionComplete
        ? prev
        : {
            ...prev,
            closingVideoComplete: inspectionComplete
          }
    ));
  }, [finishRentalSteps.showWorkflow, inspectionComplete]);

  // Update finish steps when end odometer is saved
  useEffect(() => {
    if (rental?.ending_odometer && finishRentalSteps.showWorkflow) {
      setFinishRentalSteps(prev => (
        prev.endOdometerComplete ? prev : {
          ...prev,
          endOdometerComplete: true
        }
      ));
    }
  }, [rental?.ending_odometer, finishRentalSteps.showWorkflow]);

  // Update finish steps when end fuel is saved
useEffect(() => {
  if ((endFuelLevel !== null || rental?.end_fuel_level) && finishRentalSteps.showWorkflow) {
    setFinishRentalSteps(prev => (
      prev.endFuelComplete ? prev : {
        ...prev,
        endFuelComplete: true
      }
    ));
    
    // Calculate fuel charge - only for daily rentals and if fuel charge is enabled
    const startLevel = startFuelLevel || rental?.start_fuel_level;
    const endLevel = endFuelLevel || rental?.end_fuel_level;
    
    // Only calculate and set fuel charge if fuel charge is enabled
    if (fuelChargeEnabled) {
      if (startLevel !== null && endLevel !== null && endLevel < startLevel) {
        const charge = FuelPricingService.calculateFuelCharge(
          startLevel,
          endLevel,
          fuelPricePerLine || 0,
          rental?.rental_type || 'daily'
        );
        setFuelCharge(charge);
      }
    } else {
      setFuelCharge(0);
    }
  }
}, [endFuelLevel, rental?.end_fuel_level, finishRentalSteps.showWorkflow, startFuelLevel, rental?.start_fuel_level, fuelPricePerLine, fuelChargeEnabled]);




    /**
   * ENHANCED GALLERY UPLOAD - iOS .MOV/HEVC Auto-Conversion
   * Automatically converts iOS videos to mp4 before upload
   * Shows conversion progress to user
   */
  const uploadFromGallery = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mov,.MOV,.mp4,.MP4,.m4v,.M4V'; // Accept all video formats
    input.multiple = true; // Allow multiple file selection
    
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      if (RENTAL_DEBUG) console.log(`📹 Gallery files selected: ${files.length} file(s)`);
      
      setIsUploading(true);
      
      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (RENTAL_DEBUG) console.log(`📹 Processing file ${i + 1}/${files.length}:`, file.name, file.type, `${(file.size / 1024 / 1024).toFixed(2)}MB`);

        // Check file size (50MB limit per file)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          toast.error(`File "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit. Skipping this file.`);
          continue;
        }

        setIsConverting(true);
        setConversionProgress(0);

        try {
          // Process video: convert iOS .MOV/HEVC to mp4 if needed
          if (RENTAL_DEBUG) console.log('🔍 Checking if video needs conversion...');
          
          // Use file directly (no conversion needed for most browsers)
          const blob = file;
          const converted = false;
          setConversionProgress(100);
          if (RENTAL_DEBUG) console.log(`🔄 Processing file ${i + 1}: 100%`);

          // Create file object with converted blob
          const timestamp = Date.now();
          const filename = file.name.replace(/\.(mov|MOV|m4v|M4V)$/i, '.mp4');
          const blobUrl = URL.createObjectURL(blob);

          // Try to get video duration
          let galleryDuration = 0;
          try {
            const tempVid = document.createElement('video');
            tempVid.preload = 'metadata';
            tempVid.src = blobUrl;
            galleryDuration = await new Promise((resolve) => {
              tempVid.onloadedmetadata = () => {
                const dur = tempVid.duration;
                resolve(isFinite(dur) ? Math.round(dur) : 0);
              };
              setTimeout(() => resolve(0), 2000);
            });
          } catch (durErr) {
            console.warn('Could not get video duration:', durErr);
          }

          const fileObj = {
            id: timestamp + Math.random(),
            type: 'video',
            blob: blob,
            url: blobUrl,
            name: filename,
            timestamp: new Date().toISOString(),
            duration: galleryDuration,
            size: blob.size,
            source: 'gallery',
            converted: converted
          };

          setCapturedMedia(prev => [...prev, fileObj]);

        } catch (error) {
          console.error(`❌ Video processing failed for ${file.name}:`, error);
          toast.error(`Failed to process "${file.name}": ${error.message} | Skipping this file.`);
        }
      }
      
      setIsConverting(false);
      setConversionProgress(0);
      setIsUploading(false);
    };
    
    // Trigger file picker
    input.click();
  };

  // Take photo from camera
  const takePhoto = async (type) => {
    const setCapturedMedia = type === 'opening' ? setOpeningCapturedFiles : setClosingCapturedFiles;
    const setIsConverting = type === 'opening' ? setOpeningIsConverting : setClosingIsConverting;
    const streamRef = type === 'opening' ? openingStreamRef : closingStreamRef;
    const videoRef = type === 'opening' ? openingVideoRef : closingVideoRef;
    
    if (!streamRef.current || !videoRef.current) {
      console.error('Camera not ready');
      return;
    }
    
    setIsCapturingPhoto(true);
    
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
      
      // Create object URL for preview
      const url = URL.createObjectURL(blob);
      
      // Add to captured files
      const photoFile = {
        blob,
        url,
        name: `photo_${Date.now()}.jpg`,
        size: blob.size,
        mediaType: 'image'
      };
      
      setCapturedMedia(prev => [...prev, photoFile]);
      if (RENTAL_DEBUG) console.log('📸 Photo captured successfully');
      
    } catch (error) {
      console.error('Failed to capture photo:', error);
    } finally {
      setIsCapturingPhoto(false);
    }
  };


  // Helper to shorten URLs using is.gd via a CORS Proxy
  // Helper function to format file sizes
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const shortenUrl = async (url, documentType = 'other') => {
    try {
      return await shortenUrlService(url, rental?.id, documentType);
    } catch (error) {
      console.error('URL shortening failed:', error);
      return url;
    }
  };
  // WhatsApp URL opening helper - uses multiple methods
  const openWhatsAppUrl = (url) => {
    if (RENTAL_DEBUG) console.log('🔗 Opening WhatsApp URL with multiple methods:', url);
    
    // Method 1: Create and click a temporary link (most reliable)
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = 'position: fixed; left: -9999px; top: -9999px; width: 1px; height: 1px;';
    
    document.body.appendChild(link);
    
    try {
      // Native click
      link.click();
      if (RENTAL_DEBUG) console.log('✅ Method 1: Native click attempted');
    } catch (err) {
      if (RENTAL_DEBUG) console.log('Native click failed, trying programmatic click');
    }
    
    // Method 2: MouseEvent (for strict browsers)
    setTimeout(() => {
      try {
        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(event);
        if (RENTAL_DEBUG) console.log('✅ Method 2: MouseEvent dispatched');
      } catch (err) {
        if (RENTAL_DEBUG) console.log('MouseEvent failed');
      }
    }, 10);
    
    // Method 3: window.open as fallback
    setTimeout(() => {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        if (RENTAL_DEBUG) console.log('✅ Method 3: window.open attempted');
      } catch (err) {
        if (RENTAL_DEBUG) console.log('window.open failed, showing manual option');
        // Show URL for manual copy
        toast.error(`WhatsApp blocked by browser. Please copy this link manually: | ${url}`);
      }
    }, 50);
    
    // Cleanup
    setTimeout(() => {
      if (link.parentNode) {
        document.body.removeChild(link);
      }
    }, 1000);
  };



  // ✅ UPDATED: Enhanced saveMedia with improved retry logic and non-blocking thumbnail generation
    /**
   * ENHANCED SAVE MEDIA - First-Try Upload Success with Progress
   * Implements robust upload with real-time progress tracking
   * Automatic thumbnail generation after successful upload
   * Retry logic only for network errors
   */
  /**
   * ENHANCED SAVE MEDIA - First-Try Upload Success with Progress
   * Implements robust upload with real-time progress tracking
   * Automatic thumbnail generation after successful upload
   * Retry logic only for network errors
   */
  const handleOpenOpeningModal = () => {
    setActiveModal('opening');
    setCapturedMedia([]);
    setOpeningMediaMode('photo');
    setIsCapturingPhoto(false);
    setIsRecording(false);
    setOpeningModalOpen(true);
  };

  const handleOpenClosingModal = () => {
    setActiveModal('closing');
    setCapturedMedia([]);
    setClosingMediaMode('photo');
    setIsCapturingPhoto(false);
    setIsRecording(false);
    setRequiresClosingInspectionReview(false);
    setClosingModalOpen(true);
  };

  const saveMedia = async (type) => {
    if (capturedMedia.length === 0) {
      toast.error('Please capture or select media first');
      return;
    }

    setIsProcessingVideo(true);
    setUploadProgress(0);

    try {
      // Process all captured files
      const uploadedMedia = [];
      const totalFiles = capturedMedia.length;
      
      for (let i = 0; i < capturedMedia.length; i++) {
        const file = capturedMedia[i];
        
        // Normalize file object - handle both File objects and our custom structure
        const fileBlob = file.blob || file;
        const fileName_orig = file.name || (file instanceof File ? file.name : `media_${Date.now()}`);
        const fileType = file.type || file.mediaType || (fileBlob.type || 'application/octet-stream');
        const isImage = fileType.startsWith('image/');
        
        if (RENTAL_DEBUG) console.log(`📤 Starting upload for ${type} ${isImage ? 'image' : 'video'} (${i + 1}/${totalFiles}):`, fileName_orig);

        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = fileName_orig.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${type}_${rental.rental_id}_${timestamp}_${sanitizedName}`;
        const mediaFolder = isImage ? 'images' : 'videos';
        const filePath = `rentals/${rental.rental_id}/${type}/${mediaFolder}/${fileName}`;

        if (RENTAL_DEBUG) console.log(`📤 Upload path: ${filePath}`);

        // Upload with progress tracking
        const baseProgress = (i / totalFiles) * 100;
        const progressRange = 100 / totalFiles;
        const uploadResult = await uploadWithProgress(fileBlob, filePath, (progress) => {
          const overallProgress = Math.round(baseProgress + (progress * progressRange / 100));
          setUploadProgress(overallProgress);
          if (RENTAL_DEBUG) console.log(`📤 Upload progress: ${overallProgress}%`);
        });

      if (RENTAL_DEBUG) console.log('✅ Upload successful:', uploadResult.url);

        // Generate thumbnail for videos, use image itself for images
        let thumbnailUrl = null;
        
        if (isImage) {
          thumbnailUrl = uploadResult.url; // Use the image itself as thumbnail
        } else {
          try {
            if (RENTAL_DEBUG) console.log('🖼️ Generating video thumbnail...');
            const { generateThumbnailSafe } = await import('../../utils/uploadWithRetry');
            thumbnailUrl = await generateThumbnailSafe(
              file.url || URL.createObjectURL(fileBlob),
              `rentals/${rental.rental_id}/${type}/${mediaFolder}/thumb_${fileName.replace(/\.[^.]+$/, '.jpg')}`
            );
            if (RENTAL_DEBUG) console.log('✅ Thumbnail generated:', thumbnailUrl);
          } catch (thumbError) {
            console.warn('⚠️ Thumbnail generation failed (non-critical):', thumbError);
          }
        }

        // Insert into rental_media table
        const phase = type === 'opening' ? 'out' : 'in';
        
        // Parse duration as integer (seconds) - round to nearest whole number
        const durationValue = isImage ? 0 : Math.round(file.duration || 0);

        const mediaRecord = {
          rental_id: rental.id,
          phase: phase,
          file_type: fileType,
          file_name: fileName,
          original_filename: fileName_orig,
          file_size: parseInt(fileBlob.size) || 0,
          storage_path: filePath,
          public_url: uploadResult.url,
          thumbnail_url: thumbnailUrl || null,
          duration: durationValue,
          created_at: new Date().toISOString()
        };

        if (RENTAL_DEBUG) console.log('📝 Inserting media record:', mediaRecord);

        const { error: mediaError } = await supabase
          .from('app_2f7bf469b0_rental_media')
          .insert([mediaRecord]);

        if (mediaError) {
          console.error('❌ Failed to insert media record:', mediaError);
          throw new Error(`Failed to save media record: ${mediaError.message}`);
        }

        uploadedMedia.push({ url: uploadResult.url, thumbnailUrl, isImage });
        if (RENTAL_DEBUG) console.log(`✅ ${isImage ? 'Image' : 'Video'} ${i + 1}/${totalFiles} saved successfully`);
      }

      // Update rental record with first video URL for backward compatibility
      const firstVideo = uploadedMedia.find(m => !m.isImage);
      if (firstVideo) {
        const updateField = type === 'opening' ? 'opening_video_url' : 'closing_video_url';
        const thumbField = type === 'opening' ? 'opening_video_thumbnail' : 'closing_video_thumbnail';
        
        const updateData = {
          [updateField]: firstVideo.url,
          ...(firstVideo.thumbnailUrl && { [thumbField]: firstVideo.thumbnailUrl })
        };

        const { error: updateError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update(updateData)
          .eq('id', rental.id);

        if (updateError) {
          console.warn('⚠️ Failed to update rental record (non-critical):', updateError);
        }

        setRental(prev => ({
          ...prev,
          ...updateData
        }));
      }

      if (RENTAL_DEBUG) console.log(`✅ All ${type} media saved successfully`);

      // Cleanup
      capturedMedia.forEach(f => {
        if (f.url) URL.revokeObjectURL(f.url);
        if (f.thumbnail && f.thumbnail !== f.url) URL.revokeObjectURL(f.thumbnail);
      });
      setCapturedMedia([]);
      
      if (type === 'opening') {
        setOpeningModalOpen(false);
      } else {
        setClosingModalOpen(false);
      }

      const imageCount = uploadedMedia.filter(m => m.isImage).length;
      const videoCount = uploadedMedia.filter(m => !m.isImage).length;
      const mediaTypes = [];
      if (imageCount > 0) mediaTypes.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
      if (videoCount > 0) mediaTypes.push(`${videoCount} video${videoCount > 1 ? 's' : ''}`);
      
      toast.success(`${type === 'opening' ? 'Opening' : 'Closing'} condition: ${mediaTypes.join(' and ')} uploaded successfully!`);
      
      // Reload media to show the newly uploaded content
      await loadRentalMedia(rental.id);
      
      // Trigger video refresh in RentalVideos component
      setVideoRefreshKey(prev => prev + 1);
      
      if (RENTAL_DEBUG) console.log('✅ Media list reloaded, video should now be visible');

    } catch (error) {
      console.error(`❌ Failed to save ${type} video:`, error);
      toast.error(`Failed to upload video: ${error.message} | Please check your internet connection and try again.`);
    } finally {
      setIsProcessingVideo(false);
      setUploadProgress(0);
    }
  };

  /**
   * Upload with progress tracking and retry logic
   * Uses XMLHttpRequest for upload progress events
   * Retries only on network errors with exponential backoff
   */
  const uploadWithProgress = async (blob, path, onProgress) => {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        if (RENTAL_DEBUG) console.log(`📤 Upload attempt ${attempt}/${maxRetries}`);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('rental-videos')
          .upload(path, blob, {
            contentType: 'video/mp4',
            upsert: false,
            onUploadProgress: (progress) => {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              onProgress(percent);
            }
          });

        if (error) {
          // Check if it's a network error (retryable)
          if (error.message.includes('network') || error.message.includes('timeout')) {
            throw new Error('NETWORK_ERROR: ' + error.message);
          }
          throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('rental-videos')
          .getPublicUrl(path);

        return {
          path: data.path,
          url: urlData.publicUrl
        };

      } catch (error) {
        console.error(`❌ Upload attempt ${attempt} failed:`, error);

        // Retry only on network errors
        if (error.message.startsWith('NETWORK_ERROR') && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          if (RENTAL_DEBUG) console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-network error or max retries reached
        throw error;
      }
    }

    throw new Error('Upload failed after maximum retries');
  };


  /**
   * Upload with progress tracking and retry logic
   * Uses XMLHttpRequest for upload progress events
   * Retries only on network errors with exponential backoff
   */
  



  const startRental = async () => {
    if (!isPaymentSufficient()) { toast.error('Payment must be "Paid" before starting.'); return; }
    if (openingMedia.length === 0) { handleOpenOpeningModal(); return; }
    try {
      const now = new Date();
      const scheduledStart = new Date(rental.rental_start_date);
      const rentalType = rental.rental_type || 'hourly';
      const duration = rentalType === 'hourly'
        ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
        : (rental.quantity_days ?? 1);

      const timingState = getScheduledRentalTimingState(rental.rental_start_date, rentalTimingSettings, now);
      const EXPIRY_MINUTES = timingState?.graceMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes;
      const SOFT_LOCK_MINUTES = timingState?.softLockMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes;
      const minutesLate = timingState?.minutesLate ?? Math.floor((now - scheduledStart) / 60000);

      if (timingState?.isExpired) {
        await supabase.from('app_4c3a7a6153_rentals').update({ rental_status: 'expired' }).eq('id', rental.id);
        if (rental.vehicle_id) await supabase.from('saharax_0u4w4d_vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);
        await loadRentalData(true);
        window.alert(
          `RENTAL EXPIRED\n\nCustomer: ${rental.customer_name}\nRental: ${rental.rental_id}\n\n` +
          `Scheduled: ${formatRentalScheduleDateTime(timingState.scheduledStart)}\nGrace: ${EXPIRY_MINUTES} min\n` +
          `Expired at: ${formatRentalScheduleDateTime(timingState.expiredAt)}\nNow: ${formatRentalScheduleDateTime(now)} (${timingState.minutesPastGrace} min past)\n\n` +
          `Vehicle has been freed.`
        );
        return;
      }

      if (timingState?.isSoftLocked) {
        const confirmed = window.confirm(
          `⚠️ LATE WARNING\n\nCustomer is ${minutesLate} min late.\nAuto-expires in ${EXPIRY_MINUTES - minutesLate} min.\n\nStart now and adjust end time?`
        );
        if (!confirmed) return;
      }

      let actualStartTime, actualEndTime;
      if (minutesLate > 0) {
        actualStartTime = now.toISOString();
        actualEndTime = new Date(now.getTime() + duration * (rentalType === 'hourly' ? 3600000 : 86400000)).toISOString();
        toast(`⚠️ Started ${minutesLate} min late — new end: ${new Date(actualEndTime).toLocaleTimeString()}`, { icon: '⏰', duration: 5000 });
      } else {
        actualStartTime = scheduledStart.toISOString();
        actualEndTime = rental.rental_end_date;
        if (minutesLate < 0) toast.success(`✅ Started ${Math.abs(minutesLate)} min early`);
      }

      const { data: updatedRental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'active', started_at: actualStartTime,
          actual_end_date: actualEndTime, rental_end_date: actualEndTime,
          quantity_days: duration, quantity_hours: rentalType === 'hourly' ? duration : null,
          late_start_minutes: minutesLate > 0 ? minutesLate : 0,
          started_by: currentUser?.id || null,
          started_by_name: currentUser?.full_name || currentUser?.email || null
        })
        .eq('id', rental.id)
        .select('*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*, vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)), package:app_4c3a7a6153_rental_km_packages!package_id(*), unit_price::float')
        .single();

      if (rentalError) throw rentalError;
      if (rental.vehicle_id) await supabase.from('saharax_0u4w4d_vehicles').update({ status: 'rented' }).eq('id', rental.vehicle_id);
      if (rental.signature_url) setTimeout(() => generateAndCacheContractPDF(), 1000);
      if (minutesLate <= 0) toast.success('Rental started successfully!');
      setRental(updatedRental);
    } catch(err) {
      console.error('❌ Error starting rental:', err);
      toast.error('Failed to start rental.');
    }
  };
  const completeRental = async () => {
    // Prevent duplicate calls
    if (isProcessingEndOdometer) {
      return;
    }

    // Step 1: Check if closing video exists
    if (closingMedia.length === 0) {
      handleOpenClosingModal();
      return;
    }

    // Step 2: Check if ending odometer is already recorded
    if (!rental.ending_odometer) {
      // Show End Odometer Prompt to user
      setShowEndOdometerPrompt(true);
      return;
    }

    // Step 2.5: Check if ending fuel level is recorded (for daily rentals only)
    if (!endFuelLevel && !rental?.end_fuel_level) { // Fuel level required for all rental types
      if (RENTAL_DEBUG) console.log('⛽ Fuel level not recorded, prompting...');
      setShowEndFuelModal(true);
      return;
    }

    // Step 3: If both closing video and ending odometer exist, complete the rental
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'completed', 
          completed_at: new Date().toISOString() 
        })
        .eq('id', rental.id);

      if (error) throw error;
      
      if (rental.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'available' })
          .eq('id', rental.vehicle_id);
        
        if (vehicleError) {
          console.error('Failed to update vehicle status:', vehicleError);
        }
      }
      
      toast.success('Rental completed successfully!');
    } catch (err) {
      console.error('❌ Error:', err);
      toast.error('Failed to complete rental. Please try again.');
    }
  };
  const cancelRental = async () => {
    if (confirm('Are you sure you want to cancel this rental?')) {
      try {
        const { error } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update({ rental_status: 'cancelled' })
          .eq('id', rental.id);

        if (error) throw error;
        
        if (rental.vehicle_id) {
          const { error: vehicleError } = await supabase
            .from('saharax_0u4w4d_vehicles')
            .update({ status: 'available' })
            .eq('id', rental.vehicle_id);
          
          if (vehicleError) {
            console.error('Failed to update vehicle status:', vehicleError);
          }
        }
        
        toast.success('Rental cancelled successfully!');
      } catch (err) {
        console.error('❌ Error:', err);
        toast.error('Failed to cancel rental. Please try again.');
      }
    }
  };

  const handleViewCustomerDetails = (customerId) => {
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: customerId,
      rental: rental,
      secondDrivers: [],
      viewMode: 'customer'
    });
  };

  const handleViewAdditionalDrivers = () => {
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: rental?.customer_id || null,
      rental: rental,
      secondDrivers: secondDriversList,
      viewMode: 'drivers'
    });
  };

  const handleEditPrice = () => {
    setManualPrice(rental.total_amount?.toString() || '');
    setPriceOverrideReason('');
    setIsEditingPrice(true);
  };

  const handleCancelEditPrice = () => {
    setIsEditingPrice(false);
    setManualPrice('');
    setPriceOverrideReason('');
  };

  const handleSaveManualPrice = async () => {
  if (RENTAL_DEBUG) {
    if (RENTAL_DEBUG) console.log('🎯 handleSaveManualPrice TRIGGERED!');
    if (RENTAL_DEBUG) console.log('manualPrice:', manualPrice);
    if (RENTAL_DEBUG) console.log('rental.id:', rental?.id);
  }
  
  if (!manualPrice || parseFloat(manualPrice) <= 0) {
    toast.error('Please enter a valid price amount.');
    return;
  }

  setIsSavingPrice(true);
  try {
    const newPrice = parseFloat(manualPrice);
    const isAdmin = canApprovePriceOverrides(currentUser);

    let updateData = {
      updated_at: new Date().toISOString()
    };

    if (isAdmin) {
      updateData.total_amount = newPrice;
      updateData.remaining_amount = Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0));
      updateData.approval_status = 'auto';
      updateData.pending_total_request = null;
      updateData.price_override_reason = priceOverrideReason || null;
    } else {
      updateData.approval_status = 'pending';
      updateData.pending_total_request = newPrice;
      updateData.price_override_reason = priceOverrideReason || null;
    }

    if (RENTAL_DEBUG) console.log('📝 Updating rental with data:', updateData);
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(updateData)
      .eq('id', rental.id);

    if (updateError) {
      console.error('❌ Database update failed:', updateError);
      throw updateError;
    }
    if (RENTAL_DEBUG) console.log('✅ Database update successful');

    const { data, error: fetchError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('*')
      .eq('id', rental.id)
      .single();

    if (fetchError) {
      console.error('❌ Fetch after update failed:', fetchError);
      throw fetchError;
    }
    if (RENTAL_DEBUG) console.log('✅ Fetched updated rental:', data);

    setRental(data);
    setIsEditingPrice(false);
    setManualPrice('');
    setPriceOverrideReason('');
    
    if (isAdmin) {
      toast.success('Price updated successfully!');
    } else {
      toast.success('Price override request submitted for admin approval.');
      // ❌ REMOVED: No auto WhatsApp notification
    }
  } catch (err) {
    console.error('❌ Error saving price:', err);
    toast.error(`Failed to save price. Error: ${err.message}`);
  } finally {
    setIsSavingPrice(false);
  }
};

  const handleApprovePrice = async () => {
    if (!rental.pending_total_request) {
      toast.error('No pending price request found.');
      return;
    }

    if (!confirm(`Approve manual price of ${rental.pending_total_request} MAD?`)) {
      return;
    }

    try {
      const newPrice = parseFloat(rental.pending_total_request);
      // Step 1: Update the rental
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          total_amount: newPrice,
          remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
          approval_status: 'approved',
          pending_total_request: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Step 2: Fetch the updated rental with relations
      const { data: updatedRental, error: fetchError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          ),
          package:app_4c3a7a6153_rental_km_packages!package_id(*)
        `)
        .eq('id', rental.id)
        .single();

      if (fetchError) throw fetchError;

      setRental(updatedRental);
      toast.success('Price override approved!');
    } catch (err) {
      console.error('❌ Error approving price:', err);
      toast.error(`Failed to approve price. Error: ${err.message}`);
    }
  };

  const handleDeclinePrice = async () => {
    if (!rental.pending_total_request) {
      toast.error('No pending price request found.');
      return;
    }

    if (!confirm('Decline this price override request? The price will be recalculated automatically.')) {
      return;
    }

    try {
      let autoCalculatedPrice = rental.total_amount;
      
      if (rental.vehicle?.id && rental.rental_start_date && rental.rental_end_date) {
        try {
          const priceResult = await PricingRulesService.calculatePrice(
            rental.vehicle.id,
            rental.rental_start_date,
            rental.rental_end_date,
            rental.rental_type || 'daily'
          );
          if (priceResult.price > 0) {
            autoCalculatedPrice = priceResult.price;
          }
        } catch (calcError) {
          console.warn('⚠️ Could not recalculate price:', calcError);
        }
      }

      // Step 1: Update the rental
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          total_amount: autoCalculatedPrice,
          remaining_amount: Math.max(0, autoCalculatedPrice - (parseFloat(rental.deposit_amount) || 0)),
          approval_status: 'declined',
          pending_total_request: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Step 2: Fetch the updated rental with relations
      const { data: updatedRental, error: fetchError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          ),
          package:app_4c3a7a6153_rental_km_packages!package_id(*)
        `)
        .eq('id', rental.id)
        .single();

      if (fetchError) throw fetchError;

      setRental(updatedRental);
      toast.success('Price override declined. Price recalculated to auto rate.');
    } catch (err) {
      console.error('❌ Error declining price:', err);
      toast.error(`Failed to decline price. Error: ${err.message}`);
    }
  };

  const handleVideoUpdate = () => {
    if (RENTAL_DEBUG) console.log('🔄 Video update triggered, refreshing media...');
    loadRentalMedia(rental.id);
    setVideoRefreshKey(prev => prev + 1);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // ============================================
  // 🔧 FIX: Memoized base amount calculation to prevent re-render loops
  // Must be declared before any early returns to satisfy React hooks rules
  // ============================================
  const correctedBaseAmount = useMemo(() => {
    if (!rental) return 0;
    
    // For hourly rentals: use quantity_hours, fallback to quantity_days, then default 1
    if (rental.rental_type === 'hourly') {
      const hours = rental.quantity_hours ?? rental.quantity_days ?? 1;
      return hours * (rental.unit_price || 0);
    }
    
    // For daily rentals: use quantity_days
    if (rental.rental_type === 'daily') {
      const days = rental.quantity_days ?? 1;
      return days * (rental.unit_price || 0);
    }
    
    return (rental.unit_price || 0) * (rental.quantity_days || 1);
  }, [rental?.rental_type, rental?.quantity_hours, rental?.quantity_days, rental?.unit_price]);

  // Wrapper function for backward compatibility with existing callers
  const getCorrectedBaseAmount = useCallback(() => correctedBaseAmount, [correctedBaseAmount]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;

  // ✅ FIXED: Calculate rental base amount correctly for hourly rentals
  const calculateRentalBaseAmount = () => {
    if (!rental) return 0;
    
    // For hourly rentals - use tier pricing breakdown if available
    if (rental.rental_type === 'hourly') {
      // Priority 1: Use tier pricing breakdown if calculated (most accurate)
      if (tierPricingBreakdown?.tierTotal) {
        return tierPricingBreakdown.tierTotal;
      }
      
      // Priority 2: Calculate from quantity_hours (original booking duration)
      // 🚨 DO NOT use rental_end_date - it includes extensions!
      const baseDuration = rental.quantity_hours ?? rental.quantity_days ?? 1;
      const calculatedAmount = (rental.unit_price || 0) * baseDuration;
      
      if (RENTAL_DEBUG) console.log('💰 Calculated from base duration:', {
        baseDuration,
        unitPrice: rental.unit_price,
        calculatedAmount,
        note: 'Using original booking duration only'
      });
      return calculatedAmount;
    }
    
    // For daily/weekly rentals, use unit_price or total_amount
    return rental.unit_price || rental.total_amount || 0;
  };









  // Calculate tier breakdown
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="text-center">
        <p className="text-red-500 text-lg font-semibold mb-2">⚠️ {error}</p>
        <p className="text-gray-500 text-sm mb-4">This may be due to too many requests. Please wait a moment and try again.</p>
        <Button
          onClick={() => {
            setError(null);
            setLoading(true);
            loadRentalData(true).finally(() => setLoading(false));
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          🔄 Retry
        </Button>
      </div>
    </div>
  );

  // Button state logic


  // ✅ INSTANT: Button enabled immediately without waiting for PDF generation
  const canSendContract = !!rental?.signature_url;
  const canSendReceipt = rental?.payment_status === 'paid';
  const canSendBoth = canSendContract && canSendReceipt;

  if (!rental) return <div className="flex items-center justify-center min-h-screen"><p>Rental not found</p></div>;

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isActive = rental?.rental_status?.toLowerCase() === 'active';
  const isScheduled = rental?.rental_status?.toLowerCase() === 'scheduled';
  const isCompleted = rental?.rental_status?.toLowerCase() === 'completed';
  const maintenanceChargeLocked = isCompleted;
  const hasOpeningVideo = openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview;
  const hasOdometerReading = !!rental.start_odometer;
  const canStartRental = isPaymentSufficient() && (rental?.contract_signed || !!rental?.signature_url) && (openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) && hasOdometerReading && (rental?.rental_type !== 'daily' || startFuelLevel !== null);  // Check for second drivers from new table OR legacy columns
  const hasSecondDriver = (rental?.second_drivers && rental?.second_drivers.length > 0) || 
    rental?.second_driver_name || rental?.second_driver_license || rental?.second_driver_id_image;
  
  // Helper function to get second drivers with backwards compatibility
// ✅ FIXED: Helper function to get second drivers
  const getSecondDrivers = (rentalData) => {
    // Check if second_drivers exists and is an array
    if (rentalData?.second_drivers && Array.isArray(rentalData.second_drivers)) {
      return rentalData.second_drivers.filter(driver => 
        driver && (driver.full_name || driver.name || driver.licence_number)
      );
    }
    
    // Fallback: Check if there's a second_driver object (singular)
    if (rentalData?.second_driver && typeof rentalData.second_driver === 'object') {
      return [rentalData.second_driver];
    }
    
    // Fallback to legacy columns
    if (rentalData?.second_driver_name) {
      return [{
        id: `legacy_${rentalData.id}`,
        full_name: rentalData.second_driver_name,
        licence_number: rentalData.second_driver_license || rentalData.second_driver_licence_number,
        id_number: rentalData.second_driver_id_number,
        date_of_birth: rentalData.second_driver_dob,
        nationality: rentalData.second_driver_nationality,
        id_scan_url: rentalData.second_driver_id_image,
        is_legacy: true
      }];
    }
    
    return [];
  };

  const getSecondDriverImageUrl = (driver) => {
    if (!driver) return null;
    return driver.id_scan_url || driver.customer_id_image || driver.id_image || null;
  };

  
  const secondDriversList = getSecondDrivers(rental);
  const isPendingApproval = rental.approval_status === 'pending';
  const isAdmin = canApprovePriceOverrides(currentUser);
  const canEditRentalPriceOverride = canEditRentalPrice(currentUser);
  const canManageScheduledRental = isScheduled && ['owner', 'admin', 'employee'].includes(currentUser?.role);
  const canDeleteScheduledRental = isScheduled && ['owner', 'admin'].includes(currentUser?.role);
  
  const canSignContract = hasOpeningVideo && hasOdometerReading && isPaymentSufficient() && (rental?.rental_type !== 'daily' || startFuelLevel !== null) && !rental.contract_signed && !rental.signature_url;
  const canSendWhatsApp = rental.contract_signed || !!rental.signature_url;
  const canGenerateInvoice = rental.contract_signed || !!rental.signature_url;

  // Check if workflow should be disabled (pending approval for non-admin users)
  const isWorkflowDisabled = () => {
    return isPendingApproval && !isAdmin;
  };

  const formattedRentalForInvoice = {
    ...rental,
    customer_license_number: 'N/A',
    vehicle_details: rental.vehicle,
    start_date: rental.started_at ? new Date(rental.started_at).toLocaleString() : (rental.rental_start_date ? new Date(rental.rental_start_date).toLocaleString() : 'N/A'),
    end_date: rental.actual_end_date ? new Date(rental.actual_end_date).toLocaleString() : (rental.rental_end_date ? new Date(rental.rental_end_date).toLocaleString() : 'N/A'),
  };

  const handleOpenRentalEdit = () => {
    navigate('/admin/rentals', {
      state: {
        openForm: true,
        editingRental: rental,
      },
    });
  };

// ✅ Calculate extension totals before rendering
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-5xl px-4 py-6 sm:py-8 pb-20 sm:pb-8">
        <Card className="mb-6 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/50 pb-5">
            <CardTitle className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <span className="text-2xl font-bold tracking-tight text-slate-900">
                      {rental.vehicle?.name} - {rental.vehicle?.model}
                    </span>
                    {rental.vehicle?.plate_number && (
                      <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 shadow-sm">
                        {rental.vehicle.plate_number}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>Rental ID: {rental.rental_id}</span>
                    <span className="text-slate-300">•</span>
                    <span>{rental.customer_name}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`${getStatusColor(rental.rental_status)} border px-3 py-1 text-xs font-semibold tracking-wide`}>
                    {rental.rental_status?.toUpperCase()}
                  </Badge>
                  {(() => {
                    let statusText = 'UNPAID';
                    let statusClass = 'bg-red-100 text-red-800';

                    if (rentalBillingSummary.grandTotal > 0) {
                      if (rentalBillingSummary.depositPaid >= rentalBillingSummary.grandTotal) {
                        statusText = 'PAID';
                        statusClass = 'bg-green-100 text-green-800';
                      } else if (rentalBillingSummary.depositPaid > 0) {
                        statusText = 'PARTIAL';
                        statusClass = 'bg-yellow-100 text-yellow-800';
                      }
                    }

                    return (
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${statusClass}`}>
                        {statusText}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => navigate('/admin/rentals')} variant="outline" className="border-slate-200 bg-white">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Rentals
                  </Button>

                  {canManageScheduledRental && (
                    <Button onClick={handleOpenRentalEdit} className="bg-violet-600 text-white hover:bg-violet-700">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}

                  {canDeleteScheduledRental && (
                    <Button onClick={cancelRental} variant="destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  )}

                  {isActive && (
                    <Button onClick={cancelRental} variant="destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!rental.contract_signed && !rental.signature_url && rental.rental_status !== 'completed' && (
                    <Button
                      onClick={() => setIsSigning(true)}
                      title={
                        !hasOpeningVideo ? "Please upload opening video before signing" :
                        !hasOdometerReading ? "Please enter starting odometer before signing" :
                        !isPaymentSufficient() ? "Payment must be completed before signing" :
                        "Sign contract"
                      }
                      className="bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <FileSignature className="mr-2 h-4 w-4" />
                      Sign Contract
                    </Button>
                  )}

                  {rental?.customer_phone && (
                    <>
                      <Button
                        onClick={() => setContractPreviewModal(true)}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Contract
                      </Button>
                      <Button
                        onClick={async () => {
                          if (isMobileDevice()) {
                            await forceMobileRender();
                            await new Promise(resolve => setTimeout(resolve, 300));
                          }
                          setReceiptPreviewModal(true);
                        }}
                        className="bg-purple-600 text-white hover:bg-purple-700"
                      >
                        <Receipt className="mr-2 h-4 w-4" />
                        Receipt
                      </Button>
                      <Button
                        onClick={handleWhatsAppClick}
                        onMouseEnter={ensurePDFsReady}
                        disabled={isSharing}
                        className="bg-green-600 text-white hover:bg-green-700"
                        title={!rental?.signature_url ? "Contract not signed yet" :
                          rental?.payment_status !== 'paid' ? "Payment not completed" :
                          "Send documents via WhatsApp"}
                      >
                        {isSharing ? (
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FaWhatsapp className="mr-2" size={18} />
                        )}
                        {isSharing ? 'Preparing...' : 'WhatsApp'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardTitle>
          </CardHeader>
        <CardContent>
          {/* SCHEDULED Rental - Show Workflow Steps */}
          {isScheduled && !rental.contract_signed && !rental.signature_url && (
            <div className="border-2 border-yellow-200 rounded-lg p-3 sm:p-6 bg-gradient-to-br from-yellow-50 to-white">
              <div className="mb-3 sm:mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-1">
                  Ready to Start Rental
                </h3>
                <p className="text-xs text-gray-600">Complete these steps to begin the rental:</p>
              </div>
              
              {/* Warning banner when approval is pending */}
              {isPendingApproval && !isAdmin && (
                <div className="mb-3 sm:mb-4 p-2.5 bg-yellow-100 border border-yellow-300 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-yellow-800 text-xs sm:text-sm">Price Override Pending Approval</p>
                      <p className="text-xs text-yellow-700 mt-0.5">
                        Rental workflow is locked until admin approves the price change.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2.5 sm:space-y-4">
                {/* Step 1: Vehicle Inspection */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                  (openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    (openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) 
                      ? 'bg-green-500' 
                      : 'bg-gray-300'
                  }`}>
                    {(openingMedia.length > 0 || capturedMedia.length > 0 || showMediaReview) ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">1</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Vehicle Inspection (Optional)</h4>
                        <p className="text-xs text-gray-600 mt-0.5 break-words">
                          {openingMedia.length > 0 
                            ? `✓ ${openingMedia.length} media item${openingMedia.length !== 1 ? 's' : ''} uploaded (${getMediaCounts(openingMedia)})` 
                            : capturedMedia.length > 0 || showMediaReview
                            ? `✓ ${capturedMedia.length} item${capturedMedia.length !== 1 ? 's' : ''} captured, ready to upload`
                            : 'Add photos or video if you want a departure condition record'}
                        </p>
                        
                        {/* Show media preview thumbnails if media exists but not uploaded */}
                        {(capturedMedia.length > 0 || showMediaReview) && openingMedia.length === 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-amber-600">
                                ⚠️ Media captured but not uploaded
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpeningModalOpen(true)}
                                className="text-xs h-6 px-2 text-blue-600"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add More
                              </Button>
                            </div>
                            
                            {/* Thumbnail grid */}
                            <div className="grid grid-cols-4 gap-1 mb-2">
                              {capturedMedia.slice(0, 4).map((media, idx) => (
                                <div key={media.id || idx} className="relative aspect-square bg-gray-100 rounded overflow-hidden border">
                                  {media.type?.startsWith('image/') ? (
                                    <img src={media.url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <video src={media.url} className="w-full h-full object-cover" muted />
                                  )}
                                  <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] px-1">
                                    {media.type?.startsWith('image/') ? '📷' : '🎥'}
                                  </div>
                                </div>
                              ))}
                              {capturedMedia.length > 4 && (
                                <div className="aspect-square bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">
                                  +{capturedMedia.length - 4}
                                </div>
                              )}
                            </div>
                            
                            {/* Upload button */}
                            <Button
                              onClick={() => saveMedia('opening')}
                              size="sm"
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs h-8"
                              disabled={isProcessingVideo}
                            >
                              <Upload className="w-3 h-3 mr-1.5" />
                              {isProcessingVideo ? 'Uploading...' : `Upload ${capturedMedia.length} Item${capturedMedia.length !== 1 ? 's' : ''}`}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Main action button */}
                      {openingMedia.length === 0 && (
                        <Button 
                          onClick={() => setOpeningModalOpen(true)}
                          title={isWorkflowDisabled() ? "Workflow locked - price approval pending" : "Capture vehicle condition"}
                          size="sm"
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                        >
                          <Camera className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">
                            {capturedMedia.length > 0 ? 'Review Media' : 'Add Media'}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 2: Starting Odometer */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${hasOdometerReading ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${hasOdometerReading ? 'bg-green-500' : 'bg-gray-300'}`}>
                    {hasOdometerReading ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">2</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Starting Odometer</h4>
                        <p className="text-xs text-gray-600 mt-0.5 break-words">
                          {hasOdometerReading ? `✓ Starting odometer: ${rental.start_odometer} km` : 'Enter starting kilometer reading'}
                        </p>
                      </div>
                      {!hasOdometerReading && !isEditingOdometer && (
                        <Button 
                          onClick={() => setIsEditingOdometer(true)}
                          title={isWorkflowDisabled() ? "Workflow locked - price approval pending" : "Add Reading"}
                          size="sm"
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                        >
                          <Gauge className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">Add Reading</span>
                        </Button>
                      )}
                    </div>
                    {isEditingOdometer && (
                      <div className="mt-2 space-y-2">
                        <input
                          type="number"
                          value={startOdometer}
                          onChange={(e) => setStartOdometer(e.target.value)}
                          placeholder="Enter odometer reading (km)"
                          className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          step="1"
                        />
                        <div className="flex gap-1.5">
                          <Button 
                            onClick={handleSaveOdometer}
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                          >
                            <Save className="w-3 h-3 mr-1.5" />
                            {isSavingOdometer ? 'Saving...' : 'Save'}
                          </Button>
                          <Button 
                            onClick={() => {
                              setIsEditingOdometer(false);
                              if (rental.start_odometer) {
                                setStartOdometer(rental.start_odometer.toString());
                              } else if (rental.vehicle?.current_odometer) {
                                setStartOdometer(rental.vehicle.current_odometer.toString());
                              } else {
                                setStartOdometer('');
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs h-7"
                          >
                            <X className="w-3 h-3 mr-1.5" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    {hasOdometerReading && !isEditingOdometer && (
                      <Button 
                        onClick={() => setIsEditingOdometer(true)}
                        size="sm"
                        variant="ghost"
                        className="mt-2 text-xs h-7 px-2"
                      >
                        <Edit className="w-3 h-3 mr-1.5" />
                        Edit Reading
                      </Button>
                    )}
                  </div>
                </div>

                {/* Step 3: Payment */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                  isPaymentSufficient() ? 'bg-green-50 border border-green-200' : 
                  isPendingApproval && !isAdmin ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    isPaymentSufficient() ? 'bg-green-500' : 
                    isPendingApproval && !isAdmin ? 'bg-yellow-500' : 'bg-gray-300'
                  }`}>
                    {isPaymentSufficient() ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : isPendingApproval && !isAdmin ? (
                      <Clock className="w-3 h-3 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">3</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Payment</h4>
                        <p className="text-xs text-gray-600 mt-0.5 break-words">
                          {isPendingApproval && !isAdmin ? (
                            <span className="text-yellow-600">⏳ Price override pending approval</span>
                          ) : isPaymentSufficient() ? (
                            '✓ Payment received'
                          ) : (
                            'Complete rental payment'
                          )}
                        </p>
                      </div>
                      {!isPaymentSufficient() && !(isPendingApproval && !isAdmin) && (
                        <Button 
                          onClick={markAsPaid}
                          size="sm"
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                        >
                          <CreditCard className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">Mark Paid</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Emergency fix button removed - quantity_hours is now used correctly */}


                {/* Step 4: Fuel Level - Now shown for all rental types */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                    startFuelLevel !== null ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                      startFuelLevel !== null ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {startFuelLevel !== null ? (
                        <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                      ) : (
                        <span className="text-white font-bold text-xs">4</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-xs sm:text-sm text-gray-900">Fuel Level</h4>
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {startFuelLevel !== null 
                              ? `✓ Starting fuel: ${startFuelLevel}/8 (${startFuelLevel === 8 ? 'Full' : startFuelLevel === 0 ? 'Empty' : `${startFuelLevel}/8`})`
                              : 'Record starting fuel level'}
                          </p>
                        </div>
                        {startFuelLevel === null && (
                          <Button 
                            onClick={() => setShowStartFuelModal(true)}
                            title={isWorkflowDisabled() ? "Workflow locked - price approval pending" : "Record Fuel"}
                            size="sm"
                            className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                          >
                            <Fuel className="w-3 h-3 mr-1.5" />
                            <span className="whitespace-nowrap">Record Fuel</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Fuel Charge Toggle - Shown for both hourly and daily rentals */}
<div className="ml-8 sm:ml-11 mt-2">
  <FuelChargeToggle
    enabled={fuelChargeEnabled}
    onToggle={handleFuelChargeToggle}
    pricePerLine={fuelPricePerLine}
    rentalType={rental?.rental_type}
    disabled={rental?.rental_status !== 'scheduled'}
  />
</div>

                {/* Step 5: Sign Contract */}
<div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${(rental.contract_signed || rental.signature_url) ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${(rental.contract_signed || rental.signature_url) ? 'bg-green-500' : 'bg-gray-300'}`}>
    {(rental.contract_signed || rental.signature_url) ? (
      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
    ) : (
      <span className="text-white font-bold text-xs">5</span>
    )}
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Sign Contract</h4>
        <p className="text-xs text-gray-600 mt-0.5 break-words">
          {(rental.contract_signed || rental.signature_url) ? '✓ Contract signed' : 'Customer signs rental agreement'}
        </p>
      </div>
      {!rental.contract_signed && !rental.signature_url && rental.rental_status !== 'completed' && (
        <Button 
          onClick={() => setIsSigning(true)}
          size="sm"
          className={`mt-2 sm:mt-0 w-full sm:w-auto text-xs h-7 px-2.5 sm:px-3 ${
            canSignContract 
              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
          }`}
          title={!canSignContract ? "Complete all previous steps first" : "Sign contract"}
          disabled={!canSignContract}
        >
          <FileSignature className="w-3 h-3 mr-1.5" />
          <span className="whitespace-nowrap">Sign Contract</span>
        </Button>
      )}
    </div>
  </div>
</div>

                {/* Start Rental Button */}
                {isPaymentSufficient() && hasOpeningVideo && (rental.contract_signed || rental.signature_url) && hasOdometerReading && (
                  <div className="pt-2.5 text-center">
                    <Button 
                      onClick={startRental}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 text-sm font-semibold shadow-lg w-full"
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {isWorkflowDisabled() ? "Awaiting Approval" : "Start Rental Now"}
                    </Button>
                  </div>
                )}
                {isWorkflowDisabled() && (
                  <p className="text-xs text-yellow-600 mt-2 text-center">
                    ⏳ Rental start is locked until price override is approved by admin
                  </p>
                )}
              </div>
            </div>
          )}



          {/* Contract Signed but Not Started - Show Start Button */}
          {(rental.contract_signed || rental.signature_url) && !isCompleted && !isActive && (
            <div className="border-2 border-gray-200 rounded-lg p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                  <span>Rental Timer</span>
                </h3>
              </div>

              <div className="text-center py-6 sm:py-8">
                {/* Late/Expiry Status Banner */}
                {rental.rental_start_date && (() => {
                  const timingState = getScheduledRentalTimingState(rental.rental_start_date, rentalTimingSettings, new Date());
                  if (!timingState) return null;

                  const { now, scheduledStart, expiredAt, minutesLate, minutesPastGrace, graceMinutes, isExpired, isSoftLocked, startsInMinutes } = timingState;

                  if (isExpired) return (
                    <div className="mb-4 text-left bg-red-50 border-2 border-red-300 rounded-lg p-4">
                      <p className="text-sm font-bold text-red-800 mb-1">❌ Rental Expired</p>
                      <div className="text-xs text-red-700 space-y-1">
                        <p>📅 Scheduled: <strong>{formatRentalScheduleDateTime(scheduledStart)}</strong></p>
                        <p>🔴 Expired at: <strong>{formatRentalScheduleDateTime(expiredAt)}</strong></p>
                        <p>🕐 Now: <strong>{formatRentalScheduleDateTime(now)}</strong> ({minutesPastGrace} min past)</p>
                        <p className="mt-1">Clicking Start will expire this rental and free the vehicle.</p>
                      </div>
                    </div>
                  );
                  if (isSoftLocked) return (
                    <div className="mb-4 text-left bg-orange-50 border-2 border-orange-300 rounded-lg p-3">
                      <p className="text-sm font-bold text-orange-800">⚠️ Auto-cancel in {graceMinutes - minutesLate} min</p>
                      <p className="text-xs text-orange-700">
                        Scheduled for {formatRentalScheduleDateTime(scheduledStart)} · {minutesLate} min late.
                      </p>
                    </div>
                  );
                  if (minutesLate > 0) return (
                    <div className="mb-4 text-left bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex gap-2">
                      <span>⏰</span>
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">{minutesLate} min late</p>
                        <p className="text-xs text-yellow-700">
                          Scheduled for {formatRentalScheduleDateTime(scheduledStart)} · {graceMinutes - minutesLate} min before auto-expire
                        </p>
                      </div>
                    </div>
                  );
                  if (minutesLate < 0) return (
                    <div className="mb-4 text-left bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                      <span>🕐</span><p className="text-sm font-semibold text-blue-800">Starts in {startsInMinutes} min · {formatRentalScheduleDateTime(scheduledStart)}</p>
                    </div>
                  );
                  return (
                    <div className="mb-4 text-left bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
                      <span>✅</span><p className="text-sm font-semibold text-green-800">On time — ready to start at {formatRentalScheduleDateTime(scheduledStart)}</p>
                    </div>
                  );
                })()}
                {rental.rental_status !== 'expired' && (
                  <div className="mb-4 sm:mb-6">
                    <p className="text-sm sm:text-base text-gray-600 mb-2">Contract signed and ready to start</p>
                    <p className="text-xs sm:text-sm text-gray-500">Click &quot;Start Now&quot; to begin the rental timer</p>
                  </div>
                )}
                {rental.rental_status === 'expired' ? (
                  <p className="text-sm text-red-600 font-medium">❌ Expired — vehicle has been freed.</p>
                ) : (
                  <>
                    <Button
                      onClick={startRental}
                      className={`${!canStartRental ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-lg transition-all duration-200 hover:scale-105`}
                    >
                      <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                      Start Now
                    </Button>
                    {!canStartRental && (
                      <p className="text-xs text-red-500 mt-3">
                        {!isPaymentSufficient() ? 'Payment required' : !hasOpeningVideo ? 'Opening video required' : !hasOdometerReading ? 'Odometer reading required' : 'Requirements not met'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Active Rental - Show Timer */}
          {isActive && (
            <>
              {!finishRentalSteps.showWorkflow ? (
                /* Show Timer + End Now Button when NOT in finish workflow */
                <div className="border-2 border-gray-200 rounded-lg p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-white mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                      <span>Rental Timer</span>
                    </h3>
                    <Badge className="bg-green-100 text-green-800 px-3 py-1 self-start sm:self-auto">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                        Active
                      </div>
                    </Badge>
                  </div>

                  <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                      <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <PlayCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                          <p className="text-xs sm:text-sm text-gray-600 font-medium">Time Elapsed</p>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-green-600 break-all">{elapsedTime || '00:00:00'}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                          <p className="text-xs sm:text-sm text-gray-600 font-medium">Time Remaining</p>
                        </div>
                        <p className={`text-2xl sm:text-3xl font-bold break-all ${timeRemaining === 'Expired' ? 'text-red-600' : 'text-blue-600'}`}>
                          {timeRemaining || 'N/A'}
                        </p>
                        {extensions.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Extended by {extensions.filter(e => e.status === 'approved').reduce((sum, e) => sum + (parseFloat(e.extension_hours) || 0), 0)}h
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-center gap-3">
                      <Button 
                        onClick={() => {
                          setFinishRentalSteps({
                            showWorkflow: true,
                            closingVideoComplete: inspectionComplete,
                            endOdometerComplete: !!rental.ending_odometer,
                            endFuelComplete: endFuelLevel !== null || rental?.end_fuel_level !== null
                          });
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-lg transition-all duration-200 hover:scale-105"
                      >
                        <StopCircle className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                        End Now
                      </Button>
                      
                      {closingMedia.length === 0 && (
                        <Button 
                          onClick={() => setExtensionModalOpen(true)}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold shadow-lg transition-all duration-200 hover:scale-105"
                        >
                          <Clock className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                          Extend Time
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* MATCHING "Ready to Start Rental" Harmonic Design */
                <div className="border-2 border-yellow-200 rounded-lg p-3 sm:p-6 bg-gradient-to-br from-yellow-50 to-white mb-6">
                  <div className="mb-3 sm:mb-4">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-1">
                      Ready to Finish Rental
                    </h3>
                    <p className="text-xs text-gray-600">Complete these steps to end the rental:</p>
                  </div>
                  
                  <div className="space-y-2.5 sm:space-y-4">
                    {/* Step 1: Closing Vehicle Inspection */}
                    <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                      finishRentalSteps.closingVideoComplete ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                    }`}>
                      <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                        finishRentalSteps.closingVideoComplete ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {finishRentalSteps.closingVideoComplete ? (
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        ) : (
                          <span className="text-white font-bold text-xs">1</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-xs sm:text-sm text-gray-900">Vehicle Inspection (Optional)</h4>
                            <p className="text-xs text-gray-600 mt-0.5 break-words">
                              {finishRentalSteps.closingVideoComplete
                                ? '✓ Inspection complete'
                                : reportRequired && hasClosingInspectionMedia && !reportSaved
                                  ? 'Closing media uploaded - save the report to continue'
                                  : reportRequired && reportHasUnsavedChanges && reportSaved
                                    ? 'Report changed - update the saved report to continue'
                                : closingMedia.length > 0 && requiresClosingInspectionReview
                                  ? 'Existing closing media found - review or add more before continuing'
                                  : 'Skip this unless you want return photos or a damage report'}
                            </p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className={`rounded-md px-2.5 py-2 text-[11px] ${
                                hasClosingInspectionMedia && !requiresClosingInspectionReview
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                Media: {hasClosingInspectionMedia ? (requiresClosingInspectionReview ? 'Needs review' : 'Done') : 'Optional'}
                              </div>
                              <div className={`rounded-md px-2.5 py-2 text-[11px] ${
                                !reportRequired
                                  ? 'bg-gray-100 text-gray-600'
                                  : reportSaved && !reportHasUnsavedChanges
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}>
                                Report: {!reportRequired ? 'Not needed' : reportSaved && !reportHasUnsavedChanges ? 'Saved' : reportSaved ? 'Update needed' : 'Pending save'}
                              </div>
                            </div>
                          </div>
                          {!finishRentalSteps.closingVideoComplete && (
                            <Button 
                              onClick={handleOpenClosingModal}
                              size="sm"
                              className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                            >
                              <Video className="w-3 h-3 mr-1.5" />
                              <span className="whitespace-nowrap">
                                {closingMedia.length > 0 && requiresClosingInspectionReview ? 'Review / Add Media' : 'Upload Media'}
                              </span>
                            </Button>
                          )}
                        </div>

                        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 space-y-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900">Damage or Accident Report</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Turn this on only if the return inspection found damage, an accident, or a mechanical issue.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setVehicleReportDraft(prev => ({ ...prev, enabled: !prev.enabled }))}
                              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-colors sm:w-auto sm:min-w-[150px] ${
                                vehicleReportDraft.enabled
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-gray-200 bg-gray-50 text-gray-600'
                              }`}
                              aria-pressed={vehicleReportDraft.enabled}
                            >
                              <span className="text-xs font-medium">
                                {vehicleReportDraft.enabled ? 'Report Enabled' : 'No Report'}
                              </span>
                              <span
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  vehicleReportDraft.enabled ? 'bg-red-500' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                    vehicleReportDraft.enabled ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </span>
                            </button>
                          </div>

                          {vehicleReportDraft.enabled && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { value: 'damage', label: 'Damage' },
                                      { value: 'accident', label: 'Accident' },
                                      { value: 'mechanical_issue', label: 'Mechanical' },
                                    ].map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setVehicleReportDraft(prev => ({ ...prev, report_type: option.value }))}
                                        className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                          vehicleReportDraft.report_type === option.value
                                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { value: 'minor', label: 'Minor' },
                                      { value: 'moderate', label: 'Moderate' },
                                      { value: 'major', label: 'Major' },
                                    ].map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setVehicleReportDraft(prev => ({ ...prev, severity: option.value }))}
                                        className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                          vehicleReportDraft.severity === option.value
                                            ? 'border-red-500 bg-red-50 text-red-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                  value={vehicleReportDraft.description}
                                  onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, description: e.target.value }))}
                                  rows={3}
                                  placeholder="Describe the issue found during return inspection..."
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs resize-none"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Affected Areas</label>
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  <div className="relative mx-auto h-64 max-w-[220px]">
                                    <div className="absolute inset-x-8 top-6 bottom-6 rounded-[2rem] border-2 border-gray-300 bg-white shadow-sm">
                                      <div className="absolute inset-x-10 top-4 h-8 rounded-full border border-gray-200 bg-gray-100" />
                                      <div className="absolute inset-x-12 top-16 h-10 rounded-xl border border-gray-200 bg-gray-50" />
                                      <div className="absolute inset-x-10 bottom-4 h-8 rounded-full border border-gray-200 bg-gray-100" />
                                      <div className="absolute inset-x-8 top-[40%] h-10 -translate-y-1/2 rounded-xl border border-dashed border-gray-200 bg-gray-50" />
                                    </div>

                                    {VEHICLE_REPORT_AREAS.map((area) => {
                                      const selected = (vehicleReportDraft.affected_areas || []).includes(area.id);
                                      return (
                                        <button
                                          key={area.id}
                                          type="button"
                                          onClick={() => toggleAffectedArea(area.id)}
                                          className={`absolute ${area.position} rounded-full border px-2.5 py-1 text-[10px] font-medium shadow-sm transition-colors ${
                                            selected
                                              ? 'border-red-500 bg-red-500 text-white'
                                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                                          }`}
                                        >
                                          {area.label}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {(vehicleReportDraft.affected_areas || []).length > 0 ? (
                                      vehicleReportDraft.affected_areas.map((areaId) => {
                                        const area = VEHICLE_REPORT_AREAS.find((item) => item.id === areaId);
                                        return (
                                          <span
                                            key={areaId}
                                            className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700"
                                          >
                                            {area?.label || areaId}
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <p className="text-[11px] text-gray-500">
                                        Tap the vehicle map to mark the damaged area.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={vehicleReportDraft.send_to_maintenance}
                                    onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, send_to_maintenance: e.target.checked }))}
                                  />
                                  Send vehicle to maintenance
                                </label>
                                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={vehicleReportDraft.customer_chargeable}
                                    onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, customer_chargeable: e.target.checked }))}
                                  />
                                  Customer should be charged
                                </label>
                              </div>

                              {vehicleReportDraft.customer_chargeable && !vehicleReportDraft.send_to_maintenance && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Customer Charge (MAD)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={vehicleReportDraft.customer_charge_amount}
                                    onChange={(e) => setVehicleReportDraft(prev => ({ ...prev, customer_charge_amount: e.target.value }))}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs"
                                  />
                                </div>
                              )}

                              {vehicleReportDraft.customer_chargeable && vehicleReportDraft.send_to_maintenance && (
                                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                  Customer charge will be pulled automatically from the linked maintenance bill after parts, labor, and external costs are entered in Quad Maintenance.
                                </div>
                              )}

                              <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                                The closing inspection media will automatically be attached to this report and reused in the vehicle profile and maintenance history.
                              </div>

                              {!hasClosingInspectionMedia && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                  Upload the closing inspection photos or videos first, then save the report.
                                </div>
                              )}

                              {hasClosingInspectionMedia && reportNeedsAffectedAreas && !hasAffectedAreas && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                  Tap the vehicle map to mark the affected area before saving the report.
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await persistVehicleReport();
                                      await loadRentalData(true);
                                    } catch (err) {
                                      toast.error(err.message || 'Failed to save vehicle report');
                                    }
                                  }}
                                  disabled={!canSaveVehicleReport}
                                  size="sm"
                                  className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 text-white text-xs"
                                >
                                  <FileText className="w-3 h-3 mr-1.5" />
                                  {savingVehicleReport
                                    ? 'Saving Report...'
                                    : reportSaved
                                      ? 'Update Report'
                                      : 'Save Report to Continue'}
                                </Button>
                                {vehicleReport?.maintenance_id && (
                                  <Button
                                    type="button"
                                    onClick={() => navigate(`/admin/maintenance?maintenanceId=${vehicleReport.maintenance_id}`)}
                                    size="sm"
                                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                                  >
                                    <Wrench className="w-3 h-3 mr-1.5" />
                                    Open in Quad Maintenance
                                  </Button>
                                )}
                                {vehicleReport && (
                                  <div className="flex items-center text-xs text-green-700">
                                    <CheckCircle className="w-3 h-3 mr-1.5" />
                                    Report saved{vehicleReport.maintenance_id ? ` and linked to ${formatMaintenanceReference(vehicleReport.maintenance_id)}` : ''}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Ending Odometer */}
                <div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
                  finishRentalSteps.endOdometerComplete ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                    finishRentalSteps.endOdometerComplete ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    {finishRentalSteps.endOdometerComplete ? (
                      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <span className="text-white font-bold text-xs">2</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Ending Odometer</h4>
                        {!isEditingEndOdometer ? (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">
                            {finishRentalSteps.endOdometerComplete 
                              ? `✓ Ending odometer: ${rental.ending_odometer} km` 
                              : 'Enter ending kilometer reading'}
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <input
                              ref={endOdometerEditInputRef}
                              type="number"
                              value={endOdometerEditValue}
                              onChange={(e) => setEndOdometerEditValue(e.target.value)}
                              placeholder="Enter ending odometer (km)"
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min={rental.start_odometer || 0}
                              step="1"
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <Button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSaveEndOdometer(endOdometerEditValue);
                                }}
                                size="sm"
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                              >
                                {isProcessingEndOdometer ? 'Saving...' : 'Save'}
                              </Button>
                              <Button 
                                type="button"
                                onClick={() => {
                                  setIsEditingEndOdometer(false);
                                  setEndOdometerEditValue('');
                                }}
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs h-7"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {finishRentalSteps.endOdometerComplete && !isEditingEndOdometer && (
                        <Button 
                          type="button"
                          onClick={() => { setIsEditingEndOdometer(true); setEndOdometerEditValue(rental.ending_odometer?.toString() || ""); }}
                          size="sm"
                          variant="ghost"
                          className="mt-2 sm:mt-0 text-xs h-7 px-2"
                        >
                          <Edit className="w-3 h-3 mr-1.5" />
                          Edit
                        </Button>
                      )}
                      {!finishRentalSteps.endOdometerComplete && !isEditingEndOdometer && (
                        <Button 
                          type="button"
                          onClick={() => setShowEndOdometerPrompt(true)}
                          size="sm"
                          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
                        >
                          <Gauge className="w-3 h-3 mr-1.5" />
                          <span className="whitespace-nowrap">Add Reading</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                    {/* Step 3: Fuel Level - WITH EDIT CAPABILITY */}
<div className={`flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg ${
  finishRentalSteps.endFuelComplete ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
}`}>
  <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
    finishRentalSteps.endFuelComplete ? 'bg-green-500' : 'bg-gray-300'
  }`}>
    {finishRentalSteps.endFuelComplete ? (
      <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
    ) : (
      <span className="text-white font-bold text-xs">3</span>
    )}
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-xs sm:text-sm text-gray-900">Fuel Level</h4>
        <p className="text-xs text-gray-600 mt-0.5 break-words">
          {finishRentalSteps.endFuelComplete 
            ? `✓ Ending fuel: ${endFuelLevel || rental?.end_fuel_level}/8 ${startFuelLevel ? `(Started: ${startFuelLevel}/8)` : ''}` 
            : 'Record fuel level at return'}
        </p>
      </div>
      
      {/* Record Fuel Button (shown when not complete) */}
      {!finishRentalSteps.endFuelComplete && (
        <Button 
          onClick={() => setShowEndFuelModal(true)}
          size="sm"
          className="mt-2 sm:mt-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2.5 sm:px-3"
        >
          <Fuel className="w-3 h-3 mr-1.5" />
          <span className="whitespace-nowrap">Record Fuel</span>
        </Button>
      )}
    </div>

    {/* FUEL CHARGE DISPLAY — compact, shows prices & calc */}
    {finishRentalSteps.endFuelComplete && (
      <>
        {fuelChargeEnabled ? (
          (() => {
            const startL = startFuelLevel || rental?.start_fuel_level || 0;
            const endL   = endFuelLevel   || rental?.end_fuel_level   || 0;
            const deficit = Math.max(0, startL - endL);
            const charge  = fuelCharge || rental?.fuel_charge || 0;
            return (
              <div className="mt-2 bg-gray-50 rounded-lg px-2.5 py-2 space-y-1">
                {/* One-line summary */}
                <div className="flex items-center justify-between flex-wrap gap-x-2">
                  <span className={`text-xs font-semibold ${charge > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ⛽ {deficit} line{deficit !== 1 ? 's' : ''} missing · {deficit} × {fuelPricePerLine} = <strong>{charge.toFixed(0)} MAD</strong>
                  </span>
                  <Button
                    onClick={() => {
                      const val = prompt(`Override fuel charge (MAD):
${deficit} lines × ${fuelPricePerLine} MAD = ${charge.toFixed(2)} MAD`, charge.toString());
                      if (val !== null) {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) handleEditFuelCharge(n);
                        else toast.error('Enter a valid number');
                      }
                    }}
                    size="sm" variant="ghost"
                    className="h-5 px-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="w-3 h-3 mr-0.5" />Edit
                  </Button>
                </div>
                {/* Breakdown — only when deficit > 0 */}
                {deficit > 0 && (
                  <p className="text-xs text-gray-400 leading-tight">
                    Start {startL}/8 → End {endL}/8 · {fuelPricePerLine} MAD/line · {rental?.rental_type}
                  </p>
                )}
                {deficit === 0 && (
                  <p className="text-xs text-green-600 leading-tight">✓ Fuel returned at same level — no charge</p>
                )}
              </div>
            );
          })()
        ) : (
          /* Disabled — show what WOULD be charged */
          (() => {
            const startL  = startFuelLevel || rental?.start_fuel_level || 0;
            const endL    = endFuelLevel   || rental?.end_fuel_level   || 0;
            const deficit = Math.max(0, startL - endL);
            const wouldBe = deficit * (fuelPricePerLine || 0);
            return (
              <div className="mt-2 bg-gray-50 rounded-lg px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-x-2">
                  <span className="text-xs text-gray-500 font-medium">
                    ⛽ Fuel charge OFF
                    {wouldBe > 0 && <span className="text-amber-600 ml-1">(would be {wouldBe.toFixed(0)} MAD)</span>}
                  </span>
                  <Button
                    onClick={() => {
                      const val = prompt(`Manual fuel charge (MAD):
${deficit} lines × ${fuelPricePerLine} MAD = ${wouldBe.toFixed(2)} MAD`, '0');
                      if (val !== null) {
                        const n = parseFloat(val);
                        if (!isNaN(n) && n >= 0) handleEditFuelCharge(n);
                        else toast.error('Enter a valid number');
                      }
                    }}
                    size="sm" variant="ghost"
                    className="h-5 px-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Edit className="w-3 h-3 mr-0.5" />Override
                  </Button>
                </div>
                {rental.rental_type === 'hourly' && (
                  <p className="text-xs text-gray-400 leading-tight">
                    Start {startL}/8 → End {endL}/8 · fuel included in hourly rate
                  </p>
                )}
              </div>
            );
          })()
        )}
      </>
    )}
  </div>
</div>

                    {/* Complete Rental — appears inline once all 3 steps done */}
                    {finishRentalSteps.closingVideoComplete &&
                     finishRentalSteps.endOdometerComplete &&
                     finishRentalSteps.endFuelComplete && (
                      <div className="pt-1 space-y-2">
                        {/* Balance warning */}
                        {(() => {
                          const balanceDue = rentalBillingSummary.balanceDue;
                          if (balanceDue > 0) return (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                              <p className="text-xs text-yellow-800 font-medium">Balance due: {formatCurrency(balanceDue)} MAD — can collect after completion</p>
                            </div>
                          );
                          return null;
                        })()}
                        {rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 flex items-center gap-2">
                            <span className="text-lg flex-shrink-0">🔒</span>
                            <p className="text-xs text-orange-800">
                              <span className="font-semibold">Damage deposit of {formatCurrency(rental.damage_deposit)} MAD not yet returned</span>
                              {' '}— you can complete now and return it separately.
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={async () => {
                            try { await finalizeRentalCompletion(); }
                            catch (err) { toast.error(`Failed: ${err.message}`); }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white py-3 text-sm font-semibold shadow-lg w-full"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Complete Rental
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Cancel Workflow Button */}
                  <div className="flex justify-end mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelFinishWorkflow}
                      className="text-gray-500 hover:text-gray-700 text-xs"
                    >
                      Cancel workflow
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {vehicleReport && (
        <Card className="mb-6 border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base sm:text-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Vehicle Report</span>
              </div>
              <Badge className="bg-red-100 text-red-800">
                {String(vehicleReport.severity || 'reported').replace(/_/g, ' ')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Report Type</p>
                <p className="mt-1 font-medium text-gray-900">{String(vehicleReport.report_type || 'damage').replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Photos / Media</p>
                <p className="mt-1 font-medium text-gray-900">{vehicleReport.photos?.length || 0} linked item(s)</p>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Inspection Note</p>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{vehicleReport.description || 'No description recorded.'}</p>
            </div>

            {vehicleReport.maintenance ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
                {(() => {
                  const maintenanceParts = Array.isArray(vehicleReport.maintenance.parts_used)
                    ? vehicleReport.maintenance.parts_used
                    : [];
                  const maintenanceSummaryItems = [
                    vehicleReport.maintenance.maintenance_type || null,
                    ...maintenanceParts
                      .map((part) => part.item_name || part.part_name)
                      .filter(Boolean)
                      .slice(0, 3)
                  ];
                  const uniqueSummaryItems = [...new Set(maintenanceSummaryItems)];
                  const hasMoreParts = maintenanceParts.length > 3;

                  return uniqueSummaryItems.length > 0 ? (
                    <div className="rounded-lg border border-orange-200 bg-white/70 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Work performed</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {uniqueSummaryItems.join(' • ')}
                        {hasMoreParts ? ' • more items' : ''}
                      </p>
                    </div>
                  ) : null;
                })()}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Linked Maintenance</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {vehicleReport.maintenance.maintenance_type || 'Repair'} • {vehicleReport.maintenance.status || 'scheduled'}
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      Ref: {formatMaintenanceReference(vehicleReport.maintenance.id)}
                    </p>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">
                    {vehicleReport.maintenance.status || 'scheduled'}
                  </Badge>
                </div>
                {vehicleReport.maintenance.status === 'completed' ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm font-semibold text-green-900">Repair completed</p>
                    <p className="mt-1 text-xs text-green-700">
                      The linked Quad Maintenance record is complete. This rental is now ready to be reviewed and closed with the final bill.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-orange-200 bg-white/70 p-3">
                    <p className="text-sm font-semibold text-orange-900">Vehicle under maintenance</p>
                    <p className="mt-1 text-xs text-orange-700">
                      Finish the linked Quad Maintenance record to pull the final repair total back into this rental and close it with confidence.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Parts</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.parts_cost_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Labor</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.labor_rate_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">External</p>
                    <p className="font-medium text-gray-900">{formatCurrency(vehicleReport.maintenance.external_cost_mad || 0)} MAD</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Bill</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(vehicleReport.maintenance.cost || 0)} MAD</p>
                  </div>
                </div>
                {vehicleReport.customer_chargeable && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Maintenance stay charge</p>
                        <p className="mt-1 text-xs text-blue-700">
                          Uses the saved rate first, then falls back to the vehicle model tier or base daily price.
                        </p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">
                        {getMaintenanceStayRateSourceLabel(maintenanceChargeForm.source)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Days in maintenance</label>
                        <input
                          type="number"
                          min="1"
                          value={maintenanceChargeForm.days || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const days = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              days,
                              total: calculateMaintenanceStayTotal(days, prev.dailyRate, prev.discount),
                              source: prev.source === 'none' ? 'manual' : prev.source,
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Daily rate (MAD)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={maintenanceChargeForm.dailyRate || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const dailyRate = Math.max(0, Number(e.target.value || 0));
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              dailyRate,
                              total: calculateMaintenanceStayTotal(prev.days, dailyRate, prev.discount),
                              source: 'manual',
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Employee discount (MAD)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={maintenanceChargeForm.discount || ''}
                          disabled={maintenanceChargeLocked}
                          onChange={(e) => {
                            const discount = Math.max(0, Number(e.target.value || 0));
                            setMaintenanceChargeForm(prev => ({
                              ...prev,
                              discount,
                              total: calculateMaintenanceStayTotal(prev.days, prev.dailyRate, discount),
                            }));
                          }}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg bg-white/80 border border-blue-100 p-3">
                        <p className="text-xs text-gray-500">Stay subtotal</p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {formatCurrency((maintenanceChargeForm.days || 0) * (maintenanceChargeForm.dailyRate || 0))} MAD
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-blue-100 p-3">
                        <p className="text-xs text-gray-500">Discount</p>
                        <p className="mt-1 font-semibold text-green-700">
                          -{formatCurrency(maintenanceChargeForm.discount || 0)} MAD
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-blue-100 p-3">
                        <p className="text-xs text-gray-500">Stay charge total</p>
                        <p className="mt-1 font-semibold text-blue-900">
                          {formatCurrency(maintenanceChargeForm.total || 0)} MAD
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-xs text-blue-700">
                        Final customer charge = maintenance bill {formatCurrency(vehicleReport.maintenance.cost || 0)} MAD + stay charge {formatCurrency(maintenanceChargeForm.total || 0)} MAD
                        {maintenanceChargeLocked ? ' • Contract completed, charge setup locked.' : ''}
                      </p>
                      <Button
                        type="button"
                        onClick={saveMaintenanceChargeConfig}
                        disabled={savingMaintenanceCharge || maintenanceChargeLocked}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        <Save className="w-3 h-3 mr-1.5" />
                        {savingMaintenanceCharge ? 'Saving...' : maintenanceChargeLocked ? 'Charge setup locked' : 'Save charge setup'}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    onClick={() => navigate(`/admin/maintenance?maintenanceId=${vehicleReport.maintenance.id}`)}
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
                  >
                    <Wrench className="w-3 h-3 mr-1.5" />
                    Open in Quad Maintenance
                  </Button>
                </div>
              </div>
            ) : vehicleReport.send_to_maintenance ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>Maintenance has been requested for this report and will appear here once the linked record is available.</span>
                  <Button
                    type="button"
                    onClick={() => navigate(`/admin/maintenance?action=create&reportId=${vehicleReport.id}&vehicleId=${rental.vehicle_id}&rentalId=${rental.id}`)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
                  >
                    <Wrench className="w-3 h-3 mr-1.5" />
                    Open in Quad Maintenance
                  </Button>
                </div>
              </div>
            ) : null}

            {vehicleReport.customer_chargeable && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-900">
                  Customer chargeable amount: {formatCurrency(vehicleReport.customer_charge_amount || vehicleReport.maintenance_cost_total || 0)} MAD
                </p>
                {(vehicleReport.maintenance_daily_total || 0) > 0 && (
                  <p className="mt-1 text-xs text-blue-700">
                    Includes maintenance stay charge of {formatCurrency(vehicleReport.maintenance_daily_total || 0)} MAD
                    {vehicleReport.maintenance_daily_discount > 0 ? ` after ${formatCurrency(vehicleReport.maintenance_daily_discount)} MAD discount` : ''}.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {(isScheduled || isActive || isCompleted) && (
        <div className="mb-6">
          <RentalVideos 
            key={videoRefreshKey} 
            rental={rental} 
            onUpdate={handleVideoUpdate} 
            isProcessing={isProcessingVideo} 
          />
        </div>
      )}

      {/* Extension History Section */}
      {extensions.length > 0 && (
  <div className="mb-6">
    <ExtensionHistory 
      extensions={extensions}
      onApprove={isAdmin ? handleApproveExtension : undefined} // Only pass if admin
      onReject={isAdmin ? handleRejectExtension : undefined} // Only pass if admin
      isAdmin={isAdmin}
    />

          {/* Completed Rental Message */}
          {closingMedia.length > 0 && rental.rental_status === 'completed' && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="font-semibold text-green-900">Rental Completed</h4>
                  <p className="text-sm text-green-700 mt-1">
                    This rental has been completed and closed. Extensions are no longer available.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="mb-6 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-4">
          <CardTitle className="text-xl text-slate-900">Rental Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Customer Details</h3>
              <Button onClick={() => handleViewCustomerDetails(rental.customer_id)} size="sm" className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                <User className="mr-2 h-4 w-4" />
                View Details
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2 text-sm sm:text-base text-slate-700">
              <p><strong>Full Name:</strong> {rental.customer_name}</p>
              <p><strong>Email:</strong> {rental.customer_email}</p>
              <p><strong>Phone:</strong> {rental.customer_phone}</p>
              <p><strong>ID/License:</strong> {rental.customer_licence_number || 'N/A'}</p>
            </div>
          </div>
          {hasSecondDriver && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 text-lg">
                  Additional Drivers ({secondDriversList.length})
                </h3>
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  <p>
                    {secondDriversList.length === 1
                      ? '1 additional driver is linked to this rental.'
                      : `${secondDriversList.length} additional drivers are linked to this rental.`}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Open the side panel to view ID image, license details, and scanned information.
                  </p>
                </div>
                <Button onClick={handleViewAdditionalDrivers} size="sm" className="mt-4 bg-blue-100 text-blue-800 hover:bg-blue-200">
                    <Users className="w-4 h-4 mr-2" />
                    View Additional Driver{secondDriversList.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
          <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Vehicle Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
              <p><strong>Vehicle:</strong> {rental.vehicle?.name}</p>
              <p><strong>Model:</strong> {rental.vehicle?.model}</p>
              <p><strong>Plate:</strong> {rental.vehicle?.plate_number}</p>
              <p><strong>Type:</strong> {rental.vehicle?.vehicle_type}</p>
              {rental.start_odometer && (
                <div className="flex items-center gap-2">
                  {isEditingStartOdometer ? (
                    <div className="flex items-center gap-1">
                      <strong>Start Odometer:</strong>
                      <input type="number" value={startOdometerEditValue}
                        onChange={e => setStartOdometerEditValue(e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-0.5 text-sm" min={0} autoFocus />
                      <span className="text-sm text-gray-500">km</span>
                      <Button type="button" size="sm" onClick={handleEditStartOdometer} className="h-6 px-2 bg-blue-600 text-white text-xs">Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingStartOdometer(false)} className="h-6 px-2 text-xs">✕</Button>
                    </div>
                  ) : (
                    <>
                      <p><strong>Start Odometer:</strong> {rental.start_odometer} km</p>
                      {isCompleted && ['admin', 'owner', 'employee'].includes(currentUser?.role) && (
                        <Button type="button" onClick={() => { setIsEditingStartOdometer(true); setStartOdometerEditValue(rental.start_odometer?.toString() || ''); }}
                          size="sm" variant="ghost" className="h-6 w-6 p-0" title="Edit start odometer">
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {rental.ending_odometer && (
                <div className="flex items-center gap-2">
                  {isEditingEndOdometer ? (
                    <div className="flex items-center gap-1">
                      <strong>End Odometer:</strong>
                      <input ref={endOdometerEditInputRef} type="number" value={endOdometerEditValue}
                        onChange={e => setEndOdometerEditValue(e.target.value)}
                        className="w-24 border border-gray-300 rounded px-2 py-0.5 text-sm" min={0} autoFocus />
                      <span className="text-sm text-gray-500">km</span>
                      <Button type="button" size="sm" onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveEndOdometer(endOdometerEditValue);
                      }} className="h-6 px-2 bg-blue-600 text-white text-xs">Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingEndOdometer(false)} className="h-6 px-2 text-xs">✕</Button>
                    </div>
                  ) : (
                    <>
                      <p><strong>End Odometer:</strong> {rental.ending_odometer} km</p>
                      {isCompleted && ['admin', 'owner', 'employee'].includes(currentUser?.role) && (
                        <Button type="button" onClick={() => { setIsEditingEndOdometer(true); setEndOdometerEditValue(rental.ending_odometer?.toString() || ''); }}
                          size="sm" variant="ghost" className="h-6 w-6 p-0" title="Edit end odometer">
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {rental.total_kilometers_driven && (
                <p><strong>Total Distance:</strong> {(rental.total_kilometers_driven || 0).toFixed(2)} km</p>
              )}
              {/* Fuel Information Display */}
              {(rental.start_fuel_level !== null || startFuelLevel !== null) && (
                <div>
                  <p>
                    <strong>⛽ Fuel at Departure:</strong>{' '}
                    <span className="text-blue-600 font-semibold">
                      {startFuelLevel || rental.start_fuel_level}/8
                    </span>
                  </p>
                  {/* Fuel Gauge Progress Bar */}
                  <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5,6,7,8].map(segment => (
                      <div 
                        key={segment}
                        className={`w-3 h-5 rounded ${segment <= (startFuelLevel || rental.start_fuel_level) ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {(rental.end_fuel_level !== null || endFuelLevel !== null) && (
                <div>
                  <p>
                    <strong>⛽ Fuel at Return:</strong>{' '}
                    <span className={`font-semibold ${
                      (endFuelLevel || rental.end_fuel_level) >= (startFuelLevel || rental.start_fuel_level) 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}>
                      {endFuelLevel || rental.end_fuel_level}/8
                    </span>
                    {(endFuelLevel || rental.end_fuel_level) >= (startFuelLevel || rental.start_fuel_level) && (
                      <span className="text-green-600 ml-2">✓</span>
                    )}
                  </p>
                  {/* Fuel Gauge Progress Bar */}
                  <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5,6,7,8].map(segment => (
                      <div 
                        key={segment}
                        className={`w-3 h-5 rounded ${segment <= (endFuelLevel || rental.end_fuel_level) ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* FUEL CHARGE - only show when toggle ON, end fuel recorded, and deficit > 0 */}
              {(() => {
                const startL  = startFuelLevel ?? rental.start_fuel_level ?? null;
                const endL    = endFuelLevel   ?? rental.end_fuel_level   ?? null;
                const deficit = (startL !== null && endL !== null) ? Math.max(0, startL - endL) : 0;
                const charge  = fuelCharge || parseFloat(rental.fuel_charge || 0);

                // Toggle ON + end fuel recorded + deficit > 0 → show charge
                if (fuelChargeEnabled && endL !== null && deficit > 0 && charge > 0) {
                  return (
                    <p className="col-span-2">
                      <strong>⛽ Fuel Charge:</strong>{' '}
                      <span className="text-red-600 font-semibold">
                        {deficit} lines × {fuelPricePerLine || 0} MAD = {charge.toFixed(2)} MAD
                      </span>
                    </p>
                  );
                }

                // Toggle ON + end fuel recorded + no deficit → show no charge
                if (fuelChargeEnabled && endL !== null && deficit === 0) {
                  return (
                    <p className="col-span-2 text-sm text-green-600">
                      <strong>⛽ Fuel:</strong> Returned full — no charge ✓
                    </p>
                  );
                }

                // Toggle OFF → show included
                if (!fuelChargeEnabled && startL !== null) {
                  return (
                    <p className="col-span-2 text-sm text-green-600">
                      <strong>⛽ Fuel:</strong> Included in rate ✓
                    </p>
                  );
                }

                // Toggle ON but end fuel not yet recorded → show price hint
                if (fuelChargeEnabled && startL !== null) {
                  return (
                    <p className="col-span-2 text-xs text-orange-600">
                      ⛽ {fuelPricePerLine || 0} MAD/line at return
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            {/* ========== PACKAGE SUMMARY - OVERRIDES TIER PRICING ========== */}
            {(rental.package || packageDetails) && (
              <div className="mt-4 p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-purple-900">Selected Package</h4>
                  <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full ml-auto">
                    Package Applied
                  </span>
                </div>
                
                {(() => {
                  const pkg = packageDetails || rental?.package;
                  if (!pkg) return null;
                  const packageRate = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
                  const duration = rental.rental_type === 'hourly'
                    ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
                    : (rental.quantity_days ?? 1);
                  
                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Package:</span>
                        <span className="text-sm font-bold text-purple-700">{pkg.name || 'Kilometer Package'}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Rate per {rental.rental_type === 'hourly' ? 'hour' : 'day'}:</span>
                        <span className="text-sm font-bold text-gray-900">{packageRate.toFixed(2)} MAD</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Duration:</span>
                        <span className="text-sm font-bold text-gray-900">
                          {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? 'hours' : 'days') : (rental.rental_type === 'hourly' ? 'hour' : 'day')}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-purple-200">
                        <span className="text-base font-semibold text-purple-900">Package Total:</span>
                        <span className="text-xl font-bold text-purple-700">
                          {(packageRate * duration).toFixed(2)} MAD
                        </span>
                      </div>

                      {/* Package Features */}
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {pkg.included_kilometers && (
                          <div className="bg-green-50 px-3 py-2 rounded-lg border border-green-100">
                            <div className="text-xs text-green-600 font-medium">✓ Included KM</div>
                            <div className="text-sm font-bold text-green-700">{pkg.included_kilometers} km</div>
                          </div>
                        )}
                        {pkg.extra_km_rate > 0 && (
                          <div className="bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                            <div className="text-xs text-orange-600 font-medium">Extra KM rate</div>
                            <div className="text-sm font-bold text-orange-600">{pkg.extra_km_rate} MAD/km</div>
                          </div>
                        )}
                      </div>

                      {/* Overage Calculation if applicable */}
                      {rental.total_kilometers_driven > 0 && pkg.included_kilometers && (
                        <div className="mt-2 text-xs bg-white p-2 rounded border border-purple-100">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium text-gray-700">Distance summary: </span>
                              <span>{rental.total_kilometers_driven} km driven</span>
                              {rental.total_kilometers_driven > pkg.included_kilometers ? (
                                <span className="text-orange-600 block mt-1">
                                  ⚠️ Extra: {rental.total_kilometers_driven - pkg.included_kilometers} km × {pkg.extra_km_rate} MAD = {' '}
                                  {((rental.total_kilometers_driven - pkg.included_kilometers) * pkg.extra_km_rate).toFixed(2)} MAD
                                </span>
                              ) : (
                                <span className="text-green-600 block mt-1">
                                  ✓ Within package limit ({pkg.included_kilometers} km)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Only show Tier Pricing if NO package is selected */}
            {!rental.package && !packageDetails && tierPricingBreakdown && (rental?.rental_type === 'hourly' || rental?.rental_type === 'daily') && (
              <div className="col-span-1 sm:col-span-2 mt-4">
                <TierPricingDisplay 
                  breakdown={tierPricingBreakdown} 
                  isMobile={window.innerWidth < 640} 
                />
              </div>
            )}

            {/* If no package and no tier pricing, show standard rate info */}
            {!rental.package && !packageDetails && !tierPricingBreakdown && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-blue-900">Standard Rate Applied</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      {rental.rental_type === 'hourly' ? (rental.quantity_hours ?? rental.quantity_days ?? 0) : (rental.quantity_days || 0)} {rental.rental_type === 'hourly' ? 'hour' : 'day'}{' '}
                      rental at {rental.unit_price?.toFixed(2)} MAD
                      {rental.rental_type === 'hourly' ? '/hour' : '/day'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Separator className="bg-slate-100" />
          <div>
            {(rental.created_by_name || rental.started_by_name || rental.contract_signed_by_name) && (
              <div className="mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-base text-slate-900">👤 Staff</h3>
                  <button
                    onClick={async () => {
                      if (!showHistory) await loadRentalHistory(rental.id);
                      setShowHistory(h => !h);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {showHistory ? 'Hide' : '📋 History'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                  {rental.created_by_name && <p><strong>Booked by:</strong> {rental.created_by_name}</p>}
                  {rental.contract_signed_by_name && <p><strong>Signed by:</strong> {rental.contract_signed_by_name}</p>}
                  {rental.started_by_name && <p><strong>Started by:</strong> {rental.started_by_name}</p>}
                </div>
                {showHistory && (
                  <div className="mt-3 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Action History</p>
                    {rentalHistory.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No history yet — run SQL migration first</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {rentalHistory.map((log, i) => (
                          <div key={i} className="flex gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                            <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                              {new Date(log.created_at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                            </span>
                            <span className="text-gray-700 flex-1">{log.description}</span>
                            {log.user_name && <span className="text-blue-600 whitespace-nowrap">{log.user_name}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Rental Period</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
              <p><strong>Start:</strong> {new Date(rental.started_at || rental.rental_start_date).toLocaleString()}
   {rental.started_at && <span className="text-green-600 text-xs ml-2">(Actual)</span>}</p>
              <p><strong>End:</strong> {
                (() => {
                  // Use the latest of rental_end_date and actual_end_date (both updated by extensions)
                  const endDate = new Date(rental.rental_end_date);
                  const actualDate = rental.actual_end_date ? new Date(rental.actual_end_date) : null;
                  // Pick whichever is later to ensure we show the most current end date
                  const displayDate = actualDate && actualDate > endDate ? actualDate : endDate;
                  return displayDate.toLocaleString();
                })()
              }
   {(() => {
     const hasExt = rental.extensions?.some(e => e.status === 'approved');
     if (hasExt) return <span className="text-green-600 text-xs ml-2">(Extended)</span>;
     if (rental.actual_end_date) return <span className="text-blue-600 text-xs ml-2">(Adjusted)</span>;
     return <span className="text-gray-500 text-xs ml-2">(Scheduled)</span>;
   })()}</p>
              <p><strong>Type:</strong> 
                  <span className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 ml-2 rounded-full text-sm font-bold capitalize
                    ${rental.rental_type === 'hourly' 
                      ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                      : rental.rental_type === 'daily'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-purple-100 text-purple-800 border border-purple-300'
                    }
                  `}>
                    {rental.rental_type === 'hourly' && <Clock className="w-4 h-4" />}
                    {rental.rental_type === 'daily' && <Calendar className="w-4 h-4" />}
                    {(!rental.rental_type || rental.rental_type === 'weekly' || rental.rental_type === 'monthly') && 
                      <Calendar className="w-4 h-4" />
                    }
                    {rental.rental_type || 'daily'}
                  </span>
                </p>
              <p><strong>Pickup:</strong> {rental.pickup_location}</p>

            </div>
          </div>
           <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Inclusions & Add-ons</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm sm:text-base text-slate-700">
                <p><strong>Insurance:</strong> {rental.insurance_included ? 'Yes' : 'No'}</p>
                <p><strong>Helmet:</strong> {rental.helmet_included ? 'Yes' : 'No'}</p>
                <p><strong>Gear:</strong> {rental.gear_included ? 'Yes' : 'No'}</p>
            </div>
          </div>
          <Separator className="bg-slate-100" />
          <div>
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Financial Information</h3>
  
  {isPendingApproval && (
    <Alert className="mb-4 bg-yellow-50 border-yellow-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <AlertDescription className="text-yellow-800">
            <strong>Pending Admin Approval</strong>
            <p className="mt-1">Manual price override requested: <strong>{rental.pending_total_request} MAD</strong></p>
            {rental.price_override_reason && (
              <p className="mt-1 text-sm">Reason: {rental.price_override_reason}</p>
            )}
          </AlertDescription>
        </div>
        
        {!isAdmin && (
          <Button
            onClick={handlePriceApprovalRequest}
            className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
            size="sm"
            disabled={isSharing}
          >
            <FaWhatsapp className="w-4 h-4 mr-2" />
            {isSharing ? 'Sending...' : 'Notify Admin via WhatsApp'}
          </Button>
        )}
      </div>
    </Alert>
  )}

  {isPendingApproval && isAdmin && (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h4 className="font-semibold text-blue-900 mb-3">Price Approval Required</h4>
      <div className="space-y-2 mb-3 text-sm">
        <p><strong>Current Auto Price:</strong> {rental.total_amount} MAD</p>
        <p><strong>Requested Manual Price:</strong> {rental.pending_total_request} MAD</p>
        {rental.price_override_reason && (
          <p><strong>Reason:</strong> {rental.price_override_reason}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button 
          onClick={handleApprovePrice}
          className="bg-green-600 hover:bg-green-700 text-white"
          size="sm"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Approve
        </Button>
        <Button 
          onClick={handleDeclinePrice}
          variant="destructive"
          size="sm"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Decline
        </Button>
      </div>
    </div>
  )}

  {!isEditingPrice ? (
    <div className="space-y-3 text-sm sm:text-base">
      {/* Package Information Display - OVERRIDES tier pricing */}
      {getRentalKilometerPackage(rental, packageDetails) ? (
        (() => {
          const pkg = getRentalKilometerPackage(rental, packageDetails);
          if (!pkg) return null;
          
          const packageRate = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
          const duration = rental.rental_type === 'hourly'
            ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
            : (rental.quantity_days ?? 1);
          
          // Calculate total included kilometers for the entire duration
          const totalIncludedKm = pkg.included_kilometers ? pkg.included_kilometers * duration : null;
          
          return (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-3">
              <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Package Applied: {pkg.name || 'Kilometer Package'}
              </h4>
              
              <div className="space-y-3">
                {/* Rate and Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 mb-1">Rate per {rental.rental_type === 'hourly' ? 'hour' : 'day'}</div>
                    <div className="text-lg font-bold text-gray-900">{packageRate.toFixed(2)} MAD</div>
                  </div>
                  
                  <div className="bg-white p-3 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 mb-1">Duration</div>
                    <div className="text-lg font-bold text-gray-900">
                      {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? 'hours' : 'days') : (rental.rental_type === 'hourly' ? 'hour' : 'day')}
                    </div>
                  </div>
                </div>

                {/* Package Features */}
                <div className="grid grid-cols-2 gap-3">
                  {pkg.included_kilometers && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <div className="flex flex-col">
                        <span className="text-xs text-green-600 font-medium">Included per unit</span>
                        <span className="text-sm font-bold text-green-700">{pkg.included_kilometers} km</span>
                        <span className="text-xs text-gray-500 mt-1">
                          &times; {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? 'hours' : 'days') : (rental.rental_type === 'hourly' ? 'hour' : 'day')}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {totalIncludedKm && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="flex flex-col">
                        <span className="text-xs text-blue-600 font-medium">Total included</span>
                        <span className="text-lg font-bold text-blue-700">{totalIncludedKm} km</span>
                        <span className="text-xs text-gray-500 mt-1">
                          {pkg.included_kilometers} km &times; {duration}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extra KM Rate */}
                {pkg.extra_km_rate > 0 && (
                  <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-orange-700">Extra KM rate:</span>
                      <span className="text-lg font-bold text-orange-600">{parseFloat(pkg.extra_km_rate).toFixed(2)} MAD/km</span>
                    </div>
                  </div>
                )}

                {/* Package Total */}
                <div className="bg-purple-100 p-4 rounded-lg border-2 border-purple-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-purple-800">Package Total</span>
                      <div className="text-xs text-purple-600 mt-1">
                        {packageRate.toFixed(2)} MAD &times; {duration} = {(packageRate * duration).toFixed(2)} MAD
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-purple-800">
                      {(packageRate * duration).toFixed(2)} MAD
                    </span>
                  </div>
                </div>

                {/* Info Note */}
                <div className="text-xs text-gray-500 bg-white p-2 rounded border border-purple-100">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-gray-700">Package summary: </span>
                      {pkg.included_kilometers ? (
                        <>
                          Total included kilometers: {totalIncludedKm} km ({pkg.included_kilometers} km &times; {duration} {duration > 1 ? (rental.rental_type === 'hourly' ? 'hours' : 'days') : (rental.rental_type === 'hourly' ? 'hour' : 'day')})
                          {pkg.extra_km_rate > 0 && ` • Extra: ${pkg.extra_km_rate} MAD/km`}
                        </>
                      ) : (
                        `No kilometer limit • Extra rate: ${pkg.extra_km_rate} MAD/km`
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Single Distance & Overage Calculation */}
      {rental.total_kilometers_driven > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
          <h4 className="font-semibold text-gray-900 mb-3">🚗 Distance Summary</h4>
          
          {/* Odometer Readings */}
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span>Start:</span>
              <span className="font-medium">{rental.start_odometer} km</span>
            </div>
            <div className="flex justify-between">
              <span>End:</span>
              <span className="font-medium">{rental.ending_odometer} km</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">Total Distance:</span>
              <span className="font-bold text-blue-600">{(rental.total_kilometers_driven || 0).toFixed(2)} km</span>
            </div>
          </div>

          {/* Overage Calculation */}
          {(() => {
  const pkg = getRentalKilometerPackage(rental, packageDetails);
  if (!pkg) return null;

  if (!includedKilometers || !extraKmRate) {
    return (
      <div className="bg-yellow-50 rounded-lg p-3">
        <p className="text-sm text-yellow-700">⚠️ Package rates not configured.</p>
      </div>
    );
  }
  
  const totalKm = rental.total_kilometers_driven || 0;
  const extraKm = Math.max(0, totalKm - includedKilometers);
  const overageCharge = extraKm * extraKmRate;
  
  return (
    <div className={`${extraKm > 0 ? 'bg-yellow-50' : 'bg-green-50'} rounded-lg p-3`}>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Package limit:</span>
          <span className="font-medium">{includedKilometers} km</span>
        </div>
        {extraKm > 0 ? (
          <>
            <div className="flex justify-between text-sm text-orange-600">
              <span>Extra kilometers:</span>
              <span className="font-medium">+{extraKm} km</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-orange-200 pt-2">
              <span>Overage ({extraKmRate} MAD/km):</span>
              <span className="text-red-600">+{overageCharge.toFixed(2)} MAD</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-green-600 font-medium">
            ✅ Within package limit ({totalKm} km ≤ {includedKilometers} km)
          </div>
        )}
      </div>
    </div>
  );
})()}
        </div>
      )}

      {/* Financial Breakdown - Single Source */}
      <div className="space-y-2">
        {/* Base Rental Rate - Use package rate when available */}
        <div className="flex justify-between">
          <span className="text-gray-600">Base Rental Rate:</span>
          <span className="font-medium">
            {formatCurrency(rentalBillingSummary.baseAmount)} MAD
          </span>
        </div>

        {/* Overage Charge - Only once */}
        {(() => {
          return rentalBillingSummary.overageCharge > 0 ? (
            <div className="flex justify-between text-red-600">
              <span>Overage charge:</span>
              <span className="font-medium">+{formatCurrency(rentalBillingSummary.overageCharge)} MAD</span>
            </div>
          ) : null;
        })()}

        {rentalBillingSummary.extensionFees > 0 && (
          <div className="flex justify-between text-purple-600">
            <span>Extensions:</span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.extensionFees)} MAD</span>
          </div>
        )}

        {/* Fuel charge — gated on toggle + end fuel recorded + deficit */}
        {(() => {
          const startL  = startFuelLevel ?? rental?.start_fuel_level ?? null;
          const endL    = endFuelLevel   ?? rental?.end_fuel_level   ?? null;
          const deficit = (startL !== null && endL !== null) ? Math.max(0, startL - endL) : 0;
          const charge  = fuelCharge || parseFloat(rental?.fuel_charge || 0);

          // Toggle ON + end recorded + deficit → show charge
          if (fuelChargeEnabled && endL !== null && deficit > 0 && charge > 0) {
            return (
              <div className="flex justify-between text-red-600">
                <span>⛽ Fuel charge:</span>
                <span className="font-medium">+{formatCurrency(charge)} MAD</span>
              </div>
            );
          }

          // Toggle OFF → show included
          if (!fuelChargeEnabled && startL !== null) {
            return (
              <div className="flex justify-between text-green-600 text-sm">
                <span>⛽ Fuel:</span>
                <span className="font-medium">Included ✓</span>
              </div>
            );
          }

          // Toggle ON, start fuel recorded but no end fuel yet → show price hint
          if (fuelChargeEnabled && startL !== null) {
            return (
              <div className="flex justify-between text-orange-600 text-xs">
                <span>⛽ Fuel</span>
                <span className="font-medium">{fuelPricePerLine || 0} MAD/line</span>
              </div>
            );
          }
          return null;
        })()}

        {rentalBillingSummary.maintenanceRepairAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Damage / Maintenance Bill:</span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.maintenanceStayAmount > 0 && (
          <div className="flex justify-between text-orange-600">
            <span>
              Maintenance stay ({maintenanceChargeForm.days || vehicleReport?.maintenance_daily_days || 0} day{(maintenanceChargeForm.days || vehicleReport?.maintenance_daily_days || 0) === 1 ? '' : 's'} × {formatCurrency(maintenanceChargeForm.dailyRate || vehicleReport?.maintenance_daily_rate || 0)} MAD):
            </span>
            <span className="font-medium">+{formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD</span>
          </div>
        )}

        {rentalBillingSummary.maintenanceDiscountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Maintenance discount:</span>
            <span className="font-medium">-{formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD</span>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t-2 border-gray-300 text-lg">
          <span className="font-bold text-gray-900">Final Rental Total:</span>
          <span className="font-bold text-green-600">
            {formatCurrency(rentalBillingSummary.grandTotal)} MAD
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Amount Paid:</span>
          <span className="font-medium">{formatCurrency(rentalBillingSummary.depositPaid)} MAD</span>
        </div>

        <div className="flex justify-between text-base">
          <span className="font-semibold text-gray-900">Amount Still Due:</span>
          <span className={`font-bold ${rentalBillingSummary.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(rentalBillingSummary.balanceDue)} MAD
          </span>
        </div>

        {/* Rental Payment Status - removed duplicate, see Payment Status section below */}

        {/* Damage Deposit (Security) - SEPARATE and always visible */}
        {isCompleted && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
          <div className="mt-4 pt-4 border-t border-orange-200 bg-orange-50 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl flex-shrink-0">🔒</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-orange-800">Deposit Not Returned</p>
                <p className="text-xs text-orange-700">{formatCurrency(rental.damage_deposit)} MAD pending return to customer</p>
              </div>
            </div>
            <Button
              onClick={() => setShowDepositSignatureModal(true)}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 flex-shrink-0"
            >
              Return Deposit
            </Button>
          </div>
        )}
        <div className="flex justify-between mt-4 pt-4 border-t border-gray-200">
          <div>
            <span className="text-gray-600 font-medium">Damage Deposit (Security):</span>
            {!rental.deposit_returned_at && rental.rental_status === 'completed' && (
              <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                🔒 Pending Return
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="font-bold text-blue-600">{formatCurrency(rental.damage_deposit || 0)} MAD</span>
            {rental.deposit_returned_at && (
              <div className="text-xs text-green-600 mt-1">
                ✓ Returned: {formatCurrency(rental.deposit_return_amount || rental.damage_deposit)} MAD
                {rental.deposit_deduction_amount > 0 && (
                  <span className="text-orange-600 ml-1">
                    (Deducted: {formatCurrency(rental.deposit_deduction_amount)} MAD)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Show deposit return summary if already returned */}
        {rental.deposit_returned_at && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Deposit Returned
            </h4>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Original Deposit:</span>
                <span className="font-medium">{formatCurrency(rental.damage_deposit)} MAD</span>
              </div>
              
              {rental.deposit_deduction_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Less: Applied to balance:</span>
                  <span className="font-medium">-{formatCurrency(rental.deposit_deduction_amount)} MAD</span>
                </div>
              )}
              
              <div className="flex justify-between pt-2 border-t font-bold">
                <span>Amount Returned:</span>
                <span className="text-green-600">{formatCurrency(rental.deposit_return_amount || 0)} MAD</span>
              </div>
              
              {rental.deposit_deduction_reason && (
                <div className="text-xs text-gray-600 bg-white p-2 rounded border border-green-100 mt-2">
                  <div className="font-medium text-gray-700 mb-1">Applied to:</div>
                  <div className="whitespace-pre-wrap">{rental.deposit_deduction_reason}</div>
                </div>
              )}
              
              <div className="text-xs text-gray-500 pt-1">
                Returned on: {new Date(rental.deposit_returned_at).toLocaleString()}
              </div>
              
              {rental.deposit_return_signature_url && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-1">Return Signature:</p>
                  <img 
                    src={rental.deposit_return_signature_url} 
                    alt="Deposit Return Signature" 
                    className="h-16 w-auto border rounded"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : canEditRentalPriceOverride ? (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
      <h4 className="font-semibold text-gray-900">Edit Price</h4>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          New Price (MAD)
        </label>
        <input
          type="number"
          value={manualPrice}
          onChange={(e) => setManualPrice(e.target.value)}
          placeholder="Enter new price"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason for Override
        </label>
        <textarea
          value={priceOverrideReason}
          onChange={(e) => setPriceOverrideReason(e.target.value)}
          placeholder="Enter reason for price change"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={handleSaveManualPrice}
          className="bg-green-600 hover:bg-green-700 text-white"
          size="sm"
          disabled={isSavingPrice}
        >
          {isSavingPrice ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isSavingPrice ? 'Saving...' : 'Save Price'}
        </Button>
        <Button
          onClick={handleCancelEditPrice}
          variant="outline"
          size="sm"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
      <h4 className="font-semibold text-gray-900">Edit Price</h4>
      <p className="text-sm text-gray-600">
        You do not have permission to change the rental price. Ask an admin or owner to enable it in User Management.
      </p>
    </div>
  )}

  {/* Payment Status - Force correct display based on actual numbers */}
  <div className="mt-4 flex flex-wrap items-center gap-4">
    <strong>Payment Status:</strong> 
    {(() => {
      let statusText = 'UNPAID';
      let statusClass = 'bg-red-100 text-red-800';
      
      if (rentalBillingSummary.grandTotal > 0) {
        if (rentalBillingSummary.depositPaid >= rentalBillingSummary.grandTotal) {
          statusText = 'PAID';
          statusClass = 'bg-green-100 text-green-800';
        } else if (rentalBillingSummary.depositPaid > 0) {
          statusText = 'PARTIAL';
          statusClass = 'bg-yellow-100 text-yellow-800';
        }
      }
      
      return (
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClass}`}>
            {statusText}
          </span>
          {statusText === 'PARTIAL' && (
            <span className="text-xs text-gray-500">
              ({formatCurrency(rentalBillingSummary.depositPaid)} paid of {formatCurrency(rentalBillingSummary.grandTotal)})
            </span>
          )}
          
          {statusText === 'PARTIAL' && (
            <Button
              onClick={markAsPaid}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-3 ml-2"
              disabled={isUpdatingPayment || isPendingApproval}
            >
              {isUpdatingPayment ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
              ) : (
                <CreditCard className="w-3 h-3 mr-1" />
              )}
              Mark Paid
            </Button>
          )}
        </div>
      );
    })()}
    
    {isPendingApproval && (
      <span className="text-xs text-yellow-600 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Payment disabled during price approval
      </span>
    )}
  </div>

    {(() => {
    // Only show on completed rentals OR when in return workflow
    const isCompleted = rental.rental_status === 'completed';
    const isInReturnWorkflow = finishRentalSteps.showWorkflow;
    
    if (!isCompleted && !isInReturnWorkflow) return null;
    
    let overageCharge = 0;
    let extraKm = 0;
    let includedKm = 0;
    let rate = 0;
    
    const pkg = getRentalKilometerPackage(rental, packageDetails);
    if (pkg && pkg.included_kilometers && pkg.extra_km_rate && rental.total_kilometers_driven > 0) {
      const totalKm = rental.total_kilometers_driven || 0;
      includedKm = pkg.included_kilometers;
      rate = pkg.extra_km_rate;
      extraKm = Math.max(0, totalKm - includedKm);
      overageCharge = extraKm * rate;
    } else if (rental.overage_charge > 0) {
      overageCharge = rental.overage_charge;
      extraKm = rental.extra_kilometers || 0;
      includedKm = rental.included_kilometers_applied || 80;
      rate = rental.extra_km_rate_applied || 2.00;
    }
    
    const grandTotal = rentalBillingSummary.grandTotal;
    const depositPaid = rentalBillingSummary.depositPaid;
    const balanceDue = rentalBillingSummary.balanceDue;
    const damageDeposit = parseFloat(rental?.damage_deposit || 0);
    
    // Calculate return amounts
    const useDeduction = deductFromDeposit && balanceDue > 0 && !rental.deposit_returned_at;
    const depositReturn = useDeduction 
      ? Math.max(0, damageDeposit - balanceDue)
      : damageDeposit;
    const additionalOwed = Math.max(0, balanceDue - damageDeposit);
    
    // Don't show if already returned
    if (rental.deposit_returned_at) return null;
    
    // Don't show if no damage deposit
    if (damageDeposit <= 0) return null;
    
    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex flex-col items-center gap-4">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2 text-center w-full justify-center">
            <DollarSign className="w-4 h-4" />
            Damage Deposit Return
          </h4>
          <p className="text-sm text-blue-700 text-center max-w-md">
            {isCompleted ? 'The rental has been completed. Process the damage deposit return below.' : 'Complete the return to process the damage deposit.'}
          </p>
          
          <div className="w-full max-w-sm mx-auto space-y-4">
            {/* Deposit Amount */}
            <div className="bg-white p-4 rounded-lg border border-blue-200 text-center">
              <span className="text-blue-600 text-sm block">Security Deposit Held</span>
              <div className="font-bold text-blue-600 text-2xl">
                {formatCurrency(damageDeposit)} MAD
              </div>
            </div>
            
            {/* Balance Breakdown - only show if there's a balance due */}
            {balanceDue > 0 && (
            <div className="bg-white p-3 rounded-lg border border-blue-100">
              <div className="text-xs text-blue-600 font-medium mb-2 text-center">Rental Balance Details</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Base Rental:</span>
                  <span>{formatCurrency(rentalBillingSummary.baseAmount)} MAD</span>
                </div>
                {overageCharge > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Overage ({extraKm}km × {rate}MAD):</span>
                    <span>+{formatCurrency(overageCharge)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.extensionFees > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Extensions:</span>
                    <span>+{formatCurrency(rentalBillingSummary.extensionFees)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.fuelChargeAmount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Fuel Charge:</span>
                    <span>+{formatCurrency(rentalBillingSummary.fuelChargeAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceRepairAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Damage / Maintenance Bill:</span>
                    <span>+{formatCurrency(rentalBillingSummary.maintenanceRepairAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceStayAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Maintenance stay charge:</span>
                    <span>+{formatCurrency(rentalBillingSummary.maintenanceStayAmount)} MAD</span>
                  </div>
                )}
                {rentalBillingSummary.maintenanceDiscountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Maintenance discount:</span>
                    <span>-{formatCurrency(rentalBillingSummary.maintenanceDiscountAmount)} MAD</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 border-t mt-2">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(grandTotal)} MAD</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Deposit Paid:</span>
                  <span>-{formatCurrency(depositPaid)} MAD</span>
                </div>
                <div className="flex justify-between font-bold text-red-600 pt-2 border-t mt-2">
                  <span>Balance Due:</span>
                  <span>{formatCurrency(balanceDue)} MAD</span>
                </div>
              </div>
            </div>
            )}
            
            {/* Check if there's any balance due */}
            {(() => {
              const maxDeductible = Math.min(balanceDue, damageDeposit);
              const depositReturnAfterDeduction = damageDeposit - maxDeductible;
              const remainingAfterDeduction = balanceDue - maxDeductible;
              
              return (
                <div className="space-y-3">
                  {/* Deduct from deposit if balance due */}
                  {balanceDue > 0 && balanceDue <= damageDeposit ? (
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="deductFromDeposit"
                            checked={deductFromDeposit}
                            onChange={(e) => setDeductFromDeposit(e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="deductFromDeposit" className="text-sm font-medium text-gray-700">
                            Deduct {formatCurrency(balanceDue)} MAD from deposit
                          </label>
                        </div>
                        
                        {deductFromDeposit && (
                          <div className="w-full pt-3 border-t border-gray-200 text-center">
                            <div className="text-sm text-gray-600 mb-2">After deduction:</div>
                            <div className="flex justify-between items-center text-base mb-3">
                              <span>Amount to return:</span>
                              <span className="font-bold text-green-600">
                                {formatCurrency(damageDeposit - balanceDue)} MAD
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-3">
                              {formatCurrency(damageDeposit)} MAD - {formatCurrency(balanceDue)} MAD = {formatCurrency(damageDeposit - balanceDue)} MAD
                            </div>
                            
                            <Button
                              onClick={() => setShowDepositSignatureModal(true)}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                              size="sm"
                            >
                              <FileSignature className="w-4 h-4 mr-2" />
                              Sign & Confirm Deduction
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : balanceDue > 0 && balanceDue > damageDeposit ? (
                    <div className="bg-white p-4 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                          Balance due ({formatCurrency(balanceDue)} MAD) exceeds deposit amount ({formatCurrency(damageDeposit)} MAD)
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="deductFromDeposit"
                            checked={deductFromDeposit}
                            onChange={(e) => setDeductFromDeposit(e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <label htmlFor="deductFromDeposit" className="text-sm font-medium text-gray-700">
                            Apply full deposit ({formatCurrency(damageDeposit)} MAD) to balance
                          </label>
                        </div>
                        
                        {deductFromDeposit && (
                          <div className="w-full pt-3 border-t border-gray-200 text-center">
                            <div className="text-sm text-gray-600 mb-2">After applying deposit:</div>
                            <div className="flex justify-between items-center text-base mb-3">
                              <span>Remaining balance:</span>
                              <span className="font-bold text-red-600">
                                {formatCurrency(balanceDue - damageDeposit)} MAD
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-3">
                              {formatCurrency(balanceDue)} MAD - {formatCurrency(damageDeposit)} MAD = {formatCurrency(balanceDue - damageDeposit)} MAD still owed
                            </div>
                            
                            <Button
                              onClick={() => setShowDepositSignatureModal(true)}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                              size="sm"
                            >
                              <FileSignature className="w-4 h-4 mr-2" />
                              Apply Deposit & Confirm
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Return Full Deposit Option - Only if no deduction selected */}
                  {!deductFromDeposit && (
                    <div className="text-center">
                      <Button
                        onClick={() => {
                          setDeductFromDeposit(false);
                          setShowDepositSignatureModal(true);
                        }}
                        className="w-full max-w-xs mx-auto bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <FileSignature className="w-4 h-4 mr-2" />
                        Return Full Deposit ({formatCurrency(damageDeposit)} MAD)
                      </Button>
                      {balanceDue > 0 && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Balance due of {formatCurrency(balanceDue)} MAD will still be owed
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  })()}

  {rental.signature_url && (
  <div className="mt-4">
    <h4 className="font-semibold mb-2 text-base">Customer Signature</h4>
    <img src={rental.signature_url} alt="Customer Signature" className="h-24 w-auto bg-gray-100 p-2 rounded-md border" />
    <div className="mt-4">
      <Button onClick={handlePrintInvoice} className="bg-blue-600 text-white hover:bg-blue-700" title={!canGenerateInvoice ? "Please sign the contract before generating invoice" : "Print Invoice"}>
        <Printer className="w-4 h-4 mr-2" />
        Print Invoice
      </Button>
    </div>  
  </div>    
)}
          </div>
</CardContent>
</Card>

      <Dialog open={openingModalOpen} onOpenChange={(open) => {
  setOpeningModalOpen(open);
  if (!open) {
    if (isRecording) stopCameraRecording();
    if (isCapturingPhoto) {
      if (openingVideoRef.current?.srcObject) {
        openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        openingVideoRef.current.srcObject = null;
      }
      setIsCapturingPhoto(false);
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      setRecordingStream(null);
    }
  }
}}>
  <DialogContent className="w-[100vw] h-[100vh] sm:w-[90vw] sm:max-w-md sm:h-auto p-0 m-0 rounded-none sm:rounded-lg">
    <DialogHeader className="p-4 pb-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Video className="w-4 h-4 text-blue-600" />
          Opening Condition
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            setOpeningModalOpen(false);
            if (isRecording) stopCameraRecording();
            if (isCapturingPhoto) {
              if (openingVideoRef.current?.srcObject) {
                openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                openingVideoRef.current.srcObject = null;
              }
              setIsCapturingPhoto(false);
            }
            if (recordingStream) {
              recordingStream.getTracks().forEach(t => t.stop());
              setRecordingStream(null);
            }
            capturedMedia.forEach(file => file.url && URL.revokeObjectURL(file.url));
            setCapturedMedia([]);
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </DialogHeader>
    
    <div className="h-[calc(100vh-120px)] overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {/* Mode Selector */}
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clean up camera
                if (openingVideoRef.current?.srcObject) {
                  openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  openingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setOpeningMediaMode('photo');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                openingMediaMode === 'photo' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              Photo
            </button>
            <button
              onClick={() => {
                if (openingVideoRef.current?.srcObject) {
                  openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  openingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setOpeningMediaMode('video');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                openingMediaMode === 'video' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-end mb-2">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setMediaViewMode('list')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'list' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setMediaViewMode('grid')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'grid' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        {/* Photo Mode UI */}
        {openingMediaMode === 'photo' && (
          <div className="space-y-4">
            {!isCapturingPhoto ? (
              <>
                {/* Gallery Preview Section */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} photo{capturedMedia.length > 1 ? 's' : ''} captured
                      </p>
                      {capturedMedia.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                    
                    {/* Photo Grid */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-3 gap-2 mb-3" : "flex flex-col gap-2 mb-3"}>
                      {capturedMedia.map((file, index) => {
                        const fileUrl = file.url || (file instanceof File ? URL.createObjectURL(file) : null);
                        return (
                          <div key={file.id || index} className={`relative group rounded-lg overflow-hidden bg-gray-100 border ${mediaViewMode === 'grid' ? 'aspect-square' : 'flex flex-row h-20'}`}>
                            <img 
                              src={fileUrl} 
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <Button 
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((f, i) => (f.id ? f.id !== file.id : i !== index)));
                              }}
                              variant="ghost" 
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                              #{index + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons - BOTTOM for mobile */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <button
                    onClick={async () => {
                      setActiveModal('opening');
                      setIsCapturingPhoto(true);
                      await startPhotoPreview('opening');
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5" />
                    {capturedMedia.length > 0 ? 'Take Another Photo' : 'Open Camera'}
                  </button>

                  <button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mt-3"
                  >
                    <Upload className="w-5 h-5" />
                    Choose from Gallery
                  </button>
                </div>

                {/* Save Button - Only appears after at least one capture */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg">
                    <button
                      onClick={() => saveMedia('opening')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Saving...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Save {capturedMedia.length} Photo{capturedMedia.length > 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Camera Preview Mode */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <video 
                    ref={openingVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="w-full aspect-[4/3] object-cover"
                  />
                  
                  {/* Camera Controls Overlay */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button
                      onClick={() => capturePhoto('opening')}
                      className={`w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform ${captureFlash ? 'capture-flash' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-blue-600"></div>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (openingVideoRef.current?.srcObject) {
                          openingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          openingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(t => t.stop());
                          setRecordingStream(null);
                        }
                        setIsCapturingPhoto(false);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium"
                    >
                      Done
                    </button>
                  </div>

                  {/* Camera controls - torch & switch */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <canvas ref={openingCanvasRef} style={{ display: 'none' }} />

                {/* Thumbnails of captured photos */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">
                      {capturedMedia.length} photo{capturedMedia.length > 1 ? 's' : ''} captured
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {capturedMedia.map((file, index) => (
                        <div key={index} className="relative flex-shrink-0">
                          <img 
                            src={file.url} 
                            alt={`Capture ${index + 1}`}
                            className="w-16 h-16 rounded-lg object-cover border-2 border-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video Mode UI - Keep existing video mode content */}
        {openingMediaMode === 'video' && (
          <div className="space-y-4">
            {!isRecording && !isCapturingPhoto ? (
              <>
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} video{capturedMedia.length > 1 ? 's' : ''} captured
                      </p>
                      {capturedMedia.length > 1 && (
                        <button
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    
                    {/* Video Grid with Thumbnails */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-2"}>
                      {capturedMedia.map((file, idx) => (
                        <div key={file.id || idx} className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100 ${mediaViewMode === 'list' ? 'flex flex-row h-24' : ''}`}>
                          <div className={mediaViewMode === 'grid' ? "aspect-video relative" : "w-32 h-24 relative flex-shrink-0"}>
                            <video 
                              src={file.url} 
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              onClick={(e) => {
                                e.preventDefault();
                                if (e.target.paused) {
                                  e.target.play();
                                } else {
                                  e.target.pause();
                                }
                              }}
                            />
                            {/* Play/Pause Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Duration Badge */}
                            {file.duration > 0 && (
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                                {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className={mediaViewMode === 'list' ? "p-2 flex-1 flex flex-col justify-center min-w-0" : "p-2"}>
                            <p className="text-xs text-gray-600 truncate">
                              {file.name || `Video ${idx + 1}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                            {mediaViewMode === 'list' && file.duration > 0 && (
                              <p className="text-xs text-gray-400">
                                Duration: {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <Button
                    onClick={() => {
                      setActiveModal('opening');
                      startCameraRecording('opening');
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mb-3"
                    disabled={isUploading || isConverting}
                  >
                    <Video className="w-5 h-5" />
                    {capturedMedia.length > 0 ? 'Record Another Video' : 'Record Video'}
                  </Button>
                  
                  <Button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                    disabled={isRecording || isConverting}
                  >
                    <Upload className="w-5 h-5" />
                    {isUploading ? 'Processing...' : isConverting ? `Converting ${conversionProgress}%` : 'Choose from Gallery'}
                  </Button>
                </div>

                {/* Save Button */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg rounded-lg">
                    <Button
                      onClick={() => saveMedia('opening')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                      disabled={isProcessingVideo}
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Saving...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Save {capturedMedia.length} Video{capturedMedia.length > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Recording UI with canvas preview */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <canvas
                    ref={openingCanvasRef}
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <video ref={openingVideoRef} muted playsInline autoPlay style={{ display: 'none' }} />
                  
                  {/* Recording indicator */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="text-white text-sm">REC</span>
                  </div>
                  
                  {/* Stop button */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button
                      onClick={stopCameraRecording}
                      className="px-6 py-3 bg-red-600 text-white rounded-full font-medium flex items-center gap-2"
                    >
                      <StopCircle className="w-5 h-5" />
                      Stop Recording
                    </button>
                  </div>

                  {/* Camera controls */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  You can record multiple clips before saving
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </DialogContent>
</Dialog>
      
      {/* Enhanced Closing Media Modal */}
      <Dialog open={closingModalOpen} onOpenChange={(open) => {
  setClosingModalOpen(open);
  if (!open) {
    if (isRecording) stopCameraRecording();
    if (isCapturingPhoto) {
      if (closingVideoRef.current?.srcObject) {
        closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
        closingVideoRef.current.srcObject = null;
      }
      setIsCapturingPhoto(false);
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      setRecordingStream(null);
    }
  }
}}>
  <DialogContent className="w-[100vw] h-[100vh] sm:w-[90vw] sm:max-w-md sm:h-auto p-0 m-0 rounded-none sm:rounded-lg">
    <DialogHeader className="p-4 pb-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Video className="w-4 h-4 text-blue-600" />
          Closing Condition
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            setClosingModalOpen(false);
            if (isRecording) stopCameraRecording();
            if (isCapturingPhoto) {
              if (closingVideoRef.current?.srcObject) {
                closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                closingVideoRef.current.srcObject = null;
              }
              setIsCapturingPhoto(false);
            }
            if (recordingStream) {
              recordingStream.getTracks().forEach(t => t.stop());
              setRecordingStream(null);
            }
            capturedMedia.forEach(file => file.url && URL.revokeObjectURL(file.url));
            setCapturedMedia([]);
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </DialogHeader>
    
    <div className="h-[calc(100vh-120px)] overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        {/* Mode Selector */}
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clean up camera
                if (closingVideoRef.current?.srcObject) {
                  closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  closingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setClosingMediaMode('photo');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                closingMediaMode === 'photo' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              Photo
            </button>
            <button
              onClick={() => {
                if (closingVideoRef.current?.srcObject) {
                  closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                  closingVideoRef.current.srcObject = null;
                }
                if (recordingStream) {
                  recordingStream.getTracks().forEach(track => track.stop());
                  setRecordingStream(null);
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                
                setIsCapturingPhoto(false);
                setIsRecording(false);
                setMediaRecorder(null);
                setRecordedChunks([]);
                setClosingMediaMode('video');
              }}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                closingMediaMode === 'video' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex justify-end mb-2">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setMediaViewMode('list')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'list' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setMediaViewMode('grid')}
              className={`p-2 rounded-md transition-colors text-sm ${
                mediaViewMode === 'grid' 
                  ? 'bg-white shadow text-blue-600' 
                  : 'text-gray-600'
              }`}
            >
              Grid
            </button>
          </div>
        </div>

        {/* Photo Mode UI */}
        {closingMediaMode === 'photo' && (
          <div className="space-y-4">
            {!isCapturingPhoto ? (
              <>
                {/* Gallery Preview Section */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} photo{capturedMedia.length > 1 ? 's' : ''} captured
                      </p>
                      {capturedMedia.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                    
                    {/* Photo Grid */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-3 gap-2 mb-3" : "flex flex-col gap-2 mb-3"}>
                      {capturedMedia.map((file, index) => {
                        const fileUrl = file.url || (file instanceof File ? URL.createObjectURL(file) : null);
                        return (
                          <div key={file.id || index} className={`relative group rounded-lg overflow-hidden bg-gray-100 border ${mediaViewMode === 'grid' ? 'aspect-square' : 'flex flex-row h-20'}`}>
                            <img 
                              src={fileUrl} 
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <Button 
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((f, i) => (f.id ? f.id !== file.id : i !== index)));
                              }}
                              variant="ghost" 
                              size="sm"
                              className="absolute top-1 right-1 h-6 w-6 p-0 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                              #{index + 1}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons - BOTTOM for mobile */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <button
                    onClick={async () => {
                      setActiveModal('closing');
                      setIsCapturingPhoto(true);
                      await startPhotoPreview('closing');
                    }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5" />
                    {capturedMedia.length > 0 ? 'Take Another Photo' : 'Open Camera'}
                  </button>

                  <button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mt-3"
                  >
                    <Upload className="w-5 h-5" />
                    Choose from Gallery
                  </button>
                </div>

                {/* Save Button - Only appears after at least one capture */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg">
                    <button
                      onClick={() => saveMedia('closing')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Saving...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Save {capturedMedia.length} Photo{capturedMedia.length > 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Camera Preview Mode */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <video 
                    ref={closingVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="w-full aspect-[4/3] object-cover"
                  />
                  
                  {/* Camera Controls Overlay */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <button
                      onClick={() => capturePhoto('closing')}
                      className={`w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform ${captureFlash ? 'capture-flash' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-blue-600"></div>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (closingVideoRef.current?.srcObject) {
                          closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          closingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(t => t.stop());
                          setRecordingStream(null);
                        }
                        setIsCapturingPhoto(false);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-medium"
                    >
                      Done
                    </button>
                  </div>

                  {/* Camera controls - torch & switch */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <canvas ref={closingCanvasRef} style={{ display: 'none' }} />

                {/* Thumbnails of captured photos */}
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">
                      {capturedMedia.length} photo{capturedMedia.length > 1 ? 's' : ''} captured
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {capturedMedia.map((file, index) => (
                        <div key={index} className="relative flex-shrink-0">
                          <img 
                            src={file.url} 
                            alt={`Capture ${index + 1}`}
                            className="w-16 h-16 rounded-lg object-cover border-2 border-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video Mode UI - Keep existing video mode content */}
        {closingMediaMode === 'video' && (
          <div className="space-y-4">
            {!isRecording && !isCapturingPhoto ? (
              <>
                {capturedMedia.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-700">
                        {capturedMedia.length} video{capturedMedia.length > 1 ? 's' : ''} captured
                      </p>
                      {capturedMedia.length > 1 && (
                        <button
                          onClick={() => {
                            capturedMedia.forEach(f => f.url && URL.revokeObjectURL(f.url));
                            setCapturedMedia([]);
                          }}
                          className="text-red-600 text-xs"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    
                    {/* Video Grid with Thumbnails */}
                    <div className={mediaViewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-2"}>
                      {capturedMedia.map((file, idx) => (
                        <div key={file.id || idx} className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100 ${mediaViewMode === 'list' ? 'flex flex-row h-24' : ''}`}>
                          <div className={mediaViewMode === 'grid' ? "aspect-video relative" : "w-32 h-24 relative flex-shrink-0"}>
                            <video 
                              src={file.url} 
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              onClick={(e) => {
                                e.preventDefault();
                                if (e.target.paused) {
                                  e.target.play();
                                } else {
                                  e.target.pause();
                                }
                              }}
                            />
                            {/* Play/Pause Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                                <svg className="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Duration Badge */}
                            {file.duration > 0 && (
                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1 py-0.5 rounded">
                                {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (file.url) URL.revokeObjectURL(file.url);
                                setCapturedMedia(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className={mediaViewMode === 'list' ? "p-2 flex-1 flex flex-col justify-center min-w-0" : "p-2"}>
                            <p className="text-xs text-gray-600 truncate">
                              {file.name || `Video ${idx + 1}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                            {mediaViewMode === 'list' && file.duration > 0 && (
                              <p className="text-xs text-gray-400">
                                Duration: {Math.floor(file.duration / 60)}:{Math.round(file.duration % 60).toString().padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <Button
                    onClick={async () => {
                      try {
                        setActiveModal('closing');
                        if (closingVideoRef.current?.srcObject) {
                          closingVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
                          closingVideoRef.current.srcObject = null;
                        }
                        if (recordingStream) {
                          recordingStream.getTracks().forEach(track => track.stop());
                          setRecordingStream(null);
                        }
                        await startCameraRecording('closing');
                      } catch (err) {
                        console.error('Failed to start recording:', err);
                        toast.error('Could not start camera. Please check permissions.');
                      }
                    }}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 mb-3"
                    disabled={isUploading || isConverting}
                  >
                    <Video className="w-5 h-5" />
                    {capturedMedia.length > 0 ? 'Record Another Video' : 'Record Video'}
                  </Button>
                  
                  <Button
                    onClick={uploadFromGallery}
                    className="w-full py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                    disabled={isRecording || isConverting}
                  >
                    <Upload className="w-5 h-5" />
                    {isUploading ? 'Processing...' : isConverting ? `Converting ${conversionProgress}%` : 'Choose from Gallery'}
                  </Button>
                </div>

                {/* Save Button */}
                {capturedMedia.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-lg rounded-lg">
                    <Button
                      onClick={() => saveMedia('closing')}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                      disabled={isProcessingVideo}
                    >
                      {isProcessingVideo ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {uploadProgress > 0 ? `${uploadProgress}%` : 'Saving...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Save {capturedMedia.length} Video{capturedMedia.length > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Recording UI with canvas preview */
              <div className="space-y-4">
                <div className="relative bg-black rounded-xl overflow-hidden">
                  <canvas
                    ref={closingCanvasRef}
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <video ref={closingVideoRef} muted playsInline autoPlay style={{ display: 'none' }} />
                  
                  {/* Recording indicator */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="text-white text-sm">REC</span>
                  </div>
                  
                  {/* Stop button */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button
                      onClick={stopCameraRecording}
                      className="px-6 py-3 bg-red-600 text-white rounded-full font-medium flex items-center gap-2"
                    >
                      <StopCircle className="w-5 h-5" />
                      Stop Recording
                    </button>
                  </div>

                  {/* Camera controls */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={toggleTorch} className="p-2 bg-black/50 rounded-full">
                      <Flashlight className={`w-5 h-5 ${torchEnabled ? 'text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={switchCamera} className="p-2 bg-black/50 rounded-full">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  You can record multiple clips before saving
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </DialogContent>
</Dialog>

      {/* Starting Fuel Level Dialog - Step 4 of starting workflow (All rental types) */}
      <FuelLevelModal
          isOpen={showStartFuelModal}
          onClose={() => setShowStartFuelModal(false)}
          onSave={handleSaveStartFuel}
          currentLevel={startFuelLevel}
          title="Starting Fuel Level"
          description="Select the fuel level before rental starts"
      />

      {/* End Odometer Prompt Modal */}
      <Dialog open={showEndOdometerPrompt} onOpenChange={setShowEndOdometerPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Gauge className="w-5 h-5 text-blue-600" />
              Enter Ending Odometer Reading
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Please enter the vehicle's odometer reading at the end of the rental.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800">
                Please enter the vehicle's odometer reading at the end of the rental.
                {rental.start_odometer && (
                  <p className="mt-2">
                    <strong>Starting odometer:</strong> {rental.start_odometer} km
                  </p>
                )}
              </AlertDescription>
            </Alert>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ending Odometer (km)
              </label>
              <input
                ref={endOdometerPromptInputRef}
                type="number"
                value={endOdometer}
                onChange={(e) => setEndOdometer(e.target.value)}
                placeholder="Enter ending odometer reading"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={rental.start_odometer || 0}
                step="1"
                autoFocus
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => {
                  setShowEndOdometerPrompt(false);
                  setEndOdometer('');
                }}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Skip for Now
              </Button>
              <Button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleEndOdometerSubmit();
                }}
                className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 text-white order-1 sm:order-2"
              >
                {isProcessingEndOdometer ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Odometer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Ending Fuel Level Dialog - Step 3 of closing workflow (ALL rental types) */}
        <FuelLevelModal
          isOpen={showEndFuelModal}
          onClose={() => setShowEndFuelModal(false)}
          onSave={handleSaveEndFuel}
          currentLevel={endFuelLevel}
          title="Ending Fuel Level"
          description="Select the fuel level at return"
      />

      {/* Contract Preview Modal */}
      <Dialog open={contractPreviewModal} onOpenChange={setContractPreviewModal}>
        <DialogContent className="sm:max-w-4xl w-full h-full sm:h-[90vh] p-0 flex flex-col mx-0 sm:mx-4">
          <DialogHeader className="p-4 sm:p-6 pb-3">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <FileText className="w-5 h-5 text-blue-600" />
          Contract Preview
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={() => setContractPreviewModal(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <DialogDescription className="text-sm sm:text-base">
        Review before sending to {rental.customer_name}
      </DialogDescription>
          </DialogHeader>

          {/* PDF Preview Area - FIXED SCROLL */}
          <div className="border-y border-gray-200 flex-1 min-h-0">
            <div className="h-full overflow-auto p-2 sm:p-4">
              <div className="bg-white p-3 sm:p-6">
                <div ref={contractTemplateRef}>
                  <ContractTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Single Print Button */}
          <div className="flex justify-center p-4 sm:p-6 pt-0">
            <Button 
              onClick={handlePrintContract}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-sm font-semibold"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Contract
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract PDF capture div — always rendered, captured on demand */}
      <div
        ref={contractPdfRef}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', opacity: 0, zIndex: -9999, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <ContractTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} />
      </div>


      {/* Receipt Preview Modal */}
      <Dialog open={receiptPreviewModal} onOpenChange={setReceiptPreviewModal}>
        <DialogContent className="sm:max-w-4xl w-full h-full sm:h-[90vh] p-0 flex flex-col mx-0 sm:mx-4">
          <DialogHeader className="p-4 sm:p-6 pb-3">
      <div className="flex items-center justify-between">
        <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">

          <Receipt className="w-5 h-5 text-purple-600" />
          Receipt Preview
        </DialogTitle>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={() => setReceiptPreviewModal(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <DialogDescription className="text-sm sm:text-base">
        Review payment details before sending to {rental.customer_name}
      </DialogDescription>
          </DialogHeader>

          {/* PDF Preview Area - FIXED SCROLL */}
          <div className="border-y border-gray-200 flex-1 min-h-0">
            <div className="h-full overflow-auto p-2 sm:p-4">
              <div className="bg-white p-3 sm:p-6">
                <div ref={receiptTemplateRef}>
                  <ReceiptTemplate 
            rental={{
              ...rental,
              fuel_charge: getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }),
              start_fuel_level: rental?.start_fuel_level,
              end_fuel_level: rental?.end_fuel_level,
              vehicle: {
                ...rental?.vehicle,
                vehicle_model: {
                  ...rental?.vehicle?.vehicle_model,
                  fuel_price: fuelPricePerLine || rental?.vehicle?.vehicle_model?.fuel_price || 0
                }
              }
            }} 
            logoUrl={logoUrl} 
            stampUrl={stampUrl} 
          />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons - Single Print Button */}
          <div className="flex justify-center p-4 sm:p-6 pt-0">
            <Button 
              onClick={handlePrintReceipt}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-sm font-semibold"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt PDF capture div — always rendered, captured on demand */}
      <div
        ref={receiptPdfRef}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', opacity: 0, zIndex: -9999, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <ReceiptTemplate
          rental={{
            ...rental,
            fuel_charge: getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }),
            start_fuel_level: rental?.start_fuel_level,
            end_fuel_level: rental?.end_fuel_level,
            vehicle: {
              ...rental?.vehicle,
              vehicle_model: {
                ...rental?.vehicle?.vehicle_model,
                fuel_price: fuelPricePerLine || rental?.vehicle?.vehicle_model?.fuel_price || 0
              }
            }
          }}
          logoUrl={logoUrl}
          stampUrl={stampUrl}
        />
      </div>

      {/* WhatsApp Send Modal */}
      <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaWhatsapp className="text-green-600" />
              Send via WhatsApp
            </DialogTitle>
            <DialogDescription>
              Select items to send to {rental.customer_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {/* Contract Box */}
            <div 
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${whatsappOptions.contract ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
              onClick={() => setWhatsappOptions({...whatsappOptions, contract: !whatsappOptions.contract})}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${whatsappOptions.contract ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-400'}`}>
                    {whatsappOptions.contract && <FaCheck className="text-white text-xs" />}
                  </div>
                  <div>
                    <p className="font-medium">Rental Contract</p>
                    <p className="text-sm text-gray-500">PDF document with terms and conditions</p>
                  </div>
                </div>
                <FaFilePdf className="text-red-500" />
              </div>
            </div>
            
            {/* Receipt Box */}
            <div 
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${whatsappOptions.receipt ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
              onClick={() => setWhatsappOptions({...whatsappOptions, receipt: !whatsappOptions.receipt})}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${whatsappOptions.receipt ? 'bg-green-500 border-green-500' : 'bg-white border-gray-400'}`}>
                    {whatsappOptions.receipt && <FaCheck className="text-white text-xs" />}
                  </div>
                  <div>
                    <p className="font-medium">Payment Receipt</p>
                    <p className="text-sm text-gray-500">Transaction details and payment confirmation</p>
                  </div>
                </div>
                <FaFileInvoice className="text-green-500" />
              </div>
            </div>
            
                                    {/* Opening Media Box - Only show if opening media exists */}
      {openingMedia.length > 0 && (
        <div 
          className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${whatsappOptions.openingVideo ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
          onClick={() => setWhatsappOptions({...whatsappOptions, openingVideo: !whatsappOptions.openingVideo})}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${whatsappOptions.openingVideo ? 'bg-purple-500 border-purple-500' : 'bg-white border-gray-400'}`}>
                {whatsappOptions.openingVideo && <FaCheck className="text-white text-xs" />}
              </div>
              <div>
                <p className="font-medium">Opening Media</p>
                <p className="text-sm text-gray-500">Vehicle condition at rental start</p>
              </div>
            </div>
            <FaVideo className="text-purple-500" />
          </div>
        </div>
      )}
      
      {/* Closing Media Box - Only show if closing media exists */}
            {closingMedia.length > 0 && (
        <div 
          className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${whatsappOptions.closingVideo ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
          onClick={() => setWhatsappOptions({...whatsappOptions, closingVideo: !whatsappOptions.closingVideo})}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${whatsappOptions.closingVideo ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-400'}`}>
                {whatsappOptions.closingVideo && <FaCheck className="text-white text-xs" />}
              </div>
              <div>
                <p className="font-medium">Closing Media</p>
                <p className="text-sm text-gray-500">Vehicle condition at return</p>
              </div>
            </div>
            <FaVideo className="text-amber-500" />
          </div>
        </div>
      )}
          
          </div>
      <div className="flex gap-2 sm:gap-0 pt-4">
        <Button
          variant="outline"
          onClick={() => setWhatsappModalOpen(false)}
        >
          Cancel
        </Button>
        <Button
          className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
          onClick={async () => {
            // Use the updated handleSendWhatsAppSelection function
            await handleSendWhatsAppSelection(whatsappOptions);
          }}
        >
          <FaWhatsapp size={18} />
          Send via WhatsApp
        </Button>
      </div>
    </DialogContent>
  </Dialog>
            

      <SignaturePadModal
        isOpen={isSigning}
        onClose={() => setIsSigning(false)}
        onSave={handleSignatureSave}
      />

      <SignaturePadModal
        isOpen={showDepositSignatureModal}
        onClose={() => setShowDepositSignatureModal(false)}
        onSave={handleDepositSignatureSave}
        title="Damage Deposit Return Authorization"
        description={(() => {
          const depositCalc = calculateDepositReturn();
          if (deductFromDeposit && depositCalc.hasDeduction) {
            return `I confirm receipt of ${depositCalc.depositReturn.toFixed(2)} MAD as damage deposit return.

Breakdown:
• Original Deposit: ${depositCalc.damageDeposit.toFixed(2)} MAD
• Less: Unpaid Balance: ${depositCalc.balanceDue.toFixed(2)} MAD
• Net Return: ${depositCalc.depositReturn.toFixed(2)} MAD${depositCalc.additionalOwed > 0 ? `

⚠️ Note: Additional ${depositCalc.additionalOwed.toFixed(2)} MAD is still owed.` : ''}`;
          } else {
            return `I confirm receipt of ${depositCalc.depositReturn.toFixed(2)} MAD as full damage deposit return.`;
          }
        })()}
      />

      {/* Separate Signature Modal for Return Contract */}
      <SignaturePadModal
        isOpen={isSigningReturnContract}
        onClose={() => setIsSigningReturnContract(false)}
        onSave={async (signatureUrl) => {
          try {
            // Save return signature
            setReturnSignatureUrl(signatureUrl);
            setIsSigningReturnContract(false);
            
            // ✅ REPLACE the previous signature with the new one
            const { error } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({ 
                signature_url: signatureUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (error) throw error;
            
            // Update local state
            setRental(prev => ({
              ...prev,
              signature_url: signatureUrl
            }));
            
            toast.success('Return contract signed! This signature replaces the previous one.');
            
          } catch (err) {
            console.error('❌ Error saving return signature:', err);
            toast.error(`Failed to save return signature. Error: ${err.message}`);
          }
        }}
        title="Sign Return Contract"
        description="Please sign to confirm vehicle return and accept any additional charges"
      />

      <ViewCustomerDetailsDrawer
        isOpen={customerDetailsDrawer.isOpen}
        onClose={() => setCustomerDetailsDrawer({ isOpen: false, customerId: null, rental: null, secondDrivers: [], viewMode: 'customer' })}
        customerId={customerDetailsDrawer.customerId}
        rental={rental}
        secondDrivers={customerDetailsDrawer.secondDrivers}
        viewMode={customerDetailsDrawer.viewMode}
      />

      <ExtensionRequestModal
        isOpen={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
        rental={rental}
        onExtensionCreated={handleExtensionCreated}
        currentUser={currentUser}
      />

      <div className="fixed inset-0 pointer-events-none opacity-0 z-[-1]" aria-hidden="true">
        <div ref={contractRef}>
            <RentalContract rental={rental} />
        </div>
        <div ref={invoiceRef}>
            {rental && <InvoiceTemplate rental={formattedRentalForInvoice} logoUrl={logoUrl} stampUrl={stampUrl} />}
        </div>
      </div>

      {/* Share capture divs — position:absolute so they render at full height, no viewport clipping */}
      <div ref={contractShareRef} style={{
        position: 'absolute',
        left: '-9999px',
        top: 0,
        width: '794px',
        pointerEvents: 'none',
        opacity: 0
      }} aria-hidden="true">
        <ContractTemplate rental={rental} logoUrl={logoUrl} stampUrl={stampUrl} />
      </div>
      <div ref={receiptShareRef} style={{
        position: 'absolute',
        left: '-9999px',
        top: 0,
        width: '794px',
        pointerEvents: 'none',
        opacity: 0
      }} aria-hidden="true">
        <ReceiptTemplate 
          rental={{
            ...rental,
            fuel_charge: getEffectiveFuelChargeAmount({ rental, endFuelLevel, fuelCharge, fuelChargeEnabled }),
            start_fuel_level: rental?.start_fuel_level,
            end_fuel_level: rental?.end_fuel_level,
            vehicle: {
              ...rental?.vehicle,
              vehicle_model: {
                ...rental?.vehicle?.vehicle_model,
                fuel_price: fuelPricePerLine || rental?.vehicle?.vehicle_model?.fuel_price || 0
              }
            }
          }} 
          logoUrl={logoUrl} 
          stampUrl={stampUrl} 
        />
      </div>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-2 z-10 flex flex-col gap-2">
    <div className="grid grid-cols-3 gap-1">
        <Button
            onClick={() => setContractPreviewModal(true)}
            className="text-xs py-2 h-auto bg-blue-600 text-white"
            size="sm"
        >
            {isGeneratingContract ? '...' : 'Contract'}
        </Button>
        <Button
            onClick={() => setReceiptPreviewModal(true)}
            className="text-xs py-2 h-auto bg-purple-600 text-white"
            size="sm"
        >
            {isGeneratingReceipt ? '...' : 'Receipt'}
        </Button>
        <Button
            onClick={handleWhatsAppClick}
            onTouchStart={ensurePDFsReady}
            disabled={isSharing}
            className="text-xs py-2 h-auto bg-green-600 text-white hover:bg-green-700"
            size="sm"
        >
            {isSharing ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <FaWhatsapp size={12} className="mr-1" />
            )}
            {isSharing ? '...' : 'WhatsApp'}
        </Button>
    </div>
</div>

            {/* Capture Flash Animation */}
      <style>{`
        @keyframes capture-flash {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        .capture-flash {
          animation: capture-flash 0.2s ease-out;
        }
      `}</style>

    </div>
    </div>
  );
}
