import { format, parseISO, subDays, differenceInCalendarDays, isValid } from 'date-fns';
import { ExerciseDefinition } from '../types/fitness';

// -------------------------------------------------------------
// 15 CANONICAL ANATOMICAL GROUPS
// -------------------------------------------------------------

export type MuscleGroup =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export const ALL_MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'lower_back',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const;

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  front_delts: 'Front Delts',
  side_delts: 'Side Delts',
  rear_delts: 'Rear Delts',
  lats: 'Lats',
  upper_back: 'Upper Back',
  lower_back: 'Lower Back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

// -------------------------------------------------------------
// THREE-TIER ROLE-TO-WEIGHT MAPPING
// -------------------------------------------------------------

export type MuscleInvolvementRole = 'primary' | 'secondary_strong' | 'secondary_moderate';

export interface MuscleInvolvement {
  muscle: MuscleGroup;
  role: MuscleInvolvementRole;
}

export const ROLE_WEIGHTS: Record<MuscleInvolvementRole, number> = {
  primary: 1.0,
  secondary_strong: 0.5,
  secondary_moderate: 0.25,
};

export function getRoleWeight(role: MuscleInvolvementRole): number {
  return ROLE_WEIGHTS[role] ?? 0;
}

// -------------------------------------------------------------
// ATTRIBUTION SOURCE & PROFILE CONTRACT
// -------------------------------------------------------------

export type AttributionSource = 'curated' | 'inferred' | 'unclassified';

export interface ExerciseMuscleProfile {
  source: AttributionSource;
  involvements: MuscleInvolvement[];
  targetFingerprint?: string;
}

export interface AttributionCoverageCounts {
  curatedSets: number;
  inferredSets: number;
  unclassifiedSets: number;
  totalEligibleSets: number;
}

/**
 * Normalizes an exercise target string into a lowercase, whitespace-collapsed fingerprint.
 */
export function normalizeTargetFingerprint(target: string | null | undefined): string {
  if (!target || typeof target !== 'string') return '';
  return target.trim().toLowerCase().replace(/\s+/g, ' ');
}

// -------------------------------------------------------------
// CURATED EXERCISE PROFILES REGISTRY (BUILT-IN e1 TO e41)
// With Fingerprint Guard to prevent silent misattribution
// Stabilizer-audited: only dynamic primary/secondary contributors
// -------------------------------------------------------------

interface CuratedProfileDefinition {
  targetFingerprint: string;
  involvements: MuscleInvolvement[];
}

