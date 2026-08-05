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
import { SessionLog, SetLog, Workout } from '../types/fitness';
import { calculateVolume } from '../utils/fitnessHelpers';

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
  logs?: Record<string, SessionLog> | null;
  workouts?: Workout[] | null;
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
  logs = {},
  workouts = [],
  weekStartsOn = 0
}: UseCalendarGridOptions): UseCalendarGridResult {
  // 1. Build fast workout lookup map
  const workoutMap = useMemo(() => {
    const map = new Map<string, Workout>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  // 2. Compute calendar grid interval and days
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

  // 3. Map logs by date and calculate per-day volume & detail
  const { logsByDateMap, logVolMap, dayDetailMap, maxDayVol } = useMemo(() => {
    const dateMap = new Map<string, SessionLog>();
    const volMap: Record<string, number> = {};
    const detailMap: Record<string, DayDetail> = {};

    (Object.values(logs || {}) as SessionLog[]).forEach(l => {
      if (!l || !l.date) return;

      // Register in date map (latest or primary log for this date)
      dateMap.set(l.date, l);
      if (l.id) {
        dateMap.set(l.id, l);
        if (l.id.length >= 10) {
          dateMap.set(l.id.slice(0, 10), l);
        }
      }

      const vol = calculateVolume(l);
      volMap[l.date] = (volMap[l.date] || 0) + vol;

      const wo = workoutMap.get(l.workoutId);
      const woName = wo?.name || 'Session';

      let doneSetsCount = 0;
      let totalSetsCount = 0;
      if (l.sets) {
        Object.values(l.sets).forEach(sList => {
          const setsArr = (sList as SetLog[]) || [];
          totalSetsCount += setsArr.length;
          doneSetsCount += setsArr.filter(s => s.done).length;
        });
      }

      if (!detailMap[l.date]) {
        detailMap[l.date] = {
          workoutNames: [woName],
          workoutIds: [l.workoutId],
          volume: vol,
          doneSets: doneSetsCount,
          totalSets: totalSetsCount,
          isComplete: l.complete,
          logs: [l]
        };
      } else {
        detailMap[l.date].workoutNames.push(woName);
        detailMap[l.date].workoutIds.push(l.workoutId);
        detailMap[l.date].volume += vol;
        detailMap[l.date].doneSets += doneSetsCount;
        detailMap[l.date].totalSets += totalSetsCount;
        detailMap[l.date].isComplete = detailMap[l.date].isComplete && l.complete;
        detailMap[l.date].logs.push(l);
      }
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
  }, [logs, workoutMap, days, monthStart]);

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
