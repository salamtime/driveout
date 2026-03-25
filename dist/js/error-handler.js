// Error handler for browser extension conflicts
(function() {
  'use strict';
  
  // Global error handler
  window.addEventListener('error', function(event) {
    // Filter out extension-related errors
    if (event.error && event.error.message && 
        (event.error.message.includes('Cannot redefine property') ||
         event.error.message.includes('ethereum') ||
         event.filename && event.filename.includes('chrome-extension'))) {
      console.warn('Browser extension error filtered:', event.error.message);
      event.preventDefault();
      return false;
    }
  });
  
  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && 
        (event.reason.message.includes('Cannot redefine property') ||
         event.reason.message.includes('ethereum'))) {
      console.warn('Browser extension promise rejection filtered:', event.reason.message);
      event.preventDefault();
    }
  });
  
  console.log('Extension conflict error handler loaded');
})();