// Edge function for user management operations
// This file will be deployed to Supabase Edge Functions
import { createClient } from 'npm:@supabase/supabase-js@2';

// Initialize Supabase client with service role key (only available in Edge Functions)
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Validate required environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Create admin client with service role key
const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      },
    });
  }

  // Standard CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json'
  };

  // Get auth token from request to verify calling user is authenticated
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Missing or invalid auth token' }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Extract token and verify user is authenticated
  const token = authHeader.split(' ')[1];
  const { data: { user: authUser }, error: authError } = await adminClient.auth.getUser(token);

  if (authError || !authUser) {
    return new Response(
      JSON.stringify({ error: 'Authentication failed', details: authError?.message }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Check if user has admin role
  // Verify against app_b30c02e74da644baad4668e3587d86b1_users table
  const { data: userData, error: userError } = await adminClient
    .from('app_b30c02e74da644baad4668e3587d86b1_users')
    .select('role')
    .eq('auth_id', authUser.id)
    .single();

  const userRole = userData?.role || authUser.user_metadata?.role;
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  if (!isAdmin) {
    return new Response(
      JSON.stringify({ error: 'Permission denied - Admin privileges required' }),
      { status: 403, headers: corsHeaders }
    );
  }

  // Parse request URL to determine operation
  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean);
  const operation = path[path.length - 1];

  // Extract page and per_page from query parameters
  const searchParams = url.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const perPage = parseInt(searchParams.get('per_page') || '10');

  try {
    // Handle different operations based on HTTP method and path
    switch (req.method) {
      case 'GET':
        if (operation === 'list') {
          // List users with pagination
          const { data, error } = await adminClient.auth.admin.listUsers({
            page,
            perPage
          });

          if (error) throw error;
          return new Response(JSON.stringify(data), { headers: corsHeaders });
        } 
        else if (operation === 'get') {
          // Get user by ID
          const userId = searchParams.get('id');
          if (!userId) {
            return new Response(
              JSON.stringify({ error: 'User ID required' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const { data, error } = await adminClient.auth.admin.getUserById(userId);
          if (error) throw error;
          return new Response(JSON.stringify(data), { headers: corsHeaders });
        }
        break;

      case 'POST':
        // Handle POST requests for user creation
        if (operation === 'create') {
          let userData;
          try {
            userData = await req.json();
          } catch (e) {
            return new Response(
              JSON.stringify({ error: 'Invalid JSON payload' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const { data, error } = await adminClient.auth.admin.createUser(userData);
          
          if (error) throw error;

          // If the user was created successfully, also create a record in the users table
          if (data?.user) {
            // Prepare user data for the custom table
            const customUserData = {
              auth_id: data.user.id,
              name: userData.user_metadata?.full_name || `${userData.user_metadata?.first_name || ''} ${userData.user_metadata?.last_name || ''}`.trim(),
              first_name: userData.user_metadata?.first_name,
              last_name: userData.user_metadata?.last_name,
              email: data.user.email,
              phone: userData.user_metadata?.phone,
              role: userData.user_metadata?.role || 'user',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            // Insert into custom users table
            const { error: insertError } = await adminClient
              .from('app_b30c02e74da644baad4668e3587d86b1_users')
              .insert([customUserData]);

            if (insertError) {
              console.error('Error inserting into custom users table:', insertError);
              // Continue anyway as the auth user was created successfully
            }
          }

          return new Response(JSON.stringify(data), { headers: corsHeaders });
        }
        break;

      case 'PUT':
        // Handle PUT requests for updating users
        if (operation === 'update') {
          let updateData;
          try {
            updateData = await req.json();
          } catch (e) {
            return new Response(
              JSON.stringify({ error: 'Invalid JSON payload' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const userId = searchParams.get('id');
          if (!userId) {
            return new Response(
              JSON.stringify({ error: 'User ID required' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const { data, error } = await adminClient.auth.admin.updateUserById(userId, updateData);
          
          if (error) throw error;

          // Update custom users table if user exists
          if (data?.user) {
            // Check if user exists in custom table
            const { data: existingUser } = await adminClient
              .from('app_b30c02e74da644baad4668e3587d86b1_users')
              .select('*')
              .eq('auth_id', userId)
              .single();

            if (existingUser) {
              // Update user in custom table
              const { error: updateError } = await adminClient
                .from('app_b30c02e74da644baad4668e3587d86b1_users')
                .update({
                  name: updateData.user_metadata?.full_name,
                  first_name: updateData.user_metadata?.first_name,
                  last_name: updateData.user_metadata?.last_name,
                  role: updateData.user_metadata?.role,
                  phone: updateData.user_metadata?.phone,
                  updated_at: new Date().toISOString()
                })
                .eq('auth_id', userId);

              if (updateError) {
                console.error('Error updating custom users table:', updateError);
              }
            }
          }

          return new Response(JSON.stringify(data), { headers: corsHeaders });
        }
        break;

      case 'DELETE':
        // Handle DELETE requests for deleting users
        if (operation === 'delete') {
          const userId = searchParams.get('id');
          if (!userId) {
            return new Response(
              JSON.stringify({ error: 'User ID required' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const { data, error } = await adminClient.auth.admin.deleteUser(userId);
          
          if (error) throw error;

          // Delete from custom users table
          const { error: deleteError } = await adminClient
            .from('app_b30c02e74da644baad4668e3587d86b1_users')
            .delete()
            .eq('auth_id', userId);

          if (deleteError) {
            console.error('Error deleting from custom users table:', deleteError);
          }

          return new Response(JSON.stringify(data || { success: true }), { headers: corsHeaders });
        }
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: corsHeaders }
        );
    }

    // If no operation matched
    return new Response(
      JSON.stringify({ error: 'Invalid operation' }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message,
        status: error.status || 500
      }),
      { status: error.status || 500, headers: corsHeaders }
    );
  }
});