export const CURATED_EXERCISE_PROFILES: Record<string, CuratedProfileDefinition> = {
  // e1: Incline DB Press ('Upper Chest')
  e1: {
    targetFingerprint: 'upper chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'front_delts', role: 'secondary_strong' },
      { muscle: 'triceps', role: 'secondary_strong' },
    ],
  },
  // e2: DB Shoulder Press ('Shoulders Overall')
  e2: {
    targetFingerprint: 'shoulders overall',
    involvements: [
      { muscle: 'front_delts', role: 'primary' },
      { muscle: 'side_delts', role: 'secondary_strong' },
      { muscle: 'triceps', role: 'secondary_strong' },
    ],
  },
  // e3: Flat Machine Press ('Mid Chest')
  e3: {
    targetFingerprint: 'mid chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'triceps', role: 'secondary_strong' },
      { muscle: 'front_delts', role: 'secondary_moderate' },
    ],
  },
  // e4: Cable Lateral Raise ('Side Delts') - isolation
  e4: {
    targetFingerprint: 'side delts',
    involvements: [
      { muscle: 'side_delts', role: 'primary' },
    ],
  },
  // e5: V-Bar Pushdown ('Triceps')
  e5: {
    targetFingerprint: 'triceps',
    involvements: [
      { muscle: 'triceps', role: 'primary' },
    ],
  },
  // e6: Barbell Wrist Curl ('Inner Forearm')
  e6: {
    targetFingerprint: 'inner forearm',
    involvements: [
      { muscle: 'forearms', role: 'primary' },
    ],
  },
  // e7: Lat Pulldown (Wide) ('Lats Width') - biceps are secondary_strong in pulldowns
  e7: {
    targetFingerprint: 'lats width',
    involvements: [
      { muscle: 'lats', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_strong' },
      { muscle: 'biceps', role: 'secondary_strong' },
    ],
  },
  // e8: Seated Cable Row ('Mid-Back') - biceps are secondary_moderate in mid-back rows
  e8: {
    targetFingerprint: 'mid-back',
    involvements: [
      { muscle: 'upper_back', role: 'primary' },
      { muscle: 'lats', role: 'secondary_strong' },
      { muscle: 'rear_delts', role: 'secondary_moderate' },
      { muscle: 'biceps', role: 'secondary_moderate' },
    ],
  },
  // e9: Face Pulls ('Rear Delts')
  e9: {
    targetFingerprint: 'rear delts',
    involvements: [
      { muscle: 'rear_delts', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_strong' },
      { muscle: 'side_delts', role: 'secondary_moderate' },
    ],
  },
  // e10: Straight-Arm Pulldown ('Lats/V-Taper')
  e10: {
    targetFingerprint: 'lats/v-taper',
    involvements: [
      { muscle: 'lats', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_moderate' },
      { muscle: 'triceps', role: 'secondary_moderate' },
    ],
  },
  // e11: Hammer Curls ('Forearm/Bicep')
  e11: {
    targetFingerprint: 'forearm/bicep',
    involvements: [
      { muscle: 'biceps', role: 'primary' },
      { muscle: 'forearms', role: 'secondary_strong' },
    ],
  },
  // e12: Pec Deck Fly ('Inner Chest')
  e12: {
    targetFingerprint: 'inner chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'front_delts', role: 'secondary_moderate' },
    ],
  },
  // e13: Cable Crossover ('Chest Stretch')
  e13: {
    targetFingerprint: 'chest stretch',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'front_delts', role: 'secondary_moderate' },
    ],
  },
  // e14: Goblet Squat ('Quads/Glutes')
  e14: {
    targetFingerprint: 'quads/glutes',
    involvements: [
      { muscle: 'quads', role: 'primary' },
      { muscle: 'glutes', role: 'secondary_strong' },
    ],
  },
  // e15: Romanian Deadlift ('Hamstrings/Back')
  e15: {
    targetFingerprint: 'hamstrings/back',
    involvements: [
      { muscle: 'hamstrings', role: 'primary' },
      { muscle: 'glutes', role: 'secondary_strong' },
      { muscle: 'lower_back', role: 'secondary_strong' },
    ],
  },
  // e16: Plate Pinch Holds ('Grip/Forearm')
  e16: {
    targetFingerprint: 'grip/forearm',
    involvements: [
      { muscle: 'forearms', role: 'primary' },
    ],
  },
  // e17: Incline Machine Press ('Upper Chest')
  e17: {
    targetFingerprint: 'upper chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'front_delts', role: 'secondary_strong' },
      { muscle: 'triceps', role: 'secondary_strong' },
    ],
  },
  // e18: Machine Shoulder Press ('Shoulders Mass')
  e18: {
    targetFingerprint: 'shoulders mass',
    involvements: [
      { muscle: 'front_delts', role: 'primary' },
      { muscle: 'side_delts', role: 'secondary_strong' },
      { muscle: 'triceps', role: 'secondary_strong' },
    ],
  },
  // e19: DB Lateral Raise ('Side Delts')
  e19: {
    targetFingerprint: 'side delts',
    involvements: [
      { muscle: 'side_delts', role: 'primary' },
    ],
  },
  // e20: Reverse Pec Deck ('Rear Delts')
  e20: {
    targetFingerprint: 'rear delts',
    involvements: [
      { muscle: 'rear_delts', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_strong' },
    ],
  },
  // e21: Overhead Cable Ext. ('Tricep Long Head')
  e21: {
    targetFingerprint: 'tricep long head',
    involvements: [
      { muscle: 'triceps', role: 'primary' },
    ],
  },
  // e22: Reverse BB Curl ('Top Forearm')
  e22: {
    targetFingerprint: 'top forearm',
    involvements: [
      { muscle: 'forearms', role: 'primary' },
      { muscle: 'biceps', role: 'secondary_strong' },
    ],
  },
  // e23: Chest Supported Row ('Mid-Back') - biceps are secondary_moderate in rows
  e23: {
    targetFingerprint: 'mid-back',
    involvements: [
      { muscle: 'upper_back', role: 'primary' },
      { muscle: 'lats', role: 'secondary_strong' },
      { muscle: 'rear_delts', role: 'secondary_moderate' },
      { muscle: 'biceps', role: 'secondary_moderate' },
    ],
  },
  // e24: Lat Pulldown (Close) ('Lower Lats') - biceps are secondary_strong in close-grip pulldowns
  e24: {
    targetFingerprint: 'lower lats',
    involvements: [
      { muscle: 'lats', role: 'primary' },
      { muscle: 'biceps', role: 'secondary_strong' },
      { muscle: 'upper_back', role: 'secondary_moderate' },
    ],
  },
  // e25: Single-Arm Cable Fly ('Rear Delts')
  e25: {
    targetFingerprint: 'rear delts',
    involvements: [
      { muscle: 'rear_delts', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_moderate' },
    ],
  },
  // e26: EZ-Bar Bicep Curls ('Biceps')
  e26: {
    targetFingerprint: 'biceps',
    involvements: [
      { muscle: 'biceps', role: 'primary' },
    ],
  },
  // e27: Wrist Rotations (DB) ('Forearm Rot.')
  e27: {
    targetFingerprint: 'forearm rot.',
    involvements: [
      { muscle: 'forearms', role: 'primary' },
    ],
  },
  // e28: Machine Lat. Raise ('Side Delts')
  e28: {
    targetFingerprint: 'side delts',
    involvements: [
      { muscle: 'side_delts', role: 'primary' },
    ],
  },
  // e29: Leg Press ('Quads/Glutes')
  e29: {
    targetFingerprint: 'quads/glutes',
    involvements: [
      { muscle: 'quads', role: 'primary' },
      { muscle: 'glutes', role: 'secondary_strong' },
    ],
  },
  // e30: Glute Kickback ('Glutes')
  e30: {
    targetFingerprint: 'glutes',
    involvements: [
      { muscle: 'glutes', role: 'primary' },
      { muscle: 'hamstrings', role: 'secondary_moderate' },
    ],
  },
  // e31: Seated Calf Raise ('Calves')
  e31: {
    targetFingerprint: 'calves',
    involvements: [
      { muscle: 'calves', role: 'primary' },
    ],
  },
  // e32: Hanging Leg Raises ('Abs/Core')
  e32: {
    targetFingerprint: 'abs/core',
    involvements: [
      { muscle: 'core', role: 'primary' },
    ],
  },
  // e33: Behind-Back Curls ('Inner Forearm')
  e33: {
    targetFingerprint: 'inner forearm',
    involvements: [
      { muscle: 'forearms', role: 'primary' },
      { muscle: 'biceps', role: 'secondary_moderate' },
    ],
  },
  // e34: Cable Curl (Rope) ('Biceps/Peak')
  e34: {
    targetFingerprint: 'biceps/peak',
    involvements: [
      { muscle: 'biceps', role: 'primary' },
      { muscle: 'forearms', role: 'secondary_strong' },
    ],
  },
  // e35: Incline Barbell Press ('Upper Chest')
  e35: {
    targetFingerprint: 'upper chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'front_delts', role: 'secondary_strong' },
      { muscle: 'triceps', role: 'secondary_strong' },
    ],
  },
  // e36: Flat DB Press ('Mid Chest')
  e36: {
    targetFingerprint: 'mid chest',
    involvements: [
      { muscle: 'chest', role: 'primary' },
      { muscle: 'triceps', role: 'secondary_strong' },
      { muscle: 'front_delts', role: 'secondary_moderate' },
    ],
  },
  // e37: Weighted Pull-Up ('Lats/Back Width')
  e37: {
    targetFingerprint: 'lats/back width',
    involvements: [
      { muscle: 'lats', role: 'primary' },
      { muscle: 'upper_back', role: 'secondary_strong' },
      { muscle: 'biceps', role: 'secondary_strong' },
    ],
  },
  // e38: Close-Grip Bench Press ('Triceps')
  e38: {
    targetFingerprint: 'triceps',
    involvements: [
      { muscle: 'triceps', role: 'primary' },
      { muscle: 'chest', role: 'secondary_strong' },
    ],
  },
  // e39: Barbell Back Squat ('Quads/Glutes')
  e39: {
    targetFingerprint: 'quads/glutes',
    involvements: [
      { muscle: 'quads', role: 'primary' },
      { muscle: 'glutes', role: 'secondary_strong' },
    ],
  },
  // e40: Lying Leg Curl ('Hamstrings')
  e40: {
    targetFingerprint: 'hamstrings',
    involvements: [
      { muscle: 'hamstrings', role: 'primary' },
    ],
  },
  // e41: Standing Calf Raise ('Calves')
  e41: {
    targetFingerprint: 'calves',
    involvements: [
      { muscle: 'calves', role: 'primary' },
    ],
  },
};

