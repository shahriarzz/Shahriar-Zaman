import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit3,
  Sparkles,
  Layers,
  Moon,
  Clock,
  Dumbbell,
  Check,
  Tag
} from 'lucide-react';
import { Workout, Exercise, WorkoutExercise, ExerciseDefinition } from '../../types/fitness';
import { WORKOUT_COLORS, resolveWorkoutExercise } from '../../utils/fitnessHelpers';
import { useConfirm } from '../../context/ConfirmContext';
import { useFitness } from '../../context/FitnessContext';
import { haptics } from '../../utils/haptics';
import {
  Card,
  Button,
  Input,
  Badge,
  Stack,
  Grid,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS,
  SPACING
} from '../ui';
import { cn } from '../../lib/utils';

export interface WorkoutEditorProps {
  workout: Workout;
  allWorkouts: Workout[];
  onSaveWorkout: (updatedWorkout: Workout) => void;
  onOpenExerciseEditor: (exercise: Exercise) => void;
  onBack: () => void;
}

export const WorkoutEditor: React.FC<WorkoutEditorProps> = ({
  workout,
  allWorkouts,
  onSaveWorkout,
  onOpenExerciseEditor,
  onBack
}) => {
  const { confirm } = useConfirm();
  const { exerciseDefinitions, addExerciseDefinition } = useFitness();

  // Track expanded state for each exercise card (using exercise ID)
  const [expandedExIds, setExpandedExIds] = useState<Set<string>>(new Set());

  // Adding exercise modal / drawer state
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [addMode, setAddMode] = useState<'pick' | 'new'>('pick');
  const [selectedLibraryExName, setSelectedLibraryExName] = useState('');
  const [newExName, setNewExName] = useState('');
  const [newExTarget, setNewExTarget] = useState('');
  const [newExSets, setNewExSets] = useState(3);
  const [newExReps, setNewExReps] = useState('10–12');
  const [searchLibraryQuery, setSearchLibraryQuery] = useState('');

  // Workout name & badge editing
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [workoutName, setWorkoutName] = useState(workout.name);
  const [workoutBadge, setWorkoutBadge] = useState(workout.badge);

  // Rest day notes editing
  const [restNotes, setRestNotes] = useState<string[]>(workout.restNotes || []);
  const [newRestNote, setNewRestNote] = useState('');

  // Use persisted exercise definitions from library
  const libraryExercises = React.useMemo(() => {
    return (exerciseDefinitions || []).map(def => ({
      id: def.id,
      exerciseDefinitionId: def.id,
      exerciseId: def.id,
      name: def.name,
      target: def.target,
      equipment: def.equipment,
      instructions: def.instructions,
      tags: def.tags || [],
      sets: 3,
      reps: '10–12',
      rest: '90s',
      note: ''
    }));
  }, [exerciseDefinitions]);

  const filteredLibraryExercises = React.useMemo(() => {
    const q = searchLibraryQuery.toLowerCase().trim();
    if (!q) return libraryExercises;
    return libraryExercises.filter(ex =>
      ex.name.toLowerCase().includes(q) || ex.target.toLowerCase().includes(q)
    );
  }, [libraryExercises, searchLibraryQuery]);

  const toggleExpandExercise = (exId: string) => {
    haptics.selection();
    setExpandedExIds(prev => {
      const next = new Set(prev);
      if (next.has(exId)) {
        next.delete(exId);
      } else {
        next.add(exId);
      }
      return next;
    });
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= workout.exercises.length) return;

    haptics.medium();
    const updatedExercises = [...workout.exercises];
    const temp = updatedExercises[index];
    updatedExercises[index] = updatedExercises[targetIndex];
    updatedExercises[targetIndex] = temp;

    onSaveWorkout({
      ...workout,
      exercises: updatedExercises
    });
  };

  const handleDeleteExercise = async (exId: string, exName: string) => {
    const proceed = await confirm({
      title: 'Remove Exercise',
      message: `Remove "${exName}" from ${workout.name}?`,
      isDanger: true
    });
    if (!proceed) return;

    haptics.warning();
    onSaveWorkout({
      ...workout,
      exercises: workout.exercises.filter(e => e.id !== exId)
    });
  };

  const handleUpdateExerciseField = (
    exId: string,
    field: keyof Exercise,
    value: any
  ) => {
    const updatedExercises = workout.exercises.map(ex => {
      if (ex.id === exId) {
        return { ...ex, [field]: value };
      }
      return ex;
    });

    onSaveWorkout({
      ...workout,
      exercises: updatedExercises
    });
  };

  const handleTogglePriorityTag = (exId: string) => {
    haptics.selection();
    const ex = workout.exercises.find(e => e.id === exId);
    if (!ex) return;
    const currentTags = ex.tags || [];
    const newTags = currentTags.includes('priority')
      ? currentTags.filter(t => t !== 'priority')
      : [...currentTags, 'priority'];
    handleUpdateExerciseField(exId, 'tags', newTags);
  };

  const handleToggleDailyTag = (exId: string) => {
    haptics.selection();
    const ex = workout.exercises.find(e => e.id === exId);
    if (!ex) return;
    const currentTags = ex.tags || [];
    const newTags = currentTags.includes('daily')
      ? currentTags.filter(t => t !== 'daily')
      : [...currentTags, 'daily'];
    handleUpdateExerciseField(exId, 'tags', newTags);
  };

  const handleAddExerciseFromLibrary = (libEx: Exercise | ExerciseDefinition) => {
    haptics.success();
    const defId = (libEx as Exercise).exerciseDefinitionId || libEx.id;
    const newEx: WorkoutExercise = {
      exerciseDefinitionId: defId,
      sets: (libEx as Exercise).sets || 3,
      reps: (libEx as Exercise).reps || '10–12',
      rest: (libEx as Exercise).rest || '90s',
      tags: [],
      note: (libEx as Exercise).note || ''
    };

    onSaveWorkout({
      ...workout,
      exercises: [...(workout.exercises || []), newEx]
    });
    setIsAddingExercise(false);
  };

  const handleCreateNewExercise = async () => {
    if (!newExName.trim()) return;
    haptics.success();

    const createdDef = await addExerciseDefinition({
      name: newExName.trim(),
      target: newExTarget.trim() || 'General',
      equipment: '',
      instructions: '',
      tags: []
    });

    const newEx: WorkoutExercise = {
      exerciseDefinitionId: createdDef.id,
      sets: Math.max(1, newExSets || 3),
      reps: newExReps.trim() || '10–12',
      rest: '90s',
      tags: [],
      note: ''
    };

    onSaveWorkout({
      ...workout,
      exercises: [...(workout.exercises || []), newEx]
    });

    setNewExName('');
    setNewExTarget('');
    setIsAddingExercise(false);
  };

  const handleSaveMeta = () => {
    if (!workoutName.trim()) return;
    haptics.success();
    onSaveWorkout({
      ...workout,
      name: workoutName.trim(),
      badge: workoutBadge.trim() || workout.badge
    });
    setIsEditingMeta(false);
  };

  const handleAddRestNote = () => {
    if (!newRestNote.trim()) return;
    haptics.light();
    const updated = [...restNotes, newRestNote.trim()];
    setRestNotes(updated);
    onSaveWorkout({
      ...workout,
      restNotes: updated
    });
    setNewRestNote('');
  };

  const handleDeleteRestNote = (index: number) => {
    haptics.warning();
    const updated = restNotes.filter((_, i) => i !== index);
    setRestNotes(updated);
    onSaveWorkout({
      ...workout,
      restNotes: updated
    });
  };

  const isRest = workout.type === 'rest';

  return (
    <Stack spacing="lg" className="animate-in fade-in-50 duration-200">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            icon={<ChevronLeft size={16} />}
          >
            Back to Program Cycle
          </Button>
          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
          <span className={cn(TYPOGRAPHY.label, "text-zinc-500")}>
            {workout.cycleDay ? `Day ${workout.cycleDay}` : 'Auxiliary'}
          </span>
        </div>

        {!isRest && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              setIsAddingExercise(true);
              setAddMode('pick');
            }}
          >
            Add Exercise
          </Button>
        )}
      </div>

      {/* Workout Header Card */}
      <Card variant="standard" padding="standard" className="border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-3 h-8 rounded-full shrink-0"
              style={{ backgroundColor: WORKOUT_COLORS[workout.type] || '#f97316' }}
            />
            <div className="space-y-1 min-w-0">
              {isEditingMeta ? (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Input
                    size="sm"
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="Workout Name"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={handleSaveMeta}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingMeta(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className={cn(TYPOGRAPHY.titleSection, "text-white text-xl")}>
                    {workout.name}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={<Edit3 size={13} />}
                    className="text-zinc-500 hover:text-white"
                    onClick={() => {
                      setWorkoutName(workout.name);
                      setWorkoutBadge(workout.badge);
                      setIsEditingMeta(true);
                    }}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
                <Badge
                  label={workout.badge}
                  color={isRest ? 'zinc' : (workout.type as any)}
                  variant="subtle"
                  size="sm"
                />
                <span>·</span>
                <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
                  {isRest ? 'Recovery Day' : `${workout.exercises?.length || 0} Programmed Exercises`}
                </span>
                {workout.cardio && (
                  <>
                    <span>·</span>
                    <span className="text-orange-400 font-mono text-xs font-bold">
                      {workout.cardio.name} ({workout.cardio.duration})
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* REST DAY VIEW */}
      {isRest ? (
        <Card variant="standard" surface="recessed" padding="relaxed" className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400">
              <Moon size={24} className="text-orange-400" />
            </div>
            <div>
              <h3 className={cn(TYPOGRAPHY.label, "text-white text-sm font-bold")}>
                Recovery & Regeneration Phase
              </h3>
              <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400")}>
                No heavy resistance training scheduled. Focus on hydration, nutrition targets, and sleep.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>
              Recovery Protocol Checkpoints
            </label>
            <div className="space-y-2">
              {restNotes.map((note, idx) => (
                <div
                  key={idx}
                  className={cn(
                    SURFACE.subtle,
                    BORDER.standard,
                    RADIUS.button,
                    "p-3 border flex items-center justify-between gap-3 text-xs text-zinc-200"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400" />
                    {note}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={<Trash2 size={13} />}
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => handleDeleteRestNote(idx)}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Input
                size="sm"
                placeholder="Add recovery target (e.g. 150g Protein, 3L Water, 8h Sleep)..."
                value={newRestNote}
                onChange={(e) => setNewRestNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRestNote();
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddRestNote}
                disabled={!newRestNote.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        /* ACTIVE WORKOUT: EXPANDABLE EXERCISE CARDS */
        <div className="space-y-3">
          {workout.exercises.length === 0 ? (
            <Card variant="standard" surface="recessed" padding="relaxed" className="text-center space-y-3">
              <Dumbbell size={32} className="text-zinc-600 mx-auto" />
              <div className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
                No exercises programmed in this routine
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => {
                  setIsAddingExercise(true);
                  setAddMode('pick');
                }}
              >
                Add Your First Exercise
              </Button>
            </Card>
          ) : (
            workout.exercises.map((ex, index) => {
              const resolvedEx = resolveWorkoutExercise(ex, exerciseDefinitions);
              const exId = ex.exerciseDefinitionId || ex.exerciseId || ex.id;
              const isExpanded = expandedExIds.has(exId);
              const isFirst = index === 0;
              const isLast = index === workout.exercises.length - 1;
              const isPriority = (ex.tags || []).includes('priority');
              const isDaily = (ex.tags || []).includes('daily');

              return (
                <div
                  key={exId}
                  className={cn(
                    SURFACE.default,
                    BORDER.standard,
                    RADIUS.card,
                    "border overflow-hidden transition-all duration-200",
                    isExpanded ? "border-zinc-700 bg-zinc-900/90 shadow-lg" : "hover:border-zinc-700/80"
                  )}
                >
                  {/* COLLAPSED HEADER (SessionView Pattern) */}
                  <div
                    onClick={() => toggleExpandExercise(exId)}
                    className="p-4 cursor-pointer hover:bg-zinc-800/20 transition-colors flex items-center justify-between gap-3 select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Exercise Index Badge */}
                      <div className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs font-bold text-zinc-400 shrink-0">
                        {index + 1}
                      </div>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm truncate">
                            {resolvedEx.name}
                          </span>
                          {isPriority && (
                            <Badge label="PRIORITY" color="orange" size="sm" dot={false} />
                          )}
                          {isDaily && (
                            <Badge label="DAILY" color="amber" size="sm" dot={false} />
                          )}
                        </div>

                        <div className={cn(TYPOGRAPHY.label, "text-zinc-500 text-[10px] flex items-center gap-1.5 flex-wrap")}>
                          <span>{resolvedEx.target}</span>
                          <span>·</span>
                          <span className="text-zinc-300 font-bold">{ex.sets} Sets</span>
                          <span>·</span>
                          <span className="text-zinc-300 font-bold">{ex.reps} Reps</span>
                          {ex.rest && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-400">{ex.rest} rest</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reorder and Expand Affordances */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Quick touch-friendly reorder controls */}
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={<ArrowUp size={14} />}
                        disabled={isFirst}
                        onClick={() => handleMoveExercise(index, 'up')}
                        className={cn(
                          "w-8 h-8 text-zinc-500 hover:text-white",
                          isFirst && "opacity-20 cursor-not-allowed"
                        )}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={<ArrowDown size={14} />}
                        disabled={isLast}
                        onClick={() => handleMoveExercise(index, 'down')}
                        className={cn(
                          "w-8 h-8 text-zinc-500 hover:text-white",
                          isLast && "opacity-20 cursor-not-allowed"
                        )}
                      />

                      {/* Expand/Collapse Chevron */}
                      <div
                        onClick={() => toggleExpandExercise(ex.id)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-transform cursor-pointer"
                      >
                        <ChevronDown
                          size={16}
                          className={cn("transition-transform duration-200", isExpanded && "rotate-180")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* EXPANDED DETAILS (Form & Programming Controls) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden border-t border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4"
                      >
                        <Grid cols={1} colsMd={3} gap="sm">
                          {/* Sets adjustment */}
                          <div className="space-y-1">
                            <label className={cn(TYPOGRAPHY.label, "text-[10px] block")}>Sets</label>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateExerciseField(ex.id, 'sets', Math.max(1, ex.sets - 1))}
                                className="w-8 h-8 p-0"
                              >
                                -
                              </Button>
                              <div className={cn(SURFACE.subtle, BORDER.standard, RADIUS.button, "flex-1 h-8 border flex items-center justify-center font-mono font-bold text-xs text-white")}>
                                {ex.sets}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateExerciseField(ex.id, 'sets', ex.sets + 1)}
                                className="w-8 h-8 p-0"
                              >
                                +
                              </Button>
                            </div>
                          </div>

                          {/* Rep Range */}
                          <Input
                            size="sm"
                            label="Rep Range"
                            value={ex.reps}
                            placeholder="e.g. 8–10"
                            onChange={(e) => handleUpdateExerciseField(ex.id, 'reps', e.target.value)}
                          />

                          {/* Rest */}
                          <Input
                            size="sm"
                            label="Rest Target"
                            value={ex.rest || '90s'}
                            placeholder="e.g. 90s, 2 min"
                            onChange={(e) => handleUpdateExerciseField(ex.id, 'rest', e.target.value)}
                          />
                        </Grid>

                        {/* Note / Execution Cues */}
                        <div className="space-y-1">
                          <label className={cn(TYPOGRAPHY.label, "text-[10px] block")}>
                            Execution Cues & Notes
                          </label>
                          <input
                            type="text"
                            value={ex.note || ''}
                            placeholder="e.g. 45° elbow tuck; focus on the deep stretch."
                            onChange={(e) => handleUpdateExerciseField(ex.id, 'note', e.target.value)}
                            className={cn(
                              SURFACE.subtle,
                              BORDER.standard,
                              RADIUS.button,
                              "w-full h-8 px-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none border focus:border-zinc-600 font-sans"
                            )}
                          />
                        </div>

                        {/* Priority / Tag Toggles & Deep Editor Link */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-800/60">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleTogglePriorityTag(ex.id)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border cursor-pointer select-none",
                                isPriority
                                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              {isPriority ? '★ Priority Item' : '+ Mark Priority'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleDailyTag(ex.id)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border cursor-pointer select-none",
                                isDaily
                                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              {isDaily ? '✓ Daily High-Frequency' : '+ Mark Daily'}
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Edit3 size={12} />}
                              onClick={() => onOpenExerciseEditor(resolvedEx)}
                            >
                              Edit Definition →
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={13} />}
                              className="text-zinc-500 hover:text-red-400"
                              onClick={() => handleDeleteExercise(exId, resolvedEx.name)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ADD EXERCISE MODAL / DRAWER */}
      {isAddingExercise && (
        <Card variant="standard" surface="recessed" padding="standard" className="border-orange-500/40 bg-zinc-950 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className={cn(TYPOGRAPHY.label, "text-white text-xs font-bold flex items-center gap-2")}>
              <Plus size={14} className="text-orange-500" />
              Add Exercise to {workout.name}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAddingExercise(false)}
            >
              Cancel
            </Button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setAddMode('pick')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer select-none",
                addMode === 'pick'
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              Choose from Library ({libraryExercises.length})
            </button>
            <button
              type="button"
              onClick={() => setAddMode('new')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer select-none",
                addMode === 'new'
                  ? "bg-orange-500 text-black"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              + Create New Custom
            </button>
          </div>

          {addMode === 'pick' ? (
            <div className="space-y-3">
              <Input
                size="sm"
                placeholder="Search library by name or muscle group..."
                value={searchLibraryQuery}
                onChange={(e) => setSearchLibraryQuery(e.target.value)}
              />

              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {filteredLibraryExercises.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                    No matching exercises found in library.
                  </div>
                ) : (
                  filteredLibraryExercises.map((libEx) => (
                    <div
                      key={libEx.name}
                      onClick={() => handleAddExerciseFromLibrary(libEx)}
                      className={cn(
                        SURFACE.subtle,
                        BORDER.standard,
                        RADIUS.button,
                        "p-2.5 border flex items-center justify-between hover:border-zinc-700 hover:bg-zinc-900/60 cursor-pointer transition-all"
                      )}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-white">{libEx.name}</div>
                        <div className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 text-[9px]")}>
                          {libEx.target} · {libEx.sets} sets × {libEx.reps}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={12} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddExerciseFromLibrary(libEx);
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Grid cols={1} colsMd={2} gap="sm">
                <Input
                  label="Exercise Name"
                  placeholder="e.g. Dumbbell Hammer Curl"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  required
                />
                <Input
                  label="Target Muscle Group"
                  placeholder="e.g. Forearms, Biceps"
                  value={newExTarget}
                  onChange={(e) => setNewExTarget(e.target.value)}
                />
                <Input
                  label="Initial Sets"
                  type="number"
                  value={newExSets}
                  onChange={(e) => setNewExSets(parseInt(e.target.value, 10) || 3)}
                />
                <Input
                  label="Initial Rep Range"
                  value={newExReps}
                  placeholder="e.g. 10–12"
                  onChange={(e) => setNewExReps(e.target.value)}
                />
              </Grid>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingExercise(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!newExName.trim()}
                  onClick={handleCreateNewExercise}
                >
                  Add Exercise to Workout
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </Stack>
  );
};
