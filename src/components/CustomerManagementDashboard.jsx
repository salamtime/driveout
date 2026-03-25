import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  Trash2,
  CheckCircle,
  Download,
  AlertCircle,
  Menu,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  FileText,
  Eye,
  Edit,
  Trash,
  RefreshCw
} from 'lucide-react';
import { 
  getCustomerRentalHistory,
  checkCustomerRentalHistory, 
  deleteCustomer, 
  deleteCustomers,
} from '../services/EnhancedUnifiedCustomerService.js';
import ViewCustomerDetailsDrawer from './admin/ViewCustomerDetailsDrawer';

// Supabase client imported from lib/supabase.js
const APP_ID = '4c3a7a6153'; // Keep this for table naming

const getRawCustomerDocumentValue = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return '';

    if (
      (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
      (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmedValue);
        if (typeof parsed === 'string') return parsed.trim();
        if (parsed?.url) return String(parsed.url).trim();
        if (Array.isArray(parsed) && parsed[0]) {
          return getRawCustomerDocumentValue(parsed[0]);
        }
      } catch (error) {
        console.warn('Unable to parse customer document payload:', error);
      }
    }

    return trimmedValue;
  }

  if (typeof value === 'object') {
    return String(value.url || value.path || value.publicUrl || '').trim();
  }

  return '';
};

const CUSTOMER_DOCUMENT_FALLBACK_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#f3f4f6"/>
    <rect x="140" y="120" width="520" height="360" rx="24" fill="#ffffff" stroke="#d1d5db" stroke-width="6"/>
    <text x="400" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#374151">Document Preview</text>
    <text x="400" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#6b7280">Image unavailable</text>
  </svg>
`)}`;

const getCustomerStorageLocation = (value) => {
  const rawValue = getRawCustomerDocumentValue(value);
  if (!rawValue) return null;

  const inferBucketFromPath = (storagePath) => {
    const cleanedPath = storagePath.replace(/^\/+/, '');
    const bucketName = (
      cleanedPath.startsWith('customers_ocr/') ||
      cleanedPath.startsWith('second_drivers_ocr/')
    )
      ? 'rental-documents'
      : 'id_scans';

    return { bucketName, storagePath: cleanedPath };
  };

  if (
    !rawValue.startsWith('http://') &&
    !rawValue.startsWith('https://') &&
    !rawValue.startsWith('blob:') &&
    !rawValue.startsWith('data:')
  ) {
    return inferBucketFromPath(rawValue);
  }

  try {
    const parsedUrl = new URL(rawValue);
    const match = parsedUrl.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (!match) return null;

    return {
      bucketName: match[1],
      storagePath: decodeURIComponent(match[2])
    };
  } catch (error) {
    return null;
  }
};

const normalizeCustomerDocumentUrl = (value) => {
  const rawValue = getRawCustomerDocumentValue(value);
  if (!rawValue) return '';

  if (
    rawValue.startsWith('http://') ||
    rawValue.startsWith('https://') ||
    rawValue.startsWith('blob:') ||
    rawValue.startsWith('data:') ||
    rawValue.startsWith('/')
  ) {
    return rawValue;
  }

  const location = getCustomerStorageLocation(rawValue);
  if (!location) return rawValue;

  const { data } = supabase.storage.from(location.bucketName).getPublicUrl(location.storagePath);
  return data?.publicUrl || rawValue;
};

const getSignedCustomerDocumentUrl = async (value) => {
  const location = getCustomerStorageLocation(value);
  if (!location) {
    return normalizeCustomerDocumentUrl(value);
  }

  try {
    const { data, error } = await supabase.storage
      .from(location.bucketName)
      .createSignedUrl(location.storagePath, 3600);

    if (error || !data?.signedUrl) {
      return normalizeCustomerDocumentUrl(value);
    }

    return data.signedUrl;
  } catch (error) {
    console.warn('Unable to create signed customer document URL:', error);
    return normalizeCustomerDocumentUrl(value);
  }
};

