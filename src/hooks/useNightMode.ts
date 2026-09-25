import { useState, useEffect } from 'react';
import { detectNightMode } from '../utils/timeDetection';

export function useNightMode() {
  const [isNightMode, setIsNightMode] = useState<boolean>(() => detectNightMode());

  // Tracks whether the user has manually overridden the clock-based default.
  // Once set, the auto-timer stops correcting — the user's choice holds
  // until they toggle again (which keeps hasOverridden true, locking their
  // preference for the rest of the session).
  const [hasOverridden, setHasOverridden] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-sync to clock time if the user has never touched the toggle.
      // If they have, their choice is authoritative — we never revert it.
      if (!hasOverridden) {
        setIsNightMode(detectNightMode());
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [hasOverridden]);

  const toggleNightMode = () => {
    setHasOverridden(true);          // lock out the auto-timer
    setIsNightMode(prev => !prev);
  };

  return { isNightMode, toggleNightMode };
}