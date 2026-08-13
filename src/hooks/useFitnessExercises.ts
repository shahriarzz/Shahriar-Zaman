import React, { useCallback } from 'react';
import { User } from 'firebase/auth';
import { ExerciseDefinition, Workout } from '../types/fitness';
import { generateId } from '../utils/fitnessHelpers';
import { trackDeletedId } from '../utils/fitnessSyncHelpers';
import { saveExerciseDefinition, deleteExerciseDefinition as deleteExerciseDefFirestore, saveWorkoutsBatch } from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';

interface UseFitnessExercisesProps {
  user: User | null;
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  setExerciseDefinitions: (defs: ExerciseDefinition[] | ((prev: ExerciseDefinition[]) => ExerciseDefinition[])) => void;
  setWorkouts: (workouts: Workout[] | ((prev: Workout[]) => Workout[])) => void;
  pushAutoBackup: (w: Workout[], l: any, s: any, type: any, desc: string, defs?: ExerciseDefinition[]) => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed') => void;
  setSyncError: (err: string | null) => void;
  logsRef: React.MutableRefObject<any>;
  appStateRef: React.MutableRefObject<any>;
}

export function useFitnessExercises({
  user,
  exerciseDefsRef,
  workoutsRef,
  setExerciseDefinitions,
  setWorkouts,
  pushAutoBackup,
  setSyncStatus,
  setSyncError,
  logsRef,
  appStateRef
}: UseFitnessExercisesProps) {

  const addExerciseDefinition = useCallback(async (
    defData: Omit<ExerciseDefinition, 'id'> & { id?: string }
  ): Promise<ExerciseDefinition> => {
    const id = defData.id || `ex-${generateId()}`;
    const newDef: ExerciseDefinition = {
      id,
      name: defData.name.trim(),
      target: defData.target.trim() || 'General',
      equipment: defData.equipment?.trim() || '',
      instructions: defData.instructions?.trim() || '',
      tags: defData.tags || []
    };

    const currentDefs = exerciseDefsRef.current;
    const existingIdx = currentDefs.findIndex(d => d.id === id);
    let nextDefs: ExerciseDefinition[];
    if (existingIdx !== -1) {
      nextDefs = [...currentDefs];
      nextDefs[existingIdx] = newDef;
    } else {
      nextDefs = [...currentDefs, newDef];
    }

    setExerciseDefinitions(nextDefs);

    if (user) {
      try {
        await saveExerciseDefinition(user.uid, newDef);
      } catch (e) {
        console.error("Failed to add exercise definition to cloud", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/exerciseDefinitions/${id}`);
        setSyncStatus('failed');
        setSyncError("Saved exercise definition locally, but cloud sync failed.");
      }
    }

    return newDef;
  }, [user, exerciseDefsRef, setExerciseDefinitions, setSyncStatus, setSyncError]);

  const updateExerciseDefinition = useCallback(async (def: ExerciseDefinition): Promise<void> => {
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.map(d => d.id === def.id ? def : d);

    setExerciseDefinitions(nextDefs);

    if (user) {
      try {
        await saveExerciseDefinition(user.uid, def);
      } catch (e) {
        console.error("Failed to update exercise definition in cloud", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/exerciseDefinitions/${def.id}`);
        setSyncStatus('failed');
        setSyncError("Updated exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user, exerciseDefsRef, setExerciseDefinitions, setSyncStatus, setSyncError]);

  const deleteExerciseDefinition = useCallback(async (id: string): Promise<void> => {
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.filter(d => d.id !== id);

    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => ({
      ...w,
      exercises: (w.exercises || []).filter(e => (e.exerciseDefinitionId || e.exerciseId) !== id)
    }));

    trackDeletedId('defs', id);

    setExerciseDefinitions(nextDefs);
    setWorkouts(nextWorkouts);

    pushAutoBackup(nextWorkouts, logsRef.current, appStateRef.current, 'auto-edit', `Deleted exercise definition: ${id}`, nextDefs);

    if (user) {
      try {
        await deleteExerciseDefFirestore(user.uid, id);
        await saveWorkoutsBatch(user.uid, nextWorkouts);
      } catch (e) {
        console.error("Failed to sync deletions to cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/exerciseDefinitions/${id}`);
        setSyncStatus('failed');
        setSyncError("Deleted exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user, exerciseDefsRef, workoutsRef, setExerciseDefinitions, setWorkouts, pushAutoBackup, setSyncStatus, setSyncError, logsRef, appStateRef]);

  return {
    addExerciseDefinition,
    updateExerciseDefinition,
    deleteExerciseDefinition
  };
}
