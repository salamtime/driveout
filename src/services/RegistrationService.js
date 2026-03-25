// src/services/RegistrationService.js
/**
 * Service to manage vehicle registration data
 */
class RegistrationService {
  constructor() {
    // Use localStorage to simulate database storage for now
    const storedRegistrations = localStorage.getItem('vehicleRegistrations');
    this.registrations = storedRegistrations ? JSON.parse(storedRegistrations) : [];
    this.listeners = [];
    
    // Generate a unique ID for new registrations
    this.lastId = this.registrations.length > 0 
      ? Math.max(...this.registrations.map(reg => parseInt(reg.id.replace('reg', ''), 10)))
      : 0;
  }

  /**
   * Subscribe to data changes
   * @param {Function} listener - Callback function to be called on data changes
   * @returns {Function} - Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners about data changes
   */
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.registrations));
    // Save to localStorage
    localStorage.setItem('vehicleRegistrations', JSON.stringify(this.registrations));
  }

  /**
   * Get all registrations
   * @returns {Array} - All registrations
   */
  getAllRegistrations() {
    return [...this.registrations];
  }

  /**
   * Get registrations for a specific vehicle
   * @param {string} vehicleId - Vehicle ID
   * @returns {Object|null} - Latest registration for the vehicle or null if not found
   */
  getVehicleRegistration(vehicleId) {
    const vehicleRegistrations = this.registrations.filter(
      reg => reg.vehicleId === vehicleId
    ).sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate));
    
    return vehicleRegistrations.length > 0 ? vehicleRegistrations[0] : null;
  }

  /**
   * Get all registrations for a specific vehicle
   * @param {string} vehicleId - Vehicle ID
   * @returns {Array} - All registrations for the vehicle
   */
  getVehicleRegistrationHistory(vehicleId) {
    return this.registrations
      .filter(reg => reg.vehicleId === vehicleId)
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate));
  }

  /**
   * Add a new registration record
   * @param {Object} registrationData - Registration data
   * @returns {Object} - Created registration record
   */
  addRegistration(registrationData) {
    this.lastId++;
    const id = `reg${this.lastId.toString().padStart(3, '0')}`;
    
    const newRegistration = {
      id,
      ...registrationData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.registrations.push(newRegistration);
    this.notifyListeners();
    
    return newRegistration;
  }

  /**
   * Update an existing registration record
   * @param {string} id - Registration ID
   * @param {Object} registrationData - Updated registration data
   * @returns {Object|null} - Updated registration or null if not found
   */
  updateRegistration(id, registrationData) {
    const index = this.registrations.findIndex(reg => reg.id === id);
    if (index === -1) return null;
    
    const updatedRegistration = {
      ...this.registrations[index],
      ...registrationData,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };
    
    this.registrations[index] = updatedRegistration;
    this.notifyListeners();
    
    return updatedRegistration;
  }

  /**
   * Delete a registration record
   * @param {string} id - Registration ID
   * @returns {boolean} - True if deleted, false if not found
   */
  deleteRegistration(id) {
    const initialLength = this.registrations.length;
    this.registrations = this.registrations.filter(reg => reg.id !== id);
    
    const deleted = initialLength > this.registrations.length;
    if (deleted) {
      this.notifyListeners();
    }
    
    return deleted;
  }

  /**
   * Get registrations that are expiring soon
   * @param {number} daysThreshold - Number of days to consider for upcoming expiration
   * @returns {Array} - Array of registrations expiring within the threshold
   */
  getExpiringRegistrations(daysThreshold = 30) {
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + daysThreshold);
    
    // Group by vehicleId to get only the latest registration per vehicle
    const latestRegistrationByVehicle = {};
    this.registrations.forEach(reg => {
      const existingReg = latestRegistrationByVehicle[reg.vehicleId];
      if (!existingReg || new Date(reg.registrationDate) > new Date(existingReg.registrationDate)) {
        latestRegistrationByVehicle[reg.vehicleId] = reg;
      }
    });
    
    return Object.values(latestRegistrationByVehicle).filter(reg => {
      const expiryDate = new Date(reg.expiryDate);
      return expiryDate > today && expiryDate <= thresholdDate;
    });
  }

  /**
   * Check if a vehicle's registration is valid
   * @param {string} vehicleId - Vehicle ID
   * @returns {Object} - Status object with isValid flag and message
   */
  checkRegistrationStatus(vehicleId) {
    const registration = this.getVehicleRegistration(vehicleId);
    
    if (!registration) {
      return { isValid: false, message: 'No registration found' };
    }
    
    const today = new Date();
    const expiryDate = new Date(registration.expiryDate);
    
    if (expiryDate < today) {
      return {
        isValid: false,
        message: 'Registration expired',
        daysExpired: Math.floor((today - expiryDate) / (1000 * 60 * 60 * 24))
      };
    }
    
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= 30) {
      return {
        isValid: true,
        message: 'Registration expiring soon',
        daysUntilExpiry
      };
    }
    
    return {
      isValid: true,
      message: 'Registration valid',
      daysUntilExpiry
    };
  }

  /**
   * Handle document upload and return a promise resolving to data URL
   * @param {File} file - File object
   * @returns {Promise<string>} - Promise resolving to data URL
   */
  uploadRegistrationDocument(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      
      if (!validTypes.includes(file.type)) {
        reject(new Error('Invalid file type'));
        return;
      }
      
      if (file.size > maxSize) {
        reject(new Error('File too large'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        // In a real app, we'd upload to a server or storage
        resolve(e.target.result);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  }
}

// Export a singleton instance
const registrationService = new RegistrationService();
export default registrationService;