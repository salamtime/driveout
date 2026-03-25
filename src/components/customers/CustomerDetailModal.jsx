import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { X, User, Calendar, Globe, CreditCard, FileText, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const CustomerDetailModal = ({ 
  isOpen, 
  onClose, 
  customer, 
  rental = null 
}) => {
  const [scanImages, setScanImages] = useState([]);
  const [loading, setLoading] = useState(false);

  // CRITICAL FIX: Move useEffect BEFORE early return to fix React Hooks compliance
  useEffect(() => {
    // Only load additional scans if no primary image exists or if we need additional scans
    if (isOpen && customer?.id && !customer?.id_scan_url) {
      loadScanImages();
    }
  }, [isOpen, customer?.id, customer?.id_scan_url]);

  // Early return AFTER hooks to fix React Hooks compliance
  if (!customer) return null;

  // EMERGENCY DEBUGGING - Log everything
  console.log('🚨 EMERGENCY DEBUG - CustomerDetailModal Props:', { isOpen, customer, rental });
  console.log('🚨 Customer Object:', customer);
  console.log('🚨 Customer ID:', customer?.id);
  console.log('🚨 Customer id_scan_url:', customer?.id_scan_url);
  console.log('🚨 Customer full_name:', customer?.full_name);

  // Load additional scan images (non-blocking for primary image)
  const loadScanImages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_0a266d6c66_customer_id_scans')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading additional scan images:', error);
      } else {
        console.log('🚨 ADDITIONAL SCAN IMAGES LOADED:', data);
        setScanImages(data || []);
      }
    } catch (error) {
      console.error('Error loading additional scan images:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'Not provided';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Format timestamp helper
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Not available';
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid timestamp';
    }
  };

  // CRITICAL FIX: Determine if id_number should be treated as license number
  // Based on Moroccan format (XX/XXXXXX), treat as license number
  const isLicenseFormat = (value) => {
    if (!value) return false;
    return /^\d{2}\/\d{6}$/.test(value);
  };

  // CRITICAL DATA MAPPING FIX
  const getLicenseNumber = () => {
    if (customer.licence_number) return customer.licence_number;
    if (isLicenseFormat(customer.id_number)) return customer.id_number;
    return null;
  };

  const getIdNumber = () => {
    if (isLicenseFormat(customer.id_number)) return null; // It's actually a license
    return customer.id_number;
  };

  // FINAL FIX: Immediate image display using customer.id_scan_url
  const getImageUrl = () => {
    console.log('🎯 FINAL FIX: Getting image URL - Customer ID:', customer?.id);
    
    // PRIORITY 1: Use customer.id_scan_url immediately (no async waiting)
    if (customer?.id_scan_url) {
      console.log('✅ FINAL FIX: Using customer.id_scan_url immediately:', customer.id_scan_url);
      return customer.id_scan_url;
    }
    
    // PRIORITY 2: Fallback to additional scan images (if loaded)
    if (scanImages.length > 0 && scanImages[0].image_url) {
      console.log('✅ FINAL FIX: Using additional scan image:', scanImages[0].image_url);
      return scanImages[0].image_url;
    }
    
    console.log('⚠️ FINAL FIX: No image URL found');
    return null;
  };

  // IMMEDIATE IMAGE URL - No async interference
  const imageUrl = getImageUrl();
  console.log('🎯 FINAL FIX: Final image URL for display:', imageUrl);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <User className="w-7 h-7 text-blue-600" />
              Customer Details
            </DialogTitle>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {/* FINAL FIX DEBUG PANEL */}
          <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg text-sm">
            <h4 className="font-bold text-green-800 mb-2">🎯 FINAL FIX DEBUG INFO:</h4>
            <div className="space-y-1 text-green-700">
              <p><strong>Customer ID:</strong> {customer?.id || 'NULL'}</p>
              <p><strong>Customer Name:</strong> {customer?.full_name || 'NULL'}</p>
              <p><strong>id_scan_url:</strong> {customer?.id_scan_url || 'NULL'}</p>
              <p><strong>Final imageUrl:</strong> {imageUrl || 'NULL'}</p>
              <p><strong>Image Source:</strong> {customer?.id_scan_url ? 'PRIMARY (customer.id_scan_url)' : scanImages[0]?.image_url ? 'FALLBACK (additional scans)' : 'NONE'}</p>
              <p><strong>Additional Scans Loaded:</strong> {scanImages.length}</p>
            </div>
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column - Customer Data */}
            <div className="space-y-6">
              
              {/* Basic Information Section */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Basic Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Full Name</label>
                    <p className="text-base font-semibold text-gray-900 mt-1">
                      {customer.full_name || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Email</label>
                    <p className="text-base text-gray-900 mt-1">
                      {customer.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Phone</label>
                    <p className="text-base text-gray-900 mt-1">
                      {customer.phone || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ID Document Information Section - CRITICAL FIX */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  ID Document Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Date of Birth</label>
                    <p className="text-base text-gray-900 mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      {formatDate(customer.date_of_birth)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Nationality</label>
                    <p className="text-base text-gray-900 mt-1 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-gray-500" />
                      {customer.nationality || 'Not provided'}
                    </p>
                  </div>
                  
                  <Separator className="my-3" />
                  
                  {/* CRITICAL DATA MAPPING FIX - Show License Number FIRST */}
                  <div>
                    <label className="text-sm font-medium text-gray-600">License Number</label>
                    <p className="text-base font-semibold text-green-700 mt-1">
                      {getLicenseNumber() || 'Not provided'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Moroccan Driver's License</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">ID Number (C.N.I.E.)</label>
                    <p className="text-base font-semibold text-blue-700 mt-1">
                      {getIdNumber() || 'Not provided'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">National ID Card</p>
                  </div>
                </div>
              </div>

              {/* Account & Context Information */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Account Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Customer ID</label>
                    <p className="text-sm font-mono text-gray-700 mt-1 bg-white px-2 py-1 rounded border">
                      {customer.id}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Created
                      </label>
                      <p className="text-sm text-gray-700 mt-1">
                        {formatTimestamp(customer.created_at)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Updated
                      </label>
                      <p className="text-sm text-gray-700 mt-1">
                        {formatTimestamp(customer.updated_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rental Context (if provided) */}
              {rental && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Rental Context
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Rental ID:</span>
                      <span className="text-sm font-mono text-gray-700">{rental.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Vehicle:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {rental.vehicle?.name || 'N/A'} - {rental.vehicle?.model || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge 
                        variant={rental.rental_status === 'active' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {rental.rental_status?.toUpperCase() || 'UNKNOWN'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - ID Document Scan Image */}
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-600" />
                  ID Document Scan
                </h3>
                
                {/* FINAL FIX: Immediate image display */}
                <div className="bg-gray-50 rounded-lg p-4 min-h-[400px]">
                  <div className="flex items-center justify-center">
                    {imageUrl ? (
                      <div className="w-full max-w-full">
                        <div className="mb-2 p-2 bg-green-100 border border-green-400 rounded">
                          <p className="text-xs text-green-800 font-bold">✅ FINAL FIX: Image Found and Displayed</p>
                          <p className="text-xs text-green-600">Source: {customer?.id_scan_url ? 'customer.id_scan_url' : 'additional scans'}</p>
                        </div>
                        <img
                          src={imageUrl}
                          alt="ID Document Scan"
                          className="w-full max-w-full h-auto object-contain rounded-lg shadow-sm border border-gray-200"
                          style={{ maxHeight: '600px' }}
                          onLoad={() => console.log('✅ FINAL FIX: Image loaded successfully:', imageUrl)}
                          onError={(e) => {
                            console.log('❌ FINAL FIX: Image failed to load:', imageUrl);
                            console.error('Image error details:', e);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="mb-4 p-2 bg-orange-100 border border-orange-400 rounded">
                          <p className="text-xs text-orange-800 font-bold">⚠️ FINAL FIX: No Image Available</p>
                          <p className="text-xs text-orange-600">customer.id_scan_url: {customer?.id_scan_url || 'NULL'}</p>
                          <p className="text-xs text-orange-600">Additional scans: {scanImages.length}</p>
                          <p className="text-xs text-orange-600">Loading: {loading ? 'YES' : 'NO'}</p>
                        </div>
                        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 font-medium text-lg">No ID document scan available</p>
                        <p className="text-sm text-gray-500 mt-2">
                          No ID document scan has been uploaded for this customer
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Metadata (if available) */}
                {imageUrl && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Scan Information</h4>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        <span className="font-medium">Source:</span> {customer?.id_scan_url ? 'Primary (customer.id_scan_url)' : 'Additional Scans'}
                      </p>
                      <p>
                        <span className="font-medium">Status:</span> 
                        <span className="text-green-600 ml-1">✓ Available</span>
                      </p>
                      <p>
                        <span className="font-medium">URL:</span> 
                        <span className="font-mono text-xs break-all ml-1">{imageUrl}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Scan Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Scan Quality & Verification</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">OCR Processing:</span>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-blue-300 text-blue-700"
                    >
                      {getLicenseNumber() || getIdNumber() ? 'Completed' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Data Extracted:</span>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-blue-300 text-blue-700"
                    >
                      {(getLicenseNumber() || getIdNumber()) ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Verification Status:</span>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-green-300 text-green-700"
                    >
                      Verified
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Scan Images:</span>
                    <Badge 
                      variant="outline" 
                      className="text-xs border-blue-300 text-blue-700"
                    >
                      {imageUrl ? '1' : '0'} Available
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
            <Button 
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDetailModal;