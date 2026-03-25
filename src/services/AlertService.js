class AlertService {
  constructor() {
    this.subscribers = [];
    this.alerts = [];
  }

  // ========== SUBSCRIPTION SYSTEM ==========
  subscribe(callback) {
    if (!this.subscribers) {
      this.subscribers = [];
    }
    this.subscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  notifySubscribers() {
    if (this.subscribers) {
      this.subscribers.forEach(callback => {
        try {
          callback(this.alerts);
        } catch (error) {
          console.error('Error in alert subscriber callback:', error);
        }
      });
    }
  }

  // ========== ALERT MANAGEMENT ==========
  
  /**
   * Get all alerts for a specific vehicle
   * @param {string} vehicleId - Vehicle ID
   * @returns {Array} - Array of alerts for the vehicle
   */
  getVehicleAlerts(vehicleId) {
    return this.alerts.filter(alert => alert.vehicleId === vehicleId) || [];
  }

  /**
   * Create or update oil change alert for a vehicle
   * @param {string} vehicleId - Vehicle ID
   * @param {string} vehicleName - Vehicle name
   * @param {string} plateNumber - Vehicle plate number
   * @param {number} currentOdometer - Current odometer reading
   * @param {number} nextOilChangeOdometer - Next oil change due odometer
   */
  createOrUpdateOilChangeAlert(vehicleId, vehicleName, plateNumber, currentOdometer, nextOilChangeOdometer) {
    try {
      // Remove existing oil change alerts for this vehicle
      this.alerts = this.alerts.filter(alert => 
        !(alert.vehicleId === vehicleId && alert.type === 'oil_change')
      );

      if (!currentOdometer || !nextOilChangeOdometer) {
        this.notifySubscribers();
        return;
      }

      const kmUntilService = nextOilChangeOdometer - currentOdometer;
      
      // Format vehicle identifier with plate number
      const vehicleIdentifier = plateNumber && plateNumber !== 'N/A' 
        ? `${vehicleName} (${plateNumber})` 
        : vehicleName;
      
      // Only create alert if service is due soon or overdue
      if (kmUntilService <= 100) {
        const priority = kmUntilService <= 0 ? 'high' : kmUntilService <= 50 ? 'medium' : 'low';
        const isOverdue = kmUntilService <= 0;
        
        const alert = {
          id: `oil_change_${vehicleId}_${Date.now()}`,
          vehicleId: vehicleId,
          type: 'oil_change',
          title: isOverdue ? 'Oil Change Overdue' : 'Oil Change Due Soon',
          message: isOverdue 
            ? `${vehicleIdentifier} is ${Math.abs(kmUntilService)} km overdue for oil change`
            : `${vehicleIdentifier} needs oil change in ${kmUntilService} km`,
          priority: priority,
          createdAt: new Date().toISOString(),
          isOverdue: isOverdue,
          kmUntilService: kmUntilService
        };

        this.alerts.push(alert);
      }

      this.notifySubscribers();
    } catch (error) {
      console.error('Error creating oil change alert:', error);
    }
  }

  /**
   * Create or update insurance expiry alert for a vehicle
   * @param {string} vehicleId - Vehicle ID
   * @param {string} vehicleName - Vehicle name
   * @param {string} plateNumber - Vehicle plate number
   * @param {string} insuranceExpiryDate - Insurance expiry date (ISO string)
   */
  createOrUpdateInsuranceExpiryAlert(vehicleId, vehicleName, plateNumber, insuranceExpiryDate) {
    try {
      // Remove existing insurance expiry alerts for this vehicle
      this.alerts = this.alerts.filter(alert => 
        !(alert.vehicleId === vehicleId && alert.type === 'insurance_expiry')
      );

      if (!insuranceExpiryDate) {
        this.notifySubscribers();
        return;
      }

      const expiryDate = new Date(insuranceExpiryDate);
      const today = new Date();
      const daysDifference = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Format vehicle identifier with plate number
      const vehicleIdentifier = plateNumber && plateNumber !== 'N/A' 
        ? `${vehicleName} (${plateNumber})` 
        : vehicleName;
      
      // Only create alert if insurance expires within 30 days or is already expired
      if (daysDifference <= 30) {
        const priority = daysDifference <= 0 ? 'high' : daysDifference <= 7 ? 'medium' : 'low';
        const isExpired = daysDifference <= 0;
        
        const alert = {
          id: `insurance_expiry_${vehicleId}_${Date.now()}`,
          vehicleId: vehicleId,
          type: 'insurance_expiry',
          title: isExpired ? 'Insurance Expired' : 'Insurance Expiry Due Soon',
          message: isExpired 
            ? `${vehicleIdentifier} insurance expired ${Math.abs(daysDifference)} days ago`
            : `${vehicleIdentifier} insurance expires in ${daysDifference} days`,
          priority: priority,
          createdAt: new Date().toISOString(),
          isExpired: isExpired,
          daysUntilExpiry: daysDifference
        };

        this.alerts.push(alert);
      }

      this.notifySubscribers();
    } catch (error) {
      console.error('Error creating insurance expiry alert:', error);
    }
  }

  /**
   * Create or update registration expiry alert for a vehicle
   * @param {string} vehicleId - Vehicle ID
   * @param {string} vehicleName - Vehicle name
   * @param {string} plateNumber - Vehicle plate number
   * @param {string} registrationExpiryDate - Registration expiry date (ISO string)
   */
  createOrUpdateRegistrationExpiryAlert(vehicleId, vehicleName, plateNumber, registrationExpiryDate) {
    try {
      // Remove existing registration expiry alerts for this vehicle
      this.alerts = this.alerts.filter(alert => 
        !(alert.vehicleId === vehicleId && alert.type === 'registration_expiry')
      );

      if (!registrationExpiryDate) {
        this.notifySubscribers();
        return;
      }

      const expiryDate = new Date(registrationExpiryDate);
      const today = new Date();
      const daysDifference = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Format vehicle identifier with plate number
      const vehicleIdentifier = plateNumber && plateNumber !== 'N/A' 
        ? `${vehicleName} (${plateNumber})` 
        : vehicleName;
      
      // Only create alert if registration expires within 30 days or is already expired
      if (daysDifference <= 30) {
        const priority = daysDifference <= 0 ? 'high' : daysDifference <= 7 ? 'medium' : 'low';
        const isExpired = daysDifference <= 0;
        
        const alert = {
          id: `registration_expiry_${vehicleId}_${Date.now()}`,
          vehicleId: vehicleId,
          type: 'registration_expiry',
          title: isExpired ? 'Registration Expired' : 'Registration Expiry Due Soon',
          message: isExpired 
            ? `${vehicleIdentifier} registration expired ${Math.abs(daysDifference)} days ago`
            : `${vehicleIdentifier} registration expires in ${daysDifference} days`,
          priority: priority,
          createdAt: new Date().toISOString(),
          isExpired: isExpired,
          daysUntilExpiry: daysDifference
        };

        this.alerts.push(alert);
      }

      this.notifySubscribers();
    } catch (error) {
      console.error('Error creating registration expiry alert:', error);
    }
  }

  /**
   * Create or update rental return overdue alert for a rental
   * @param {string} rentalId - Rental ID
   * @param {string} vehicleId - Vehicle ID
   * @param {string} vehicleName - Vehicle name
   * @param {string} plateNumber - Vehicle plate number
   * @param {string} customerName - Customer name
   * @param {string} rentalEndDate - Rental end date (ISO string)
   * @param {string} rentalStatus - Rental status
   */
  createOrUpdateRentalReturnOverdueAlert(rentalId, vehicleId, vehicleName, plateNumber, customerName, rentalEndDate, rentalStatus) {
    try {
      // Remove existing rental return alerts for this rental
      this.alerts = this.alerts.filter(alert => 
        !(alert.rentalId === rentalId && alert.type === 'rental_return_overdue')
      );

      // Only process active or ongoing rentals
      if (!rentalStatus || !['active', 'ongoing'].includes(rentalStatus.toLowerCase())) {
        this.notifySubscribers();
        return;
      }

      if (!rentalEndDate) {
        this.notifySubscribers();
        return;
      }

      const endDate = new Date(rentalEndDate);
      const today = new Date();
      const daysDifference = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
      
      // Format vehicle identifier with plate number
      const vehicleIdentifier = plateNumber && plateNumber !== 'N/A' 
        ? `${vehicleName} (${plateNumber})` 
        : vehicleName;
      
      // Create alert if rental is overdue or due within 24 hours
      if (daysDifference <= 1) {
        const isOverdue = daysDifference < 0;
        const priority = isOverdue ? 'high' : 'medium';
        const daysOverdue = Math.abs(daysDifference);
        
        const alert = {
          id: `rental_return_overdue_${rentalId}_${Date.now()}`,
          rentalId: rentalId,
          vehicleId: vehicleId,
          type: 'rental_return_overdue',
          title: isOverdue ? `Rental Return Overdue - ${plateNumber}` : `Rental Return Due Soon - ${plateNumber}`,
          message: isOverdue 
            ? `${vehicleIdentifier} rental by ${customerName} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue (Status: ${rentalStatus})`
            : `${vehicleIdentifier} rental by ${customerName} is due for return today (Status: ${rentalStatus})`,
          priority: priority,
          createdAt: new Date().toISOString(),
          isOverdue: isOverdue,
          daysOverdue: daysOverdue,
          customerName: customerName,
          rentalStatus: rentalStatus
        };

        this.alerts.push(alert);
      }

      this.notifySubscribers();
    } catch (error) {
      console.error('Error creating rental return overdue alert:', error);
    }
  }

  /**
   * Update all vehicle alerts (oil change, insurance, registration)
   * @param {Array} vehicles - Array of vehicle objects
   */
  updateAllVehicleAlerts(vehicles) {
    try {
      if (!vehicles || vehicles.length === 0) return;

      vehicles.forEach(vehicle => {
        // Get plate number from either plate_number or license_plate field
        const plateNumber = vehicle.plate_number || vehicle.license_plate || null;
        
        // Oil change alerts
        if (vehicle.current_odometer && vehicle.next_oil_change_odometer) {
          this.createOrUpdateOilChangeAlert(
            vehicle.id.toString(),
            vehicle.name,
            plateNumber,
            parseFloat(vehicle.current_odometer),
            parseFloat(vehicle.next_oil_change_odometer)
          );
        }

        // Insurance expiry alerts
        if (vehicle.insurance_expiry_date) {
          this.createOrUpdateInsuranceExpiryAlert(
            vehicle.id.toString(),
            vehicle.name,
            plateNumber,
            vehicle.insurance_expiry_date
          );
        }

        // Registration expiry alerts
        if (vehicle.registration_expiry_date) {
          this.createOrUpdateRegistrationExpiryAlert(
            vehicle.id.toString(),
            vehicle.name,
            plateNumber,
            vehicle.registration_expiry_date
          );
        }
      });
    } catch (error) {
      console.error('Error updating all vehicle alerts:', error);
    }
  }

  /**
   * Update all rental return alerts
   * @param {Array} rentals - Array of rental objects with vehicle information
   */
  updateAllRentalReturnAlerts(rentals) {
    try {
      if (!rentals || rentals.length === 0) return;

      rentals.forEach(rental => {
        // Only process active or ongoing rentals
        if (rental.status && ['active', 'ongoing'].includes(rental.status.toLowerCase())) {
          // Get vehicle information
          const vehicle = rental.vehicle || rental.vehicles;
          const plateNumber = vehicle?.plate_number || vehicle?.license_plate || null;
          const vehicleName = vehicle?.name || vehicle?.make + ' ' + vehicle?.model || 'Unknown Vehicle';

          if (rental.end_date) {
            this.createOrUpdateRentalReturnOverdueAlert(
              rental.id.toString(),
              vehicle?.id?.toString() || rental.vehicle_id?.toString(),
              vehicleName,
              plateNumber,
              rental.customer_name || 'Unknown Customer',
              rental.end_date,
              rental.status
            );
          }
        }
      });
    } catch (error) {
      console.error('Error updating all rental return alerts:', error);
    }
  }

  /**
   * Update oil change alerts for all vehicles (kept for backward compatibility)
   * @param {Array} vehicles - Array of vehicle objects
   */
  updateAllOilChangeAlerts(vehicles) {
    // Call the comprehensive method for all alerts
    this.updateAllVehicleAlerts(vehicles);
  }

  /**
   * Create a general alert
   * @param {Object} alertData - Alert data
   * @returns {Object} - Created alert
   */
  createAlert(alertData) {
    const alert = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      ...alertData,
      createdAt: new Date().toISOString()
    };

    this.alerts.push(alert);
    this.notifySubscribers();
    
    return alert;
  }

  /**
   * Remove an alert
   * @param {string} alertId - Alert ID
   * @returns {boolean} - Success status
   */
  removeAlert(alertId) {
    const initialLength = this.alerts.length;
    this.alerts = this.alerts.filter(alert => alert.id !== alertId);
    
    if (this.alerts.length < initialLength) {
      this.notifySubscribers();
      return true;
    }
    
    return false;
  }

  /**
   * Clear all alerts for a vehicle
   * @param {string} vehicleId - Vehicle ID
   */
  clearVehicleAlerts(vehicleId) {
    this.alerts = this.alerts.filter(alert => alert.vehicleId !== vehicleId);
    this.notifySubscribers();
  }

  /**
   * Clear all alerts for a rental
   * @param {string} rentalId - Rental ID
   */
  clearRentalAlerts(rentalId) {
    this.alerts = this.alerts.filter(alert => alert.rentalId !== rentalId);
    this.notifySubscribers();
  }

  /**
   * Get all alerts
   * @returns {Array} - Array of all alerts
   */
  getAllAlerts() {
    return this.alerts || [];
  }

  /**
   * Get alerts by priority
   * @param {string} priority - Priority level (high, medium, low)
   * @returns {Array} - Array of alerts with specified priority
   */
  getAlertsByPriority(priority) {
    return this.alerts.filter(alert => alert.priority === priority) || [];
  }

  /**
   * Get overdue alerts
   * @returns {Array} - Array of overdue alerts
   */
  getOverdueAlerts() {
    return this.alerts.filter(alert => alert.isOverdue || alert.isExpired) || [];
  }

  /**
   * Mark alert as read
   * @param {string} alertId - Alert ID
   */
  markAsRead(alertId) {
    const alert = this.alerts.find(alert => alert.id === alertId);
    if (alert) {
      alert.isRead = true;
      alert.readAt = new Date().toISOString();
      this.notifySubscribers();
    }
  }

  /**
   * Get unread alerts count
   * @returns {number} - Number of unread alerts
   */
  getUnreadCount() {
    return this.alerts.filter(alert => !alert.isRead).length;
  }
}

export default new AlertService();