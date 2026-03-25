import { supabase } from '../utils/supabaseClient';

// Utility function to insert missing tour data
export const insertMissingTourData = async () => {
  console.log('🔧 Inserting missing tour data...');
  
  const sampleTours = [
    {
      id: 'city-1-5h',
      name: 'City Tour – 1.5 Hours',
      type: 'city',
      duration: '1.5 hours',
      max_participants: 8,
      price: 150.00,
      description: 'Explore the city highlights in a compact 1.5-hour adventure',
      location: 'Dubai Marina',
      highlights: ['Marina Walk', 'JBR Beach', 'Ain Dubai'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'mountain-2h',
      name: 'Mountain Adventure – 2 Hours',
      type: 'mountain',
      duration: '2 hours',
      max_participants: 6,
      price: 200.00,
      description: 'Experience thrilling mountain trails with breathtaking views',
      location: 'Hatta Mountains',
      highlights: ['Mountain Trails', 'Scenic Views', 'Wildlife Spotting'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'desert-3h',
      name: 'Desert Safari – 3 Hours',
      type: 'desert',
      duration: '3 hours',
      max_participants: 10,
      price: 250.00,
      description: 'Ultimate desert experience with dune bashing and camel rides',
      location: 'Al Qudra Desert',
      highlights: ['Dune Bashing', 'Camel Rides', 'Desert Photography'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'sunset-2h',
      name: 'Sunset Valley – 2 Hours',
      type: 'scenic',
      duration: '2 hours',
      max_participants: 8,
      price: 180.00,
      description: 'Perfect evening tour to watch the sunset over stunning landscapes',
      location: 'Al Hajar Mountains',
      highlights: ['Sunset Views', 'Photography', 'Nature Walk'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  try {
    // First check what tours exist
    console.log('🔍 Checking existing tours...');
    const { data: existingTours, error: checkError } = await supabase
      .from('app_b30c02e74da644baad4668e3587d86b1_tours')
      .select('id, name');
    
    if (checkError) {
      console.error('❌ Error checking tours:', checkError);
      return { success: false, error: checkError.message };
    }
    
    console.log(`📊 Found ${existingTours?.length || 0} existing tours:`, existingTours);
    
    // Insert missing tours one by one
    const results = [];
    for (const tour of sampleTours) {
      const exists = existingTours?.some(existing => existing.id === tour.id);
      
      if (!exists) {
        console.log(`➕ Inserting missing tour: ${tour.id} - ${tour.name}`);
        const { data, error } = await supabase
          .from('app_b30c02e74da644baad4668e3587d86b1_tours')
          .insert([tour])
          .select();
        
        if (error) {
          console.error(`❌ Failed to insert ${tour.id}:`, error);
          results.push({ id: tour.id, success: false, error: error.message });
        } else {
          console.log(`✅ Successfully inserted ${tour.id}`);
          results.push({ id: tour.id, success: true, data });
        }
      } else {
        console.log(`⏭️ Tour ${tour.id} already exists, skipping`);
        results.push({ id: tour.id, success: true, skipped: true });
      }
    }
    
    // Final verification
    const { data: finalTours, error: finalError } = await supabase
      .from('app_b30c02e74da644baad4668e3587d86b1_tours')
      .select('id, name, type, price')
      .order('id');
    
    console.log('📋 Final tours in database:', finalTours);
    
    return {
      success: true,
      results,
      totalTours: finalTours?.length || 0,
      tours: finalTours
    };
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    return { success: false, error: error.message };
  }
};