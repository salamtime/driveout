import { supabase } from '../lib/supabase';

export const debugStorage = async () => {
  console.log('🔧 DEBUG: Starting comprehensive storage debug...');
  
  try {
    // Test 1: Check authentication
    console.log('🔧 DEBUG: Checking authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('❌ DEBUG: Auth error:', authError);
      return { success: false, step: 'auth', error: authError.message };
    }
    
    console.log('✅ DEBUG: User authenticated:', user?.email);
    
    // Test 2: List all buckets
    console.log('🔧 DEBUG: Listing all storage buckets...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ DEBUG: Error listing buckets:', bucketsError);
      return { success: false, step: 'buckets', error: bucketsError.message };
    }
    
    console.log('✅ DEBUG: Available buckets:', buckets?.map(b => ({
      name: b.name,
      id: b.id,
      public: b.public,
      created_at: b.created_at
    })));
    
    // Test 3: Check if vehicle-images bucket exists
    const vehicleImagesBucket = buckets?.find(b => b.name === 'vehicle-images');
    if (!vehicleImagesBucket) {
      console.warn('⚠️ DEBUG: vehicle-images bucket NOT found!');
      
      // Try to create the bucket
      console.log('🔧 DEBUG: Attempting to create vehicle-images bucket...');
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('vehicle-images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        fileSizeLimit: 5242880 // 5MB
      });
      
      if (createError) {
        console.error('❌ DEBUG: Failed to create bucket:', createError);
        return { success: false, step: 'create_bucket', error: createError.message };
      }
      
      console.log('✅ DEBUG: Bucket created successfully:', newBucket);
    } else {
      console.log('✅ DEBUG: vehicle-images bucket found:', vehicleImagesBucket);
    }
    
    // Test 4: Try to list contents of vehicle-images bucket
    console.log('🔧 DEBUG: Testing bucket access...');
    const { data: bucketContents, error: listError } = await supabase.storage
      .from('vehicle-images')
      .list('', { limit: 10 });
    
    if (listError) {
      console.error('❌ DEBUG: Error accessing bucket:', listError);
      return { success: false, step: 'bucket_access', error: listError.message };
    }
    
    console.log('✅ DEBUG: Bucket access successful. Contents:', bucketContents);
    
    // Test 5: Try to upload a test file
    console.log('🔧 DEBUG: Testing file upload...');
    const testContent = new Blob(['test'], { type: 'text/plain' });
    const testFile = new File([testContent], 'debug-test.txt', { type: 'text/plain' });
    
    const testFileName = `debug-test-${Date.now()}.txt`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('vehicle-images')
      .upload(testFileName, testFile);
    
    if (uploadError) {
      console.error('❌ DEBUG: Upload test failed:', uploadError);
      return { success: false, step: 'upload_test', error: uploadError.message };
    }
    
    console.log('✅ DEBUG: Upload test successful:', uploadData);
    
    // Test 6: Get public URL
    const { data: urlData } = supabase.storage
      .from('vehicle-images')
      .getPublicUrl(testFileName);
    
    console.log('✅ DEBUG: Public URL generated:', urlData.publicUrl);
    
    // Clean up test file
    await supabase.storage
      .from('vehicle-images')
      .remove([testFileName]);
    
    console.log('✅ DEBUG: Test file cleaned up');
    
    return { 
      success: true, 
      buckets: buckets?.length || 0,
      vehicleImagesBucket: !!vehicleImagesBucket,
      uploadTest: 'success'
    };
    
  } catch (error) {
    console.error('❌ DEBUG: General error:', error);
    return { success: false, step: 'general', error: error.message };
  }
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.debugStorage = debugStorage;
}
