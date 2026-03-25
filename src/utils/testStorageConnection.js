import { supabase } from './supabaseClient';
import { initializeStorage } from './storageUtils';

/**
 * Create or reuse a backend connection for Supabase Storage
 * This function will set up the necessary buckets, policies, and permissions
 */
export const setupStorageConnection = async () => {
  console.group('🔌 Setting up Storage connection');
  try {
    // Step 1: Make sure Supabase client is initialized
    if (!supabase) {
      console.error('❌ Supabase client is not initialized');
      return {
        success: false,
        message: 'Supabase client is not initialized. Please check your configuration.'
      };
    }

    // Step 2: Verify storage API is available
    if (!supabase.storage) {
      console.error('❌ Storage API is not available on Supabase client');
      return {
        success: false,
        message: 'Storage API not available. Please check your Supabase project configuration.'
      };
    }
    
    console.log('✅ Supabase client and Storage API are available');

    // Step 3: Initialize storage (create bucket if needed)
    const initResult = await initializeStorage();
    
    if (!initResult.success) {
      console.error('❌ Storage initialization failed:', initResult.error);
      return {
        success: false,
        message: `Storage initialization failed: ${initResult.error?.message || 'Unknown error'}`,
        error: initResult.error
      };
    }
    
    console.log('✅ Storage initialization successful');

    // Step 4: Get current auth session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.warn('⚠️ Auth session error:', sessionError);
      // Continue anyway as public operations might still work
    } else if (!sessionData.session) {
      console.warn('⚠️ No active session. Some storage operations may fail.');
      // Continue anyway as public operations might still work
    } else {
      console.log('✅ Auth session is active');
    }

    // Step 5: Test storage operations with minimal file
    try {
      const testResult = await testStorageOperations();
      
      if (!testResult.success) {
        console.error('❌ Storage operations test failed:', testResult.error);
        return {
          success: false,
          message: `Storage operations test failed: ${testResult.error?.message || 'Unknown error'}`,
          error: testResult.error
        };
      }
      
      console.log('✅ Storage operations test successful');
    } catch (testError) {
      console.error('❌ Unexpected error during storage test:', testError);
      return {
        success: false,
        message: `Storage test error: ${testError.message}`,
        error: testError
      };
    }

    console.log('✅ Storage connection setup completed successfully');
    return {
      success: true,
      message: 'Storage connection is active and operational'
    };
    
  } catch (error) {
    console.error('❌ Unexpected error during storage connection setup:', error);
    return {
      success: false,
      message: `Storage connection error: ${error.message}`,
      error
    };
  } finally {
    console.groupEnd();
  }
};

/**
 * Test basic storage operations - create, read, delete
 */
const testStorageOperations = async () => {
  const BUCKET_NAME = 'vehicle-images';
  const TEST_FILE_NAME = `connection-test-${Date.now()}.txt`;
  
  try {
    // Create test content
    const testContent = `Storage test ${new Date().toISOString()}`;
    const testFile = new Blob([testContent], { type: 'text/plain' });
    
    // Test upload
    console.log(`🔄 Testing upload to ${BUCKET_NAME}/${TEST_FILE_NAME}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(TEST_FILE_NAME, testFile, {
        cacheControl: '1',
        upsert: true
      });
      
    if (uploadError) {
      console.error('❌ Upload test failed:', uploadError);
      return {
        success: false,
        operation: 'upload',
        error: uploadError
      };
    }
    
    console.log('✅ Upload test successful:', uploadData.path);
    
    // Test download URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(TEST_FILE_NAME);
      
    if (!urlData?.publicUrl) {
      console.error('❌ Failed to get public URL');
      return {
        success: false,
        operation: 'getPublicUrl',
        error: 'Could not generate public URL'
      };
    }
    
    console.log('✅ Public URL generated:', urlData.publicUrl);
    
    // Test delete
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([TEST_FILE_NAME]);
      
    if (deleteError) {
      console.error('❌ Delete test failed:', deleteError);
      return {
        success: false,
        operation: 'delete',
        error: deleteError
      };
    }
    
    console.log('✅ Delete test successful');
    
    return {
      success: true,
      message: 'All storage operations completed successfully'
    };
    
  } catch (error) {
    console.error('❌ Storage operations test error:', error);
    return {
      success: false,
      error
    };
  }
};

// Make function available globally for testing in browser console
if (typeof window !== 'undefined') {
  window.setupStorageConnection = setupStorageConnection;
  window.testStorageOperations = testStorageOperations;
}

export default setupStorageConnection;