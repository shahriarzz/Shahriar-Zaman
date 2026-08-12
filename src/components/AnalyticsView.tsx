import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Trophy,
  Clock,
  Dumbbell,
  Flame,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award
} from 'lucide-react';
import {
  format,
  parseISO,
  subDays,
  addMonths,
  subMonths,
  differenceInCalendarDays,
  isValid,
  startOfWeek,
  startOfDay,
  isSameDay,
  isSameMonth,
  eachDayOfInterval
} from 'date-fns';
import { useFitness } from '../store/FitnessContext';
import { calculateVolume, WORKOUT_COLORS, getCycleDay, getCycleDayForDate } from '../utils/fitnessHelpers';
import { SessionLog, SetLog, Exercise, Workout, WorkoutType } from '../types/fitness';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';
import { useCalendarGrid } from '../hooks/useCalendarGrid';
import {
  Section,
  SectionHeader,
  StatCard,
  AchievementCard,
  EmptyState,
  SegmentedControl,
  Badge,
  Card,
  Button,
  Stack,
  Grid,
  SURFACE,
  BORDER,
  RADIUS,
  SPACING,
  GAP,
  STACK_SPACING,
  TYPOGRAPHY,
  SHADOW,
  SEMANTIC_COLORS
} from './ui';

type TimeRange = '7d' | '30d' | '90d' | 'all';
type MuscleMetric = 'volume' | 'sets' | 'frequency';

// Standard 8-category muscle taxonomy
export const MUSCLE_CATEGORIES = [
  'Chest',
  'Shoulders',
  'Back',
  'Biceps',
  'Triceps',
  'Forearms',
  'Legs',
  'Core'
] as const;

export type MuscleCategory = typeof MUSCLE_CATEGORIES[number];

// Deliberate non-overlapping muscle category mapping
function mapTargetToCategory(targetStr: string): MuscleCategory {
  if (!targetStr) return 'Core';
  const t = targetStr.toLowerCase();

  if (t.includes('tricep')) return 'Triceps';
  if (t.includes('bicep')) return 'Biceps';
  if (t.includes('forearm') || t.includes('grip') || t.includes('wrist')) return 'Forearms';
  if (t.includes('arm')) return 'Biceps';

  if (t.includes('chest') || t.includes('pec')) return 'Chest';
  if (t.includes('shoulder') || t.includes('delt') || t.includes('trap')) return 'Shoulders';
  if (t.includes('back') || t.includes('lat') || t.includes('rhomboid') || t.includes('erector') || t.includes('spine')) return 'Back';
  if (t.includes('quad') || t.includes('hamstring') || t.includes('glute') || t.includes('calf') || t.includes('calves') || t.includes('leg') || t.includes('thigh') || t.includes('adductor')) return 'Legs';
  if (t.includes('core') || t.includes('ab') || t.includes('oblique')) return 'Core';

  return 'Core';
}

// 1RM Epley formula
function calcEpley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Compound lift priority ranker
const COMPOUND_KEYWORDS = [
  'squat',
  'bench',
  'deadlift',
  'overhead press',
  'ohp',
  'shoulder press',
  'incline',
  'row',
  'pull-up',
  'pullup',
  'chin-up',
  'lat pulldown',
  'leg press',
  'rdl'
];

function getCompoundScore(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < COMPOUND_KEYWORDS.length; i++) {
    if (lower.includes(COMPOUND_KEYWORDS[i])) {
      return 100 - i;
    }
  }
  return 0;
}

// Semantic chart color constants derived from token system
const CHART_THEME = {
  emerald: SEMANTIC_COLORS.emerald,
  emeraldLight: '#34d399',
  orange: SEMANTIC_COLORS.orange,
  zinc: SEMANTIC_COLORS.zinc,
  zincText: '#a1a1aa',
  grid: '#27272a',
  background: '#09090e'
};

