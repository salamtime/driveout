// Schema Discovery Utility - Discover actual database tables and columns
import { supabase } from './supabaseClient';

export class SchemaDiscovery {
  constructor() {
    this.schemaMapping = new Map();
  }

  // Step 1: Query for tables with saharax_0u4w4d_ prefix using RPC
  async discoverTables() {
    try {
      console.log('🔍 Discovering tables with saharax_0u4w4d_ prefix using RPC...');
      
      const { data: tables, error } = await supabase
        .rpc('list_tables', { prefix: 'saharax_0u4w4d_' });

      if (error) {
        console.error('Error discovering tables:', error);
        return [];
      }

      console.log('📋 Found tables:', tables.map(t => t.table_name));
      return tables.map(t => t.table_name);
    } catch (error) {
      console.error('Exception during table discovery:', error);
      return [];
    }
  }

  // Step 2: For each table, fetch its columns using RPC
  async discoverColumns(tableName) {
    try {
      console.log(`🔍 Discovering columns for table: ${tableName} using RPC...`);
      
      const { data: columns, error } = await supabase
        .rpc('list_columns', { table_param: tableName });

      if (error) {
        console.error(`Error discovering columns for ${tableName}:`, error);
        return [];
      }

      // Transform RPC response to match expected format
      const formattedColumns = columns.map(col => ({
        table_name: tableName,
        column_name: col.column_name,
        data_type: col.data_type
      }));

      console.log(`📋 Found columns for ${tableName}:`, columns.map(c => c.column_name));
      return formattedColumns;
    } catch (error) {
      console.error(`Exception during column discovery for ${tableName}:`, error);
      return [];
    }
  }

  // Step 3: Consolidate results into mapping of table_name → [column_name, ...]
  async buildSchemaMapping() {
    try {
      console.log('🏗️ Building complete schema mapping...');
      
      const tables = await this.discoverTables();
      
      for (const tableName of tables) {
        const columns = await this.discoverColumns(tableName);
        const columnNames = columns.map(col => col.column_name);
        this.schemaMapping.set(tableName, {
          columns: columnNames,
          columnDetails: columns
        });
      }

      console.log('✅ Schema mapping complete:', this.schemaMapping);
      return this.schemaMapping;
    } catch (error) {
      console.error('Error building schema mapping:', error);
      return new Map();
    }
  }

  // Get columns for a specific table
  getTableColumns(tableName) {
    const tableSchema = this.schemaMapping.get(tableName);
    return tableSchema ? tableSchema.columns : [];
  }

  // Get safe select query for a table with only existing columns
  getSafeSelect(tableName, requestedColumns) {
    const availableColumns = this.getTableColumns(tableName);
    
    if (availableColumns.length === 0) {
      console.warn(`⚠️ Table ${tableName} not found in schema mapping`);
      return '*'; // Fallback to all columns
    }

    // Filter requested columns to only include existing ones
    const safeColumns = requestedColumns.filter(col => 
      availableColumns.includes(col)
    );

    if (safeColumns.length === 0) {
      console.warn(`⚠️ None of requested columns exist in ${tableName}. Available: ${availableColumns.join(', ')}`);
      return availableColumns.slice(0, 5).join(', '); // Return first 5 columns as fallback
    }

    console.log(`✅ Safe select for ${tableName}: ${safeColumns.join(', ')}`);
    return safeColumns.join(', ');
  }

  // Check if table exists
  tableExists(tableName) {
    return this.schemaMapping.has(tableName);
  }

  // Display full schema mapping for debugging
  displaySchema() {
    console.log('📊 Full Database Schema:');
    for (const [tableName, schema] of this.schemaMapping.entries()) {
      console.log(`\n🔹 ${tableName}:`);
      console.log(`   Columns: ${schema.columns.join(', ')}`);
    }
  }
}

// Create global instance
export const schemaDiscovery = new SchemaDiscovery();

// Initialize schema discovery
export async function initializeSchema() {
  try {
    console.log('🚀 Initializing database schema discovery...');
    await schemaDiscovery.buildSchemaMapping();
    schemaDiscovery.displaySchema();
    return schemaDiscovery;
  } catch (error) {
    console.error('Failed to initialize schema:', error);
    return schemaDiscovery;
  }
}