import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useFuel from '../../../hooks/useFuel';
import { GaugeIcon, TruckIcon, CalendarIcon, ChevronsUpIcon } from 'lucide-react';

const MainTankDashboard = () => {
  const { t } = useTranslation();
  const { 
    tankLevel, 
    tankCapacity, 
    tankPercentage, 
    externalRefills, 
    loading, 
    addExternalRefill,
    formatDate,
    canEditDelete
  } = useFuel();
  
  // State for the add refill form
  const [isAddingRefill, setIsAddingRefill] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    supplierName: '',
    volume: '',
    cost: '',
    invoiceNumber: '',
    notes: ''
  });
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'volume' || name === 'cost' ? parseFloat(value) : value
    });
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addExternalRefill({
        ...formData,
        date: new Date(formData.date).toISOString()
      });
      setIsAddingRefill(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        supplierName: '',
        volume: '',
        cost: '',
        invoiceNumber: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error adding refill:', error);
    }
  };
  
  // Determine tank level indicator color
  const getTankLevelColor = () => {
    if (tankPercentage < 20) return 'text-red-600 bg-red-100';
    if (tankPercentage < 40) return 'text-orange-600 bg-orange-100';
    return 'text-green-600 bg-green-100';
  };
  
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Tank Status Card */}
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <div className={`p-2 rounded-full ${getTankLevelColor()}`}>
              <GaugeIcon className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold ml-3">{t('admin.fuel.mainTank.status')}</h2>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          ) : (
            <>
              {/* Tank level gauge */}
              <div className="mb-4">
                <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ 
                      width: `${tankPercentage}%`, 
                      backgroundColor: tankPercentage < 20 ? '#ef4444' : tankPercentage < 40 ? '#f97316' : '#22c55e'
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mt-1">
                  <span>0L</span>
                  <span>{tankCapacity}L</span>
                </div>
              </div>
              
              {/* Tank stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">{t('admin.fuel.mainTank.current')}</p>
                  <p className="text-2xl font-bold">{tankLevel}L <span className="text-sm font-normal text-gray-500">/ {tankCapacity}L</span></p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">{t('admin.fuel.mainTank.percentage')}</p>
                  <p className={`text-2xl font-bold ${getTankLevelColor().split(' ')[0]}`}>{tankPercentage.toFixed(1)}%</p>
                </div>
              </div>
            </>
          )}
          
          {/* Add refill button - only shown to admin/manager */}
          {canEditDelete && (
            <button
              onClick={() => setIsAddingRefill(true)}
              className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center justify-center"
            >
              <ChevronsUpIcon className="h-4 w-4 mr-1" />
              {t('admin.fuel.mainTank.addRefill')}
            </button>
          )}
        </div>
        
        {/* Recent Refills Card */}
        <div className="lg:col-span-2 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <div className="p-2 rounded-full text-blue-600 bg-blue-100">
              <TruckIcon className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold ml-3">{t('admin.fuel.mainTank.recentRefills')}</h2>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          ) : (
            <>
              {externalRefills.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <p>{t('admin.fuel.mainTank.noRefills')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                        <th className="px-4 py-2 text-left">{t('admin.fuel.mainTank.date')}</th>
                        <th className="px-4 py-2 text-left">{t('admin.fuel.mainTank.supplier')}</th>
                        <th className="px-4 py-2 text-right">{t('admin.fuel.mainTank.volume')}</th>
                        <th className="px-4 py-2 text-right">{t('admin.fuel.mainTank.cost')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {externalRefills.slice(0, 5).map((refill) => (
                        <tr key={refill.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                              <span>{formatDate(refill.date)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">{refill.supplierName}</td>
                          <td className="px-4 py-2 text-right font-medium">{refill.volume} L</td>
                          <td className="px-4 py-2 text-right">${refill.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Add Refill Modal */}
      {isAddingRefill && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">{t('admin.fuel.mainTank.addNewRefill')}</h3>
            
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.fuel.mainTank.date')}
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.fuel.mainTank.supplier')}
                  </label>
                  <input
                    type="text"
                    name="supplierName"
                    value={formData.supplierName}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('admin.fuel.mainTank.volume')} (L)
                    </label>
                    <input
                      type="number"
                      name="volume"
                      value={formData.volume}
                      onChange={handleInputChange}
                      required
                      min="1"
                      step="0.1"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('admin.fuel.mainTank.cost')} ($)
                    </label>
                    <input
                      type="number"
                      name="cost"
                      value={formData.cost}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.fuel.mainTank.invoiceNumber')}
                  </label>
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={formData.invoiceNumber}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.fuel.mainTank.notes')}
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows="2"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  ></textarea>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddingRefill(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainTankDashboard;