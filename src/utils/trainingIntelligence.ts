import {
  format,
  parseISO,
  subDays,
  subWeeks,
  isValid,
  startOfDay,
  startOfWeek,
  endOfWeek,
  isSameDay,
  eachDayOfInterval,
  differenceInCalendarDays
} from 'date-fns';
import { Workout, SessionLog, SetLog } from '../types/fitness';
import type { FitnessIndex, ExerciseIndexEntry } from './fitnessDerivedSelectors';
import { isCompletedSession, getCycleDay } from './fitnessCalculations';

// ----------------------------------------------------------------------------
// Types & Contracts
// ----------------------------------------------------------------------------

export interface StreakInsight {
  currentStreak: number;
  longestStreak: number;
  streakStartDate: string | null;
  streakEndDate: string | null;
}

export interface TrainingFrequencyInsight {
  sessionsPerWeek: number;
  completedSessions: number;
  previousSessions: number;
  change: number;
  sessionsChange: number;
}

export interface AdherenceInsight {
  rate: number;
  percent: number;
  completedScheduled: number;
  scheduledCoreWorkouts: number;
  evaluatedScheduledWorkouts: number;
  pendingScheduledWorkouts: number;
  missedPastCoreDays: number;
  scheduledRestDays: number;
  bonusCompletedSessions: number;
  isTodayPending: boolean;
}

export interface PREvent {
  id: string;
  exerciseDefinitionId: string;
  exerciseName: string;
  date: string;
  monthKey: string;
  weight: number;
  reps: number;
  e1rm: number;
  isWeightPR: boolean;
  isE1RMPR: boolean;
}

/**
 * Calculates the exact median of a numbers array.
 * Odd count -> exact middle value.
 * Even count -> average of the two middle values.
 * Empty array -> 0.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface ExerciseStrengthTrendBreakdown {
  exerciseDefinitionId: string;
  exerciseName: string;
  currentBestE1RM: number;
  previousBestE1RM: number;
  percentChange: number;
}

export interface StrengthTrendInsight {
  percentChange: number | null;
  /** Median current best e1RM across comparable exercises (not a single athlete e1RM) */
  currentValue: number | null;
  /** Median previous best e1RM across comparable exercises (not a single athlete e1RM) */
  previousValue: number | null;
  /** Explicit alias for currentValue */
  medianCurrentE1RM?: number | null;
  /** Explicit alias for previousValue */
  medianPreviousE1RM?: number | null;
  comparableExercises: number;
  confidence: 'high' | 'medium' | 'low';
  exerciseBreakdown: ExerciseStrengthTrendBreakdown[];
}

export type PerformanceScoreStatus = 'Excellent' | 'Strong' | 'Good' | 'Needs attention' | 'Struggling' | 'Unavailable';

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface PerformanceEvaluationWindow {
  currentRange: DateRange;
  previousRange: DateRange;
}

export interface PerformanceScoreComponent {
  score: number | null;
  weight: number;
  available: boolean;
  windowType: 'current_window' | 'previous_window' | 'lifetime_baseline';
  windowDescription: string;
}

export interface PerformanceScoreInsight {
  score: number | null;
  status: PerformanceScoreStatus;
  components: {
    adherence: PerformanceScoreComponent;
    completion: PerformanceScoreComponent;
    strengthProgression: PerformanceScoreComponent;
    performanceVsPrevious: PerformanceScoreComponent;
    volumeConsistency: PerformanceScoreComponent;
  };
  confidence: 'high' | 'medium' | 'low';
  primaryFactors: string[];
  evaluationWindow: PerformanceEvaluationWindow;
}

// ----------------------------------------------------------------------------
// 1. Canonical Training Streak
// ----------------------------------------------------------------------------

export interface CalculateStreakOptions {
  index: FitnessIndex;
  coreWorkoutByCycleDayMap: Map<number, Workout>;
  cycleStart?: string | null;
  now?: Date | string;
}

