import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { 
  fetchPricingRules, 
  deletePricingRule, 
  selectPricingRules, 
  selectPricingLoading, 
  selectPricingError 
} from '../../../store/slices/pricingSlice';
import PricingRuleEditor from './PricingRuleEditor';
import { Plus, Edit, Trash2, ToggleLeft, ToggleRight, DollarSign, Clock, Calendar, MapPin, Users, Gift } from 'lucide-react';

const PricingRulesManager = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const rules = useSelector(selectPricingRules);
  const loading = useSelector(selectPricingLoading);
  const error = useSelector(selectPricingError);
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  useEffect(() => {
    dispatch(fetchPricingRules());
  }, [dispatch]);

  const handleAddRule = () => {
    setEditingRule(null);
    setShowEditor(true);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setShowEditor(true);
  };

  const handleDeleteRule = async (ruleId) => {
    if (window.confirm('Are you sure you want to delete this pricing rule?')) {
      dispatch(deletePricingRule(ruleId));
    }
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingRule(null);
  };

  const getRuleTypeIcon = (ruleType) => {
    const icons = {
      base: DollarSign,
      seasonal: Calendar,
      duration: Clock,
      vehicle_specific: MapPin,
      location_based: MapPin,
      customer_type: Users,
      promotional: Gift
    };
    const Icon = icons[ruleType] || DollarSign;
    return <Icon className="w-4 h-4" />;
  };

  const getRuleTypeColor = (ruleType) => {
    const colors = {
      base: 'bg-blue-100 text-blue-800',
      seasonal: 'bg-green-100 text-green-800',
      duration: 'bg-purple-100 text-purple-800',
      vehicle_specific: 'bg-orange-100 text-orange-800',
      location_based: 'bg-pink-100 text-pink-800',
      customer_type: 'bg-indigo-100 text-indigo-800',
      promotional: 'bg-red-100 text-red-800'
    };
    return colors[ruleType] || 'bg-gray-100 text-gray-800';
  };

  const formatRuleDetails = (rule) => {
    const details = [];
    
    if (rule.base_rate) {
      details.push(`$${rule.base_rate}/${rule.rate_type || 'unit'}`);
    }
    
    if (rule.multiplier && rule.multiplier !== 1.0) {
      const percentage = ((rule.multiplier - 1) * 100).toFixed(0);
      details.push(`${percentage > 0 ? '+' : ''}${percentage}%`);
    }
    
    if (rule.discount_percentage) {
      details.push(`-${rule.discount_percentage}%`);
    }
    
    return details.join(' • ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Rules Configuration</h1>
          <p className="text-gray-600">Manage automated pricing rules for rental calculations</p>
        </div>
        <button
          onClick={handleAddRule}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Pricing Rule</span>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {rules.length === 0 ? (
            <li className="px-6 py-8 text-center">
              <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No pricing rules</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first pricing rule.</p>
              <div className="mt-6">
                <button
                  onClick={handleAddRule}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pricing Rule
                </button>
              </div>
            </li>
          ) : (
            rules.map((rule) => (
              <li key={rule.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`flex items-center space-x-2 px-2 py-1 rounded-full text-xs font-medium ${getRuleTypeColor(rule.rule_type)}`}>
                      {getRuleTypeIcon(rule.rule_type)}
                      <span className="capitalize">{rule.rule_type.replace('_', ' ')}</span>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{rule.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Priority: {rule.priority}</span>
                        {formatRuleDetails(rule) && (
                          <span>{formatRuleDetails(rule)}</span>
                        )}
                        {rule.valid_from && (
                          <span>From: {new Date(rule.valid_from).toLocaleDateString()}</span>
                        )}
                        {rule.valid_until && (
                          <span>Until: {new Date(rule.valid_until).toLocaleDateString()}</span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Active Toggle */}
                    <button
                      className={`p-1 rounded ${rule.is_active ? 'text-green-600' : 'text-gray-400'}`}
                      title={rule.is_active ? 'Active' : 'Inactive'}
                    >
                      {rule.is_active ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    
                    {/* Edit Button */}
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-1 text-gray-400 hover:text-blue-600"
                      title="Edit Rule"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Rule Editor Modal */}
      {showEditor && (
        <PricingRuleEditor
          rule={editingRule}
          isOpen={showEditor}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
};

export default PricingRulesManager;