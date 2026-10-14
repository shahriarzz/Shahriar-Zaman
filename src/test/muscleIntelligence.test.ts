import { describe, it, expect } from 'vitest';
import {
  ALL_MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  ROLE_WEIGHTS,
  getRoleWeight,
  normalizeTargetFingerprint,
  CURATED_EXERCISE_PROFILES,
  inferMuscleProfileFromTarget,
  resolveExerciseMuscleProfile,
  selectMuscleBalanceForRange,
  selectMuscleRecovery,
} from '../utils/muscleIntelligence';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { SessionLog } from '../types/fitness';

describe('Muscle Intelligence & Workload Recovery Analytics', () => {
  const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);

  describe('1. 15 Canonical Anatomical Taxonomy & Role Weights', () => {
    it('defines exactly 15 unique anatomical muscle groups', () => {
      expect(ALL_MUSCLE_GROUPS).toHaveLength(15);
      const unique = new Set(ALL_MUSCLE_GROUPS);
      expect(unique.size).toBe(15);
      expect(ALL_MUSCLE_GROUPS).toContain('chest');
      expect(ALL_MUSCLE_GROUPS).toContain('front_delts');
      expect(ALL_MUSCLE_GROUPS).toContain('side_delts');
      expect(ALL_MUSCLE_GROUPS).toContain('rear_delts');
      expect(ALL_MUSCLE_GROUPS).toContain('lats');
      expect(ALL_MUSCLE_GROUPS).toContain('upper_back');
      expect(ALL_MUSCLE_GROUPS).toContain('lower_back');
      expect(ALL_MUSCLE_GROUPS).toContain('biceps');
      expect(ALL_MUSCLE_GROUPS).toContain('triceps');
      expect(ALL_MUSCLE_GROUPS).toContain('forearms');
      expect(ALL_MUSCLE_GROUPS).toContain('quads');
      expect(ALL_MUSCLE_GROUPS).toContain('hamstrings');
      expect(ALL_MUSCLE_GROUPS).toContain('glutes');
      expect(ALL_MUSCLE_GROUPS).toContain('calves');
      expect(ALL_MUSCLE_GROUPS).toContain('core');
    });

    it('has human-readable labels for all 15 muscle groups', () => {
      ALL_MUSCLE_GROUPS.forEach(m => {
        expect(MUSCLE_GROUP_LABELS[m]).toBeTruthy();
      });
    });

    it('maps three involvement tiers to strict WSE weights', () => {
      expect(ROLE_WEIGHTS.primary).toBe(1.0);
      expect(ROLE_WEIGHTS.secondary_strong).toBe(0.5);
      expect(ROLE_WEIGHTS.secondary_moderate).toBe(0.25);
      expect(getRoleWeight('primary')).toBe(1.0);
      expect(getRoleWeight('secondary_strong')).toBe(0.5);
      expect(getRoleWeight('secondary_moderate')).toBe(0.25);
    });
  });

  describe('2. Fingerprint Guard & Curated Profile Matching', () => {
    it('matches built-in exercises when ID and target fingerprint match', () => {
      const e1Def = INITIAL_EXERCISE_DEFINITIONS.find(d => d.id === 'e1')!;
      const profile = resolveExerciseMuscleProfile(e1Def);

      expect(profile.source).toBe('curated');
      expect(profile.involvements).toEqual(CURATED_EXERCISE_PROFILES.e1.involvements);
    });

    it('does NOT silently apply curated profile if target has been customized', () => {
      // Modify target of built-in exercise e1 from "Upper Chest" to "Hamstring Glute"
      const modifiedDef = {
        id: 'e1',
        name: 'Incline DB Press (Customized)',
        target: 'Hamstrings / Glutes',
      };
      const profile = resolveExerciseMuscleProfile(modifiedDef);

      // Must fall back to inference, not curated e1 upper chest involvements!
      expect(profile.source).toBe('inferred');
      const involvedMuscles = profile.involvements.map(i => i.muscle);
      expect(involvedMuscles).toContain('hamstrings');
      expect(involvedMuscles).toContain('glutes');
      expect(involvedMuscles).not.toContain('chest');
    });

    it('falls back to unclassified if customized target cannot be inferred', () => {
      const unclassifiedDef = {
        id: 'e1',
        name: 'Incline DB Press (Unknown Target)',
        target: 'Special Gizmo Movement',
      };
      const profile = resolveExerciseMuscleProfile(unclassifiedDef);
      expect(profile.source).toBe('unclassified');
      expect(profile.involvements).toHaveLength(0);
    });

    it('handles custom user-created exercises via conservative inference', () => {
      const customDef = {
        id: 'custom-123',
        name: 'Cable Flyes Variant',
        target: 'Chest Isolation',
      };
      const profile = resolveExerciseMuscleProfile(customDef);
      expect(profile.source).toBe('inferred');
      expect(profile.involvements).toEqual([
        { muscle: 'chest', role: 'primary' },
      ]);
    });
  });

  describe('3. Exercise-Specific Role Mapping (Biceps Pulldown vs Row)', () => {
    it('classifies biceps as secondary_strong in wide lat pulldowns (e7)', () => {
      const e7Def = INITIAL_EXERCISE_DEFINITIONS.find(d => d.id === 'e7')!;
      const profile = resolveExerciseMuscleProfile(e7Def);
      const bicepInv = profile.involvements.find(i => i.muscle === 'biceps');

      expect(bicepInv).toBeDefined();
      expect(bicepInv?.role).toBe('secondary_strong');
    });

    it('classifies biceps as secondary_moderate in mid-back seated cable rows (e8)', () => {
      const e8Def = INITIAL_EXERCISE_DEFINITIONS.find(d => d.id === 'e8')!;
      const profile = resolveExerciseMuscleProfile(e8Def);
      const bicepInv = profile.involvements.find(i => i.muscle === 'biceps');

      expect(bicepInv).toBeDefined();
      expect(bicepInv?.role).toBe('secondary_moderate');
    });
  });

  describe('4. Attribution Coverage Accounting & Denominator Invariant', () => {
    it('counts each completed set in totalEligibleSets exactly once even for multi-muscle exercises', () => {
      // e37 (Weighted Pull-Up) has 3 dynamic muscle involvements: lats, upper_back, biceps
      const log: SessionLog = {
        id: 'log-multi-1',
        workoutId: 'test-workout',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 45,
        sets: {
          e37: [
            { id: 's1', weight: '10', reps: '8', done: true },
            { id: 's2', weight: '10', reps: '8', done: true },
            { id: 's3', weight: '10', reps: '8', done: true },
          ],
        },
      };

      const index = buildFitnessIndex([log], defsMap, '2026-04-15');
      const coverage = index.muscleAttributionCoverageByDate['2026-04-10'];

      expect(coverage).toBeDefined();
      // Crucial: 3 completed sets must equal 3 in the denominator, NOT 9 (3 * 3)!
      expect(coverage.totalEligibleSets).toBe(3);
      expect(coverage.curatedSets).toBe(3);
      expect(coverage.inferredSets).toBe(0);
      expect(coverage.unclassifiedSets).toBe(0);

      // And stimulus for e37 must reflect all involvements:
      // lats: 3 * 1.0 = 3.0 WSE
      // upper_back: 3 * 0.5 = 1.5 WSE
      // biceps: 3 * 0.5 = 1.5 WSE
      const stimulus = index.muscleStimulusByDate['2026-04-10'];
      expect(stimulus.lats).toBe(3.0);
      expect(stimulus.upper_back).toBe(1.5);
      expect(stimulus.biceps).toBe(1.5);
    });

    it('tracks mixed curated, inferred, and unclassified exercises transparently', () => {
      const customDefs = createExerciseDefinitionMap([
        ...INITIAL_EXERCISE_DEFINITIONS,
        { id: 'custom-inferred', name: 'Leg Extension', target: 'Quads Isolation' },
        { id: 'custom-unclassified', name: 'Random Machine', target: 'Unlisted' },
      ]);

      const log: SessionLog = {
        id: 'log-mixed',
        workoutId: 'mixed',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 40,
        sets: {
          e1: [{ id: 's1', weight: '20', reps: '10', done: true }], // Curated (1 set)
          'custom-inferred': [{ id: 's2', weight: '40', reps: '12', done: true }], // Inferred (1 set)
          'custom-unclassified': [{ id: 's3', weight: '30', reps: '10', done: true }], // Unclassified (1 set)
        },
      };

      const index = buildFitnessIndex([log], customDefs, '2026-04-15');
      const cov = index.muscleAttributionCoverageByDate['2026-04-10'];

      expect(cov.totalEligibleSets).toBe(3);
      expect(cov.curatedSets).toBe(1);
      expect(cov.inferredSets).toBe(1);
      expect(cov.unclassifiedSets).toBe(1);

      const balance = selectMuscleBalanceForRange(index, '2026-04-01', '2026-04-15');
      // Coverage = (1 curated + 1 inferred) / 3 total * 100 = 66.7%
      expect(balance.coverage.coveragePercent).toBe(66.7);
      expect(balance.coverage.unclassifiedSets).toBe(1);
    });

    it('returns coveragePercent as null when totalEligibleSets is 0 instead of false 100%', () => {
      const emptyIndex = buildFitnessIndex([], defsMap, '2026-04-15');
      const balance = selectMuscleBalanceForRange(emptyIndex, '2026-04-01', '2026-04-15');
      expect(balance.coverage.totalEligibleSets).toBe(0);
      expect(balance.coverage.coveragePercent).toBeNull();
      expect(balance.totalAttributedWSE).toBe(0);
    });
  });

  describe('5. Stimulus Consolidation & 14-Day Deterministic Residual Decay', () => {
    it('consolidates multiple sessions/exercises on the same date before applying decay', () => {
      // 2 sessions on 2026-04-10: session 1 has 2 sets of e5 (triceps), session 2 has 2 sets of e21 (triceps)
      const log1: SessionLog = {
        id: 'log-day-1',
        workoutId: 'w1',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 30,
        sets: {
          e5: [
            { id: 's1', weight: '20', reps: '10', done: true },
            { id: 's2', weight: '20', reps: '10', done: true },
          ],
        },
      };

      const log2: SessionLog = {
        id: 'log-day-2',
        workoutId: 'w2',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 30,
        sets: {
          e21: [
            { id: 's3', weight: '20', reps: '10', done: true },
            { id: 's4', weight: '20', reps: '10', done: true },
          ],
        },
      };

      const index = buildFitnessIndex([log1, log2], defsMap, '2026-04-15');
      expect(index.muscleStimulusByDate['2026-04-10'].triceps).toBe(4.0); // 2 + 2 = 4 WSE
    });

    it('computes exact 14-day exponential decay with 2-day half-life', () => {
      // Reference date: 2026-04-14 (day 0)
      // Day 0: 2026-04-14 -> 2^0 = 1.0
      // Day 2: 2026-04-12 -> 2^(-2/2) = 0.5
      // Day 4: 2026-04-10 -> 2^(-4/2) = 0.25
      const logDay0: SessionLog = {
        id: 'log-d0',
        workoutId: 'w',
        date: '2026-04-14',
        complete: true,
        durationMinutes: 30,
        sets: {
          e5: [{ id: 's1', weight: '20', reps: '10', done: true }], // 1 set triceps = 1.0 WSE
        },
      };

      const logDay2: SessionLog = {
        id: 'log-d2',
        workoutId: 'w',
        date: '2026-04-12',
        complete: true,
        durationMinutes: 30,
        sets: {
          e5: [{ id: 's2', weight: '20', reps: '10', done: true }], // 1 set triceps = 1.0 WSE
        },
      };

      const logDay4: SessionLog = {
        id: 'log-d4',
        workoutId: 'w',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 30,
        sets: {
          e5: [{ id: 's3', weight: '20', reps: '10', done: true }], // 1 set triceps = 1.0 WSE
        },
      };

      const index = buildFitnessIndex([logDay0, logDay2, logDay4], defsMap, '2026-04-14');
      const recovery = selectMuscleRecovery(index, '2026-04-14');
      const tricepItem = recovery.items.find(i => i.muscle === 'triceps')!;

      // Residual = 1.0 * 1.0 + 1.0 * 0.5 + 1.0 * 0.25 = 1.75
      expect(tricepItem.residualStimulus).toBe(1.75);
      expect(tricepItem.recentStimulus).toBe(3.0); // un-decayed total
      expect(tricepItem.relativeLabel).toBe('Today');
    });

    it('excludes sessions older than 13 days from 14-day recovery window while preserving lifetime date', () => {
      // 20 days ago: 2026-03-25
      const oldLog: SessionLog = {
        id: 'log-old',
        workoutId: 'w',
        date: '2026-03-25',
        complete: true,
        durationMinutes: 30,
        sets: {
          e31: [{ id: 's1', weight: '50', reps: '15', done: true }], // calves
        },
      };

      const index = buildFitnessIndex([oldLog], defsMap, '2026-04-14');
      const recovery = selectMuscleRecovery(index, '2026-04-14');
      const calfItem = recovery.items.find(i => i.muscle === 'calves')!;

      expect(calfItem.residualStimulus).toBe(0);
      expect(calfItem.lastTrainedInWindow).toBeNull();
      expect(calfItem.relativeLabel).toBe('No recent history');
      // Crucial: Lifetime last trained date is still preserved!
      expect(calfItem.lifetimeLastTrainedDate).toBe('2026-03-25');
    });
  });

  describe('6. 15-Group View All & Zero-Exposure Differentiation', () => {
    it('includes all 15 anatomical groups in allGroups with 0 WSE for unaddressed groups', () => {
      // Only Chest was trained
      const chestLog: SessionLog = {
        id: 'log-chest-only',
        workoutId: 'w',
        date: '2026-04-10',
        complete: true,
        durationMinutes: 30,
        sets: {
          e12: [{ id: 's1', weight: '30', reps: '10', done: true }], // Pec Deck: chest + front_delts
        },
      };

      const index = buildFitnessIndex([chestLog], defsMap, '2026-04-14');
      const balance = selectMuscleBalanceForRange(index, '2026-04-01', '2026-04-14');

      expect(balance.allGroups).toHaveLength(15);
      const calvesGroup = balance.allGroups.find(g => g.muscle === 'calves');
      expect(calvesGroup).toBeDefined();
      expect(calvesGroup?.wse).toBe(0);
      expect(calvesGroup?.sharePercent).toBe(0);
    });
  });

  describe('7. Canonical Invariant Parity Verification', () => {
    it('preserves existing volumeByMuscle, setsByMuscle, frequencyByMuscle, PRs, and streaks identically', () => {
      const logs: SessionLog[] = [
        {
          id: 'log-1',
          workoutId: 'push-a',
          date: '2026-04-10',
          complete: true,
          durationMinutes: 45,
          sets: {
            e1: [
              { id: 's1', weight: '24', reps: '10', done: true },
              { id: 's2', weight: '26', reps: '8', done: true },
            ],
          },
        },
        {
          id: 'log-2',
          workoutId: 'pull-a',
          date: '2026-04-11',
          complete: true,
          durationMinutes: 40,
          sets: {
            e7: [
              { id: 's3', weight: '60', reps: '10', done: true },
            ],
          },
        },
      ];

      const index = buildFitnessIndex(logs, defsMap, '2026-04-12');

      // Legacy broad categories
      expect(index.volumeByMuscle.Chest).toBe(24 * 10 + 26 * 8); // 448
      expect(index.volumeByMuscle.Back).toBe(60 * 10); // 600
      expect(index.setsByMuscle.Chest).toBe(2);
      expect(index.setsByMuscle.Back).toBe(1);
      expect(index.lifetimeStats.currentStreak).toBe(2);
      expect(index.weightPRs.length).toBeGreaterThan(0);
    });
  });

  describe('8. Conservative Back Region Inference Regressions', () => {
    it('classifies "Lower Back" specifically as lower_back without generic upper_back or lats', () => {
      const profile = inferMuscleProfileFromTarget('Lower Back');
      expect(profile.source).toBe('inferred');
      const muscles = profile.involvements.map(i => i.muscle);
      expect(muscles).toEqual(['lower_back']);
      expect(profile.involvements[0].role).toBe('primary');
      expect(muscles).not.toContain('upper_back');
      expect(muscles).not.toContain('lats');
    });

    it('classifies "Upper Back" specifically as upper_back without generic lats fallback', () => {
      const profile = inferMuscleProfileFromTarget('Upper Back');
      expect(profile.source).toBe('inferred');
      const muscles = profile.involvements.map(i => i.muscle);
      expect(muscles).toEqual(['upper_back']);
      expect(profile.involvements[0].role).toBe('primary');
      expect(muscles).not.toContain('lats');
      expect(muscles).not.toContain('lower_back');
    });

    it('applies generic-back fallback to "Back" because no specific region was identified', () => {
      const profile = inferMuscleProfileFromTarget('Back');
      expect(profile.source).toBe('inferred');
      const muscles = profile.involvements.map(i => i.muscle);
      expect(muscles).toContain('upper_back');
      expect(muscles).toContain('lats');
      expect(muscles).not.toContain('lower_back');
    });

    it('classifies "Hamstrings/Back" with primary hamstrings and fallback back attribution without lower_back', () => {
      const profile = inferMuscleProfileFromTarget('Hamstrings/Back');
      expect(profile.source).toBe('inferred');
      const muscles = profile.involvements.map(i => i.muscle);
      expect(muscles).toContain('hamstrings');
      expect(muscles).toContain('upper_back');
      expect(muscles).toContain('lats');
      expect(muscles).not.toContain('lower_back');
    });
  });
});
