import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import VehicleModelService from '../../services/VehicleModelService';
import { Plus, Save, X, Percent } from 'lucide-react';

const DiscountManager = ({ onUpdate }) => {
  const [vehicleModels, setVehicleModels] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [newDiscountForm, setNewDiscountForm] = useState({
    vehicle_model_id: '',
    discount_name: '',
    discount_type: '',
    discount_value: '',
    conditions: ''
  });
  const [showNewForm, setShowNewForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Use centralized VehicleModelService
      const models = await VehicleModelService.getActiveModels();
      setVehicleModels(models || []);
      
      setDiscounts([]);
    } catch (error) {
      console.error('Error loading discounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNewDiscount = async () => {
    try {
      console.log('Adding discount:', newDiscountForm);
      alert('Discount management feature coming soon!');
      setNewDiscountForm({
        vehicle_model_id: '',
        discount_name: '',
        discount_type: '',
        discount_value: '',
        conditions: ''
      });
      setShowNewForm(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error adding discount:', error);
      alert('Error adding discount: ' + error.message);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading discounts...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Discount Management
          </CardTitle>
          <Button onClick={() => setShowNewForm(true)} disabled={showNewForm}>
            <Plus className="w-4 h-4 mr-2" />
            Add Discount
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showNewForm && (
          <Card className="mb-6 border-dashed">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <Label>Vehicle Model</Label>
                  <Select
                    value={newDiscountForm.vehicle_model_id}
                    onValueChange={(value) => setNewDiscountForm(prev => ({ ...prev, vehicle_model_id: value }))}
                  >
                    <SelectTrigger className="h-auto min-h-[40px]">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleModels.length === 0 ? (
                        <SelectItem value="no-models-available" disabled>
                          No models available
                        </SelectItem>
                      ) : (
                        vehicleModels
                          .filter(model => model && model.id)
                          .map(model => (
                            <SelectItem 
                              key={model.id} 
                              value={model.id.toString()}
                              className="py-3"
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {VehicleModelService.getDisplayLabel(model)}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {model.vehicle_type} • ID: {model.id.substring(0, 8)}...
                                </span>
                              </div>
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Discount Name</Label>
                  <Input
                    value={newDiscountForm.discount_name}
                    onChange={(e) => setNewDiscountForm(prev => ({ ...prev, discount_name: e.target.value }))}
                    placeholder="e.g., Early Bird"
                  />
                </div>
                <div>
                  <Label>Discount Type</Label>
                  <Select
                    value={newDiscountForm.discount_type}
                    onValueChange={(value) => setNewDiscountForm(prev => ({ ...prev, discount_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed-amount">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Discount Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newDiscountForm.discount_value}
                    onChange={(e) => setNewDiscountForm(prev => ({ ...prev, discount_value: e.target.value }))}
                    placeholder="10"
                  />
                </div>
                <div>
                  <Label>Conditions</Label>
                  <Input
                    value={newDiscountForm.conditions}
                    onChange={(e) => setNewDiscountForm(prev => ({ ...prev, conditions: e.target.value }))}
                    placeholder="e.g., Book 7 days ahead"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={addNewDiscount} 
                  disabled={!newDiscountForm.vehicle_model_id || !newDiscountForm.discount_name || !newDiscountForm.discount_type || newDiscountForm.vehicle_model_id === 'no-models-available'}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Discount
                </Button>
                <Button variant="outline" onClick={() => setShowNewForm(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center py-8 text-gray-500">
          <Percent className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>Discount management feature coming soon!</p>
          <p className="text-sm mt-2">This will allow you to create and manage various discount types and promotional offers.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DiscountManager;