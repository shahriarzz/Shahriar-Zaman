import React, { useState } from 'react';
import { ChevronLeft, Save, Sparkles, Tag, Layers, Dumbbell, Info, Clock, Hash, RotateCw } from 'lucide-react';
import { Exercise, Workout } from '../../types/fitness';
import {
  Card,
  Button,
  Input,
  Badge,
  Stack,
  Grid,
  SegmentedControl,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS
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
  const [target, setTarget] = useState(exercise.target || '');
  const [equipment, setEquipment] = useState(exercise.equipment || '');
  const [instructions, setInstructions] = useState(exercise.instructions || '');
  const [tags, setTags] = useState<string[]>(exercise.tags || []);
  const [tagInput, setTagInput] = useState('');

  // 2. Workout Programming State (specific to this workout assignment)
  const [sets, setSets] = useState<number>(exercise.sets || 3);
  const [reps, setReps] = useState(exercise.reps || '10–12');
  const [rest, setRest] = useState(exercise.rest || '90s');
  const [note, setNote] = useState(exercise.note || '');

  const [activeTab, setActiveTab] = useState<'definition' | 'programming'>(
    workout ? 'programming' : 'definition'
  );

  const toggleTag = (t: string) => {
    haptics.selection();
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleAddCustomTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      haptics.light();
      setTags(prev => [...prev, trimmed]);
      setTagInput('');
    }
  };

  const handleSave = () => {
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

    onSave(updated);
  };

  return (
    <Stack spacing="lg" className="animate-in fade-in-50 duration-200">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            icon={<ChevronLeft size={16} />}
          >
            {workout ? `Back to ${workout.name}` : 'Back to Library'}
          </Button>
          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
          <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
            Exercise Configuration
          </span>
        </div>

        <div className="flex items-center gap-2">
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
      <div className="w-fit">
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
          <div className="space-y-1">
            <h3 className={cn(TYPOGRAPHY.label, "text-white text-sm font-bold flex items-center gap-2")}>
              <Layers size={14} className="text-orange-500" />
              Global Exercise Definition
            </h3>
            <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400")}>
              Core properties that define this movement across all workouts and catalog views.
            </p>
          </div>

          <Grid cols={1} colsMd={2} gap="md">
            <Input
              label="Exercise Name"
              placeholder="e.g. Incline Dumbbell Press"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all border select-none cursor-pointer",
                        isSelected
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {isSelected ? `✓ ${t}` : `+ ${t}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </Grid>

          {/* Form Cues / Instructions */}
          <div className="space-y-1.5">
            <label className={cn(TYPOGRAPHY.label, "block")}>Form Cues & Technique Guidance</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. 45° elbow tuck; pause 1s at bottom stretch; focus on clavicular fiber recruitment."
              className={cn(
                SURFACE.subtle,
                BORDER.standard,
                RADIUS.button,
                "w-full h-24 p-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none border focus:border-orange-500/50 resize-none font-sans"
              )}
            />
          </div>
        </Card>
      )}

      {/* SECTION 2: WORKOUT SPECIFIC PROGRAMMING */}
      {activeTab === 'programming' && workout && (
        <Card variant="standard" padding="standard" className="space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge label={workout.name} color="orange" variant="subtle" size="sm" />
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500")}>Protocol Assignment</span>
            </div>
            <h3 className={cn(TYPOGRAPHY.label, "text-white text-sm font-bold")}>
              Workout Specific Programming
            </h3>
            <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400")}>
              Target volume, intensity, and coaching notes programmed specifically for <strong className="text-zinc-200">{workout.name}</strong>.
            </p>
          </div>

          <Grid cols={1} colsMd={3} gap="md">
            <div className="space-y-1.5">
              <label className={cn(TYPOGRAPHY.label, "block")}>Working Sets</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSets(Math.max(1, sets - 1))}
                  className="w-10 h-10 p-0 font-bold text-base"
                >
                  -
                </Button>
                <div className={cn(SURFACE.subtle, BORDER.standard, RADIUS.button, "flex-1 h-10 border flex items-center justify-center font-mono font-bold text-white text-base")}>
                  {sets}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSets(sets + 1)}
                  className="w-10 h-10 p-0 font-bold text-base"
                >
                  +
                </Button>
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
          <div className="space-y-1.5">
            <label className={cn(TYPOGRAPHY.label, "block")}>Workout Execution Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Safe to push to failure on last set; drop pin 1 notch for drop set."
              className={cn(
                SURFACE.subtle,
                BORDER.standard,
                RADIUS.button,
                "w-full h-24 p-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none border focus:border-orange-500/50 resize-none font-sans"
              )}
            />
          </div>
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
