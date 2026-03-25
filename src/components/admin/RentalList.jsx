import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

// Helper function to format rental periods - SHOW DATES ONLY
const formatRentalPeriod = (rental) => {
  // Format date only - NO TIME for daily rentals
  const formatDateOnly = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      // Return DD/MM/YYYY format
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      return 'N/A';
    }
  };

  const startDate = formatDateOnly(rental.rental_start_date);
  const endDate = rental.rental_end_date ? formatDateOnly(rental.rental_end_date) : 'Ongoing';
  
  return `${startDate} to ${endDate}`;
};

// Helper function to format the rental ID
const formatRentalId = (id) => {
  if (!id) return 'N/A';
  const year = new Date().getFullYear();
  const idSnippet = id.split('-')[0];
  return `RNT-${year}-${idSnippet}`;
};

// Helper function to calculate time remaining with extensions - MATCHING RentalDetails
const calculateTimeRemaining = (rental) => {
  if (!rental.rental_end_date || rental.rental_status !== 'active') return null;
  
  const now = new Date();
  let endDate = new Date(rental.rental_end_date);
  
  // If rental has end time, add it to the end date
  if (rental.rental_end_time) {
    const [hours, minutes, seconds] = rental.rental_end_time.split(':').map(Number);
    endDate.setHours(hours, minutes, seconds || 0);
  }
  
  // Add extension hours if extensions exist
  if (rental.extensions && rental.extensions.length > 0) {
    const approvedExtensions = rental.extensions.filter(ext => ext.status === "approved");
    const totalExtensionHours = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
    endDate.setHours(endDate.getHours() + totalExtensionHours);
  }
  
  const diff = endDate - now;
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  // Format like RentalDetails: "1h 41m" or "1d 2h 52m"
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else {
    return `${hours}h ${minutes}m`;
  }
};

export default function RentalList() {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Fetch rentals function
  const fetchRentals = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("app_4c3a7a6153_rentals")
        .select(`
          id,
          customer_name,
          rental_start_date,
          rental_start_time,
          rental_end_date,
          rental_end_time,
          rental_type,
          total_amount: total_cost,
          rental_status: status,
          payment_status,
          deposit_amount,
          deposit_returned_at,
          approval_status,
          pending_total_request,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(id, name, plate_number),
          extensions:rental_extensions!rental_extensions_rental_id_fkey(id, extension_hours, status, created_at)
        `)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRentals(data || []);
    } catch (err) {
      setError(err.message);
      console.error("❌ Supabase Error", { 
        message: err.message, 
        details: err.details, 
        hint: err.hint, 
        code: err.code 
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchRentals();
  }, []);

  // Real-time subscription for rental updates (especially extensions)
  useEffect(() => {
    const channel = supabase
      .channel('rental-extensions-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rental_extensions'
        },
        () => {
          console.log('Extension added, refreshing rentals...');
          fetchRentals();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_4c3a7a6153_rentals'
        },
        () => {
          console.log('Rental updated, refreshing...');
          fetchRentals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Real-time broadcast subscription for updates from RentalDetails
  useEffect(() => {
    const broadcastChannel = supabase
      .channel('rental-broadcast-updates')
      .on('broadcast', { event: 'payment_updated' }, (payload) => {
        console.log('🔄 Payment broadcast received:', payload);
        fetchRentals();
      })
      .on('broadcast', { event: 'status_updated' }, (payload) => {
        console.log('🔄 Status broadcast received:', payload);
        fetchRentals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastChannel);
    };
  }, []);

  // Refresh data when window regains focus
  useEffect(() => {
    const handleFocus = () => {
      fetchRentals();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Check if current user can delete a rental - ONLY OWNER role
  const canDelete = () => {
    if (!user?.id) return false;
    return user.role === 'owner';
  };

  const handleDelete = async (rentalId) => {
    if (user?.role !== 'owner') {
      alert('Only owners can delete rentals.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this rental? This action cannot be undone.')) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .delete()
        .eq('id', rentalId);

      if (deleteError) throw deleteError;

      setRentals(rentals.filter(r => r.id !== rentalId));
      alert('Rental deleted successfully.');
    } catch (err) {
      console.error('Error deleting rental:', err);
      alert(`Failed to delete rental: ${err.message}`);
    }
  };

  // Get display status - prioritize payment_status, fallback to rental_status
  const getDisplayStatus = (rental) => {
    if (rental.payment_status && rental.payment_status !== 'unknown') {
      return rental.payment_status;
    }
    
    if (rental.rental_status) {
      return rental.rental_status;
    }
    
    return 'pending';
  };

  const getStatusVariant = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "confirmed":
      case "paid":
        return "default";
      case "completed":
      case "partial":
        return "secondary";
      case "cancelled":
      case "unpaid":
      case "overdue":
        return "destructive";
      case "scheduled":
      case "pending":
        return "outline";
      default:
        return "outline";
    }
  };
  
  const getPaymentStatusVariant = (status) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return "default";
      case "partial":
        return "secondary";
      case "unpaid":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (loading) return <div className="text-center py-10">Loading rentals...</div>;
  if (error) return <div className="text-center py-10 text-red-600">Error: {error}</div>;

  return (
    <div className="border rounded-lg w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rental ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Plate Number</TableHead>
            <TableHead>Rental Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rentals.length > 0 ? (
            rentals.map((rental) => {
              const displayStatus = getDisplayStatus(rental);
              const timeRemaining = calculateTimeRemaining(rental);
              
              return (
                <TableRow key={rental.id}>
                  <TableCell>{formatRentalId(rental.id)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{rental.customer_name || 'N/A'}</div>
                    <Link to="#" className="text-sm text-muted-foreground hover:underline">
                      View Customer Details
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{rental.vehicle?.name || "N/A"}</div>
                    <div className="text-sm text-muted-foreground">ID: {rental.vehicle?.id || "N/A"}</div>
                  </TableCell>
                  <TableCell>{rental.vehicle?.plate_number || "N/A"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{formatRentalPeriod(rental)}</div>
                      {rental.rental_status === 'active' && timeRemaining && (
                        <div className="text-xs text-blue-600 font-medium">
                          ⏱️ {timeRemaining}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(displayStatus)}>
                      {displayStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPaymentStatusVariant(rental.payment_status)}>
                      {rental.payment_status || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>{rental.total_amount?.toFixed(2) || "0.00"} MAD</span>
                      {rental.approval_status === 'pending' && rental.pending_total_request && (
                        <Badge 
                          variant="outline" 
                          className="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Details</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Close</DropdownMenuItem>
                        {canDelete() && (
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDelete(rental.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="text-center">
                No rentals found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}