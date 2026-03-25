// Image utility functions for optimizing avatar and placeholder images

// Base64 encoded 1x1 pixel transparent placeholder to eliminate HTTP requests
export const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Base64 encoded default avatar SVG to eliminate HTTP requests
export const DEFAULT_AVATAR_SVG = `data:image/svg+xml;base64,${btoa(`
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="20" fill="#E5E7EB"/>
  <circle cx="20" cy="16" r="6" fill="#9CA3AF"/>
  <path d="M8 32c0-6.627 5.373-12 12-12s12 5.373 12 12" fill="#9CA3AF"/>
</svg>
`)}`;

// Cache for loaded images to prevent repeated requests
const imageCache = new Map();
const loadingImages = new Set();

// Optimized image loader with caching and error handling
export const loadImageWithCache = (src, fallback = DEFAULT_AVATAR_SVG) => {
  return new Promise((resolve) => {
    // Return cached result immediately
    if (imageCache.has(src)) {
      resolve(imageCache.get(src));
      return;
    }

    // If already loading, wait for the existing request
    if (loadingImages.has(src)) {
      const checkCache = () => {
        if (imageCache.has(src)) {
          resolve(imageCache.get(src));
        } else {
          setTimeout(checkCache, 10);
        }
      };
      checkCache();
      return;
    }

    // Mark as loading
    loadingImages.add(src);

    const img = new Image();
    
    img.onload = () => {
      imageCache.set(src, src);
      loadingImages.delete(src);
      resolve(src);
    };
    
    img.onerror = () => {
      imageCache.set(src, fallback);
      loadingImages.delete(src);
      resolve(fallback);
    };
    
    img.src = src;
  });
};

// Generate avatar initials from name
export const generateAvatarInitials = (name) => {
  if (!name) return 'U';
  
  const words = name.trim().split(' ');
  if (words.length === 1) {
    return words[0][0]?.toUpperCase() || 'U';
  }
  
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

// Generate colored avatar background based on name
export const getAvatarColor = (name) => {
  if (!name) return '#E5E7EB';
  
  const colors = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308',
    '#84CC16', '#22C55E', '#10B981', '#14B8A6',
    '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7', '#D946EF', '#EC4899'
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

// Create avatar data URL with initials and color
export const createAvatarDataURL = (name) => {
  const initials = generateAvatarInitials(name);
  const color = getAvatarColor(name);
  
  const svg = `
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" fill="${color}"/>
      <text x="20" y="26" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">${initials}</text>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Debounce function to prevent excessive image loading
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Lazy loading observer for images
export const createImageObserver = (callback) => {
  if (!window.IntersectionObserver) {
    return null;
  }
  
  return new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback(entry.target);
      }
    });
  }, {
    rootMargin: '50px'
  });
};