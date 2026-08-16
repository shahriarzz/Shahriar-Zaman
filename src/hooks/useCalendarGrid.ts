import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
  startOfDay,
  format
} from 'date-fns';
import { SessionLog, Workout } from '../types/fitness';
import { FitnessIndex } from '../utils/fitnessDerivedSelectors';

export interface DayDetail {
  workoutNames: string[];
  workoutIds: string[];
  volume: number;
  doneSets: number;
  totalSets: number;
  isComplete: boolean;
  logs: SessionLog[];
}

export interface UseCalendarGridOptions {
  monthDate: Date;
  index: FitnessIndex;
  workoutMap: Map<string, Workout>;
  weekStartsOn?: 0 | 1;
}

export interface UseCalendarGridResult {
  monthStart: Date;
  monthEnd: Date;
  startDate: Date;
  endDate: Date;
  days: Date[];
  logsByDateMap: Map<string, SessionLog>;
  logVolMap: Record<string, number>;
  dayDetailMap: Record<string, DayDetail>;
  maxDayVol: number;
  isCurrentMonth: (date: Date) => boolean;
  isToday: (date: Date) => boolean;
  isFuture: (date: Date) => boolean;
}

export function useCalendarGrid({
  monthDate,
  index,
  workoutMap,
  weekStartsOn = 0
}: UseCalendarGridOptions): UseCalendarGridResult {
  // 1. Compute calendar grid interval and days
  const { monthStart, monthEnd, startDate, endDate, days } = useMemo(() => {
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(mStart);
    const sDate = startOfWeek(mStart, { weekStartsOn });
    const eDate = endOfWeek(mEnd, { weekStartsOn });
    const dList = eachDayOfInterval({ start: sDate, end: eDate });
    return {
      monthStart: mStart,
      monthEnd: mEnd,
      startDate: sDate,
      endDate: eDate,
      days: dList
    };
  }, [monthDate, weekStartsOn]);

  // 2. Map logs by date and extract per-day volume & detail directly from the canonical index
  const { logsByDateMap, logVolMap, dayDetailMap, maxDayVol } = useMemo(() => {
    const dateMap = new Map<string, SessionLog>();
    const volMap: Record<string, number> = index.volumeByDate || {};
    const detailMap: Record<string, DayDetail> = {};

    // Populate dateMap and detailMap from index.logsByDate
    index.logsByDate.forEach((logsForDate, dateStr) => {
      if (!logsForDate || logsForDate.length === 0) return;
      const primaryLog = logsForDate[0];
      dateMap.set(dateStr, primaryLog);
      if (primaryLog.id) {
        dateMap.set(primaryLog.id, primaryLog);
        if (primaryLog.id.length >= 10) {
          dateMap.set(primaryLog.id.slice(0, 10), primaryLog);
        }
      }

      const workoutNames: string[] = [];
      const workoutIds: string[] = [];
      let isComplete = true;

      logsForDate.forEach(l => {
        const wo = workoutMap.get(l.workoutId);
        workoutNames.push(wo?.name || 'Session');
        workoutIds.push(l.workoutId);
        if (!l.complete) isComplete = false;
      });

      const dayVol = volMap[dateStr] || 0;
      const doneSets = index.setsByDate[dateStr] || 0;
      const totalSets = index.totalSetsByDate ? (index.totalSetsByDate[dateStr] || doneSets) : doneSets;

      detailMap[dateStr] = {
        workoutNames,
        workoutIds,
        volume: dayVol,
        doneSets,
        totalSets: Math.max(totalSets, doneSets),
        isComplete,
        logs: logsForDate
      };
    });

    // Compute max single-day volume within this month for normalized heatmap intensity
    let maxVol = 1;
    days.forEach(day => {
      if (isSameMonth(day, monthStart)) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayVol = volMap[dateStr] || 0;
        if (dayVol > maxVol) {
          maxVol = dayVol;
        }
      }
    });

    return {
      logsByDateMap: dateMap,
      logVolMap: volMap,
      dayDetailMap: detailMap,
      maxDayVol: maxVol
    };
  }, [index, workoutMap, days, monthStart]);

  const isCurrentMonth = useMemo(() => (d: Date) => isSameMonth(d, monthStart), [monthStart]);
  const isToday = useMemo(() => (d: Date) => isSameDay(d, new Date()), []);
  const isFuture = useMemo(() => (d: Date) => isAfter(startOfDay(d), startOfDay(new Date())), []);

  return {
    monthStart,
    monthEnd,
    startDate,
    endDate,
    days,
    logsByDateMap,
    logVolMap,
    dayDetailMap,
    maxDayVol,
    isCurrentMonth,
    isToday,
    isFuture
  };
}
