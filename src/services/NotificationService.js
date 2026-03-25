import { supabase } from '../lib/supabase';
import { TBL } from '../config/tables';
import CacheService from './CacheService';
import PerformanceMonitor from '../utils/PerformanceMonitor';

class NotificationService {
  constructor() {
    this.subscribers = new Map();
    this.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.subscriptions = new Map();
    this.cache = new CacheService('notifications');
  }

  /**
   * Initialize real-time notification system
   */
  async initialize() {
    const startTime = performance.now();
    
    try {
      // Set up real-time subscriptions for different entity types
      await this.setupBookingSubscription();
      await this.setupRentalSubscription();
      await this.setupVehicleSubscription();
      await this.setupSystemSubscription();
      
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      
      // Emit connection success event
      this.emit('connection:success', { 
        status: 'connected',
        timestamp: new Date().toISOString()
      });

      PerformanceMonitor.recordMetric('notification_service_init', performance.now() - startTime);
      console.log('✅ NotificationService initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize NotificationService:', error);
      this.connectionStatus = 'error';
      this.handleConnectionError(error);
    }
  }

  /**
   * Set up booking-related real-time subscriptions
   */
  async setupBookingSubscription() {
    const subscription = supabase
      .channel('booking_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: TBL.BOOKINGS 
        }, 
        (payload) => this.handleBookingChange(payload)
      )
      .subscribe((status) => {
        console.log(`📡 Booking subscription status: ${status}`);
      });

