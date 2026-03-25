import { supabase } from '../utils/supabaseClient';
import InventoryService from './InventoryService';

class AlertsService {
  constructor() {
    this.itemsTable = 'saharax_0u4w4d_inventory_items';
    this.movementsTable = 'saharax_0u4w4d_inventory_movements';
  }

  // Get all inventory alerts
  async getInventoryAlerts() {
    try {
      console.log('🚨 Calculating inventory alerts...');
      
      // Get all active inventory items
      const items = await InventoryService.getItems({ active: true });
      console.log(`📦 Analyzing ${items.length} active items for alerts`);
      
      const alerts = {
        lowStock: [],
        outOfStock: [],
        overstock: [],
        inactive: [],
        highValue: [],
        summary: {
          total: 0,
          critical: 0,
          warning: 0,
          info: 0
        }
      };

      // Get stock movements for inactive item analysis
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      for (const item of items) {
        const stock = item.stock_on_hand || 0;
        const reorderLevel = item.reorder_level || 0;
        const maxStockLevel = item.max_stock_level || null;
        const costValue = stock * (item.cost_mad || 0);

        // 1. OUT OF STOCK ALERTS (Critical)
        if (stock === 0) {
          alerts.outOfStock.push({
            id: `out-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            sku: item.sku,
            stock: stock,
            reorderLevel: reorderLevel,
            priority: 'critical',
            type: 'out_of_stock',
            message: 'Item is completely out of stock',
            action: 'Create purchase order immediately',
            createdAt: new Date().toISOString()
          });
          alerts.summary.critical++;
        }
        // 2. LOW STOCK ALERTS (Warning)
        else if (reorderLevel > 0 && stock <= reorderLevel) {
          alerts.lowStock.push({
            id: `low-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            sku: item.sku,
            stock: stock,
            reorderLevel: reorderLevel,
            priority: 'warning',
            type: 'low_stock',
            message: `Stock level (${stock}) is at or below reorder point (${reorderLevel})`,
            action: 'Consider restocking soon',
            createdAt: new Date().toISOString()
          });
          alerts.summary.warning++;
        }

        // 3. OVERSTOCK ALERTS (Info)
        if (maxStockLevel && stock > maxStockLevel) {
          alerts.overstock.push({
            id: `over-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            sku: item.sku,
            stock: stock,
            maxStockLevel: maxStockLevel,
            priority: 'info',
            type: 'overstock',
            message: `Stock level (${stock}) exceeds maximum (${maxStockLevel})`,
            action: 'Consider reducing orders or using excess stock',
            createdAt: new Date().toISOString()
          });
          alerts.summary.info++;
        }

        // 4. HIGH VALUE ITEMS (Info) - Items with inventory value > 5000 MAD
        if (costValue > 5000) {
          alerts.highValue.push({
            id: `value-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            sku: item.sku,
            stock: stock,
            value: costValue,
            priority: 'info',
            type: 'high_value',
            message: `High inventory value: ${this.formatCurrency(costValue)}`,
            action: 'Monitor closely for optimization',
            createdAt: new Date().toISOString()
          });
          alerts.summary.info++;
        }
      }

      // 5. INACTIVE ITEMS - Get items with no movements in last 60 days
      try {
        const recentMovements = await InventoryService.getStockMovements({
          dateFrom: sixtyDaysAgo.toISOString()
        });
        
        const activeItemIds = new Set(recentMovements.map(m => m.item_id));
        
        const inactiveItems = items.filter(item => 
          !activeItemIds.has(item.id) && (item.stock_on_hand || 0) > 0
        );

        for (const item of inactiveItems) {
          alerts.inactive.push({
            id: `inactive-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            category: item.category,
            sku: item.sku,
            stock: item.stock_on_hand || 0,
            priority: 'info',
            type: 'inactive',
            message: 'No stock movements in last 60 days',
            action: 'Review if item is still needed',
            createdAt: new Date().toISOString()
          });
          alerts.summary.info++;
        }
      } catch (error) {
        console.error('Error analyzing inactive items:', error);
      }

      // Calculate total alerts
      alerts.summary.total = alerts.summary.critical + alerts.summary.warning + alerts.summary.info;

      console.log('✅ Inventory alerts calculated:', {
        outOfStock: alerts.outOfStock.length,
        lowStock: alerts.lowStock.length,
        overstock: alerts.overstock.length,
        inactive: alerts.inactive.length,
        highValue: alerts.highValue.length,
        total: alerts.summary.total
      });

      return alerts;
    } catch (error) {
      console.error('❌ Error calculating inventory alerts:', error);
      return {
        lowStock: [],
        outOfStock: [],
        overstock: [],
        inactive: [],
        highValue: [],
        summary: { total: 0, critical: 0, warning: 0, info: 0 }
      };
    }
  }

  // Get alerts for a specific item
  async getItemAlerts(itemId) {
    try {
      const allAlerts = await this.getInventoryAlerts();
      const itemAlerts = [];

      // Check all alert types for this item
      Object.values(allAlerts).forEach(alertGroup => {
        if (Array.isArray(alertGroup)) {
          const itemAlert = alertGroup.find(alert => alert.itemId === itemId);
          if (itemAlert) {
            itemAlerts.push(itemAlert);
          }
        }
      });

      return itemAlerts;
    } catch (error) {
      console.error('Error getting item alerts:', error);
      return [];
    }
  }

  // Get alert summary for dashboard
  async getAlertSummary() {
    try {
      const alerts = await this.getInventoryAlerts();
      return alerts.summary;
    } catch (error) {
      console.error('Error getting alert summary:', error);
      return { total: 0, critical: 0, warning: 0, info: 0 };
    }
  }

  // Get alerts by priority
  async getAlertsByPriority(priority) {
    try {
      const alerts = await this.getInventoryAlerts();
      const allAlerts = [
        ...alerts.outOfStock,
        ...alerts.lowStock,
        ...alerts.overstock,
        ...alerts.inactive,
        ...alerts.highValue
      ];

      return allAlerts.filter(alert => alert.priority === priority);
    } catch (error) {
      console.error('Error getting alerts by priority:', error);
      return [];
    }
  }

  // Get alerts by type
  async getAlertsByType(type) {
    try {
      const alerts = await this.getInventoryAlerts();
      
      switch (type) {
        case 'out_of_stock':
          return alerts.outOfStock;
        case 'low_stock':
          return alerts.lowStock;
        case 'overstock':
          return alerts.overstock;
        case 'inactive':
          return alerts.inactive;
        case 'high_value':
          return alerts.highValue;
        default:
          return [];
      }
    } catch (error) {
      console.error('Error getting alerts by type:', error);
      return [];
    }
  }

  // Helper method to format currency
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }

  // Get alert priority color
  getPriorityColor(priority) {
    switch (priority) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  }

  // Get alert type icon
  getAlertIcon(type) {
    switch (type) {
      case 'out_of_stock':
        return '🚨';
      case 'low_stock':
        return '⚠️';
      case 'overstock':
        return '📦';
      case 'inactive':
        return '😴';
      case 'high_value':
        return '💰';
      default:
        return '📋';
    }
  }
}

export default new AlertsService();