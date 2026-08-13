import React, { useState, useMemo } from 'react';
import { ChevronLeft, Dumbbell, Repeat } from 'lucide-react';
import { Workout, Exercise } from '../../types/fitness';
import { useFitness } from '../../context/FitnessContext';
import { haptics } from '../../utils/haptics';
import { CycleEditor } from './CycleEditor';
import { WorkoutEditor } from './WorkoutEditor';
import { ExerciseEditor } from './ExerciseEditor';
import { ExerciseLibrary } from './ExerciseLibrary';
import {
  Button,
  SegmentedControl,
  Stack,
  TYPOGRAPHY
} from '../ui';
import { cn } from '../../lib/utils';

export interface ProgramEditorProps {
  onBackToManage: () => void;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ onBackToManage }) => {
  const {
    workouts,
    setWorkouts,
    addExerciseDefinition,
    updateExerciseDefinition,
    updateWorkoutExerciseProgramming
  } = useFitness();

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

  const handleSaveWorkout = (updatedWorkout: Workout) => {
    setWorkouts(prev => prev.map(w => w.id === updatedWorkout.id ? updatedWorkout : w));
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

  const handleCreateNewLibraryExercise = () => {
    const newBlankExercise: Exercise = {
      id: `ex-${crypto.randomUUID()}`,
      exerciseDefinitionId: `ex-${crypto.randomUUID()}`,
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

    return (
      <ExerciseEditor
        exercise={editingExerciseContext.exercise}
        workout={parentWorkout}
        onSave={handleSaveExercise}
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
    <Stack spacing="lg" className="animate-in fade-in-50 duration-200">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToManage}
            icon={<ChevronLeft size={16} />}
          >
            Back to Manage
          </Button>
          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
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

