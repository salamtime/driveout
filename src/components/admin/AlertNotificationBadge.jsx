import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectUnreadAlertsCount } from '../../store/slices/alertsSlice';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * A notification badge component that shows unread alert count
 * Used in the admin sidebar to indicate new/unread alerts
 */
const AlertNotificationBadge = ({ className }) => {
  const unreadCount = useSelector(selectUnreadAlertsCount);
  
  // Play a pulse animation when new alerts arrive
  const [playPulse, setPlayPulse] = React.useState(false);
  
  // Track previous count to detect new alerts
  const prevCountRef = React.useRef(unreadCount);
  
  useEffect(() => {
    // If the unread count increased, play the pulse animation
    if (unreadCount > prevCountRef.current) {
      setPlayPulse(true);
      const timer = setTimeout(() => setPlayPulse(false), 2000);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  if (unreadCount === 0) {
    return <Bell className={className} size={18} />;
  }

  return (
    <div className="relative">
      <motion.div
        animate={playPulse ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.4 }}
      >
        <Bell size={18} className={`text-amber-500 ${className || ''}`} />
      </motion.div>
      
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default AlertNotificationBadge;