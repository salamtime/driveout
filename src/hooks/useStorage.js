import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { runFullStorageSetup } from '../utils/storageSetup';
import { toast } from 'react-hot-toast';

/**
 * A hook that manages storage initialization and provides image upload/deletion functionality
 */
const useStorage = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState(null);

  // Initialize storage on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        
        const result = await runFullStorageSetup();
        
        if (result.success) {
          setIsInitialized(true);
          console.log('✅ Storage successfully initialized');
        } else {
          setError(result.error);
          console.error('❌ Storage initialization failed:', result.error);
        }
      } catch (err) {
        setError(err.message);
        console.error('❌ Storage initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    
    initialize();
  }, []);

  /**
   * Upload a file to storage
   * @param {File} file - The file to upload
   * @param {string} path - Optional path/filename for the file
   * @returns {Promise<{success: boolean, url?: string, path?: string, error?: any}>}
   */
  const uploadImage = async (file, path = '') => {
    try {
      if (!file) {
        return { success: false, error: 'No file provided' };
      }
      
      if (!isInitialized) {
        // Try to initialize storage first
        await runFullStorageSetup();
      }
      
      const fileName = path || `${Date.now()}_${file.name}`;
      
      const { data, error } = await supabase.storage
        .from('vehicle-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });
        
      if (error) {
        console.error('❌ Upload failed:', error);
        return { success: false, error };
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-images')
        .getPublicUrl(fileName);
        
      return { 
        success: true, 
        path: fileName,
        url: publicUrl
      };
    } catch (err) {
      console.error('❌ Upload error:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Delete a file from storage
   * @param {string} path - The path/filename to delete
   * @returns {Promise<{success: boolean, error?: any}>}
   */
  const deleteImage = async (path) => {
    try {
      if (!path) {
        return { success: true };
      }
      
      // If path is a full URL, extract just the filename
      if (path.startsWith('http')) {
        const url = new URL(path);
        const pathParts = url.pathname.split('/');
        path = pathParts[pathParts.length - 1];
      }
      
      const { error } = await supabase.storage
        .from('vehicle-images')
        .remove([path]);
        
      if (error) {
        console.error('❌ Delete failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (err) {
      console.error('❌ Delete error:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Force re-initialization of storage
   */
  const reinitializeStorage = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      
      toast.loading('Reinitializing storage connection...');
      
      const result = await runFullStorageSetup();
      
      if (result.success) {
        setIsInitialized(true);
        toast.success('Storage connection reinitialized successfully');
        console.log('✅ Storage successfully reinitialized');
      } else {
        setError(result.error);
        toast.error(`Storage reinitialization failed: ${result.error}`);
        console.error('❌ Storage reinitialization failed:', result.error);
      }
      
      return result;
    } catch (err) {
      setError(err.message);
      toast.error(`Storage error: ${err.message}`);
      console.error('❌ Storage reinitialization error:', err);
      return { success: false, error: err.message };
    } finally {
      setIsInitializing(false);
    }
  };

  return {
    isInitialized,
    isInitializing,
    error,
    uploadImage,
    deleteImage,
    reinitializeStorage
  };
};

export default useStorage;