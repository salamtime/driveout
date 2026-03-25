import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'vehicle-documents';

/**
 * Upload a document to Supabase storage (same pattern as imageUpload.js)
 */
export const uploadDocument = async (file, vehicleId) => {
  try {
    console.log('🔄 DocumentService: Starting document upload:', file.name);
    
    // Validate file
    validateDocumentFile(file);
    
    // Generate unique filename (same pattern as imageUpload.js)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${vehicleId}/${timestamp}_${randomString}.${fileExtension}`;
    
    console.log('📁 Uploading to path:', fileName);
    
    // Upload file directly to Supabase storage (same approach as imageUpload.js)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    console.log('✅ Document uploaded successfully:', data);

    // Get public URL for the uploaded document (same as imageUpload.js)
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return {
      id: `doc_${timestamp}_${randomString}`,
      name: file.name,
      type: file.type,
      size: file.size,
      url: urlData.publicUrl,
      storagePath: fileName,
      uploadedAt: new Date().toISOString(),
      category: getCategoryFromType(file.type),
      vehicleId: vehicleId
    };
    
  } catch (error) {
    console.error('❌ Error in uploadDocument:', error);
    throw error;
  }
};

/**
 * Delete a document from storage (same pattern as imageUpload.js)
 */
export const deleteDocument = async (storagePath) => {
  try {
    console.log('🔄 DocumentService: Deleting document:', storagePath);
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }

    console.log('✅ Document deleted successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error in deleteDocument:', error);
    throw error;
  }
};

/**
 * Get documents for a vehicle (same pattern as imageUpload.js getVehicleImages)
 */
export const getVehicleDocuments = async (vehicleId) => {
  try {
    console.log('🔄 DocumentService: Getting documents for vehicle:', vehicleId);
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(`${vehicleId}/`, {
        limit: 100,
        offset: 0
      });

    if (error) {
      console.error('❌ Error getting vehicle documents:', error);
      return [];
    }

    // Transform storage objects to document metadata (same pattern as imageUpload.js)
    const documents = [];
    
    if (data && Array.isArray(data)) {
      for (const item of data) {
        if (item.name && !item.name.endsWith('/')) { // Skip folder entries
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(`${vehicleId}/${item.name}`);

          documents.push({
            id: item.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            type: getMimeTypeFromName(item.name),
            size: item.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath: `${vehicleId}/${item.name}`,
            uploadedAt: item.created_at || item.updated_at,
            category: getCategoryFromName(item.name),
            vehicleId: vehicleId
          });
        }
      }
    }

    console.log('✅ Vehicle documents retrieved:', documents.length);
    return documents;
    
  } catch (error) {
    console.error('❌ Error in getVehicleDocuments:', error);
    return [];
  }
};

/**
 * Get MIME type from file name
 */
const getMimeTypeFromName = (name) => {
  const extension = name.split('.').pop().toLowerCase();
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Get category from file name
 */
const getCategoryFromName = (name) => {
  const extension = name.split('.').pop().toLowerCase();
  switch (extension) {
    case 'pdf': return 'PDF';
    case 'doc':
    case 'docx': return 'Document';
    case 'xls':
    case 'xlsx': return 'Spreadsheet';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp': return 'Image';
    default: return 'Other';
  }
};

/**
 * Get category from file type
 */
const getCategoryFromType = (type) => {
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('word')) return 'Document';
  if (type.includes('excel') || type.includes('sheet')) return 'Spreadsheet';
  if (type.includes('image')) return 'Image';
  return 'Other';
};

/**
 * Validate document file before upload
 */
const validateDocumentFile = (file) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (file.size > maxSize) {
    throw new Error(`Document ${file.name} is too large. Maximum size is 10MB.`);
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Document type ${file.type} is not supported for ${file.name}.`);
  }

  return true;
};

// Export as default object to match the import pattern
const DocumentService = {
  uploadDocument,
  deleteDocument,
  getVehicleDocuments,
  validateFile: validateDocumentFile
};

export default DocumentService;