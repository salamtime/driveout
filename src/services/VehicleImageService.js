import { supabase } from '../lib/supabase.js';

/**
 * Vehicle Image Service - Handles vehicle image operations with enforced path convention
 * Path Convention: vehicle-images/vehicles/{vehicleId}/primary/
 */
class VehicleImageService {
  static BUCKET_NAME = 'vehicle-images';
  
  /**
   * Get the standardized path prefix for a vehicle
   */
  static getVehicleImagePath(vehicleId) {
    return `vehicles/${vehicleId}/primary/`;
  }

  /**
   * List all images for a specific vehicle
   */
  static async listVehicleImages(vehicleId) {
    try {
      console.log(`🔍 [VehicleImageService] Listing images for vehicle: ${vehicleId}`);
      
      const pathPrefix = this.getVehicleImagePath(vehicleId);
      
      const { data: files, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .list(pathPrefix, {
          limit: 100,
          offset: 0,
        });

      if (error) {
        console.error('❌ [VehicleImageService] Error listing images:', error);
        throw error;
      }

      console.log(`📊 [VehicleImageService] Found ${files?.length || 0} images for vehicle ${vehicleId}`);

      if (!files || files.length === 0) {
        return [];
      }

      // Convert to standardized format matching Documents
      const imageObjects = files
        .filter(file => file.name && !file.name.endsWith('/')) // Filter out folders
        .map((file, index) => {
          const fullPath = `${pathPrefix}${file.name}`;
          const { data: urlData } = supabase.storage
            .from(this.BUCKET_NAME)
            .getPublicUrl(fullPath);

          return {
            id: `img_${vehicleId}_${index}_${Date.now()}`,
            name: file.name,
            type: this.getFileType(file.name),
            size: file.metadata?.size || 215580, // Default size similar to documents
            url: urlData.publicUrl,
            storagePath: fullPath,
            uploadedAt: file.created_at || file.updated_at || new Date().toISOString(),
            category: 'Image'
          };
        });

      console.log(`✅ [VehicleImageService] Processed ${imageObjects.length} image objects`);
      return imageObjects;

    } catch (error) {
      console.error('❌ [VehicleImageService] Failed to list vehicle images:', error);
      return [];
    }
  }

  /**
   * Upload a new vehicle image
   */
  static async uploadVehicleImage(file, vehicleId) {
    try {
      console.log(`📤 [VehicleImageService] Uploading image for vehicle: ${vehicleId}`);
      
      // Validate file
      this.validateImageFile(file);

      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const fileName = `${timestamp}_${randomString}.${fileExtension}`;
      const fullPath = `${this.getVehicleImagePath(vehicleId)}${fileName}`;

      console.log(`📁 [VehicleImageService] Upload path: ${fullPath}`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(fullPath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        console.error('❌ [VehicleImageService] Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fullPath);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image');
      }

      const imageObject = {
        id: `img_${timestamp}_${randomString}`,
        name: file.name,
        type: file.type,
        size: file.size,
        url: urlData.publicUrl,
        storagePath: fullPath,
        uploadedAt: new Date().toISOString(),
        category: 'Image'
      };

      console.log('✅ [VehicleImageService] Image uploaded successfully:', fileName);
      return imageObject;

    } catch (error) {
      console.error('❌ [VehicleImageService] Upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete a vehicle image
   */
  static async deleteVehicleImage(storagePath) {
    try {
      console.log(`🗑️ [VehicleImageService] Deleting image: ${storagePath}`);
      
      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([storagePath]);

      if (error) {
        console.error('❌ [VehicleImageService] Delete error:', error);
        throw error;
      }

      console.log('✅ [VehicleImageService] Image deleted successfully');
    } catch (error) {
      console.error('❌ [VehicleImageService] Delete failed:', error);
      throw error;
    }
  }

  /**
   * Validate image file
   */
  static validateImageFile(file) {
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
  }

  /**
   * Get file type from filename
   */
  static getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return typeMap[extension] || 'image/jpeg';
  }

  /**
   * Move existing images to correct path convention
   */
  static async migrateVehicleImages(vehicleId, oldImageUrl) {
    try {
      if (!oldImageUrl) return null;

      console.log(`🔄 [VehicleImageService] Migrating image for vehicle ${vehicleId}: ${oldImageUrl}`);

      // Extract filename from old URL
      const filename = oldImageUrl.split('/').pop() || '/images/VehicleImageMigration.jpg';
      const newPath = `${this.getVehicleImagePath(vehicleId)}${filename}`;

      // Check if already in correct location
      if (oldImageUrl.includes(`vehicles/${vehicleId}/primary/`)) {
        console.log('✅ [VehicleImageService] Image already in correct location');
        return {
          id: `img_${vehicleId}_migrated_${Date.now()}`,
          name: filename,
          type: this.getFileType(filename),
          size: 215580,
          url: oldImageUrl,
          storagePath: newPath,
          uploadedAt: new Date().toISOString(),
          category: 'Image'
        };
      }

      // For now, return the existing image object without moving
      // Moving would require downloading and re-uploading which could be complex
      console.log('⚠️ [VehicleImageService] Image needs migration but keeping existing URL');
      return {
        id: `img_${vehicleId}_legacy_${Date.now()}`,
        name: filename,
        type: this.getFileType(filename),
        size: 215580,
        url: oldImageUrl,
        storagePath: '',
        uploadedAt: new Date().toISOString(),
        category: 'Image'
      };

    } catch (error) {
      console.error('❌ [VehicleImageService] Migration failed:', error);
      return null;
    }
  }

  /**
   * Clean up demo and test files from storage
   */
  static async cleanupDemoFiles() {
    try {
      console.log('🧹 [VehicleImageService] Starting cleanup of demo/test files...');

      // List all files in root of bucket
      const { data: rootFiles, error: rootError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .list('', { limit: 100 });

      if (rootError) {
        console.error('❌ [VehicleImageService] Error listing root files:', rootError);
        return { removed: [], errors: [rootError.message] };
      }

      const demoFiles = rootFiles?.filter(file => 
        file.name && (
          file.name.includes('demo_') || 
          file.name.includes('test_') ||
          file.name.includes('temp_')
        )
      ) || [];

      const removed = [];
      const errors = [];

      for (const file of demoFiles) {
        try {
          const { error: deleteError } = await supabase.storage
            .from(this.BUCKET_NAME)
            .remove([file.name]);

          if (deleteError) {
            errors.push(`Failed to delete ${file.name}: ${deleteError.message}`);
          } else {
            removed.push(file.name);
            console.log(`🗑️ [VehicleImageService] Removed demo file: ${file.name}`);
          }
        } catch (err) {
          errors.push(`Error deleting ${file.name}: ${err.message}`);
        }
      }

      console.log(`✅ [VehicleImageService] Cleanup complete. Removed: ${removed.length}, Errors: ${errors.length}`);
      return { removed, errors };

    } catch (error) {
      console.error('❌ [VehicleImageService] Cleanup failed:', error);
      return { removed: [], errors: [error.message] };
    }
  }
}

export default VehicleImageService;