const getCustomerDocumentKind = (value) => {
  const normalizedUrl = normalizeCustomerDocumentUrl(value);
  const lowerUrl = normalizedUrl.toLowerCase();

  if (lowerUrl.startsWith('data:application/pdf') || lowerUrl.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'image';
};

// ================ FIXED IMAGE GALLERY WITH WORKING ENLARGE ================
const ImageGallery = ({ images, title, emptyMessage = "No images", gridLayout = true }) => {
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [resolvedImageUrls, setResolvedImageUrls] = React.useState({});
  const [failedImageKeys, setFailedImageKeys] = React.useState({});
  const sourceImages = Array.isArray(images) ? images : [];

  const validImages = sourceImages
    .map(img => {
      const originalUrl = typeof img === 'string' ? img : img?.url;
      const normalizedUrl = normalizeCustomerDocumentUrl(originalUrl);
      const storageLocation = getCustomerStorageLocation(originalUrl);
      const documentKind = typeof img === 'string'
        ? getCustomerDocumentKind(originalUrl)
        : (img?.documentKind || getCustomerDocumentKind(originalUrl));
      const cacheKey = `${typeof img === 'string' ? title : (img?.label || title)}::${originalUrl || normalizedUrl}`;

      return {
        ...(typeof img === 'string' ? { url: normalizedUrl } : img),
        originalUrl,
        url: normalizedUrl,
        documentKind,
        cacheKey,
        requiresSignedUrl: Boolean(storageLocation),
        bucketName: storageLocation?.bucketName || null,
      };
    })
    .filter(img => {
      const url = img?.url;
      return url && (
        url.startsWith('http') ||
        url.startsWith('/') ||
        url.startsWith('blob:') ||
        url.startsWith('data:')
      );
    });

  React.useEffect(() => {
    let isActive = true;

    const resolveStorageUrls = async () => {
      const nextResolvedEntries = await Promise.all(
        validImages.map(async (img) => {
          if (!getCustomerStorageLocation(img.originalUrl || img.url)) {
            return [img.cacheKey, img.url];
          }

          const resolvedUrl = await getSignedCustomerDocumentUrl(img.originalUrl || img.url);
          return [img.cacheKey, resolvedUrl || img.url];
        })
      );

      if (!isActive) return;

      setResolvedImageUrls(prev => {
        const nextMap = { ...prev };
        nextResolvedEntries.forEach(([cacheKey, resolvedUrl]) => {
          nextMap[cacheKey] = resolvedUrl;
        });
        return nextMap;
      });

      setFailedImageKeys(prev => {
        const nextMap = { ...prev };
        nextResolvedEntries.forEach(([cacheKey, resolvedUrl]) => {
          if (resolvedUrl) {
            delete nextMap[cacheKey];
          }
        });
        return nextMap;
      });
    };

    resolveStorageUrls();

    return () => {
      isActive = false;
    };
  }, [validImages]);

  if (sourceImages.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  const handleImageClick = (imageUrl, imageLabel, documentKind = 'image') => {
    if (documentKind === 'pdf') {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setSelectedImage({ url: imageUrl, label: imageLabel, documentKind });
  };

  if (validImages.length === 0) {
    return <p className="text-gray-500 italic py-4">No valid images</p>;
  }

  // Close modal
  const closeModal = () => {
    setSelectedImage(null);
  };
  
  return (
    <>
      <div className={gridLayout ? "grid grid-cols-2 md:grid-cols-4 gap-4" : "space-y-6"}>
        {validImages.map((img, index) => {
          const imageUrl = resolvedImageUrls[img.cacheKey] || (img.requiresSignedUrl ? '' : img.url);
          const imageLabel = typeof img === 'string' ? `${title} ${index + 1}` : img.label || `${title} ${index + 1}`;
          const isFallback = img.isFallback;
          const isPdf = img.documentKind === 'pdf';
          const hasFailed = Boolean(failedImageKeys[img.cacheKey]);
          const isResolving = img.requiresSignedUrl && !resolvedImageUrls[img.cacheKey];
          
          return (
            <div key={index} className="relative group">
              <div
                className={`${gridLayout ? 'aspect-square' : 'aspect-video'} bg-gray-50 border ${isFallback ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200'} rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${isResolving ? 'cursor-wait' : 'cursor-pointer'}`}
                onClick={() => {
                  if (isResolving) return;
                  handleImageClick(imageUrl, imageLabel, img.documentKind);
                }}
              >
                {isPdf ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-red-50">
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-sm font-semibold text-gray-800">PDF Document</div>
                    <div className="text-xs text-gray-500 mt-1">Tap to open</div>
                  </div>
                ) : isResolving ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-gray-100">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 mb-3"></div>
                    <div className="text-sm font-semibold text-gray-800">Loading document</div>
                    <div className="text-xs text-gray-500 mt-1">Preparing secure preview</div>
                  </div>
                ) : hasFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-gray-100">
                    <div className="text-4xl mb-3">🪪</div>
                    <div className="text-sm font-semibold text-gray-800">Document unavailable</div>
                    <div className="text-xs text-gray-500 mt-1">Preview unavailable</div>
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt={imageLabel}
                    className="w-full h-full object-contain p-1 hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                    onError={(e) => {
                      console.error('Image failed to load:', imageUrl);
                      e.target.onerror = null;
                      setFailedImageKeys(prev => ({ ...prev, [img.cacheKey]: true }));
                      e.target.src = CUSTOMER_DOCUMENT_FALLBACK_SVG;
                    }}
                  />
                )}
                {!gridLayout && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                )}
                
                {/* Enlarge icon overlay */}
                <div className="absolute top-2 right-2 bg-white/80 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
              <div className={`mt-2 ${gridLayout ? 'text-center' : ''}`}>
                <div className={`text-xs ${isFallback ? 'text-yellow-600' : 'text-gray-600'} font-medium`}>
                  📄 {imageLabel}
                </div>
                {!gridLayout && (
                  <div className="text-xs text-gray-400 mt-1">
                    {isFallback ? 'Sample document' : isResolving ? 'Loading secure preview' : isPdf ? 'Tap to open' : 'Click to enlarge'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* ENLARGE MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black bg-opacity-90 transition-opacity"
            onClick={closeModal}
          ></div>
          
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="inline-block align-bottom bg-transparent rounded-lg text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="relative">
                <div className="bg-transparent">
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      className="text-white hover:text-gray-300 focus:outline-none"
                      onClick={closeModal}
                    >
                      <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                <div className="bg-white rounded-lg p-1 overflow-hidden">
                  {selectedImage.documentKind === 'pdf' ? (
                    <iframe
                      src={selectedImage.url}
                      title={selectedImage.label}
                      className="w-full h-[80vh] rounded"
                    />
                  ) : (
                    <img 
                      src={selectedImage.url} 
                      alt={selectedImage.label}
                      className="max-w-full max-h-[80vh] object-contain mx-auto rounded"
                      onError={(e) => {
                        console.error('Modal image failed to load:', selectedImage.url);
                        e.target.onerror = null;
                        e.target.src = CUSTOMER_DOCUMENT_FALLBACK_SVG;
                      }}
                    />
                  )}
                </div>
                  
                  <div className="mt-4 text-center">
                    <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
                      {selectedImage.label}
                    </p>
                    <div className="mt-2 flex justify-center space-x-4">
                      <button
                        onClick={() => window.open(selectedImage.url, '_blank')}
                        className="text-white hover:text-blue-300 text-sm flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in new tab
                      </button>
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = selectedImage.url;
                          link.download = selectedImage.label.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="text-white hover:text-blue-300 text-sm flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Mobile Customer Card Component
const MobileCustomerCard = ({ customer, onView, onEdit, onDelete, isSelected, onSelect, canSelect }) => {
  const [expanded, setExpanded] = useState(false);
  const avatarPalette = getCustomerAvatarPalette(customer);
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-3 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {canSelect && (
            <div className="pt-1">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(customer.id)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
          )}
          <div className="flex-shrink-0">
            <div className={`h-12 w-12 rounded-full text-white flex items-center justify-center font-bold text-lg shadow-sm ${avatarPalette}`}>
              {getInitial(customer.full_name)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 
                  className="text-base font-semibold text-blue-600 truncate cursor-pointer hover:underline"
                  onClick={() => onView(customer)}
                >
                  {customer.full_name || 'Unknown Customer'}
                </h3>
                {customer.isBanned && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                      Banned
                    </span>
                    {customer.banNote && (
                      <span className="text-xs text-red-700 truncate">
                        {customer.banNote}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className={`ml-2 px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                customer.status === 'Active' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {customer.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center">
                <Mail className="w-3 h-3 mr-1" />
                {customer.email || 'No email'}
              </span>
              <span className="inline-flex items-center">
                <Phone className="w-3 h-3 mr-1" />
                {customer.phone || 'No phone'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center text-gray-500">
                <CreditCard className="w-3 h-3 mr-1" />
                {formatCurrency(customer.totalSpent)}
              </span>
              <span className="inline-flex items-center text-gray-500">
                <Calendar className="w-3 h-3 mr-1" />
                {formatDate(customer.created_at)}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </button>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 p-2 rounded-lg">
              <span className="text-xs text-gray-500">Nationality</span>
              <p className="text-sm font-medium text-gray-900">{customer.nationality || 'N/A'}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg">
              <span className="text-xs text-gray-500">Total Rentals</span>
              <p className="text-sm font-medium text-gray-900">{customer.totalRentals || 0}</p>
            </div>
            <div className="bg-gray-50 p-2 rounded-lg col-span-2">
              <span className="text-xs text-gray-500">Customer ID</span>
              <p className="text-xs font-mono text-gray-600 truncate">{customer.id}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={() => onView(customer)}
              className="flex items-center px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              <Eye className="w-4 h-4 mr-1" />
              View
            </button>
            <button
              onClick={() => onEdit(customer)}
              className="flex items-center px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </button>
            {customer.totalRentals === 0 && (
              <button
                onClick={() => onDelete(customer)}
                className="flex items-center px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash className="w-4 h-4 mr-1" />
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper functions moved outside component for reuse
const getInitial = (name) => {
  return name ? name.charAt(0).toUpperCase() : '?';
};

const CUSTOMER_AVATAR_PALETTES = [
  'bg-gradient-to-br from-violet-400 to-violet-500',
  'bg-gradient-to-br from-fuchsia-400 to-pink-500',
  'bg-gradient-to-br from-sky-400 to-blue-500',
  'bg-gradient-to-br from-emerald-400 to-teal-500',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-rose-400 to-red-500',
  'bg-gradient-to-br from-cyan-400 to-indigo-500',
  'bg-gradient-to-br from-lime-400 to-green-500',
];

const getCustomerAvatarPalette = (customer) => {
  const identitySeed = String(customer?.id || customer?.full_name || customer?.email || 'customer');
  const hash = identitySeed.split('').reduce((total, character) => total + character.charCodeAt(0), 0);
  return CUSTOMER_AVATAR_PALETTES[hash % CUSTOMER_AVATAR_PALETTES.length];
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0).replace('MAD', 'MAD');
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatFullDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const CustomerManagementDashboard = () => {
  console.log("🔍 CustomerManagementDashboard rendering...");
  const [customers, setCustomers] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [nationalityFilter, setNationalityFilter] = useState('All');
  
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  const [fullPageViewOpen, setFullPageViewOpen] = useState(false);
  const [detailedCustomer, setDetailedCustomer] = useState(null);
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [customerProfileNote, setCustomerProfileNote] = useState('');
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);
  const [customerBanNote, setCustomerBanNote] = useState('');
  const [savingCustomerBan, setSavingCustomerBan] = useState(false);
  const [uploadingCustomerScan, setUploadingCustomerScan] = useState(false);
  
  // Mobile-specific state
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [mobileActionCustomer, setMobileActionCustomer] = useState(null);
  const customerScanInputRef = useRef(null);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Helper function to check if a value is empty
  const isEmpty = (value) => {
    return value === null || value === undefined || value === '' || value === 'N/A';
  };

  // Helper function to display field only if it has value
  const renderField = (label, value, formatFn = null) => {
    if (isEmpty(value)) return null;
    
    let displayValue = value;
    if (formatFn) {
      displayValue = formatFn(value);
    }
    
    return (
      <div className="col-span-1">
        <span className="font-medium text-gray-600">{label}:</span>
        <p className="text-gray-900 break-words mt-1">{displayValue}</p>
      </div>
    );
  };

  // ENHANCED: Get all customer images from various sources
  const getAllCustomerImages = (customer, customerRentals = []) => {
    const images = [];
    const existingUrls = new Set();
    const pushImage = (imageData) => {
      const normalizedUrl = normalizeCustomerDocumentUrl(imageData?.url);
      if (!normalizedUrl || existingUrls.has(normalizedUrl)) return;

      existingUrls.add(normalizedUrl);
      images.push({
        ...imageData,
        url: normalizedUrl,
        documentKind: imageData.documentKind || getCustomerDocumentKind(normalizedUrl)
      });
    };
    
    // 1. Main ID scan from database
    if (customer?.id_scan_url && getRawCustomerDocumentValue(customer.id_scan_url) !== '') {
      pushImage({
        url: customer.id_scan_url,
        type: 'ID Document Scan',
        source: 'id_scan_url',
        label: 'ID Document Scan',
        isCustomerImage: true,
        isFallback: false,
        uploadedAt: customer.updated_at || customer.created_at
      });
    }

    // 2. Customer's customer_id_image field
    if (customer?.customer_id_image && getRawCustomerDocumentValue(customer.customer_id_image) !== '') {
      pushImage({
        url: customer.customer_id_image,
        type: 'ID Document',
        source: 'customer_id_image',
        label: 'ID Document',
        isCustomerImage: true,
        isFallback: false,
        uploadedAt: customer.updated_at || customer.created_at
      });
    }

    // 3. Additional ID scan history from scan metadata
    if (Array.isArray(customer?.scan_metadata?.id_scan_history)) {
      customer.scan_metadata.id_scan_history.forEach((url, index) => {
        if (getRawCustomerDocumentValue(url) !== '') {
          pushImage({
            url,
            type: 'ID Document Scan',
            source: 'scan_metadata.id_scan_history',
            label: `Previous ID Scan ${index + 1}`,
            isCustomerImage: true,
            isFallback: false,
            uploadedAt: customer.updated_at || customer.created_at
          });
        }
      });
    }

    // 4. Keep existing rental image logic but add null checks
    if (customerRentals && customerRentals.length > 0) {
      customerRentals.forEach(rental => {
        if (rental.customer_id_image && getRawCustomerDocumentValue(rental.customer_id_image) !== '') {
          pushImage({
            url: rental.customer_id_image,
            type: 'ID from Rental',
            source: 'rental',
            label: `ID from Rental ${formatDate(rental.created_at)}`,
            isCustomerImage: false,
            isFallback: false,
            uploadedAt: rental.created_at
          });
        }
      });
    }

    // 5. Fallback - use license number
    if (images.length === 0 && customer?.licence_number) {
      pushImage({
        url: '',
        type: 'Fallback',
        source: 'fallback',
        label: `License: ${customer.licence_number}`,
        isCustomerImage: true,
        isFallback: true
      });
    }

    return images;
  };

  // NEW: Get additional documents (extra_images) separately from ID documents
  const getAdditionalDocuments = (customer, customerRentals = []) => {
    const additionalDocs = [];
    
    // From customer.extra_images
    if (customer?.extra_images && Array.isArray(customer.extra_images)) {
      customer.extra_images.forEach((url, index) => {
        if (getRawCustomerDocumentValue(url) !== '') {
          additionalDocs.push({
            url: normalizeCustomerDocumentUrl(url),
            type: 'Additional Document',
            label: `Additional Document ${index + 1}`,
            isCustomerImage: true,
            uploadedAt: customer.updated_at || customer.created_at,
            documentKind: getCustomerDocumentKind(url)
          });
        }
      });
    }
    
    // From rental history additional documents (if any)
    if (customerRentals && customerRentals.length > 0) {
      customerRentals.forEach(rental => {
        if (rental.extra_images && Array.isArray(rental.extra_images)) {
          rental.extra_images.forEach((url, index) => {
            const normalizedUrl = normalizeCustomerDocumentUrl(url);
            if (normalizedUrl && !additionalDocs.some(doc => doc.url === normalizedUrl)) {
              additionalDocs.push({
                url: normalizedUrl,
                type: 'Additional Document',
                label: `Rental Additional Doc ${index + 1}`,
                isCustomerImage: false,
                uploadedAt: rental.created_at,
                documentKind: getCustomerDocumentKind(url)
              });
            }
          });
        }
      });
    }
    
    return additionalDocs;
  };

  const headerCheckboxRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [customersResponse, rentalsResponse] = await Promise.all([
        supabase.from(`app_${APP_ID}_customers`).select('*'),
        supabase.from(`app_${APP_ID}_rentals`).select(`*, vehicle:saharax_0u4w4d_vehicles(*)`),
      ]);

      if (customersResponse.error) {
        throw new Error(`Customer fetch failed: ${customersResponse.error.message}`);
      }
      setCustomers(customersResponse.data || []);

      if (rentalsResponse.error) {
        setRentals([]);
      } else {
        setRentals(rentalsResponse.data || []);
      }
      
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
      setCustomers([]);
      setRentals([]);
    } finally {
      setLoading(false);
    }
  };

  // This useEffect replaces the openFullPageView function
  useEffect(() => {
    const loadDetailedCustomerData = async () => {
      if (!fullPageViewOpen || !selectedCustomer) {
        setDetailedCustomer(null);
        setCustomerProfileNote('');
        setCustomerBanNote('');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const targetCustomerId = selectedCustomer.id;
        
        // Fetch complete customer record from database (single source of truth)
        const { data: fullCustomer, error: customerError } = await supabase
          .from(`app_${APP_ID}_customers`)
          .select('*')
          .eq('id', targetCustomerId)
          .single();

        if (customerError) {
          throw customerError;
        }

        // Fetch rental history separately
        const historyResult = await getCustomerRentalHistory(targetCustomerId);
        const rentalHistory = historyResult.success ? historyResult.data : [];

        // Create comprehensive data object with all fields
        const dataToShow = {
          ...fullCustomer,
          rentalHistory,
          formattedFields: {
            created_at: formatDate(fullCustomer.created_at),
            updated_at: formatDate(fullCustomer.updated_at),
            last_scan_at: formatDate(fullCustomer.last_scan_at),
            date_of_birth: formatFullDate(fullCustomer.date_of_birth),
            licence_issue_date: formatFullDate(fullCustomer.licence_issue_date),
            licence_expiry_date: formatFullDate(fullCustomer.licence_expiry_date),
            expiry_date: formatFullDate(fullCustomer.expiry_date),
            issue_date: formatFullDate(fullCustomer.issue_date),
          }
        };
        
        setDetailedCustomer(dataToShow);
        setCustomerProfileNote(fullCustomer?.scan_metadata?.admin_note || '');
        setCustomerBanNote(fullCustomer?.scan_metadata?.ban_note || '');
        
      } catch (err) {
        console.error("❌ Error loading complete customer data:", err);
        setError(`Failed to load customer profile: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadDetailedCustomerData();
  }, [fullPageViewOpen, selectedCustomer]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, nationalityFilter]);

  const handleEditCustomer = async () => {
    try {
      setActionLoading(true);
      setError(null);

      const { error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update(editFormData)
        .eq('id', selectedCustomer.id);

      if (error) throw error;

      setEditModalOpen(false);
      setSelectedCustomer(null);
      setEditFormData({});
      await fetchData();
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    try {
      setActionLoading(true);
      setError(null);

      const customerToDelete = selectedCustomer;
      const historyResult = await checkCustomerRentalHistory(customerToDelete.id);

      if (historyResult.hasHistory) {
        alert(`Cannot delete customer ${customerToDelete.full_name} as they have a rental history.`);
        setDeleteModalOpen(false);
        setShowMobileActions(false);
        return;
      }

      const result = await deleteCustomer(customerToDelete.id);

      if (result.success) {
        setDeleteModalOpen(false);
        setShowMobileActions(false);
        setSelectedCustomer(null);
        await fetchData();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setNationalityFilter('All');
  };

  const handleSaveCustomerNote = async () => {
    if (!detailedCustomer?.id) return;

    try {
      setSavingCustomerNote(true);
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        admin_note: customerProfileNote
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);
    } catch (err) {
      console.error('❌ Error saving customer note:', err);
      setError(`Failed to save customer note: ${err.message}`);
    } finally {
      setSavingCustomerNote(false);
    }
  };

  const handleToggleCustomerBan = async (nextBanned) => {
    if (!detailedCustomer?.id) return;

    try {
      setSavingCustomerBan(true);
      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        is_banned: nextBanned,
        ban_note: customerBanNote
      };

      const { data, error } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (error) throw error;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        scan_metadata: nextScanMetadata
      } : prev);

      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? {
              ...customer,
              ...data,
              scan_metadata: nextScanMetadata
            }
          : customer
      ));
    } catch (err) {
      console.error('❌ Error updating customer ban status:', err);
      setError(`Failed to update customer ban status: ${err.message}`);
    } finally {
      setSavingCustomerBan(false);
    }
  };

  const handleUploadCustomerScan = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !detailedCustomer?.id) return;

    try {
      setUploadingCustomerScan(true);
      setError(null);

      const fileExtension = file.name.split('.').pop() || 'jpg';
      const filePath = `${detailedCustomer.id}/manual_id_scan_${Date.now()}.${fileExtension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('id_scans')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('id_scans')
        .getPublicUrl(uploadData.path);

      const existingHistory = Array.isArray(detailedCustomer.scan_metadata?.id_scan_history)
        ? detailedCustomer.scan_metadata.id_scan_history
        : [];
      const previousPrimaryScan = normalizeCustomerDocumentUrl(detailedCustomer.id_scan_url);
      const nextHistory = [
        ...existingHistory.map(url => normalizeCustomerDocumentUrl(url)).filter(Boolean),
        ...(previousPrimaryScan && previousPrimaryScan !== publicUrl ? [previousPrimaryScan] : [])
      ].filter((url, index, array) => array.indexOf(url) === index);

      const nextScanMetadata = {
        ...(detailedCustomer.scan_metadata || {}),
        id_scan_history: nextHistory
      };

      const { data, error: updateError } = await supabase
        .from(`app_${APP_ID}_customers`)
        .update({
          id_scan_url: publicUrl,
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', detailedCustomer.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      setDetailedCustomer(prev => prev ? {
        ...prev,
        ...data,
        rentalHistory: prev.rentalHistory || [],
        scan_metadata: nextScanMetadata,
        id_scan_url: publicUrl
      } : prev);

      setCustomers(prev => prev.map(customer =>
        customer.id === detailedCustomer.id
          ? {
              ...customer,
              ...data,
              scan_metadata: nextScanMetadata,
              id_scan_url: publicUrl
            }
          : customer
      ));
    } catch (err) {
      console.error('❌ Error uploading new customer scan:', err);
      setError(`Failed to upload new ID scan: ${err.message}`);
    } finally {
      if (event.target) {
        event.target.value = '';
      }
      setUploadingCustomerScan(false);
    }
  };

  const aggregatedData = useMemo(() => {
    const rentalsByCustomerId = new Map();
    rentals.forEach(rental => {
      if (!rental.customer_id) return;
      if (!rentalsByCustomerId.has(rental.customer_id)) {
        rentalsByCustomerId.set(rental.customer_id, []);
      }
      rentalsByCustomerId.get(rental.customer_id).push(rental);
    });

    const consolidatedProfiles = customers.map(customer => {
      const customerRentals = rentalsByCustomerId.get(customer.id) || [];
      const totalSpent = customerRentals.reduce((sum, rental) => sum + (rental.total_amount || 0), 0);
      const activeRentals = customerRentals.filter(r => r.status === 'active').length;

      return {
        ...customer,
        totalRentals: customerRentals.length,
        activeRentals,
        totalSpent,
        status: activeRentals > 0 ? 'Active' : 'Inactive',
        isBanned: Boolean(customer.scan_metadata?.is_banned),
        banNote: customer.scan_metadata?.ban_note || ''
      };
    });

    // Show ALL customers without consolidation by name
    let filteredCustomers = consolidatedProfiles.filter(customer => {
      const matchesSearch = !searchTerm ||
        (customer.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || customer.status === statusFilter;
      const matchesNationality = nationalityFilter === 'All' ||
        (customer.nationality || '').toLowerCase() === nationalityFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesNationality;
    });

    filteredCustomers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalUniqueCustomers = consolidatedProfiles.length;
    const totalActiveRentals = rentals.filter(rental => rental.status === 'active').length;
    const totalRevenue = rentals.reduce((sum, rental) => sum + (rental.total_amount || 0), 0);

    return {
      customers: filteredCustomers,
      summary: {
        totalCustomers: totalUniqueCustomers,
        totalActiveRentals,
        totalRevenue
      }
    };
  }, [customers, rentals, searchTerm, statusFilter, nationalityFilter]);

  const availableNationalities = useMemo(() => {
    const nationalities = customers
      .map(customer => customer.nationality)
      .filter(nationality => nationality && nationality.trim() !== '')
      .filter((nationality, index, arr) => arr.indexOf(nationality) === index)
      .sort();
    return nationalities;
  }, [customers]);

  const totalPages = Math.max(1, Math.ceil(aggregatedData.customers.length / itemsPerPage));
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return aggregatedData.customers.slice(startIndex, startIndex + itemsPerPage);
  }, [aggregatedData.customers, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchData();
  }, []);

  const eligibleForSelectionCount = useMemo(() => {
    return aggregatedData.customers.filter(c => c.totalRentals === 0).length;
  }, [aggregatedData.customers]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      const selectedCount = selectedCustomerIds.length;
      headerCheckboxRef.current.checked = selectedCount > 0 && selectedCount === eligibleForSelectionCount;
      headerCheckboxRef.current.indeterminate = selectedCount > 0 && selectedCount < eligibleForSelectionCount;
    }
  }, [selectedCustomerIds, eligibleForSelectionCount]);

  const openViewModal = (customer) => {
    setSelectedCustomer(customer);
    setViewModalOpen(true);
  };

  const openFullPageView = (customer) => {
    setSelectedCustomer(customer);
    setFullPageViewOpen(true);
  };

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);
    setEditFormData({
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      nationality: customer.nationality || '',
      address: customer.address || '',
      date_of_birth: customer.date_of_birth || '',
      licence_number: customer.licence_number || '',
      id_number: customer.id_number || '',
      place_of_birth: customer.place_of_birth || ''
    });
    setEditModalOpen(true);
  };

  const openDeleteModal = (customer) => {
    setSelectedCustomer(customer);
    setDeleteModalOpen(true);
  };

  const handleSelectCustomer = (customerId) => {
    setSelectedCustomerIds(prev =>
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allEligibleIds = aggregatedData.customers
        .filter(c => c.totalRentals === 0)
        .map(c => c.id);
      setSelectedCustomerIds(allEligibleIds);
    } else {
      setSelectedCustomerIds([]);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      setActionLoading(true);
      
      // Filter out customers with rental history
      const customersToDelete = aggregatedData.customers.filter(c => 
        selectedCustomerIds.includes(c.id) && c.totalRentals === 0
      );
      
      const customersWithHistory = aggregatedData.customers.filter(c => 
        selectedCustomerIds.includes(c.id) && c.totalRentals > 0
      );
      
      // Only delete customers without rental history
      const idsToDelete = customersToDelete.map(c => c.id);
      
      if (idsToDelete.length === 0) {
        alert('None of the selected customers can be deleted because they all have rental history.');
        setShowBulkDeleteModal(false);
        setActionLoading(false);
        return;
      }
      
      const result = await deleteCustomers(idsToDelete);
      
      if (result.success) {
        // Build informative message
        let message = `Successfully deleted ${idsToDelete.length} customer(s).`;
        
        if (customersWithHistory.length > 0) {
          const skippedNames = customersWithHistory.map(c => c.full_name).join(', ');
          message += `\n\n${customersWithHistory.length} customer(s) could not be deleted due to rental history:\n${skippedNames}`;
        }
        
        alert(message);
        setShowBulkDeleteModal(false);
        setSelectedCustomerIds([]);
        await fetchData();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("❌ Exception in CustomerManagementDashboard:", err);
      alert(`Error deleting customers: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Mobile action handlers
  const handleMobileView = (customer) => {
    setShowMobileActions(false);
    openFullPageView(customer);
  };

  const handleMobileEdit = (customer) => {
    setShowMobileActions(false);
    openEditModal(customer);
  };

  const handleMobileDelete = (customer) => {
    setShowMobileActions(false);
    openDeleteModal(customer);
  };

  if (loading && !fullPageViewOpen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (fullPageViewOpen) {
    if (loading || !detailedCustomer) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading customer profile...</p>
          </div>
        </div>
      );
    }

    const idImages = getAllCustomerImages(detailedCustomer);
    const hasRealImages = idImages.some(img => img.isCustomerImage && !img.isFallback);
    
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          <div className="mb-8">
            <div className="flex items-center mb-6">
              <button
                onClick={() => setFullPageViewOpen(false)}
                className="flex items-center text-blue-600 hover:text-blue-800 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
              </button>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 break-words">Customer Profile: {detailedCustomer.full_name || detailedCustomer.raw_name || 'Unknown Customer'}</h1>
          </div>

          {detailedCustomer.scan_metadata?.is_banned && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-red-900">Banned Customer</h2>
                  <p className="text-sm text-red-700 mt-1">
                    This customer should not be allowed to rent until staff review the profile note below.
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                  Rental Block
                </span>
              </div>
              {detailedCustomer.scan_metadata?.ban_note && (
                <p className="mt-3 text-sm text-red-800">
                  {detailedCustomer.scan_metadata.ban_note}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="lg:col-span-1 space-y-6">
              {/* ENHANCED ID Document Scans Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <div className="flex justify-between items-center mb-4 md:mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">ID Document Scans</h2>
                  <span className={`text-xs px-2 py-1 rounded-full ${hasRealImages ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {idImages.length} document{idImages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 md:p-4">
                  <input
                    ref={customerScanInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadCustomerScan}
                  />
                  <ImageGallery 
                    images={idImages}
                    title="ID Document"
                    emptyMessage={
                      <div className="text-center py-6 md:py-8">
                        <div className="mx-auto w-10 h-10 md:w-12 md:h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                          <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 font-medium">No ID scans uploaded</p>
                        <p className="text-gray-400 text-xs md:text-sm mt-1">Upload ID documents for verification</p>
                      </div>
                    }
                    gridLayout={false}
                  />
                </div>
                
                {/* Status indicator */}
                <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full mr-2 ${hasRealImages ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                      <span className="text-xs md:text-sm text-gray-600">
                        {hasRealImages ? 'ID documents verified' : 'ID verification pending'}
                      </span>
                    </div>
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                      onClick={() => customerScanInputRef.current?.click()}
                      disabled={uploadingCustomerScan}
                    >
                      {uploadingCustomerScan ? 'Uploading...' : '+ Upload new'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Additional Documents */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Documents</h2>
                {(() => {
                  const additionalDocs = getAdditionalDocuments(detailedCustomer, detailedCustomer.rentalHistory || []);
                  return additionalDocs.length > 0 ? (
                    <ImageGallery 
                      images={additionalDocs}
                      title="Additional Document"
                      emptyMessage="No additional documents"
                      gridLayout={false}
                    />
                  ) : (
                    <div className="bg-gray-100 rounded-lg p-6 md:p-8 text-center">
                      <div className="mx-auto w-10 h-10 md:w-12 md:h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm md:text-base">No additional documents</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {/* Personal Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField('Full Name', detailedCustomer.full_name)}
                  {renderField('Customer ID', detailedCustomer.id)}
                  {renderField('First Name', detailedCustomer.first_name || detailedCustomer.given_name)}
                  {renderField('Last Name', detailedCustomer.last_name || detailedCustomer.family_name)}
                  {renderField('Middle Name', detailedCustomer.middle_name)}
                  {renderField('Given Name', detailedCustomer.given_name)}
                  {renderField('Family Name', detailedCustomer.family_name)}
                  {renderField('Raw Name', detailedCustomer.raw_name)}
                  {renderField('Date of Birth', detailedCustomer.date_of_birth, formatFullDate)}
                  {renderField('Place of Birth', detailedCustomer.place_of_birth)}
                  {renderField('Nationality', detailedCustomer.nationality)}
                  {renderField('Country', detailedCustomer.country)}
                  {renderField('Gender', detailedCustomer.gender)}
                  {renderField('City', detailedCustomer.city)}
                  {renderField('Postal Code', detailedCustomer.postal_code)}
                  {renderField('Customer Type', detailedCustomer.customer_type)}
                </div>
                {!detailedCustomer.full_name && 
                 !detailedCustomer.first_name && 
                 !detailedCustomer.last_name && 
                 !detailedCustomer.date_of_birth && 
                 !detailedCustomer.nationality && 
                 !detailedCustomer.place_of_birth && 
                 !detailedCustomer.country && 
                 !detailedCustomer.gender && 
                 !detailedCustomer.city && 
                 !detailedCustomer.postal_code && 
                 !detailedCustomer.customer_type && (
                  <p className="text-gray-500 text-sm">No personal information available.</p>
                )}
              </div>

              {/* Contact & Legal Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact & Legal Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField('Email', detailedCustomer.email)}
                  {renderField('Phone', detailedCustomer.phone)}
                  {renderField('Address', detailedCustomer.address)}
                  {renderField('Secondary Address', detailedCustomer.secondary_address)}
                  {renderField('License Number', detailedCustomer.licence_number)}
                  {renderField('ID Number', detailedCustomer.id_number)}
                  {renderField('Secondary ID Number', detailedCustomer.secondary_id_number)}
                  {renderField('Document Number', detailedCustomer.document_number)}
                </div>
                {!detailedCustomer.email && 
                 !detailedCustomer.phone && 
                 !detailedCustomer.address && 
                 !detailedCustomer.secondary_address && 
                 !detailedCustomer.licence_number && 
                 !detailedCustomer.id_number && 
                 !detailedCustomer.secondary_id_number && 
                 !detailedCustomer.document_number && (
                  <p className="text-gray-500 text-sm">No contact or legal information available.</p>
                )}
              </div>

              {/* Document & License Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Document & License Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField('Document Type', detailedCustomer.document_type)}
                  {renderField('License Class', detailedCustomer.license_class)}
                  {renderField('Issue Date', detailedCustomer.issue_date || detailedCustomer.licence_issue_date, formatFullDate)}
                  {renderField('Expiry Date', detailedCustomer.expiry_date || detailedCustomer.licence_expiry_date, formatFullDate)}
                  {renderField('Issuing Authority', detailedCustomer.issuing_authority)}
                  {renderField('MRZ', detailedCustomer.mrz)}
                  {renderField('Confidence Estimate', detailedCustomer.confidence_estimate, (v) => `${(v * 100).toFixed(1)}%`)}
                  {renderField('Scan Confidence', detailedCustomer.scan_confidence, (v) => `${(v * 100).toFixed(1)}%`)}
                  {renderField('Initial Scan Complete', detailedCustomer.initial_scan_complete, (v) => v ? 'Yes' : 'No')}
                  {renderField('Data Source', detailedCustomer.data_source)}
                  {renderField('Created By', detailedCustomer.created_by)}
                  {renderField('Last Scan At', detailedCustomer.last_scan_at, formatDate)}
                </div>
                {!detailedCustomer.document_type && 
                 !detailedCustomer.license_class && 
                 !detailedCustomer.issue_date && 
                 !detailedCustomer.licence_issue_date && 
                 !detailedCustomer.expiry_date && 
                 !detailedCustomer.licence_expiry_date && 
                 !detailedCustomer.issuing_authority && 
                 !detailedCustomer.mrz && 
                 detailedCustomer.confidence_estimate === null && 
                 detailedCustomer.scan_confidence === null && 
                 detailedCustomer.initial_scan_complete === null && 
                 !detailedCustomer.data_source && 
                 !detailedCustomer.created_by && 
                 !detailedCustomer.last_scan_at && (
                  <p className="text-gray-500 text-sm">No document or license information available.</p>
                )}
              </div>

              {/* System Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">System Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-x-8 md:gap-y-4 text-sm">
                  {renderField('Created At', detailedCustomer.created_at, formatDate)}
                  {renderField('Updated At', detailedCustomer.updated_at, formatDate)}
                </div>
                {!detailedCustomer.created_at && !detailedCustomer.updated_at && (
                  <p className="text-gray-500 text-sm">No system information available.</p>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Rental Restriction</h2>
                    <p className="text-sm text-gray-500 mt-1">Flag this customer as banned and save the reason for staff.</p>
                  </div>
                  <button
                    onClick={() => handleToggleCustomerBan(!detailedCustomer.scan_metadata?.is_banned)}
                    disabled={savingCustomerBan}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                      detailedCustomer.scan_metadata?.is_banned
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {savingCustomerBan
                      ? 'Saving...'
                      : detailedCustomer.scan_metadata?.is_banned
                        ? 'Remove Ban'
                        : 'Mark as Banned'}
                  </button>
                </div>
                <textarea
                  value={customerBanNote}
                  onChange={(e) => setCustomerBanNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Explain why this customer is banned or should be reviewed carefully..."
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Internal Notes</h2>
                    <p className="text-sm text-gray-500 mt-1">Saved for staff follow-up and customer management context.</p>
                  </div>
                  <button
                    onClick={handleSaveCustomerNote}
                    disabled={savingCustomerNote}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {savingCustomerNote ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
                <textarea
                  value={customerProfileNote}
                  onChange={(e) => setCustomerProfileNote(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Add internal notes about this customer..."
                />
              </div>

              {/* Rental History */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Rental History ({(detailedCustomer.rentalHistory || []).length} rentals)</h2>
                {(detailedCustomer.rentalHistory || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">No rental history available.</p>
                ) : (
                  <div className="space-y-3">
                    {(detailedCustomer.rentalHistory || []).map((r) => {
                      const amount = r.total_amount ?? r.amount ?? 0;
                      const status = r.rental_status || r.status;
                      const bookedDate = r.created_at;
                      return (
                        <div key={r.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-200">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                            <div>
                              <p className="font-medium text-gray-900">{r.vehicle?.name || 'Unknown Vehicle'}</p>
                              <Link to={`/admin/rentals/${r.id}`} className="text-xs md:text-sm text-blue-600 hover:underline break-all">
                                {r.rental_id ? `Rental #${r.rental_id}` : `Rental: ${r.id?.slice(0, 8)}...`}
                              </Link>
                            </div>
                            <span className={`self-start px-2 py-1 text-xs font-semibold rounded-full ${
                              status === 'active' ? 'bg-green-100 text-green-800' : 
                              status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                              'bg-gray-100 text-gray-800'
                            }`}>{status || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs md:text-sm text-gray-600">
                            <div><span className="font-medium">Start:</span> {formatDate(r.rental_start_date)}</div>
                            <div><span className="font-medium">End:</span> {formatDate(r.rental_end_date)}</div>
                            <div><span className="font-medium">Amount:</span> {formatCurrency(amount)}</div>
                            <div><span className="font-medium">Booked:</span> {formatDate(bookedDate)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Customer Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">Manage, view, and analyze customer data.</p>
        </div>

        {/* Stats Cards - Mobile Optimized */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
          <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-medium text-gray-500">Total Customers</h3>
              <Users className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            </div>
            <p className="text-2xl md:text-3xl font-semibold text-gray-900 mt-2">{aggregatedData.summary.totalCustomers}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-medium text-gray-500">Active Rentals</h3>
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
            </div>
            <p className="text-2xl md:text-3xl font-semibold text-gray-900 mt-2">{aggregatedData.summary.totalActiveRentals}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-gray-200 sm:col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs md:text-sm font-medium text-gray-500">Total Revenue</h3>
              <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-900 mt-2 break-words">
              {formatCurrency(aggregatedData.summary.totalRevenue)}
            </p>
          </div>
        </div>

        {/* Mobile: Filter Toggle Button */}
        {isMobile && (
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full mb-4 flex items-center justify-between px-4 py-3 bg-white rounded-lg shadow-sm border border-gray-200"
          >
            <span className="flex items-center text-sm font-medium text-gray-700">
              <Filter className="w-4 h-4 mr-2" />
              Filters & Search
            </span>
            {showMobileFilters ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
          </button>
        )}

        {/* Filters Section - Responsive */}
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 mb-4 md:mb-6 ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
          <div className="p-4 md:p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  id="customerSearch"
                  name="customerSearch"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 md:py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                id="statusFilter"
                name="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 md:py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <select
                id="nationalityFilter"
                name="nationalityFilter"
                value={nationalityFilter}
                onChange={(e) => setNationalityFilter(e.target.value)}
                className="w-full px-3 py-2.5 md:py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="All">All Nationalities</option>
                {availableNationalities.map(nat => (
                  <option key={nat} value={nat}>{nat}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4">
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Clear Filters
              </button>
              
              {selectedCustomerIds.length > 0 && (
                <button
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedCustomerIds.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop: Table View */}
        {!isMobile ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="p-4 text-left w-12">
                      <input
                        type="checkbox"
                        ref={headerCheckboxRef}
                        onChange={handleSelectAll}
                        disabled={eligibleForSelectionCount === 0}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rentals
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Spent
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <Users className="w-12 h-12 text-gray-400 mb-3" />
                          <p className="text-gray-500 font-medium">No customers found</p>
                          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or search terms</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          {customer.totalRentals === 0 && (
                            <input
                              type="checkbox"
                              checked={selectedCustomerIds.includes(customer.id)}
                              onChange={() => handleSelectCustomer(customer.id)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className={`h-10 w-10 rounded-full text-white flex items-center justify-center font-bold shadow-sm ${getCustomerAvatarPalette(customer)}`}>
                                {getInitial(customer.full_name)}
                              </div>
                            </div>
                            <div className="ml-4">
                              <div
                                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                onClick={() => openFullPageView(customer)}
                              >
                                {customer.full_name || 'Unknown Customer'}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="text-xs text-gray-500">{customer.nationality || 'N/A'}</div>
                                {customer.isBanned && (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                    Banned
                                  </span>
                                )}
                              </div>
                              {customer.isBanned && customer.banNote && (
                                <div className="text-xs text-red-700 mt-1 max-w-xs truncate">
                                  {customer.banNote}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.email || 'No email'}</div>
                          <div className="text-sm text-gray-500">{customer.phone || 'No phone'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-2">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              customer.status === 'Active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {customer.status}
                            </span>
                            {customer.isBanned && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                Banned
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                          {customer.totalRentals}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {formatCurrency(customer.totalSpent)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(customer.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button 
                            onClick={() => openFullPageView(customer)} 
                            className="text-indigo-600 hover:text-indigo-900 mr-3 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => openEditModal(customer)} 
                            className="text-blue-600 hover:text-blue-900 mr-3 transition-colors"
                            title="Edit Customer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {customer.totalRentals === 0 && (
                            <button 
                              onClick={() => openDeleteModal(customer)} 
                              className="text-red-600 hover:text-red-900 transition-colors"
                              title="Delete Customer"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Mobile: Card View */
          <div className="space-y-3">
            {paginatedCustomers.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <div className="flex flex-col items-center">
                  <Users className="w-16 h-16 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium text-lg">No customers found</p>
                  <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or search terms</p>
                </div>
              </div>
            ) : (
              paginatedCustomers.map((customer) => (
                <MobileCustomerCard
                  key={customer.id}
                  customer={customer}
                  onView={handleMobileView}
                  onEdit={handleMobileEdit}
                  onDelete={handleMobileDelete}
                  isSelected={selectedCustomerIds.includes(customer.id)}
                  onSelect={handleSelectCustomer}
                  canSelect={customer.totalRentals === 0}
                />
              ))
            )}
          </div>
        )}

        {aggregatedData.customers.length > 0 && (
          <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * itemsPerPage, aggregatedData.customers.length)}</span> of{' '}
              <span className="font-medium">{aggregatedData.customers.length}</span> customers
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Mobile Action Menu */}
        {showMobileActions && mobileActionCustomer && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end justify-center">
            <div className="bg-white w-full rounded-t-2xl p-6 animate-slide-up">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Customer Actions</h3>
                <button
                  onClick={() => setShowMobileActions(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleMobileView(mobileActionCustomer)}
                  className="w-full flex items-center px-4 py-3 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Eye className="w-5 h-5 mr-3" />
                  <span className="font-medium">View Details</span>
                </button>
                
                <button
                  onClick={() => handleMobileEdit(mobileActionCustomer)}
                  className="w-full flex items-center px-4 py-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Edit className="w-5 h-5 mr-3" />
                  <span className="font-medium">Edit Customer</span>
                </button>
                
                {mobileActionCustomer.totalRentals === 0 && (
                  <button
                    onClick={() => handleMobileDelete(mobileActionCustomer)}
                    className="w-full flex items-center px-4 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash className="w-5 h-5 mr-3" />
                    <span className="font-medium">Delete Customer</span>
                  </button>
                )}
                
                <button
                  onClick={() => setShowMobileActions(false)}
                  className="w-full flex items-center px-4 py-3 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors mt-2"
                >
                  <X className="w-5 h-5 mr-3" />
                  <span className="font-medium">Cancel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Customer Details Drawer */}
        {viewModalOpen && selectedCustomer && (
          <ViewCustomerDetailsDrawer
            isOpen={viewModalOpen}
            onClose={() => setViewModalOpen(false)}
            customerId={selectedCustomer.id}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                onClick={() => setDeleteModalOpen(false)}
              ></div>

              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Delete Customer
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Are you sure you want to delete <span className="font-semibold">{selectedCustomer?.full_name}</span>? 
                          This action cannot be undone and will permanently remove all customer data.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleDeleteCustomer}
                    disabled={actionLoading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {actionLoading ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(false)}
                    disabled={actionLoading}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div 
                className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                onClick={() => setShowBulkDeleteModal(false)}
              ></div>

              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Delete Multiple Customers
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Are you sure you want to delete the selected customers?
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                          <span className="font-semibold">Note:</span> Only customers without rental history can be deleted. Customers with existing rentals will be skipped automatically.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={confirmBulkDelete}
                    disabled={actionLoading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {actionLoading ? 'Deleting...' : 'Delete Selected'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkDeleteModal(false)}
                    disabled={actionLoading}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add custom animation styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default CustomerManagementDashboard;
