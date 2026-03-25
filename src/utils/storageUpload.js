import { supabase } from '../lib/supabase';

export const uploadFile = async (file, options = {}) => {
  try {
    const {
      bucket = 'id_scans', // Use working bucket by default
      pathPrefix = '',
      fileName = null
    } = options;
    
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const fileExt = file.name.split('.').pop().toLowerCase();
    const cleanName = fileName || `${timestamp}_${randomId}.${fileExt}`;
    const filePath = pathPrefix ? `${pathPrefix}/${cleanName}` : cleanName;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);
    
    return { success: true, url: publicUrl, path: data.path };
    
  } catch (error) {
    console.error('Upload failed:', error);
    return { success: false, error: error.message };
  }
};

export const uploadCustomerDocument = async (file, customerId = null) => {
  const pathPrefix = customerId ? `customers/${customerId}` : 'customers';
  return uploadFile(file, { bucket: 'id_scans', pathPrefix });
};
