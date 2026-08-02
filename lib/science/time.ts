/**
 * The platform clock. Julian Day is the canonical instant: unlike a day-of-year it is
 * continuous across years, which the moon and the planets both require.
 *
 * Angles elsewhere in this module are documented per function. Times here are always UTC;
 * AstroLab makes no attempt to model local civil time, time zones, or daylight saving.
 */

/** Julian Day of the J2000 epoch: 2000-01-01 12:00 UTC. */
export const J2000_JULIAN_DAY = 2451545;
/** Julian Day of the Unix epoch: 1970-01-01 00:00 UTC. */
export const UNIX_EPOCH_JULIAN_DAY = 2440587.5;

const MS_PER_DAY = 86400000;

export function julianDayFromDate(date: Date) {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY;
}

export function dateFromJulianDay(julianDay: number) {
  return new Date(Math.round((julianDay - UNIX_EPOCH_JULIAN_DAY) * MS_PER_DAY));
}

/** Days since the J2000 epoch, the offset most ephemeris code counts in. */
export function j2000DaysFromJulianDay(julianDay: number) {
  return julianDay - J2000_JULIAN_DAY;
}

export function julianDayFromJ2000Days(days: number) {
  return days + J2000_JULIAN_DAY;
}

export function julianDayFromUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  return julianDayFromDate(new Date(Date.UTC(year, month - 1, day, hour, minute, second)));
}

export function utcYear(julianDay: number) {
  return dateFromJulianDay(julianDay).getUTCFullYear();
}

/**
 * Day of year, 1 on 1 January. The solar-sphere model's 1–365 clock reads this, so the two
 * models can share one instant even though only one of them needs a full calendar.
 */
export function dayOfYearFromJulianDay(julianDay: number) {
  const date = dateFromJulianDay(julianDay);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  return (date.getTime() - startOfYear) / MS_PER_DAY + 1;
}

export function julianDayForDayOfYear(year: number, dayOfYear: number) {
  return julianDayFromUtc(year, 1, 1) + (dayOfYear - 1);
}

export function formatUtcDate(julianDay: number) {
  const date = dateFromJulianDay(julianDay);
  return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

export function formatUtcDateTime(julianDay: number) {
  const date = dateFromJulianDay(julianDay);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatUtcDate(julianDay)} ${hour}:${minute} UTC`;
}
