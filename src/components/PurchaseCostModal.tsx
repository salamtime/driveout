import React, { useState } from 'react';
import { X, DollarSign, Calendar, Building, FileText } from 'lucide-react';

interface PurchaseCostData {
  purchase_cost_mad: string;
  purchase_date: string;
  supplier: string;
  invoice_url: string;
}

interface PurchaseCostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PurchaseCostData) => void;
  initialData?: Partial<PurchaseCostData>;
  vehicleName?: string;
}

const PurchaseCostModal: React.FC<PurchaseCostModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData = {},
  vehicleName = "Vehicle"
}) => {
  const [formData, setFormData] = useState<PurchaseCostData>({
    purchase_cost_mad: '',
    purchase_date: '',
    supplier: '',
    invoice_url: '',
    ...initialData
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving purchase cost data:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof PurchaseCostData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Purchase Cost Information
              </h2>
              <p className="text-sm text-gray-600">
                Add acquisition details for {vehicleName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Success Banner */}
          <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-3">
                <p className="text-lg font-semibold text-green-800">
                  Purchase Cost Tracking Module
                </p>
                <p className="text-sm text-green-700">
                  Track vehicle acquisition costs, suppliers, and financial documentation
                </p>
              </div>
            </div>
          </div>

          {/* Purchase Cost Fields */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  Purchase Cost (MAD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_cost_mad}
                  onChange={(e) => handleInputChange('purchase_cost_mad', e.target.value)}
                  placeholder="e.g., 50000.00"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">Enter the total purchase price in MAD</p>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => handleInputChange('purchase_date', e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Date when the vehicle was purchased</p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Building className="w-4 h-4 text-purple-600" />
                Supplier / Seller
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => handleInputChange('supplier', e.target.value)}
                placeholder="e.g., Yamaha Morocco, Local Dealer, Private Seller"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">Name of the dealer, company, or person who sold the vehicle</p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 text-orange-600" />
                Invoice / Receipt URL
              </label>
              <input
                type="url"
                value={formData.invoice_url}
                onChange={(e) => handleInputChange('invoice_url', e.target.value)}
                placeholder="https://example.com/invoice.pdf"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="text-xs text-gray-500 mt-1">Link to the purchase invoice, receipt, or contract document</p>
            </div>
          </div>

          {/* Summary Section */}
          {formData.purchase_cost_mad && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Purchase Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Cost:</span>
                  <span className="ml-2 font-semibold">{formData.purchase_cost_mad} MAD</span>
                </div>
                {formData.purchase_date && (
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <span className="ml-2 font-semibold">{new Date(formData.purchase_date).toLocaleDateString()}</span>
                  </div>
                )}
                {formData.supplier && (
                  <div className="col-span-2">
                    <span className="text-gray-600">Supplier:</span>
                    <span className="ml-2 font-semibold">{formData.supplier}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 ${
                saving
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  Save Purchase Information
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseCostModal;