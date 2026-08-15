import React, { useState, useMemo } from 'react';
import { format, isSameMonth, isSameDay, addMonths, subMonths, isAfter, startOfDay } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  TrendingUp,
  ArrowRight,
  X,
  CheckCircle2,
  AlertCircle,
  Calendar as CalendarIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import {
  getCycleDayForDate,
  WORKOUT_COLORS,
  calculateVolume
} from '../utils/fitnessHelpers';
import { SessionLog, SetLog, Exercise, Workout } from '../types/fitness';
import { haptics } from '../utils/haptics';
import { useCalendarGrid } from '../hooks/useCalendarGrid';
import { cn } from '../lib/utils';
import {
  Section,
  SectionHeader,
  StatCard,
  EmptyState,
  Badge,
  Card,
  Button,
  Stack,
  Grid
} from './ui';

interface CalendarProps {
  onNavigateToHistory?: (dateStr?: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ onNavigateToHistory }) => {
  const { logs, workouts, appState } = useFitness();
  const { workoutMap, coreWorkoutByCycleDayMap, resolveExerciseMeta } = useFitnessDerivedData();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 1. Shared Calendar Grid hook for month dates and log mapping
  const {
    monthStart,
    days,
    logsByDateMap,
    dayDetailMap,
    isCurrentMonth,
    isToday: isDateToday,
    isFuture: isDateFuture
  } = useCalendarGrid({
    monthDate: currentMonth,
    logs,
    workouts,
    weekStartsOn: 0
  });

  const exerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    (workouts || []).forEach(w => {
      (w.exercises || []).forEach(ex => {
        map.set(ex.id, ex);
        if (ex.exerciseDefinitionId) {
          map.set(ex.exerciseDefinitionId, ex);
        }
      });
    });
    return map;
  }, [workouts]);

  // Forward navigation cap: disable navigating beyond the current calendar month
  const isCurrentOrFutureMonth = useMemo(() => {
    const today = new Date();
    return isSameMonth(currentMonth, today) || isAfter(currentMonth, today);
  }, [currentMonth]);

  const isSameMonthAsToday = isSameMonth(currentMonth, new Date());

  // 3. Compute status for each day in calendar cell
  const getDayStatus = (date: Date, dateStr: string) => {
    const log = logsByDateMap.get(dateStr);
    const dayDetail = dayDetailMap[dateStr];
    const today = new Date();
    const isFuture = isAfter(startOfDay(date), startOfDay(today));

    // Cycle day anchored to last completed workout (matching Dashboard)
    const cycleDay = getCycleDayForDate(date, logs, workouts, appState?.cycleStart);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);

    if (log) {
      const wo = workoutMap.get(log.workoutId);
      const doneSets = dayDetail?.doneSets ?? 0;
      const totalSets = dayDetail?.totalSets ?? 0;

      if (!log.complete) {
        return {
          color: '#f59e0b',
          label: totalSets > 0 ? `${doneSets}/${totalSets} sets` : 'partial',
          isPartial: true,
          log
        };
      }
      return {
        color: WORKOUT_COLORS[wo?.type || 'push'] || '#10b981',
        label: wo?.type || 'session',
        isComplete: true,
        log
      };
    }

    if (isFuture) {
      if (expectedWo) {
        if (expectedWo.type === 'rest') {
          return { color: '#10b981', label: 'rest', isFuture: true, expectedWo };
        }
        return {
          color: WORKOUT_COLORS[expectedWo.type] || '#f59e0b',
          label: expectedWo.name,
          isFuture: true,
          expectedWo
        };
      }
      return null;
    }

    if (expectedWo) {
      if (expectedWo.type === 'rest') {
        return { color: '#10b981', label: 'rest', isRest: true, expectedWo };
      }
      if (!isSameDay(date, today)) {
        return { color: '#ef4444', label: 'missed', isMissed: true, expectedWo };
      }
    }

    return null;
  };

  // 4. Selected date analysis
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedLog = selectedDateStr ? (logsByDateMap.get(selectedDateStr) || null) : null;
  const selectedDetail = selectedDateStr ? dayDetailMap[selectedDateStr] : null;

  const selectedCycleDay = selectedDate
    ? getCycleDayForDate(selectedDate, logs, workouts, appState?.cycleStart)
    : null;
  const expectedWoForSelected = selectedCycleDay !== null
    ? coreWorkoutByCycleDayMap.get(selectedCycleDay)
    : null;

  const isSelectedDateFuture = selectedDate
    ? isAfter(startOfDay(selectedDate), startOfDay(new Date()))
    : false;
  const isSelectedDateToday = selectedDate ? isSameDay(selectedDate, new Date()) : false;
  const isSelectedDatePast = selectedDate && !isSelectedDateToday && !isSelectedDateFuture;

  // Compute completed / total sets for selected log
  const selectedDoneSets = useMemo(() => {
    if (!selectedLog || !selectedLog.sets) return 0;
    let done = 0;
    Object.values(selectedLog.sets).forEach(sList => {
      (sList as SetLog[]).forEach(s => {
        if (s && s.done) done++;
      });
    });
    return done;
  }, [selectedLog]);

  const selectedTotalSets = useMemo(() => {
    if (!selectedLog || !selectedLog.sets) return 0;
    let total = 0;
    Object.values(selectedLog.sets).forEach(sList => {
      total += (sList as SetLog[]).length;
    });
    return total;
  }, [selectedLog]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Calendar Grid Container */}
      <div className="flex-1 w-full">
        <Section
          eyebrow="Timeline"
          eyebrowColor="emerald"
          title={`${format(currentMonth, 'MMMM')} ${format(currentMonth, 'yyyy')}`}
          padding="relaxed"
          action={
            <div className="flex gap-2 items-center">
              {!isSameMonthAsToday && (
                <button
                  onClick={() => {
                    haptics.selection();
                    const today = new Date();
                    setCurrentMonth(today);
                    setSelectedDate(today);
                  }}
                  className="px-3.5 py-1.5 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-full text-xs font-mono uppercase tracking-wider transition-colors text-zinc-400 hover:text-white cursor-pointer"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => {
                  haptics.selection();
                  setCurrentMonth(subMonths(currentMonth, 1));
                }}
                title="Previous Month"
                className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer text-zinc-300 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => {
                  if (isCurrentOrFutureMonth) return;
                  haptics.selection();
                  setCurrentMonth(addMonths(currentMonth, 1));
                }}
                disabled={isCurrentOrFutureMonth}
                title={isCurrentOrFutureMonth ? 'Cannot browse future months' : 'Next Month'}
                className={cn(
                  "w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-full transition-colors",
                  isCurrentOrFutureMonth
                    ? "opacity-25 cursor-not-allowed text-zinc-600"
                    : "hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                )}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        >
          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 pt-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div
                key={d}
                className="text-center font-mono text-[10px] text-zinc-500 uppercase pb-2 tracking-wider font-bold"
              >
                {d}
              </div>
            ))}

            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const status = getDayStatus(day, dateStr);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonthDay = isSameMonth(day, monthStart);

              return (
                <motion.button
                  key={dateStr}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    haptics.selection();
                    setSelectedDate(day);
                  }}
                  className={cn(
                    "group relative aspect-square sm:aspect-auto sm:min-h-[54px] p-1.5 border transition-all duration-200 rounded-2xl flex flex-col items-center justify-center overflow-hidden cursor-pointer",
                    !isCurrentMonthDay && "opacity-20 pointer-events-none",
                    isSelected
                      ? "border-emerald-400/70 bg-emerald-500/15 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : isToday
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-[inset_0_0_12px_rgba(16,185,129,0.12)]"
                        : "border-zinc-800/40 bg-zinc-950/30 hover:bg-zinc-800/40 hover:border-zinc-700/60"
                  )}
                >
                  {/* Date Number Badge */}
                  <span
                    className={cn(
                      "text-xs font-mono leading-none w-7 h-7 flex items-center justify-center rounded-full transition-all font-bold",
                      isToday
                        ? "bg-emerald-500 text-black font-black shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                        : isSelected
                          ? "bg-white text-black font-black"
                          : status
                            ? "text-zinc-200"
                            : "text-zinc-500",
                      status && !isSelected && !isToday && (status.isFuture ? 'border-2 border-dashed' : 'border-2')
                    )}
                    style={status && !isSelected && !isToday ? { borderColor: status.color } : undefined}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Color-Coded Status Dot */}
                  {status && (
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1 transition-all",
                        status.isFuture ? "opacity-70" : "opacity-100"
                      )}
                      style={{ backgroundColor: status.color }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 flex flex-wrap gap-x-5 gap-y-2.5">
            {[
              { label: 'Push', color: WORKOUT_COLORS.push },
              { label: 'Pull', color: WORKOUT_COLORS.pull },
              { label: 'Hybrid', color: WORKOUT_COLORS.hybrid },
              { label: 'Rest', color: '#10b981' },
              { label: 'Missed', color: '#ef4444' },
              { label: 'Incomplete', color: '#f59e0b' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  {l.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Selected Day Detail Panel */}
      <AnimatePresence mode="wait">
        {selectedDate ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full lg:w-96 flex flex-col"
          >
            <Card variant="elevated" padding="none" className="overflow-hidden h-full flex flex-col">
              {/* Header */}
              <div className="p-5 border-b border-zinc-800/80 bg-zinc-900/40">
                <div className="flex justify-between items-start mb-2">
                  <SectionHeader
                    eyebrow="Day Overview"
                    eyebrowColor="emerald"
                    title={format(selectedDate, 'EEEE')}
                    description={format(selectedDate, 'MMMM do, yyyy')}
                  />
                  <button
                    onClick={() => {
                      haptics.selection();
                      setSelectedDate(null);
                    }}
                    title="Close Details"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Status Badges in Header */}
                <div className="pt-2 flex flex-wrap gap-2 items-center">
                  {selectedLog ? (
                    <>
                      <Badge
                        label={
                          selectedLog.complete
                            ? 'COMPLETED SESSION'
                            : `PARTIAL (${selectedDoneSets}/${selectedTotalSets} SETS)`
                        }
                        color={selectedLog.complete ? 'emerald' : 'zinc'}
                        variant="subtle"
                      />
                      {isSelectedDateToday && (
                        <Badge label="TODAY" color="emerald" variant="solid" />
                      )}
                    </>
                  ) : isSelectedDateFuture && expectedWoForSelected ? (
                    <Badge
                      label={
                        expectedWoForSelected.type === 'rest'
                          ? 'SCHEDULED REST'
                          : `UPCOMING: ${expectedWoForSelected.name}`
                      }
                      color={expectedWoForSelected.type === 'rest' ? 'emerald' : 'orange'}
                      variant="subtle"
                    />
                  ) : isSelectedDatePast && expectedWoForSelected ? (
                    <Badge
                      label={
                        expectedWoForSelected.type === 'rest'
                          ? 'SCHEDULED REST'
                          : `MISSED: ${expectedWoForSelected.name}`
                      }
                      color={expectedWoForSelected.type === 'rest' ? 'emerald' : 'red'}
                      variant="subtle"
                    />
                  ) : (
                    <Badge label="REST DAY" color="emerald" variant="subtle" />
                  )}
                </div>
              </div>

              {/* Scrollable Content Area: PRIMARY Exercise List, SECONDARY Stats below */}
              <div className="flex-1 p-5 overflow-y-auto space-y-5">
                {/* 1. PRIMARY SECTION: Exercise & Set Breakdown (Logged Session) */}
                {selectedLog && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                        Exercise Breakdown
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {Object.keys(selectedLog.sets || {}).length} exercises
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {Object.entries(selectedLog.sets || {}).map(([exId, sets]) => {
                        const exercise = exerciseMap.get(exId);
                        const meta = resolveExerciseMeta(exId);
                        const setsList = (sets as SetLog[]) || [];
                        const doneSets = setsList.filter(s => s && s.done);

                        if (setsList.length === 0) return null;

                        return (
                          <Card
                            key={exId}
                            variant="standard"
                            padding="compact"
                            className="space-y-2"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h5 className="font-display uppercase text-sm tracking-wide text-white leading-tight">
                                  {meta?.name || exercise?.name || 'Custom Exercise'}
                                </h5>
                                {exercise?.target && (
                                  <span className="font-mono text-[9px] text-zinc-500 uppercase">
                                    {exercise.target}
                                  </span>
                                )}
                              </div>
                              <Badge
                                label={`${doneSets.length} / ${setsList.length} sets`}
                                color={doneSets.length === setsList.length ? 'emerald' : 'zinc'}
                                variant="subtle"
                              />
                            </div>

                            {/* Set Pills */}
                            <div className="flex gap-1.5 flex-wrap pt-1">
                              {setsList.map((s, idx) => (
                                <div
                                  key={`set-${exId}-${idx}`}
                                  className={cn(
                                    "border rounded-lg px-2 py-1 flex items-center gap-1.5 font-mono text-[10px]",
                                    s.done
                                      ? "bg-zinc-900 border-zinc-700/80 text-white"
                                      : "bg-zinc-950/40 border-zinc-800/40 text-zinc-600 line-through"
                                  )}
                                >
                                  <span className="font-bold text-white/90">
                                    {s.weight ? `${s.weight}kg` : 'BW'}
                                  </span>
                                  <span className="text-[8px] text-zinc-500">×</span>
                                  <span className="text-zinc-300">{s.reps || '0'}</span>
                                </div>
                              ))}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. PRIMARY SECTION: Future Scheduled Workout Preview */}
                {!selectedLog && isSelectedDateFuture && expectedWoForSelected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-orange-400 font-bold flex items-center gap-1.5">
                        <CalendarIcon size={12} />
                        Scheduled Protocol
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {expectedWoForSelected.type === 'rest'
                          ? 'Rest Day'
                          : `${expectedWoForSelected.exercises?.length || 0} Exercises`}
                      </span>
                    </div>

                    {expectedWoForSelected.type === 'rest' ? (
                      <Card variant="standard" padding="standard" className="space-y-2.5 border-emerald-500/30 bg-emerald-500/5">
                        <h5 className="font-display uppercase text-sm text-emerald-300">
                          Rest & Adaptation Protocol
                        </h5>
                        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                          Muscle recovery window. Prioritize hydration, sleep quality, and reaching your daily protein targets.
                        </p>
                        {expectedWoForSelected.restNotes && expectedWoForSelected.restNotes.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-emerald-500/20">
                            {expectedWoForSelected.restNotes.map((note, nIdx) => (
                              <div key={`note-${nIdx}`} className="flex items-center gap-2 text-[11px] font-mono text-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <span>{note}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        <Card variant="standard" padding="compact" className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-mono text-zinc-400 uppercase">Workout Routine</p>
                            <h5 className="text-sm font-display uppercase text-white">{expectedWoForSelected.name}</h5>
                          </div>
                          <Badge
                            label={expectedWoForSelected.badge}
                            color={expectedWoForSelected.type === 'push' || expectedWoForSelected.type === 'pull' || expectedWoForSelected.type === 'hybrid' ? 'orange' : 'zinc'}
                            variant="solid"
                          />
                        </Card>

                        {/* List of Planned Exercises */}
                        <div className="space-y-1.5">
                          {(expectedWoForSelected.exercises || []).map((ex, eIdx) => {
                            const exId = ex.exerciseDefinitionId || (ex as { id?: string }).id || '';
                            const meta = resolveExerciseMeta(exId);
                            return (
                              <Card
                                key={`planned-${exId || eIdx}`}
                                variant="standard"
                                padding="compact"
                                className="flex items-center justify-between"
                              >
                                <div className="space-y-0.5">
                                  <p className="font-display text-xs uppercase text-zinc-200">{meta?.name || 'Exercise'}</p>
                                  <p className="font-mono text-[9px] text-zinc-500 uppercase">{meta?.target || ''}</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                    {ex.sets} × {ex.reps}
                                  </span>
                                </div>
                              </Card>
                            );
                          })}
                        </div>

                        {expectedWoForSelected.cardio && (
                          <Card variant="standard" padding="compact" className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                            <span>Cardio: {expectedWoForSelected.cardio.name}</span>
                            <span className="text-zinc-500">{expectedWoForSelected.cardio.duration}</span>
                          </Card>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. PRIMARY SECTION: Missed Past Day Preview */}
                {!selectedLog && isSelectedDatePast && expectedWoForSelected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-red-400 font-bold flex items-center gap-1.5">
                        <AlertCircle size={12} />
                        Missed Session Preview
                      </span>
                    </div>

                    {expectedWoForSelected.type === 'rest' ? (
                      <Card variant="standard" padding="standard" className="space-y-2 border-emerald-500/30 bg-emerald-500/5">
                        <h5 className="font-display uppercase text-sm text-emerald-300">
                          Scheduled Rest Day
                        </h5>
                        <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                          This date was a planned recovery day.
                        </p>
                      </Card>
                    ) : (
                      <div className="space-y-2.5">
                        <Card variant="standard" padding="standard" className="space-y-1.5 border-red-500/30 bg-red-500/5">
                          <div className="flex justify-between items-center">
                            <h5 className="font-display uppercase text-sm text-white">
                              {expectedWoForSelected.name}
                            </h5>
                            <Badge label="MISSED" color="red" variant="subtle" />
                          </div>
                          <p className="text-xs text-zinc-400 font-sans">
                            No performance log was submitted for this scheduled routine.
                          </p>
                        </Card>

                        {/* List of exercises that were scheduled */}
                        <div className="space-y-1.5">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 block font-bold">
                            Planned Exercises:
                          </span>
                          {(expectedWoForSelected.exercises || []).map((ex, eIdx) => {
                            const exId = ex.exerciseDefinitionId || (ex as { id?: string }).id || '';
                            const meta = resolveExerciseMeta(exId);
                            return (
                              <Card
                                key={`missed-${exId || eIdx}`}
                                variant="standard"
                                padding="compact"
                                className="flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-display uppercase text-zinc-300">{meta?.name || 'Exercise'}</span>
                                  {meta?.target && (
                                    <span className="font-mono text-[9px] text-zinc-500 ml-2 uppercase">({meta.target})</span>
                                  )}
                                </div>
                                <span className="font-mono text-[10px] text-zinc-400">
                                  {ex.sets} × {ex.reps}
                                </span>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Empty / Unscheduled Day fallback */}
                {!selectedLog && !expectedWoForSelected && (
                  <EmptyState
                    icon={CalendarIcon}
                    title="Off-Protocol Day"
                    description="No training session was scheduled or recorded."
                    size="compact"
                  />
                )}

                {/* 5. SECONDARY SECTION: Stats Cards (Volume, Time, Sets Completed) */}
                {selectedLog && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800/60">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
                      Session Summary
                    </span>
                    <Grid cols={3} gap="sm">
                      <StatCard
                        label="Volume"
                        value={calculateVolume(selectedLog).toLocaleString()}
                        unit="kg"
                        accent="emerald"
                        icon={TrendingUp}
                        size="standard"
                      />
                      <StatCard
                        label="Duration"
                        value={selectedLog.durationMinutes ?? 0}
                        unit="min"
                        accent="amber"
                        icon={Clock}
                        size="standard"
                      />
                      <StatCard
                        label="Sets Done"
                        value={`${selectedDoneSets}/${selectedTotalSets}`}
                        accent="zinc"
                        icon={CheckCircle2}
                        size="standard"
                      />
                    </Grid>

                    {/* View Full Log Button inside detail panel */}
                    {onNavigateToHistory && (
                      <Button
                        variant="outline"
                        size="md"
                        fullWidth
                        rightIcon={<ArrowRight size={14} className="text-emerald-400" />}
                        onClick={() => {
                          haptics.selection();
                          onNavigateToHistory(selectedLog.id || selectedDateStr || undefined);
                        }}
                        className="mt-2"
                      >
                        View Full Log In History
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:flex flex-col w-96"
          >
            <Card variant="standard" padding="relaxed" className="h-full flex items-center justify-center min-h-[380px]">
              <EmptyState
                icon={Dumbbell}
                title="Session Details"
                description="Select any date on the calendar to view workout breakdown and performance logs"
                size="hero"
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

