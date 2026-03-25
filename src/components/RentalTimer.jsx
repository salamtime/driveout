import React, { useState, useEffect } from 'react';

/**
 * RentalTimer - Live timer for rentals with proper status handling
 * Shows countdown to start, elapsed time during rental, or time until end
 * Uses Africa/Casablanca timezone for all calculations
 */
const RentalTimer = ({ rental, className = '' }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Get current time in Africa/Casablanca timezone
  const getCasablancaTime = () => {
    return new Date(new Date().toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
  };

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      setCurrentTime(getCasablancaTime());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.abs(Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else {
      return `${minutes}m ${seconds}s`;
    }
  };

  const getTimerInfo = () => {
    if (!rental) return null;

    const now = currentTime;
    const startTime = new Date(rental.rental_start_date || rental.start_date);
    const endTime = new Date(rental.rental_end_date || rental.end_date);
    const status = rental.rental_status || rental.status;

    // Before start time - show countdown to start
    if (now < startTime) {
      const timeUntilStart = startTime.getTime() - now.getTime();
      return {
        label: 'Starts in',
        time: formatTime(timeUntilStart),
        color: 'text-blue-600',
        bgColor: 'bg-blue-500',
        isCountdown: true
      };
    }

    // Between start and end time
    if (now >= startTime && now < endTime) {
      if (status === 'active' || status === 'rented' || status === 'ongoing') {
        // Active rental - show elapsed time
        const elapsedTime = now.getTime() - startTime.getTime();
        return {
          label: 'Active for',
          time: formatTime(elapsedTime),
          color: 'text-green-600',
          bgColor: 'bg-green-500',
          isActive: true
        };
      } else if (status === 'scheduled') {
        // Scheduled but not started - show time until end
        const timeUntilEnd = endTime.getTime() - now.getTime();
        return {
          label: 'Reserved, ends in',
          time: formatTime(timeUntilEnd),
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-500',
          isReserved: true
        };
      }
    }

    // After end time
    if (now >= endTime) {
      if (status === 'completed') {
        return {
          label: 'Completed',
          time: formatTime(now.getTime() - endTime.getTime()) + ' ago',
          color: 'text-gray-600',
          bgColor: 'bg-gray-500',
          isCompleted: true
        };
      } else {
        // Overdue
        const overdueTime = now.getTime() - endTime.getTime();
        return {
          label: 'Overdue by',
          time: formatTime(overdueTime),
          color: 'text-red-600',
          bgColor: 'bg-red-500',
          isOverdue: true
        };
      }
    }

    return null;
  };

  const timerInfo = getTimerInfo();

  if (!timerInfo) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${timerInfo.isActive ? 'animate-pulse' : ''} ${timerInfo.bgColor}`}></div>
      <span className={`font-mono text-sm font-medium ${timerInfo.color}`}>
        {timerInfo.time}
      </span>
      <span className="text-xs text-gray-600">{timerInfo.label}</span>
    </div>
  );
};

export default RentalTimer;