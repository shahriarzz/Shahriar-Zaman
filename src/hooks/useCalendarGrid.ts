import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval
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
  days: Date[];
  logsByDateMap: Map<string, SessionLog>;
  dayDetailMap: Record<string, DayDetail>;
}

export function useCalendarGrid({
  monthDate,
  index,
  workoutMap,
  weekStartsOn = 0
}: UseCalendarGridOptions): UseCalendarGridResult {
  // 1. Compute calendar grid interval and days
  const { monthStart, days } = useMemo(() => {
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(mStart);
    const sDate = startOfWeek(mStart, { weekStartsOn });
    const eDate = endOfWeek(mEnd, { weekStartsOn });
    const dList = eachDayOfInterval({ start: sDate, end: eDate });
    return {
      monthStart: mStart,
      days: dList
    };
  }, [monthDate, weekStartsOn]);

  // 2. Map logs by date and extract per-day detail directly from the canonical index
  const { logsByDateMap, dayDetailMap } = useMemo(() => {
    const dateMap = new Map<string, SessionLog>();
    const volMap: Record<string, number> = index.volumeByDate || {};
    const detailMap: Record<string, DayDetail> = {};

    // Populate dateMap and detailMap from index.logsByDate
    index.logsByDate.forEach((logsForDate, dateStr) => {
      if (!logsForDate || logsForDate.length === 0) return;
      // Derive day status from all logs: completed session exists -> prioritize completed session
      const completedLog = logsForDate.find(l => l && l.complete === true);
      const primaryLog = completedLog || logsForDate[0];
      dateMap.set(dateStr, primaryLog);
      if (primaryLog.id) {
        dateMap.set(primaryLog.id, primaryLog);
        if (primaryLog.id.length >= 10) {
          dateMap.set(primaryLog.id.slice(0, 10), primaryLog);
        }
      }

      const workoutNames: string[] = [];
      const workoutIds: string[] = [];
      const hasCompleted = logsForDate.some(l => l && l.complete === true);

      logsForDate.forEach(l => {
        const wo = workoutMap.get(l.workoutId);
        workoutNames.push(wo?.name || 'Session');
        workoutIds.push(l.workoutId);
      });

      const dayVol = volMap[dateStr] || 0;
      const doneSets = index.completedSetsByDate[dateStr] || 0;
      const totalSets = index.plannedSetsByDate[dateStr] || 0;

      detailMap[dateStr] = {
        workoutNames,
        workoutIds,
        volume: dayVol,
        doneSets,
        totalSets,
        isComplete: hasCompleted,
        logs: logsForDate
      };
    });

    return {
      logsByDateMap: dateMap,
      dayDetailMap: detailMap
    };
  }, [index, workoutMap]);

  return {
    monthStart,
    days,
    logsByDateMap,
    dayDetailMap
  };
}
