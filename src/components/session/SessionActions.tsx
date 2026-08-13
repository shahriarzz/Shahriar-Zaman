import React from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '../ui';

interface SessionActionsProps {
  completedSets: number;
  totalSets: number;
  onComplete: () => void;
  onCancel: () => void;
}

export const SessionActions: React.FC<SessionActionsProps> = ({
  completedSets,
  totalSets,
  onComplete,
  onCancel
}) => {
  return (
    <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-800">
      <Button
        variant="outline"
        size="md"
        onClick={onCancel}
        className="text-red-400 border-red-500/20 hover:bg-red-500/10"
      >
        <Trash2 className="w-4 h-4 mr-1.5" />
        Cancel
      </Button>

      <Button
        variant="primary"
        size="md"
        onClick={onComplete}
        className="flex-1 max-w-xs font-bold"
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Finish Workout ({completedSets}/{totalSets} Sets)
      </Button>
    </div>
  );
};
