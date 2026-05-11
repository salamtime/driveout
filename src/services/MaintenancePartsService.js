import { supabase } from '../lib/supabase';
import InventoryService from './InventoryService';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  requireCurrentOrganizationId,
} from './OrganizationService';

/**
 * MaintenancePartsService - Comprehensive parts tracking for maintenance records
 * 
 * Handles the junction table between maintenance and inventory items,
 * manages stock deductions, and calculates costs with transaction safety.
 */
class MaintenancePartsService {
  constructor() {
    this.maintenanceTable = 'app_687f658e98_maintenance';
    this.partsTable = 'app_687f658e98_maintenance_parts';
    this.inventoryTable = 'saharax_0u4w4d_inventory_items';
  }

  parseNotesMetadata(rawNotes) {
    const notes = typeof rawNotes === 'string' ? rawNotes : '';
    const marker = '[finance_snapshot]';
    const markerIndex = notes.indexOf(marker);

    if (markerIndex === -1) {
      return {
        userNotes: notes || null,
        financeSnapshot: null
      };
    }

    const userNotes = notes.slice(0, markerIndex).trim() || null;
    const snapshotText = notes.slice(markerIndex + marker.length).trim();

    try {
      return {
        userNotes,
        financeSnapshot: snapshotText ? JSON.parse(snapshotText) : null
      };
    } catch (error) {
      console.warn('Unable to parse maintenance part finance snapshot:', error);
      return {
        userNotes: notes || null,
        financeSnapshot: null
      };
    }
  }

  buildPartNotes(userNotes, financeSnapshot = null) {
    const noteText = typeof userNotes === 'string' ? userNotes.trim() : '';
    if (!financeSnapshot) {
      return noteText || null;
    }

    const serializedSnapshot = JSON.stringify(financeSnapshot);
    if (!noteText) {
      return `[finance_snapshot]${serializedSnapshot}`;
    }

    return `${noteText}\n[finance_snapshot]${serializedSnapshot}`;
  }

  normalizePart(part, inventoryItem = null) {
    const quantity = parseFloat(part.quantity || 0) || 0;
    const parsedNotes = this.parseNotesMetadata(part.notes);
    const unitCost = inventoryItem
      ? (parseFloat(inventoryItem.cost_mad || 0) || 0)
      : (parseFloat(part.unit_cost_mad || 0) || 0);
    const explicitLineSellTotal =
      parseFloat(
        part.total_sell_mad ||
        part.line_sell_total_mad ||
        parsedNotes.financeSnapshot?.line_sell_total_mad ||
        0
      ) || 0;
    const explicitUnitPrice =
      parseFloat(
        part.unit_price_mad ||
        part.unit_sell_mad ||
        part.sell_price_mad ||
        parsedNotes.financeSnapshot?.unit_price_mad ||
        0
      ) || 0;
    const lineDerivedUnitPrice =
      quantity > 0 && explicitLineSellTotal > 0
        ? (explicitLineSellTotal / quantity)
        : 0;
    const unitPrice = inventoryItem
      ? (
          parseFloat(inventoryItem.price_mad || 0) ||
          explicitUnitPrice ||
          lineDerivedUnitPrice ||
          unitCost
        )
      : (
          explicitUnitPrice ||
          lineDerivedUnitPrice ||
          unitCost
        );
    const financeSnapshot = {
      unit_price_mad: unitPrice,
      line_cost_total_mad: quantity * unitCost,
      line_sell_total_mad: quantity * unitPrice,
      price_source: inventoryItem ? 'inventory_snapshot' : 'manual_entry',
      captured_at: new Date().toISOString()
    };

    return {
      source_type: part.source_type || (part.item_id ? 'inventory' : 'manual'),
      item_id: part.item_id ? parseInt(part.item_id, 10) : null,
      quantity,
      unit_cost_mad: unitCost,
      unit_price_mad: unitPrice,
      part_name: part.part_name || part.item_name || inventoryItem?.name || 'Manual Part',
      part_number: part.part_number || inventoryItem?.sku || null,
      notes: this.buildPartNotes(parsedNotes.userNotes, financeSnapshot),
      user_notes: parsedNotes.userNotes,
      total_cost_mad: quantity * unitCost,
      total_sell_mad: quantity * unitPrice
    };
  }

