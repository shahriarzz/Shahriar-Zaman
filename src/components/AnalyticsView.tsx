import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
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
  Cell,
  PieChart,
  Pie
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
  Zap,
  Award,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  format,
  parseISO,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  differenceInCalendarDays,
  isValid,
  startOfWeek as getStartOfWeek
} from 'date-fns';
import { useFitness } from '../store/FitnessContext';
import { calculateVolume, WORKOUT_COLORS, getCycleDay } from '../utils/fitnessHelpers';
import { SessionLog, SetLog, Exercise, Workout } from '../types/fitness';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';

type TimeRange = '7d' | '30d' | '90d' | 'all';
type MuscleMetric = 'volume' | 'sets' | 'frequency';

// Map target strings to 8 standard muscle categories
function mapTargetToCategory(targetStr: string): string {
  if (!targetStr) return 'Core';
  const t = targetStr.toLowerCase();
  if (t.includes('chest')) return 'Chest';
  if (t.includes('delt') || t.includes('shoulder')) return 'Shoulders';
  if (t.includes('lat') || t.includes('back')) return 'Back';
  if (t.includes('tricep')) return 'Triceps';
  if (t.includes('bicep') || (t.includes('arm') && !t.includes('forearm'))) return 'Arms';
  if (t.includes('forearm') || t.includes('grip') || t.includes('wrist')) return 'Forearms';
  if (t.includes('quad') || t.includes('glute') || t.includes('leg') || t.includes('hamstring') || t.includes('calf') || t.includes('calves')) return 'Legs';
  if (t.includes('core') || t.includes('ab')) return 'Core';
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

export const AnalyticsView: React.FC = () => {
  const { logs, workouts, appState } = useFitness();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [muscleMetric, setMuscleMetric] = useState<MuscleMetric>('volume');
  const [selected1RMExerciseId, setSelected1RMExerciseId] = useState<string | null>(null);
  const [currentHeatmapMonth, setCurrentHeatmapMonth] = useState<Date>(new Date());

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

  // Set default selected 1RM exercise if not selected
  const active1RMExerciseId = selected1RMExerciseId || priorityExercises[0]?.id || '';

  // 2. Single-pass Aggregation over all logs and time-filtered logs
  const aggregated = useMemo(() => {
    const sortedLogs = (Object.values(logs) as SessionLog[])
      .filter(l => l && l.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalLogsCount = sortedLogs.length;
    const now = new Date();

    // Determine filter cutoff
    let cutoffDateStr: string | null = null;
    let priorCutoffDateStr: string | null = null;
    let cutoffDays = 30;

    if (timeRange === '7d') {
      cutoffDays = 7;
      cutoffDateStr = format(subDays(now, 6), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 13), 'yyyy-MM-dd');
    } else if (timeRange === '30d') {
      cutoffDays = 30;
      cutoffDateStr = format(subDays(now, 29), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 59), 'yyyy-MM-dd');
    } else if (timeRange === '90d') {
      cutoffDays = 90;
      cutoffDateStr = format(subDays(now, 89), 'yyyy-MM-dd');
      priorCutoffDateStr = format(subDays(now, 179), 'yyyy-MM-dd');
    }

    // Filtered logs for time-bounded widgets
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

    // Lifetime metrics (unfiltered)
    let lifetimeVolume = 0;
    let lifetimeSets = 0;
    let lifetimeMinutes = 0;
    const firstLogDate = sortedLogs[0]?.date || null;
    const lastLogDate = sortedLogs[sortedLogs.length - 1]?.date || null;

    // PRs and records map (unfiltered)
    // exerciseId -> { exId, maxWeight, maxReps, maxEpley, date, exName }
    const recordsMap: Record<string, { exId: string; maxWeight: number; repsAtMax: number; maxEpley: number; date: string; exName: string }> = {};

    // Weekly volume map for "Biggest Week Ever"
    const weeklyVolumeMap: Record<string, number> = {};

    // Muscle totals map (Range)
    const rangeMuscleVolume: Record<string, number> = {
      Chest: 0, Shoulders: 0, Back: 0, Arms: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
    };
    const rangeMuscleSets: Record<string, number> = {
      Chest: 0, Shoulders: 0, Back: 0, Arms: 0, Triceps: 0, Forearms: 0, Legs: 0, Core: 0
    };
    const rangeMuscleFrequency: Record<string, Set<string>> = {
      Chest: new Set(), Shoulders: new Set(), Back: new Set(), Arms: new Set(), Triceps: new Set(),
      Forearms: new Set(), Legs: new Set(), Core: new Set()
    };

    // Exercise session counts in range
    const exerciseSessionCounts: Record<string, { name: string; count: number; volume: number }> = {};

    // Workout type distribution in range
    const workoutTypeDistribution: Record<string, number> = {};

    // 1RM Trend data for active 1RM exercise
    const active1RMTrend: { date: string; displayDate: string; epley1RM: number; setDetail: string }[] = [];

    // Map logs by date string for easy lookup
    const logDateMap = new Map<string, SessionLog[]>();

    // Single pass over ALL logs for lifetime & PRs
    sortedLogs.forEach(log => {
      const vol = calculateVolume(log);
      lifetimeVolume += vol;
      lifetimeMinutes += (log.durationMinutes || 45);

      if (log.date) {
        if (!logDateMap.has(log.date)) {
          logDateMap.set(log.date, []);
        }
        logDateMap.get(log.date)!.push(log);

        // Weekly bucket
        try {
          const parsed = parseISO(log.date);
          if (isValid(parsed)) {
            const weekStartStr = format(getStartOfWeek(parsed, { weekStartsOn: 1 }), 'MMM dd, yyyy');
            weeklyVolumeMap[weekStartStr] = (weeklyVolumeMap[weekStartStr] || 0) + vol;
          }
        } catch (_) {}
      }

      // Process sets for PRs
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

              if (!recordsMap[exId] || epley > recordsMap[exId].maxEpley) {
                recordsMap[exId] = {
                  exId,
                  maxWeight: w,
                  repsAtMax: r,
                  maxEpley: epley,
                  date: log.date,
                  exName
                };
              }
            }
          });
        });
      }
    });

    // Range-specific calculations
    let rangeDurationTotal = 0;
    const activeDatesSet = new Set<string>();

    rangeLogs.forEach(log => {
      rangeDurationTotal += (log.durationMinutes || 45);
      if (log.date) activeDatesSet.add(log.date);

      // Workout type distribution using O(1) workoutMap
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

          // Volume & sets
          let exVol = 0;
          doneSets.forEach(s => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps, 10) || 0;
            exVol += (w * r);
          });

          rangeMuscleVolume[category] = (rangeMuscleVolume[category] || 0) + exVol;
          rangeMuscleSets[category] = (rangeMuscleSets[category] || 0) + doneSets.length;
          rangeMuscleFrequency[category]?.add(log.id);

          // Exercise rankings
          if (!exerciseSessionCounts[exId]) {
            exerciseSessionCounts[exId] = {
              name: exMeta?.exercise.name || 'Exercise',
              count: 0,
              volume: 0
            };
          }
          exerciseSessionCounts[exId].count += 1;
          exerciseSessionCounts[exId].volume += exVol;

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
      const today = new Date();
      let checkDate = today;
      let checkStr = format(checkDate, 'yyyy-MM-dd');
      const dateSet = new Set(distinctDates);

      // Start current streak from today or yesterday
      if (!dateSet.has(checkStr)) {
        checkDate = subDays(today, 1);
        checkStr = format(checkDate, 'yyyy-MM-dd');
      }

      while (dateSet.has(checkStr)) {
        currentStreak++;
        checkDate = subDays(checkDate, 1);
        checkStr = format(checkDate, 'yyyy-MM-dd');
      }

      // Calculate Longest Streak across all history
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

    // 4. Correctness: Consistency % and Missed Days derived directly from INITIAL_WORKOUTS cycle structure
    // Iterate day-by-day across the selected window up to today
    const rangeStartDate = cutoffDateStr
      ? parseISO(cutoffDateStr)
      : (firstLogDate ? parseISO(firstLogDate) : subDays(now, 30));
    
    const validRangeStart = isValid(rangeStartDate) ? rangeStartDate : subDays(now, 30);
    const dayInterval = eachDayOfInterval({
      start: validRangeStart,
      end: now
    });

    let expectedCoreWorkouts = 0;
    let completedCoreWorkouts = 0;
    let scheduledRestDays = 0;
    let missedTrainingDays = 0;

    dayInterval.forEach(dayDate => {
      const dateStr = format(dayDate, 'yyyy-MM-dd');
      const cycleDay = getCycleDay(appState?.cycleStart, dayDate);
      const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
      const dayLogs = logDateMap.get(dateStr) || [];
      const hasCompletedWorkout = dayLogs.some(l => l.complete || calculateVolume(l) > 0);

      const isScheduledCoreTraining = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
      const isScheduledRest = expectedWo && expectedWo.type === 'rest';

      if (isScheduledCoreTraining) {
        expectedCoreWorkouts++;
        if (hasCompletedWorkout) {
          completedCoreWorkouts++;
        } else {
          // If past day (or today not yet completed), it counts as a skipped training day
          missedTrainingDays++;
        }
      } else if (isScheduledRest) {
        scheduledRestDays++;
        // If user worked out on a rest day, count toward completed core / bonus work without penalizing expected
        if (hasCompletedWorkout) {
          completedCoreWorkouts++;
        }
      } else {
        // Fallback for custom or unassigned days
        if (hasCompletedWorkout) {
          completedCoreWorkouts++;
        }
      }
    });

    // Ensure expectedCoreWorkouts has baseline to prevent div by 0
    const finalExpectedCore = Math.max(1, expectedCoreWorkouts);
    const consistencyPct = Math.min(100, Math.round((completedCoreWorkouts / finalExpectedCore) * 100));

    // Period-over-period percentage change for volume
    let volumePeriodChangePct: number | null = null;
    if (cutoffDateStr && priorVolume > 0) {
      volumePeriodChangePct = Math.round(((rangeVolume - priorVolume) / priorVolume) * 100);
    } else if (cutoffDateStr && priorVolume === 0 && rangeVolume > 0) {
      volumePeriodChangePct = 100;
    }

    // Average session duration
    const avgDuration = rangeLogs.length > 0 ? Math.round(rangeDurationTotal / rangeLogs.length) : 0;

    // Biggest week ever
    let biggestWeek = { weekStr: 'N/A', volume: 0 };
    Object.entries(weeklyVolumeMap).forEach(([wStr, vol]) => {
      if (vol > biggestWeek.volume) {
        biggestWeek = { weekStr: wStr, volume: vol };
      }
    });

    // Top ranked exercises in range
    const topExercises = Object.values(exerciseSessionCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Days since last workout & recovery metrics
    let daysSinceLast = 0;
    if (lastLogDate) {
      daysSinceLast = Math.max(0, differenceInCalendarDays(now, parseISO(lastLogDate)));
    }

    // Average gap between sessions
    let avgGapDays = 0;
    if (sortedLogs.length > 1) {
      let totalGaps = 0;
      for (let i = 1; i < sortedLogs.length; i++) {
        totalGaps += Math.max(0, differenceInCalendarDays(parseISO(sortedLogs[i].date), parseISO(sortedLogs[i - 1].date)));
      }
      avgGapDays = Math.round((totalGaps / (sortedLogs.length - 1)) * 10) / 10;
    }

    return {
      totalLogsCount,
      rangeLogsCount: rangeLogs.length,
      lifetimeVolume,
      lifetimeSets,
      lifetimeHours: Math.round((lifetimeMinutes / 60) * 10) / 10,
      firstLogDate,
      lastLogDate,
      rangeVolume,
      priorVolume,
      volumePeriodChangePct,
      activeDaysCount: activeDatesSet.size,
      expectedCoreWorkouts: finalExpectedCore,
      completedCoreWorkouts,
      scheduledRestDays,
      missedTrainingDays,
      consistencyPct,
      currentStreak,
      longestStreak,
      avgDuration,
      biggestWeek,
      recordsList: Object.values(recordsMap).sort((a, b) => b.maxEpley - a.maxEpley),
      rangeMuscleVolume,
      rangeMuscleSets,
      rangeMuscleFrequency,
      topExercises,
      workoutTypeDistribution,
      active1RMTrend,
      daysSinceLast,
      avgGapDays
    };
  }, [logs, workouts, exMap, workoutMap, coreWorkoutByCycleDayMap, active1RMExerciseId, timeRange, appState?.cycleStart]);

  // 3. Heatmap calendar range calculations (Normalized PER-MONTH with rich workout name tooltips)
  const heatmapData = useMemo(() => {
    const monthStart = startOfMonth(currentHeatmapMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    // Map logs for the month: date -> { volume, workoutNames, doneSets, hasLog }
    const logVolMap: Record<string, number> = {};
    const dayDetailMap: Record<string, { workoutNames: string[]; volume: number; doneSets: number }> = {};

    (Object.values(logs) as SessionLog[]).forEach(l => {
      if (l && l.date) {
        const vol = calculateVolume(l);
        logVolMap[l.date] = (logVolMap[l.date] || 0) + vol;

        const wo = workoutMap.get(l.workoutId);
        const woName = wo?.name || 'Session';

        let doneSetsCount = 0;
        if (l.sets) {
          Object.values(l.sets).forEach(sList => {
            doneSetsCount += (sList as SetLog[]).filter(s => s.done).length;
          });
        }

        if (!dayDetailMap[l.date]) {
          dayDetailMap[l.date] = { workoutNames: [woName], volume: vol, doneSets: doneSetsCount };
        } else {
          dayDetailMap[l.date].workoutNames.push(woName);
          dayDetailMap[l.date].volume += vol;
          dayDetailMap[l.date].doneSets += doneSetsCount;
        }
      }
    });

    // Normalize per-month ONLY: find max day volume specifically in this month
    let maxDayVol = 1;
    days.forEach(day => {
      if (isSameMonth(day, monthStart)) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayVol = logVolMap[dateStr] || 0;
        if (dayVol > maxDayVol) {
          maxDayVol = dayVol;
        }
      }
    });

    return {
      monthStart,
      days,
      logVolMap,
      dayDetailMap,
      maxDayVol
    };
  }, [currentHeatmapMonth, logs, workoutMap]);

  // Heatmap intensity step helper (0 to 4)
  const getIntensityClass = (vol: number, maxVol: number) => {
    if (vol <= 0) return 'bg-zinc-900/60 border-zinc-800/40 text-zinc-600';
    const ratio = vol / maxVol;
    if (ratio < 0.25) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (ratio < 0.50) return 'bg-emerald-500/45 text-emerald-300 border-emerald-500/50';
    if (ratio < 0.75) return 'bg-emerald-500/75 text-emerald-200 border-emerald-500/70';
    return 'bg-emerald-500 text-black font-bold border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]';
  };

  // 4. Muscle chart data formatted for Recharts
  const muscleChartData = useMemo(() => {
    const categories = ['Chest', 'Shoulders', 'Back', 'Arms', 'Triceps', 'Forearms', 'Legs', 'Core'];
    return categories.map(cat => {
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
    return Object.entries(aggregated.workoutTypeDistribution).map(([type, count]) => ({
      name: type.toUpperCase(),
      type,
      value: count,
      color: WORKOUT_COLORS[type as keyof typeof WORKOUT_COLORS] || '#10b981'
    }));
  }, [aggregated.workoutTypeDistribution]);

  // 6. Insights Generator
  const insightsList = useMemo(() => {
    const list: string[] = [];

    // Rule 1: Muscle volume split
    const topMuscle = (Object.entries(aggregated.rangeMuscleVolume) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (topMuscle && topMuscle[1] > 0) {
      const topVol = topMuscle[1];
      const pct = Math.round((topVol / Math.max(1, aggregated.rangeVolume)) * 100);
      list.push(`${topMuscle[0]} targeting leads training output, accounting for ${pct}% of total tonnage over this window.`);
    }

    // Rule 2: Highest volume workout type
    const topTypeEntry = (Object.entries(aggregated.workoutTypeDistribution) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0];
    if (topTypeEntry) {
      list.push(`${topTypeEntry[0].toUpperCase()} routines represent your primary split focus (${topTypeEntry[1]} logged sessions).`);
    }

    // Rule 3: Consistency rate
    if (aggregated.consistencyPct >= 80) {
      list.push(`High adherence: ${aggregated.consistencyPct}% consistency rate across scheduled core cycle workouts.`);
    } else {
      list.push(`Current consistency rate sits at ${aggregated.consistencyPct}% — complete scheduled core days to hit target growth.`);
    }

    // Rule 4: Top exercise consistency
    if (aggregated.topExercises.length > 0) {
      const topEx = aggregated.topExercises[0];
      list.push(`${topEx.name} is your most frequently logged movement with ${topEx.count} completed sessions.`);
    }

    // Rule 5: Session duration
    if (aggregated.avgDuration > 0) {
      list.push(`Average session length is ${aggregated.avgDuration} minutes, aligned with high-density hypertrophy standards.`);
    }

    return list.slice(0, 5);
  }, [aggregated]);

  return (
    <div className="space-y-12 pt-4 pb-16">
      {/* 1. HEADER & TIME TOGGLE */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-500 uppercase font-bold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Performance Intel
          </span>
          <h1 className="text-4xl md:text-6xl font-black uppercase leading-[0.85] tracking-tighter">
            Analytics
          </h1>
        </div>

        {/* Time range segmented control */}
        <div className="bg-zinc-900/90 border border-zinc-800 p-1 rounded-2xl flex items-center gap-1 w-full md:w-auto overflow-x-auto">
          {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                haptics.selection();
                setTimeRange(r);
              }}
              className={cn(
                "flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer",
                timeRange === r
                  ? "bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              )}
            >
              {r === 'all' ? 'ALL' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 2. SECTION 1: OVERVIEW HERO STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak: Clearly split Current vs Longest */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-5 space-y-2 relative overflow-hidden group hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div className="flex justify-between items-center text-zinc-500">
            <span className="font-mono text-[10px] uppercase tracking-widest">Training Streak</span>
            <Flame size={16} className="text-orange-500" />
          </div>
          <div>
            <div className="text-3xl lg:text-4xl font-black font-mono text-white tracking-tight">
              {aggregated.currentStreak} <span className="text-sm font-sans font-medium text-zinc-500">days</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">
              Current Streak
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
            <span className="text-zinc-500 uppercase">Longest Streak</span>
            <span className="text-orange-400 font-bold">{aggregated.longestStreak} days</span>
          </div>
        </div>

        {/* Training Days vs Core Expected */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-5 space-y-2 relative overflow-hidden group hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div className="flex justify-between items-center text-zinc-500">
            <span className="font-mono text-[10px] uppercase tracking-widest">Core Workouts</span>
            <CalendarIcon size={16} className="text-emerald-500" />
          </div>
          <div>
            <div className="text-3xl lg:text-4xl font-black font-mono text-white tracking-tight">
              {aggregated.completedCoreWorkouts}
              <span className="text-lg text-zinc-500 font-normal">/{aggregated.expectedCoreWorkouts}</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">
              Completed / Expected
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
            <span className="text-rose-400 font-bold">{aggregated.missedTrainingDays} skipped</span>
            <span className="text-zinc-500">{aggregated.scheduledRestDays} rest days</span>
          </div>
        </div>

        {/* Consistency %: Pure core workout adherence */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-5 space-y-2 relative overflow-hidden group hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div className="flex justify-between items-center text-zinc-500">
            <span className="font-mono text-[10px] uppercase tracking-widest">Consistency</span>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl lg:text-4xl font-black font-mono text-emerald-400 tracking-tight">
              {aggregated.consistencyPct}%
            </div>
            <p className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">
              Core Adherence
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
            <span className="text-zinc-500 uppercase">Rest Days Exempt</span>
            <span className="text-emerald-400 font-bold">100% accurate</span>
          </div>
        </div>

        {/* Window Volume with Period-over-Period Comparison */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-5 space-y-2 relative overflow-hidden group hover:border-zinc-700 transition-all flex flex-col justify-between">
          <div className="flex justify-between items-center text-zinc-500">
            <span className="font-mono text-[10px] uppercase tracking-widest">Window Volume</span>
            <Dumbbell size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl lg:text-4xl font-black font-mono text-white tracking-tight">
              {(aggregated.rangeVolume / 1000).toFixed(1)}k <span className="text-sm font-sans font-medium text-zinc-500">kg</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">
              Tonnage lifted
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
            {aggregated.volumePeriodChangePct !== null ? (
              <>
                <span className="text-zinc-500 uppercase">vs prior {timeRange}</span>
                <span className={cn(
                  "font-bold flex items-center gap-0.5",
                  aggregated.volumePeriodChangePct > 0 ? "text-emerald-400" : (aggregated.volumePeriodChangePct < 0 ? "text-rose-400" : "text-zinc-400")
                )}>
                  {aggregated.volumePeriodChangePct > 0 ? (
                    <TrendingUp size={12} />
                  ) : aggregated.volumePeriodChangePct < 0 ? (
                    <TrendingDown size={12} />
                  ) : null}
                  {aggregated.volumePeriodChangePct > 0 ? `+${aggregated.volumePeriodChangePct}%` : `${aggregated.volumePeriodChangePct}%`}
                </span>
              </>
            ) : (
              <>
                <span className="text-zinc-500 uppercase">Window</span>
                <span className="text-zinc-400 font-bold">{timeRange.toUpperCase()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. SECTION 2: CONSISTENCY (HEATMAP) */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
              Adherence Matrix
            </span>
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Monthly Intensity Heatmap
            </h2>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase font-bold text-zinc-300 mr-2">
              {format(heatmapData.monthStart, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(subMonths(currentHeatmapMonth, 1));
              }}
              className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-full cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(addMonths(currentHeatmapMonth, 1));
              }}
              className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-full cursor-pointer transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="space-y-2">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center font-mono text-[10px] text-zinc-500 uppercase font-bold">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {heatmapData.days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, heatmapData.monthStart);
              const vol = heatmapData.logVolMap[dateStr] || 0;
              const detail = heatmapData.dayDetailMap[dateStr];
              const intensityClass = getIntensityClass(vol, heatmapData.maxDayVol);

              // Cycle expected workout lookup for tooltips
              const cycleDay = getCycleDay(appState?.cycleStart, day);
              const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);

              let tooltipText = `${dateStr}`;
              if (detail && detail.workoutNames.length > 0) {
                tooltipText = `${dateStr} • ${detail.workoutNames.join(', ')} (${vol.toLocaleString()} kg lifted, ${detail.doneSets} sets)`;
              } else if (expectedWo?.type === 'rest') {
                tooltipText = `${dateStr} • Scheduled Rest Day (${expectedWo.name})`;
              } else if (expectedWo) {
                tooltipText = `${dateStr} • Scheduled: ${expectedWo.name} (No log recorded)`;
              } else {
                tooltipText = `${dateStr} • Rest Day`;
              }

              return (
                <div
                  key={dateStr}
                  title={tooltipText}
                  className={cn(
                    "aspect-square rounded-xl border flex flex-col items-center justify-center text-xs transition-all p-1 relative group cursor-default",
                    isCurrentMonth ? intensityClass : "opacity-20 bg-zinc-950 border-zinc-900 text-zinc-700"
                  )}
                >
                  <span className="font-mono text-[10px] leading-none">{format(day, 'd')}</span>
                  {vol > 0 && isCurrentMonth && (
                    <span className="text-[7px] font-mono leading-none mt-1 opacity-80">
                      {(vol / 1000).toFixed(1)}k
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend + Summary line */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-zinc-800/60 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase">Less</span>
            <div className="flex gap-1">
              <span className="w-3.5 h-3.5 rounded bg-zinc-900 border border-zinc-800" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-500/20 border border-emerald-500/30" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-500/45 border border-emerald-500/50" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-500/75 border border-emerald-500/70" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-400" />
            </div>
            <span className="text-[10px] text-zinc-500 uppercase">More</span>
          </div>

          <div className="text-zinc-400 text-[11px] font-mono">
            <span className="text-emerald-400 font-bold">{aggregated.activeDaysCount}</span> Active Days · <span className="text-zinc-500">{aggregated.missedTrainingDays} Skipped</span> · <span className="text-zinc-300">{aggregated.consistencyPct}% Consistency</span>
          </div>
        </div>
      </div>

      {/* 4. SECTION 3: PERFORMANCE (1RM TREND CHART) */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
              Strength Progression
            </span>
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Estimated 1RM Trend
            </h2>
          </div>

          {/* Exercise selector for priority compound lifts */}
          {priorityExercises.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] font-mono text-zinc-500 uppercase shrink-0">Lift:</span>
              <div className="flex gap-1">
                {priorityExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => {
                      haptics.selection();
                      setSelected1RMExerciseId(ex.id);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer whitespace-nowrap",
                      active1RMExerciseId === ex.id
                        ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                    )}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Line chart container */}
        {aggregated.active1RMTrend.length > 0 ? (
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={aggregated.active1RMTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="displayDate" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl shadow-2xl font-mono text-xs space-y-1">
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
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ fill: '#10b981', r: 4, stroke: '#09090e', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#34d399', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex flex-col items-center justify-center bg-zinc-950/40 rounded-2xl border border-dashed border-zinc-800 text-center p-6 space-y-2">
            <TrendingUp size={24} className="text-zinc-600" />
            <p className="text-xs font-mono text-zinc-400">
              No completed logs recorded for this exercise in the selected time range.
            </p>
          </div>
        )}

        {/* Summary beneath chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Average Session Duration */}
          <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-2xl p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-mono text-[9px] uppercase text-zinc-500">Average Session Length</span>
              <div className="text-2xl font-black font-mono text-white">
                {aggregated.avgDuration} <span className="text-sm text-zinc-500 font-normal">minutes</span>
              </div>
            </div>
            <Clock size={24} className="text-emerald-500 opacity-80" />
          </div>

          {/* Biggest Training Week Ever */}
          <div className="bg-orange-500/10 border border-orange-500/40 rounded-2xl p-4 flex items-center justify-between relative overflow-hidden">
            <div className="space-y-1 z-10">
              <span className="font-mono text-[9px] uppercase tracking-wider text-orange-400 font-bold flex items-center gap-1.5">
                <Trophy size={12} className="text-orange-400" />
                Biggest Week Ever
              </span>
              <div className="text-2xl font-black font-mono text-white">
                {(aggregated.biggestWeek.volume / 1000).toFixed(1)}k <span className="text-sm font-normal text-orange-200">kg</span>
              </div>
              <p className="text-[10px] font-mono text-orange-300/80">{aggregated.biggestWeek.weekStr}</p>
            </div>
            <Trophy size={40} className="text-orange-500/20 absolute -right-2 -bottom-2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 5. SECTION 4: MUSCLES (HORIZONTAL BAR CHART) */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
              Anatomical Load Distribution
            </span>
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Muscle Group Targeting
            </h2>
          </div>

          {/* Metric toggle */}
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-2xl flex items-center gap-1">
            {(['volume', 'sets', 'frequency'] as MuscleMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  haptics.selection();
                  setMuscleMetric(m);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer",
                  muscleMetric === m
                    ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Horizontal Bar Chart */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={muscleChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" stroke="#71717a" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis dataKey="category" type="category" stroke="#a1a1aa" fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl font-mono text-xs">
                        <span className="text-zinc-400 uppercase">{d.category}: </span>
                        <strong className="text-emerald-400 font-bold">{d.formattedVal}</strong>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[0, 8, 8, 0]}>
                {muscleChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill="#10b981" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary beneath: Exercise Rankings */}
        <div className="pt-2 border-t border-zinc-800/60 space-y-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
            Top Trained Exercises in Window
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {aggregated.topExercises.length > 0 ? (
              aggregated.topExercises.map((ex, idx) => (
                <div key={ex.name} className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-3 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="truncate space-y-0.5">
                    <p className="text-xs font-bold text-white truncate">{ex.name}</p>
                    <p className="text-[10px] font-mono text-zinc-500">{ex.count} sessions</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs font-mono text-zinc-500 col-span-full">No exercise logs recorded in this period.</p>
            )}
          </div>
        </div>
      </div>

      {/* SUBTLE DIVIDER BEFORE LIFETIME & RECORDS */}
      <div className="relative pt-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-800/80" />
        </div>
        <div className="relative flex justify-center text-xs uppercase font-mono tracking-[0.3em] font-bold">
          <span className="bg-[#09090e] px-4 text-zinc-500">Historical Archives & Lifetime Data</span>
        </div>
      </div>

      {/* 6. SECTION 5: RECORDS (Using exId for unique key) */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-orange-500 block font-bold">
              Personal Bests
            </span>
            <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Trophy size={18} className="text-orange-500" />
              Records
            </h2>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            All-Time Highs
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {aggregated.recordsList.length > 0 ? (
            aggregated.recordsList.map((rec) => (
              <div
                key={rec.exId}
                className="bg-zinc-950/60 border border-orange-500/20 hover:border-orange-500/50 rounded-2xl p-4 flex items-center justify-between transition-all group"
              >
                <div className="space-y-1 truncate pr-2">
                  <p className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors truncate">
                    {rec.exName}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-500">
                    Logged: {rec.date}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black font-mono text-orange-400">
                    {rec.maxWeight}kg × {rec.repsAtMax}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-500 uppercase">
                    1RM ~{rec.maxEpley}kg
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs font-mono text-zinc-500 col-span-full">No weight records logged yet.</p>
          )}
        </div>
      </div>

      {/* 7. SECTION 6: LIFETIME (Unified emerald accent borders matching analytics palette) */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-8 space-y-8">
        <div className="space-y-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
            Cumulative Milestones
          </span>
          <h2 className="text-2xl font-black uppercase tracking-wider text-white">
            Lifetime Summary
          </h2>
        </div>

        {/* Big Number Hero Treatment with single consistent emerald border */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-mono text-xs uppercase text-zinc-500 block">Total Workouts</span>
            <div className="text-4xl lg:text-5xl font-black font-mono text-white tracking-tight">
              {aggregated.totalLogsCount}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Completed runs</p>
          </div>

          <div className="space-y-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-mono text-xs uppercase text-zinc-500 block">Hours Trained</span>
            <div className="text-4xl lg:text-5xl font-black font-mono text-white tracking-tight">
              {aggregated.lifetimeHours}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">In-gym duration</p>
          </div>

          <div className="space-y-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-mono text-xs uppercase text-zinc-500 block">Total Sets</span>
            <div className="text-4xl lg:text-5xl font-black font-mono text-white tracking-tight">
              {aggregated.lifetimeSets.toLocaleString()}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Executed sets</p>
          </div>

          <div className="space-y-2 border-l-2 border-emerald-500 pl-4">
            <span className="font-mono text-xs uppercase text-zinc-500 block">Total Volume</span>
            <div className="text-4xl lg:text-5xl font-black font-mono text-white tracking-tight">
              {(aggregated.lifetimeVolume / 1000).toFixed(0)}k <span className="text-base text-zinc-500 font-normal">kg</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Cumulative tonnage</p>
          </div>
        </div>

        {aggregated.firstLogDate && (
          <div className="pt-4 border-t border-zinc-800/60 font-mono text-xs text-zinc-400 flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-400" />
            Training active since <strong className="text-white">{aggregated.firstLogDate}</strong>
          </div>
        )}
      </div>

      {/* 8. SECTION 7: RECOVERY */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-4">
        <div className="space-y-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
            Rest & Adaptation
          </span>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">
            Recovery Metrics
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-4 space-y-1">
            <span className="font-mono text-[10px] uppercase text-zinc-500 block">Days Since Last Session</span>
            <div className="text-2xl font-black font-mono text-white">
              {aggregated.daysSinceLast === 0 ? 'Today' : `${aggregated.daysSinceLast} day${aggregated.daysSinceLast > 1 ? 's' : ''} ago`}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Muscle recovery status</p>
          </div>

          <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-4 space-y-1">
            <span className="font-mono text-[10px] uppercase text-zinc-500 block">Average Gap Between Runs</span>
            <div className="text-2xl font-black font-mono text-white">
              {aggregated.avgGapDays} <span className="text-sm font-normal text-zinc-500">days</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Historical rest spacing</p>
          </div>

          <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-2xl p-4 space-y-1">
            <span className="font-mono text-[10px] uppercase text-zinc-500 block">Current Rest Phase</span>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {aggregated.daysSinceLast === 0 ? 'Active Training' : `${aggregated.daysSinceLast} Rest Day${aggregated.daysSinceLast > 1 ? 's' : ''}`}
            </div>
            <p className="text-[10px] font-mono text-zinc-500">Adaptation window</p>
          </div>
        </div>
      </div>

      {/* 9. SECTION 8: INSIGHTS & WORKOUT TYPE SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deterministic Sentences List */}
        <div className="lg:col-span-2 bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-4">
          <div className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-500 block font-bold">
              Automated Synthesis
            </span>
            <h2 className="text-xl font-black uppercase tracking-wider text-white">
              Data Insights
            </h2>
          </div>

          <div className="space-y-3 pt-2">
            {insightsList.map((sentence, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-zinc-950/40 border border-zinc-800/50 p-3.5 rounded-2xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <p className="font-mono text-xs text-zinc-300 leading-relaxed">
                  {sentence}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Workout Type Distribution Pie Chart */}
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500 block font-bold">
              Split Breakdown
            </span>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">
              Routine Distribution
            </h2>
          </div>

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
                    {workoutPieData.map((entry) => (
                      <Cell key={`cell-${entry.type}`} fill={entry.color} stroke="#09090e" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-xl font-mono text-xs">
                            <span style={{ color: d.color }}>{d.name}: </span>
                            <strong className="text-white">{d.value} sessions</strong>
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
            <div className="h-48 flex items-center justify-center font-mono text-xs text-zinc-500">
              No session data in range
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/60">
            {workoutPieData.map((p) => (
              <div key={p.type} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

