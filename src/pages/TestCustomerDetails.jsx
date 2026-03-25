import React, { useState, useEffect } from 'react';
import ViewCustomerDetailsDrawer from '../components/admin/ViewCustomerDetailsDrawer';
import { supabase } from '../lib/supabase';

const TestCustomerDetails = () => {
  const [testCustomerId, setTestCustomerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchACustomer = async () => {
      try {
        // Fetch one customer that has rentals to test the history feature
        const { data: rentalData, error: rentalError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('customer_id')
          .not('customer_id', 'is', null)
          .limit(1)
          .single();

        if (rentalError) {
          throw new Error('Could not find a rental to get a customer ID.');
        }
        
        if (rentalData && rentalData.customer_id) {
          setTestCustomerId(rentalData.customer_id);
        } else {
          // Fallback: get any customer if no rental found
          const { data: customerData, error: customerError } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('id')
            .limit(1)
            .single();
          
          if (customerError) {
            throw new Error('Could not fetch any customer for testing.');
          }
          setTestCustomerId(customerData.id);
        }
      } catch (err) {
        console.error("Test page setup error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchACustomer();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading test data...</div>;
  }

  if (error || !testCustomerId) {
    return <div className="flex items-center justify-center min-h-screen">Error: {error || 'Failed to load a customer to test the details view.'}</div>;
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      <h1 className="text-2xl font-bold mb-4">UI Test Page: Customer Details</h1>
      <p className="mb-4">This page is for automated UI testing. Displaying details for customer ID: {testCustomerId}</p>
      <ViewCustomerDetailsDrawer
        isOpen={true}
        onClose={() => console.log('Close button clicked for test.')}
        customerId={testCustomerId}
      />
    </div>
  );
};

export default TestCustomerDetails;