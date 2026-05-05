import { supabase } from '../lib/supabase';
import { getCurrentOrganizationId } from '../services/OrganizationService';
import { buildStoragePathCandidates, buildTenantScopedStoragePath } from './storageUpload';

const BUCKET_NAME = 'vehicle-images';

/**
 * Upload an image to Supabase storage
 */
export const uploadImage = async (file, vehicleId) => {
  try {
    console.log('🔄 ImageUpload: Starting image upload:', file.name);
    console.log('🔄 ImageUpload: Vehicle ID:', vehicleId);
    console.log('🔄 ImageUpload: File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    // Validate file
    validateImageFile(file);
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const organizationId = await getCurrentOrganizationId();
    const fileName = buildTenantScopedStoragePath({
      organizationId,
      pathPrefix: `vehicles/${vehicleId}`,
      fileName: `${timestamp}_${randomString}.${fileExtension}`,
    });
    
    console.log('📁 Uploading to path:', fileName);
    console.log('📁 Bucket name:', BUCKET_NAME);
    
    // Upload file directly to Supabase storage
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

    console.log('✅ Image uploaded successfully:', data);

    // Get public URL for the uploaded image
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    console.log('🔗 Public URL generated:', urlData.publicUrl);

    const result = {
      id: `img_${timestamp}_${randomString}`,
      name: file.name,
      type: file.type,
      size: file.size,
      url: urlData.publicUrl,
      storagePath: fileName,
      uploadedAt: new Date().toISOString(),
      vehicleId: vehicleId
    };

    console.log('✅ Final upload result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in uploadImage:', error);
    throw error;
  }
};

/**
 * Delete an image from storage
 */
export const deleteImage = async (storagePath) => {
  try {
    console.log('🔄 ImageUpload: Deleting image:', storagePath);
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('❌ Error deleting image:', error);
      throw error;
    }

    console.log('✅ Image deleted successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error in deleteImage:', error);
    throw error;
  }
};

/**
 * Get images for a vehicle
 */
export const getVehicleImages = async (vehicleId) => {
  try {
    console.log('🔄 ImageUpload: Getting images for vehicle:', vehicleId);
    const organizationId = await getCurrentOrganizationId();
    const prefixes = buildStoragePathCandidates(organizationId, `vehicles/${vehicleId}`);
    const files = [];

    for (const prefix of prefixes) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, {
          limit: 100,
          offset: 0
        });

      if (error) {
        console.error('❌ Error getting vehicle images:', error);
        continue;
      }

      (data || []).forEach((item) => files.push({ ...item, __prefix: prefix }));
    }

    // Transform storage objects to image metadata
    const images = [];
    
    if (files.length && Array.isArray(files)) {
      for (const item of files) {
        if (item.name && !item.name.endsWith('/')) { // Skip folder entries
          const storagePath = `${item.__prefix}/${item.name}`;
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(storagePath);

          images.push({
            id: item.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            type: getMimeTypeFromName(item.name),
            size: item.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath,
            uploadedAt: item.created_at || item.updated_at,
            vehicleId: vehicleId
          });
        }
      }
    }

    console.log('✅ Vehicle images retrieved:', images.length);
    return images;
    
  } catch (error) {
    console.error('❌ Error in getVehicleImages:', error);
    return [];
  }
};

/**
 * Get MIME type from file name
 */
const getMimeTypeFromName = (name) => {
  const extension = name.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return mimeTypes[extension] || 'image/jpeg';
};

/**
 * Validate image file before upload
 */
const validateImageFile = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (file.size > maxSize) {
    throw new Error(`Image ${file.name} is too large. Maximum size is 5MB.`);
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Image type ${file.type} is not supported for ${file.name}.`);
  }

  return true;
};

/**
 * Test storage connection and bucket access
 */
export const testStorageConnection = async () => {
  try {
    console.log('🔄 Testing storage connection...');
    
    // Test bucket access
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', {
        limit: 1
      });

    if (error) {
      console.error('❌ Storage connection test failed:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Storage connection test successful');
    return { success: true, data };
    
  } catch (error) {
    console.error('❌ Storage connection test error:', error);
    return { success: false, error: error.message };
  }
};
