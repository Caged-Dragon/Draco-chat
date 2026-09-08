import { useEffect, useState } from 'react';

// Returns the live window width, updating on resize/orientation change.
// Used where we want sizing decisions driven by the actual measured
// screen — guaranteed to apply via inline styles, which always win
// over stylesheet rules regardless of CSS cascade/ordering issues.
export function useViewportWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return width;
}

// Breakpoints used across the app for JS-driven sizing decisions.
export const BREAKPOINTS = {
  small: 400, // very narrow phones
  mobile: 640, // phones
  tablet: 900, // tablets / small laptops
};

export function getDeviceClass(width) {
  if (width <= BREAKPOINTS.small) return 'small';
  if (width <= BREAKPOINTS.mobile) return 'mobile';
  if (width <= BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}