// -------------------------------------------------------------
// CONSERVATIVE TARGET-TEXT INFERENCE
// Used when an exercise is not in the curated registry or when its
// fingerprint was modified by the user.
// -------------------------------------------------------------

export function inferMuscleProfileFromTarget(targetStr: string | null | undefined): ExerciseMuscleProfile {
  if (!targetStr || typeof targetStr !== 'string') {
    return { source: 'unclassified', involvements: [] };
  }

  const t = targetStr.trim().toLowerCase();
  if (!t || t === 'general' || t === 'unknown' || t === 'unlisted') {
    return { source: 'unclassified', involvements: [] };
  }

  const involvements: MuscleInvolvement[] = [];
  const addedMuscles = new Set<MuscleGroup>();

  const add = (muscle: MuscleGroup, role: MuscleInvolvementRole = 'primary') => {
    if (!addedMuscles.has(muscle)) {
      addedMuscles.add(muscle);
      involvements.push({ muscle, role });
    }
  };

  // Chest
  if (/\b(chest|pecs?|pectoral)\b/i.test(t)) {
    add('chest', 'primary');
  }

  // Shoulders / Delts
  if (/\b(side delts?|lateral delts?)\b/i.test(t)) {
    add('side_delts', 'primary');
  } else if (/\b(rear delts?|posterior delts?)\b/i.test(t)) {
    add('rear_delts', 'primary');
  } else if (/\b(front delts?|anterior delts?)\b/i.test(t)) {
    add('front_delts', 'primary');
  } else if (/\b(shoulders?|delts?)\b/i.test(t)) {
    add('front_delts', 'primary');
    add('side_delts', 'secondary_strong');
  }

  // Back / Lats / Traps / Erectors
  if (/\b(lats?|latissimus|v-taper)\b/i.test(t)) {
    add('lats', 'primary');
  }
  if (/\b(upper back|rhomboids?|traps?|trapezius)\b/i.test(t)) {
    add('upper_back', 'primary');
  }
  if (/\b(lower back|erectors?|lumbar)\b/i.test(t)) {
    add('lower_back', 'primary');
  }
  // Generic back fallback: ONLY runs if no specific back region was identified
  if (/\b(mid[- ]back|back)\b/i.test(t)) {
    if (!addedMuscles.has('lats') && !addedMuscles.has('upper_back') && !addedMuscles.has('lower_back')) {
      add('upper_back', 'primary');
      add('lats', 'secondary_strong');
    }
  }

  // Arms: Triceps / Biceps / Forearms
  if (/\b(triceps?)\b/i.test(t)) {
    add('triceps', 'primary');
  }
  if (/\b(biceps?)\b/i.test(t)) {
    add('biceps', 'primary');
  }
  if (/\b(forearms?|grip|wrists?)\b/i.test(t)) {
    add('forearms', 'primary');
  }
  if (/\b(arms?)\b/i.test(t) && !/\b(forearms?)\b/i.test(t)) {
    if (!addedMuscles.has('biceps') && !addedMuscles.has('triceps')) {
      add('biceps', 'primary');
    }
  }

  // Legs: Quads / Hamstrings / Glutes / Calves
  if (/\b(quads?|quadriceps)\b/i.test(t)) {
    add('quads', 'primary');
  }
  if (/\b(hamstrings?|hams)\b/i.test(t)) {
    add('hamstrings', 'primary');
  }
  if (/\b(glutes?|gluteus)\b/i.test(t)) {
    add('glutes', 'primary');
  }
  if (/\b(calves|calf)\b/i.test(t)) {
    add('calves', 'primary');
  }
  if (/\b(legs?|thighs?|squats?|adductors?)\b/i.test(t) && !addedMuscles.has('quads') && !addedMuscles.has('hamstrings')) {
    add('quads', 'primary');
    add('glutes', 'secondary_strong');
  }

  // Core
  if (/\b(core|abs?|abdominals?|obliques?|planks?)\b/i.test(t)) {
    add('core', 'primary');
  }

  if (involvements.length === 0) {
    return { source: 'unclassified', involvements: [] };
  }

  return {
    source: 'inferred',
    involvements,
    targetFingerprint: normalizeTargetFingerprint(targetStr),
  };
}

