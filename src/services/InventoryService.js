import { supabase } from '../utils/supabaseClient';
import { normalizeInventoryLabels } from '../config/maintenanceInventoryMapping';

class InventoryService {
  constructor() {
    this.itemsTable = 'saharax_0u4w4d_inventory_items';
    this.movementsTable = 'saharax_0u4w4d_inventory_movements';
    this.purchasesTable = 'saharax_0u4w4d_inventory_purchases';
    this.purchaseLinesTable = 'saharax_0u4w4d_inventory_purchase_lines';
    this.vehiclesTable = 'saharax_0u4w4d_vehicles';
    this.storageBucket = 'inventory-images';
  }

  normalizePurchaseRecord(purchase) {
    if (!purchase) return null;

    const purchaseLines = Array.isArray(purchase.purchase_lines)
      ? purchase.purchase_lines
      : Array.isArray(purchase.lines)
        ? purchase.lines
        : [];

    return {
      ...purchase,
      supplier: purchase.supplier || purchase.supplier_name || '',
      invoice_number: purchase.invoice_number || purchase.purchase_number || '',
      purchase_number: purchase.purchase_number || purchase.invoice_number || '',
      purchase_lines,
      lines: purchaseLines
    };
  }

  normalizePurchasePayload(purchaseData) {
    const lines = Array.isArray(purchaseData.lines) ? purchaseData.lines : [];
    const totalAmount = purchaseData.total_amount_mad !== undefined && purchaseData.total_amount_mad !== null
      ? parseFloat(purchaseData.total_amount_mad) || 0
      : lines.reduce((sum, line) => sum + ((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_cost_mad) || 0)), 0);

