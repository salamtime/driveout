import React from 'react';
import { Badge } from './ui/badge';
import i18n from '../i18n';
import { deriveEffectiveRentalStatus } from '../utils/rentalLifecycle';

const RentalStatusBadge = ({ rental, className = '' }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  // Get current time in Africa/Casablanca timezone
  const getCasablancaTime = () => {
    return new Date(new Date().toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
  };

  const getStatusConfig = (rental) => {
    if (!rental) {
      return {
        label: tr('Unknown', 'Inconnu'),
        variant: 'outline',
        className: 'bg-gray-100 text-gray-800 hover:bg-gray-200'
      };
    }

    const status = deriveEffectiveRentalStatus(rental);
    const now = getCasablancaTime();
    const startTime = new Date(rental.rental_start_date || rental.start_date);
    const endTime = new Date(rental.rental_end_date || rental.end_date);

    // Determine actual status based on time and current status
    let actualStatus = status;
    let isOverdue = false;

    if (status === 'impounded') {
      actualStatus = 'impounded';
    } else if (now < startTime) {
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
          label: tr('Active', 'Actif'),
          variant: 'secondary',
          className: 'bg-green-100 text-green-800 hover:bg-green-200'
        };
      case 'completed':
        return {
          label: tr('Completed', 'Terminée'),
          variant: 'default',
          className: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
        };
      case 'impounded':
        return {
          label: tr('Impounded', 'Mis en fourrière'),
          variant: 'default',
          className: 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        };
      case 'cancelled':
        return {
          label: tr('Cancelled', 'Annulée'),
          variant: 'destructive',
          className: 'bg-red-100 text-red-800 hover:bg-red-200'
        };
      case 'overdue':
        return {
          label: tr('Overdue', 'En retard'),
          variant: 'destructive',
          className: 'bg-red-100 text-red-800 hover:bg-red-200 animate-pulse'
        };
      case 'reserved':
      case 'scheduled':
        return {
          label: tr('Reserved', 'Réservée'),
          variant: 'outline',
          className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
        };
      case 'confirmed':
        return {
          label: tr('Confirmed', 'Confirmée'),
          variant: 'default',
          className: 'bg-green-100 text-green-800 hover:bg-green-200'
        };
      default:
        return {
          label: status || tr('Unknown', 'Inconnu'),
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
