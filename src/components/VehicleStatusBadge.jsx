import React from 'react';
import { Clock, Calendar, Wrench, CheckCircle, XCircle } from 'lucide-react';

// FIXED: Simple status constants instead of importing broken service
const VEHICLE_STATUS = {
  AVAILABLE: 'available',
  SCHEDULED: 'scheduled', 
  RENTED: 'rented',
  TOUR: 'tour',
  MAINTENANCE: 'maintenance',
  OUT_OF_SERVICE: 'out_of_service'
};

/**
 * VehicleStatusBadge - Displays derived vehicle status with appropriate styling
 * @param {Object} props
 * @param {string} props.status - Vehicle status (available, scheduled, rented, maintenance, out_of_service)
 * @param {string} props.size - Badge size (sm, md, lg)
 * @param {boolean} props.showIcon - Whether to show status icon
 * @param {string} props.className - Additional CSS classes
 */
const VehicleStatusBadge = ({ 
  status, 
  size = 'md', 
  showIcon = true, 
  className = '' 
}) => {
  const getStatusConfig = (status) => {
    const normalizedStatus = (status || '').toLowerCase();
    
    switch (normalizedStatus) {
      case VEHICLE_STATUS.AVAILABLE:
      case 'available':
        return {
          label: 'Available',
          icon: CheckCircle,
          className: 'bg-green-100 text-green-800 border-green-200'
        };
      case VEHICLE_STATUS.SCHEDULED:
      case 'scheduled':
        return {
          label: 'Scheduled',
          icon: Calendar,
          className: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case VEHICLE_STATUS.RENTED:
      case 'rented':
        return {
          label: 'Rented',
          icon: Clock,
          className: 'bg-orange-100 text-orange-800 border-orange-200'
        };
      case VEHICLE_STATUS.TOUR:
      case 'tour':
        return {
          label: 'Tour',
          icon: Calendar,
          className: 'bg-violet-100 text-violet-800 border-violet-200'
        };
      case VEHICLE_STATUS.MAINTENANCE:
      case 'maintenance':
      case 'service':
      case 'in service':
        return {
          label: 'Maintenance',
          icon: Wrench,
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
      case VEHICLE_STATUS.OUT_OF_SERVICE:
      case 'out_of_service':
      case 'out of service':
      case 'out of order':
        return {
          label: 'Out of Service',
          icon: XCircle,
          className: 'bg-red-100 text-red-800 border-red-200'
        };
      default:
        return {
          label: status || 'Unknown',
          icon: CheckCircle,
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
    }
  };

  const getSizeClasses = (size) => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-3 py-1 text-sm';
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;
  const sizeClasses = getSizeClasses(size);

  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${config.className} 
        ${sizeClasses}
        ${className}
      `}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </span>
  );
};

export default VehicleStatusBadge;
