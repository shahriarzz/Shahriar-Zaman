import React from 'react';
import { Check, Trash2 } from 'lucide-react';
import { SetLog } from '../../types/fitness';
import { Input } from '../ui';

interface SetRowProps {
  setIndex: number;
  set: SetLog;
  onUpdate: (field: keyof SetLog, value: string | boolean) => void;
  onDelete: () => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  setIndex,
  set,
  onUpdate,
  onDelete
}) => {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-6 text-center font-bold text-zinc-500">#{setIndex + 1}</div>

      <div className="flex-1 flex items-center gap-2">
        <Input
          type="number"
          placeholder="0"
          value={set.weight}
          onChange={(e) => onUpdate('weight', e.target.value)}
          className="h-9 text-center font-mono font-bold"
        />
        <span className="text-zinc-500 font-bold">kg</span>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <Input
          type="number"
          placeholder="0"
          value={set.reps}
          onChange={(e) => onUpdate('reps', e.target.value)}
          className="h-9 text-center font-mono font-bold"
        />
        <span className="text-zinc-500 font-bold">reps</span>
      </div>

      <button
        onClick={() => onUpdate('done', !set.done)}
        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
          set.done
            ? 'bg-emerald-500 border-emerald-400 text-black font-bold'
            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'
        }`}
      >
        <Check className="w-4 h-4" />
      </button>

      <button
        onClick={onDelete}
        className="p-2 text-zinc-600 hover:text-red-400 rounded-lg transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
