import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const FinanceKPICard = ({ 
  title, 
  value, 
  previousValue, 
  currency = 'MAD', 
  format = 'currency',
  className = '',
  icon: Icon,
  loading = false 
}) => {
  const formatValue = (val) => {
    if (loading) return '...';
    if (val === null || val === undefined) return 'N/A';
    
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('fr-MA', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(val);
      case 'percentage':
        return `${val.toFixed(1)}%`;
      case 'number':
        return new Intl.NumberFormat('fr-MA').format(val);
      default:
        return val.toString();
    }
  };

  const calculateChange = () => {
    if (!previousValue || previousValue === 0 || loading) return null;
    return ((value - previousValue) / previousValue) * 100;
  };

  const change = calculateChange();
  const isPositive = change > 0;
  const isNegative = change < 0;

  const getTrendIcon = () => {
    if (isPositive) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (isNegative) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getTrendColor = () => {
    if (isPositive) return 'text-green-600';
    if (isNegative) return 'text-red-600';
    return 'text-gray-400';
  };

  return (
    <Card className={`${className} ${loading ? 'animate-pulse' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">
          {formatValue(value)}
        </div>
        {change !== null && (
          <div className={`flex items-center space-x-1 text-xs ${getTrendColor()}`}>
            {getTrendIcon()}
            <span>
              {Math.abs(change).toFixed(1)}% from previous period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FinanceKPICard;