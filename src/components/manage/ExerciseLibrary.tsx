import React, { useState, useMemo } from 'react';
import { Search, Plus, Edit3, Tag, Dumbbell, Layers, Filter } from 'lucide-react';
import { Workout, Exercise } from '../../types/fitness';
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
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';
import { haptics } from '../../utils/haptics';

export interface ExerciseLibraryProps {
  workouts: Workout[];
  onOpenExerciseEditor: (exercise: Exercise) => void;
  onCreateNewExercise: () => void;
}

export interface LibraryItem {
  id: string;
  name: string;
  target: string;
  equipment?: string;
  instructions?: string;
  tags?: string[];
  sets?: number;
  reps?: string;
  rest?: string;
  note?: string;
  usedInWorkouts: { id: string; name: string }[];
}

export const ExerciseLibrary: React.FC<ExerciseLibraryProps> = ({
  workouts,
  onOpenExerciseEditor,
  onCreateNewExercise
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Build aggregated unique exercise catalog from all workouts
  const libraryItems: LibraryItem[] = useMemo(() => {
    const map = new Map<string, LibraryItem>();

    workouts.forEach(wo => {
      (wo.exercises || []).forEach(ex => {
        const key = ex.name.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, {
            id: ex.id,
            name: ex.name,
            target: ex.target,
            equipment: ex.equipment,
            instructions: ex.instructions,
            tags: ex.tags || [],
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest,
            note: ex.note,
            usedInWorkouts: [{ id: wo.id, name: wo.name }]
          });
        } else {
          const existing = map.get(key)!;
          if (!existing.usedInWorkouts.some(w => w.id === wo.id)) {
            existing.usedInWorkouts.push({ id: wo.id, name: wo.name });
          }
          // Merge tags and instructions if available
          if (ex.tags && ex.tags.length > 0) {
            existing.tags = Array.from(new Set([...(existing.tags || []), ...ex.tags]));
          }
          if (ex.equipment && !existing.equipment) existing.equipment = ex.equipment;
          if (ex.instructions && !existing.instructions) existing.instructions = ex.instructions;
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [workouts]);

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

      {/* Muscle Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
        {targetCategories.map(cat => {
          const isSelected = selectedFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                haptics.selection();
                setSelectedFilter(cat);
              }}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer select-none border",
                isSelected
                  ? "bg-orange-500 border-orange-500 text-black shadow-sm"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>

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