/**
 * Calculates consecutive scheduled training opportunities completed,
 * counting backward from the latest relevant scheduled day.
 *
 * Invariants:
 * - completed scheduled workout -> continues streak
 * - skipped scheduled workout -> breaks streak
 * - incomplete scheduled workout -> breaks completion continuity (not completed)
 * - programmed rest day -> neutral
 * - unscheduled day -> neutral
 * - bonus workout -> does not extend scheduled streak
 * - future scheduled workout -> cannot break current streak
 * - current-day workout not yet completed -> does not prematurely break streak
 */
export function calculateTrainingStreak({
  index,
  coreWorkoutByCycleDayMap,
  cycleStart,
  now = new Date()
}: CalculateStreakOptions): StreakInsight {
  const completedLogs = index.sortedLogsAscending.filter(isCompletedSession);
  if (completedLogs.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      streakStartDate: null,
      streakEndDate: null
    };
  }

  const firstDateStr = index.lifetimeStats.firstSessionDate || completedLogs[0]?.date;
  if (!firstDateStr) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      streakStartDate: null,
      streakEndDate: null
    };
  }

  const parsedStart = parseISO(firstDateStr);
  const parsedNow = typeof now === 'string' ? parseISO(now) : now;
  const validStart = isValid(parsedStart) ? startOfDay(parsedStart) : startOfDay(new Date());
  const validNow = isValid(parsedNow) ? startOfDay(parsedNow) : startOfDay(new Date());
  const todayStr = format(validNow, 'yyyy-MM-dd');

  const intervalStart = validStart > validNow ? validNow : validStart;
  const days = eachDayOfInterval({ start: intervalStart, end: validNow });

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreakStart: string | null = null;
  let tempStreakEnd: string | null = null;

  days.forEach(dayDate => {
    const dateStr = format(dayDate, 'yyyy-MM-dd');
    const isToday = isSameDay(dayDate, validNow) || dateStr === todayStr;
    const isPast = dayDate < validNow && !isToday;

    const isWithinActiveSchedule = !cycleStart || dateStr >= cycleStart;
    const dayLogs = index.logsByDate.get(dateStr) || [];

    if (isWithinActiveSchedule) {
      const cycleDay = getCycleDay(cycleStart, dayDate);
      const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
      const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
      const hasCompletedExpected = isScheduledCore
        ? dayLogs.some(l => isCompletedSession(l) && l.workoutId === expectedWo.id)
        : false;

      if (isScheduledCore) {
        if (hasCompletedExpected) {
          currentStreak++;
          if (!tempStreakStart) {
            tempStreakStart = dateStr;
          }
          tempStreakEnd = dateStr;
          if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
          }
        } else {
          if (isPast) {
            // Skipped scheduled workout breaks streak
            currentStreak = 0;
            tempStreakStart = null;
            tempStreakEnd = null;
          } else if (isToday) {
            // Current-day workout not yet completed -> does not prematurely break streak
          }
        }
      } else {
        // Programmed rest day or unscheduled day is neutral.
        // Bonus workouts on rest/unscheduled days do not extend scheduled streak.
      }
    } else {
      // Historical boundary: Prior to active cycleStart, verifiable scheduled cycle is unavailable.
      // Do not fabricate scheduled streak continuity across rest or gap days.
      const hasCompleted = dayLogs.some(isCompletedSession);
      if (hasCompleted) {
        currentStreak++;
        if (!tempStreakStart) {
          tempStreakStart = dateStr;
        }
        tempStreakEnd = dateStr;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      } else {
        // Any gap day prior to cycleStart without an established schedule breaks continuity
        currentStreak = 0;
        tempStreakStart = null;
        tempStreakEnd = null;
      }
    }
  });

  return {
    currentStreak,
    longestStreak,
    streakStartDate: currentStreak > 0 ? tempStreakStart : null,
    streakEndDate: currentStreak > 0 ? tempStreakEnd : null
  };
}

// ----------------------------------------------------------------------------
// 2. Training Frequency
// ----------------------------------------------------------------------------

export interface CalculateFrequencyOptions {
  index: FitnessIndex;
  now?: Date | string;
  windowDays?: number; // default 28 days
}

