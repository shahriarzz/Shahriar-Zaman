import React, { useState, useMemo } from 'react';
import { ChevronLeft, Save, Layers, Minus, Plus } from 'lucide-react';
import { Exercise, Workout } from '../../types/fitness';
import {
  Card,
  Button,
  Input,
  Textarea,
  Badge,
  Banner,
  ToggleChip,
  Stack,
  Grid,
  SegmentedControl,
  showToast,
  TYPOGRAPHY,
  BORDER,
  SURFACE,
  RADIUS,
  EDITOR_HEADER
} from '../ui';
import { cn } from '../../lib/utils';
import { haptics } from '../../utils/haptics';

export interface ExerciseEditorProps {
  exercise: Exercise;
  workout?: Workout | null;
  onSave: (updatedExercise: Exercise, isDefinitionOnly?: boolean) => void;
  onCancel: () => void;
}

export const ExerciseEditor: React.FC<ExerciseEditorProps> = ({
  exercise,
  workout,
  onSave,
  onCancel
}) => {
  // 1. Global Exercise Definition State
  const [name, setName] = useState(exercise.name || '');
  const [nameTouched, setNameTouched] = useState(false);
  const [target, setTarget] = useState(exercise.target || '');
  const [equipment, setEquipment] = useState(exercise.equipment || '');
  const [instructions, setInstructions] = useState(exercise.instructions || '');
  const [tags, setTags] = useState<string[]>(exercise.tags || []);

  // 2. Workout Programming State (specific to this workout assignment)
  const [sets, setSets] = useState<number>(exercise.sets || 3);
  const [reps, setReps] = useState(exercise.reps || '10–12');
  const [rest, setRest] = useState(exercise.rest || '90s');
  const [note, setNote] = useState(exercise.note || '');

  const [activeTab, setActiveTab] = useState<'definition' | 'programming'>(
    workout ? 'programming' : 'definition'
  );

  const isDirty = useMemo(() => {
    const origTags = (exercise.tags || []).slice().sort().join(',');
    const curTags = tags.slice().sort().join(',');
    return (
      name !== (exercise.name || '') ||
      target !== (exercise.target || '') ||
      equipment !== (exercise.equipment || '') ||
      instructions !== (exercise.instructions || '') ||
      curTags !== origTags ||
      sets !== (exercise.sets || 3) ||
      reps !== (exercise.reps || '10–12') ||
      rest !== (exercise.rest || '90s') ||
      note !== (exercise.note || '')
    );
  }, [name, target, equipment, instructions, tags, sets, reps, rest, note, exercise]);

  const toggleTag = (t: string) => {
    haptics.selection();
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSave = () => {
    setNameTouched(true);
    if (!name.trim()) return;
    haptics.success();

    const updated: Exercise = {
      ...exercise,
      name: name.trim(),
      target: target.trim() || 'General',
      equipment: equipment.trim(),
      instructions: instructions.trim(),
      tags,
      sets: Math.max(1, sets || 3),
      reps: reps.trim() || '10–12',
      rest: rest.trim() || '90s',
      note: note.trim()
    };

    showToast({
      message: workout
        ? `Saved ${updated.name} prescription for ${workout.name}`
        : `Saved ${updated.name} definition`,
      tone: 'success'
    });
    onSave(updated);
  };

  return (
    <Stack spacing="lg">
      {/* Top Header & Navigation */}
      <div className={cn(EDITOR_HEADER.container, BORDER.standard)}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            icon={<ChevronLeft size={16} />}
          >
            {workout ? `Back to ${workout.name}` : 'Back to Library'}
          </Button>
          <div className={EDITOR_HEADER.divider} />
          <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
            Exercise Configuration
          </span>
          {isDirty && (
            <Badge label="Unsaved Changes" color="amber" variant="subtle" size="sm" />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            disabled={!name.trim()}
            onClick={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Mode Selector Tabs using SegmentedControl primitive */}
      <div className="w-full sm:w-fit overflow-x-auto scrollbar-none">
        <SegmentedControl
          options={[
            { value: 'definition', label: '1. Exercise Definition' },
            ...(workout ? [{ value: 'programming', label: `2. Programming (${workout.name})` }] : [])
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'definition' | 'programming')}
          accent="orange"
        />
      </div>

      {/* SECTION 1: GLOBAL EXERCISE DEFINITION */}
      {activeTab === 'definition' && (
        <Card variant="standard" padding="standard" className="space-y-6">
          <Banner
            variant={workout ? 'warning' : 'info'}
            size="compact"
            title={workout ? `Viewing Global Definition inside ${workout.name}` : 'Global Exercise Definition'}
            description={
              workout
                ? `Saving from a workout updates sets, reps, rest, and notes for ${workout.name}. To rename or edit global attributes across all workouts, edit from Manage → Exercises.`
                : 'Changes here update this movement name, target muscle, equipment, and technique cues across your entire Exercise Library.'
            }
          />

          <div className="space-y-1">
            <h3 className={cn(TYPOGRAPHY.label, "text-white text-sm font-bold flex items-center gap-2")}>
              <Layers size={14} className="text-orange-400" />
              Identity & Movement Details
            </h3>
          </div>

          <Grid cols={1} colsMd={2} gap="md">
            <Input
              label="Exercise Name"
              placeholder="e.g. Incline Dumbbell Press"
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              onBlur={() => setNameTouched(true)}
              error={nameTouched && !name.trim() ? 'Exercise name is required.' : undefined}
              required
            />

            <Input
              label="Target Muscle Group"
              placeholder="e.g. Upper Chest, Side Delts, Lats"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />

            <Input
              label="Equipment Type"
              placeholder="e.g. Dumbbell, Barbell, Cable, Machine"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className={cn(TYPOGRAPHY.label, "block")}>Tags & Attributes</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['priority', 'daily', 'compound', 'isolation', 'machine', 'free-weight'].map(t => {
                  const isSelected = tags.includes(t);
                  return (
                    <ToggleChip
                      key={t}
                      selected={isSelected}
                      onClick={() => toggleTag(t)}
                    >
                      {isSelected ? `✓ ${t}` : `+ ${t}`}
                    </ToggleChip>
                  );
                })}
              </div>
            </div>
          </Grid>

          {/* Form Cues / Instructions */}
          <Textarea
            label="Form Cues & Technique Guidance"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. 45° elbow tuck; pause 1s at bottom stretch; focus on clavicular fiber recruitment."
            rows={3}
          />
        </Card>
      )}

      {/* SECTION 2: WORKOUT SPECIFIC PROGRAMMING */}
      {activeTab === 'programming' && workout && (
        <Card variant="standard" padding="standard" className="space-y-6">
          <Banner
            variant="info"
            size="compact"
            title={`Workout-Specific Prescription · ${workout.name}`}
            description={`Sets, reps, rest, and coaching notes below apply only to ${workout.name} and leave other routines unchanged.`}
          />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge label={workout.name} color="orange" variant="subtle" size="sm" />
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Protocol Assignment</span>
            </div>
            <h3 className={cn(TYPOGRAPHY.label, "text-white text-sm font-bold")}>
              Volume & Intensity Targets
            </h3>
          </div>

          <Grid cols={1} colsMd={3} gap="md">
            <div className="space-y-1.5">
              <label className={cn(TYPOGRAPHY.label, "block")}>Working Sets</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  icon={<Minus size={14} />}
                  aria-label="Decrease sets"
                  onClick={() => setSets(Math.max(1, sets - 1))}
                />
                <div className={cn(SURFACE.subtle, BORDER.standard, RADIUS.button, "flex-1 h-11 border flex items-center justify-center font-mono font-bold text-white text-base tabular-nums")}>
                  {sets}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  icon={<Plus size={14} />}
                  aria-label="Increase sets"
                  onClick={() => setSets(sets + 1)}
                />
              </div>
            </div>

            <Input
              label="Rep Range"
              placeholder="e.g. 8–10, 12–15, Max"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />

            <Input
              label="Rest Target"
              placeholder="e.g. 90s, 2 min"
              value={rest}
              onChange={(e) => setRest(e.target.value)}
            />
          </Grid>

          {/* Coaching Execution Note */}
          <Textarea
            label="Workout Execution Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Safe to push to failure on last set; drop pin 1 notch for drop set."
            rows={3}
          />
        </Card>
      )}

      {/* Bottom Save Action */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          variant="outline"
          size="md"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Save size={14} />}
          disabled={!name.trim()}
          onClick={handleSave}
        >
          Save Exercise
        </Button>
      </div>
    </Stack>
  );
};
