import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Dumbbell, Repeat } from 'lucide-react';
import { Workout, Exercise } from '../../types/fitness';
import { useFitness } from '../../context/FitnessContext';
import { useConfirm } from '../../context/ConfirmContext';
import { haptics } from '../../utils/haptics';
import { CycleEditor } from './CycleEditor';
import { WorkoutEditor } from './WorkoutEditor';
import { ExerciseEditor } from './ExerciseEditor';
import { ExerciseLibrary } from './ExerciseLibrary';
import {
  Button,
  SegmentedControl,
  Stack,
  TYPOGRAPHY,
  BORDER,
  EDITOR_HEADER
} from '../ui';
import { cn } from '../../lib/utils';

export interface ProgramEditorProps {
  onBackToManage: () => void;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ onBackToManage }) => {
  const {
    workouts,
    exerciseDefinitions,
    setWorkouts,
    updateWorkout,
    addExerciseDefinition,
    deleteExerciseDefinition,
    updateWorkoutExerciseProgramming
  } = useFitness();
  const { confirm } = useConfirm();

  // Mode: 'cycle' | 'exercises'
  const [activeMode, setActiveMode] = useState<'cycle' | 'exercises'>('cycle');

  // Drill-down selection state
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [editingExerciseContext, setEditingExerciseContext] = useState<{
    exercise: Exercise;
    workoutId?: string | null;
  } | null>(null);

  const selectedWorkout = useMemo(() => {
    if (!selectedWorkoutId) return null;
    return workouts.find(w => w.id === selectedWorkoutId) || null;
  }, [workouts, selectedWorkoutId]);

  const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWorkoutRef = useRef<Workout | null>(null);
  const updateWorkoutRef = useRef(updateWorkout);
  updateWorkoutRef.current = updateWorkout;

  const flushPendingWorkoutSync = useCallback(() => {
    if (pendingSyncTimerRef.current !== null) {
      clearTimeout(pendingSyncTimerRef.current);
      pendingSyncTimerRef.current = null;
    }
    const pending = pendingWorkoutRef.current;
    pendingWorkoutRef.current = null;
    if (pending && updateWorkoutRef.current) {
      void updateWorkoutRef.current(pending, { syncCloud: true, recordBackup: true });
    }
  }, []);

  useEffect(() => {
    return () => {
      flushPendingWorkoutSync();
    };
  }, [flushPendingWorkoutSync, selectedWorkoutId]);

  const handleSaveWorkout = (updatedWorkout: Workout) => {
    if (updateWorkout) {
      void updateWorkout(updatedWorkout, { syncCloud: false, recordBackup: false });
      pendingWorkoutRef.current = updatedWorkout;
      if (pendingSyncTimerRef.current !== null) {
        clearTimeout(pendingSyncTimerRef.current);
      }
      pendingSyncTimerRef.current = setTimeout(() => {
        flushPendingWorkoutSync();
      }, 350);
    } else {
      void setWorkouts(prev => prev.map(w => w.id === updatedWorkout.id ? updatedWorkout : w));
    }
  };

  const handleSaveExercise = async (updatedExercise: Exercise) => {
    const exDefId = updatedExercise.exerciseDefinitionId || updatedExercise.id;

    if (editingExerciseContext?.workoutId) {
      // 1. Editing from within a specific workout: update programming fields for that workout assignment
      await updateWorkoutExerciseProgramming(editingExerciseContext.workoutId, exDefId, {
        sets: updatedExercise.sets || 3,
        reps: updatedExercise.reps || '10–12',
        rest: updatedExercise.rest || '90s',
        note: updatedExercise.note || '',
        tags: updatedExercise.tags || []
      });
    } else {
      // 2. Global Definition Update: update core definition fields in central Exercise Library
      await addExerciseDefinition({
        id: exDefId,
        name: updatedExercise.name,
        target: updatedExercise.target || 'General',
        equipment: updatedExercise.equipment || '',
        instructions: updatedExercise.instructions || '',
        tags: updatedExercise.tags || []
      });
    }

    setEditingExerciseContext(null);
  };

  const handleDeleteExercise = async () => {
    if (!editingExerciseContext || editingExerciseContext.workoutId) return;
    const ex = editingExerciseContext.exercise;
    const exDefId = ex.exerciseDefinitionId || ex.id;
    const referencingWorkouts = workouts.filter(w =>
      (w.exercises || []).some(e => e.exerciseDefinitionId === exDefId)
    );
    const usageNote = referencingWorkouts.length > 0
      ? ` It will also be removed from ${referencingWorkouts.length} scheduled ${referencingWorkouts.length === 1 ? 'routine' : 'routines'}.`
      : '';

    const proceed = await confirm({
      title: 'Delete Exercise Definition',
      message: `Permanently delete "${ex.name || 'this exercise'}" from your Exercise Library?${usageNote} Historical logs will remain preserved.`,
      isDanger: true
    });
    if (!proceed) return;

    haptics.warning();
    await deleteExerciseDefinition(exDefId);
    setEditingExerciseContext(null);
  };

  const handleCreateNewLibraryExercise = () => {
    const newId = `ex-${crypto.randomUUID()}`;
    const newBlankExercise: Exercise = {
      id: newId,
      exerciseDefinitionId: newId,
      name: '',
      target: '',
      sets: 3,
      reps: '10–12',
      rest: '90s',
      tags: [],
      equipment: '',
      instructions: '',
      note: ''
    };
    setEditingExerciseContext({ exercise: newBlankExercise, workoutId: null });
  };

  // 1. Deep Exercise Editor View
  if (editingExerciseContext) {
    const parentWorkout = editingExerciseContext.workoutId
      ? workouts.find(w => w.id === editingExerciseContext.workoutId) || null
      : null;
    const editingDefId = editingExerciseContext.exercise.exerciseDefinitionId || editingExerciseContext.exercise.id;
    const isExistingGlobalDef = !editingExerciseContext.workoutId &&
      (exerciseDefinitions || []).some(d => d.id === editingDefId);

    return (
      <ExerciseEditor
        exercise={editingExerciseContext.exercise}
        workout={parentWorkout}
        onSave={handleSaveExercise}
        onDelete={isExistingGlobalDef ? handleDeleteExercise : undefined}
        onCancel={() => {
          setEditingExerciseContext(null);
        }}
      />
    );
  }

  // 2. Workout Editor View
  if (selectedWorkout) {
    return (
      <WorkoutEditor
        workout={selectedWorkout}
        allWorkouts={workouts}
        onSaveWorkout={handleSaveWorkout}
        onOpenExerciseEditor={(ex) => {
          setEditingExerciseContext({
            exercise: ex,
            workoutId: selectedWorkout.id
          });
        }}
        onBack={() => setSelectedWorkoutId(null)}
      />
    );
  }

  // 3. Main Program Editor View (Cycle | Exercises toggle)
  return (
    <Stack spacing="lg">
      {/* Top Navigation Bar */}
      <div className={cn(EDITOR_HEADER.container, BORDER.standard)}>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToManage}
            icon={<ChevronLeft size={16} />}
          >
            Back to Manage
          </Button>
          <div className={EDITOR_HEADER.divider} />
          <span className={cn(TYPOGRAPHY.label, "text-zinc-400 font-bold")}>
            Program Configuration
          </span>
        </div>

        {/* Cycle | Exercises Segmented Control */}
        <SegmentedControl
          value={activeMode}
          onChange={(val) => {
            haptics.selection();
            setActiveMode(val as 'cycle' | 'exercises');
          }}
          options={[
            { value: 'cycle', label: 'Cycle', icon: <Repeat size={13} /> },
            { value: 'exercises', label: 'Exercises', icon: <Dumbbell size={13} /> },
          ]}
          accent="orange"
          size="sm"
        />
      </div>

      {/* Mode Content */}
      {activeMode === 'cycle' ? (
        <CycleEditor
          workouts={workouts}
          onSelectWorkout={(id) => setSelectedWorkoutId(id)}
        />
      ) : (
        <ExerciseLibrary
          workouts={workouts}
          onOpenExerciseEditor={(ex) => {
            setEditingExerciseContext({
              exercise: ex,
              workoutId: null
            });
          }}
          onCreateNewExercise={handleCreateNewLibraryExercise}
        />
      )}
    </Stack>
  );
};

