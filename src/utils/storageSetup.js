import { supabase } from './supabaseClient';

/**
 * Calls the storage setup edge function to ensure bucket and policies are properly configured
 * This should be called once during app initialization or when storage errors occur
 */
export const setupStorage = async () => {
  try {
    console.log('🔄 Setting up storage via edge function...');
    
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.warn('⚠️ No authenticated session - storage setup may fail');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || supabase?.supabaseUrl;
    if (!supabaseUrl) {
      return { success: false, error: 'VITE_SUPABASE_URL is not configured' };
    }
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/app_53363b00a8254be48a3513617d27c8a9_storage_setup`,
      {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : '',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Storage setup failed:', response.status, errorData);
      return { success: false, error: errorData.error || `Setup failed with status ${response.status}` };
    }

    const result = await response.json();
    console.log('✅ Storage setup completed:', result);
    
    // Now set up policies
    const policiesResponse = await fetch(
      `${supabaseUrl}/functions/v1/app_53363b00a8254be48a3513617d27c8a9_setup_storage_policies`,
      {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : '',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!policiesResponse.ok) {
      const errorData = await policiesResponse.json().catch(() => ({}));
      console.error('❌ Storage policies setup failed:', policiesResponse.status, errorData);
      // Don't return error here, continue with next steps
    } else {
      const policiesResult = await policiesResponse.json();
      console.log('✅ Storage policies setup completed:', policiesResult);
    }
    
    // Apply RLS fix
    const rlsResponse = await fetch(
      `${supabaseUrl}/functions/v1/app_53363b00a8254be48a3513617d27c8a9_fix_storage_rls`,
      {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : '',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!rlsResponse.ok) {
      const errorData = await rlsResponse.json().catch(() => ({}));
      console.error('❌ RLS fix failed:', rlsResponse.status, errorData);
      // Don't return error here, continue with next steps
    } else {
      const rlsResult = await rlsResponse.json();
      console.log('✅ RLS fix completed:', rlsResult);
    }
    
    // Apply comprehensive owner RLS
    const ownerRlsResponse = await fetch(
      `${supabaseUrl}/functions/v1/app_53363b00a8254be48a3513617d27c8a9_comprehensive_owner_rls`,
      {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : '',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!ownerRlsResponse.ok) {
      const errorData = await ownerRlsResponse.json().catch(() => ({}));
      console.error('❌ Comprehensive owner RLS setup failed:', ownerRlsResponse.status, errorData);
    } else {
      const ownerRlsResult = await ownerRlsResponse.json();
      console.log('✅ Comprehensive owner RLS setup completed:', ownerRlsResult);
    }
    
    return { success: true, data: result };
  } catch (error) {
    console.error('❌ Storage setup error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Run all storage setup functions to ensure the system is ready
 */
export const runFullStorageSetup = async () => {
  try {
    console.group('📦 Running full storage setup');
    
    // Step 1: Set up storage via edge function
    const setupResult = await setupStorage();
    if (!setupResult.success) {
      console.error('❌ Storage setup via edge function failed:', setupResult.error);
    }
    
    // Step 2: Initialize local storage connection
    const { initializeStorage } = await import('./storageUtils');
    const initResult = await initializeStorage();
    if (!initResult.success) {
      console.error('❌ Storage initialization failed:', initResult.error);
    }
    
    // Step 3: Test storage connection
    const { default: testConnection } = await import('./testStorageConnection');
    const testResult = await testConnection();
    if (!testResult.success) {
      console.error('❌ Storage connection test failed:', testResult.message);
      return { success: false, error: testResult.message };
    }
    
    console.log('✅ Full storage setup completed successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Full storage setup error:', error);
    return { success: false, error: error.message };
  } finally {
    console.groupEnd();
  }
};

// Make function available globally for testing in browser console
if (typeof window !== 'undefined') {
  window.setupStorage = setupStorage;
  window.runFullStorageSetup = runFullStorageSetup;
}

export default setupStorage;
