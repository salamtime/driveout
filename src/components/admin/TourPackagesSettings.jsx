import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Package, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import toast from 'react-hot-toast';
import { 
  fetchTourPackages, 
  createTourPackage, 
  updateTourPackage, 
  deleteTourPackage 
} from '../../services/tourPackageService';

const TourPackagesSettings = () => {
  const [tourPackages, setTourPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: 1,
    default_rate_1h: 50,
    default_rate_2h: 90,
    vip_rate_1h: 75,
    vip_rate_2h: 140,
    location: 'Main Base',
    is_active: true
  });

  // Load tour packages on component mount
  useEffect(() => {
    loadTourPackages();
  }, []);

  const loadTourPackages = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchTourPackages();
      if (error) throw error;
      setTourPackages(data || []);
    } catch (error) {
      console.error('Failed to load tour packages:', error);
      toast.error('Failed to load tour packages');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: field.includes('rate') ? parseFloat(value) || 0 : value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      duration: 1,
      default_rate_1h: 50,
      default_rate_2h: 90,
      vip_rate_1h: 75,
      vip_rate_2h: 140,
      location: 'Main Base',
      is_active: true
    });
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Tour package name is required');
      return;
    }

    try {
      let result;
      if (editingId) {
        result = await updateTourPackage(editingId, formData);
      } else {
        result = await createTourPackage(formData);
      }

      if (result.error) throw result.error;

      toast.success(`Tour package ${editingId ? 'updated' : 'created'} successfully`);
      resetForm();
      loadTourPackages();
    } catch (error) {
      console.error('Failed to save tour package:', error);
      toast.error('Failed to save tour package');
    }
  };

  const handleEdit = (tourPackage) => {
    setFormData({
      name: tourPackage.name,
      description: tourPackage.description || '',
      duration: tourPackage.duration,
      default_rate_1h: tourPackage.default_rate_1h,
      default_rate_2h: tourPackage.default_rate_2h,
      vip_rate_1h: tourPackage.vip_rate_1h,
      vip_rate_2h: tourPackage.vip_rate_2h,
      location: tourPackage.location || 'Main Base',
      is_active: tourPackage.is_active
    });
    setEditingId(tourPackage.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this tour package?')) {
      return;
    }

    try {
      const { error } = await deleteTourPackage(id);
      if (error) throw error;

      toast.success('Tour package deleted successfully');
      loadTourPackages();
    } catch (error) {
      console.error('Failed to delete tour package:', error);
      toast.error('Failed to delete tour package');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Tour Packages
        </CardTitle>
        <CardDescription>
          Manage tour packages and their pricing configurations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Add New Button */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium">Manage Tour Packages</h3>
          <Button 
            onClick={() => setIsCreating(true)}
            disabled={isCreating || editingId}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Tour Package
          </Button>
        </div>

        {/* Create/Edit Form */}
        {(isCreating || editingId) && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-medium">
                {editingId ? 'Edit Tour Package' : 'Add New Tour Package'}
              </h4>
              <Button variant="outline" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tour Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., City Tour"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="e.g., Main Base"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Tour description..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_rate_1h">Default 1H Rate ($)</Label>
                <Input
                  id="default_rate_1h"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_rate_1h}
                  onChange={(e) => handleInputChange('default_rate_1h', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_rate_2h">Default 2H Rate ($)</Label>
                <Input
                  id="default_rate_2h"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.default_rate_2h}
                  onChange={(e) => handleInputChange('default_rate_2h', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vip_rate_1h">VIP 1H Rate ($)</Label>
                <Input
                  id="vip_rate_1h"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.vip_rate_1h}
                  onChange={(e) => handleInputChange('vip_rate_1h', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vip_rate_2h">VIP 2H Rate ($)</Label>
                <Input
                  id="vip_rate_2h"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.vip_rate_2h}
                  onChange={(e) => handleInputChange('vip_rate_2h', e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                />
                <Label>Active</Label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tour Packages List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Loading tour packages...</div>
          ) : tourPackages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tour packages found. Create your first tour package to get started.
            </div>
          ) : (
            tourPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="border rounded-lg p-4 bg-white hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-lg">{pkg.name}</h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        pkg.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {pkg.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    {pkg.description && (
                      <p className="text-gray-600 text-sm mb-2">{pkg.description}</p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>📍 {pkg.location}</span>
                      <span>⏱️ Duration: {pkg.duration}h</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span>1H: ${pkg.default_rate_1h}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span>2H: ${pkg.default_rate_2h}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-gold-500" />
                        <span>VIP 1H: ${pkg.vip_rate_1h}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-gold-500" />
                        <span>VIP 2H: ${pkg.vip_rate_2h}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(pkg)}
                      disabled={editingId || isCreating}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(pkg.id)}
                      disabled={editingId || isCreating}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TourPackagesSettings;