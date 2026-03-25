import { useEffect, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useRealtimeBookings } from './useRealtimeBookings'

export const useCalendarSync = () => {
  const dispatch = useDispatch()
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  
  const bookingsState = useSelector(state => state.bookings);
  const bookings = bookingsState?.bookings || [];
  const loading = bookingsState?.loading || false;

  // Initialize real-time subscriptions
  const { refreshBookings } = useRealtimeBookings()

  // Handle connection status
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(true)
      setLastUpdate(new Date())
    }
    
    checkConnection()
    const interval = setInterval(checkConnection, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  // Transform bookings into calendar events
  const getCalendarEvents = useCallback(() => {
    if (!bookings || !Array.isArray(bookings)) return []
    
    return bookings.map(booking => ({
      id: booking.id,
      title: booking.tourName || 'Unknown Tour',
      start: new Date(booking.selectedDate + 'T' + booking.selectedTime),
      end: new Date(new Date(booking.selectedDate + 'T' + booking.selectedTime).getTime() + (booking.duration || 120) * 60000),
      status: booking.status,
      guide: booking.assignedGuide || booking.guideName,
      participants: booking.participants || [],
      resource: {
        type: 'booking',
        data: booking
      },
      className: `status-${booking.status}`,
      backgroundColor: getStatusColor(booking.status),
      borderColor: getStatusColor(booking.status, true)
    }))
  }, [bookings])

  // Get status color for visual indicators
  const getStatusColor = (status, isBorder = false) => {
    const colors = {
      pending: isBorder ? '#ff9800' : '#fff3e0',
      confirmed: isBorder ? '#4caf50' : '#e8f5e8',
      on_tour: isBorder ? '#2196f3' : '#e3f2fd',
      completed: isBorder ? '#9e9e9e' : '#f5f5f5',
      cancelled: isBorder ? '#f44336' : '#ffebee'
    }
    return colors[status] || (isBorder ? '#9e9e9e' : '#f5f5f5')
  }

  // Force refresh all data
  const forceSync = useCallback(() => {
    refreshBookings()
  }, [refreshBookings])

  // Get all calendar events
  const allEvents = getCalendarEvents()

  return {
    events: allEvents,
    isConnected,
    lastUpdate,
    isLoading: loading,
    forceSync,
    connectionStatus: isConnected ? 'connected' : 'disconnected'
  }
}