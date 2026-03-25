import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import DateRangeFilter from './DateRangeFilter';
import { fetchRevenueData } from '../../store/slices/dashboardSlice';
import { subMonths, format, parseISO } from 'date-fns';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const RevenueChart = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  
  // Get revenue data from Redux store
  const { revenueData, loading, error } = useSelector((state) => state.dashboard);
  
  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: subMonths(new Date(), 6).toISOString(),
    endDate: new Date().toISOString(),
  });

  useEffect(() => {
    // Fetch revenue data when component mounts or date range changes
    dispatch(fetchRevenueData(dateRange));
  }, [dispatch, dateRange.startDate, dateRange.endDate]);

  // Handle date range change
  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // Process data for charts if available
  const prepareChartData = () => {
    if (!revenueData?.monthly || Object.keys(revenueData.monthly).length === 0) {
      return null;
    }

    // Sort months chronologically
    const sortedMonths = Object.keys(revenueData.monthly).sort();
    
    // Format month labels
    const labels = sortedMonths.map(dateStr => {
      const date = parseISO(dateStr);
      return format(date, 'MMM yyyy');
    });
    
    // Extract revenue data
    const rentalRevenues = sortedMonths.map(month => revenueData.monthly[month].rentals);
    const tourRevenues = sortedMonths.map(month => revenueData.monthly[month].tours);
    
    // Calculate totals for display
    const totalRentalRevenue = rentalRevenues.reduce((sum, val) => sum + val, 0);
    const totalTourRevenue = tourRevenues.reduce((sum, val) => sum + val, 0);
    const totalRevenue = totalRentalRevenue + totalTourRevenue;
    
    // Calculate growth (comparing last two months if available)
    let growth = 0;
    if (sortedMonths.length >= 2) {
      const lastMonth = revenueData.monthly[sortedMonths[sortedMonths.length - 1]];
      const previousMonth = revenueData.monthly[sortedMonths[sortedMonths.length - 2]];
      
      const lastTotal = lastMonth.rentals + lastMonth.tours;
      const prevTotal = previousMonth.rentals + previousMonth.tours;
      
      if (prevTotal > 0) {
        growth = ((lastTotal - prevTotal) / prevTotal) * 100;
      }
    }

    // Format data for Line chart
    const chartData = {
      labels,
      datasets: [
        {
          label: t('admin.dashboard.rentalRevenue'),
          data: rentalRevenues,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.3,
          fill: true,
        },
        {
          label: t('admin.dashboard.tourRevenue'),
          data: tourRevenues,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.3,
          fill: true,
        },
      ],
    };

    return {
      chartData,
      totalRevenue,
      totalRentalRevenue,
      totalTourRevenue,
      growth,
    };
  };

  const revenueChartData = prepareChartData();

  // Chart options
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: t('admin.dashboard.revenueComparison'),
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        ticks: {
          callback: function(value) {
            return '$' + value.toLocaleString();
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">{t('admin.dashboard.revenueAnalytics')}</h2>
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-80 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">{t('admin.dashboard.revenueAnalytics')}</h2>
          <DateRangeFilter
            onDateRangeChange={handleDateRangeChange}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
        </div>
        <div className="p-4 text-center">
          <p className="text-red-500">{error}</p>
          <button 
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => dispatch(fetchRevenueData(dateRange))}
          >
            {t('common.reset')}
          </button>
        </div>
      </div>
    );
  }

  if (!revenueChartData) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">{t('admin.dashboard.revenueAnalytics')}</h2>
          <DateRangeFilter
            onDateRangeChange={handleDateRangeChange}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
          />
        </div>
        <div className="text-center p-8">
          <p className="text-gray-500">{t('admin.dashboard.noDataAvailable', 'No revenue data available for the selected period')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">{t('admin.dashboard.revenueAnalytics')}</h2>
        <DateRangeFilter
          onDateRangeChange={handleDateRangeChange}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
      </div>
      
      {/* Revenue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">{t('admin.dashboard.totalRevenue')}</p>
          <p className="text-3xl font-bold">
            ${revenueChartData.totalRevenue.toLocaleString()}
          </p>
          <div className={`text-sm mt-2 ${revenueChartData.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <span>{revenueChartData.growth >= 0 ? '↑' : '↓'} {Math.abs(revenueChartData.growth).toFixed(1)}%</span> {t('admin.dashboard.periodGrowth')}
          </div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500">
          <p className="text-sm text-gray-500">{t('admin.dashboard.rentalRevenue')}</p>
          <p className="text-3xl font-bold">
            ${revenueChartData.totalRentalRevenue.toLocaleString()}
          </p>
          <div className="text-sm text-gray-600 mt-2">
            {Math.round((revenueChartData.totalRentalRevenue / revenueChartData.totalRevenue) * 100)}% {t('admin.dashboard.ofTotal')}
          </div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
          <p className="text-sm text-gray-500">{t('admin.dashboard.tourRevenue')}</p>
          <p className="text-3xl font-bold">
            ${revenueChartData.totalTourRevenue.toLocaleString()}
          </p>
          <div className="text-sm text-gray-600 mt-2">
            {Math.round((revenueChartData.totalTourRevenue / revenueChartData.totalRevenue) * 100)}% {t('admin.dashboard.ofTotal')}
          </div>
        </div>
      </div>
      
      {/* Revenue Chart */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <Line data={revenueChartData.chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default RevenueChart;