import React, { useState, useRef } from 'react';

const TouchGestureHandler = ({ children, onSwipeRight, onSwipeLeft, threshold = 50 }) => {
  const [startX, setStartX] = useState(null);
  const [startY, setStartY] = useState(null);
  const elementRef = useRef(null);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
  };

  const handleTouchEnd = (e) => {
    if (!startX || !startY) return;

    const touch = e.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;

    const deltaX = endX - startX;
    const deltaY = endY - startY;

    // Check if horizontal swipe is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // Swipe right
          onSwipeRight && onSwipeRight();
          // Add visual feedback
          if (elementRef.current) {
            elementRef.current.style.transform = 'translateX(10px)';
            elementRef.current.style.backgroundColor = '#dcfce7';
            setTimeout(() => {
              if (elementRef.current) {
                elementRef.current.style.transform = '';
                elementRef.current.style.backgroundColor = '';
              }
            }, 200);
          }
        } else {
          // Swipe left
          onSwipeLeft && onSwipeLeft();
          // Add visual feedback
          if (elementRef.current) {
            elementRef.current.style.transform = 'translateX(-10px)';
            elementRef.current.style.backgroundColor = '#fee2e2';
            setTimeout(() => {
              if (elementRef.current) {
                elementRef.current.style.transform = '';
                elementRef.current.style.backgroundColor = '';
              }
            }, 200);
          }
        }
      }
    }

    setStartX(null);
    setStartY(null);
  };

  const handleTouchMove = (e) => {
    // Prevent default scrolling during horizontal swipe
    if (startX && startY) {
      const touch = e.touches[0];
      const currentX = touch.clientX;
      const currentY = touch.clientY;
      
      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);
      
      // If horizontal movement is dominant, prevent vertical scrolling
      if (deltaX > deltaY && deltaX > 10) {
        e.preventDefault();
      }
    }
  };

  return (
    <div
      ref={elementRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      style={{ 
        transition: 'transform 0.2s ease, background-color 0.2s ease',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
    >
      {children}
    </div>
  );
};

export default TouchGestureHandler;