    return {
      supplier: purchaseData.supplier || purchaseData.supplier_name || '',
      purchase_number: purchaseData.purchase_number || purchaseData.invoice_number || '',
      purchase_date: purchaseData.purchase_date,
      total_amount_mad: totalAmount,
      notes: purchaseData.notes || '',
      status: purchaseData.status || 'received',
      expected_delivery_date: purchaseData.expected_delivery_date || null,
      actual_delivery_date: purchaseData.actual_delivery_date || null,
      lines: lines.map((line) => ({
        item_id: parseInt(line.item_id, 10),
        quantity: parseFloat(line.quantity) || 0,
        received_quantity: parseFloat(line.received_quantity ?? line.quantity) || 0,
        unit_cost_mad: parseFloat(line.unit_cost_mad) || 0,
        total_cost_mad: parseFloat(line.total_cost_mad) || ((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_cost_mad) || 0))
      }))
    };
  }

  aggregatePurchaseLineQuantities(lines = []) {
    return (Array.isArray(lines) ? lines : []).reduce((acc, line) => {
      const itemId = parseInt(line.item_id, 10);
      const quantity = parseFloat(line.received_quantity ?? line.quantity) || 0;

      if (!itemId || quantity === 0) return acc;
      acc[itemId] = (acc[itemId] || 0) + quantity;
      return acc;
    }, {});
  }

  async assertStockCanSupportPurchaseDelta(itemDeltas, contextLabel) {
    for (const [itemIdString, delta] of Object.entries(itemDeltas)) {
      const itemId = parseInt(itemIdString, 10);
      if (!itemId || delta >= 0) continue;

      const item = await this.getItemById(itemId);
      const currentStock = parseFloat(item?.stock_on_hand || 0) || 0;
      const projectedStock = currentStock + delta;

      if (projectedStock < 0) {
        throw new Error(
          `Cannot ${contextLabel} because ${item?.name || `item ${itemId}`} has only ${currentStock} in stock and ${Math.abs(delta)} would need to be removed.`
        );
      }
    }
  }

  sanitizeItemData(itemData) {
    const sanitized = { ...itemData };
    const numericFields = [
      'stock_on_hand', 
      'reorder_level', 
      'max_stock_level', 
      'price_mad',
      'cost_mad'
    ];
    
    numericFields.forEach(field => {
      if (sanitized[field] === '' || sanitized[field] === null || sanitized[field] === undefined) {
        sanitized[field] = null;
      } else if (typeof sanitized[field] === 'string') {
        const numValue = parseFloat(sanitized[field]);
        sanitized[field] = isNaN(numValue) ? null : numValue;
      }
    });

    sanitized.labels = normalizeInventoryLabels(sanitized.labels || []);
    
    // Remove imageFile from sanitized data as it's not a database field
    delete sanitized.imageFile;
    delete sanitized.imagePreview;
    
    console.log('🔍 SANITIZED ITEM DATA:', sanitized);
    return sanitized;
  }

  formatStorageDocumentType(type = 'document') {
    const normalized = String(type || 'document').toLowerCase();
    if (normalized.includes('invoice')) return 'invoice';
    if (normalized.includes('image')) return 'image';
    return 'document';
  }

  async getItemOperationalStock(itemId) {
    try {
      const item = await this.getItemById(itemId);
      const currentStock = parseFloat(item?.stock_on_hand || 0) || 0;
      const usage = await this.getItemMaintenanceUsage(itemId);

      return {
        item,
        currentStock,
        reservedQuantity: usage.reservedQuantity,
        consumedQuantity: usage.consumedQuantity,
        availableStock: Math.max(0, currentStock - usage.reservedQuantity),
        reservedLines: usage.reservedLines,
        consumedLines: usage.consumedLines
      };
    } catch (error) {
      console.error('Error getting item operational stock:', error);
      return {
        item: null,
        currentStock: 0,
        reservedQuantity: 0,
        consumedQuantity: 0,
        availableStock: 0,
        reservedLines: [],
        consumedLines: []
      };
    }
  }

  async getItemMaintenanceUsage(itemId) {
    const usageByItem = await this.getMaintenanceUsageByItemIds([itemId]);
    return usageByItem[itemId] || {
      reservedQuantity: 0,
      consumedQuantity: 0,
      reservedLines: [],
      consumedLines: []
    };
  }

  async getMaintenanceUsageByItemIds(itemIds = []) {
    try {
      const safeItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : []).map((id) => parseInt(id, 10)).filter(Boolean))];
      if (safeItemIds.length === 0) return {};

      const { data: parts, error: partsError } = await supabase
        .from('app_687f658e98_maintenance_parts')
        .select('id, item_id, quantity, part_name, part_number, maintenance_id')
        .in('item_id', safeItemIds);

      if (partsError) throw partsError;
      const safeParts = Array.isArray(parts) ? parts : [];
      const maintenanceIds = [...new Set(safeParts.map((part) => part.maintenance_id).filter(Boolean))];

      let maintenanceById = {};
      if (maintenanceIds.length > 0) {
        const { data: maintenanceRows, error: maintenanceError } = await supabase
          .from('app_687f658e98_maintenance')
          .select('id, maintenance_type, status, scheduled_date, service_date, completed_date, vehicle_id')
          .in('id', maintenanceIds);

        if (maintenanceError) throw maintenanceError;
        maintenanceById = (maintenanceRows || []).reduce((acc, row) => {
          acc[row.id] = row;
          return acc;
        }, {});
      }

      const vehicleIds = [
        ...new Set(
          Object.values(maintenanceById)
            .map((maintenance) => maintenance?.vehicle_id)
            .filter(Boolean)
        )
      ];

      let vehiclesById = {};
      if (vehicleIds.length > 0) {
        const { data: vehicleRows, error: vehicleError } = await supabase
          .from(this.vehiclesTable)
          .select('id, plate_number, name, model')
          .in('id', vehicleIds);

        if (vehicleError) throw vehicleError;
        vehiclesById = (vehicleRows || []).reduce((acc, row) => {
          acc[row.id] = row;
          return acc;
        }, {});
      }

      const reservedStatuses = new Set(['scheduled', 'pending', 'in_progress', 'in-progress']);
      const consumedStatuses = new Set(['completed', 'done']);
      const usageByItemId = safeItemIds.reduce((acc, itemId) => {
        acc[itemId] = {
          reservedQuantity: 0,
          consumedQuantity: 0,
          reservedLines: [],
          consumedLines: []
        };
        return acc;
      }, {});

      safeParts.forEach((part) => {
        const itemId = parseInt(part.item_id, 10);
        if (!usageByItemId[itemId]) return;

        const maintenance = maintenanceById[part.maintenance_id] || {};
        const status = String(maintenance.status || '').toLowerCase();
        const quantity = parseFloat(part.quantity || 0) || 0;
        const line = {
          ...part,
          quantity,
          maintenance: {
            ...maintenance,
            vehicle: vehiclesById[maintenance.vehicle_id] || null
          }
        };

        if (consumedStatuses.has(status)) {
          usageByItemId[itemId].consumedLines.push(line);
          usageByItemId[itemId].consumedQuantity += quantity;
        } else if (reservedStatuses.has(status)) {
          usageByItemId[itemId].reservedLines.push(line);
          usageByItemId[itemId].reservedQuantity += quantity;
        }
      });

      return usageByItemId;
    } catch (error) {
      console.error('Error getting item maintenance usage:', error);
      return {};
    }
  }

  async enrichItemsWithOperationalStock(items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    const usageByItemId = await this.getMaintenanceUsageByItemIds(safeItems.map((item) => item.id));

    return safeItems.map((item) => {
      const usage = usageByItemId[item.id] || {
        reservedQuantity: 0,
        consumedQuantity: 0,
        reservedLines: [],
        consumedLines: []
      };
      const currentStock = parseFloat(item.stock_on_hand || 0) || 0;
      const reservedQuantity = usage.reservedQuantity || 0;

      return {
        ...item,
        current_stock: currentStock,
        reserved_quantity: reservedQuantity,
        consumed_quantity: usage.consumedQuantity || 0,
        available_stock: Math.max(0, currentStock - reservedQuantity),
        reserved_maintenance_lines: usage.reservedLines || [],
        consumed_maintenance_lines: usage.consumedLines || []
      };
    });
  }

  async getItemDocuments(itemId) {
    try {
      if (!itemId) return [];
      const folderPath = `inventory-items/${itemId}/documents`;
      const { data: files, error } = await supabase.storage
        .from(this.storageBucket)
        .list(folderPath, { limit: 100, offset: 0 });

      if (error) throw error;

      return (files || [])
        .filter((file) => file?.name && !file.name.endsWith('/'))
        .map((file) => {
          const storagePath = `${folderPath}/${file.name}`;
          const { data: urlData } = supabase.storage
            .from(this.storageBucket)
            .getPublicUrl(storagePath);
          const originalName = String(file.name || '').replace(/^[a-z-]+__\d+_[a-z0-9]+_/i, '');
          const typeKey = String(file.name || '').split('__')[0] || 'document';
          const extension = originalName.split('.').pop()?.toLowerCase() || '';
          const mimeType = file.metadata?.mimetype
            || (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) ? `image/${extension === 'jpg' ? 'jpeg' : extension}` : extension === 'pdf' ? 'application/pdf' : 'application/octet-stream');

          return {
            id: storagePath,
            name: originalName,
            type: mimeType,
            typeKey,
            size: file.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath,
            uploadedAt: file.created_at || file.updated_at || null
          };
        });
    } catch (error) {
      console.error('Error getting inventory item documents:', error);
      return [];
    }
  }

  async uploadItemDocument(file, itemId, documentType = 'document') {
    if (!file) throw new Error('File is required');
    if (!itemId) throw new Error('Inventory item ID is required');

    const safeType = this.formatStorageDocumentType(documentType);
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const storagePath = `inventory-items/${itemId}/documents/${safeType}__${fileId}_${safeFileName}`;

    const { error } = await supabase.storage
      .from(this.storageBucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;
    return this.getItemDocuments(itemId);
  }

  /**
   * Upload item image to Supabase Storage
   * @param {File} file - Image file to upload
   * @param {string} itemId - Item ID for organizing storage
   * @returns {Promise<string>} - Public URL of uploaded image
   */
  async uploadItemImage(file, itemId = null) {
    try {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.');
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('File size exceeds 5MB limit.');
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const fileName = itemId 
        ? `item_${itemId}_${timestamp}.${fileExt}`
        : `temp_${timestamp}_${randomStr}.${fileExt}`;
      const filePath = `inventory-items/${fileName}`;

      console.log('📤 Uploading image:', filePath);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.storageBucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(this.storageBucket)
        .getPublicUrl(filePath);

      console.log('✅ Image uploaded successfully:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      throw error;
    }
  }

  /**
   * Delete item image from Supabase Storage
   * @param {string} imageUrl - Full URL of the image to delete
   * @returns {Promise<boolean>}
   */
  async deleteItemImage(imageUrl) {
    try {
      if (!imageUrl) return true;

      // Extract file path from URL
      const bucketName = this.storageBucket;
      const urlParts = imageUrl.split(`/${bucketName}/`);
      
      if (urlParts.length < 2) {
        console.warn('Invalid image URL format:', imageUrl);
        return false;
      }

      const filePath = urlParts[1];
      console.log('🗑️ Deleting image:', filePath);

      // Delete from Supabase Storage
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);

      if (error) {
        console.error('Error deleting image:', error);
        throw error;
      }

      console.log('✅ Image deleted successfully');
      return true;
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      return false;
    }
  }

  async getItems(filters = {}) {
    try {
      let query = supabase
        .from(this.itemsTable)
        .select('*')
        .order('name', { ascending: true });

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.active !== undefined) query = query.eq('active', filters.active);
      if (filters.searchTerm) query = query.or(`name.ilike.%${filters.searchTerm}%,sku.ilike.%${filters.searchTerm}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting items:', error);
      return [];
    }
  }

  async getItemById(id) {
    try {
      const { data: item, error } = await supabase
        .from(this.itemsTable)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return item;
    } catch (error) {
      console.error('Error getting item:', error);
      throw error;
    }
  }

  async getItem(id) { return this.getItemById(id); }
  async getInventoryItems(filters = {}) { return this.getItems(filters); }
  async getInventoryItemById(id) { return this.getItemById(id); }

  async createMovement(movementData) {
    try {
      console.log('🔍 INVENTORY: Creating movement:', movementData);
      const { item_id, quantity, movement_type, reference_type, reference_id, notes, unit_cost, maintenance_id, created_by } = movementData;
      const normalizedReferenceId = Number.isInteger(Number(reference_id))
        ? parseInt(reference_id, 10)
        : null;
      const normalizedMaintenanceId = Number.isInteger(Number(maintenance_id))
        ? parseInt(maintenance_id, 10)
        : null;
      
      const currentItem = await this.getItemById(item_id);
      if (!currentItem) throw new Error(`Item with ID ${item_id} not found`);
      
      const movementQuantity = parseFloat(quantity) || 0;
      const currentStock = parseFloat(currentItem.stock_on_hand || 0) || 0;
      console.log(`🔍 STOCK: Current stock for item ${item_id}: ${currentStock}`);
      
      let newStock;
      if (movement_type === 'in' || movement_type === 'adjustment_in') {
        newStock = currentStock + movementQuantity;
      } else if (movement_type === 'out' || movement_type === 'adjustment_out') {
        newStock = currentStock - movementQuantity;
        if (newStock < 0) console.warn(`⚠️ WARNING: Stock will go negative for item ${item_id}: ${newStock}`);
      } else {
        throw new Error(`Invalid movement type: ${movement_type}`);
      }
      
      const itemUnitCost = parseFloat(unit_cost ?? currentItem.cost_mad ?? 0) || 0;
      const totalCost = movementQuantity * itemUnitCost;
      
      const { data: movement, error: movementError } = await supabase
        .from(this.movementsTable)
        .insert({
          item_id: parseInt(item_id),
          quantity: movementQuantity,
          unit_cost_mad: itemUnitCost,
          total_cost_mad: totalCost,
          movement_type: movement_type,
          reference_type: reference_type || null,
          reference_id: normalizedReferenceId,
          maintenance_id: normalizedMaintenanceId,
          notes: notes || '',
          created_by: created_by || 'System',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (movementError) throw movementError;
      console.log('✅ Movement record created:', movement);
      
      const { data: updatedItem, error: updateError } = await supabase
        .from(this.itemsTable)
        .update({
          stock_on_hand: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', item_id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      console.log(`✅ STOCK UPDATED: Item ${item_id} stock changed from ${currentStock} to ${newStock}`);
      
      return { movement, updatedItem, previousStock: currentStock, newStock: newStock };
    } catch (error) {
      console.error('❌ CRITICAL ERROR in createMovement:', error);
      throw error;
    }
  }

  async getMovementsByItem(itemId) {
    try {
      const { data, error } = await supabase
        .from(this.movementsTable)
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting movements:', error);
      return [];
    }
  }

  async getStockMovements(filters = {}) {
    try {
      let query = supabase
        .from(this.movementsTable)
        .select(`*, item:${this.itemsTable}(id, name, sku, unit, cost_mad, price_mad)`)
        .order('created_at', { ascending: false });

      if (filters.itemId) query = query.eq('item_id', filters.itemId);
      if (filters.movementType) query = query.eq('movement_type', filters.movementType);
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting stock movements:', error);
      return [];
    }
  }

  async createStockMovement(movementData) {
    return this.createMovement(movementData);
  }

  async createItem(itemData) {
    try {
      const sanitizedData = this.sanitizeItemData(itemData);
      
      // Handle image upload if provided
      let imageUrl = null;
      let imageUploadedAt = null;
      
      if (itemData.imageFile) {
        try {
          imageUrl = await this.uploadItemImage(itemData.imageFile);
          imageUploadedAt = new Date().toISOString();
          console.log('✅ Image uploaded for new item:', imageUrl);
        } catch (uploadError) {
          console.error('⚠️ Image upload failed, continuing without image:', uploadError);
          // Continue creating item without image
        }
      }

      const { data, error } = await supabase
        .from(this.itemsTable)
        .insert({ 
          ...sanitizedData, 
          image_url: imageUrl,
          image_uploaded_at: imageUploadedAt,
          created_at: new Date().toISOString(), 
          updated_at: new Date().toISOString() 
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating item:', error);
      throw error;
    }
  }

  async updateItem(id, itemData) {
    try {
      const sanitizedData = this.sanitizeItemData(itemData);
      
      // Get current item to check for existing image
      const currentItem = await this.getItemById(id);
      
      let imageUrl = currentItem?.image_url || null;
      let imageUploadedAt = currentItem?.image_uploaded_at || null;
      
      // Handle image upload if new file provided
      if (itemData.imageFile) {
        try {
          // Delete old image if exists
          if (currentItem?.image_url) {
            await this.deleteItemImage(currentItem.image_url);
          }
          
          // Upload new image
          imageUrl = await this.uploadItemImage(itemData.imageFile, id);
          imageUploadedAt = new Date().toISOString();
          console.log('✅ Image updated for item:', imageUrl);
        } catch (uploadError) {
          console.error('⚠️ Image upload failed:', uploadError);
          // Keep existing image if upload fails
        }
      }

      const { data, error } = await supabase
        .from(this.itemsTable)
        .update({ 
          ...sanitizedData,
          image_url: imageUrl,
          image_uploaded_at: imageUploadedAt,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  }

  async createOrUpdateItem(itemData) {
    return itemData.id ? this.updateItem(itemData.id, itemData) : this.createItem(itemData);
  }

  async deleteItem(id) {
    try {
      // Get item to delete its image
      const item = await this.getItemById(id);
      
      // Delete the item from database
      const { error } = await supabase.from(this.itemsTable).delete().eq('id', id);
      if (error) throw error;

      // Delete associated image if exists
      if (item?.image_url) {
        await this.deleteItemImage(item.image_url);
      }

      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  }

  async getCategories() {
    try {
      const { data, error } = await supabase.from(this.itemsTable).select('category').not('category', 'is', null);
      if (error) throw error;
      const categories = [...new Set(data.map(item => item.category))].filter(Boolean);
      if (!categories.includes('transmission')) {
        categories.push('transmission');
      }
      return categories.sort((a, b) => String(a).localeCompare(String(b)));
    } catch (error) {
      console.error('Error getting categories:', error);
      return ['transmission'];
    }
  }

  async getAllCategories() { return this.getCategories(); }

  async adjustStock(itemId, qty, reason, unitCost = 0) {
    try {
      const movementType = qty > 0 ? 'in' : 'out';
      return await this.createMovement({
        item_id: itemId,
        quantity: Math.abs(qty),
        unit_cost: unitCost,
        movement_type: movementType,
        notes: reason || `Stock adjustment`
      });
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  }

  async getLowStockItems() {
    try {
      const { data, error } = await supabase
        .from(this.itemsTable)
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []).filter(item => (item.stock_on_hand || 0) < (item.reorder_level || 0) && (item.reorder_level || 0) > 0);
    } catch (error) {
      console.error('Error getting low stock items:', error);
      return [];
    }
  }

  // FIXED: A comprehensive dashboard data fetcher
  async getDashboardStats(filters = {}) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch all data in parallel
        const [
            items,
            lowStockItems,
            recentMovements,
            recentPurchases
        ] = await Promise.all([
            this.getItems({ active: true, ...filters }),
            this.getLowStockItems(),
            this.getStockMovements({ dateFrom: thirtyDaysAgo }),
            this.getPurchases({ dateFrom: thirtyDaysAgo })
        ]);

        const stats = {
            totalItems: items.length,
            lowStockCount: lowStockItems.length,
            lowStockItems: lowStockItems.slice(0, 5), // Return top 5 for the dashboard widget
            recentMovements: recentMovements || [],
            recentPurchases: recentPurchases || [],
            outOfStockCount: items.filter(item => (item.stock_on_hand || 0) === 0).length,
            totalValue: items.reduce((sum, item) => {
                const stock = item.stock_on_hand || 0;
                const cost = item.cost_mad || 0;
                return sum + (stock * cost);
            }, 0)
        };

        return stats;
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalItems: 0,
            lowStockCount: 0,
            lowStockItems: [],
            recentMovements: [],
            recentPurchases: [],
            outOfStockCount: 0,
            totalValue: 0
        };
    }
  }

  async getDashboardData(filters = {}) { return this.getDashboardStats(filters); }

  async consumePartsForMaintenance(partsUsed, maintenanceId) {
    try {
      console.log('🔧 CONSUMING PARTS FOR MAINTENANCE:', maintenanceId, partsUsed);
      const results = [];
      for (const part of partsUsed) {
        const { item_id, quantity, notes, unit_cost_mad, performed_by_name } = part;
        if (!item_id) continue;
        const result = await this.createMovement({
          item_id: item_id,
          quantity: Math.abs(quantity),
          unit_cost: unit_cost_mad,
          movement_type: 'out',
          reference_type: 'maintenance',
          reference_id: maintenanceId,
          maintenance_id: maintenanceId,
          notes: notes || `Used in maintenance #${maintenanceId}`,
          created_by: performed_by_name || 'Maintenance'
        });
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error('❌ ERROR consuming parts for maintenance:', error);
      throw error;
    }
  }

  async getPurchases(filters = {}) {
    try {
      let query = supabase
        .from(this.purchasesTable)
        .select(`*, purchase_lines:${this.purchaseLinesTable}(*, item:${this.itemsTable}(id, name, sku))`)
        .order('purchase_date', { ascending: false });

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.supplier) query = query.ilike('supplier', `%${filters.supplier}%`);
      if (filters.invoice_number) query = query.ilike('purchase_number', `%${filters.invoice_number}%`);
      if (filters.dateFrom || filters.date_from) query = query.gte('purchase_date', filters.dateFrom || filters.date_from);
      if (filters.dateTo || filters.date_to) query = query.lte('purchase_date', filters.dateTo || filters.date_to);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((purchase) => this.normalizePurchaseRecord(purchase));
    } catch (error) {
      console.error('Error getting purchases:', error);
      return [];
    }
  }

  async getPurchaseById(id) {
    const { data, error } = await supabase
      .from(this.purchasesTable)
      .select(`*, purchase_lines:${this.purchaseLinesTable}(*, item:${this.itemsTable}(id, name, sku))`)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error getting purchase by id:', error);
      throw error;
    }

    return this.normalizePurchaseRecord(data);
  }

  async createPurchase(purchaseData) {
    try {
      const payload = this.normalizePurchasePayload(purchaseData);

      const { data: purchase, error: purchaseError } = await supabase
        .from(this.purchasesTable)
        .insert({
          supplier: payload.supplier,
          purchase_number: payload.purchase_number,
          purchase_date: payload.purchase_date,
          total_amount_mad: payload.total_amount_mad,
          notes: payload.notes,
          status: payload.status,
          expected_delivery_date: payload.expected_delivery_date,
          actual_delivery_date: payload.actual_delivery_date,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      const purchaseLines = [];
      for (const line of payload.lines) {
        const { data: createdLine, error: lineError } = await supabase
          .from(this.purchaseLinesTable)
          .insert({
            purchase_id: purchase.id,
            item_id: line.item_id,
            quantity: line.quantity,
            received_quantity: line.received_quantity,
            unit_cost_mad: line.unit_cost_mad,
            total_cost_mad: line.total_cost_mad,
            created_at: new Date().toISOString()
          })
          .select(`*, item:${this.itemsTable}(id, name, sku)`)
          .single();

        if (lineError) throw lineError;
        purchaseLines.push(createdLine);

        await this.createMovement({
          item_id: line.item_id,
          quantity: line.received_quantity,
          unit_cost: line.unit_cost_mad,
          movement_type: 'in',
          reference_type: 'purchase',
          reference_id: purchase.id,
          notes: `Purchase ${purchase.purchase_number || purchase.id}`,
          created_by: 'Purchase'
        });
      }

      return this.normalizePurchaseRecord({
        ...purchase,
        purchase_lines: purchaseLines
      });
    } catch (error) {
      console.error('Error creating purchase:', error);
      throw error;
    }
  }

  async updatePurchase(id, purchaseData) {
    try {
      const existingPurchase = await this.getPurchaseById(id);
      const payload = this.normalizePurchasePayload(purchaseData);
      const existingLines = Array.isArray(existingPurchase.purchase_lines) ? existingPurchase.purchase_lines : [];
      const existingQuantities = this.aggregatePurchaseLineQuantities(existingLines);
      const nextQuantities = this.aggregatePurchaseLineQuantities(payload.lines);
      const itemDeltas = {};

      new Set([...Object.keys(existingQuantities), ...Object.keys(nextQuantities)]).forEach((itemId) => {
        itemDeltas[itemId] = (nextQuantities[itemId] || 0) - (existingQuantities[itemId] || 0);
      });

      await this.assertStockCanSupportPurchaseDelta(itemDeltas, 'update this purchase');

      const { error: deleteLinesError } = await supabase
        .from(this.purchaseLinesTable)
        .delete()
        .eq('purchase_id', id);

      if (deleteLinesError) throw deleteLinesError;

      const { data: updatedPurchase, error: updateError } = await supabase
        .from(this.purchasesTable)
        .update({
          supplier: payload.supplier,
          purchase_number: payload.purchase_number,
          purchase_date: payload.purchase_date,
          total_amount_mad: payload.total_amount_mad,
          notes: payload.notes,
          status: payload.status,
          expected_delivery_date: payload.expected_delivery_date,
          actual_delivery_date: payload.actual_delivery_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      const purchaseLines = [];
      for (const line of payload.lines) {
        const { data: createdLine, error: lineError } = await supabase
          .from(this.purchaseLinesTable)
          .insert({
            purchase_id: id,
            item_id: line.item_id,
            quantity: line.quantity,
            received_quantity: line.received_quantity,
            unit_cost_mad: line.unit_cost_mad,
            total_cost_mad: line.total_cost_mad,
            created_at: new Date().toISOString()
          })
          .select(`*, item:${this.itemsTable}(id, name, sku)`)
          .single();

        if (lineError) throw lineError;
        purchaseLines.push(createdLine);
      }

      for (const [itemIdString, delta] of Object.entries(itemDeltas)) {
        if (!delta) continue;

        const itemId = parseInt(itemIdString, 10);
        const matchingLine = payload.lines.find((line) => parseInt(line.item_id, 10) === itemId)
          || existingLines.find((line) => parseInt(line.item_id, 10) === itemId);

        await this.createMovement({
          item_id: itemId,
          quantity: Math.abs(delta),
          unit_cost: matchingLine?.unit_cost_mad || 0,
          movement_type: delta > 0 ? 'in' : 'out',
          reference_type: 'purchase_update_adjustment',
          reference_id: id,
          notes: `Adjusted purchase ${payload.purchase_number || existingPurchase.purchase_number || id}`,
          created_by: 'Purchase'
        });
      }

      return this.normalizePurchaseRecord({
        ...updatedPurchase,
        purchase_lines: purchaseLines
      });
    } catch (error) {
      console.error('Error updating purchase:', error);
      throw error;
    }
  }

  async deletePurchase(id) {
    try {
      const existingPurchase = await this.getPurchaseById(id);
      const existingLines = Array.isArray(existingPurchase.purchase_lines) ? existingPurchase.purchase_lines : [];
      const deletionDeltas = Object.entries(this.aggregatePurchaseLineQuantities(existingLines)).reduce((acc, [itemId, quantity]) => {
        acc[itemId] = -quantity;
        return acc;
      }, {});

      await this.assertStockCanSupportPurchaseDelta(deletionDeltas, 'delete this purchase');

      for (const line of existingLines) {
        await this.createMovement({
          item_id: line.item_id,
          quantity: Math.abs(line.received_quantity || line.quantity || 0),
          unit_cost: line.unit_cost_mad,
          movement_type: 'out',
          reference_type: 'purchase_delete_reversal',
          reference_id: id,
          notes: `Deleting purchase ${existingPurchase.purchase_number || id}`,
          created_by: 'Purchase'
        });
      }

      const { error: deleteLinesError } = await supabase
        .from(this.purchaseLinesTable)
        .delete()
        .eq('purchase_id', id);

      if (deleteLinesError) throw deleteLinesError;

      const { error } = await supabase
        .from(this.purchasesTable)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting purchase:', error);
      throw error;
    }
  }

  async getAllItems() {
    return this.getItems();
  }

  async getVehicles() {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, plate_number, status, vehicle_type')
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting vehicles for inventory:', error);
      return [];
    }
  }

  async getMaintenanceRecords() {
    try {
      const { data, error } = await supabase
        .from('app_687f658e98_maintenance')
        .select('id, vehicle_id, maintenance_type, status, service_date, cost, parts_cost_mad, labor_rate_mad')
        .order('service_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting maintenance records for inventory:', error);
      return [];
    }
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MAD', minimumFractionDigits: 2 }).format(amount || 0);
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

export default new InventoryService();
