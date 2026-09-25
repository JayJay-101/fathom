export const NIGHT_START_HOUR = 20;  // 8pm
export const NIGHT_END_HOUR = 6;     // 6am

export function getTimeOfDay(overrideTime?: Date): {
  hour: number;
  minute: number;
  isNight: boolean;
  timeUntilDay: number;
  timeUntilNight: number;
} {
  const targetTime = overrideTime || new Date();
  const hour = targetTime.getHours();
  const minute = targetTime.getMinutes();

  // Night is between 8 PM (20) and 6 AM (6)
  const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

  const currentMinutes = hour * 60 + minute;
  const nightStartMinutes = NIGHT_START_HOUR * 60;
  const dayStartMinutes = NIGHT_END_HOUR * 60;

  let timeUntilDay = 0;
  let timeUntilNight = 0;

  if (isNight) {
    if (hour >= NIGHT_START_HOUR) {
      // It's before midnight
      timeUntilDay = (24 * 60 - currentMinutes) + dayStartMinutes;
    } else {
      // It's after midnight
      timeUntilDay = dayStartMinutes - currentMinutes;
    }
    // Time until next night is total cycle minus time until day, plus daytime duration
    timeUntilNight = timeUntilDay + (nightStartMinutes - dayStartMinutes);
  } else {
    timeUntilNight = nightStartMinutes - currentMinutes;
    timeUntilDay = timeUntilNight + (24 * 60 - nightStartMinutes) + dayStartMinutes;
  }

  return {
    hour,
    minute,
    isNight,
    timeUntilDay,
    timeUntilNight
  };
}

export function detectNightMode(
  forceNightMode?: boolean,  // If true, ignore time and return true
  overrideTime?: Date        // For testing: provide mock time
): boolean {
  if (forceNightMode === true) {
    return true; // App state / User toggle overrides time
  }
  return getTimeOfDay(overrideTime).isNight;
}

export function getSunsetTime(): Date | null {
  // Dummy placeholder for future geolocation-based sunset calculation
  return null;
}