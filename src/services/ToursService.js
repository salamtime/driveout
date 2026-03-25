import { supabase } from '../lib/supabase';
import { TBL } from '../config/tables';

class ToursService {
  constructor() {
    this.tableName = TBL.TOURS;
  }

  /**
   * Get all tours
   * @returns {Promise<Array>} Array of tours
   */
  async getAllTours() {
    try {
      console.log(`🔧 Fetching tours from ${this.tableName}`);
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Error fetching tours from ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully fetched ${data?.length || 0} tours from ${this.tableName}`);
      return data || [];
    } catch (err) {
      console.error(`❌ Exception fetching tours from ${this.tableName}:`, err);
      throw err;
    }
  }

  /**
   * Get tour by ID
   * @param {string} tourId - Tour ID
   * @returns {Promise<Object>} Tour object
   */
  async getTourById(tourId) {
    try {
      console.log(`🔧 Fetching tour ${tourId} from ${this.tableName}`);
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', tourId)
        .single();

      if (error) {
        console.error(`❌ Error fetching tour ${tourId} from ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully fetched tour ${tourId} from ${this.tableName}`);
      return data;
    } catch (err) {
      console.error(`❌ Exception fetching tour ${tourId} from ${this.tableName}:`, err);
      throw err;
    }
  }

  /**
   * Create a new tour
   * @param {Object} tourData - Tour data
   * @returns {Promise<Object>} Created tour
   */
  async createTour(tourData) {
    try {
      console.log(`🔧 Creating tour in ${this.tableName}:`, tourData);
      
      const { data, error } = await supabase
        .from(this.tableName)
        .insert([{
          ...tourData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating tour in ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully created tour in ${this.tableName}:`, data);
      return data;
    } catch (err) {
      console.error(`❌ Exception creating tour in ${this.tableName}:`, err);
      throw err;
    }
  }

  /**
   * Update tour
   * @param {string} tourId - Tour ID
   * @param {Object} tourData - Updated tour data
   * @returns {Promise<Object>} Updated tour
   */
  async updateTour(tourId, tourData) {
    try {
      console.log(`🔧 Updating tour ${tourId} in ${this.tableName}:`, tourData);
      
      const { data, error } = await supabase
        .from(this.tableName)
        .update({
          ...tourData,
          updated_at: new Date().toISOString()
        })
        .eq('id', tourId)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error updating tour ${tourId} in ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully updated tour ${tourId} in ${this.tableName}:`, data);
      return data;
    } catch (err) {
      console.error(`❌ Exception updating tour ${tourId} in ${this.tableName}:`, err);
      throw err;
    }
  }

  /**
   * Delete tour
   * @param {string} tourId - Tour ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteTour(tourId) {
    try {
      console.log(`🔧 Deleting tour ${tourId} from ${this.tableName}`);
      
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', tourId);

      if (error) {
        console.error(`❌ Error deleting tour ${tourId} from ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully deleted tour ${tourId} from ${this.tableName}`);
      return true;
    } catch (err) {
      console.error(`❌ Exception deleting tour ${tourId} from ${this.tableName}:`, err);
      throw err;
    }
  }

  /**
   * Get tours by status
   * @param {string} status - Tour status
   * @returns {Promise<Array>} Array of tours with specified status
   */
  async getToursByStatus(status) {
    try {
      console.log(`🔧 Fetching tours with status ${status} from ${this.tableName}`);
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Error fetching tours with status ${status} from ${this.tableName}:`, error);
        throw error;
      }

      console.log(`✅ Successfully fetched ${data?.length || 0} tours with status ${status} from ${this.tableName}`);
      return data || [];
    } catch (err) {
      console.error(`❌ Exception fetching tours with status ${status} from ${this.tableName}:`, err);
      throw err;
    }
  }
}

// Create singleton instance
const toursService = new ToursService();

// Export both named functions and default service
export const getAllTours = (...args) => toursService.getAllTours(...args);
export const getTourById = (...args) => toursService.getTourById(...args);
export const createTour = (...args) => toursService.createTour(...args);
export const updateTour = (...args) => toursService.updateTour(...args);
export const deleteTour = (...args) => toursService.deleteTour(...args);
export const getToursByStatus = (...args) => toursService.getToursByStatus(...args);

export default {
  getAllTours,
  getTourById,
  createTour,
  updateTour,
  deleteTour,
  getToursByStatus,
};