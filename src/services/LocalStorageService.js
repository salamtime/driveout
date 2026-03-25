class LocalStorageService {
  constructor() {
    this.VEHICLES_KEY = 'fleet_vehicles';
    this.RENTALS_KEY = 'fleet_rentals';
    this.PRICING_KEY = 'vehicle_model_pricing';
    this.CUSTOMERS_KEY = 'fleet_customers';
    this.MAINTENANCE_KEY = 'fleet_maintenance';
    
    // Initialize default data if not exists
    this.initializeDefaultData();
  }

  // Initialize default data on first load
  initializeDefaultData() {
    // Initialize vehicles if not exists
    if (!localStorage.getItem(this.VEHICLES_KEY)) {
      const defaultVehicles = [
        {
          id: 1,
          name: 'SEGWAY AT5',
          vehicle_name: 'SEGWAY AT5',
          model: 'AT5',
          plate_number: '41888',
          plateNumber: '41888',
          status: 'Available',
          battery_level: 85,
          location: 'Depot A',
          last_maintenance: '2025-09-10',
          created_at: new Date().toISOString()
        },
        {
          id: 3,
          name: 'SEGWAY AT6',
          vehicle_name: 'SEGWAY AT6',
          model: 'AT6',
          plate_number: '41111',
          plateNumber: '41111',
          status: 'Maintenance',
          battery_level: 0,
          location: 'Service Center',
          last_maintenance: '2025-09-15',
          created_at: new Date().toISOString()
        }
      ];
      
      localStorage.setItem(this.VEHICLES_KEY, JSON.stringify(defaultVehicles));
      console.log('✅ Initialized default vehicles');
    }

    // Initialize pricing if not exists
    if (!localStorage.getItem(this.PRICING_KEY)) {
      this.initializeDefaultPricing();
    }

    // Initialize other collections
    if (!localStorage.getItem(this.RENTALS_KEY)) {
      localStorage.setItem(this.RENTALS_KEY, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.CUSTOMERS_KEY)) {
      localStorage.setItem(this.CUSTOMERS_KEY, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.MAINTENANCE_KEY)) {
      localStorage.setItem(this.MAINTENANCE_KEY, JSON.stringify([]));
    }
  }

  // Initialize default pricing based on your Vehicle Model Pricing system
  initializeDefaultPricing() {
    const defaultPricing = [
      {
        id: 1,
        name: 'AT5',
        model: 'AT5',
        vehicle_model_id: 'AT5',
        hourlyRate: 400.00,    // Your actual pricing from screenshots
        dailyRate: 1800.00,    // Your actual pricing from screenshots
        weeklyRate: 10800.00,  // 6 days worth (1800 * 6)
        hourly_mad: 400.00,
        daily_mad: 1800.00,
        weekly_mad: 10800.00,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        name: 'AT6',
        model: 'AT6',
        vehicle_model_id: 'AT6',
        hourlyRate: 600.00,    // Your actual pricing from screenshots
        dailyRate: 2200.00,    // Your actual pricing from screenshots
        weeklyRate: 13200.00,  // 6 days worth (2200 * 6)
        hourly_mad: 600.00,
        daily_mad: 2200.00,
        weekly_mad: 13200.00,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    localStorage.setItem(this.PRICING_KEY, JSON.stringify(defaultPricing));
    console.log('✅ Initialized default pricing with your actual rates:', defaultPricing);
  }

  // Initialize pricing with custom data
  initializePricing(pricingData) {
    localStorage.setItem(this.PRICING_KEY, JSON.stringify(pricingData));
    console.log('✅ Pricing data initialized:', pricingData);
  }

  // Fleet Management
  getAllVehicles() {
    try {
      const vehicles = localStorage.getItem(this.VEHICLES_KEY);
      return vehicles ? JSON.parse(vehicles) : [];
    } catch (error) {
      console.error('Error loading vehicles:', error);
      return [];
    }
  }

  saveVehicle(vehicle) {
    try {
      const vehicles = this.getAllVehicles();
      const existingIndex = vehicles.findIndex(v => v.id === vehicle.id);
      
      if (existingIndex >= 0) {
        vehicles[existingIndex] = { ...vehicle, updated_at: new Date().toISOString() };
      } else {
        const newId = Math.max(0, ...vehicles.map(v => v.id)) + 1;
        vehicles.push({ ...vehicle, id: newId, created_at: new Date().toISOString() });
      }
      
      localStorage.setItem(this.VEHICLES_KEY, JSON.stringify(vehicles));
      return vehicle;
    } catch (error) {
      console.error('Error saving vehicle:', error);
      throw error;
    }
  }

  deleteVehicle(vehicleId) {
    try {
      const vehicles = this.getAllVehicles();
      const filtered = vehicles.filter(v => v.id !== vehicleId);
      localStorage.setItem(this.VEHICLES_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      throw error;
    }
  }

  // Pricing Management
  getAllPricing() {
    try {
      const pricing = localStorage.getItem(this.PRICING_KEY);
      const data = pricing ? JSON.parse(pricing) : [];
      
      // Ensure data has proper format
      return data.map(item => ({
        id: item.id || Math.random(),
        name: item.name || item.model || item.vehicle_model_id || 'Unknown',
        model: item.model || item.name || item.vehicle_model_id || 'Unknown',
        vehicle_model_id: item.vehicle_model_id || item.model || item.name || 'Unknown',
        hourlyRate: parseFloat(item.hourlyRate || item.hourly_mad || 0),
        dailyRate: parseFloat(item.dailyRate || item.daily_mad || 0),
        weeklyRate: parseFloat(item.weeklyRate || item.weekly_mad || (item.dailyRate || item.daily_mad || 0) * 7),
        hourly_mad: parseFloat(item.hourly_mad || item.hourlyRate || 0),
        daily_mad: parseFloat(item.daily_mad || item.dailyRate || 0),
        weekly_mad: parseFloat(item.weekly_mad || item.weeklyRate || (item.daily_mad || item.dailyRate || 0) * 7),
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error loading pricing:', error);
      // Return default pricing if error
      this.initializeDefaultPricing();
      return this.getAllPricing();
    }
  }

  getPricing(vehicleModelId) {
    try {
      const allPricing = this.getAllPricing();
      return allPricing.find(p => 
        p.vehicle_model_id === vehicleModelId || 
        p.model === vehicleModelId || 
        p.name === vehicleModelId
      ) || null;
    } catch (error) {
      console.error('Error getting pricing:', error);
      return null;
    }
  }

  savePricing(vehicleModelId, pricingData) {
    try {
      const allPricing = this.getAllPricing();
      const existingIndex = allPricing.findIndex(p => 
        p.vehicle_model_id === vehicleModelId || 
        p.model === vehicleModelId || 
        p.name === vehicleModelId
      );
      
      const newPricing = {
        id: existingIndex >= 0 ? allPricing[existingIndex].id : Math.max(0, ...allPricing.map(p => p.id)) + 1,
        name: vehicleModelId,
        model: vehicleModelId,
        vehicle_model_id: vehicleModelId,
        hourlyRate: parseFloat(pricingData.hourly_mad || pricingData.hourlyRate || 0),
        dailyRate: parseFloat(pricingData.daily_mad || pricingData.dailyRate || 0),
        weeklyRate: parseFloat(pricingData.weekly_mad || pricingData.weeklyRate || (pricingData.daily_mad || pricingData.dailyRate || 0) * 7),
        hourly_mad: parseFloat(pricingData.hourly_mad || pricingData.hourlyRate || 0),
        daily_mad: parseFloat(pricingData.daily_mad || pricingData.dailyRate || 0),
        weekly_mad: parseFloat(pricingData.weekly_mad || pricingData.weeklyRate || (pricingData.daily_mad || pricingData.dailyRate || 0) * 7),
        created_at: existingIndex >= 0 ? allPricing[existingIndex].created_at : new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        allPricing[existingIndex] = newPricing;
      } else {
        allPricing.push(newPricing);
      }
      
      localStorage.setItem(this.PRICING_KEY, JSON.stringify(allPricing));
      console.log('✅ Pricing saved:', newPricing);
      return newPricing;
    } catch (error) {
      console.error('Error saving pricing:', error);
      throw error;
    }
  }

  deletePricing(vehicleModelId) {
    try {
      const allPricing = this.getAllPricing();
      const filtered = allPricing.filter(p => 
        p.vehicle_model_id !== vehicleModelId && p.model !== vehicleModelId && p.name !== vehicleModelId
      );
      localStorage.setItem(this.PRICING_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting pricing:', error);
      throw error;
    }
  }

  // Rental Management
  getAllRentals() {
    try {
      const rentals = localStorage.getItem(this.RENTALS_KEY);
      return rentals ? JSON.parse(rentals) : [];
    } catch (error) {
      console.error('Error loading rentals:', error);
      return [];
    }
  }

  saveRental(rental) {
    try {
      const rentals = this.getAllRentals();
      const existingIndex = rentals.findIndex(r => r.id === rental.id);
      
      if (existingIndex >= 0) {
        rentals[existingIndex] = { ...rental, updated_at: new Date().toISOString() };
      } else {
        const newId = Math.max(0, ...rentals.map(r => r.id)) + 1;
        rentals.push({ ...rental, id: newId, created_at: new Date().toISOString() });
      }
      
      localStorage.setItem(this.RENTALS_KEY, JSON.stringify(rentals));
      return rental;
    } catch (error) {
      console.error('Error saving rental:', error);
      throw error;
    }
  }

  deleteRental(rentalId) {
    try {
      const rentals = this.getAllRentals();
      const filtered = rentals.filter(r => r.id !== rentalId);
      localStorage.setItem(this.RENTALS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting rental:', error);
      throw error;
    }
  }

  // Customer Management
  getAllCustomers() {
    try {
      const customers = localStorage.getItem(this.CUSTOMERS_KEY);
      return customers ? JSON.parse(customers) : [];
    } catch (error) {
      console.error('Error loading customers:', error);
      return [];
    }
  }

  saveCustomer(customer) {
    try {
      const customers = this.getAllCustomers();
      const existingIndex = customers.findIndex(c => c.id === customer.id);
      
      if (existingIndex >= 0) {
        customers[existingIndex] = { ...customer, updated_at: new Date().toISOString() };
      } else {
        const newId = Math.max(0, ...customers.map(c => c.id)) + 1;
        customers.push({ ...customer, id: newId, created_at: new Date().toISOString() });
      }
      
      localStorage.setItem(this.CUSTOMERS_KEY, JSON.stringify(customers));
      return customer;
    } catch (error) {
      console.error('Error saving customer:', error);
      throw error;
    }
  }

  // Maintenance Management
  getAllMaintenance() {
    try {
      const maintenance = localStorage.getItem(this.MAINTENANCE_KEY);
      return maintenance ? JSON.parse(maintenance) : [];
    } catch (error) {
      console.error('Error loading maintenance:', error);
      return [];
    }
  }

  saveMaintenance(maintenanceRecord) {
    try {
      const maintenance = this.getAllMaintenance();
      const existingIndex = maintenance.findIndex(m => m.id === maintenanceRecord.id);
      
      if (existingIndex >= 0) {
        maintenance[existingIndex] = { ...maintenanceRecord, updated_at: new Date().toISOString() };
      } else {
        const newId = Math.max(0, ...maintenance.map(m => m.id)) + 1;
        maintenance.push({ ...maintenanceRecord, id: newId, created_at: new Date().toISOString() });
      }
      
      localStorage.setItem(this.MAINTENANCE_KEY, JSON.stringify(maintenance));
      return maintenanceRecord;
    } catch (error) {
      console.error('Error saving maintenance:', error);
      throw error;
    }
  }

  // Clear all data (for testing)
  clearAllData() {
    localStorage.removeItem(this.VEHICLES_KEY);
    localStorage.removeItem(this.RENTALS_KEY);
    localStorage.removeItem(this.PRICING_KEY);
    localStorage.removeItem(this.CUSTOMERS_KEY);
    localStorage.removeItem(this.MAINTENANCE_KEY);
    this.initializeDefaultData();
  }

  // Export all data
  exportAllData() {
    return {
      vehicles: this.getAllVehicles(),
      rentals: this.getAllRentals(),
      pricing: this.getAllPricing(),
      customers: this.getAllCustomers(),
      maintenance: this.getAllMaintenance()
    };
  }
}

export default new LocalStorageService();
