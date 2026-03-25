import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { 
  fetchBookings,
  addBookingRealtime,
  updateBookingRealtime,
  removeBookingRealtime
} from '../store/slices/bookingsSlice';
import { supabase } from '../utils/supabaseClient';
import { TBL } from '../config/tables';

/**
 * Custom hook for real-time booking updates
 * FIXED: Uses correct action names from bookingsSlice
 */
export const useRealtimeBookings = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    console.log('🔄 Setting up real-time booking subscriptions...');

    // Subscribe to real-time changes on the rentals table
    const subscription = supabase
      .channel('rentals_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TBL.RENTALS.replace(/^.*_/, '') // Remove prefix for subscription
        },
        (payload) => {
          console.log('📥 Real-time booking added:', payload.new);
          dispatch(addBookingRealtime(payload.new));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: TBL.RENTALS.replace(/^.*_/, '') // Remove prefix for subscription
        },
        (payload) => {
          console.log('📝 Real-time booking updated:', payload.new);
          dispatch(updateBookingRealtime(payload.new));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: TBL.RENTALS.replace(/^.*_/, '') // Remove prefix for subscription
        },
        (payload) => {
          console.log('🗑️ Real-time booking deleted:', payload.old);
          dispatch(removeBookingRealtime(payload.old.id));
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status);
      });

    // Initial fetch of bookings
    dispatch(fetchBookings());

    // Cleanup subscription on unmount
    return () => {
      console.log('🔌 Cleaning up real-time booking subscriptions...');
      supabase.removeChannel(subscription);
    };
  }, [dispatch]);

  return {
    // Return any additional utilities if needed
    refreshBookings: () => dispatch(fetchBookings())
  };
};

export default useRealtimeBookings;