  /**
   * Create maintenance parts records and update inventory
   * @param {string} maintenanceId - UUID of maintenance record
   * @param {Array} partsUsed - Array of parts with item_id and quantity
   * @returns {Object} Result with parts created and inventory updates
   */
  async createMaintenanceParts(maintenanceId, partsUsed, options = {}) {
    console.log('🔧 Creating maintenance parts:', { maintenanceId, partsUsed });
    
    if (!partsUsed || partsUsed.length === 0) {
      return { parts: [], totalPartsCost: 0, inventoryUpdates: [] };
    }

    const { deductInventory = true, actorName = 'Maintenance' } = options;
    const organizationId = await requireCurrentOrganizationId();

    try {
      const inventoryUpdates = [];
      const partsToCreate = [];
      let totalPartsCost = 0;

      for (const part of partsUsed) {
        const quantity = parseFloat(part.quantity || 0) || 0;
        if (quantity <= 0) {
          throw new Error(`Invalid part quantity: ${quantity}`);
        }

        if (part.item_id) {
          const inventoryItem = await InventoryService.getItemById(part.item_id);
          if (!inventoryItem) {
            throw new Error(`Inventory item not found: ${part.item_id}`);
          }

          const currentStock = parseFloat(inventoryItem.stock_on_hand || 0) || 0;
          if (deductInventory && currentStock < quantity) {
            throw new Error(
              `Insufficient stock for ${inventoryItem.name}: requested ${quantity}, available ${currentStock}`
            );
          }

          const normalizedPart = this.normalizePart(part, inventoryItem);
          partsToCreate.push({
            maintenance_id: maintenanceId,
            item_id: normalizedPart.item_id,
            quantity: normalizedPart.quantity,
            unit_cost_mad: normalizedPart.unit_cost_mad,
            notes: normalizedPart.notes,
            part_name: normalizedPart.part_name,
            part_number: normalizedPart.part_number
          });

          if (deductInventory) {
            inventoryUpdates.push({
              item_id: normalizedPart.item_id,
              item_name: inventoryItem.name,
              current_stock: currentStock,
              quantity_used: normalizedPart.quantity,
              new_stock: currentStock - normalizedPart.quantity,
              unit_cost: normalizedPart.unit_cost_mad,
              total_cost: normalizedPart.total_cost_mad
            });
          }

          totalPartsCost += normalizedPart.total_sell_mad;
        } else {
          const normalizedPart = this.normalizePart(part);
          partsToCreate.push({
            maintenance_id: maintenanceId,
            item_id: null,
            quantity: normalizedPart.quantity,
            unit_cost_mad: normalizedPart.unit_cost_mad,
            notes: normalizedPart.notes,
            part_name: normalizedPart.part_name,
            part_number: normalizedPart.part_number
          });
          totalPartsCost += normalizedPart.total_sell_mad;
        }
      }

      console.log('📊 Parts validation completed:', {
        totalParts: partsToCreate.length,
        totalPartsCost,
        inventoryUpdates: inventoryUpdates.length
      });

      const createdParts = [];
      for (const partData of partsToCreate) {
        const { data: createdPart, error: partError } = await supabase
          .from(this.partsTable)
          .insert(applyOrganizationMatch(partData, organizationId))
          .select(`
            *,
            inventory_item:saharax_0u4w4d_inventory_items(id, name, sku, unit)
          `)
          .single();

        if (partError) {
          console.error('❌ Error creating maintenance part:', partError);
          throw new Error(`Failed to create maintenance part: ${partError.message}`);
        }

        createdParts.push(createdPart);
      }

      const stockUpdateResults = [];
      for (const update of inventoryUpdates) {
        const movementResult = await InventoryService.createMovement({
          item_id: update.item_id,
          quantity: update.quantity_used,
          unit_cost: update.unit_cost,
          movement_type: 'out',
          reference_type: 'maintenance',
          reference_id: maintenanceId,
          maintenance_id: maintenanceId,
          notes: `Used in maintenance ${maintenanceId}`,
          created_by: actorName
        });

        stockUpdateResults.push({
          ...update,
          movement: movementResult.movement,
          updated_item: movementResult.updatedItem
        });
      }

      console.log('✅ Maintenance parts created successfully:', {
        partsCreated: createdParts.length,
        totalPartsCost,
        stockUpdates: stockUpdateResults.length
      });

      return {
        parts: createdParts,
        totalPartsCost,
        inventoryUpdates: stockUpdateResults
      };

    } catch (error) {
      console.error('❌ Error in createMaintenanceParts:', error);
      throw error;
    }
  }

