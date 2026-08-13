import React from 'react';
import { Calendar, Clock, Dumbbell, Trash2, ChevronRight } from 'lucide-react';
import { Card, Badge } from '../ui';
import { SessionLog, Workout, ExerciseDefinition } from '../../types/fitness';
import { calculateSessionVolume } from '../../domain';

interface SessionHistoryCardProps {
  session: SessionLog;
  workout?: Workout;
  defsMap: Map<string, ExerciseDefinition>;
  onSelect: (logId: string) => void;
  onDelete: (logId: string, e: React.MouseEvent) => void;
}

export const SessionHistoryCard: React.FC<SessionHistoryCardProps> = ({
  session,
  workout,
  defsMap,
  onSelect,
  onDelete
}) => {
  const volume = calculateSessionVolume(session);
  const workoutName = workout?.name || session.workoutId || 'Custom Session';

  const completedSetsCount = Object.values(session.sets || {}).reduce((acc: number, setArr) => {
    return acc + (Array.isArray(setArr) ? setArr.filter(s => s.done).length : 0);
  }, 0);

  return (
    <Card
      variant="default"
      onClick={() => onSelect(session.id)}
      className="p-4 cursor-pointer hover:border-zinc-700 transition-all space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs">
            <Dumbbell className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{workoutName}</div>
            <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-zinc-500" />
                {session.date}
              </span>
              {session.durationMinutes ? (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {session.durationMinutes} mins
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-xs font-bold text-orange-400">{volume} kg</div>
            <div className="text-[10px] text-zinc-500">{completedSetsCount} sets done</div>
          </div>
          <button
            onClick={(e) => onDelete(session.id, e)}
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
};