/**
 * Resolves an exercise definition to its ExerciseMuscleProfile.
 * - Matches built-in exercise IDs (e1 to e41) ONLY when target fingerprint also matches.
 * - Falls back to conservative target-text inference if fingerprint differs or if custom exercise.
 * - Returns unclassified if target text is missing or uninformative.
 */
export function resolveExerciseMuscleProfile(
  def: Partial<ExerciseDefinition> | null | undefined
): ExerciseMuscleProfile {
  if (!def || !def.id) {
    return { source: 'unclassified', involvements: [] };
  }

  const curated = CURATED_EXERCISE_PROFILES[def.id];
  const currentFp = normalizeTargetFingerprint(def.target);

  if (curated) {
    if (currentFp === curated.targetFingerprint) {
      return {
        source: 'curated',
        involvements: curated.involvements,
        targetFingerprint: currentFp,
      };
    }
    // Target fingerprint mismatch on a built-in exercise: fallback to conservative inference
    return inferMuscleProfileFromTarget(def.target);
  }

  // Custom or non-curated exercise: infer from target
  return inferMuscleProfileFromTarget(def.target);
}

// -------------------------------------------------------------
// PURE SELECTOR RESULTS & TYPES
// -------------------------------------------------------------

export interface MuscleGroupBalance {
  muscle: MuscleGroup;
  label: string;
  wse: number;
  sharePercent: number;
}