  /**
   * Update maintenance parts (for edit operations)
   * @param {string} maintenanceId - UUID of maintenance record
   * @param {Array} newPartsUsed - New parts array
   * @param {Array} existingParts - Current parts from database
   * @returns {Object} Result with updated parts and costs
   */
  async updateMaintenanceParts(maintenanceId, newPartsUsed, existingParts = [], options = {}) {
    console.log('🔄 Updating maintenance parts:', { maintenanceId, newPartsUsed, existingParts });

    try {
      if (!existingParts || existingParts.length === 0) {
        existingParts = await this.getMaintenanceParts(maintenanceId);
      }
      const { restoreInventory = true, deductInventory = true, actorName = 'Maintenance' } = options;
      const deleteResult = await this.deleteMaintenanceParts(maintenanceId, { restoreInventory, actorName });
      const createResult = await this.createMaintenanceParts(maintenanceId, newPartsUsed, { deductInventory, actorName });

      return {
        added: createResult.parts,
        updated: [],
        removed: deleteResult.deletedParts,
        inventoryUpdates: [...deleteResult.restoredItems, ...createResult.inventoryUpdates],
        totalPartsCost: createResult.totalPartsCost
      };

    } catch (error) {
      console.error('❌ Error in updateMaintenanceParts:', error);
      throw error;
    }
  }

  /**
   * Delete all maintenance parts and restore inventory
   * @param {string} maintenanceId - UUID of maintenance record
   * @returns {Object} Result with restored inventory
   */
  async deleteMaintenanceParts(maintenanceId, options = {}) {
    console.log('🗑️ Deleting maintenance parts:', maintenanceId);

    try {
      const organizationId = await requireCurrentOrganizationId();
      const parts = await this.getMaintenanceParts(maintenanceId);
      const { restoreInventory = true, actorName = 'Maintenance' } = options;
      
      if (parts.length === 0) {
        return { restoredItems: [], deletedParts: [] };
      }

      const restoredItems = [];

      for (const part of parts) {
        const { item_id, quantity } = part;
        if (!item_id || !restoreInventory) {
          continue;
        }
        
        const inventoryItem = await InventoryService.getItemById(item_id);
        if (inventoryItem) {
          const movementResult = await InventoryService.createMovement({
            item_id,
            quantity: Math.abs(quantity),
            unit_cost: part.unit_cost_mad,
            movement_type: 'in',
            reference_type: 'maintenance_restore',
            reference_id: maintenanceId,
            maintenance_id: maintenanceId,
            notes: `Restored from maintenance ${maintenanceId}`,
            created_by: actorName
          });

          restoredItems.push({
            item_id,
            item_name: inventoryItem.name,
            quantity_restored: quantity,
            old_stock: movementResult.previousStock,
            new_stock: movementResult.newStock,
            updated_item: movementResult.updatedItem
          });
        }
      }

      const { error: deleteError } = await supabase
        .from(this.partsTable)
        .delete()
        .eq('maintenance_id', maintenanceId)
        .eq('organization_id', organizationId);

      if (deleteError) {
        throw new Error(`Failed to delete maintenance parts: ${deleteError.message}`);
      }

      console.log('✅ Maintenance parts deletion completed:', {
        partsCount: parts.length,
        restoredItems: restoredItems.length
      });

      return { restoredItems, deletedParts: parts };

    } catch (error) {
      console.error('❌ Error in deleteMaintenanceParts:', error);
      throw error;
    }
  }

  /**
   * Get maintenance parts with inventory details
   * @param {string} maintenanceId - UUID of maintenance record
   * @returns {Array} Parts with inventory information
   */
  async getMaintenanceParts(maintenanceId) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      const { data: parts, error } = await applyOrganizationScope(
        supabase
          .from(this.partsTable)
          .select(`
            *,
            inventory_item:saharax_0u4w4d_inventory_items(
              id, name, sku, unit, cost_mad, price_mad, stock_on_hand
            )
          `)
          .eq('maintenance_id', maintenanceId)
          .order('created_at', { ascending: true }),
        organizationId
      );

      if (error) {
        console.error('❌ Error getting maintenance parts:', error);
        throw error;
      }

