import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, User, Phone, Mail, Calendar, MapPin, CreditCard, FileText, 
  Camera, AlertCircle, CheckCircle, Plus, Upload, Car, Clock, Users,
  Eye, Download, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CustomerService from '../../services/EnhancedUnifiedCustomerService';
import { uploadCustomerDocument } from '../../utils/storageUpload';


// ImageGallery component for displaying customer documents
const ImageGallery = ({ images, title, emptyMessage, gridLayout = true }) => {
  const [selectedImage, setSelectedImage] = React.useState(null);
  
  if (!images || images.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }
  
  const validImages = images.filter(img => {
    const url = typeof img === 'string' ? img : img?.url;
    return url && (url.startsWith('http') || url.startsWith('/'));
  });
  
  if (validImages.length === 0) {
    return <p className="text-sm text-gray-500">No valid images</p>;
  }
  
  return (
    <>
      <div className={gridLayout ? "grid grid-cols-2 md:grid-cols-3 gap-4" : "flex flex-col gap-6"}>
        {validImages.map((img, index) => {
          const imageUrl = typeof img === 'string' ? img : img.url;
          const imageLabel = typeof img === 'string' ? `${title} ${index + 1}` : img.label || `${title} ${index + 1}`;
          
          return (
            <div key={index} className="relative group">
              <div className={gridLayout ? "aspect-square rounded-lg overflow-hidden bg-muted" : "aspect-video rounded-lg overflow-hidden bg-muted max-w-2xl"}>
                <img
                  src={imageUrl}
                  alt={imageLabel}
                  className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage({ url: imageUrl, label: imageLabel })}
                />
              </div>
              {img.label && (
                <p className="text-sm text-muted-foreground mt-2">{img.label}</p>
              )}
            </div>
          );
        })}
      </div>
      
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedImage.url} 
              alt={selectedImage.label}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <button 
              className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// SecondDriverImage Component for displaying second driver images