/**
 * Calculates training frequency (sessions per week) over the rolling window (default 28 days).
 *
 * Invariants:
 * - Counts completed scheduled sessions and completed bonus sessions.
 * - Does not count incomplete sessions, skipped sessions, or rest days.
 * - Compares with the preceding equal-length window.
 */
export function calculateTrainingFrequency({
  index,
  now = new Date(),
  windowDays = 28
}: CalculateFrequencyOptions): TrainingFrequencyInsight {
  const parsedNow = typeof now === 'string' ? parseISO(now) : now;
  const validNow = isValid(parsedNow) ? startOfDay(parsedNow) : startOfDay(new Date());

  const currentEndStr = format(validNow, 'yyyy-MM-dd');
  const currentStartStr = format(subDays(validNow, windowDays - 1), 'yyyy-MM-dd');

  const previousEndStr = format(subDays(validNow, windowDays), 'yyyy-MM-dd');
  const previousStartStr = format(subDays(validNow, (2 * windowDays) - 1), 'yyyy-MM-dd');

  const completedLogs = index.sortedLogsAscending.filter(isCompletedSession);

  const completedSessions = completedLogs.filter(l => l.date >= currentStartStr && l.date <= currentEndStr).length;
  const previousSessions = completedLogs.filter(l => l.date >= previousStartStr && l.date <= previousEndStr).length;

  const weeks = windowDays / 7;
  const sessionsPerWeek = completedSessions / weeks;
  const previousSessionsPerWeek = previousSessions / weeks;
  const change = sessionsPerWeek - previousSessionsPerWeek;
  const sessionsChange = completedSessions - previousSessions;

  return {
    sessionsPerWeek,
    completedSessions,
    previousSessions,
    change,
    sessionsChange
  };
}

// ----------------------------------------------------------------------------
// 3. Adherence Rate
// ----------------------------------------------------------------------------

export interface CalculateAdherenceOptions {
  index: FitnessIndex;
  coreWorkoutByCycleDayMap: Map<number, Workout>;
  cycleStart?: string | null;
  startDate?: Date | string;
  endDate?: Date | string;
  now?: Date | string;
}

/**
 * Calculates adherence rate:
 * completed scheduled workouts / (completed scheduled workouts + skipped scheduled workouts)
 *
 * Invariants:
 * - Rest days and bonus workouts are excluded from adherence formula.
 * - Incomplete scheduled workouts count as not completed.
 * - Pending today's workout does not count as skipped.
 */
