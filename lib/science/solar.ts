export const TAU = Math.PI * 2;

export type SolarVector = { x: number; y: number; z: number };

export function degrees(value: number) {
  return (value * Math.PI) / 180;
}

export function radians(value: number) {
  return (value * 180) / Math.PI;
}

export function solarDeclination(dayOfYear: number) {
  return degrees(23.44) * Math.sin((TAU * (dayOfYear - 80)) / 365);
}

/** Right-handed horizontal coordinates: x=east, y=north, z=zenith. */
export function sunHorizontal(
  latitude: number,
  declination: number,
  hourAngle: number,
): SolarVector {
  const phi = degrees(latitude);
  return {
    x: -Math.cos(declination) * Math.sin(hourAngle),
    y:
      Math.cos(phi) * Math.sin(declination) -
      Math.sin(phi) * Math.cos(declination) * Math.cos(hourAngle),
    z:
      Math.sin(phi) * Math.sin(declination) +
      Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle),
  };
}

export function horizontalAngles(vector: SolarVector) {
  const altitude = radians(Math.asin(Math.max(-1, Math.min(1, vector.z))));
  let azimuth = radians(Math.atan2(vector.x, vector.y));
  if (azimuth < 0) azimuth += 360;
  return { altitude, azimuth };
}

export function shadowForUnitGnomon(vector: SolarVector) {
  if (vector.z <= 0.001) return null;
  const x = -vector.x / vector.z;
  const y = -vector.y / vector.z;
  let azimuth = radians(Math.atan2(x, y));
  if (azimuth < 0) azimuth += 360;
  return { x, y, length: Math.hypot(x, y), azimuth };
}

export function compassLabel(azimuth: number) {
  const labels = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
  return labels[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}

export function dateFromDay(day: number) {
  const date = new Date(Date.UTC(2025, 0, 1));
  date.setUTCDate(Math.round(day));
  return `${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

export function formatLatitude(value: number) {
  if (Math.abs(value) < 0.01) return "赤道 0°";
  return `${value > 0 ? "北緯" : "南緯"} ${Math.abs(value).toFixed(1)}°`;
}

export function formatTime(value: number) {
  let hour = Math.floor(value) % 24;
  let minute = Math.round((value - hour) * 60);
  if (minute === 60) {
    hour = (hour + 1) % 24;
    minute = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
