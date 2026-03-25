import { supabase } from '../lib/supabase';

/**
 * Create Demo Users Script
 * 
 * Creates demo user accounts in Supabase Auth and corresponding
 * user profiles with proper role assignments for RBAC testing.
 */

// Demo credentials from the screenshot
const demoUsers = [
  {
    email: 'salamtime2016@gmail.com',
    password: 'saharax123',
    role: 'owner',
    full_name: 'System Owner',
    metadata: {
      role: 'owner',
      permissions: ['all']
    }
  },
  {
    email: 'admin@saharax.com',
    password: 'AdminUser123!',
    role: 'admin',
    full_name: 'System Administrator',
    metadata: {
      role: 'admin',
      permissions: ['admin', 'manage_users', 'manage_vehicles', 'manage_rentals', 'manage_pricing']
    }
  },
  {
    email: 'employee_demo@saharax.com',
    password: 'DemoEmployee2025',
    role: 'employee',
    full_name: 'Daily Operations Employee',
    metadata: {
      role: 'employee',
      permissions: ['manage_rentals', 'update_vehicles', 'customer_service']
    }
  },
  {
    email: 'guide_demo@saharax.com',
    password: 'DemoGuide2025',
    role: 'guide',
    full_name: 'Tour Guide',
    metadata: {
      role: 'guide',
      permissions: ['view_assigned_vehicles', 'update_rentals', 'customer_communication']
    }
  },
  {
    email: 'test@saharax.com',
    password: 'TestUser123!',
    role: 'customer',
    full_name: 'Demo Customer',
    metadata: {
      role: 'customer',
      permissions: ['view_vehicles', 'create_rentals', 'view_own_rentals']
    }
  }
];

/**
 * Create a single demo user
 */
const createDemoUser = async (userData) => {
  try {
    console.log(`Creating demo user: ${userData.email}`);

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(userData.email);
    
    if (existingUser) {
      console.log(`User ${userData.email} already exists, skipping...`);
      return { success: true, user: existingUser };
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: {
          full_name: userData.full_name,
          role: userData.role,
          ...userData.metadata
        }
      }
    });

    if (authError) {
      console.error(`Error creating auth user ${userData.email}:`, authError);
      return { success: false, error: authError };
    }

    console.log(`✅ Created demo user: ${userData.email} with role: ${userData.role}`);
    return { success: true, user: authData.user };

  } catch (error) {
    console.error(`Error creating demo user ${userData.email}:`, error);
    return { success: false, error };
  }
};

/**
 * Create all demo users
 */
export const createAllDemoUsers = async () => {
  console.log('🚀 Starting demo user creation...');
  
  const results = [];
  
  for (const userData of demoUsers) {
    const result = await createDemoUser(userData);
    results.push({
      email: userData.email,
      role: userData.role,
      ...result
    });
    
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n📊 Demo User Creation Summary:`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed users:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.email} (${r.role}): ${r.error?.message || 'Unknown error'}`);
    });
  }
  
  console.log('\n🎯 Demo users ready for testing!');
  console.log('You can now use these credentials on the login page:');
  
  demoUsers.forEach(user => {
    console.log(`\n${user.role.toUpperCase()}:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Password: ${user.password}`);
  });
  
  return results;
};

/**
 * Verify demo users exist and can authenticate
 */
export const verifyDemoUsers = async () => {
  console.log('🔍 Verifying demo users...');
  
  const results = [];
  
  for (const userData of demoUsers) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: userData.password
      });
      
      if (error) {
        console.error(`❌ Failed to verify ${userData.email}:`, error.message);
        results.push({ email: userData.email, verified: false, error: error.message });
      } else {
        console.log(`✅ Verified ${userData.email} - Role: ${userData.role}`);
        results.push({ email: userData.email, verified: true, role: userData.role });
        
        // Sign out immediately after verification
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error(`❌ Error verifying ${userData.email}:`, error);
      results.push({ email: userData.email, verified: false, error: error.message });
    }
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const verified = results.filter(r => r.verified).length;
  const failed = results.filter(r => !r.verified).length;
  
  console.log(`\n📊 Verification Summary:`);
  console.log(`✅ Verified: ${verified}`);
  console.log(`❌ Failed: ${failed}`);
  
  return results;
};

/**
 * Delete all demo users (for cleanup)
 */
export const deleteDemoUsers = async () => {
  console.log('🗑️ Deleting demo users...');
  
  // Note: This requires admin privileges
  // In production, you'd use Supabase admin API
  console.log('⚠️ Demo user deletion requires admin privileges');
  console.log('Please delete manually from Supabase dashboard if needed');
};

// Export demo user data for reference
export { demoUsers };

// Auto-run if called directly
if (typeof window !== 'undefined' && window.location?.search?.includes('create-demo-users')) {
  createAllDemoUsers();
}