export function calculateAdherence({
  index,
  coreWorkoutByCycleDayMap,
  cycleStart,
  startDate,
  endDate,
  now = new Date()
}: CalculateAdherenceOptions): AdherenceInsight {
  const parsedNow = typeof now === 'string' ? parseISO(now) : now;
  const validNow = isValid(parsedNow) ? startOfDay(parsedNow) : startOfDay(new Date());
  const todayStr = format(validNow, 'yyyy-MM-dd');

  const parsedStart = startDate
    ? (typeof startDate === 'string' ? parseISO(startDate) : startDate)
    : subDays(validNow, 27);
  const parsedEnd = endDate
    ? (typeof endDate === 'string' ? parseISO(endDate) : endDate)
    : validNow;

  const validStart = isValid(parsedStart) ? startOfDay(parsedStart) : subDays(validNow, 27);
  const validEnd = isValid(parsedEnd) ? startOfDay(parsedEnd) : validNow;

  const intervalStart = validStart > validEnd ? validEnd : validStart;
  const days = eachDayOfInterval({ start: intervalStart, end: validEnd });

  let completedScheduled = 0;
  let missedPastCoreDays = 0;
  let scheduledRestDays = 0;
  let bonusCompletedSessions = 0;
  let isTodayPending = false;

  days.forEach(dayDate => {
    const dateStr = format(dayDate, 'yyyy-MM-dd');
    const isToday = isSameDay(dayDate, validNow) || dateStr === todayStr;
    const isPast = dayDate < validNow && !isToday;

    const isWithinActiveSchedule = !cycleStart || dateStr >= cycleStart;
    const dayLogs = index.logsByDate.get(dateStr) || [];
    const completedLogs = dayLogs.filter(isCompletedSession);

    if (isWithinActiveSchedule) {
      const cycleDay = getCycleDay(cycleStart, dayDate);
      const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
      const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
      const isScheduledRest = expectedWo && expectedWo.type === 'rest';

      const hasCompletedExpected = isScheduledCore
        ? completedLogs.some(l => l.workoutId === expectedWo.id)
        : false;

      if (isScheduledCore) {
        if (hasCompletedExpected) {
          completedScheduled++;
        } else if (isPast) {
          missedPastCoreDays++;
        } else if (isToday) {
          isTodayPending = true;
        }

        // Additional completed sessions on a scheduled core day (or alternate workout completed instead of scheduled)
        const bonusOnScheduledDay = completedLogs.filter(l => l.workoutId !== expectedWo.id);
        bonusCompletedSessions += bonusOnScheduledDay.length;
      } else if (isScheduledRest) {
        scheduledRestDays++;
        bonusCompletedSessions += completedLogs.length;
      } else {
        bonusCompletedSessions += completedLogs.length;
      }
    } else {
      // Historical boundary: Prior to active cycleStart, preserve known completed sessions as bonus/unassigned
      // without fabricating missed core workouts where schedule cannot be established.
      bonusCompletedSessions += completedLogs.length;
    }
  });

  const evaluatedScheduledWorkouts = completedScheduled + missedPastCoreDays;
  const pendingScheduledWorkouts = isTodayPending ? 1 : 0;
  const rate = evaluatedScheduledWorkouts > 0 ? completedScheduled / evaluatedScheduledWorkouts : 0;
  const percent = evaluatedScheduledWorkouts > 0 ? Math.min(100, Math.round(rate * 100)) : 0;

  return {
    rate,
    percent,
    completedScheduled,
    scheduledCoreWorkouts: evaluatedScheduledWorkouts + pendingScheduledWorkouts,
    evaluatedScheduledWorkouts,
    pendingScheduledWorkouts,
    missedPastCoreDays,
    scheduledRestDays,
    bonusCompletedSessions,
    isTodayPending
  };
}

// ----------------------------------------------------------------------------
// 4. Volume for Range
// ----------------------------------------------------------------------------

/**
 * Canonical volume calculation for a date range: sum(weight * reps).
 * Invariant: Only completed sets from verified completed sessions contribute.
 */
export function selectVolumeForRange(
  index: FitnessIndex,
  startDate: Date | string,
  endDate: Date | string
): number {
  const startStr = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
  const endStr = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');

  let totalVolume = 0;
  Object.entries(index.volumeByDate).forEach(([dateStr, vol]) => {
    if (dateStr >= startStr && dateStr <= endStr) {
      totalVolume += vol;
    }
  });
  return totalVolume;
}

// ----------------------------------------------------------------------------
// 5. Strength Trend
// ----------------------------------------------------------------------------

/**
 * Exercise-level progression calculation comparing two date ranges.
 * Uses best valid Epley e1RM in each range.
 */
export function calculateExerciseStrengthTrend(
  exerciseEntry: ExerciseIndexEntry,
  currentRange: DateRange,
  comparisonRange: DateRange
): ExerciseStrengthTrendBreakdown | null {
  // entry.sessions only contains completed sessions with completed sets
  const currentSessions = exerciseEntry.sessions.filter(
    s => s.date >= currentRange.start && s.date <= currentRange.end && s.maxE1RM > 0
  );
  const previousSessions = exerciseEntry.sessions.filter(
    s => s.date >= comparisonRange.start && s.date <= comparisonRange.end && s.maxE1RM > 0
  );

  if (currentSessions.length === 0 || previousSessions.length === 0) {
    return null;
  }

  const currentBestE1RM = Math.max(...currentSessions.map(s => s.maxE1RM));
  const previousBestE1RM = Math.max(...previousSessions.map(s => s.maxE1RM));

  if (currentBestE1RM <= 0 || previousBestE1RM <= 0) {
    return null;
  }

  const percentChange = ((currentBestE1RM - previousBestE1RM) / previousBestE1RM) * 100;

  return {
    exerciseDefinitionId: exerciseEntry.exerciseDefinitionId,
    exerciseName: exerciseEntry.name,
    currentBestE1RM: Math.round(currentBestE1RM * 10) / 10,
    previousBestE1RM: Math.round(previousBestE1RM * 10) / 10,
    percentChange: Math.round(percentChange * 10) / 10
  };
}

