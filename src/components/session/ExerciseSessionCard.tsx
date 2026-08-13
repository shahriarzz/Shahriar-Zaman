import React from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { SetRow } from './SetRow';
import { Card, Badge, Button } from '../ui';
import { SetLog, ExerciseDefinition, WorkoutExercise } from '../../types/fitness';

interface ExerciseSessionCardProps {
  exercise: WorkoutExercise;
  def?: ExerciseDefinition;
  sets: SetLog[];
  onUpdateSet: (setIndex: number, field: keyof SetLog, value: string | boolean) => void;
  onAddSet: () => void;
  onDeleteSet: (setIndex: number) => void;
}

export const ExerciseSessionCard: React.FC<ExerciseSessionCardProps> = ({
  exercise,
  def,
  sets,
  onUpdateSet,
  onAddSet,
  onDeleteSet
}) => {
  const name = def?.name || exercise.exerciseDefinitionId || 'Exercise';
  const target = def?.target || 'General';
  const completedSets = sets.filter(s => s.done).length;
  const isComplete = sets.length > 0 && completedSets === sets.length;

  return (
    <Card
      variant="default"
      className={`p-4 space-y-3 transition-all ${
        isComplete ? 'border-emerald-500/40 bg-emerald-500/[0.03]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-white flex items-center gap-2">
            {name}
            {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            Target: {target} • Goal: {exercise.sets} × {exercise.reps}
          </div>
        </div>

        <Badge variant={isComplete ? 'emerald' : 'orange'}>
          {completedSets} / {sets.length} sets
        </Badge>
      </div>

      <div className="space-y-2 pt-1">
        {sets.map((s, idx) => (
          <SetRow
            key={s.id || idx}
            setIndex={idx}
            set={s}
            onUpdate={(field, val) => onUpdateSet(idx, field, val)}
            onDelete={() => onDeleteSet(idx)}
          />
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={onAddSet} className="w-full text-xs text-zinc-400 hover:text-white">
        <Plus className="w-3.5 h-3.5 mr-1" />
        Add Extra Set
      </Button>
    </Card>
  );
};
