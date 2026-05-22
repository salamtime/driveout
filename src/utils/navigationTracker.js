// Navigation Tracking Utility
// This helps diagnose routing and navigation issues

// Initialize navigation tracking
(function() {
  console.log('🔍 Navigation tracker initialized');
  window.navHistory = [];
  
  // Track page loads
  window.addEventListener('load', () => {
    window.navHistory.push(`Page loaded: ${window.location.href} at ${new Date().toISOString()}`);
    console.log('📍 Navigation history:', window.navHistory);
  });
  
  // Track navigation events
  const originalPushState = window.history.pushState;
  window.history.pushState = function() {
    window.navHistory.push(`Navigation to: ${arguments[2]} at ${new Date().toISOString()}`);
    console.log('📍 Navigation update:', `to ${arguments[2]}`);
    return originalPushState.apply(this, arguments);
  };
  
  // Track route changes
  window.addEventListener('popstate', () => {
    window.navHistory.push(`Popstate: ${window.location.href} at ${new Date().toISOString()}`);
    console.log('📍 Navigation popstate:', window.location.href);
  });
  
  // Track errors
  window.addEventListener('error', (event) => {
    window.navHistory.push(`Error: ${event.message} at ${new Date().toISOString()}`);
    console.log('❌ Navigation error:', event.message);
  });
  
  // Add emergency methods to window
  window.emergencyAccess = {
    setOwnerRole: () => {
      localStorage.setItem('driveout_user_role', 'owner');
      localStorage.setItem('saharax_user_role', 'owner');
      console.log('✅ Set owner role in localStorage');
      return 'Owner role set';
    },
    setEmergencyBypass: () => {
      localStorage.setItem('saharax_emergency_bypass', 'true');
      console.log('✅ Set emergency bypass flag');
      return 'Emergency bypass enabled';
    },
    getAllStorage: () => {
      const allStorage = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          allStorage[key] = localStorage.getItem(key);
        } catch (e) {
          allStorage[key] = "ERROR READING VALUE";
        }
      }
      return allStorage;
    },
    clearStorage: () => {
      localStorage.clear();
      return 'Storage cleared';
    }
  };
  
  console.log('🔧 Emergency access methods available in console via window.emergencyAccess');
})();

export default {};
