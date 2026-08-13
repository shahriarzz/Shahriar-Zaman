import React, { useState, useEffect, useMemo } from 'react';
import { useFitness } from '../context/FitnessContext';
import { useConfirm } from '../context/ConfirmContext';
import { createExerciseDefinitionMap, generateId } from '../domain';
import { SetLog, SessionLog, Workout } from '../types/fitness';
import { SessionHeader } from './session/SessionHeader';
import { ExerciseSessionCard } from './session/ExerciseSessionCard';
import { SessionActions } from './session/SessionActions';
import { Card, SectionHeader, Button } from './ui';

interface SessionViewProps {
  workoutId?: string | null;
  onFinish?: () => void;
  onCancel?: () => void;
  onExit?: () => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
  workoutId,
  onFinish,
  onCancel,
  onExit
}) => {
  const { workouts, exerciseDefinitions, addLog } = useFitness();
  const { confirm } = useConfirm();

  const handleExit = () => {
    onFinish?.();
    onCancel?.();
    onExit?.();
  };

  const workout = useMemo(() => {
    return (workouts || []).find(w => w.id === workoutId);
  }, [workouts, workoutId]);

  const defsMap = useMemo(() => {
    return createExerciseDefinitionMap(exerciseDefinitions || []);
  }, [exerciseDefinitions]);

  const [startTime] = useState<number>(Date.now());
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [sessionSets, setSessionSets] = useState<Record<string, SetLog[]>>({});

  // Initialize default sets when starting session
  useEffect(() => {
    if (workout && workout.exercises) {
      const initial: Record<string, SetLog[]> = {};
      workout.exercises.forEach(ex => {
        const defId = ex.exerciseDefinitionId;
        const count = typeof ex.sets === 'number' ? ex.sets : 3;
        const setArray: SetLog[] = [];
        for (let i = 0; i < count; i++) {
          setArray.push({
            id: generateId(),
            weight: '0',
            reps: String(ex.reps || '10'),
            done: false
          });
        }
        initial[defId] = setArray;
      });
      setSessionSets(initial);
    }
  }, [workout]);

  // Live timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 60000);
      setElapsedMinutes(diff);
    }, 10000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!workout) {
    return (
      <Card variant="default" className="p-8 text-center space-y-4">
        <SectionHeader title="Workout Not Found" subtitle="Selected workout programming could not be located." />
        <Button variant="outline" onClick={onCancel}>Return</Button>
      </Card>
    );
  }

  const handleUpdateSet = (exDefId: string, setIndex: number, field: keyof SetLog, val: string | boolean) => {
    setSessionSets(prev => {
      const current = prev[exDefId] || [];
      const updated = current.map((s, idx) => idx === setIndex ? { ...s, [field]: val } : s);
      return { ...prev, [exDefId]: updated };
    });
  };

  const handleAddSet = (exDefId: string) => {
    setSessionSets(prev => {
      const current = prev[exDefId] || [];
      const lastSet = current[current.length - 1];
      const newSet: SetLog = {
        id: generateId(),
        weight: lastSet ? lastSet.weight : '0',
        reps: lastSet ? lastSet.reps : '10',
        done: false
      };
      return { ...prev, [exDefId]: [...current, newSet] };
    });
  };

  const handleDeleteSet = (exDefId: string, setIndex: number) => {
    setSessionSets(prev => {
      const current = prev[exDefId] || [];
      const updated = current.filter((_, idx) => idx !== setIndex);
      return { ...prev, [exDefId]: updated };
    });
  };

  const handleCompleteSession = async () => {
    const totalDuration = Math.max(1, elapsedMinutes);
    const newLog: SessionLog = {
      id: `log-${Date.now()}`,
      workoutId: workout.id,
      date: new Date().toISOString().split('T')[0],
      cycleDay: workout.cycleDay || 1,
      durationMinutes: totalDuration,
      complete: true,
      sets: sessionSets
    };

    await addLog(newLog);
    onFinish?.();
    onExit?.();
  };

  const handleCancelSession = async () => {
    const isConfirmed = await confirm({
      title: 'Discard Active Workout',
      message: 'Are you sure you want to exit? Unsaved progress in this active session will be cleared.',
      confirmText: 'Discard',
      danger: true
    });

    if (isConfirmed) {
      onCancel?.();
      onExit?.();
    }
  };

  const completedSetsCount = (Object.values(sessionSets) as SetLog[][]).reduce((acc: number, setArr: SetLog[]) => {
    return acc + (Array.isArray(setArr) ? setArr.filter(s => s.done).length : 0);
  }, 0);

  const totalSetsCount = (Object.values(sessionSets) as SetLog[][]).reduce((acc: number, setArr: SetLog[]) => {
    return acc + (Array.isArray(setArr) ? setArr.length : 0);
  }, 0);

  return (
    <div className="space-y-6 pb-20">
      <SessionHeader
        workoutName={workout.name}
        cycleDay={workout.cycleDay || undefined}
        durationMinutes={elapsedMinutes}
        onCancel={handleCancelSession}
      />

      <div className="space-y-4">
        {workout.exercises.map(ex => {
          const defId = ex.exerciseDefinitionId;
          const def = defsMap.get(defId);
          const sets = sessionSets[defId] || [];

          return (
            <ExerciseSessionCard
              key={defId}
              exercise={ex}
              def={def}
              sets={sets}
              onUpdateSet={(idx, field, val) => handleUpdateSet(defId, idx, field, val)}
              onAddSet={() => handleAddSet(defId)}
              onDeleteSet={(idx) => handleDeleteSet(defId, idx)}
            />
          );
        })}
      </div>

      <SessionActions
        completedSets={completedSetsCount}
        totalSets={totalSetsCount}
        onComplete={handleCompleteSession}
        onCancel={handleCancelSession}
      />
    </div>
  );
};
