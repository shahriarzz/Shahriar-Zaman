import React, { useState, useEffect } from 'react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessAnalytics } from '../hooks/useFitnessAnalytics';
import { calculateTotalVolume, getCompletedSessionsCount, getTrainingStreak, getPriorityExercises } from '../domain';
import { AnalyticsHeader } from './analytics/AnalyticsHeader';
import { AnalyticsFilters, TimeRange } from './analytics/AnalyticsFilters';
import { E1rmChart } from './analytics/E1rmChart';
import { LoadDistribution } from './analytics/LoadDistribution';
import { ExerciseFrequency } from './analytics/ExerciseFrequency';
import { PersonalBests } from './analytics/PersonalBests';
import { PerformanceInsights } from './analytics/PerformanceInsights';
import { AnalyticsEmptyState } from './analytics/AnalyticsEmptyState';

export const AnalyticsView: React.FC = () => {
  const { logs, workouts, exerciseDefinitions } = useFitness();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selected1RMExerciseId, setSelected1RMExerciseId] = useState<string | null>(null);
  const [showAllPB, setShowAllPB] = useState<boolean>(false);

  const {
    defsMap,
    muscleDistribution,
    frequentExercises,
    personalBests,
    performanceInsights,
    getExerciseTimeline
  } = useFitnessAnalytics(exerciseDefinitions || [], workouts || [], logs || {});

  const totalVolume = calculateTotalVolume(logs || {});
  const completedSessions = getCompletedSessionsCount(logs || {});
  const streak = getTrainingStreak(logs || {});

  const priorityExercises = getPriorityExercises(exerciseDefinitions || [], workouts || [], defsMap);

  useEffect(() => {
    if (!selected1RMExerciseId && priorityExercises.length > 0) {
      setSelected1RMExerciseId(priorityExercises[0].id);
    }
  }, [priorityExercises, selected1RMExerciseId]);

  const timelineData = selected1RMExerciseId ? getExerciseTimeline(selected1RMExerciseId) : [];

  if (completedSessions === 0) {
    return <AnalyticsEmptyState />;
  }

  const topPB = personalBests.length > 0
    ? { name: personalBests[0].name, val: personalBests[0].maxE1RM }
    : null;

  return (
    <div className="space-y-6 pb-20">
      <AnalyticsHeader
        totalVolume={totalVolume}
        completedSessions={completedSessions}
        streak={streak}
        top1RM={topPB}
      />

      <AnalyticsFilters
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      <E1rmChart
        priorityExercises={priorityExercises}
        selectedExerciseId={selected1RMExerciseId}
        onSelectExercise={setSelected1RMExerciseId}
        data={timelineData}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LoadDistribution distribution={muscleDistribution} />
        <ExerciseFrequency frequentExercises={frequentExercises} />
      </div>

      <PersonalBests
        personalBests={personalBests}
        showAll={showAllPB}
        onToggleShowAll={() => setShowAllPB(!showAllPB)}
      />

      <PerformanceInsights insights={performanceInsights} />
    </div>
  );
};
