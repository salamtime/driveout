import { supabase } from '../utils/supabaseClient';

const TOURS_TABLE = 'app_b30c02e74da644baad4668e3587d86b1_tours';

class TourService {
  // Get all active tours from database
  async getAllTours() {
    try {
      const { data, error } = await supabase
        .from(TOURS_TABLE)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching tours:', error);
      throw error;
    }
  }

  // Get tour by ID
  async getTourById(id) {
    try {
      const { data, error } = await supabase
        .from(TOURS_TABLE)
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching tour:', error);
      throw error;
    }
  }

  // Update an existing tour
  async updateTour(id, tourData) {
    try {
      console.log('🔧 TourService.updateTour - STARTING UPDATE');
      console.log('🔧 Input ID:', id, 'Type:', typeof id, 'Length:', id.length);
      console.log('🔧 Table:', TOURS_TABLE);
      console.log('🔧 Update data:', tourData);
      
      const updateData = {
        ...tourData,
        updated_at: new Date().toISOString()
      };

      // DIRECT UPDATE - Skip the problematic existence check
      const { data, error } = await supabase
        .from(TOURS_TABLE)
        .update(updateData)
        .eq('id', id)
        .select();
      
      console.log('🔧 Direct update result:', { data, error, rowsAffected: data?.length || 0 });

      if (error) {
        console.error('🚨 Database error during update:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.log('🔧 NO ROWS UPDATED - Investigating...');
        
        // Check if tour exists with simple select
        const { data: checkTour, error: checkError } = await supabase
          .from(TOURS_TABLE)
          .select('id, name')
          .eq('id', id);
        
        console.log('🔧 Tour existence check:', { checkTour, checkError });
        
        if (checkTour && checkTour.length > 0) {
          console.log('🔧 TOUR EXISTS BUT UPDATE FAILED - This is the bug!');
          // Tour exists but update didn't work - try again with explicit casting
          const { data: retryData, error: retryError } = await supabase
            .from(TOURS_TABLE)
            .update(updateData)
            .eq('id', String(id))
            .select();
          
          console.log('🔧 Retry with string cast:', { retryData, retryError });
          
          if (retryData && retryData.length > 0) {
            console.log('✅ Retry successful!');
            return retryData[0];
          }
        }
        
        // Get all tours for comparison
        const { data: allTours } = await supabase
          .from(TOURS_TABLE)
          .select('id, name')
          .limit(10);
        
        console.log('🔧 All available tours:', allTours);
        
        throw new Error(`No rows updated for tour ID '${id}'. Available tours: ${allTours?.map(t => t.id).join(', ')}`);
      }

      console.log('✅ TourService.updateTour - Success:', data[0]);
      return data[0];
    } catch (error) {
      console.error('🚨 TourService.updateTour - Error:', error);
      throw error;
    }
  }

  // Create a new custom tour
  async createCustomTour(tourData) {
    try {
      const newTour = {
        ...tourData,
        id: `tour_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(TOURS_TABLE)
        .insert([newTour])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating tour:', error);
      throw error;
    }
  }

  // Delete a tour
  async deleteTour(id) {
    try {
      const { error } = await supabase
        .from(TOURS_TABLE)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting tour:', error);
      throw error;
    }
  }

  // Get tour categories (static for now)
  getCategories() {
    return [
      { value: 'city', label: 'City Tours', icon: '🏙️' },
      { value: 'mountain', label: 'Mountain Tours', icon: '⛰️' },
      { value: 'desert', label: 'Desert Tours', icon: '🏜️' },
      { value: 'adventure', label: 'Adventure Tours', icon: '🚵' },
      { value: 'cultural', label: 'Cultural Tours', icon: '🏛️' },
      { value: 'custom', label: 'Custom Tours', icon: '⚙️' }
    ];
  }

  // Search tours (async version)
  async searchTours(query) {
    try {
      const searchTerm = query.toLowerCase();
      const { data, error } = await supabase
        .from(TOURS_TABLE)
        .select('*')
        .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching tours:', error);
      throw error;
    }
  }

  // Get tour statistics (async version)
  async getTourStats() {
    try {
      const allTours = await this.getAllTours();
      const cityTours = allTours.filter(tour => tour.type === 'city');
      const mountainTours = allTours.filter(tour => tour.type === 'mountain');
      const customTours = allTours.filter(tour => tour.type === 'custom');
      const avgPrice = allTours.length > 0 
        ? allTours.reduce((sum, tour) => sum + parseFloat(tour.price || 0), 0) / allTours.length 
        : 0;

      return {
        total: allTours.length,
        city: cityTours.length,
        mountain: mountainTours.length,
        custom: customTours.length,
        avgPrice
      };
    } catch (error) {
      console.error('Error getting tour stats:', error);
      return {
        total: 0,
        city: 0,
        mountain: 0,
        custom: 0,
        avgPrice: 0
      };
    }
  }
}

// Create singleton instance
const tourService = new TourService();
export default tourService;