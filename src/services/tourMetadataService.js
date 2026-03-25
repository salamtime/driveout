import { supabase } from '../lib/supabase';
import cachingLayer from '../utils/cachingLayer';

const TABLE_NAME = 'tour_metadata';
const CACHE_KEY = 'tour_metadata';
const DEFAULT_PAGE_SIZE = 10;

/**
 * Fetch tour metadata with optional pagination
 * @param {number} page - Page number (starting from 1)
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} - { data, count, error }
 */
export const fetchTourMetadata = async (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
  try {
    // Check cache first
    const cacheKey = `${CACHE_KEY}_page_${page}_size_${pageSize}`;
    const cached = cachingLayer.getCache(cacheKey);
    if (cached) return cached;

    // Calculate range for pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    // Fetch paginated data with total count
    const { data, error, count } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(start, end);

    const result = { data, count, error };
    
    // Cache the result
    if (!error) {
      cachingLayer.setCache(cacheKey, result);
    }
    
    return result;
  } catch (err) {
    console.error('Error fetching tour metadata:', err);
    return { data: null, error: err.message };
  }
};

/**
 * Get a single tour metadata item by ID
 * @param {string} id - UUID of the tour metadata
 * @returns {Promise<Object>} - { data, error }
 */
export const getTourMetadataById = async (id) => {
  try {
    const cacheKey = `${CACHE_KEY}_${id}`;
    const cached = cachingLayer.getCache(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    const result = { data, error };
    
    if (!error) {
      cachingLayer.setCache(cacheKey, result);
    }
    
    return result;
  } catch (err) {
    console.error('Error fetching tour metadata by ID:', err);
    return { data: null, error: err.message };
  }
};

/**
 * Create a new tour metadata item
 * @param {Object} metadata - Tour metadata object
 * @returns {Promise<Object>} - { data, error }
 */
export const createTourMetadata = async (metadata) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([metadata])
      .select()
      .single();
    
    if (!error) {
      // Invalidate cache
      cachingLayer.invalidateCache(CACHE_KEY);
    }
    
    return { data, error };
  } catch (err) {
    console.error('Error creating tour metadata:', err);
    return { data: null, error: err.message };
  }
};

/**
 * Update an existing tour metadata item
 * @param {string} id - UUID of the tour metadata to update
 * @param {Object} metadata - Updated tour metadata object
 * @returns {Promise<Object>} - { data, error }
 */
export const updateTourMetadata = async (id, metadata) => {
  try {
    // Add updated_at timestamp
    const updatedMetadata = { 
      ...metadata,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updatedMetadata)
      .eq('id', id)
      .select()
      .single();
    
    if (!error) {
      // Invalidate cache
      cachingLayer.invalidateCache(CACHE_KEY);
      cachingLayer.invalidateCache(`${CACHE_KEY}_${id}`);
    }
    
    return { data, error };
  } catch (err) {
    console.error('Error updating tour metadata:', err);
    return { data: null, error: err.message };
  }
};

/**
 * Delete a tour metadata item
 * @param {string} id - UUID of the tour metadata to delete
 * @returns {Promise<Object>} - { error }
 */
export const deleteTourMetadata = async (id) => {
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);
    
    if (!error) {
      // Invalidate cache
      cachingLayer.invalidateCache(CACHE_KEY);
      cachingLayer.invalidateCache(`${CACHE_KEY}_${id}`);
    }
    
    return { error };
  } catch (err) {
    console.error('Error deleting tour metadata:', err);
    return { error: err.message };
  }
};