const SecondDriverImage = ({ imageUrl, driverName, onImageClick }) => {
  const [imageError, setImageError] = useState(false);
  
  if (!imageUrl || imageError) {
    return (
      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
        <ImageIcon className="w-6 h-6 text-gray-400" />
      </div>
    );
  }
  
  return (
    <div 
      className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
      onClick={() => onImageClick(imageUrl, driverName)}
    >
      <img
        src={imageUrl}
        alt={driverName}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
};

const ViewCustomerDetailsDrawer = ({ 
  isOpen, 
  onClose, 
  rental = null, // The rental prop is optional and might not be present
  customerId = null,
  secondDrivers = [], // Add secondDrivers prop
  viewMode = 'customer'
}) => {
  const [customerData, setCustomerData] = useState(null);
  const [rentalHistory, setRentalHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const isSecondDriverOnlyView = viewMode === 'drivers';

  useEffect(() => {
    if (isOpen && (rental || customerId || isSecondDriverOnlyView)) {
      loadCustomerData();
    }
  }, [isOpen, rental, customerId, isSecondDriverOnlyView]);

  useEffect(() => {
    if (!isSecondDriverOnlyView && customerData && customerData.id) {
      loadRentalHistory(customerData.id);
    }
  }, [customerData, isSecondDriverOnlyView]);

  const loadCustomerData = async () => {
    setLoading(true);
    setError(null);
    setAlertMessage(null);
    setCustomerData(null);
    setRentalHistory([]);

    try {
      const targetCustomerId = customerId || rental?.customer_id;

      if (!targetCustomerId) {
        if (isSecondDriverOnlyView) {
          setCustomerData({
            id: rental?.customer_id || null,
            isRentalBased: true,
            _source: 'second_drivers',
          });
          setLoading(false);
          return;
        }

        // Fallback for cases where there's no customer ID but there is a rental object
        if (rental) {
          setCustomerData({
            isRentalBased: true,
            full_name: rental.customer_name,
            email: rental.customer_email || rental.email,
            phone: rental.customer_phone || rental.phone,
            licence_number: rental.customer_licence_number || rental.licence_number,
            nationality: rental.nationality,
            created_at: rental.created_at,
            customer_id_image: rental.customer_id_image,
          });
        } else {
          setError('No customer data available to display.');
        }
        setLoading(false);
        return;
      }

      // Fetch customer profile and their latest rental in parallel for robust data fallback
      const [customerResult, latestRentalResult] = await Promise.all([
        supabase.from('app_4c3a7a6153_customers').select('*').eq('id', targetCustomerId).single(),
        supabase.from('app_4c3a7a6153_rentals').select('*').eq('customer_id', targetCustomerId).order('created_at', { ascending: false }).limit(1).single()
      ]);

      const { data: customerProfile, error: customerError } = customerResult;
      const { data: latestRental, error: latestRentalError } = latestRentalResult;

      if (customerError && customerError.code !== 'PGRST116') { // PGRST116 means no rows found, which is not a fatal error
        throw new Error(`Failed to fetch customer profile: ${customerError.message}`);
      }
      
      if (latestRentalError && latestRentalError.code !== 'PGRST116') {
         console.warn(`Could not fetch latest rental: ${latestRentalError.message}`);
      }

      let dataToShow = {};
      const fallbackRental = latestRental || rental;

      // CRITICAL FIX: If viewing from a rental, ALWAYS show rental customer data
      if (rental) {
        console.log('🔄 Using RENTAL data (passed from parent):', rental.id);
        
        dataToShow = {
          id: rental.customer_id || targetCustomerId,
          isRentalBased: true,
          full_name: rental.customer_name || 'Unknown',
          email: rental.customer_email || rental.email || '',
          phone: rental.customer_phone || rental.phone || '',
          licence_number: rental.customer_licence_number || rental.licence_number || '',
          nationality: rental.nationality || '',
          created_at: rental.created_at || new Date().toISOString(),
          customer_id_image: rental.customer_id_image,
          id_scan_url: rental.customer?.id_scan_url,
          _source: 'rental',
          _rentalId: rental.id,
        };
        
        // Store customer profile data separately for reference
        if (customerProfile) {
          dataToShow.customer_profile = {
            id: customerProfile.id,
            full_name: customerProfile.full_name,
            email: customerProfile.email,
            phone: customerProfile.phone,
          };
        }
        
      } else if (customerProfile) {
        // No rental context - use customer profile
        console.log('🔄 Using CUSTOMER PROFILE data');
        dataToShow = { ...customerProfile, isRentalBased: false, _source: 'profile' };
        
      } else if (fallbackRental) {
        // No customer profile, but have rental history
        console.log('🔄 Using FALLBACK RENTAL data');
        dataToShow = {
          id: targetCustomerId,
          isRentalBased: true,
          full_name: fallbackRental.customer_name,
          email: fallbackRental.customer_email || fallbackRental.email,
          phone: fallbackRental.customer_phone || fallbackRental.phone,
          licence_number: fallbackRental.customer_licence_number || fallbackRental.licence_number,
          nationality: fallbackRental.nationality,
          created_at: fallbackRental.created_at,
          customer_id_image: fallbackRental.customer_id_image,
          id_scan_url: fallbackRental.customer?.id_scan_url,
          _source: 'fallback_rental',
        };
      } else {
        setError(`Customer with ID ${targetCustomerId} not found, and no rental history is available.`);
        setLoading(false);
        return;
      }
      
      setCustomerData(dataToShow);

    } catch (err) {
      console.error('❌ Error loading customer data:', err);
      setError(`Failed to load customer data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadRentalHistory = async (customerIdToFetch) => {
    if (CustomerService && typeof CustomerService.getCustomerRentalHistory === 'function') {
      try {
        const rentalHistoryResult = await CustomerService.getCustomerRentalHistory(customerIdToFetch);
        if (rentalHistoryResult.success) {
          setRentalHistory(rentalHistoryResult.data);
        } else {
          console.warn('Could not fetch rental history:', rentalHistoryResult.error);
          setRentalHistory([]);
        }
      } catch (err) {
        console.error('❌ Unexpected error in loadRentalHistory:', err);
        setRentalHistory([]);
      }
    } else {
      console.error("CustomerService.getCustomerRentalHistory is not available.");
      setRentalHistory([]);
    }
  };
  
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !customerData?.id) return;

    setUploading(true);
    setUploadError(null);

    try {
      const result = await uploadCustomerDocument(file, customerData.id);
      
      if (!result.success) throw new Error(result.error);
      
      const newImageUrl = result.url;
      const currentImages = customerData.extra_images || [];
      const updatedImages = [...currentImages, newImageUrl];

      const { error: dbError } = await supabase
        .from('app_4c3a7a6153_customers')
        .update({ extra_images: updatedImages })
        .eq('id', customerData.id);

      if (dbError) throw dbError;
      
      await loadCustomerData();

    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateCustomerProfile = async () => {
    const sourceRental = rental || (rentalHistory.length > 0 ? rentalHistory[0] : null);
    if (!sourceRental) {
        setError("No rental data available to create a profile.");
        return;
    }

    setCreatingProfile(true);
    setError(null);
    setAlertMessage(null);

    try {
      const customerToSave = {
        full_name: sourceRental.customer_name,
        email: sourceRental.customer_email || sourceRental.email,
        phone: sourceRental.customer_phone || sourceRental.phone,
        licence_number: sourceRental.licence_number || sourceRental.customer_licence_number,
        nationality: sourceRental.nationality,
        id_number: sourceRental.id_number || sourceRental.customer_id_number,
      };

      const result = await CustomerService.saveCustomer(customerToSave);
      
      if (result.success) {
        setAlertMessage(result.message || (result.isExisting ? 'Found existing customer profile.' : 'Successfully created a new customer profile.'));
        await loadCustomerData();
      } else {
        setError(result.error || 'Failed to create or update customer profile.');
      }
    } catch (err) {
      console.error('❌ Error creating customer profile:', err);
      setError(`An unexpected error occurred: ${err.message}`);
    } finally {
      setCreatingProfile(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Invalid Date';
    }
  };

  const handleImageClick = (imageUrl, title) => {
    setSelectedImage({ url: imageUrl, label: title });
  };

  if (!isOpen) return null;

  const idScanUrl = customerData?.id_scan_url;
  const customerIdImage = customerData?.customer_id_image;
  const extraImages = customerData?.extra_images || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isSecondDriverOnlyView ? 'Additional Drivers' : 'Customer Details'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isSecondDriverOnlyView
                ? 'Second driver information linked to this rental'
                : customerData?.isRentalBased
                  ? 'Limited Information Available'
                  : 'Complete Customer Profile'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading customer data...</span>
            </div>
          )}

          {alertMessage && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center"><CheckCircle className="h-5 w-5 text-blue-400" /><span className="ml-2 text-blue-800 font-medium">Notification</span></div>
              <p className="text-blue-700 mt-1">{alertMessage}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-400" /><span className="ml-2 text-red-800 font-medium">Error</span></div>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          )}

          {customerData && !loading && (
            <>
              {!isSecondDriverOnlyView && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center"><CheckCircle className="h-5 w-5 text-green-400" /><span className="ml-2 text-green-800 font-medium">Customer Information</span></div>
                  <p className="text-green-700 mt-1 text-sm">Customer details from rental records.</p>
                </div>
              )}

              {/* Data Source Indicator */}
              {!isSecondDriverOnlyView && (
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
                <div className="flex items-center text-sm">
                  <span className="font-medium text-gray-700">Data Source:</span>
                  <span className="ml-2 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {customerData?._source === 'rental' ? 'Rental Record' : 
                     customerData?._source === 'profile' ? 'Customer Profile' : 
                     'Historical Rental'}
                  </span>
                  {customerData?._rentalId && (
                    <span className="ml-2 text-gray-600 text-xs">
                      (Rental ID: {customerData._rentalId})
                    </span>
                  )}
                </div>
                {customerData?.customer_profile && customerData.customer_profile.full_name !== customerData.full_name && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    <div className="flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      <span className="font-medium">Note:</span>
                    </div>
                    <p className="mt-1">
                      Rental shows: <strong>{customerData.full_name}</strong><br/>
                      Linked customer profile: <strong>{customerData.customer_profile.full_name}</strong>
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* Contact Information */}
              {!isSecondDriverOnlyView && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center"><User className="h-4 w-4 mr-2 text-blue-600" />Contact Information</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">Name:</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 break-words">{customerData?.full_name ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <Mail className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">Email:</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.email ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">Phone:</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.phone ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">License:</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.licence_number ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">Nationality:</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.nationality ?? 'N/A'}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Second Drivers Section */}
              {secondDrivers && secondDrivers.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Users className="h-4 w-4 mr-2 text-blue-600" />
                    Second Drivers ({secondDrivers.length})
                  </h3>
                  <div className="space-y-4">
                    {secondDrivers.map((driver, index) => (
                      <div key={driver.id || index} className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start gap-3">
                          {/* Driver Image */}
                          {(driver.id_scan_url || driver.customer_id_image || driver.id_image) ? (
                            <SecondDriverImage
                              imageUrl={driver.id_scan_url || driver.customer_id_image || driver.id_image}
                              driverName={driver.full_name}
                              onImageClick={handleImageClick}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                              <User className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                          
                          {/* Driver Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <p className="font-medium text-gray-900">{driver.full_name}</p>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                Driver #{index + 1}
                              </span>
                            </div>
                            
                            <div className="mt-2 space-y-1 text-sm">
                              {driver.licence_number && (
                                <p className="flex items-center text-gray-600">
                                  <CreditCard className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">License: {driver.licence_number}</span>
                                </p>
                              )}
                              {driver.document_type && (
                                <p className="flex items-center text-gray-600">
                                  <Shield className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">Document Type: {driver.document_type}</span>
                                </p>
                              )}
                              {driver.document_number && !driver.id_number && (
                                <p className="flex items-center text-gray-600">
                                  <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">Document No: {driver.document_number}</span>
                                </p>
                              )}
                              {driver.id_number && (
                                <p className="flex items-center text-gray-600">
                                  <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">ID: {driver.id_number}</span>
                                </p>
                              )}
                              {driver.phone && (
                                <p className="flex items-center text-gray-600">
                                  <Phone className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{driver.phone}</span>
                                </p>
                              )}
                              {driver.email && (
                                <p className="flex items-center text-gray-600">
                                  <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{driver.email}</span>
                                </p>
                              )}
                              {driver.date_of_birth && (
                                <p className="flex items-center text-gray-600">
                                  <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span>{formatDate(driver.date_of_birth)}</span>
                                </p>
                              )}
                              {driver.nationality && (
                                <p className="flex items-center text-gray-600">
                                  <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span>{driver.nationality}</span>
                                </p>
                              )}
                              {driver.gender && (
                                <p className="flex items-center text-gray-600">
                                  <User className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span>{driver.gender}</span>
                                </p>
                              )}
                              {driver.place_of_birth && (
                                <p className="flex items-center text-gray-600">
                                  <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">Place of Birth: {driver.place_of_birth}</span>
                                </p>
                              )}
                            </div>
                            
                            {/* Additional Images Grid */}
                            {driver.uploaded_images && driver.uploaded_images.length > 1 && (
                              <div className="mt-3">
                                <p className="text-xs text-gray-500 mb-2">Additional documents:</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {driver.uploaded_images.map((img, imgIndex) => (
                                    <div
                                      key={imgIndex}
                                      className="aspect-square rounded border border-gray-200 overflow-hidden cursor-pointer hover:opacity-90"
                                      onClick={() => handleImageClick(img.url, `${driver.full_name} - Document ${imgIndex + 1}`)}
                                    >
                                      <img
                                        src={img.url}
                                        alt={`${driver.full_name} doc ${imgIndex + 1}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          e.target.onerror = null;
                                          e.target.style.display = 'none';
                                          e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><FileText class="w-4 h-4 text-gray-400" /></div>';
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* View Original Button */}
                            {(driver.id_scan_url || driver.customer_id_image || driver.id_image) && (
                              <button
                                onClick={() => handleImageClick(
                                  driver.id_scan_url || driver.customer_id_image || driver.id_image,
                                  `${driver.full_name} - ID Document`
                                )}
                                className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                View Full Image
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rental History */}
              {!isSecondDriverOnlyView && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center"><Clock className="h-4 w-4 mr-2 text-blue-600" />Rental History ({rentalHistory.length})</h3>
                {rentalHistory.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {rentalHistory.map(r => (
                      <Link to={`/admin/rentals/${r.id}`} key={r.id} className="block p-3 bg-white rounded-lg border hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                          <p className="font-semibold text-sm">{r.vehicle?.name || 'Unknown Vehicle'}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.rental_status === 'completed' ? 'bg-blue-100 text-blue-800' : r.rental_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{r.rental_status}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{formatDate(r.rental_start_date)} - {formatDate(r.rental_end_date)}</p>
                        <p className="text-xs text-blue-600 font-mono">Rental ID: {r.rental_id || r.id}</p>
                      </Link>
                    ))}
                  </div>
                ) : (<p className="text-sm text-gray-500">No rental history found.</p>)}
              </div>
              )}

              {/* ID Document Scans */}
              {!isSecondDriverOnlyView && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center"><Camera className="h-4 w-4 mr-2 text-blue-600" />ID Scans</h3>
                <ImageGallery 
                  images={[idScanUrl, customerIdImage].filter(Boolean).map(url => ({ url, label: '' }))}
                  title="ID Document"
                  emptyMessage="No ID documents available."
                  gridLayout={false}
                />
              </div>
              )}
              
              {/* Additional Documents */}
              {!isSecondDriverOnlyView && !customerData.isRentalBased && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center"><FileText className="h-4 w-4 mr-2 text-blue-600" />Additional Documents</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {extraImages.map((imgUrl, index) => (
                      <div key={index} className="relative group">
                        <img 
                          src={imgUrl} 
                          alt={`Extra doc ${index + 1}`} 
                          className="w-full h-24 object-cover border rounded-lg cursor-pointer hover:opacity-90" 
                          onClick={() => handleImageClick(imgUrl, `Document ${index + 1}`)}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="image-upload" className="w-full">
                      <div className="mt-2 flex justify-center px-6 py-4 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-500 bg-white">
                        <div className="text-center">
                          <Upload className="mx-auto h-8 w-8 text-gray-400" />
                          <p className="mt-1 text-sm text-gray-600">{uploading ? 'Uploading...' : 'Click to upload a document'}</p>
                        </div>
                      </div>
                      <input 
                        id="image-upload" 
                        name="image-upload" 
                        type="file" 
                        className="sr-only" 
                        onChange={handleImageUpload} 
                        disabled={uploading} 
                        ref={fileInputRef} 
                        accept="image/*,.pdf" 
                      />
                    </label>
                    {uploading && <div className="mt-2 h-1 w-full bg-blue-200 rounded"><div className="h-1 bg-blue-600 rounded animate-pulse w-3/4"></div></div>}
                    {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
                  </div>
                </div>
              )}

              {/* Account Information */}
              {!isSecondDriverOnlyView && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center"><CreditCard className="h-4 w-4 mr-2 text-blue-600" />Account Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center"><span className="text-sm text-gray-500 w-20">Customer ID:</span><span className="text-sm font-mono text-gray-900">{customerData.id ?? 'N/A'}</span></div>
                  <div className="flex items-center"><span className="text-sm text-gray-500 w-20">Created:</span><span className="text-sm text-gray-900">{formatDateTime(customerData.created_at)}</span></div>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-[60] flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedImage.url} 
              alt={selectedImage.label}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <button 
              className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-5 w-5" />
            </button>
            <p className="absolute bottom-4 left-4 text-white text-sm bg-black bg-opacity-50 px-3 py-1 rounded">
              {selectedImage.label}
            </p>
            <a
              href={selectedImage.url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
              title="Open in new tab"
            >
              <Download className="h-5 w-5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewCustomerDetailsDrawer;
