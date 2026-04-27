import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, User, Phone, Mail, Calendar, MapPin, CreditCard, FileText, 
  Camera, AlertCircle, CheckCircle, Plus, Upload, Car, Clock, Users,
  Eye, Download, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CustomerService from '../../services/EnhancedUnifiedCustomerService';
import { getCustomerRentalHistory } from '../../services/EnhancedUnifiedCustomerService';
import { uploadCustomerDocument } from '../../utils/storageUpload';
import i18n from '../../i18n';
import { mergeCustomerScanHistory } from '../../utils/customerIdentity';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);


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
    return <p className="text-sm text-gray-500">{tr('No valid images', 'Aucune image valide')}</p>;
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

  const dedupeUrls = (values = [], primaryImage = null) => {
    const normalizeDocumentUrl = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
        const parsed = new URL(raw, window.location.origin);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return raw.split('?')[0].split('#')[0].trim();
      }
    };

    const normalizedPrimary = normalizeDocumentUrl(primaryImage);
    return mergeCustomerScanHistory(values)
      .map((value) => ({
        raw: String(value || '').trim(),
        normalized: normalizeDocumentUrl(value),
      }))
      .filter((entry) => entry.raw && entry.normalized && entry.normalized !== normalizedPrimary)
      .map((entry) => entry.raw);
  };

  useEffect(() => {
    if (isOpen && (rental || customerId || isSecondDriverOnlyView)) {
      loadCustomerData();
    }
  }, [isOpen, customerId, isSecondDriverOnlyView, rental?.id, rental?.customer_id]);

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
            nationality: rental.customer_nationality || rental.nationality || '',
            created_at: rental.created_at,
            customer_id_image: rental.customer_id_image,
          });
        } else {
          setError(tr('No customer data available to display.', 'Aucune donnée client disponible à afficher.'));
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

      // When a live customer profile exists, prefer its current fields and only
      // fall back to the rental snapshot for anything missing.
      if (rental) {
        const mergedScanHistory = dedupeUrls([
          ...(Array.isArray(customerProfile?.scan_metadata?.id_scan_history) ? customerProfile.scan_metadata.id_scan_history : []),
          ...(Array.isArray(rental?.customer_id_scan_history) ? rental.customer_id_scan_history : []),
        ], customerProfile?.id_scan_url || rental.customer_id_image);

        dataToShow = {
          id: rental.customer_id || targetCustomerId,
          isRentalBased: true,
          full_name: customerProfile?.full_name || rental.customer_name || 'Unknown',
          email: customerProfile?.email || rental.customer_email || rental.email || '',
          phone: customerProfile?.phone || rental.customer_phone || rental.phone || '',
          address: customerProfile?.address || rental.customer_address || rental.address || '',
          licence_number: customerProfile?.licence_number || rental.customer_licence_number || rental.licence_number || '',
          id_number: customerProfile?.id_number || rental.customer_id_number || rental.id_number || '',
          date_of_birth: customerProfile?.date_of_birth || rental.customer_dob || rental.date_of_birth || '',
          place_of_birth: customerProfile?.place_of_birth || rental.customer_place_of_birth || rental.place_of_birth || '',
          nationality: customerProfile?.nationality || rental.customer_nationality || rental.nationality || '',
          issue_date: customerProfile?.issue_date || rental.customer_issue_date || rental.issue_date || '',
          created_at: rental.created_at || new Date().toISOString(),
          customer_id_image: customerProfile?.customer_id_image || rental.customer_id_image,
          id_scan_url: customerProfile?.id_scan_url || rental.customer?.id_scan_url,
          _source: 'rental',
          _rentalId: rental.id,
          is_banned: Boolean(customerProfile?.scan_metadata?.is_banned),
          ban_note: customerProfile?.scan_metadata?.ban_note || '',
          has_active_alert_note: Boolean(customerProfile?.scan_metadata?.show_admin_note_alert),
          active_alert_note: customerProfile?.scan_metadata?.admin_note || '',
          scan_metadata: {
            ...(customerProfile?.scan_metadata || {}),
            id_scan_history: mergedScanHistory,
          },
        };
        
        // Store customer profile data separately for reference
        if (customerProfile) {
          dataToShow.customer_profile = {
            id: customerProfile.id,
            full_name: customerProfile.full_name,
            email: customerProfile.email,
            phone: customerProfile.phone,
            nationality: customerProfile.nationality,
          };
        }
      
      } else if (customerProfile) {
        // No rental context - use customer profile
        dataToShow = {
          ...customerProfile,
          isRentalBased: false,
          _source: 'profile',
          is_banned: Boolean(customerProfile?.scan_metadata?.is_banned),
          ban_note: customerProfile?.scan_metadata?.ban_note || '',
          has_active_alert_note: Boolean(customerProfile?.scan_metadata?.show_admin_note_alert),
          active_alert_note: customerProfile?.scan_metadata?.admin_note || '',
        };
        
      } else if (fallbackRental) {
        // No customer profile, but have rental history
        dataToShow = {
          id: targetCustomerId,
          isRentalBased: true,
          full_name: fallbackRental.customer_name,
          email: fallbackRental.customer_email || fallbackRental.email,
          phone: fallbackRental.customer_phone || fallbackRental.phone,
          licence_number: fallbackRental.customer_licence_number || fallbackRental.licence_number,
          nationality: fallbackRental.customer_nationality || fallbackRental.nationality || customerProfile?.nationality || '',
          created_at: fallbackRental.created_at,
          customer_id_image: fallbackRental.customer_id_image,
          id_scan_url: fallbackRental.customer?.id_scan_url,
          _source: 'fallback_rental',
          is_banned: Boolean(customerProfile?.scan_metadata?.is_banned),
          ban_note: customerProfile?.scan_metadata?.ban_note || '',
          has_active_alert_note: false,
          active_alert_note: '',
        };
      } else {
        setError(`${
          isFrenchLocale()
            ? `Client avec l’ID ${targetCustomerId} introuvable et aucun historique de location disponible.`
            : `Customer with ID ${targetCustomerId} not found, and no rental history is available.`
        }`);
        setLoading(false);
        return;
      }
      
      setCustomerData(dataToShow);

    } catch (err) {
      console.error('❌ Error loading customer data:', err);
      setError(`${tr('Failed to load customer data:', 'Échec du chargement des données client :')} ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadRentalHistory = async (customerIdToFetch) => {
    try {
      const rentalHistoryResult = await getCustomerRentalHistory(customerIdToFetch);
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
      setUploadError(`${tr('Upload failed:', 'Échec du téléversement :')} ${err.message}`);
    } finally {
      setUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateCustomerProfile = async () => {
    const sourceRental = rental || (rentalHistory.length > 0 ? rentalHistory[0] : null);
    if (!sourceRental) {
        setError(tr('No rental data available to create a profile.', 'Aucune donnée de location disponible pour créer un profil.'));
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
        nationality: sourceRental.customer_nationality || sourceRental.nationality,
        id_number: sourceRental.id_number || sourceRental.customer_id_number,
      };

      const result = await CustomerService.saveCustomer(customerToSave);
      
      if (result.success) {
        setAlertMessage(result.message || (result.isExisting ? tr('Found existing customer profile.', 'Profil client existant trouvé.') : tr('Successfully created a new customer profile.', 'Nouveau profil client créé avec succès.')));
        await loadCustomerData();
      } else {
        setError(result.error || tr('Failed to create or update customer profile.', 'Échec de la création ou de la mise à jour du profil client.'));
      }
    } catch (err) {
      console.error('❌ Error creating customer profile:', err);
      setError(`${tr('An unexpected error occurred:', 'Une erreur inattendue est survenue :')} ${err.message}`);
    } finally {
      setCreatingProfile(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return tr('N/A', 'N/D');
    try {
      return new Date(dateString).toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return tr('Invalid Date', 'Date invalide');
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return tr('N/A', 'N/D');
    try {
      return new Date(dateString).toLocaleString(isFrenchLocale() ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return tr('Invalid Date', 'Date invalide');
    }
  };

  const handleImageClick = (imageUrl, title) => {
    setSelectedImage({ url: imageUrl, label: title });
  };

  if (!isOpen) return null;

  const idScanUrl = customerData?.id_scan_url;
  const customerIdImage = customerData?.customer_id_image;
  const extraImages = customerData?.extra_images || [];
  const customerScanHistory = Array.isArray(customerData?.scan_metadata?.id_scan_history)
    ? customerData.scan_metadata.id_scan_history
    : [];
  const customerIdScans = [
    ...new Set(
      [idScanUrl, customerIdImage, ...(Array.isArray(customerData?.customer_id_scan_history) ? customerData.customer_id_scan_history : []), ...customerScanHistory]
        .filter(Boolean)
        .map((url) => String(url).trim().split('?')[0].split('#')[0])
    ),
  ].map((url, index) => ({
    url,
    label: index === 0
      ? tr('ID Scan', "Scan d'identité")
      : index === 1
        ? tr('Secondary ID', 'Pièce secondaire')
        : tr(`Additional ID ${index}`, `Pièce supplémentaire ${index}`),
  }));
  const sectionCardClass = 'rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]';
  const sectionTitleIconClass = 'h-4 w-4 mr-2 text-violet-600';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-violet-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/60 shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/50 to-slate-50 px-6 py-5 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {isSecondDriverOnlyView ? tr('Additional Drivers', 'Conducteurs supplémentaires') : tr('Customer Details', 'Détails client')}
              </h2>
              {!isSecondDriverOnlyView && customerData?.is_banned && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                  🚫 {tr('Banned', 'Banni')}
                </span>
              )}
              {!isSecondDriverOnlyView && customerData?.has_active_alert_note && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  🚨 {tr('Alert Note', 'Note d’alerte')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {isSecondDriverOnlyView
                ? tr('Second driver information linked to this rental', 'Informations du second conducteur liées à cette location')
                : customerData?.isRentalBased
                  ? tr('Limited Information Available', 'Informations limitées disponibles')
                  : tr('Complete Customer Profile', 'Profil client complet')}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full border border-violet-100 bg-white p-2 transition-colors hover:bg-violet-50">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">{tr('Loading customer data...', 'Chargement des données client...')}</span>
            </div>
          )}

          {alertMessage && (
            <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
              <div className="flex items-center"><CheckCircle className="h-5 w-5 text-blue-400" /><span className="ml-2 text-blue-800 font-medium">{tr('Notification', 'Notification')}</span></div>
              <p className="text-blue-700 mt-1">{alertMessage}</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-sm">
              <div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-400" /><span className="ml-2 text-red-800 font-medium">{tr('Error', 'Erreur')}</span></div>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          )}

          {customerData && !loading && (
            <>
              {!isSecondDriverOnlyView && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
                  <div className="flex items-center"><CheckCircle className="h-5 w-5 text-green-400" /><span className="ml-2 text-green-800 font-medium">{tr('Customer Information', 'Informations client')}</span></div>
                  <p className="text-green-700 mt-1 text-sm">{tr('Customer details from rental records.', 'Détails client issus des enregistrements de location.')}</p>
                </div>
              )}

              {!isSecondDriverOnlyView && customerData?.has_active_alert_note && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                  <div className="flex items-center">
                    <span className="text-lg">🚨</span>
                    <span className="ml-2 text-amber-900 font-medium">{tr('Active Rental Alert Note', 'Note d’alerte location active')}</span>
                  </div>
                  {customerData?.active_alert_note && (
                    <p className="text-amber-800 mt-2 text-sm whitespace-pre-wrap">{customerData.active_alert_note}</p>
                  )}
                </div>
              )}

              {!isSecondDriverOnlyView && customerData?.is_banned && (
                <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-sm">
                  <div className="flex items-center">
                    <span className="text-lg">🚫</span>
                    <span className="ml-2 text-red-900 font-medium">{tr('Banned Customer', 'Client banni')}</span>
                  </div>
                  <p className="mt-2 text-sm text-red-800">
                    {tr('This customer is currently banned. Review the reason below before taking any action.', 'Ce client est actuellement banni. Consultez la raison ci-dessous avant toute action.')}
                  </p>
                  {customerData?.ban_note && (
                    <p className="mt-2 text-sm whitespace-pre-wrap text-red-800">{customerData.ban_note}</p>
                  )}
                </div>
              )}

              {/* Data Source Indicator */}
              {!isSecondDriverOnlyView && (
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                <div className="flex items-center text-sm">
                  <span className="font-medium text-slate-700">{tr('Data Source:', 'Source des données :')}</span>
                  <span className="ml-2 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800">
                    {customerData?._source === 'rental' ? tr('Rental Record', 'Fiche de location') : 
                     customerData?._source === 'profile' ? tr('Customer Profile', 'Profil client') : 
                     tr('Historical Rental', 'Location historique')}
                  </span>
                  {customerData?._rentalId && (
                    <span className="ml-2 text-xs text-slate-500">
                      ({tr('Rental ID', 'ID location')} : {customerData._rentalId})
                    </span>
                  )}
                </div>
                {customerData?.customer_profile && customerData.customer_profile.full_name !== customerData.full_name && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    <div className="flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      <span className="font-medium">{tr('Note:', 'Note :')}</span>
                    </div>
                    <p className="mt-1">
                      {tr('Rental shows:', 'La location affiche :')} <strong>{customerData.full_name}</strong><br/>
                      {tr('Linked customer profile:', 'Profil client lié :')} <strong>{customerData.customer_profile.full_name}</strong>
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* Contact Information */}
              {!isSecondDriverOnlyView && (
              <div className={sectionCardClass}>
                <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900"><User className={sectionTitleIconClass} />{tr('Contact Information', 'Coordonnées')}</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Name:', 'Nom :')}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 break-words">{customerData?.full_name ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <Mail className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Email:', 'E-mail :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.email ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Phone:', 'Téléphone :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.phone ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <CreditCard className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('License:', 'Permis :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.licence_number ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <FileText className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('ID Number:', 'N° ID :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.id_number ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Birth Date:', 'Naissance :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.date_of_birth ? formatDate(customerData.date_of_birth) : tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Birth Place:', 'Lieu de naissance :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.place_of_birth ?? tr('N/A', 'N/D')}</span>
                  </div>
                  <div className="flex items-start">
                      <div className="w-28 flex-shrink-0 flex items-center">
                          <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-500">{tr('Nationality:', 'Nationalité :')}</span>
                      </div>
                      <span className="text-sm text-gray-900 break-words">{customerData?.nationality ?? tr('N/A', 'N/D')}</span>
                  </div>
                </div>
                {customerData?.id && (
                  <div className="mt-4 border-t border-violet-100 pt-4">
                    <Link
                      to={`/admin/customers/${customerData.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                    >
                      <Eye className="h-4 w-4" />
                      {tr('Open Customer Management', 'Ouvrir la gestion client')}
                    </Link>
                  </div>
                )}
              </div>
              )}

              {/* Second Drivers Section */}
              {secondDrivers && secondDrivers.length > 0 && (
                <div className={sectionCardClass}>
                  <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900">
                    <Users className={sectionTitleIconClass} />
                    {tr('Second Drivers', 'Conducteurs secondaires')} ({secondDrivers.length})
                  </h3>
                  <div className="space-y-4">
                    {secondDrivers.map((driver, index) => (
                      <div key={driver.id || index} className="rounded-2xl border border-violet-100 bg-slate-50/70 p-3 shadow-sm">
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
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                                {tr('Driver', 'Conducteur')} #{index + 1}
                              </span>
                            </div>
                            
                            <div className="mt-2 space-y-1 text-sm">
                              {driver.licence_number && (
                                <p className="flex items-center text-gray-600">
                                  <CreditCard className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{tr('License:', 'Permis :')} {driver.licence_number}</span>
                                </p>
                              )}
                              {driver.document_type && (
                                <p className="flex items-center text-gray-600">
                                  <Shield className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{tr('Document Type:', 'Type de document :')} {driver.document_type}</span>
                                </p>
                              )}
                              {driver.document_number && !driver.id_number && (
                                <p className="flex items-center text-gray-600">
                                  <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{tr('Document No:', 'No document :')} {driver.document_number}</span>
                                </p>
                              )}
                              {driver.id_number && (
                                <p className="flex items-center text-gray-600">
                                  <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{tr('ID:', 'ID :')} {driver.id_number}</span>
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
                                  <span className="truncate">{tr('Place of Birth:', 'Lieu de naissance :')} {driver.place_of_birth}</span>
                                </p>
                              )}
                            </div>
                            
                            {/* Additional Images Grid */}
                            {driver.uploaded_images && driver.uploaded_images.length > 1 && (
                              <div className="mt-3">
                                <p className="text-xs text-gray-500 mb-2">{tr('Additional documents:', 'Documents supplémentaires :')}</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {driver.uploaded_images.map((img, imgIndex) => (
                                    <div
                                      key={imgIndex}
                                      className="aspect-square rounded border border-gray-200 overflow-hidden cursor-pointer hover:opacity-90"
                                      onClick={() => handleImageClick(img.url, `${driver.full_name} - ${tr('Document', 'Document')} ${imgIndex + 1}`)}
                                    >
                                      <img
                                        src={img.url}
                                        alt={`${driver.full_name} ${tr('document', 'document')} ${imgIndex + 1}`}
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
                                  `${driver.full_name} - ${tr('ID Document', 'Document d’identité')}`
                                )}
                                className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                {tr("View Full Image", "Voir l'image complète")}
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
              <div className={sectionCardClass}>
                <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900"><Clock className={sectionTitleIconClass} />{tr('Rental History', 'Historique des locations')} ({rentalHistory.length})</h3>
                {rentalHistory.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {rentalHistory.map(r => (
                      <Link to={`/admin/rentals/${r.id}`} key={r.id} className="block rounded-2xl border border-violet-100 bg-slate-50/70 p-3 transition-colors hover:bg-violet-50/60">
                        <div className="flex justify-between items-center mb-1">
                          <p className="font-semibold text-sm">{r.vehicle?.name || tr('Unknown Vehicle', 'Véhicule inconnu')}</p>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.rental_status === 'completed' ? 'bg-blue-100 text-blue-800' : r.rental_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{r.rental_status}</span>
                            {Boolean(r.is_impounded) && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                🚨 {tr('Impounded', 'Mis en fourrière')}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{formatDate(r.rental_start_date)} - {formatDate(r.rental_end_date)}</p>
                        <p className="text-xs text-blue-600 font-mono">{tr('Rental ID', 'ID location')} : {r.rental_id || r.id}</p>
                      </Link>
                    ))}
                  </div>
                ) : (<p className="text-sm text-gray-500">{tr('No rental history found.', 'Aucun historique de location trouvé.')}</p>)}
              </div>
              )}

              {/* ID Document Scans */}
              {!isSecondDriverOnlyView && (
              <div className={sectionCardClass}>
                <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900"><Camera className={sectionTitleIconClass} />{tr('ID Scans', "Scans d'identité")}</h3>
                <ImageGallery 
                  images={customerIdScans}
                  title={tr('ID Document', "Document d'identité")}
                  emptyMessage={tr('No ID documents available. Please scan or import an ID to complete customer verification.', "Aucun document d'identité disponible. Veuillez scanner ou importer une pièce d'identité pour terminer la vérification du client.")}
                  gridLayout={false}
                />
              </div>
              )}
              
              {/* Additional Documents */}
              {!isSecondDriverOnlyView && !customerData.isRentalBased && (
                <div className={sectionCardClass}>
                  <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900"><FileText className={sectionTitleIconClass} />{tr('Additional Documents', 'Documents supplémentaires')}</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {extraImages.map((imgUrl, index) => (
                      <div key={index} className="relative group">
                        <img 
                          src={imgUrl} 
                          alt={`${tr('Extra document', 'Document supplémentaire')} ${index + 1}`} 
                          className="w-full h-24 object-cover border rounded-lg cursor-pointer hover:opacity-90" 
                          onClick={() => handleImageClick(imgUrl, `${tr('Document', 'Document')} ${index + 1}`)}
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="image-upload" className="w-full">
                      <div className="mt-2 flex justify-center rounded-2xl border-2 border-dashed border-violet-200 bg-slate-50 px-6 py-4 cursor-pointer hover:border-violet-400">
                        <div className="text-center">
                          <Upload className="mx-auto h-8 w-8 text-gray-400" />
                          <p className="mt-1 text-sm text-gray-600">{uploading ? tr('Uploading...', 'Téléversement...') : tr('Click to upload a document', 'Cliquez pour téléverser un document')}</p>
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
                    {uploading && <div className="mt-2 h-1 w-full rounded bg-violet-200"><div className="h-1 w-3/4 animate-pulse rounded bg-violet-600"></div></div>}
                    {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
                  </div>
                </div>
              )}

              {/* Account Information */}
              {!isSecondDriverOnlyView && (
              <div className={sectionCardClass}>
                <h3 className="mb-4 flex items-center text-sm font-semibold text-slate-900"><CreditCard className={sectionTitleIconClass} />{tr('Account Information', 'Informations du compte')}</h3>
                <div className="space-y-3">
                  <div className="flex items-center"><span className="text-sm text-gray-500 w-20">{tr('Customer ID:', 'ID client :')}</span><span className="text-sm font-mono text-gray-900">{customerData.id ?? tr('N/A', 'N/D')}</span></div>
                  <div className="flex items-center"><span className="text-sm text-gray-500 w-20">{tr('Created:', 'Créé le :')}</span><span className="text-sm text-gray-900">{formatDateTime(customerData.created_at)}</span></div>
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
              title={tr('Open in new tab', 'Ouvrir dans un nouvel onglet')}
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
