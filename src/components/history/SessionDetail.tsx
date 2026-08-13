import React from 'react';
import { X, Calendar, Clock, Dumbbell, Trash2 } from 'lucide-react';
import { Card, Button, Badge, SectionHeader } from '../ui';
import { SessionLog, Workout, ExerciseDefinition } from '../../types/fitness';
import { getResolvedExerciseMeta, calculateSessionVolume } from '../../domain';

interface SessionDetailProps {
  session: SessionLog;
  workout?: Workout;
  defsMap: Map<string, ExerciseDefinition>;
  onClose: () => void;
  onDelete: (logId: string) => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({
  session,
  workout,
  defsMap,
  onClose,
  onDelete
}) => {
  const workoutName = workout?.name || session.workoutId || 'Custom Session';
  const totalVolume = calculateSessionVolume(session);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card variant="glass" className="w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-6 border-zinc-800">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-bold">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{workoutName}</h2>
              <p className="text-xs text-zinc-400 flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  {session.date}
                </span>
                {session.durationMinutes ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    {session.durationMinutes} mins
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Session Volume</div>
            <div className="text-lg font-bold text-orange-400 mt-0.5">{totalVolume} kg</div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Cycle Day</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">Day {session.cycleDay || 1}</div>
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader title="Recorded Exercises & Sets" />

          {Object.entries(session.sets || {}).map(([exKey, sets]) => {
            const meta = getResolvedExerciseMeta(exKey, defsMap);
            const validSets = Array.isArray(sets) ? sets.filter(s => s.done) : [];

            return (
              <div key={exKey} className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">{meta.name}</div>
                  <Badge variant="zinc">{meta.target}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400 font-mono">
                  {validSets.map((s, idx) => (
                    <div key={s.id || idx} className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800 text-center">
                      <span className="text-zinc-500 mr-1">#{idx + 1}</span>
                      <span className="text-white font-bold">{s.weight}kg</span> × {s.reps}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onDelete(session.id);
              onClose();
            }}
            className="text-red-400 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete Log
          </Button>

          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
};