export interface CalculateStrengthTrendOptions {
  index: FitnessIndex;
  currentRange: DateRange;
  comparisonRange: DateRange;
}

/**
 * Aggregates exercise-level e1RM progression robustly via median.
 * Protects against outliers, new exercises, and sparse history.
 */
export function calculateStrengthTrend({
  index,
  currentRange,
  comparisonRange
}: CalculateStrengthTrendOptions): StrengthTrendInsight {
  const exerciseBreakdown: ExerciseStrengthTrendBreakdown[] = [];

  index.exerciseIndex.forEach(entry => {
    const trend = calculateExerciseStrengthTrend(entry, currentRange, comparisonRange);
    if (trend) {
      exerciseBreakdown.push(trend);
    }
  });

  if (exerciseBreakdown.length === 0) {
    return {
      percentChange: null,
      currentValue: null,
      previousValue: null,
      comparableExercises: 0,
      confidence: 'low',
      exerciseBreakdown: []
    };
  }

  const medianChange = median(exerciseBreakdown.map(e => e.percentChange));
  const medianCurrent = median(exerciseBreakdown.map(e => e.currentBestE1RM));
  const medianPrevious = median(exerciseBreakdown.map(e => e.previousBestE1RM));

  const currentValue = Math.round(medianCurrent * 10) / 10;
  const previousValue = Math.round(medianPrevious * 10) / 10;

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (exerciseBreakdown.length === 1) {
    confidence = 'low';
  } else if (exerciseBreakdown.length === 2) {
    confidence = 'medium';
  } else if (exerciseBreakdown.length >= 3) {
    confidence = 'high';
  }

  return {
    percentChange: Math.round(medianChange * 10) / 10,
    currentValue,
    previousValue,
    medianCurrentE1RM: currentValue,
    medianPreviousE1RM: previousValue,
    comparableExercises: exerciseBreakdown.length,
    confidence,
    exerciseBreakdown
  };
}

// ----------------------------------------------------------------------------
// 6. Performance Score
// ----------------------------------------------------------------------------

export interface CalculatePerformanceScoreOptions {
  adherence: AdherenceInsight;
  completionRate?: number; // completed sets / planned sets in window
  strengthTrend?: StrengthTrendInsight;
  index: FitnessIndex;
  now?: Date | string;
  evaluationWindow?: PerformanceEvaluationWindow;
}

/**
 * Calculates contextual Performance Score (0-100) using normalized available components:
 * - Adherence (25%)
 * - Completion (15%)
 * - Strength Progression (30%)
 * - Performance vs Previous (15%)
 * - Volume Consistency (15%)
 */
