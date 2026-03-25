import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import InvoiceTemplate from "@/components/InvoiceTemplate";
import { supabase } from "../../lib/supabase";

// Helper function to format dates and times
const formatRentalDates = (rental) => {
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        // Use en-US for MM/DD/YYYY format
        return new Date(dateString).toLocaleDateString('en-US');
    };

    const formatDateTime = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return 'N/A';
        
        const datePart = dateStr.split('T')[0];
        const combinedDateTimeStr = `${datePart}T${timeStr}`;
        const date = new Date(combinedDateTimeStr);
        
        if (isNaN(date.getTime())) return 'N/A';

        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    };

    let startDate = '';
    let endDate = '';

    if (rental.rental_type === 'hourly') {
        startDate = formatDateTime(rental.rental_start_date, rental.rental_start_time);
        endDate = rental.rental_end_date && rental.rental_end_time 
            ? formatDateTime(rental.rental_end_date, rental.rental_end_time)
            : 'Ongoing';
    } else { // For 'daily' or 'weekly'
        startDate = formatDate(rental.rental_start_date);
        endDate = rental.rental_end_date ? formatDate(rental.rental_end_date) : 'Ongoing';
    }

    return { startDate, endDate };
};


export default function InvoicePage() {
  const { id } = useParams();
  const [rental, setRental] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("No rental ID provided.");
      return;
    }

    async function fetchRentalData() {
      try {
        setLoading(true);
        setError(null);

        // Step 1: Fetch Rental Data
        const { data: rentalData, error: rentalError } = await supabase
          .from("app_4c3a7a6153_rentals")
          .select(`*`)
          .eq("id", id)
          .single();

        if (rentalError) {
            console.error('❌ [Rental] fetch error', rentalError);
            throw rentalError;
        }
        if (!rentalData) throw new Error("Rental not found.");

        // Step 2: Fetch Vehicle Data
        let vehicleData = null;
        if (rentalData.vehicle_id) {
            const { data, error: vehicleError } = await supabase
              .from("saharax_0u4w4d_vehicles")
              .select("*")
              .eq("id", rentalData.vehicle_id)
              .single();
            if (vehicleError) {
                console.error('❌ [Vehicle] fetch error', vehicleError);
            } else {
                vehicleData = data;
            }
        }

        // Step 3: Fetch Customer Data
        let customerData = null;
        if (rentalData.customer_id) {
            const { data, error: customerError } = await supabase
              .from("app_4c3a7a6153_customers")
              .select("*")
              .eq("id", rentalData.customer_id)
              .single();
            if (customerError) {
                console.error('❌ [Customer] fetch error', customerError);
            } else {
                customerData = data;
            }
        }
        
        // Step 4: Combine Data
        const combinedData = {
          ...rentalData,
          vehicle: vehicleData,
          customer: customerData,
        };

        const { startDate, endDate } = formatRentalDates(combinedData);
        
        const rentalDataForTemplate = {
            start_date: startDate,
            end_date: endDate,
            customer_name: combinedData.customer_name || '',
            customer_email: combinedData.customer_email || '',
            customer_phone: combinedData.customer_phone || '',
            customer_license_number: combinedData.customer_licence_number || '',
            nationality: combinedData.customer ? combinedData.customer.nationality : null,
            vehicle_details: combinedData.vehicle ? { 
                name: combinedData.vehicle.name || '',
                plate_number: combinedData.vehicle.plate_number || '' 
            } : { name: '', plate_number: '' },
            signature_url: combinedData.signature_url || '',
            ...combinedData
        };
        
        delete rentalDataForTemplate.vehicle;
        delete rentalDataForTemplate.customer;

        setRental(rentalDataForTemplate);
      } catch (err) {
        console.error('❌ Error loading rental data for invoice', {
          message: err.message,
          code: err.code,
          details: err.details,
          hint: err.hint
        });
        setError(`Failed to load rental information: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    fetchRentalData();
  }, [id]);

  useEffect(() => {
    // Trigger print dialog once rental data is loaded
    if (rental && !loading && !error) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [rental, loading, error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-600">
        Loading invoice...
      </div>
    );
  }

  if (error || !rental) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-600">
        {error || "Could not find rental information."}
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen flex items-center justify-center print:bg-white">
      <InvoiceTemplate rental={rental} />
    </div>
  );
}