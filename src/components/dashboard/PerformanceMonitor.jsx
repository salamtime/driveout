import { useEffect } from 'react';

const PerformanceMonitor = ({ componentName }) => {
  useEffect(() => {
    // Measure component mount time
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      console.log(`${componentName} rendered in ${endTime - startTime} milliseconds`);
    };
  }, [componentName]);

  useEffect(() => {
    // Monitor Core Web Vitals
    if ('web-vitals' in window) {
      import('web-vitals').then(({ getFCP, getLCP, getCLS, getFID, getTTFB }) => {
        getFCP(console.log);
        getLCP(console.log);
        getCLS(console.log);
        getFID(console.log);
        getTTFB(console.log);
      });
    }
  }, []);

  return null;
};

export default PerformanceMonitor;