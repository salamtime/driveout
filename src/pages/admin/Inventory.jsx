import React, { useState } from 'react';
import InventoryDashboard from '../../components/inventory/InventoryDashboard';
import ItemsManagement from '../../components/inventory/ItemsManagement';
import StockMovements from '../../components/inventory/StockMovements';
import PurchasesManagement from '../../components/inventory/PurchasesManagement';
import LowStockAlert from '../../components/inventory/LowStockAlert';
import { 
  HomeIcon, 
  PackageIcon, 
  TrendingUpIcon, 
  ShoppingCartIcon,
  AlertTriangleIcon 
} from 'lucide-react';

/**
 * InventoryPage - Complete inventory management system
 * 
 * Features:
 * - Dashboard with overview and alerts
 * - Items catalog management
 * - Stock movements tracking (IN/OUT)
 * - Purchases with invoice photos
 * - Low stock alerts
 * - Vehicle/maintenance integration
 */
const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navigationParams, setNavigationParams] = useState(null);

  const handleNavigation = (tab, params = null) => {
    setActiveTab(tab);
    setNavigationParams(params);
  };

  const tabs = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: HomeIcon,
      component: InventoryDashboard
    },
    {
      id: 'items',
      name: 'Items',
      icon: PackageIcon,
      component: ItemsManagement
    },
    {
      id: 'movements',
      name: 'Stock Movements',
      icon: TrendingUpIcon,
      component: StockMovements
    },
    {
      id: 'purchases',
      name: 'Purchases',
      icon: ShoppingCartIcon,
      component: PurchasesManagement
    },
    {
      id: 'low-stock',
      name: 'Low Stock',
      icon: AlertTriangleIcon,
      component: LowStockAlert
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || InventoryDashboard;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-first Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          {/* Mobile Tab Selector */}
          <div className="sm:hidden">
            <select
              value={activeTab}
              onChange={(e) => handleNavigation(e.target.value)}
              className="block w-full py-3 px-3 border-0 bg-transparent text-gray-900 focus:ring-0 focus:outline-none"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.name}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Tab Navigation */}
          <div className="hidden sm:block">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleNavigation(tab.id)}
                    className={`
                      group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors
                      ${isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className={`
                      -ml-0.5 mr-2 h-5 w-5 transition-colors
                      ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}
                    `} />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        <ActiveComponent 
          onNavigate={handleNavigation}
          initialParams={navigationParams}
          {...navigationParams}
        />
      </div>
    </div>
  );
};

export default InventoryPage;