import React, { useState } from 'react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import InventoryDashboard from '../../components/inventory/InventoryDashboard';
import ItemsManagement from '../../components/inventory/ItemsManagement';
import StockMovements from '../../components/inventory/StockMovements';
import PurchasesManagement from '../../components/inventory/PurchasesManagement';
import LowStockAlert from '../../components/inventory/LowStockAlert';
import { 
  Boxes,
  HomeIcon, 
  PackageIcon, 
  TrendingUpIcon, 
  ShoppingCartIcon,
  AlertTriangleIcon 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { i18n } = useTranslation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navigationParams, setNavigationParams] = useState(null);

  const handleNavigation = (tab, params = null) => {
    setActiveTab(tab);
    setNavigationParams(params);
  };

  const tabs = [
    {
      id: 'dashboard',
      name: isFrench ? 'Tableau de bord' : 'Dashboard',
      icon: HomeIcon,
      component: InventoryDashboard
    },
    {
      id: 'items',
      name: isFrench ? 'Articles' : 'Items',
      icon: PackageIcon,
      component: ItemsManagement
    },
    {
      id: 'movements',
      name: isFrench ? 'Mouvements de stock' : 'Stock Movements',
      icon: TrendingUpIcon,
      component: StockMovements
    },
    {
      id: 'purchases',
      name: isFrench ? 'Achats' : 'Purchases',
      icon: ShoppingCartIcon,
      component: PurchasesManagement
    },
    {
      id: 'low-stock',
      name: isFrench ? 'Stock faible' : 'Low Stock',
      icon: AlertTriangleIcon,
      component: LowStockAlert
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || InventoryDashboard;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Boxes className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Inventaire' : 'Inventory'}
        title={isFrench ? "Gestion de l'inventaire" : 'Inventory Management'}
        description={isFrench ? "Suivez le stock, les achats, les mouvements et les alertes depuis un espace inventaire partagé." : 'Track stock, purchases, movements, and alerts from one shared inventory workspace.'}
        className="w-full"
      />

      {/* Mobile-first Tab Navigation */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm">
        <div className="px-4 py-4 sm:px-6 lg:px-8">
          {/* Mobile Tab Selector */}
          <div className="sm:hidden">
            <select
              value={activeTab}
              onChange={(e) => handleNavigation(e.target.value)}
              className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
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
            <nav className="flex flex-wrap gap-3 rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-sm" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleNavigation(tab.id)}
                    className={`group inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`-ml-0.5 mr-2 h-5 w-5 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
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
