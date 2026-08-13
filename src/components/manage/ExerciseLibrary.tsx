import React, { useState, useMemo } from 'react';
import { Search, Plus, Edit3, Tag, Dumbbell, Layers, Filter } from 'lucide-react';
import { Workout, Exercise, ExerciseDefinition } from '../../types/fitness';
import { useFitness } from '../../context/FitnessContext';
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

export interface ExerciseLibraryProps {
  workouts: Workout[];
  onOpenExerciseEditor: (exercise: Exercise) => void;
  onCreateNewExercise: () => void;
}

export interface LibraryItem extends ExerciseDefinition {
  usedInWorkouts: { id: string; name: string }[];
}

export const ExerciseLibrary: React.FC<ExerciseLibraryProps> = ({
  workouts,
  onOpenExerciseEditor,
  onCreateNewExercise
}) => {
  const { exerciseDefinitions } = useFitness();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Build items directly from persisted exercise definitions
  const libraryItems: LibraryItem[] = useMemo(() => {
    return (exerciseDefinitions || []).map(def => {
      const usedWorkouts = workouts.filter(wo =>
        (wo.exercises || []).some(ex => (ex.exerciseDefinitionId || ex.exerciseId) === def.id)
      ).map(wo => ({ id: wo.id, name: wo.name }));

      return {
        ...def,
        usedInWorkouts: usedWorkouts
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [exerciseDefinitions, workouts]);

  // Filter categories
  const targetCategories = ['all', 'chest', 'back', 'delts', 'biceps', 'triceps', 'legs', 'forearms', 'core'];

  const filteredItems = useMemo(() => {
    let list = libraryItems;

    if (selectedFilter !== 'all') {
      list = list.filter(item => {
        const t = (item.target || '').toLowerCase();
        const n = (item.name || '').toLowerCase();
        return t.includes(selectedFilter) || n.includes(selectedFilter);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.target || '').toLowerCase().includes(q) ||
        (item.equipment || '').toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [libraryItems, selectedFilter, searchQuery]);

  return (
    <Stack spacing="lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className={cn(TYPOGRAPHY.titleSubsection, "text-white")}>
            Exercise Library ({libraryItems.length})
          </h3>
          <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400 mt-1")}>
            Master repository of exercise definitions and movements.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={onCreateNewExercise}
        >
          + New Exercise
        </Button>
      </div>

      {/* Search Input using existing primitive */}
      <Input
        placeholder="Search exercises by name, muscle group, or tag..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        leftIcon={<Search size={14} className="text-zinc-500" />}
      />

      {/* Muscle Filter Categories using SegmentedControl primitive */}
      <SegmentedControl
        options={targetCategories.map(cat => ({
          value: cat,
          label: cat
        }))}
        value={selectedFilter}
        onChange={(val) => {
          haptics.selection();
          setSelectedFilter(val);
        }}
        accent="orange"
        className="overflow-x-auto custom-scrollbar flex-nowrap"
      />

      {/* Exercise Cards Grid / List */}
      <div className="space-y-2.5">
        {filteredItems.length === 0 ? (
          <Card variant="standard" surface="recessed" padding="relaxed" className="text-center space-y-2">
            <Dumbbell size={28} className="text-zinc-600 mx-auto" />
            <div className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
              No exercises match your search
            </div>
            <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-500")}>
              Try clearing your search query or create a new custom exercise.
            </p>
          </Card>
        ) : (
          filteredItems.map(item => {
            const hasPriority = (item.tags || []).includes('priority');
            const hasDaily = (item.tags || []).includes('daily');

            return (
              <Card
                key={item.name}
                variant="interactive"
                surface="base"
                padding="standard"
                onClick={() => onOpenExerciseEditor(item as Exercise)}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group select-none"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm group-hover:text-orange-400 transition-colors">
                      {item.name}
                    </span>
                    {hasPriority && (
                      <Badge label="PRIORITY" color="orange" size="sm" dot={false} />
                    )}
                    {hasDaily && (
                      <Badge label="DAILY" color="amber" size="sm" dot={false} />
                    )}
                    {item.equipment && (
                      <span className="text-[9px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 uppercase">
                        {item.equipment}
                      </span>
                    )}
                  </div>

                  <div className={cn(TYPOGRAPHY.label, "text-zinc-500 text-[10px] flex items-center gap-1.5 flex-wrap")}>
                    <span className="text-zinc-400 font-bold">{item.target}</span>
                    <span>·</span>
                    <span>
                      Used in: {item.usedInWorkouts.map(w => w.name).join(', ') || 'None'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Edit3 size={12} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenExerciseEditor(item as Exercise);
                    }}
                  >
                    Edit Definition
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </Stack>
  );
};
