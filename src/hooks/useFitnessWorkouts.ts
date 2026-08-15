import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Workout, WorkoutExercise } from '../types/fitness';
import { extractExerciseDefinitionsFromWorkouts } from '../utils/fitnessMigration';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import { saveWorkout, saveWorkoutsBatch, deleteWorkout as deleteWorkoutFirestore } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';

interface UseFitnessWorkoutsProps {
  user: User | null;
  workoutsRef: React.MutableRefObject<Workout[]>;
  setWorkoutsState: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  pushAutoBackup: (w: Workout[], l: any, s: any, type: any, desc: string) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed') => void;
  setSyncError: (err: string | null) => void;
  logsRef: React.MutableRefObject<any>;
  appStateRef: React.MutableRefObject<any>;
}

export function useFitnessWorkouts({
  user,
  workoutsRef,
  setWorkoutsState,
  pushAutoBackup,
  setSyncStatus,
  setSyncError,
  logsRef,
  appStateRef
}: UseFitnessWorkoutsProps) {

  const setWorkouts = useCallback(async (w: Workout[] | ((prev: Workout[]) => Workout[])): Promise<void> => {
    try {
      const currentWorkouts = workoutsRef.current;
      const rawNext = typeof w === 'function' ? w(currentWorkouts) : w;
      const { workouts: migrated } = extractExerciseDefinitionsFromWorkouts(rawNext);

      setWorkoutsState(migrated);
      pushAutoBackup(migrated, logsRef.current, appStateRef.current, 'auto-edit', 'Modified Routine Architecture');

      if (user) {
        await saveWorkoutsBatch(user.uid, migrated);
      }
    } catch (error) {
      console.error("Failed to update workouts", error);
      if (user) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/workouts`);
        setSyncStatus('failed');
        setSyncError("Saved workouts locally, but cloud sync failed.");
      }
    }
  }, [user, workoutsRef, setWorkoutsState, pushAutoBackup, setSyncStatus, setSyncError, logsRef, appStateRef]);

  const assignExerciseToWorkout = useCallback(async (
    workoutId: string, 
    exerciseDefId: string, 
    programming?: Partial<Omit<WorkoutExercise, 'exerciseDefinitionId'>>
  ): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const targetW = currentWorkouts.find(w => w.id === workoutId);
    if (!targetW) return;

    // Prevent duplicate assignment
    const exists = (targetW.exercises || []).some(
      e => (e.exerciseDefinitionId || e.exerciseId) === exerciseDefId
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

    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: [...(w.exercises || []), newExEntry]
        };
      }
      return w;
    });

    setWorkoutsState(nextWorkouts);

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
  }, [user, workoutsRef, setWorkoutsState, setSyncStatus, setSyncError]);

  const removeExerciseFromWorkout = useCallback(async (workoutId: string, exerciseDefId: string): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).filter(e => (e.exerciseDefinitionId || e.exerciseId) !== exerciseDefId)
        };
      }
      return w;
    });

    setWorkoutsState(nextWorkouts);

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
  }, [user, workoutsRef, setWorkoutsState, setSyncStatus, setSyncError]);

  const updateWorkoutExerciseProgramming = useCallback(async (
    workoutId: string, 
    exerciseDefId: string, 
    programming: Partial<WorkoutExercise>
  ): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => {
      if (w.id === workoutId) {
        return {
          ...w,
          exercises: (w.exercises || []).map(e => {
            if ((e.exerciseDefinitionId || e.exerciseId) === exerciseDefId) {
              return {
                ...e,
                ...programming,
                exerciseDefinitionId: exerciseDefId,
                exerciseId: exerciseDefId
              };
            }
            return e;
          })
        };
      }
      return w;
    });

    setWorkoutsState(nextWorkouts);

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
  }, [user, workoutsRef, setWorkoutsState, setSyncStatus, setSyncError]);

  const deleteWorkout = useCallback(async (workoutId: string): Promise<void> => {
    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.filter(w => w.id !== workoutId);

    trackDeletedId('workouts', workoutId);

    setWorkoutsState(nextWorkouts);

    if (user) {
      try {
        await deleteWorkoutFirestore(user.uid, workoutId);
        removeDeletedId('workouts', workoutId);
      } catch (e) {
        console.error("Failed to delete workout from cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/workouts/${workoutId}`);
        setSyncStatus('failed');
        setSyncError("Deleted workout locally, but cloud sync failed.");
      }
    }
  }, [user, workoutsRef, setWorkoutsState, setSyncStatus, setSyncError]);

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
