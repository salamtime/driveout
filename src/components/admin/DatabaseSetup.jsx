import React, { useState, useEffect } from 'react';
import { supabase, getAdminClient } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Database, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const DatabaseSetup = () => {
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [adminSupabase, setAdminSupabase] = useState(null);

  useEffect(() => {
    // Use the centralized admin client
    setAdminSupabase(getAdminClient());
  }, []);

  const addResult = (message, type = 'info') => {
    setResults(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const setupDatabase = async () => {
    if (!adminSupabase) {
      addResult('Admin client not available', 'error');
      return;
    }

    setStatus('running');
    setResults([]);
    addResult('Starting database setup...', 'info');

    try {
      // Check vehicle models table
      addResult('Checking vehicle models table...', 'info');
      const { data: vehicleModels, error: vehicleError } = await adminSupabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('id, model, make, name')
        .limit(5);

      if (vehicleError) {
        addResult(`Vehicle models error: ${vehicleError.message}`, 'error');
      } else {
        addResult(`Found ${vehicleModels?.length || 0} vehicle models`, 'success');
      }

      // Check pricing simple table - FIXED: Updated table name
      addResult('Checking pricing simple table...', 'info');
      const { data: pricingRules, error: pricingError } = await adminSupabase
        .from('saharax_0u4w4d_pricing_simple') // FIXED: Changed from pricing_rules to pricing_simple
        .select('*')
        .limit(3);

      if (pricingError) {
        addResult(`Pricing simple error: ${pricingError.message}`, 'error');
        
        if (pricingError.message.includes('does not exist')) {
          addResult('Creating pricing simple table...', 'info');
          
          // Create table using direct SQL - FIXED: Updated table name
          const createTableSQL = `
            CREATE TABLE IF NOT EXISTS saharax_0u4w4d_pricing_simple (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              vehicle_model_id UUID,
              rule_type TEXT NOT NULL DEFAULT 'base_price',
              duration_type TEXT NOT NULL DEFAULT 'daily',
              price DECIMAL(10,2) NOT NULL,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              UNIQUE(vehicle_model_id, rule_type, duration_type)
            );
            
            -- Disable RLS for now
            ALTER TABLE saharax_0u4w4d_pricing_simple DISABLE ROW LEVEL SECURITY;
            
            -- Grant permissions
            GRANT ALL ON saharax_0u4w4d_pricing_simple TO anon;
            GRANT ALL ON saharax_0u4w4d_pricing_simple TO authenticated;
          `;

          const { error: createError } = await adminSupabase.rpc('exec', { sql: createTableSQL });
          
          if (createError) {
            addResult(`Failed to create pricing simple table: ${createError.message}`, 'error');
          } else {
            addResult('Pricing simple table created successfully', 'success');
          }
        }
      } else {
        addResult(`Found ${pricingRules?.length || 0} pricing rules`, 'success');
        if (pricingRules?.length > 0) {
          addResult(`Sample columns: ${Object.keys(pricingRules[0]).join(', ')}`, 'info');
        }
      }

      // Check daily tiers table
      addResult('Checking daily tiers table...', 'info');
      const { data: dailyTiers, error: tiersError } = await adminSupabase
        .from('saharax_0u4w4d_daily_tiers')
        .select('*')
        .limit(3);

      if (tiersError) {
        addResult(`Daily tiers error: ${tiersError.message}`, 'error');
        
        if (tiersError.message.includes('does not exist')) {
          addResult('Creating daily tiers table...', 'info');
          
          const createTiersSQL = `
            CREATE TABLE IF NOT EXISTS saharax_0u4w4d_daily_tiers (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              vehicle_model_id UUID,
              min_days INTEGER NOT NULL,
              max_days INTEGER,
              price_per_day DECIMAL(10,2) NOT NULL,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              UNIQUE(vehicle_model_id, min_days)
            );
            
            -- Disable RLS for now
            ALTER TABLE saharax_0u4w4d_daily_tiers DISABLE ROW LEVEL SECURITY;
            
            -- Grant permissions
            GRANT ALL ON saharax_0u4w4d_daily_tiers TO anon;
            GRANT ALL ON saharax_0u4w4d_daily_tiers TO authenticated;
          `;

          const { error: createTiersError } = await adminSupabase.rpc('exec', { sql: createTiersSQL });
          
          if (createTiersError) {
            addResult(`Failed to create daily tiers table: ${createTiersError.message}`, 'error');
          } else {
            addResult('Daily tiers table created successfully', 'success');
          }
        }
      } else {
        addResult(`Found ${dailyTiers?.length || 0} daily tiers`, 'success');
      }

      // Add sample data if we have vehicle models
      if (vehicleModels && vehicleModels.length > 0) {
        addResult('Adding sample pricing data...', 'info');
        
        const sampleVehicle = vehicleModels[0];
        
        // Test inserting pricing rules - FIXED: Updated table name
        const { error: insertError } = await adminSupabase
          .from('saharax_0u4w4d_pricing_simple') // FIXED: Changed from pricing_rules to pricing_simple
          .upsert([
            {
              vehicle_model_id: sampleVehicle.id,
              rule_type: 'base_price',
              duration_type: 'hourly',
              price: 15.00
            },
            {
              vehicle_model_id: sampleVehicle.id,
              rule_type: 'base_price',
              duration_type: 'daily',
              price: 50.00
            },
            {
              vehicle_model_id: sampleVehicle.id,
              rule_type: 'base_price',
              duration_type: 'weekly',
              price: 300.00
            }
          ], {
            onConflict: 'vehicle_model_id,rule_type,duration_type'
          });

        if (insertError) {
          addResult(`Failed to add sample pricing: ${insertError.message}`, 'error');
        } else {
          addResult(`Added sample pricing for ${sampleVehicle.model || sampleVehicle.name}`, 'success');
        }

        // Test inserting daily tiers
        const { error: tiersInsertError } = await adminSupabase
          .from('saharax_0u4w4d_daily_tiers')
          .upsert([
            {
              vehicle_model_id: sampleVehicle.id,
              min_days: 7,
              max_days: 13,
              price_per_day: 45.00
            },
            {
              vehicle_model_id: sampleVehicle.id,
              min_days: 14,
              max_days: null,
              price_per_day: 40.00
            }
          ], {
            onConflict: 'vehicle_model_id,min_days'
          });

        if (tiersInsertError) {
          addResult(`Failed to add sample tiers: ${tiersInsertError.message}`, 'error');
        } else {
          addResult(`Added sample daily tiers for ${sampleVehicle.model || sampleVehicle.name}`, 'success');
        }
      }

      addResult('Database setup completed!', 'success');
      setStatus('completed');

    } catch (error) {
      addResult(`Setup failed: ${error.message}`, 'error');
      setStatus('error');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Database className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Setup & Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This tool uses the service role key to set up database tables and permissions. 
            Only run this if you need to fix database permission issues.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button 
            onClick={setupDatabase} 
            disabled={status === 'running' || !adminSupabase}
            className="flex items-center gap-2"
          >
            <Database className="w-4 h-4" />
            {status === 'running' ? 'Setting up...' : 'Setup Database'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setResults([])}
            disabled={status === 'running'}
          >
            Clear Log
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-4 bg-gray-50">
            <h3 className="font-semibold text-sm">Setup Log:</h3>
            {results.map((result, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                {getIcon(result.type)}
                <span className="text-gray-500 text-xs">{result.timestamp}</span>
                <span className={`flex-1 ${
                  result.type === 'error' ? 'text-red-700' : 
                  result.type === 'success' ? 'text-green-700' : 
                  result.type === 'warning' ? 'text-yellow-700' : 
                  'text-gray-700'
                }`}>
                  {result.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {status === 'completed' && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Database setup completed! You should now be able to save pricing rules. 
              Try refreshing the page and testing the Base Pricing Rules section.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default DatabaseSetup;