    this.subscriptions.set('bookings', subscription);
  }

  /**
   * Set up rental-related real-time subscriptions
   */
  async setupRentalSubscription() {
    const subscription = supabase
      .channel('rental_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: TBL.RENTALS 
        }, 
        (payload) => this.handleRentalChange(payload)
      )
      .subscribe((status) => {
        console.log(`📡 Rental subscription status: ${status}`);
      });

    this.subscriptions.set('rentals', subscription);
  }

  /**
   * Set up vehicle-related real-time subscriptions
   */
  async setupVehicleSubscription() {
    const subscription = supabase
      .channel('vehicle_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: TBL.VEHICLES 
        }, 
        (payload) => this.handleVehicleChange(payload)
      )
      .subscribe((status) => {
        console.log(`📡 Vehicle subscription status: ${status}`);
      });

    this.subscriptions.set('vehicles', subscription);
  }

  /**
   * Set up system notifications subscription
   */
  async setupSystemSubscription() {
    const subscription = supabase
      .channel('system_notifications')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: TBL.NOTIFICATIONS 
        }, 
        (payload) => this.handleSystemNotification(payload)
      )
      .subscribe((status) => {
        console.log(`📡 System notifications subscription status: ${status}`);
      });

    this.subscriptions.set('system', subscription);
  }

  /**
   * Handle booking changes
   */
  handleBookingChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    let notification = null;
    
    switch (eventType) {
      case 'INSERT':
        notification = {
          id: `booking_${newRecord.id}_created`,
          type: 'booking_created',
          title: 'New Booking Created',
          message: `Booking #${newRecord.id} has been created`,
          data: newRecord,
          priority: 'medium',
          timestamp: new Date().toISOString()
        };
        break;
        
      case 'UPDATE':
        // Check if status changed
        if (oldRecord.status !== newRecord.status) {
          notification = {
            id: `booking_${newRecord.id}_status_${newRecord.status}`,
            type: 'booking_status_changed',
            title: 'Booking Status Updated',
            message: `Booking #${newRecord.id} status changed from ${oldRecord.status} to ${newRecord.status}`,
            data: { old: oldRecord, new: newRecord },
            priority: this.getStatusChangePriority(newRecord.status),
            timestamp: new Date().toISOString()
          };
        }
        break;
        
      case 'DELETE':
        notification = {
          id: `booking_${oldRecord.id}_deleted`,
          type: 'booking_deleted',
          title: 'Booking Cancelled',
          message: `Booking #${oldRecord.id} has been cancelled`,
          data: oldRecord,
          priority: 'high',
          timestamp: new Date().toISOString()
        };
        break;
    }
    
    if (notification) {
      this.emit('notification', notification);
      this.cacheNotification(notification);
    }
  }

  /**
   * Handle rental changes
   */
  handleRentalChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    let notification = null;
    
    switch (eventType) {
      case 'INSERT':
        notification = {
          id: `rental_${newRecord.id}_created`,
          type: 'rental_created',
          title: 'New Rental Started',
          message: `Rental #${newRecord.id} has been initiated`,
          data: newRecord,
          priority: 'medium',
          timestamp: new Date().toISOString()
        };
        break;
        
      case 'UPDATE':
        if (oldRecord.rental_status !== newRecord.rental_status) {
          notification = {
            id: `rental_${newRecord.id}_status_${newRecord.rental_status}`,
            type: 'rental_status_changed',
            title: 'Rental Status Updated',
            message: `Rental #${newRecord.id} status changed to ${newRecord.rental_status}`,
            data: { old: oldRecord, new: newRecord },
            priority: this.getRentalStatusPriority(newRecord.rental_status),
            timestamp: new Date().toISOString()
          };
        }
        break;
    }
    
    if (notification) {
      this.emit('notification', notification);
      this.cacheNotification(notification);
    }
  }

  /**
   * Handle vehicle changes
   */
  handleVehicleChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    let notification = null;
    
    switch (eventType) {
      case 'UPDATE':
        if (oldRecord.status !== newRecord.status) {
          notification = {
            id: `vehicle_${newRecord.id}_status_${newRecord.status}`,
            type: 'vehicle_status_changed',
            title: 'Vehicle Status Updated',
            message: `Vehicle ${newRecord.name || newRecord.plate_number} status changed to ${newRecord.status}`,
            data: { old: oldRecord, new: newRecord },
            priority: newRecord.status === 'maintenance' ? 'high' : 'low',
            timestamp: new Date().toISOString()
          };
        }
        break;
    }
    
    if (notification) {
      this.emit('notification', notification);
      this.cacheNotification(notification);
    }
  }

  /**
   * Handle system notifications
   */
  handleSystemNotification(payload) {
    const { eventType, new: newRecord } = payload;
    
    if (eventType === 'INSERT') {
      const notification = {
        id: `system_${newRecord.id}`,
        type: 'system_notification',
        title: newRecord.title || 'System Notification',
        message: newRecord.message || 'System update available',
        data: newRecord,
        priority: newRecord.priority || 'medium',
        timestamp: new Date().toISOString()
      };
      
      this.emit('notification', notification);
      this.cacheNotification(notification);
    }
  }

  /**
   * Subscribe to notifications
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType).add(callback);
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(eventType);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(eventType);
        }
      }
    };
  }

  /**
   * Emit event to subscribers
   */
  emit(eventType, data) {
    const subscribers = this.subscribers.get(eventType);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in notification callback for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Cache notification for offline access
   */
  async cacheNotification(notification) {
    try {
      const cacheKey = `notification_${notification.id}`;
      await this.cache.set(cacheKey, notification, 24 * 60 * 60 * 1000); // 24 hours
      
      // Also maintain a list of recent notifications
      const recentKey = 'recent_notifications';
      let recent = await this.cache.get(recentKey) || [];
      
      recent.unshift(notification);
      recent = recent.slice(0, 50); // Keep only 50 most recent
      
      await this.cache.set(recentKey, recent, 24 * 60 * 60 * 1000);
    } catch (error) {
      console.error('Error caching notification:', error);
    }
  }

  /**
   * Get cached notifications
   */
  async getCachedNotifications() {
    try {
      return await this.cache.get('recent_notifications') || [];
    } catch (error) {
      console.error('Error getting cached notifications:', error);
      return [];
    }
  }

  /**
   * Get status change priority
   */
  getStatusChangePriority(status) {
    const priorityMap = {
      'confirmed': 'medium',
      'in_progress': 'high',
      'completed': 'medium',
      'cancelled': 'high',
      'no_show': 'high'
    };
    
    return priorityMap[status] || 'low';
  }

  /**
   * Get rental status priority
   */
  getRentalStatusPriority(status) {
    const priorityMap = {
      'scheduled': 'medium',
      'rented': 'high',
      'completed': 'medium',
      'overdue': 'high',
      'cancelled': 'high'
    };
    
    return priorityMap[status] || 'low';
  }

  /**
   * Handle connection errors
   */
  handleConnectionError(error) {
    this.connectionStatus = 'error';
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      setTimeout(() => {
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.initialize();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emit('connection:failed', { 
        error: error.message,
        attempts: this.reconnectAttempts
      });
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      status: this.connectionStatus,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions.keys())
    };
  }

  /**
   * Cleanup subscriptions
   */
  async cleanup() {
    for (const [key, subscription] of this.subscriptions) {
      try {
        await supabase.removeChannel(subscription);
        console.log(`🧹 Cleaned up ${key} subscription`);
      } catch (error) {
        console.error(`Error cleaning up ${key} subscription:`, error);
      }
    }
    
    this.subscriptions.clear();
    this.subscribers.clear();
    this.connectionStatus = 'disconnected';
  }

  /**
   * Send custom notification
   */
  async sendNotification(notification) {
    try {
      // Store in database if needed
      const { data, error } = await supabase
        .from(TBL.NOTIFICATIONS)
        .insert([{
          title: notification.title,
          message: notification.message,
          type: notification.type || 'custom',
          priority: notification.priority || 'medium',
          data: notification.data || {},
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error storing notification:', error);
        throw error;
      }

      // Emit immediately for real-time delivery
      this.emit('notification', {
        ...notification,
        id: `custom_${data.id}`,
        timestamp: data.created_at
      });

      return data;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;