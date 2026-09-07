import {
  format,
  parseISO,
  subDays,
  isValid,
  startOfDay,
  isSameDay,
  eachDayOfInterval,
  differenceInCalendarDays
} from 'date-fns';
import { Workout, SessionLog, SetLog } from '../types/fitness';
import { FitnessIndex, ExerciseIndexEntry } from './fitnessDerivedSelectors';
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
  missedPastCoreDays: number;
  scheduledRestDays: number;
  bonusCompletedSessions: number;
  isTodayPending: boolean;
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
  currentValue: number | null;
  previousValue: number | null;
  comparableExercises: number;
  confidence: 'high' | 'medium' | 'low';
  exerciseBreakdown: ExerciseStrengthTrendBreakdown[];
}

export type PerformanceScoreStatus = 'Excellent' | 'Strong' | 'Good' | 'Needs attention' | 'Struggling';

export interface PerformanceScoreComponent {
  score: number | null;
  weight: number;
  available: boolean;
}

export interface PerformanceScoreInsight {
  score: number;
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
}

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
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

    const cycleDay = getCycleDay(cycleStart, dayDate);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
    const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
    const dayLogs = index.logsByDate.get(dateStr) || [];
    const hasCompleted = dayLogs.some(isCompletedSession);

    if (isScheduledCore) {
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

    const cycleDay = getCycleDay(cycleStart, dayDate);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
    const dayLogs = index.logsByDate.get(dateStr) || [];
    const hasCompleted = dayLogs.some(isCompletedSession);

    const isScheduledCore = expectedWo && expectedWo.isCore && expectedWo.type !== 'rest';
    const isScheduledRest = expectedWo && expectedWo.type === 'rest';

    if (isScheduledCore) {
      if (hasCompleted) {
        completedScheduled++;
      } else if (isPast) {
        missedPastCoreDays++;
      } else if (isToday) {
        isTodayPending = true;
      }
    } else if (isScheduledRest) {
      scheduledRestDays++;
      if (hasCompleted) {
        bonusCompletedSessions++;
      }
    } else {
      if (hasCompleted) {
        bonusCompletedSessions++;
      }
    }
  });

  const totalEvaluatedOpportunities = completedScheduled + missedPastCoreDays;
  const rate = totalEvaluatedOpportunities > 0 ? completedScheduled / totalEvaluatedOpportunities : 1;
  const percent = Math.min(100, Math.round(rate * 100));

  return {
    rate,
    percent,
    completedScheduled,
    scheduledCoreWorkouts: totalEvaluatedOpportunities + (isTodayPending ? 1 : 0),
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

  const sortedChanges = exerciseBreakdown.map(e => e.percentChange).sort((a, b) => a - b);
  const mid = Math.floor(sortedChanges.length / 2);
  const medianChange = sortedChanges.length % 2 !== 0
    ? sortedChanges[mid]
    : (sortedChanges[mid - 1] + sortedChanges[mid]) / 2;

  const currentAvg = exerciseBreakdown.reduce((sum, e) => sum + e.currentBestE1RM, 0) / exerciseBreakdown.length;
  const previousAvg = exerciseBreakdown.reduce((sum, e) => sum + e.previousBestE1RM, 0) / exerciseBreakdown.length;

  const confidence: 'high' | 'medium' | 'low' =
    exerciseBreakdown.length >= 3 ? 'high' : exerciseBreakdown.length >= 1 ? 'medium' : 'low';

  return {
    percentChange: Math.round(medianChange * 10) / 10,
    currentValue: Math.round(currentAvg * 10) / 10,
    previousValue: Math.round(previousAvg * 10) / 10,
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
  strengthTrend: StrengthTrendInsight;
  index: FitnessIndex;
  now?: Date | string;
  isDeload?: boolean;
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
  isDeload = false
}: CalculatePerformanceScoreOptions): PerformanceScoreInsight {
  const primaryFactors: string[] = [];

  // Component 1: Adherence (weight 0.25)
  let adherenceScore: number | null = null;
  const adherenceAvailable = adherence.scheduledCoreWorkouts > 0;
  if (adherenceAvailable) {
    adherenceScore = Math.min(100, Math.max(0, adherence.percent));
    if (adherenceScore >= 90) {
      primaryFactors.push(`High scheduled workout adherence (${adherence.percent}%)`);
    } else if (adherenceScore < 70) {
      primaryFactors.push(`Missed scheduled workouts detected (${adherence.missedPastCoreDays} skipped)`);
    }
  }

  // Component 2: Completion (weight 0.15)
  let completionScore: number | null = null;
  const completionAvailable = completionRate !== undefined && Number.isFinite(completionRate);
  if (completionAvailable && completionRate !== undefined) {
    completionScore = Math.min(100, Math.max(0, Math.round(completionRate * 100)));
    if (completionScore >= 90) {
      primaryFactors.push('Consistent set completion rate');
    }
  }

  // Component 3: Strength progression (weight 0.30)
  let strengthScore: number | null = null;
  const strengthAvailable = strengthTrend.percentChange !== null;
  if (strengthAvailable && strengthTrend.percentChange !== null) {
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

  // Component 4: Performance vs previous sessions (weight 0.15)
  let performanceScoreVal: number | null = null;
  let performanceAvailable = false;
  const recentRatios: number[] = [];
  index.exerciseIndex.forEach(entry => {
    if (entry.sessions.length >= 2) {
      const s0 = entry.sessions[0];
      const s1 = entry.sessions[1];
      if (s0.maxE1RM > 0 && s1.maxE1RM > 0) {
        recentRatios.push(s0.maxE1RM / s1.maxE1RM);
      }
    }
  });

  if (recentRatios.length > 0) {
    performanceAvailable = true;
    const sortedRatios = recentRatios.sort((a, b) => a - b);
    const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
    if (medianRatio >= 1.05) performanceScoreVal = 95;
    else if (medianRatio >= 1.0) performanceScoreVal = 85;
    else if (medianRatio >= 0.95) performanceScoreVal = 75;
    else if (medianRatio >= 0.90) performanceScoreVal = 65;
    else performanceScoreVal = 50;
  }

  // Component 5: Volume consistency (weight 0.15)
  let volumeScore: number | null = null;
  let volumeAvailable = false;
  if (isDeload) {
    volumeAvailable = true;
    volumeScore = 90; // Deload protection
    primaryFactors.push('Deload protocol active: volume target adjusted');
  } else {
    const weeklyVols = Object.values(index.weeklyVolumeMap).filter(v => v > 0);
    if (weeklyVols.length >= 2) {
      volumeAvailable = true;
      const recent4 = weeklyVols.slice(-4);
      const minV = Math.min(...recent4);
      const maxV = Math.max(...recent4);
      const ratio = maxV > 0 ? minV / maxV : 0;
      if (ratio >= 0.7) volumeScore = 90;
      else if (ratio >= 0.5) volumeScore = 75;
      else volumeScore = 60;
      if (volumeScore >= 80) {
        primaryFactors.push('Consistent weekly volume load');
      }
    }
  }

  const rawComponents = [
    { score: adherenceScore, weight: 0.25, available: adherenceAvailable },
    { score: completionScore, weight: 0.15, available: completionAvailable },
    { score: strengthScore, weight: 0.30, available: strengthAvailable },
    { score: performanceScoreVal, weight: 0.15, available: performanceAvailable },
    { score: volumeScore, weight: 0.15, available: volumeAvailable }
  ];

  const availableWeights = rawComponents.filter(c => c.available && c.score !== null);
  const sumWeights = availableWeights.reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = availableWeights.reduce((sum, c) => sum + (c.score! * c.weight), 0);

  const finalScore = sumWeights > 0 ? Math.round(weightedSum / sumWeights) : 0;

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
      adherence: { score: adherenceScore, weight: 0.25, available: adherenceAvailable },
      completion: { score: completionScore, weight: 0.15, available: completionAvailable },
      strengthProgression: { score: strengthScore, weight: 0.30, available: strengthAvailable },
      performanceVsPrevious: { score: performanceScoreVal, weight: 0.15, available: performanceAvailable },
      volumeConsistency: { score: volumeScore, weight: 0.15, available: volumeAvailable }
    },
    confidence,
    primaryFactors
  };
}