export interface AttributionCoverageSummary extends AttributionCoverageCounts {
  coveragePercent: number | null;
}

export interface MuscleBalanceResult {
  /** Top 6 ranked muscle groups */
  groups: MuscleGroupBalance[];
  /** All 15 canonical anatomical groups including 0-exposure groups */
  allGroups: MuscleGroupBalance[];
  totalAttributedWSE: number;
  coverage: AttributionCoverageSummary;
}

export interface MuscleRecoveryItem {
  muscle: MuscleGroup;
  label: string;
  residualStimulus: number;
  recentStimulus: number;
  lastTrainedInWindow: string | null;
  daysAgo: number | null;
  relativeLabel: string;
  lifetimeLastTrainedDate: string | null;
}

export interface MuscleRecoveryResult {
  items: MuscleRecoveryItem[];
  referenceDate: string;
  windowStartDate: string;
  windowEndDate: string;
  maxResidualStimulus: number;
}

// -------------------------------------------------------------
// PURE SELECTORS
// -------------------------------------------------------------

/**
 * Computes anatomical training distribution across all 15 muscle groups within [startDate, endDate].
 * Preserves zero-exposure groups in allGroups and returns top 6 in groups.
 * If totalEligibleSets === 0, coveragePercent is returned as null.
 */
export function selectMuscleBalanceForRange(
  index: {
    muscleStimulusByDate: Record<string, Record<MuscleGroup, number>>;
    muscleAttributionCoverageByDate: Record<string, AttributionCoverageCounts>;
  },
  startDate: string,
  endDate: string
): MuscleBalanceResult {
  const stimulusTotals: Record<MuscleGroup, number> = {} as any;
  ALL_MUSCLE_GROUPS.forEach(m => {
    stimulusTotals[m] = 0;
  });

  let totalCurated = 0;
  let totalInferred = 0;
  let totalUnclassified = 0;
  let totalEligible = 0;

  // Aggregate daily records within the requested interval [startDate, endDate]
  const dates = Object.keys(index.muscleStimulusByDate || {}).sort();
  dates.forEach(d => {
    if (d >= startDate && d <= endDate) {
      const dayStim = index.muscleStimulusByDate[d];
      if (dayStim) {
        ALL_MUSCLE_GROUPS.forEach(m => {
          stimulusTotals[m] += dayStim[m] || 0;
        });
      }

      const dayCov = index.muscleAttributionCoverageByDate?.[d];
      if (dayCov) {
        totalCurated += dayCov.curatedSets || 0;
        totalInferred += dayCov.inferredSets || 0;
        totalUnclassified += dayCov.unclassifiedSets || 0;
        totalEligible += dayCov.totalEligibleSets || 0;
      }
    }
  });

  let totalAttributedWSE = 0;
  ALL_MUSCLE_GROUPS.forEach(m => {
    stimulusTotals[m] = Math.round(stimulusTotals[m] * 100) / 100;
    totalAttributedWSE += stimulusTotals[m];
  });
  totalAttributedWSE = Math.round(totalAttributedWSE * 100) / 100;

  const allGroups: MuscleGroupBalance[] = ALL_MUSCLE_GROUPS.map(muscle => {
    const wse = stimulusTotals[muscle];
    const sharePercent = totalAttributedWSE > 0
      ? Math.round((wse / totalAttributedWSE) * 1000) / 10
      : 0;
    return {
      muscle,
      label: MUSCLE_GROUP_LABELS[muscle],
      wse,
      sharePercent,
    };
  }).sort((a, b) => b.wse - a.wse || a.label.localeCompare(b.label));

  const coveragePercent = totalEligible > 0
    ? Math.round(((totalCurated + totalInferred) / totalEligible) * 1000) / 10
    : null;

  const coverage: AttributionCoverageSummary = {
    curatedSets: totalCurated,
    inferredSets: totalInferred,
    unclassifiedSets: totalUnclassified,
    totalEligibleSets: totalEligible,
    coveragePercent,
  };

  return {
    groups: allGroups.slice(0, 6),
    allGroups,
    totalAttributedWSE,
    coverage,
  };
}

