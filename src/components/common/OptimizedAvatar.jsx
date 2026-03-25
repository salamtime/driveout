import React, { useState, useEffect, useRef } from 'react';
import { createAvatarDataURL, loadImageWithCache, createImageObserver } from '../../utils/imageUtils';

/**
 * Optimized Avatar Component
 * - Uses base64 data URLs to eliminate HTTP requests for placeholders
 * - Implements image caching to prevent repeated requests
 * - Supports lazy loading for performance
 * - Generates colored initials as fallback
 * - Prevents infinite loading loops
 */
const OptimizedAvatar = ({ 
  src, 
  name = '', 
  size = 40, 
  className = '', 
  lazy = false,
  onClick = null 
}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Generate fallback avatar with initials
  const fallbackSrc = createAvatarDataURL(name);

  // Load image with caching
  const loadImage = async (imageUrl) => {
    if (!imageUrl || hasError) return;
    
    setIsLoading(true);
    try {
      const loadedSrc = await loadImageWithCache(imageUrl, fallbackSrc);
      setImageSrc(loadedSrc);
      setHasError(loadedSrc === fallbackSrc && imageUrl !== fallbackSrc);
    } catch (error) {
      console.warn('Avatar image failed to load:', imageUrl, error);
      setImageSrc(fallbackSrc);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle lazy loading
  useEffect(() => {
    if (!lazy || !imgRef.current) {
      if (src) {
        loadImage(src);
      } else {
        setImageSrc(fallbackSrc);
      }
      return;
    }

    // Set up intersection observer for lazy loading
    observerRef.current = createImageObserver((target) => {
      if (src) {
        loadImage(src);
      } else {
        setImageSrc(fallbackSrc);
      }
      observerRef.current?.unobserve(target);
    });

    if (observerRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [src, lazy, fallbackSrc]);

  // Update when src changes
  useEffect(() => {
    if (!lazy && src !== imageSrc) {
      setHasError(false);
      if (src) {
        loadImage(src);
      } else {
        setImageSrc(fallbackSrc);
      }
    }
  }, [src, lazy]);

  // Set initial fallback if no src provided
  useEffect(() => {
    if (!src && !imageSrc) {
      setImageSrc(fallbackSrc);
    }
  }, [src, imageSrc, fallbackSrc]);

  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size
  };

  return (
    <div 
      ref={imgRef}
      className={`relative inline-block rounded-full overflow-hidden bg-gray-200 ${className}`}
      style={avatarStyle}
      onClick={onClick}
    >
      {isLoading && !imageSrc ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <div className="animate-pulse bg-gray-300 w-full h-full rounded-full"></div>
        </div>
      ) : (
        <img
          src={imageSrc || fallbackSrc}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover rounded-full"
          style={avatarStyle}
          loading={lazy ? 'lazy' : 'eager'}
          onError={(e) => {
            // Prevent infinite loops by only setting fallback if not already using it
            if (e.target.src !== fallbackSrc) {
              console.warn('Avatar image error, using fallback:', src);
              setImageSrc(fallbackSrc);
              setHasError(true);
            }
          }}
        />
      )}
    </div>
  );
};

export default OptimizedAvatar;