// Unified heatmap intensity scale used for both matrix cells and legend
const HEATMAP_INTENSITY_STEPS = [
  { level: 0, bg: 'bg-zinc-900/60', border: 'border-zinc-800/40', text: 'text-zinc-600', maxRatio: 0, glow: false },
  { level: 1, bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', maxRatio: 0.25, glow: false },
  { level: 2, bg: 'bg-emerald-500/45', border: 'border-emerald-500/50', text: 'text-emerald-300', maxRatio: 0.50, glow: false },
  { level: 3, bg: 'bg-emerald-500/75', border: 'border-emerald-500/70', text: 'text-emerald-200', maxRatio: 0.75, glow: false },
  { level: 4, bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-black font-bold', maxRatio: 1.0, glow: true }
] as const;

function getHeatmapIntensity(vol: number, maxVol: number) {
  if (vol <= 0 || maxVol <= 0) return HEATMAP_INTENSITY_STEPS[0];
  const ratio = vol / maxVol;
  if (ratio < 0.25) return HEATMAP_INTENSITY_STEPS[1];
  if (ratio < 0.50) return HEATMAP_INTENSITY_STEPS[2];
  if (ratio < 0.75) return HEATMAP_INTENSITY_STEPS[3];
  return HEATMAP_INTENSITY_STEPS[4];
}

export const AnalyticsView: React.FC = () => {
  const { logs, workouts, appState } = useFitness();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [muscleMetric, setMuscleMetric] = useState<MuscleMetric>('volume');
  const [selected1RMExerciseId, setSelected1RMExerciseId] = useState<string | null>(null);
  const [currentHeatmapMonth, setCurrentHeatmapMonth] = useState<Date>(new Date());
  const [showAllRecords, setShowAllRecords] = useState<boolean>(false);
  const [showAllExercises, setShowAllExercises] = useState<boolean>(false);

  // 1. Fast workout & exercise lookups
  const workoutMap = useMemo(() => {
    const map = new Map<string, Workout>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  const coreWorkoutByCycleDayMap = useMemo(() => {
    const map = new Map<number, Workout>();
    (workouts || []).forEach(w => {
      if (w.isCore && typeof w.cycleDay === 'number') {
        map.set(w.cycleDay, w);
      }
    });
    return map;
  }, [workouts]);

  const { exMap, priorityExercises } = useMemo(() => {
    const meta: Record<string, { exercise: Exercise; workoutName: string; workoutType: string }> = {};
    const priorityList: { id: string; name: string; target: string }[] = [];
    const seenPriorityIds = new Set<string>();

    // 1. Gather all explicitly tagged priority exercises
    (workouts || []).forEach(wo => {
      (wo.exercises || []).forEach(ex => {
        meta[ex.id] = { exercise: ex, workoutName: wo.name, workoutType: wo.type };
        if (ex.tags?.includes('priority') && !seenPriorityIds.has(ex.id)) {
          seenPriorityIds.add(ex.id);
          priorityList.push({ id: ex.id, name: ex.name, target: ex.target });
        }
      });
    });

    // 2. If priority list is sparse, collect and rank compound lifts
    if (priorityList.length < 5) {
      const candidates: { id: string; name: string; target: string; score: number }[] = [];
      (workouts || []).forEach(wo => {
        (wo.exercises || []).forEach(ex => {
          if (!seenPriorityIds.has(ex.id)) {
            const score = getCompoundScore(ex.name);
            candidates.push({ id: ex.id, name: ex.name, target: ex.target, score });
          }
        });
      });

      // Sort by compound relevance score descending
      candidates.sort((a, b) => b.score - a.score);

      for (const cand of candidates) {
        if (priorityList.length >= 6) break;
        if (!seenPriorityIds.has(cand.id)) {
          seenPriorityIds.add(cand.id);
          priorityList.push({ id: cand.id, name: cand.name, target: cand.target });
        }
      }
    }

    return { exMap: meta, priorityExercises: priorityList };
  }, [workouts]);

  // Active 1RM selection
  const active1RMExerciseId = selected1RMExerciseId || priorityExercises[0]?.id || '';

  // 2. Aggregation over logs & time filters with rigorous date validation
  const aggregated = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const startOfToday = startOfDay(now);

    const sortedLogs = (Object.values(logs) as SessionLog[])
      .filter(l => {
        if (!l || !l.date) return false;
        const parsed = parseISO(l.date);
        return isValid(parsed);
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalLogsCount = sortedLogs.length;

    // Determine filter cutoffs
    let cutoffDateStr: string | null = null;
    let priorCutoffDateStr: string | null = null;

    if (timeRange === '7d') {
      cutoffDateStr = format(subDays(now, 6), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 13), 'yyyy-MM-dd');
    } else if (timeRange === '30d') {
      cutoffDateStr = format(subDays(now, 29), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 59), 'yyyy-MM-dd');
    } else if (timeRange === '90d') {
      cutoffDateStr = format(subDays(now, 89), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 179), 'yyyy-MM-dd');
    }

    const rangeLogs = sortedLogs.filter(l => !cutoffDateStr || l.date >= cutoffDateStr);
    const priorLogs = sortedLogs.filter(l => {
      if (!cutoffDateStr || !priorCutoffDateStr) return false;
      return l.date >= priorCutoffDateStr && l.date < cutoffDateStr;
    });

    // Volume comparisons
    let rangeVolume = 0;
    let priorVolume = 0;
    rangeLogs.forEach(l => { rangeVolume += calculateVolume(l); });
    priorLogs.forEach(l => { priorVolume += calculateVolume(l); });

    // Lifetime metrics (without arbitrary 45m fallback; track measured durations)
    let lifetimeVolume = 0;
    let lifetimeSets = 0;
    let lifetimeMeasuredMinutes = 0;
    let lifetimeMeasuredCount = 0;
    const firstLogDate = sortedLogs[0]?.date || null;
    const lastLogDate = sortedLogs[sortedLogs.length - 1]?.date || null;

    // PRs: Keyed by normalized exercise name to avoid duplicates across workouts with differing exercise IDs
    const recordsByNameMap: Record<string, {
      exerciseName: string;
      maxWeight: number;
      repsAtMax: number;
      maxEpley: number;
      date: string;
      exerciseId: string;
    }> = {};

    // Weekly volume map for "Biggest Week Ever"
    const weeklyVolumeMap: Record<string, number> = {};

    // Muscle totals map (Range)
    const rangeMuscleVolume: Record<MuscleCategory, number> = {
      Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
    };
    const rangeMuscleSets: Record<MuscleCategory, number> = {
      Chest: 0, Shoulders: 0, Back: 0, Biceps: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
    };
    const rangeMuscleFrequency: Record<MuscleCategory, Set<string>> = {
      Chest: new Set(), Shoulders: new Set(), Back: new Set(), Biceps: new Set(), Triceps: new Set(),
      Forearms: new Set(), Legs: new Set(), Core: new Set()
    };

    // Exercise rankings in range
    const exerciseSessionCounts: Record<string, { name: string; count: number; volume: number }> = {};

    // Routine type distribution in range
    const workoutTypeDistribution: Record<string, number> = {};

    // 1RM Trend data for active 1RM exercise
    const active1RMTrend: { date: string; displayDate: string; epley1RM: number; setDetail: string }[] = [];

    // Map logs by date string
    const logDateMap = new Map<string, SessionLog[]>();

    // Single pass over ALL logs for lifetime & PRs
    sortedLogs.forEach(log => {
      const vol = calculateVolume(log);
      lifetimeVolume += vol;

      if (log.durationMinutes && log.durationMinutes > 0) {
        lifetimeMeasuredMinutes += log.durationMinutes;
        lifetimeMeasuredCount++;
      }

      if (log.date) {
        if (!logDateMap.has(log.date)) {
          logDateMap.set(log.date, []);
        }
        logDateMap.get(log.date)!.push(log);

        try {
          const parsed = parseISO(log.date);
          if (isValid(parsed)) {
            const weekStartStr = format(startOfWeek(parsed, { weekStartsOn: 1 }), 'MMM dd, yyyy');
            weeklyVolumeMap[weekStartStr] = (weeklyVolumeMap[weekStartStr] || 0) + vol;
          }
        } catch (_) {}
      }

      // Process sets for PRs with name deduplication
      if (log.sets) {
        Object.entries(log.sets).forEach(([exId, setList]) => {
          const doneSets = (setList as SetLog[]).filter(s => s.done);
          lifetimeSets += doneSets.length;

          doneSets.forEach(s => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps, 10) || 0;
            if (w > 0 && r > 0) {
              const epley = calcEpley1RM(w, r);
              const exMeta = exMap[exId];
              const exName = exMeta?.exercise.name || 'Exercise';
              const normName = exName.trim().toLowerCase();

              if (!recordsByNameMap[normName] || epley > recordsByNameMap[normName].maxEpley) {
                recordsByNameMap[normName] = {
                  exerciseName: exName,
                  maxWeight: w,
                  repsAtMax: r,
                  maxEpley: epley,
                  date: log.date,
                  exerciseId: exId
                };
              }
            }
          });
        });
      }
    });

    // Range-specific calculations
    let rangeMeasuredMinutes = 0;
    let rangeMeasuredCount = 0;
    const activeDatesSet = new Set<string>();

    rangeLogs.forEach(log => {
      if (log.durationMinutes && log.durationMinutes > 0) {
        rangeMeasuredMinutes += log.durationMinutes;
        rangeMeasuredCount++;
      }
      if (log.date) activeDatesSet.add(log.date);

      // Workout type distribution
      const woMeta = workoutMap.get(log.workoutId);
      const wType = woMeta?.type || 'custom';
      workoutTypeDistribution[wType] = (workoutTypeDistribution[wType] || 0) + 1;

      // Muscle group breakdown & exercise counts
      if (log.sets) {
        Object.entries(log.sets).forEach(([exId, setList]) => {
          const doneSets = (setList as SetLog[]).filter(s => s.done);
          if (doneSets.length === 0) return;

          const exMeta = exMap[exId];
          const targetStr = exMeta?.exercise.target || 'Core';
          const category = mapTargetToCategory(targetStr);

          let exVol = 0;
          doneSets.forEach(s => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps, 10) || 0;
            exVol += (w * r);
          });

          rangeMuscleVolume[category] = (rangeMuscleVolume[category] || 0) + exVol;
          rangeMuscleSets[category] = (rangeMuscleSets[category] || 0) + doneSets.length;
          rangeMuscleFrequency[category]?.add(log.id);

          const exName = exMeta?.exercise.name || 'Exercise';
          const normKey = exName.trim().toLowerCase();
          if (!exerciseSessionCounts[normKey]) {
            exerciseSessionCounts[normKey] = {
              name: exName,
              count: 0,
              volume: 0
            };
          }
          exerciseSessionCounts[normKey].count += 1;
          exerciseSessionCounts[normKey].volume += exVol;

          // 1RM Trend point if matching active 1RM exercise
          if (exId === active1RMExerciseId) {
            let maxSetEpley = 0;
            let maxSetDetail = '';
            doneSets.forEach(s => {
              const w = parseFloat(s.weight) || 0;
              const r = parseInt(s.reps, 10) || 0;
              const ep = calcEpley1RM(w, r);
              if (ep > maxSetEpley) {
                maxSetEpley = ep;
                maxSetDetail = `${w}kg × ${r} reps`;
              }
            });

            if (maxSetEpley > 0) {
              active1RMTrend.push({
                date: log.date,
                displayDate: format(parseISO(log.date), 'MMM dd'),
                epley1RM: maxSetEpley,
                setDetail: maxSetDetail
              });
            }
          }
        });
      }
    });

    // 3. Precise Streaks: Current Streak & Longest Streak
    const distinctDates = Array.from(new Set(sortedLogs.map(l => l.date))).sort();
    let currentStreak = 0;
    let longestStreak = 0;

    if (distinctDates.length > 0) {
      let checkDate = now;
      let checkStr = format(checkDate, 'yyyy-MM-dd');
      const dateSet = new Set(distinctDates);

      // Start current streak from today or yesterday
      if (!dateSet.has(checkStr)) {
        checkDate = subDays(now, 1);
        checkStr = format(checkDate, 'yyyy-MM-dd');
      }

      while (dateSet.has(checkStr)) {
        currentStreak++;
        checkDate = subDays(checkDate, 1);
        checkStr = format(checkDate, 'yyyy-MM-dd');
      }

      // Longest Streak across entire history
      let tempStreak = 0;
      let prevDateObj: Date | null = null;

      distinctDates.forEach(dateStr => {
        const curDateObj = parseISO(dateStr);
        if (isValid(curDateObj)) {
          if (!prevDateObj) {
            tempStreak = 1;
          } else {
            const diff = differenceInCalendarDays(curDateObj, prevDateObj);
            if (diff === 1) {
              tempStreak++;
            } else if (diff > 1) {
              tempStreak = 1;
            }
          }
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
          prevDateObj = curDateObj;
        }
      });
    }

    // 4. Scheduled Adherence vs Bonus Sessions vs Missed Days
    const rangeStartDate = cutoffDateStr
      ? parseISO(cutoffDateStr)
      : (firstLogDate ? parseISO(firstLogDate) : subDays(now, 30));
    
    const validRangeStart = isValid(rangeStartDate) ? rangeStartDate : subDays(now, 30);
    const dayInterval = eachDayOfInterval({
      start: validRangeStart,
      end: now
    });

    let scheduledCoreWorkouts = 0;
    let completedScheduledCore = 0;
    let scheduledRestDays = 0;
    let missedPastCoreDays = 0;
    let bonusCompletedSessions = 0;
    let isTodayCorePending = false;

    dayInterval.forEach(dayDate => {
      const dateStr = format(dayDate, 'yyyy-MM-dd');
      const isToday = isSameDay(dayDate, now) || dateStr === todayStr;
      const isPast = dayDate < startOfToday && !isToday;

      const cycleDay = getCycleDay(appState?.cycleStart, dayDate);
      const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
      const dayLogs = logDateMap.get(dateStr) || [];
      const hasCompletedWorkout = dayLogs.some(l => l.complete || calculateVolume(l) > 0);

      const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
      const isScheduledRest = expectedWo && expectedWo.type === 'rest';

      if (isScheduledCore) {
        scheduledCoreWorkouts++;
        if (hasCompletedWorkout) {
          completedScheduledCore++;
        } else if (isPast) {
          // Only strictly past days count as missed
          missedPastCoreDays++;
        } else if (isToday) {
          // Today's workout is pending until the day ends
          isTodayCorePending = true;
        }
      } else if (isScheduledRest) {
        scheduledRestDays++;
        if (hasCompletedWorkout) {
          bonusCompletedSessions++;
        }
      } else {
        if (hasCompletedWorkout) {
          bonusCompletedSessions++;
        }
      }
    });

    // Scheduled adherence percentage (pure core training adherence, never artificially inflated by bonus rest-day workouts)
    const baseCoreExpected = Math.max(1, scheduledCoreWorkouts);
    const adherencePct = Math.min(100, Math.round((completedScheduledCore / baseCoreExpected) * 100));

    // Period-over-period percentage change for volume
    let volumePeriodChangePct: number | null = null;
    if (cutoffDateStr && priorVolume > 0) {
      volumePeriodChangePct = Math.round(((rangeVolume - priorVolume) / priorVolume) * 100);
    } else if (cutoffDateStr && priorVolume === 0 && rangeVolume > 0) {
      volumePeriodChangePct = 100;
    }

    // Average session duration (based strictly on measured logs)
    const avgDuration = rangeMeasuredCount > 0 ? Math.round(rangeMeasuredMinutes / rangeMeasuredCount) : 0;
    const lifetimeHours = lifetimeMeasuredMinutes > 0 ? Math.round((lifetimeMeasuredMinutes / 60) * 10) / 10 : 0;

    // Biggest week ever
    let biggestWeek = { weekStr: 'N/A', volume: 0 };
    Object.entries(weeklyVolumeMap).forEach(([wStr, vol]) => {
      if (vol > biggestWeek.volume) {
        biggestWeek = { weekStr: wStr, volume: vol };
      }
    });

    // Top ranked exercises by frequency in range
    const mostFrequentExercises = Object.values(exerciseSessionCounts)
      .sort((a, b) => b.count - a.count || b.volume - a.volume);

    // Days since last workout (with future date clamp)
    let daysSinceLast = 0;
    if (lastLogDate) {
      const parsedLast = parseISO(lastLogDate);
      if (isValid(parsedLast)) {
        daysSinceLast = Math.max(0, differenceInCalendarDays(now, parsedLast));
      }
    }

    // Average gap between sessions (Average Training Gap)
    let avgGapDays = 0;
    if (sortedLogs.length > 1) {
      let totalGaps = 0;
      let validGapsCount = 0;
      for (let i = 1; i < sortedLogs.length; i++) {
        const d1 = parseISO(sortedLogs[i - 1].date);
        const d2 = parseISO(sortedLogs[i].date);
        if (isValid(d1) && isValid(d2)) {
          const diff = Math.max(0, differenceInCalendarDays(d2, d1));
          totalGaps += diff;
          validGapsCount++;
        }
      }
      if (validGapsCount > 0) {
        avgGapDays = Math.round((totalGaps / validGapsCount) * 10) / 10;
      }
    }

    // Sort PR records by highest estimated 1RM descending
    const recordsList = Object.values(recordsByNameMap).sort((a, b) => b.maxEpley - a.maxEpley);

    return {
      totalLogsCount,
      rangeLogsCount: rangeLogs.length,
      lifetimeVolume,
      lifetimeSets,
      lifetimeHours,
      firstLogDate,
      lastLogDate,
      rangeVolume,
      priorVolume,
      volumePeriodChangePct,
      activeDaysCount: activeDatesSet.size,
      scheduledCoreWorkouts,
      completedScheduledCore,
      scheduledRestDays,
      missedPastCoreDays,
      bonusCompletedSessions,
      isTodayCorePending,
      adherencePct,
      currentStreak,
      longestStreak,
      avgDuration,
      biggestWeek,
      recordsList,
      rangeMuscleVolume,
      rangeMuscleSets,
      rangeMuscleFrequency,
      mostFrequentExercises,
      workoutTypeDistribution,
      active1RMTrend,
      daysSinceLast,
      avgGapDays
    };
  }, [logs, workouts, exMap, workoutMap, coreWorkoutByCycleDayMap, active1RMExerciseId, timeRange, appState?.cycleStart]);

  // 3. Heatmap calendar data
  const heatmapData = useCalendarGrid({
    monthDate: currentHeatmapMonth,
    logs,
    workouts,
    weekStartsOn: 1
  });

  // 4. Muscle chart data formatted for Recharts
  const muscleChartData = useMemo(() => {
    return MUSCLE_CATEGORIES.map(cat => {
      let val = 0;
      if (muscleMetric === 'volume') {
        val = aggregated.rangeMuscleVolume[cat] || 0;
      } else if (muscleMetric === 'sets') {
        val = aggregated.rangeMuscleSets[cat] || 0;
      } else {
        val = aggregated.rangeMuscleFrequency[cat]?.size || 0;
      }
      return {
        category: cat,
        value: val,
        formattedVal: muscleMetric === 'volume' ? `${(val / 1000).toFixed(1)}k kg` : `${val}`
      };
    });
  }, [muscleMetric, aggregated]);

  // 5. Workout Distribution Pie Chart Data
  const workoutPieData = useMemo(() => {
    return (Object.entries(aggregated.workoutTypeDistribution) as [string, number][])
      .map(([type, count]) => ({
        name: type.toUpperCase(),
        type,
        value: count,
        color: WORKOUT_COLORS[type as WorkoutType] || SEMANTIC_COLORS.zinc
      }))
      .sort((a, b) => b.value - a.value);
  }, [aggregated.workoutTypeDistribution]);

  // 6. High-quality data-derived insights (strictly supported by data)
  const insightsList = useMemo(() => {
    const list: string[] = [];

    if (aggregated.rangeLogsCount === 0) {
      return ['No completed training logs in this window. Complete a session to generate performance analytics.'];
    }

    // Top muscle volume
    const topMuscle = (Object.entries(aggregated.rangeMuscleVolume) as [MuscleCategory, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (topMuscle && topMuscle[1] > 0 && aggregated.rangeVolume > 0) {
      const pct = Math.round((topMuscle[1] / aggregated.rangeVolume) * 100);
      list.push(`${topMuscle[0]} volume represents ${pct}% of total tonnage (${(topMuscle[1] / 1000).toFixed(1)}k kg) during this period.`);
    }

    // Routine focus
    if (workoutPieData.length > 0) {
      const topRoutine = workoutPieData[0];
      list.push(`${topRoutine.name} routines account for the highest session frequency (${topRoutine.value} sessions).`);
    }

    // Scheduled adherence
    if (aggregated.scheduledCoreWorkouts > 0) {
      list.push(`Core scheduled adherence stands at ${aggregated.adherencePct}% (${aggregated.completedScheduledCore}/${aggregated.scheduledCoreWorkouts} core workouts completed).`);
    }

    // Most frequent movement
    if (aggregated.mostFrequentExercises.length > 0) {
      const topEx = aggregated.mostFrequentExercises[0];
      list.push(`${topEx.name} is the most frequently performed exercise with ${topEx.count} logged sessions.`);
    }

    // Measured duration
    if (aggregated.avgDuration > 0) {
      list.push(`Recorded workouts averaged ${aggregated.avgDuration} minutes in length across this window.`);
    }

    return list;
  }, [aggregated, workoutPieData]);

  // Visible records slice
  const visibleRecords = showAllRecords ? aggregated.recordsList : aggregated.recordsList.slice(0, 3);

  // Visible frequent exercises slice
  const visibleExercises = showAllExercises
    ? aggregated.mostFrequentExercises
    : aggregated.mostFrequentExercises.slice(0, 3);

  return (
    <Stack spacing="2xl" className="pt-2 pb-16">
      {/* 1. HEADER & TIME TOGGLE */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <SectionHeader
          eyebrow="Performance Intelligence"
          eyebrowColor="emerald"
          title="Analytics"
          size="page"
        />

        {/* Time range segmented control */}
        <SegmentedControl<TimeRange>
          options={[
            { value: '7d', label: '7D' },
            { value: '30d', label: '30D' },
            { value: '90d', label: '90D' },
            { value: 'all', label: 'ALL' }
          ]}
          value={timeRange}
          onChange={(r) => {
            haptics.selection();
            setTimeRange(r);
          }}
          accent="emerald"
          size="md"
        />
      </div>

      {/* 2. SECTION 1: OVERVIEW HERO STATS */}
      <Grid cols={2} colsLg={4} gap="md">
        {/* Streak: Current vs Best */}
        <StatCard
          label="Training Streak"
          value={aggregated.currentStreak}
          unit="days"
          icon={<Flame size={16} />}
          accent="orange"
          sublabel="Current active streak"
          trend={<span className={cn(TYPOGRAPHY.label, "text-orange-400 font-bold")}>Best: {aggregated.longestStreak}d</span>}
        />

        {/* Scheduled Core Workouts */}
        <StatCard
          label="Core Workouts"
          value={`${aggregated.completedScheduledCore}/${aggregated.scheduledCoreWorkouts}`}
          icon={<CalendarIcon size={16} />}
          accent="emerald"
          sublabel={
            aggregated.isTodayCorePending
              ? `${aggregated.missedPastCoreDays} skipped · Today pending`
              : `${aggregated.missedPastCoreDays} skipped · ${aggregated.scheduledRestDays} rest`
          }
        />

        {/* Scheduled Adherence Rate */}
        <StatCard
          label="Adherence Rate"
          value={`${aggregated.adherencePct}%`}
          icon={<Activity size={16} />}
          accent="emerald"
          sublabel={aggregated.bonusCompletedSessions > 0 ? `+${aggregated.bonusCompletedSessions} bonus sessions` : 'Scheduled core adherence'}
        />

        {/* Window Volume with Period-over-Period Trend */}
        <StatCard
          label="Window Volume"
          value={(aggregated.rangeVolume / 1000).toFixed(1)}
          unit="k kg"
          icon={<Dumbbell size={16} />}
          accent="emerald"
          sublabel={`Window: ${timeRange.toUpperCase()}`}
          trend={
            aggregated.volumePeriodChangePct !== null ? (
              <span
                className={cn(
                  "font-bold flex items-center gap-0.5",
                  aggregated.volumePeriodChangePct > 0
                    ? "text-emerald-400"
                    : (aggregated.volumePeriodChangePct < 0 ? "text-rose-400" : "text-zinc-400")
                )}
              >
                {aggregated.volumePeriodChangePct > 0 ? (
                  <TrendingUp size={12} />
                ) : aggregated.volumePeriodChangePct < 0 ? (
                  <TrendingDown size={12} />
                ) : null}
                {aggregated.volumePeriodChangePct > 0 ? `+${aggregated.volumePeriodChangePct}%` : `${aggregated.volumePeriodChangePct}%`}
              </span>
            ) : undefined
          }
        />
      </Grid>

      {/* 3. SECTION 2: TRAINING ACTIVITY (HEATMAP & 1RM PROGRESSION) */}
      <Section
        eyebrow="Adherence Matrix"
        eyebrowColor="emerald"
        title="Monthly Intensity Heatmap"
        padding="section"
        action={
          <div className={cn("flex items-center", GAP.sm)}>
            <span className={cn(TYPOGRAPHY.label, "text-zinc-300 mr-2")}>
              {format(heatmapData.monthStart, 'MMMM yyyy')}
            </span>
            <Button
              variant="secondary"
              size="icon"
              className={RADIUS.pill}
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(subMonths(currentHeatmapMonth, 1));
              }}
              icon={<ChevronLeft size={16} />}
              aria-label="Previous Month"
            />
            <Button
              variant="secondary"
              size="icon"
              className={RADIUS.pill}
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(addMonths(currentHeatmapMonth, 1));
              }}
              icon={<ChevronRight size={16} />}
              aria-label="Next Month"
            />
          </div>
        }
      >
        <Stack spacing="lg">
          {/* Heatmap Grid */}
          <Stack spacing="xs">
            {/* Weekday headers */}
            <div className={cn("grid grid-cols-7 text-center uppercase", GAP.xs, TYPOGRAPHY.label, "text-zinc-500")}>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Days grid */}
            <div className={cn("grid grid-cols-7", GAP.xs)}>
              {heatmapData.days.map((day, dayIdx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(day, heatmapData.monthStart);
                const vol = heatmapData.logVolMap[dateStr] || 0;
                const detail = heatmapData.dayDetailMap[dateStr];
                const intensity = getHeatmapIntensity(vol, heatmapData.maxDayVol);

                const cycleDay = getCycleDayForDate(day, logs, workouts, appState?.cycleStart);
                const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);

                let tooltipText = `${dateStr}`;
                if (detail && detail.workoutNames.length > 0) {
                  tooltipText = `${dateStr} • ${detail.workoutNames.join(', ')} (${vol.toLocaleString()} kg, ${detail.doneSets} sets)`;
                } else if (expectedWo?.type === 'rest') {
                  tooltipText = `${dateStr} • Scheduled Rest (${expectedWo.name})`;
                } else if (expectedWo) {
                  tooltipText = `${dateStr} • Scheduled: ${expectedWo.name} (No log recorded)`;
                } else {
                  tooltipText = `${dateStr} • Rest`;
                }

                return (
                  <div
                    key={`day-${dateStr}-${dayIdx}`}
                    title={tooltipText}
                    className={cn(
                      "aspect-square border flex flex-col items-center justify-center transition-all p-1 relative group cursor-default",
                      RADIUS.button,
                      isCurrentMonth
                        ? cn(
                            intensity.bg,
                            intensity.border,
                            intensity.text,
                            intensity.glow && SHADOW.accentGlow(SEMANTIC_COLORS.emerald)
                          )
                        : "opacity-20 bg-zinc-950 border-zinc-900 text-zinc-700"
                    )}
                  >
                    <span className={cn(TYPOGRAPHY.label, "leading-none")}>{format(day, 'd')}</span>
                    {vol > 0 && isCurrentMonth && (
                      <span className={cn(TYPOGRAPHY.eyebrow, "leading-none mt-1 opacity-80 text-[8px]")}>
                        {(vol / 1000).toFixed(1)}k
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Stack>

          {/* Legend + Summary derived directly from single intensity scale */}
          <div className={cn("flex flex-col sm:flex-row items-center justify-between pt-3 border-t", GAP.md, BORDER.subtle)}>
            <div className={cn("flex items-center", GAP.sm)}>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-500")}>Less</span>
              <div className={cn("flex", GAP.xs)}>
                {HEATMAP_INTENSITY_STEPS.map((step) => (
                  <span
                    key={`step-${step.level}`}
                    className={cn("w-3.5 h-3.5 border", RADIUS.button, step.bg, step.border)}
                  />
                ))}
              </div>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-500")}>More</span>
            </div>

            <div className={cn(TYPOGRAPHY.label, "text-zinc-400 flex items-center", GAP.sm)}>
              <span className="text-emerald-400 font-bold">{aggregated.activeDaysCount}</span> Active Days ·{' '}
              <span className="text-zinc-500">{aggregated.missedPastCoreDays} Skipped</span> ·{' '}
              <span className="text-zinc-300">{aggregated.adherencePct}% Adherence</span>
            </div>
          </div>
        </Stack>
      </Section>

      {/* 4. SECTION 3: STRENGTH PROGRESSION (1RM TREND) */}
      <Section
        eyebrow="Strength Progression"
        eyebrowColor="emerald"
        title="Estimated 1RM Progression"
        padding="section"
        action={
          priorityExercises.length > 0 ? (
            <div className={cn("flex items-center max-w-[220px] sm:max-w-md overflow-x-auto pb-1 scrollbar-none", GAP.sm)}>
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 shrink-0")}>Lift:</span>
              <div className={cn("flex", GAP.xs)}>
                {priorityExercises.map((ex, idx) => (
                  <Button
                    key={ex.id ? `p-ex-${ex.id}-${idx}` : `p-ex-${idx}`}
                    size="sm"
                    variant={active1RMExerciseId === ex.id ? 'success' : 'secondary'}
                    onClick={() => {
                      haptics.selection();
                      setSelected1RMExerciseId(ex.id);
                    }}
                    className="whitespace-nowrap shrink-0"
                  >
                    {ex.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      >
        <Stack spacing="lg">
          {aggregated.active1RMTrend.length > 0 ? (
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aggregated.active1RMTrend} margin={{ top: 12, right: 16, left: -4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    stroke={CHART_THEME.zincText}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dy={6}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={CHART_THEME.zincText}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => `${Math.round(v)}kg`}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className={cn(SURFACE.recessed, BORDER.standard, RADIUS.button, SPACING.compact, SHADOW.panel, "border font-mono text-xs", STACK_SPACING.xs)}>
                            <p className="text-zinc-400 font-bold">{data.date}</p>
                            <p className="text-emerald-400 font-black text-sm">
                              Est. 1RM: {data.epley1RM} kg
                            </p>
                            <p className="text-zinc-500 text-[10px]">Best Set: {data.setDetail}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="epley1RM"
                    stroke={CHART_THEME.emerald}
                    strokeWidth={3}
                    dot={{ fill: CHART_THEME.emerald, r: 4, stroke: CHART_THEME.background, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: CHART_THEME.emeraldLight, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No lift progression data"
              description="No completed sets recorded for this movement in the selected range."
            />
          )}

          {/* Summary metrics beneath chart */}
          <Grid cols={1} colsMd={2} gap="md">
            <StatCard
              label="Average Session Length"
              value={aggregated.avgDuration > 0 ? aggregated.avgDuration : '--'}
              unit={aggregated.avgDuration > 0 ? 'minutes' : ''}
              icon={<Clock size={20} />}
              accent="emerald"
              sublabel={aggregated.avgDuration > 0 ? 'Measured duration' : 'No duration recorded'}
            />

            <AchievementCard
              title="Biggest Week Ever"
              value={aggregated.biggestWeek.volume > 0 ? `${(aggregated.biggestWeek.volume / 1000).toFixed(1)}k kg` : '0 kg'}
              subtitle={aggregated.biggestWeek.weekStr}
              icon={<Trophy size={18} />}
            />
          </Grid>
        </Stack>
      </Section>

      {/* 5. SECTION 4: TRAINING DISTRIBUTION (MUSCLES, MOST FREQUENT EXERCISES, ROUTINES) */}
      <Section
        eyebrow="Anatomical Load Distribution"
        eyebrowColor="emerald"
        title="Muscle Group Targeting"
        padding="section"
        action={
          <SegmentedControl<MuscleMetric>
            options={[
              { value: 'volume', label: 'Volume' },
              { value: 'sets', label: 'Sets' },
              { value: 'frequency', label: 'Freq' }
            ]}
            value={muscleMetric}
            onChange={(m) => {
              haptics.selection();
              setMuscleMetric(m);
            }}
            accent="emerald"
            size="sm"
          />
        }
      >
        <Stack spacing="lg">
          {/* Horizontal Bar Chart without redundant Cell layers */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={muscleChartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={false} />
                <XAxis type="number" stroke={CHART_THEME.zincText} fontSize={10} axisLine={false} tickLine={false} />
                <YAxis dataKey="category" type="category" stroke={CHART_THEME.zincText} fontSize={11} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className={cn(SURFACE.recessed, BORDER.standard, RADIUS.button, SPACING.compact, SHADOW.elevation, "border font-mono text-xs")}>
                          <span className="text-zinc-400 uppercase">{d.category}: </span>
                          <strong className="text-emerald-400 font-bold">{d.formattedVal}</strong>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" fill={CHART_THEME.emerald} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Most Frequent Exercises inside one unified compact Card */}
          <Stack spacing="sm" className={cn("pt-4 border-t", BORDER.subtle)}>
            <div className="flex items-center justify-between">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>
                Most Frequent Exercises
              </span>
              {aggregated.mostFrequentExercises.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllExercises(!showAllExercises)}
                  icon={showAllExercises ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  iconPosition="right"
                >
                  {showAllExercises ? 'Show Top 3' : `View All (${aggregated.mostFrequentExercises.length})`}
                </Button>
              )}
            </div>

            <Card surface="recessed" variant="standard" padding="standard">
              {visibleExercises.length > 0 ? (
                <div className={cn("divide-y", BORDER.subtle)}>
                  {visibleExercises.map((ex, idx) => (
                    <div
                      key={`freq-ex-${ex.name}-${idx}`}
                      className={cn(
                        "flex items-center justify-between py-2.5 first:pt-0 last:pb-0",
                        GAP.sm
                      )}
                    >
                      <div className={cn("flex items-center min-w-0", GAP.sm)}>
                        <span className={cn(
                          "w-6 h-6 flex items-center justify-center font-mono font-bold text-xs shrink-0 border",
                          RADIUS.button,
                          idx === 0
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400"
                        )}>
                          #{idx + 1}
                        </span>
                        <div className="truncate">
                          <p className="text-xs font-bold text-white truncate">{ex.name}</p>
                          <p className={cn(TYPOGRAPHY.label, "text-zinc-500")}>
                            {ex.count} {ex.count === 1 ? 'session' : 'sessions'} logged
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-xs text-zinc-300">
                          {(ex.volume / 1000).toFixed(1)}k kg
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={cn(TYPOGRAPHY.body, "text-zinc-500 text-center py-2")}>
                  No exercise logs recorded in this period.
                </p>
              )}
            </Card>
          </Stack>
        </Stack>
      </Section>

      {/* 6. SECTION 5: PERSONAL BESTS / RECORDS (COMPACT ACCORDION & TOP 3) */}
      <Section
        eyebrow="Strength Records"
        eyebrowColor="orange"
        title="Personal Bests"
        padding="section"
        action={
          aggregated.recordsList.length > 3 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                haptics.selection();
                setShowAllRecords(!showAllRecords);
              }}
              icon={showAllRecords ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              iconPosition="right"
            >
              {showAllRecords ? 'Show Top 3' : `View All Records (${aggregated.recordsList.length})`}
            </Button>
          ) : undefined
        }
      >
        <Stack spacing="md">
          {aggregated.recordsList.length > 0 ? (
            <Grid cols={1} colsMd={2} colsLg={3} gap="sm">
              {visibleRecords.map((rec, idx) => (
                <Card
                  key={rec.exerciseName ? `rec-${rec.exerciseName}-${idx}` : `rec-${idx}`}
                  variant="interactive"
                  padding="standard"
                  className="flex items-center justify-between group border-orange-500/20 hover:border-orange-500/50"
                >
                  <div className={cn("truncate pr-2", STACK_SPACING.xs)}>
                    <p className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors truncate">
                      {rec.exerciseName}
                    </p>
                    <p className={cn(TYPOGRAPHY.label, "text-zinc-500")}>
                      Logged: {rec.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black font-mono text-orange-400">
                      {rec.maxWeight}kg × {rec.repsAtMax}
                    </div>
                    <div className={cn(TYPOGRAPHY.label, "text-zinc-500")}>
                      Est. 1RM ~{rec.maxEpley}kg
                    </div>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState
              icon={Award}
              title="No strength records logged"
              description="Record completed sets during workouts to automatically track your all-time heaviest lifts."
            />
          )}

          {aggregated.recordsList.length > 3 && !showAllRecords && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  haptics.selection();
                  setShowAllRecords(true);
                }}
                icon={<ChevronDown size={14} />}
                iconPosition="right"
              >
                View all {aggregated.recordsList.length} personal bests
              </Button>
            </div>
          )}
        </Stack>
      </Section>

      {/* 7. SECTION 6: LIFETIME SUMMARY */}
      <Section
        eyebrow="Cumulative Milestones"
        eyebrowColor="emerald"
        title="Lifetime Summary"
        padding="section"
      >
        <Stack spacing="lg">
          <Grid cols={2} colsLg={4} gap="md">
            <StatCard
              label="Total Workouts"
              value={aggregated.totalLogsCount}
              accent="emerald"
              sublabel="Completed runs"
            />
            <StatCard
              label="Hours Trained"
              value={aggregated.lifetimeHours}
              unit="hrs"
              accent="emerald"
              sublabel={aggregated.lifetimeHours > 0 ? "Measured duration" : "Logged sessions"}
            />
            <StatCard
              label="Total Sets"
              value={aggregated.lifetimeSets.toLocaleString()}
              accent="emerald"
              sublabel="Executed sets"
            />
            <StatCard
              label="Total Volume"
              value={(aggregated.lifetimeVolume / 1000).toFixed(0)}
              unit="k kg"
              accent="emerald"
              sublabel="Cumulative tonnage"
            />
          </Grid>

          {aggregated.firstLogDate && (
            <div className={cn("pt-4 border-t flex items-center", GAP.sm, BORDER.subtle, TYPOGRAPHY.label, "text-zinc-400")}>
              <Sparkles size={14} className="text-emerald-400 shrink-0" />
              <span>
                Training active since <strong className="text-white">{aggregated.firstLogDate}</strong>
              </span>
            </div>
          )}
        </Stack>
      </Section>

      {/* 8. SECTION 7: TRAINING GAP & ACTIVITY */}
      <Section
        eyebrow="Spacing & Cadence"
        eyebrowColor="zinc"
        title="Training Cadence"
        padding="section"
      >
        <Grid cols={1} colsMd={3} gap="md">
          <StatCard
            label="Last Session"
            value={aggregated.daysSinceLast === 0 ? 'Today' : `${aggregated.daysSinceLast}`}
            unit={aggregated.daysSinceLast === 0 ? '' : 'd ago'}
            accent="zinc"
            sublabel="Last recorded workout"
          />
          <StatCard
            label="Average Training Gap"
            value={aggregated.avgGapDays}
            unit="days"
            accent="zinc"
            sublabel="Spacing between sessions"
          />
          <StatCard
            label="Active Days in Window"
            value={aggregated.activeDaysCount}
            unit="days"
            accent="emerald"
            sublabel={`Logged in ${timeRange.toUpperCase()} window`}
          />
        </Grid>
      </Section>

      {/* 9. SECTION 8: INSIGHTS & ROUTINE DISTRIBUTION */}
      <Grid cols={1} colsLg={3} gap="lg">
        {/* Performance Insights using standard Card primitives */}
        <Section
          eyebrow="Automated Synthesis"
          eyebrowColor="emerald"
          title="Performance Insights"
          padding="section"
          className="lg:col-span-2"
        >
          <Stack spacing="sm">
            {insightsList.map((sentence, idx) => (
              <Card
                key={`insight-${idx}`}
                surface="recessed"
                variant="standard"
                padding="compact"
                className={cn("flex items-start", GAP.sm)}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <p className={cn(TYPOGRAPHY.body, "text-zinc-300 text-xs")}>
                  {sentence}
                </p>
              </Card>
            ))}
          </Stack>
        </Section>

        {/* Routine Distribution Pie Chart */}
        <Section
          eyebrow="Split Breakdown"
          eyebrowColor="zinc"
          title="Routine Distribution"
          padding="section"
          className="flex flex-col justify-between"
        >
          {workoutPieData.length > 0 ? (
            <div className="h-48 w-full relative my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workoutPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {workoutPieData.map((entry, idx) => (
                      <Cell
                        key={`cell-${entry.type || idx}`}
                        fill={entry.color}
                        stroke={CHART_THEME.background}
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className={cn(SURFACE.recessed, BORDER.standard, RADIUS.button, SPACING.compact, SHADOW.elevation, "border font-mono text-xs")}>
                            <span style={{ color: d.color }}>{d.name}: </span>
                            <strong className="text-white">{d.value} {d.value === 1 ? 'session' : 'sessions'}</strong>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={cn(TYPOGRAPHY.body, "h-48 flex items-center justify-center text-zinc-500")}>
              No session data in range
            </div>
          )}

          {/* Compact Routine Legend (Top 5) */}
          <div className={cn("flex flex-wrap pt-3 border-t", GAP.sm, BORDER.subtle)}>
            {workoutPieData.slice(0, 5).map((p, idx) => (
              <Badge
                key={`badge-${p.type || idx}`}
                label={`${p.name} (${p.value})`}
                colorOverride={p.color}
                variant="subtle"
                size="sm"
              />
            ))}
          </div>
        </Section>
      </Grid>
    </Stack>
  );
};


