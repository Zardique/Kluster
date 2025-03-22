import { useState, useEffect } from 'react';

// Hook to detect if the user is on a mobile device
export const useDeviceDetect = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    // Function to detect if the user is on a mobile device
    const checkMobile = () => {
      const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      
      // Check for mobile device via user agent
      const isMobileDevice = mobileRegex.test(userAgent);
      
      // Also check screen size for tablets and small devices
      const isSmallScreen = window.innerWidth <= 768;
      
      setIsMobile(isMobileDevice || isSmallScreen);
    };
    
    // Check on mount
    checkMobile();
    
    // Also check when window is resized
    window.addEventListener('resize', checkMobile);
    
    // Clean up event listener
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return { isMobile };
};

export default useDeviceDetect; 