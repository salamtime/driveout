import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MaintenanceReport = () => {
  const { t } = useTranslation();
  const { records } = useSelector(state => state.maintenance);
  const { vehicles } = useSelector(state => state.vehicles);
  const [vehicleStats, setVehicleStats] = useState([]);
  const [maintenanceTypeData, setMaintenanceTypeData] = useState([]);
  const [upcomingMaintenances, setUpcomingMaintenances] = useState([]);
  const [overdueMaintenance, setOverdueMaintenance] = useState([]);
  const [costPerMonth, setCostPerMonth] = useState([]);

  useEffect(() => {
    if (records.length > 0 && vehicles.length > 0) {
      generateReports();
    }
  }, [records, vehicles]);

  // Generate all the analytics reports
  const generateReports = () => {
    generateVehicleStatistics();
    generateMaintenanceTypeData();
    findUpcomingMaintenances();
    findOverdueMaintenances();
    calculateCostPerMonth();
  };

  // Calculate maintenance statistics per vehicle
  const generateVehicleStatistics = () => {
    const stats = vehicles.map(vehicle => {
      const vehicleRecords = records.filter(record => record.vehicle_id === vehicle.id);
      
      // Calculate total maintenance costs
      const totalCost = vehicleRecords.reduce((sum, record) => {
        const partsCost = record.parts?.reduce(
          (partsSum, part) => partsSum + parseFloat(part.total_cost || 0), 
          0
        ) || 0;
        return sum + partsCost;
      }, 0);
      
      // Count by status
      const completedCount = vehicleRecords.filter(record => record.status === 'completed').length;
      const pendingCount = vehicleRecords.filter(record => record.status === 'pending').length;
      const inProgressCount = vehicleRecords.filter(record => record.status === 'in-progress').length;
      
      // Find most recent maintenance
      const sortedRecords = [...vehicleRecords].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      const lastMaintenance = sortedRecords.length > 0 ? sortedRecords[0] : null;
      
      // Calculate average days between maintenances
      let avgDaysBetween = 0;
      if (sortedRecords.length > 1) {
        let totalDays = 0;
        for (let i = 1; i < sortedRecords.length; i++) {
          const daysDiff = Math.round(
            (new Date(sortedRecords[i-1].date) - new Date(sortedRecords[i].date)) / (1000 * 60 * 60 * 24)
          );
          totalDays += daysDiff;
        }
        avgDaysBetween = Math.round(totalDays / (sortedRecords.length - 1));
      }
      
      return {
        id: vehicle.id,
        name: vehicle.name,
        model: vehicle.model,
        vin: vehicle.vin,
        totalMaintenanceCount: vehicleRecords.length,
        totalMaintenanceCost: totalCost,
        completedCount,
        pendingCount,
        inProgressCount,
        lastMaintenance,
        avgDaysBetweenMaintenances: avgDaysBetween,
        image_url: vehicle.image_url || '/assets/images/atv-placeholder.jpg'
      };
    });
    
    setVehicleStats(stats);
  };

  // Generate data for maintenance types pie chart
  const generateMaintenanceTypeData = () => {
    const typeCounts = {};
    
    records.forEach(record => {
      if (record.type) {
        typeCounts[record.type] = (typeCounts[record.type] || 0) + 1;
      }
    });
    
    const chartData = Object.keys(typeCounts).map(type => ({
      name: t(`admin.maintenance.${type.toLowerCase()}`) || type,
      value: typeCounts[type]
    }));
    
    setMaintenanceTypeData(chartData);
  };

  // Find upcoming scheduled maintenances
  const findUpcomingMaintenances = () => {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);
    
    const upcoming = records
      .filter(record => {
        if (!record.next_service) return false;
        
        const nextServiceDate = new Date(record.next_service);
        return isAfter(nextServiceDate, today) && isBefore(nextServiceDate, nextMonth);
      })
      .map(record => {
        const vehicle = vehicles.find(v => v.id === record.vehicle_id);
        return {
          ...record,
          vehicleName: vehicle ? vehicle.name : t('admin.maintenance.unknownVehicle'),
          vehicleModel: vehicle ? vehicle.model : '',
          daysUntil: Math.round(
            (new Date(record.next_service) - today) / (1000 * 60 * 60 * 24)
          )
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
    
    setUpcomingMaintenances(upcoming);
  };

  // Find overdue maintenance records
  const findOverdueMaintenances = () => {
    const today = new Date();
    
    const overdue = records
      .filter(record => {
        if (!record.next_service) return false;
        if (record.status === 'completed') return false;
        
        const nextServiceDate = new Date(record.next_service);
        return isBefore(nextServiceDate, today);
      })
      .map(record => {
        const vehicle = vehicles.find(v => v.id === record.vehicle_id);
        return {
          ...record,
          vehicleName: vehicle ? vehicle.name : t('admin.maintenance.unknownVehicle'),
          vehicleModel: vehicle ? vehicle.model : '',
          daysOverdue: Math.abs(Math.round(
            (today - new Date(record.next_service)) / (1000 * 60 * 60 * 24)
          ))
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    
    setOverdueMaintenance(overdue);
  };

  // Calculate cost per month for the last 6 months
  const calculateCostPerMonth = () => {
    const months = {};
    const today = new Date();
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(today.getMonth() - i);
      const monthKey = format(d, 'yyyy-MM');
      months[monthKey] = 0;
    }
    
    // Sum costs by month
    records.forEach(record => {
      if (!record.date) return;
      
      try {
        const recordDate = parseISO(record.date);
        const monthKey = format(recordDate, 'yyyy-MM');
        
        // Only include if it's in our 6-month window
        if (months[monthKey] !== undefined) {
          const partsCost = record.parts?.reduce(
            (sum, part) => sum + parseFloat(part.total_cost || 0),
            0
          ) || 0;
          
          months[monthKey] += partsCost;
        }
      } catch (err) {
        console.error('Error parsing date:', err);
      }
    });
    
    // Format for chart
    const chartData = Object.keys(months).map(month => ({
      month: format(parseISO(`${month}-01`), 'MMM yyyy'),
      cost: months[month]
    }));
    
    setCostPerMonth(chartData);
  };

  // Utility function to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Colors for the pie chart
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md mb-6 mt-0">
      <div className="px-6 py-5 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">{t('admin.maintenance.maintenanceAnalytics')}</h2>
      </div>
      
      {/* Charts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-b border-gray-200">
        {/* Maintenance types pie chart */}
        <div className="p-6 border-r border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-4">{t('admin.maintenance.maintenanceByType')}</h3>
          {maintenanceTypeData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={maintenanceTypeData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {maintenanceTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[250px]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-gray-500">{t('admin.maintenance.noDataAvailable')}</p>
            </div>
          )}
        </div>
        
        {/* Monthly costs bar chart */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">{t('admin.maintenance.costByMonth')}</h3>
          {costPerMonth.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costPerMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis 
                    tickFormatter={(value) => `$${value}`} 
                  />
                  <Tooltip formatter={(value) => [formatCurrency(value), t('admin.maintenance.cost')]} />
                  <Bar dataKey="cost" fill="#3B82F6" name={t('admin.maintenance.monthlyCost')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[250px]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500">{t('admin.maintenance.noDataAvailable')}</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Vehicle statistics section */}
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-4">{t('admin.maintenance.vehicleStatistics')}</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.maintenance.vehicle')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.maintenance.maintenanceCount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.maintenance.totalCost')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.maintenance.avgDaysBetween')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.maintenance.lastServiceDate')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {vehicleStats.length > 0 ? (
                vehicleStats.map(vehicle => (
                  <tr key={vehicle.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <img 
                            src={vehicle.image_url}
                            alt={vehicle.name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{vehicle.name}</div>
                          <div className="text-sm text-gray-500">{vehicle.model}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{vehicle.totalMaintenanceCount}</div>
                      <div className="text-xs text-gray-500">
                        <span className="text-green-600">{vehicle.completedCount} {t('admin.maintenance.completed')}</span>
                        {' • '}
                        <span className="text-amber-600">{vehicle.pendingCount} {t('admin.maintenance.pending')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(vehicle.totalMaintenanceCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {vehicle.avgDaysBetweenMaintenances > 0 
                        ? `${vehicle.avgDaysBetweenMaintenances} ${t('admin.maintenance.days')}` 
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {vehicle.lastMaintenance 
                        ? format(new Date(vehicle.lastMaintenance.date), 'MMM dd, yyyy')
                        : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                    {t('admin.maintenance.noVehicleData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Alerts section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x-0 md:divide-x divide-gray-200">
        {/* Upcoming maintenance alerts */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {t('admin.maintenance.upcomingMaintenance')}
          </h3>
          
          {upcomingMaintenances.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {upcomingMaintenances.slice(0, 5).map(maintenance => (
                <li key={maintenance.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{maintenance.vehicleName}</p>
                      <p className="text-sm text-gray-500 truncate">{maintenance.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {format(new Date(maintenance.next_service), 'MMM dd, yyyy')}
                      </p>
                      <p className="text-xs font-medium text-amber-600">
                        {t('admin.maintenance.daysUntil', { count: maintenance.daysUntil })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">
              {t('admin.maintenance.noDataAvailable')}
            </div>
          )}
        </div>
        
        {/* Overdue maintenance alerts */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-700 flex items-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {t('admin.maintenance.overdueMaintenance')}
          </h3>
          
          {overdueMaintenance.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {overdueMaintenance.slice(0, 5).map(maintenance => (
                <li key={maintenance.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{maintenance.vehicleName}</p>
                      <p className="text-sm text-gray-500 truncate">{maintenance.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {format(new Date(maintenance.next_service), 'MMM dd, yyyy')}
                      </p>
                      <p className="text-xs font-medium text-red-600">
                        {t('admin.maintenance.daysOverdue', { count: maintenance.daysOverdue })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">
              {t('admin.maintenance.noDataAvailable')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenanceReport;