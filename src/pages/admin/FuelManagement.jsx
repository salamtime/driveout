import React, { useState } from 'react';
import { 
  Fuel, 
  BarChart3, 
  List, 
  Settings,
  TrendingUp
} from 'lucide-react';
import FuelTransactions from './FuelTransactions';
import FuelAnalytics from '../../components/fuel/FuelAnalytics';
import FuelOverview from '../../components/fuel/FuelOverview';
import AdminModuleHero from '../../components/admin/AdminModuleHero';

const FuelManagement = () => {
  const [activeTab, setActiveTab] = useState('transactions');

  const tabs = [
    {
      id: 'overview',
      name: 'Overview',
      icon: BarChart3,
      description: 'Fuel consumption overview and key metrics'
    },
    {
      id: 'transactions',
      name: 'Transactions',
      icon: List,
      description: 'Manage fuel refills and withdrawals'
    },
    {
      id: 'analytics',
      name: 'Analytics',
      icon: TrendingUp,
      description: 'Detailed fuel analytics and insights'
    }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <FuelOverview />;
      case 'transactions':
        return <FuelTransactions />;
      case 'analytics':
        return <FuelAnalytics />;
      default:
        return <FuelTransactions />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        icon={<Fuel className="h-8 w-8 text-white" />}
        eyebrow="Fuel Management"
        title="Fuel Management"
        description="Track tank levels, refills, withdrawals, and fuel performance from one operational workspace."
      />

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default FuelManagement;