      return (parts || []).map((part) => {
        const parsedNotes = this.parseNotesMetadata(part.notes);
        const unitPrice =
          parseFloat(parsedNotes.financeSnapshot?.unit_price_mad || 0) ||
          parseFloat(part.inventory_item?.price_mad || 0) ||
          parseFloat(part.unit_cost_mad || 0) ||
          0;
        const quantity = parseFloat(part.quantity || 0) || 0;

        return {
          ...part,
          source_type: part.item_id ? 'inventory' : 'manual',
          unit: part.inventory_item?.unit || 'units',
          item_name: part.inventory_item?.name || part.part_name || 'Manual Part',
          notes: parsedNotes.userNotes,
          finance_snapshot: parsedNotes.financeSnapshot,
          unit_price_mad: unitPrice,
          total_cost_mad: quantity * (parseFloat(part.unit_cost_mad || 0) || 0),
          total_sell_mad: quantity * unitPrice
        };
      });
    } catch (error) {
      console.error('❌ Error in getMaintenanceParts:', error);
      throw error;
    }
  }

  /**
   * Calculate total parts cost for a maintenance record
   * @param {string} maintenanceId - UUID of maintenance record
   * @returns {number} Total parts cost
   */
  async calculateMaintenancePartsCost(maintenanceId) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      const { data, error } = await applyOrganizationScope(
        supabase
          .from(this.partsTable)
          .select(`
            quantity,
            unit_cost_mad,
            notes,
            inventory_item:saharax_0u4w4d_inventory_items(price_mad)
          `)
          .eq('maintenance_id', maintenanceId),
        organizationId
      );

      if (error) {
        console.error('❌ Error calculating parts cost:', error);
        throw error;
      }

      const totalCost = (data || []).reduce((sum, part) => {
        const quantity = parseFloat(part.quantity || 0) || 0;
        const parsedNotes = this.parseNotesMetadata(part.notes);
        const unitPrice =
          parseFloat(parsedNotes.financeSnapshot?.unit_price_mad || 0) ||
          parseFloat(part.inventory_item?.price_mad || 0) ||
          parseFloat(part.unit_cost_mad || 0) ||
          0;
        return sum + (quantity * unitPrice);
      }, 0);
      return totalCost;
    } catch (error) {
      console.error('❌ Error in calculateMaintenancePartsCost:', error);
      return 0;
    }
  }

  // Private helper methods

  /**
   * Calculate differences between existing and new parts
   */
  calculatePartsDiff(existingParts, newPartsUsed) {
    const toAdd = [];
    const toUpdate = [];
    const toRemove = [...existingParts]; // Start with all existing parts

    for (const newPart of newPartsUsed) {
      const existingIndex = toRemove.findIndex(existing => 
        existing.item_id === parseInt(newPart.item_id)
      );

      if (existingIndex >= 0) {
        // Part exists, check if quantity changed
        const existing = toRemove[existingIndex];
        const newQuantity = parseFloat(newPart.quantity);
        
        if (existing.quantity !== newQuantity) {
          toUpdate.push({
            partId: existing.id,
            item_id: existing.item_id,
            oldQuantity: existing.quantity,
            newQuantity: newQuantity,
            notes: newPart.notes
          });
        }
        
        // Remove from toRemove since it's being kept/updated
        toRemove.splice(existingIndex, 1);
      } else {
        // New part to add
        toAdd.push(newPart);
      }
    }

    return { toAdd, toUpdate, toRemove };
  }

  /**
   * Remove a single maintenance part and restore inventory
   */
  async removeMaintenancePart(partId, itemId, quantity) {
    // Restore inventory
    const inventoryItem = await InventoryService.getItemById(itemId);
    if (inventoryItem) {
      const currentStock = inventoryItem.stock_on_hand || 0;
      const newStock = currentStock + quantity;

      await supabase
        .from(this.inventoryTable)
        .update({ 
          stock_on_hand: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId);
    }

    // Delete part record
    const { error } = await supabase
      .from(this.partsTable)
      .delete()
      .eq('id', partId);

    if (error) {
      throw new Error(`Failed to remove maintenance part: ${error.message}`);
    }
  }

  /**
   * Update a single maintenance part quantity
   */
  async updateSingleMaintenancePart(partId, itemId, oldQuantity, newQuantity) {
    const quantityDiff = newQuantity - oldQuantity;
    
    // Get inventory item for cost and stock update
    const inventoryItem = await InventoryService.getItemById(itemId);
    if (!inventoryItem) {
      throw new Error(`Inventory item not found: ${itemId}`);
    }

    const currentStock = inventoryItem.stock_on_hand || 0;
    
    // Check if we have enough stock for increase
    if (quantityDiff > 0 && currentStock < quantityDiff) {
      throw new Error(
        `Insufficient stock for ${inventoryItem.name}: ` +
        `need ${quantityDiff} more, available ${currentStock}`
      );
    }

    const newStock = currentStock - quantityDiff;
    const unitCost = inventoryItem.cost_mad || 0;

    // Update inventory stock
    await supabase
      .from(this.inventoryTable)
      .update({ 
        stock_on_hand: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId);

    // Update part record
    const { data: updatedPart, error } = await supabase
      .from(this.partsTable)
      .update({
        quantity: newQuantity,
        unit_cost_mad: unitCost, // Update cost snapshot
        updated_at: new Date().toISOString()
      })
      .eq('id', partId)
      .select(`
        *,
        inventory_item:saharax_0u4w4d_inventory_items(id, name, sku, unit)
      `)
      .single();

    if (error) {
      throw new Error(`Failed to update maintenance part: ${error.message}`);
    }

    return {
      part: updatedPart,
      inventoryUpdate: {
        item_id: itemId,
        item_name: inventoryItem.name,
        quantity_change: quantityDiff,
        old_stock: currentStock,
        new_stock: newStock
      },
      totalCost: newQuantity * unitCost
    };
  }
}

export default new MaintenancePartsService();