/**
 * Computes 14-day recency-weighted residual stimulus indicator using deterministic reference date.
 * Formula: R_m = sum_{d=0}^{13} dailyWSE_{m,d} * 2^(-d / 2)
 * All daily stimulus is summed per muscle before applying decay. Future dates are excluded.
 */
export function selectMuscleRecovery(
  index: {
    muscleStimulusByDate: Record<string, Record<MuscleGroup, number>>;
    lifetimeLastTrainedDateByMuscle: Record<MuscleGroup, string | null>;
  },
  referenceDateInput: Date | string = new Date()
): MuscleRecoveryResult {
  const refDateObj = typeof referenceDateInput === 'string'
    ? parseISO(referenceDateInput)
    : referenceDateInput;
  const validRef = isValid(refDateObj) ? refDateObj : new Date();
  const refDateStr = format(validRef, 'yyyy-MM-dd');
  const windowStartDate = format(subDays(validRef, 13), 'yyyy-MM-dd');

  const residualTotals: Record<MuscleGroup, number> = {} as any;
  const recentTotals: Record<MuscleGroup, number> = {} as any;
  const lastTrainedInWindow: Record<MuscleGroup, string | null> = {} as any;

  ALL_MUSCLE_GROUPS.forEach(m => {
    residualTotals[m] = 0;
    recentTotals[m] = 0;
    lastTrainedInWindow[m] = null;
  });

  // Evaluate day 0 (today) down to day 13 (13 days prior)
  for (let ageInDays = 0; ageInDays <= 13; ageInDays++) {
    const curDate = subDays(validRef, ageInDays);
    const dateStr = format(curDate, 'yyyy-MM-dd');
    const dayStimulus = index.muscleStimulusByDate?.[dateStr];

    if (dayStimulus) {
      const decayFactor = Math.pow(2, -ageInDays / 2);

      ALL_MUSCLE_GROUPS.forEach(m => {
        const dailyWse = dayStimulus[m] || 0;
        if (dailyWse > 0) {
          residualTotals[m] += dailyWse * decayFactor;
          recentTotals[m] += dailyWse;
          // Capture the latest training date encountered (since ageInDays ascends from 0 to 13)
          if (!lastTrainedInWindow[m]) {
            lastTrainedInWindow[m] = dateStr;
          }
        }
      });
    }
  }

  let maxResidual = 0;

  const items: MuscleRecoveryItem[] = ALL_MUSCLE_GROUPS.map(muscle => {
    const resRaw = residualTotals[muscle];
    const residualStimulus = Math.round(resRaw * 100) / 100;
    const recentStimulus = Math.round(recentTotals[muscle] * 100) / 100;
    if (residualStimulus > maxResidual) maxResidual = residualStimulus;

    const trainedDateStr = lastTrainedInWindow[muscle];
    let daysAgo: number | null = null;
    let relativeLabel = 'No recent history';

    if (trainedDateStr) {
      const parsed = parseISO(trainedDateStr);
      if (isValid(parsed)) {
        daysAgo = differenceInCalendarDays(validRef, parsed);
        if (daysAgo === 0) {
          relativeLabel = 'Today';
        } else if (daysAgo === 1) {
          relativeLabel = 'Yesterday';
        } else {
          relativeLabel = `${daysAgo}d ago`;
        }
      }
    }

    const lifetimeLastTrainedDate = index.lifetimeLastTrainedDateByMuscle?.[muscle] ?? null;

    return {
      muscle,
      label: MUSCLE_GROUP_LABELS[muscle],
      residualStimulus,
      recentStimulus,
      lastTrainedInWindow: trainedDateStr,
      daysAgo,
      relativeLabel,
      lifetimeLastTrainedDate,
    };
  }).sort((a, b) => b.residualStimulus - a.residualStimulus || a.label.localeCompare(b.label));

  maxResidual = Math.round(maxResidual * 100) / 100;

  return {
    items,
    referenceDate: refDateStr,
    windowStartDate,
    windowEndDate: refDateStr,
    maxResidualStimulus: maxResidual,
  };
}
