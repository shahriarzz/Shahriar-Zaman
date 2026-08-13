import React from 'react';
import { Calendar } from 'lucide-react';
import { SessionHistoryCard } from './SessionHistoryCard';
import { SessionLog, Workout, ExerciseDefinition } from '../../types/fitness';
import { Card, SectionHeader } from '../ui';

interface SessionHistoryListProps {
  sessions: SessionLog[];
  workoutMap: Map<string, Workout>;
  defsMap: Map<string, ExerciseDefinition>;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

export const SessionHistoryList: React.FC<SessionHistoryListProps> = ({
  sessions,
  workoutMap,
  defsMap,
  onSelectSession,
  onDeleteSession
}) => {
  if (sessions.length === 0) {
    return (
      <Card variant="default" className="p-8 text-center space-y-2 border-dashed border-zinc-800">
        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
          <Calendar className="w-5 h-5" />
        </div>
        <div className="text-sm font-semibold text-white">No Matching History</div>
        <div className="text-xs text-zinc-500 max-w-xs mx-auto">
          No recorded workout sessions match the current search query or date filter.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map(session => (
        <SessionHistoryCard
          key={session.id}
          session={session}
          workout={workoutMap.get(session.workoutId)}
          defsMap={defsMap}
          onSelect={onSelectSession}
          onDelete={onDeleteSession}
        />
      ))}
    </div>
  );
};
