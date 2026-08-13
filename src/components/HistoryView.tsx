import React, { useState, useMemo, useEffect } from 'react';
import { useFitness } from '../context/FitnessContext';
import { useConfirm } from '../context/ConfirmContext';
import { createExerciseDefinitionMap } from '../domain';
import { SessionLog, Workout } from '../types/fitness';
import { HistoryHeader } from './history/HistoryHeader';
import { HistoryFilters } from './history/HistoryFilters';
import { SessionHistoryList } from './history/SessionHistoryList';
import { SessionDetail } from './history/SessionDetail';

interface HistoryViewProps {
  initialDate?: string | null;
  onClearInitialDate?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ initialDate, onClearInitialDate }) => {
  const { logs, workouts, exerciseDefinitions, deleteLog } = useFitness();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (initialDate) {
      setSearch(initialDate);
    }
  }, [initialDate]);

  const defsMap = useMemo(() => {
    return createExerciseDefinitionMap(exerciseDefinitions || []);
  }, [exerciseDefinitions]);

  const workoutMap = useMemo(() => {
    const map = new Map<string, Workout>();
    (workouts || []).forEach(w => map.set(w.id, w));
    return map;
  }, [workouts]);

  const allSessions = useMemo(() => {
    return (Object.values(logs || {}) as SessionLog[])
      .filter(l => l && l.complete)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs]);

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return allSessions;
    const query = search.toLowerCase();

    return allSessions.filter(session => {
      const workoutName = workoutMap.get(session.workoutId)?.name?.toLowerCase() || '';
      const matchesDate = session.date.includes(query);
      const matchesName = workoutName.includes(query);

      const matchesExercise = Object.keys(session.sets || {}).some(exKey => {
        const def = defsMap.get(exKey);
        return def?.name.toLowerCase().includes(query) || exKey.toLowerCase().includes(query);
      });

      return matchesDate || matchesName || matchesExercise;
    });
  }, [allSessions, search, workoutMap, defsMap]);

  const handleClear = () => {
    setSearch('');
    onClearInitialDate?.();
  };

  const handleDeleteSession = async (logId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isConfirmed = await confirm({
      title: 'Delete History Record',
      message: 'Are you sure you want to delete this recorded session? This action cannot be undone.',
      confirmText: 'Delete',
      danger: true
    });

    if (isConfirmed) {
      await deleteLog(logId);
      if (selectedSessionId === logId) {
        setSelectedSessionId(null);
      }
    }
  };

  const selectedSession = selectedSessionId ? logs[selectedSessionId] : null;

  return (
    <div className="space-y-6 pb-20">
      <HistoryHeader totalSessions={allSessions.length} />

      <HistoryFilters
        search={search}
        onSearchChange={setSearch}
        onClear={handleClear}
        initialDate={initialDate}
      />

      <SessionHistoryList
        sessions={filteredSessions}
        workoutMap={workoutMap}
        defsMap={defsMap}
        onSelectSession={setSelectedSessionId}
        onDeleteSession={handleDeleteSession}
      />

      {selectedSession && (
        <SessionDetail
          session={selectedSession}
          workout={workoutMap.get(selectedSession.workoutId)}
          defsMap={defsMap}
          onClose={() => setSelectedSessionId(null)}
          onDelete={(id) => handleDeleteSession(id)}
        />
      )}
    </div>
  );
};
