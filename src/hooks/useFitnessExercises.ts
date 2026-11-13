import React, { useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { generateId } from '../utils/fitnessHelpers';
import { trackDeletedId, removeDeletedId } from '../utils/fitnessSyncHelpers';
import {
  saveExerciseDefinition,
  deleteExerciseDefinitionWithWorkouts
} from '../services/fitnessFirestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { FitnessDatabaseSnapshot } from './useFitnessData';
import { PushAutoBackup } from './useFitnessBackups';

interface UseFitnessExercisesProps {
  user: User | null;
  exerciseDefsRef: React.MutableRefObject<ExerciseDefinition[]>;
  workoutsRef: React.MutableRefObject<Workout[]>;
  logsRef: React.MutableRefObject<Record<string, SessionLog>>;
  appStateRef: React.MutableRefObject<AppState>;
  commitFitnessSnapshot: (partialSnapshot: Partial<FitnessDatabaseSnapshot>) => { success: boolean; snapshot: FitnessDatabaseSnapshot };
  pushAutoBackup: PushAutoBackup;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'failed' | 'offline') => void;
  setSyncError: (err: string | null) => void;
}

export function useFitnessExercises({
  user,
  exerciseDefsRef,
  workoutsRef,
  logsRef,
  appStateRef,
  commitFitnessSnapshot,
  pushAutoBackup,
  setSyncStatus,
  setSyncError
}: UseFitnessExercisesProps) {

  const addExerciseDefinition = useCallback(async (
    defData: Omit<ExerciseDefinition, 'id'> & { id?: string }
  ): Promise<ExerciseDefinition> => {
    const now = Date.now();
    const id = defData.id || `ex-${generateId()}`;
    const newDef: ExerciseDefinition = {
      id,
      name: defData.name.trim(),
      target: defData.target.trim() || 'General',
      equipment: defData.equipment?.trim() || '',
      instructions: defData.instructions?.trim() || '',
      tags: defData.tags || [],
      updatedAt: now
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

    commitFitnessSnapshot({ exerciseDefinitions: nextDefs });

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
  }, [user, exerciseDefsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const updateExerciseDefinition = useCallback(async (def: ExerciseDefinition): Promise<void> => {
    const now = Date.now();
    const updatedDef: ExerciseDefinition = { ...def, updatedAt: now };
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.map(d => d.id === def.id ? updatedDef : d);

    commitFitnessSnapshot({ exerciseDefinitions: nextDefs });

    if (user) {
      try {
        await saveExerciseDefinition(user.uid, updatedDef);
      } catch (e) {
        console.error("Failed to update exercise definition in cloud", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/exerciseDefinitions/${def.id}`);
        setSyncStatus('failed');
        setSyncError("Updated exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user, exerciseDefsRef, commitFitnessSnapshot, setSyncStatus, setSyncError]);

  const deleteExerciseDefinition = useCallback(async (id: string): Promise<void> => {
    const currentDefs = exerciseDefsRef.current;
    const nextDefs = currentDefs.filter(d => d.id !== id);

    const currentWorkouts = workoutsRef.current;
    const nextWorkouts = currentWorkouts.map(w => ({
      ...w,
      exercises: (w.exercises || []).filter(e => e.exerciseDefinitionId !== id)
    }));

    commitFitnessSnapshot({
      exerciseDefinitions: nextDefs,
      workouts: nextWorkouts
    });

    trackDeletedId('defs', id, user?.uid);
    void pushAutoBackup(nextWorkouts, logsRef.current, appStateRef.current, 'auto-edit', `Deleted exercise definition: ${id}`, nextDefs);

    if (user) {
      try {
        await deleteExerciseDefinitionWithWorkouts(user.uid, id, nextWorkouts);
        removeDeletedId('defs', id, user.uid);
      } catch (e) {
        console.error("Failed to sync deletions to cloud", e);
        handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/exerciseDefinitions/${id}`);
        setSyncStatus('failed');
        setSyncError("Deleted exercise definition locally, but cloud sync failed.");
      }
    }
  }, [user, exerciseDefsRef, workoutsRef, commitFitnessSnapshot, pushAutoBackup, setSyncStatus, setSyncError, logsRef, appStateRef]);

  return useMemo(() => ({
    addExerciseDefinition,
    updateExerciseDefinition,
    deleteExerciseDefinition
  }), [
    addExerciseDefinition,
    updateExerciseDefinition,
    deleteExerciseDefinition
  ]);
}
