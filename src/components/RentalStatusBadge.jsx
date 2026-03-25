import React from 'react';
import { Badge } from './ui/badge';

const RentalStatusBadge = ({ rental, className = '' }) => {
  // Get current time in Africa/Casablanca timezone
  const getCasablancaTime = () => {
    return new Date(new Date().toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
  };

  const getStatusConfig = (rental) => {
    if (!rental) {
      return {
        label: 'Unknown',
        variant: 'outline',
        className: 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      };
    }

    const status = rental.rental_status || rental.status;
    const now = getCasablancaTime();
    const startTime = new Date(rental.rental_start_date || rental.start_date);
    const endTime = new Date(rental.rental_end_date || rental.end_date);

    // Determine actual status based on time and current status
    let actualStatus = status;
    let isOverdue = false;

    if (now < startTime) {
      // Before start time
      actualStatus = 'reserved';
    } else if (now >= startTime && now < endTime) {
      // Between start and end time
      if (status === 'active' || status === 'rented' || status === 'ongoing') {
        actualStatus = 'active';
      } else if (status === 'scheduled') {
        actualStatus = 'reserved';
      }
    } else if (now >= endTime) {
      // After end time
      if (status === 'completed') {
        actualStatus = 'completed';
      } else {
        actualStatus = 'overdue';
        isOverdue = true;
      }
    }

    switch (actualStatus) {
      case 'active':
      case 'rented':
      case 'ongoing':
        return {
          label: 'Active',
          variant: 'secondary',
          className: 'bg-green-100 text-green-800 hover:bg-green-200'
        };
      case 'completed':
        return {
          label: 'Completed',
          variant: 'default',
          className: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          variant: 'destructive',
          className: 'bg-red-100 text-red-800 hover:bg-red-200'
        };
      case 'overdue':
        return {
          label: 'Overdue',
          variant: 'destructive',
          className: 'bg-red-100 text-red-800 hover:bg-red-200 animate-pulse'
        };
      case 'reserved':
      case 'scheduled':
        return {
          label: 'Reserved',
          variant: 'outline',
          className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
        };
      case 'confirmed':
        return {
          label: 'Confirmed',
          variant: 'default',
          className: 'bg-green-100 text-green-800 hover:bg-green-200'
        };
      default:
        return {
          label: status || 'Unknown',
          variant: 'outline',
          className: 'bg-gray-100 text-gray-800 hover:bg-gray-200'
        };
    }
  };

  const config = getStatusConfig(rental);

  return (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${className}`}
    >
      {config.label}
    </Badge>
  );
};

export default RentalStatusBadge;