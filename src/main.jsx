import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App.jsx'
import './index.css'
import './i18n'
import './utils/navigationTracker' // Navigation tracking for debugging
import { Toaster } from 'react-hot-toast'

const ACTIVE_BUILD_KEY = 'saharax-active-build';
const BUILD_REFRESH_KEY = 'saharax-build-refresh-once';
const CURRENT_BUILD_STAMP = (() => {
  try {
    return new URL(import.meta.url).pathname;
  } catch {
    return `build-${Date.now()}`;
  }
})();

async function reconcileClientBuild() {
  if (typeof window === 'undefined') return;

  const previousBuildStamp = window.localStorage.getItem(ACTIVE_BUILD_KEY);
  const hasBuildChanged = previousBuildStamp && previousBuildStamp !== CURRENT_BUILD_STAMP;
  const hasAlreadyRefreshedThisBuild =
    window.sessionStorage.getItem(BUILD_REFRESH_KEY) === CURRENT_BUILD_STAMP;

  window.localStorage.setItem(ACTIVE_BUILD_KEY, CURRENT_BUILD_STAMP);

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch (error) {
      console.warn('Unable to unregister stale service workers:', error);
    }
  }

  if ('caches' in window) {
    try {
      const cacheKeys = await window.caches.keys();
      if (cacheKeys.length > 0) {
        await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
      }
    } catch (error) {
      console.warn('Unable to clear stale browser caches:', error);
    }
  }

  if (hasBuildChanged && !hasAlreadyRefreshedThisBuild) {
    window.sessionStorage.setItem(BUILD_REFRESH_KEY, CURRENT_BUILD_STAMP);
    window.location.reload();
    return;
  }

  window.sessionStorage.removeItem(BUILD_REFRESH_KEY);
}

async function bootstrapApp() {
  await reconcileClientBuild();

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              theme: {
                primary: '#4aed88',
              },
            },
            error: {
              duration: 5000,
            },
          }}
        />
      </Provider>
    </React.StrictMode>,
  );
}

bootstrapApp();
