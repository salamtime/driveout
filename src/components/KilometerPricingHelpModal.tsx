import React from 'react';
import { X, Info, CheckCircle, AlertTriangle, DollarSign, Package, TrendingUp, Zap } from 'lucide-react';

interface KilometerPricingHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KilometerPricingHelpModal: React.FC<KilometerPricingHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <Info className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Kilometer-Based Pricing Guide</h2>
              <p className="text-sm text-purple-100">Everything you need to know about managing rental packages</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* What is Kilometer-Based Pricing */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <Package className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">What is Kilometer-Based Pricing?</h3>
                <p className="text-gray-700 leading-relaxed">
                  Kilometer-based pricing allows you to create rental packages that include a specific number of kilometers. 
                  If customers exceed the included kilometers, they are automatically charged an overage rate per additional kilometer.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200">
              <p className="text-sm font-medium text-gray-900 mb-2">💡 Benefits:</p>
              <ul className="space-y-1 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Fair Pricing:</strong> Customers pay for what they use</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Automatic Calculation:</strong> System calculates overage charges automatically</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Flexible Packages:</strong> Create different packages for different rental durations</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Revenue Optimization:</strong> Maximize earnings from high-mileage rentals</span>
                </li>
              </ul>
            </div>
          </section>

          {/* How It Works */}
          <section className="bg-green-50 border border-green-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <Zap className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">How It Works</h3>
                <div className="space-y-3 text-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Create a Package</p>
                      <p className="text-sm">Define the package name, base price, included kilometers, and overage rate</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Assign to Rentals</p>
                      <p className="text-sm">When creating a rental, select the appropriate package based on duration</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Track Usage</p>
                      <p className="text-sm">Record starting and ending odometer readings during rental</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Automatic Calculation</p>
                      <p className="text-sm">System calculates overage and updates the total amount automatically</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Example Scenarios */}
          <section className="bg-purple-50 border border-purple-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Example Scenarios</h3>
                
                {/* Example 1 */}
                <div className="bg-white rounded-lg p-4 border border-purple-200 mb-3">
                  <p className="font-medium text-gray-900 mb-2">📦 Daily 200km Package</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    <p><strong>Base Price:</strong> 300 MAD</p>
                    <p><strong>Included Kilometers:</strong> 200 km</p>
                    <p><strong>Overage Rate:</strong> 2.50 MAD/km</p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-100">
                    <p className="text-sm font-medium text-gray-900 mb-1">Scenario:</p>
                    <p className="text-sm text-gray-700">Customer drives 350 km (150 km over limit)</p>
                    <p className="text-sm text-purple-700 font-medium mt-2">
                      💰 Total: 300 MAD + (150 km × 2.50 MAD) = <strong>675 MAD</strong>
                    </p>
                  </div>
                </div>

                {/* Example 2 */}
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <p className="font-medium text-gray-900 mb-2">📦 Weekly 1500km Package</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    <p><strong>Base Price:</strong> 2,400 MAD</p>
                    <p><strong>Included Kilometers:</strong> 1,500 km</p>
                    <p><strong>Overage Rate:</strong> 1.50 MAD/km</p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-100">
                    <p className="text-sm font-medium text-gray-900 mb-1">Scenario:</p>
                    <p className="text-sm text-gray-700">Customer drives 1,350 km (within limit)</p>
                    <p className="text-sm text-green-700 font-medium mt-2">
                      ✅ Total: <strong>2,400 MAD</strong> (no overage charge)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step-by-Step Guide */}
          <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <DollarSign className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Creating Your First Package</h3>
                
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">1.</span>
                    <span><strong>Click "Create Package"</strong> button in the Kilometer Pricing tab</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">2.</span>
                    <span><strong>Enter Package Name:</strong> Use descriptive names like "Daily 200km" or "Weekly 1000km"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">3.</span>
                    <span><strong>Select Rate Type:</strong> Choose Hourly, Daily, Weekly, or Monthly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">4.</span>
                    <span><strong>Set Base Price:</strong> The rental price before any overage charges</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">5.</span>
                    <span><strong>Define Included Kilometers:</strong> How many kilometers are included in the base price</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">6.</span>
                    <span><strong>Set Overage Rate:</strong> Price per kilometer beyond the included amount (in MAD)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">7.</span>
                    <span><strong>(Optional) Vehicle-Specific Rates:</strong> Set different overage rates for Luxury or Premium vehicles</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-yellow-600">8.</span>
                    <span><strong>Save Package:</strong> Click "Save" to create the package</span>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section className="bg-orange-50 border border-orange-200 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Best Practices & Tips</h3>
                
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">💡 Pricing Strategy</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Set competitive included kilometers based on typical usage patterns</li>
                      <li>Price overage rates to discourage excessive mileage while remaining fair</li>
                      <li>Offer multiple package options to suit different customer needs</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">⚙️ Package Management</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Use clear, descriptive package names (e.g., "Daily 200km", not "Package A")</li>
                      <li>Review and adjust packages quarterly based on actual usage data</li>
                      <li>Keep packages active that are currently in use by rentals</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">🚗 Vehicle-Specific Rates</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Set higher overage rates for Luxury vehicles to cover wear and tear</li>
                      <li>Consider fuel efficiency when setting rates for different vehicle types</li>
                      <li>Premium vehicles may justify 20-30% higher overage rates</li>
                    </ul>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="font-medium text-gray-900 mb-1">📊 Monitoring & Analytics</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Track which packages are most popular with customers</li>
                      <li>Monitor average overage charges to identify pricing issues</li>
                      <li>Adjust included kilometers if most rentals exceed the limit</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Rate Types Explained */}
          <section className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Rate Types Explained</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">⏱️ Hourly</p>
                <p className="text-gray-700">No kilometer tracking. Charged by the hour only.</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">📅 Daily</p>
                <p className="text-gray-700">24-hour rentals with kilometer limits (e.g., 200km/day)</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">📆 Weekly</p>
                <p className="text-gray-700">7-day rentals with higher kilometer allowances (e.g., 1500km/week)</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="font-medium text-gray-900 mb-1">🗓️ Monthly</p>
                <p className="text-gray-700">30-day rentals with generous limits (e.g., 5000km/month)</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Need more help? Contact support or check the documentation.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KilometerPricingHelpModal;