export function calculatePerformanceScore({
  adherence,
  completionRate,
  strengthTrend,
  index,
  now = new Date(),
  evaluationWindow
}: CalculatePerformanceScoreOptions): PerformanceScoreInsight {
  const primaryFactors: string[] = [];

  const parsedNow = typeof now === 'string' ? parseISO(now) : now;
  const validNow = isValid(parsedNow) ? startOfDay(parsedNow) : startOfDay(new Date());

  const currentEndStr = format(validNow, 'yyyy-MM-dd');
  const currentStartStr = format(subDays(validNow, 27), 'yyyy-MM-dd');
  const prevEndStr = format(subDays(validNow, 28), 'yyyy-MM-dd');
  const prevStartStr = format(subDays(validNow, 55), 'yyyy-MM-dd');

  const evalWindow: PerformanceEvaluationWindow = evaluationWindow || {
    currentRange: { start: currentStartStr, end: currentEndStr },
    previousRange: { start: prevStartStr, end: prevEndStr }
  };

  // Component 1: Adherence (weight 0.25)
  let adherenceScore: number | null = null;
  const adherenceAvailable = adherence.evaluatedScheduledWorkouts > 0;
  if (adherenceAvailable) {
    adherenceScore = Math.min(100, Math.max(0, adherence.percent));
    if (adherenceScore >= 90) {
      primaryFactors.push(`High scheduled workout adherence (${adherence.percent}%)`);
    } else if (adherenceScore < 70) {
      primaryFactors.push(`Missed scheduled workouts detected (${adherence.missedPastCoreDays} skipped)`);
    }
  }

  const adherenceComponent: PerformanceScoreComponent = {
    score: adherenceScore,
    weight: 0.25,
    available: adherenceAvailable,
    windowType: 'current_window',
    windowDescription: `Current evaluation window (${evalWindow.currentRange.start} to ${evalWindow.currentRange.end})`
  };

  // Component 2: Completion (weight 0.15)
  let completionScore: number | null = null;
  const completionAvailable = completionRate !== undefined && Number.isFinite(completionRate);
  if (completionAvailable && completionRate !== undefined) {
    completionScore = Math.min(100, Math.max(0, Math.round(completionRate * 100)));
    if (completionScore >= 90) {
      primaryFactors.push('Consistent set completion rate');
    }
  }

  const completionComponent: PerformanceScoreComponent = {
    score: completionScore,
    weight: 0.15,
    available: completionAvailable,
    windowType: 'current_window',
    windowDescription: `Current evaluation window (${evalWindow.currentRange.start} to ${evalWindow.currentRange.end})`
  };

  // Component 3: Strength progression (weight 0.30)
  let strengthScore: number | null = null;
  const strengthAvailable = strengthTrend?.percentChange !== null && strengthTrend?.percentChange !== undefined;
  if (strengthAvailable && strengthTrend && strengthTrend.percentChange !== null) {
    const baseline = 75;
    const scaled = baseline + (strengthTrend.percentChange * 5);
    strengthScore = Math.min(100, Math.max(0, Math.round(scaled)));
    if (strengthTrend.percentChange > 0) {
      primaryFactors.push(`Strength progression: +${strengthTrend.percentChange.toFixed(1)}%`);
    } else if (strengthTrend.percentChange < 0) {
      primaryFactors.push(`Strength regression: ${strengthTrend.percentChange.toFixed(1)}%`);
    } else {
      primaryFactors.push('Strength maintenance steady');
    }
  }

  const strengthProgressionComponent: PerformanceScoreComponent = {
    score: strengthScore,
    weight: 0.30,
    available: strengthAvailable,
    windowType: 'previous_window',
    windowDescription: `Current window (${evalWindow.currentRange.start} to ${evalWindow.currentRange.end}) vs previous window (${evalWindow.previousRange.start} to ${evalWindow.previousRange.end})`
  };

  // Component 4: Performance vs previous sessions (weight 0.15)
  // Evaluates exercises whose latest session occurred within the evaluation window vs their preceding session
  let performanceScoreVal: number | null = null;
  let performanceAvailable = false;
  const recentRatios: number[] = [];

  const windowStartStr = evalWindow.currentRange.start;
  const windowEndStr = evalWindow.currentRange.end;
  const maxPrecedingAgeDaysStr = format(subDays(validNow, 90), 'yyyy-MM-dd');

  index.exerciseIndex.forEach(entry => {
    if (entry.sessions.length >= 2) {
      const s0 = entry.sessions[0];
      const s1 = entry.sessions[1];
      // Latest session must be within the current evaluation window
      if (s0.date < windowStartStr || s0.date > windowEndStr) {
        return;
      }
      // Immediately preceding session must be within the comparison window
      if (s1.date < maxPrecedingAgeDaysStr) {
        return;
      }
      if (s0.maxE1RM > 0 && s1.maxE1RM > 0) {
        recentRatios.push(s0.maxE1RM / s1.maxE1RM);
      }
    }
  });

  if (recentRatios.length > 0) {
    performanceAvailable = true;
    const medianRatio = median(recentRatios);
    if (medianRatio >= 1.05) performanceScoreVal = 95;
    else if (medianRatio >= 1.0) performanceScoreVal = 85;
    else if (medianRatio >= 0.95) performanceScoreVal = 75;
    else if (medianRatio >= 0.90) performanceScoreVal = 65;
    else performanceScoreVal = 50;
  }

  const performanceVsPreviousComponent: PerformanceScoreComponent = {
    score: performanceScoreVal,
    weight: 0.15,
    available: performanceAvailable,
    windowType: 'current_window',
    windowDescription: `Exercises in current window (${evalWindow.currentRange.start} to ${evalWindow.currentRange.end}) vs preceding baseline`
  };

  // Component 5: Volume consistency (weight 0.15)
  // Build consecutive calendar weeks for evaluation period, strictly preserving zero-volume weeks
  let volumeScore: number | null = null;
  let volumeAvailable = false;

  const endParsed = parseISO(evalWindow.currentRange.end);
  const validEvalEnd = isValid(endParsed) ? endParsed : validNow;
  const currentWeekStart = startOfWeek(validEvalEnd, { weekStartsOn: 1 });

  // Check user active calendar history
  const firstSessionStr = index.lifetimeStats.firstSessionDate;
  const hasHistory = !!firstSessionStr;
  const firstSessionDate = hasHistory ? parseISO(firstSessionStr) : null;
  const earliestWeekStart = (hasHistory && isValid(firstSessionDate))
    ? startOfWeek(firstSessionDate!, { weekStartsOn: 1 })
    : currentWeekStart;

  // Build the 4 consecutive calendar weeks ending at current week, enforcing upper bound
  const consecutiveWeeks: { weekStart: Date; weekStr: string; volume: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const wStart = subWeeks(currentWeekStart, i);
    const weekStr = format(wStart, 'MMM dd, yyyy');
    const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: wStart, end: wEnd });
    let volume = 0;
    weekDays.forEach(d => {
      const dStr = format(d, 'yyyy-MM-dd');
      if (dStr <= evalWindow.currentRange.end) {
        volume += (index.volumeByDate[dStr] || 0);
      }
    });
    consecutiveWeeks.push({ weekStart: wStart, weekStr, volume });
  }

  // Weeks that fall within the user's active calendar history
  const weeksInHistory = consecutiveWeeks.filter(w => w.weekStart >= earliestWeekStart);

  // Require at least 2 distinct calendar weeks in user history to evaluate volume consistency
  if (hasHistory && weeksInHistory.length >= 2) {
    volumeAvailable = true;
    const evaluatedWeeks = weeksInHistory.slice(-4);
    const evaluatedVolumes = evaluatedWeeks.map(w => w.volume);
    const minV = Math.min(...evaluatedVolumes);
    const maxV = Math.max(...evaluatedVolumes);

    if (minV === 0) {
      // Missed week with zero volume: volume consistency decreases appropriately
      volumeScore = 50;
      primaryFactors.push('Inconsistent weekly volume (zero-volume week detected)');
    } else {
      const ratio = maxV > 0 ? minV / maxV : 0;
      if (ratio >= 0.7) {
        volumeScore = 90;
        primaryFactors.push('Consistent weekly volume load');
      } else if (ratio >= 0.5) {
        volumeScore = 75;
      } else {
        // Deload / taper secondary interpretation: when non-zero volume drops with high adherence
        const isHighConsistency = (adherenceAvailable && (adherenceScore || 0) >= 80) || (completionAvailable && (completionScore || 0) >= 80);
        volumeScore = isHighConsistency ? 75 : 60;
      }
    }
  }

  const volumeConsistencyComponent: PerformanceScoreComponent = {
    score: volumeScore,
    weight: 0.15,
    available: volumeAvailable,
    windowType: 'current_window',
    windowDescription: `Consecutive calendar weeks up to ${evalWindow.currentRange.end}`
  };

  const rawComponents = [
    adherenceComponent,
    completionComponent,
    strengthProgressionComponent,
    performanceVsPreviousComponent,
    volumeConsistencyComponent
  ];

  const availableWeights = rawComponents.filter(c => c.available && c.score !== null);
  const sumWeights = availableWeights.reduce((sum, c) => sum + c.weight, 0);

  if (sumWeights === 0) {
    return {
      score: null,
      status: 'Unavailable',
      components: {
        adherence: adherenceComponent,
        completion: completionComponent,
        strengthProgression: strengthProgressionComponent,
        performanceVsPrevious: performanceVsPreviousComponent,
        volumeConsistency: volumeConsistencyComponent
      },
      confidence: 'low',
      primaryFactors: ['Insufficient baseline data for scoring'],
      evaluationWindow: evalWindow
    };
  }

  const weightedSum = availableWeights.reduce((sum, c) => sum + (c.score! * c.weight), 0);
  const finalScore = Math.round(weightedSum / sumWeights);

  let status: PerformanceScoreStatus;
  if (finalScore >= 90) status = 'Excellent';
  else if (finalScore >= 80) status = 'Strong';
  else if (finalScore >= 70) status = 'Good';
  else if (finalScore >= 60) status = 'Needs attention';
  else status = 'Struggling';

  const confidence: 'high' | 'medium' | 'low' =
    availableWeights.length >= 4 ? 'high' : availableWeights.length >= 2 ? 'medium' : 'low';

  return {
    score: finalScore,
    status,
    components: {
      adherence: adherenceComponent,
      completion: completionComponent,
      strengthProgression: strengthProgressionComponent,
      performanceVsPrevious: performanceVsPreviousComponent,
      volumeConsistency: volumeConsistencyComponent
    },
    confidence,
    primaryFactors,
    evaluationWindow: evalWindow
  };
}

