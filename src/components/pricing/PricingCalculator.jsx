import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import PricingService from '../../services/PricingService'; // FIXED: Changed from named import to default import
import { supabase } from '../../lib/supabase';
import { Calculator, DollarSign } from 'lucide-react';

const PricingCalculator = () => {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*')
        .eq('status', 'available');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  };

  const calculatePrice = async () => {
    if (!selectedVehicle || !startDate || !endDate) {
      alert('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await PricingService.calculateRentalCost(
        selectedVehicle,
        startDate,
        endDate
      );
      setCalculation(result);
    } catch (error) {
      console.error('Error calculating price:', error);
      alert('Error calculating price: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Pricing Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label>Vehicle</Label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} - {vehicle.model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={calculatePrice} disabled={loading} className="w-full">
            {loading ? 'Calculating...' : 'Calculate Price'}
          </Button>

          {calculation && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                Price Calculation
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span>{calculation.days} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Price per day:</span>
                  <span>${calculation.pricePerDay}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tier used:</span>
                  <span>{calculation.tierUsed}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total Price:</span>
                  <span>${calculation.totalPrice}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PricingCalculator;