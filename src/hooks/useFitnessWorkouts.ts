import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Workout, WorkoutExercise, SessionLog, AppState } from '../types/fitness';
import { extractExerciseDefinitionsFromWorkouts } from '../utils/fitnessMigration';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import { saveWorkout, saveWorkoutsBatch, deleteWorkout as deleteWorkoutFirestore } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { FitnessDatabaseSnapshot } from './useFitnessData';
import { PushAutoBackup } from './useFitnessBackups';

interface UseFitnessWorkoutsProps {
  user: User | null;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  commitFitnessSnapshot: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  pushAutoBackup: PushAutoBackup;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline') => void;
  setSyncError: (err: string | null) => void;
}

export function useFitnessWorkouts({
  user,
  workoutsRef,
  logsRef,
  appStateRef,
  commitFitnessSnapshot,
  pushAutoBackup,
  setSyncStatus,
  setSyncError
}: UseFitnessWorkoutsProps) {

  const setWorkouts = useCallback(async (w: Workout[] | ((prev: Workout[]) => Workout[])): Promise<void> => {
    const now = Date.now();
    const currentWorkouts = workoutsRef.current;
    const rawNext = typeof w === 'function' ? w(currentWorkouts) : w;
    const { workouts: migrated } = extractExerciseDefinitionsFromWorkouts(rawNext);
    const workoutsWithTimestamp = migrated.map(item => ({
      ...item,
      updatedAt: now
    }));

    commitFitnessSnapshot({ workouts: workoutsWithTimestamp });
    void pushAutoBackup(workoutsWithTimestamp, logsRef.current, appStateRef.current, 'auto-edit', 'Modified Routine Architecture');

    if (user) {
      try {
        await saveWorkoutsBatch(user.uid, workoutsWithTimestamp);
      } catch (error) {
        console.error("Failed to sync updated workouts to cloud", error);
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
        setSyncStatus('failed');
        setSyncError("Saved workouts locally, but cloud sync failed.");
      }
    }
  }, [user, workoutsRef, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError, logsRef, appStateRef]);

  const assignExerciseToWorkout = useCallback(async (
    workoutId: string,
    exerciseDefId: string,
    programming?: Partial<Omit<WorkoutExercise, 'exerciseDefinitionId'>>
  ): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const targetW = currentWorkouts.find(w => w.id === workoutId);
    if (!targetW) return;

    const exists = (targetW.exercises || []).some(
      e => e.exerciseDefinitionId === exerciseDefId
    );
    if (exists) return;

    const newExEntry: WorkoutExercise = {
      exerciseDefinitionId: exerciseDefId,
      sets: programming?.sets ?? 3,
      reps: programming?.reps ?? '10–12',
      rest: programming?.rest ?? '90s',
      note: programming?.note ?? '',
      tags: programming?.tags ?? []
    };

    const now = Date.now();
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: [...(w.exercises || []), newExEntry],
          updatedAt: now
        };
      }
      return w;
    });

    commitFitnessSnapshot({ workouts: nextWorkouts });

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await saveWorkout(user.uid, updatedW);
        } catch (e) {
          console.error("Failed to sync assigned exercise to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Assigned exercise locally, but cloud sync failed.");
        }
      }
    }
  }, [user, workoutsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const removeExerciseFromWorkout = useCallback(async (workoutId: string, exerciseDefId: string): Promise<void> => {
    const now = Date.now();
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).filter(e => e.exerciseDefinitionId !== exerciseDefId),
          updatedAt: now
        };
      }
      return w;
    });

    commitFitnessSnapshot({ workouts: nextWorkouts });

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await saveWorkout(user.uid, updatedW);
        } catch (e) {
          console.error("Failed to sync removed exercise to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Removed exercise locally, but cloud sync failed.");
        }
      }
    }
  }, [user, workoutsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const updateWorkoutExerciseProgramming = useCallback(async (
    workoutId: string,
    exerciseDefId: string,
    programming: Partial<WorkoutExercise>
  ): Promise<void> => {
    const now = Date.now();
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).map(e => {
            if (e.exerciseDefinitionId === exerciseDefId) {
              return {
                ...e,
                ...programming,
                exerciseDefinitionId: exerciseDefId
              };
            }
            return e;
          }),
          updatedAt: now
        };
      }
      return w;
    });

    commitFitnessSnapshot({ workouts: nextWorkouts });

    if (user) {
      const updatedW = nextWorkouts.find(w => w.id === workoutId);
      if (updatedW) {
        try {
          await saveWorkout(user.uid, updatedW);
        } catch (e) {
          console.error("Failed to sync updated programming to cloud", e);
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workouts/${workoutId}`);
          setSyncStatus('failed');
          setSyncError("Updated programming locally, but cloud sync failed.");
        }
      }
    }
  }, [user, workoutsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const deleteWorkout = useCallback(async (workoutId: string): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.filter(w => w.id !== workoutId);

    commitFitnessSnapshot({ workouts: nextWorkouts });
    trackDeletedId('workouts', workoutId, user?.uid);

    if (user) {
      try {
        await deleteWorkoutFirestore(user.uid, workoutId);
        removeDeletedId('workouts', workoutId, user.uid);
      } catch (e) {
        console.error("Failed to delete workout from cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/workouts/${workoutId}`);
        setSyncStatus('failed');
        setSyncError("Deleted workout locally, but cloud sync failed.");
      }
    }
  }, [user, workoutsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  return useMemo(() => ({
    setWorkouts,
    assignExerciseToWorkout,
    removeExerciseFromWorkout,
    updateWorkoutExerciseProgramming,
    deleteWorkout
  }), [
    setWorkouts,
    assignExerciseToWorkout,
    removeExerciseFromWorkout,
    updateWorkoutExerciseProgramming,
    deleteWorkout
  ]);
}