// ----------------------------------------------------------------------------
// 7. Canonical PR Events
// ----------------------------------------------------------------------------

/**
 * Calculates canonical PR events across session history.
 * Invariant: A single completed set that simultaneously establishes a Weight PR and e1RM PR
 * counts as ONE user-visible PR event.
 */
export function calculatePREvents(index: FitnessIndex): PREvent[] {
  const prEvents: PREvent[] = [];
  const runningMaxWeight = new Map<string, number>();
  const runningMaxWeightReps = new Map<string, number>();
  const runningMaxE1RM = new Map<string, number>();

  // Process chronologically across verified completed sessions
  const chronologicalLogs = index.sortedLogsAscending.filter(isCompletedSession);

  chronologicalLogs.forEach(log => {
    const monthKey = log.date.substring(0, 7);
    Object.entries(log.sets).forEach(([exId, sets]) => {
      const meta = index.exerciseMetaById.get(exId);
      const exName = meta?.name || 'Exercise';

      (sets as SetLog[]).forEach((set, sIdx) => {
        if (!set.done) return;
        const w = parseFloat(set.weight) || 0;
        const r = parseInt(set.reps, 10) || 0;
        if (w <= 0 || r <= 0) return;

        const effectiveReps = Math.min(r, 30);
        const e1rm = r === 1 ? w : Math.round(w * (1 + effectiveReps / 30) * 10) / 10;

        const prevMaxW = runningMaxWeight.get(exId) || 0;
        const prevMaxWReps = runningMaxWeightReps.get(exId) || 0;
        const prevMaxE1 = runningMaxE1RM.get(exId) || 0;

        const isWeightPR = w > prevMaxW || (w === prevMaxW && r > prevMaxWReps);
        const isE1RMPR = e1rm > prevMaxE1;

        if (isWeightPR || isE1RMPR) {
          prEvents.push({
            id: `${log.id}_${exId}_${sIdx}`,
            exerciseDefinitionId: exId,
            exerciseName: exName,
            date: log.date,
            monthKey,
            weight: w,
            reps: r,
            e1rm,
            isWeightPR,
            isE1RMPR
          });

          if (isWeightPR) {
            runningMaxWeight.set(exId, w);
            runningMaxWeightReps.set(exId, r);
          }
          if (isE1RMPR) runningMaxE1RM.set(exId, e1rm);
        }
      });
    });
  });

  return prEvents;
}
