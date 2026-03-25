// ServiceWorker to intercept and modify all Supabase vehicle requests
self.addEventListener('install', event => {
  console.log('🛠️ Vehicle Patch Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('🛠️ Vehicle Patch Service Worker activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Only intercept vehicle-related Supabase requests
  if (url.href.includes('saharax_0u4w4d_vehicles') && 
      (event.request.method === 'PATCH' || event.request.method === 'POST' || event.request.method === 'PUT')) {
    console.log(`🔍 ServiceWorker intercepting ${event.request.method} request to ${url.href}`);
    
    event.respondWith((async () => {
      // Clone the request to read and modify it
      const originalRequest = event.request.clone();
      const originalBody = await originalRequest.text();
      
      try {
        const bodyObj = JSON.parse(originalBody);
        
        // List of problematic fields to remove
        const fieldsToRemove = ['availability', 'brand', 'category', 'brake_maintenance_date'];
        
        // Handle both array and single object cases
        if (Array.isArray(bodyObj)) {
          bodyObj.forEach(item => {
            fieldsToRemove.forEach(field => {
              if (item[field] !== undefined) {
                console.log(`🚫 ServiceWorker removing problematic field from array item: ${field}`);
                delete item[field];
              }
            });
          });
        } else {
          // Remove problematic fields
          fieldsToRemove.forEach(field => {
            if (bodyObj[field] !== undefined) {
              console.log(`🚫 ServiceWorker removing problematic field: ${field}`);
              delete bodyObj[field];
            }
          });
        }
        
        // Create a new request with the modified body
        const modifiedRequest = new Request(originalRequest, {
          body: JSON.stringify(bodyObj),
          method: originalRequest.method,
          headers: originalRequest.headers,
          mode: originalRequest.mode,
          credentials: originalRequest.credentials,
          cache: originalRequest.cache,
          redirect: originalRequest.redirect,
          referrer: originalRequest.referrer
        });
        
        console.log('✅ ServiceWorker sending modified request');
        
        // Forward the modified request
        return fetch(modifiedRequest);
      } catch (error) {
        console.error('⚠️ Error in ServiceWorker:', error);
        // If we can't modify the request, proceed with the original
        return fetch(event.request);
      }
    })());
  }
});