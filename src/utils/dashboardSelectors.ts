// Re-export canonical calculations for dashboard
export {
  formatDateStr,
  getSortedWeightEntries,
  getWeightSparklineData,
  getRelativeTimeString
} from './fitnessCalculations';

export type { SparklineData } from './fitnessCalculations';

export interface BodyWeightSparklinePoint {
  date: string;
  weight: number;
  x: number;
  y: number;
}

export function parseCalendarDateDayNumber(dateStr: string): number | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

/**
 * Computes proportional x/y coordinates for body weight sparkline entries.
 * Uses integer UTC calendar day arithmetic so DST / local timezone shifts
 * never distort elapsed-day spacing.
 */
export function computeBodyWeightSparklinePoints(
  entries: [string, number][],
  min: number,
  safeRange: number
): BodyWeightSparklinePoint[] {
  if (entries.length === 0) return [];
  if (entries.length === 1) {
    const [date, weight] = entries[0];
    return [{
      date,
      weight,
      x: 50,
      y: 16
    }];
  }

  const effectiveRange = safeRange > 0 ? safeRange : 1;
  const dayNumbers = entries.map(([date]) => parseCalendarDateDayNumber(date));
  const allValidDays = dayNumbers.every((d): d is number => d !== null);
  const firstDay = allValidDays ? dayNumbers[0]! : 0;
  const lastDay = allValidDays ? dayNumbers[dayNumbers.length - 1]! : entries.length - 1;
  const totalSpanDays = lastDay - firstDay;

  return entries.map(([date, weight], idx) => {
    const x =
      allValidDays && totalSpanDays > 0
        ? ((dayNumbers[idx]! - firstDay) / totalSpanDays) * 100
        : (idx / (entries.length - 1)) * 100;
    const y = 32 - ((weight - min) / effectiveRange) * 28;
    return { date, weight, x, y };
  });
}
