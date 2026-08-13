import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { Badge, Button } from '../ui';

interface SessionHeaderProps {
  workoutName: string;
  cycleDay?: number;
  durationMinutes: number;
  onCancel: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  workoutName,
  cycleDay,
  durationMinutes,
  onCancel
}) => {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="p-2 text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">{workoutName}</h1>
            {cycleDay && <Badge variant="orange">Day {cycleDay}</Badge>}
          </div>
          <div className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span>Active Session • {durationMinutes} mins elapsed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
