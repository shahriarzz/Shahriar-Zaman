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
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import {
  WORKOUT_COLORS,
  formatCompactWeight
} from '../utils/fitnessHelpers';
import { resolveCalendarDayStatus } from '../utils/calendarHelpers';
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
  Grid,
  TYPOGRAPHY,
  BORDER,
  SURFACE,
  RADIUS,
  INTERACTIVE,
  GAP,
  SEMANTIC_COLORS,
  getAccentColor,
  DURATION,
  MOTION_CONFIG,
  TRANSITION,
  SHADOW,
  CONTROL_HEIGHT,
  FOCUS
} from './ui';

interface CalendarProps {
  onNavigateToHistory?: (dateStr?: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ onNavigateToHistory }) => {
  const { workouts } = useFitness();
  const { index, workoutMap, coreWorkoutByCycleDayMap, getCycleDayForDate, resolveExerciseMeta } = useFitnessDerivedData();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // 1. Shared Calendar Grid hook for month dates and log mapping consuming canonical FitnessIndex
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
    index,
    workoutMap,
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
    const cycleDay = getCycleDayForDate(date);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);
    const wo = log ? workoutMap.get(log.workoutId) : undefined;

    return resolveCalendarDayStatus({
      date,
      dateStr,
      today: new Date(),
      log,
      dayDetail,
      workout: wo,
      expectedWorkout: expectedWo,
    });
  };

  // 4. Selected date analysis
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedLog = selectedDateStr ? (logsByDateMap.get(selectedDateStr) || null) : null;
  const selectedDetail = selectedDateStr ? dayDetailMap[selectedDateStr] : null;

  const selectedCycleDay = selectedDate
    ? getCycleDayForDate(selectedDate)
    : null;
  const expectedWoForSelected = selectedCycleDay !== null
    ? coreWorkoutByCycleDayMap.get(selectedCycleDay)
    : null;

  const isSelectedDateFuture = selectedDate
    ? isAfter(startOfDay(selectedDate), startOfDay(new Date()))
    : false;
  const isSelectedDateToday = selectedDate ? isSameDay(selectedDate, new Date()) : false;
  const isSelectedDatePast = selectedDate && !isSelectedDateToday && !isSelectedDateFuture;

  // Canonical completed / planned sets and volume for selected date from index
  const selectedDoneSets = selectedDateStr ? (index.completedSetsByDate[selectedDateStr] ?? 0) : 0;
  const selectedPlannedSets = selectedDateStr ? (index.plannedSetsByDate[selectedDateStr] ?? 0) : 0;
  const selectedDayVolume = selectedDateStr ? (index.volumeByDate[selectedDateStr] ?? 0) : 0;

  return (
    <Stack spacing="xl" className="pt-4 pb-12">
      <SectionHeader
        eyebrow="Schedule & Consistency"
        eyebrowColor="emerald"
        title="Calendar"
        size="page"
      />

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Calendar Grid Container */}
        <div className="flex-1 w-full">
        <Section
          eyebrow="Timeline"
          eyebrowColor="emerald"
          title={`${format(currentMonth, 'MMMM')} ${format(currentMonth, 'yyyy')}`}
          padding="section"
          action={
            <div className="flex gap-2 items-center">
              {!isSameMonthAsToday && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    haptics.selection();
                    const today = new Date();
                    setCurrentMonth(today);
                    setSelectedDate(today);
                  }}
                >
                  Today
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                icon={<ChevronLeft size={16} />}
                onClick={() => {
                  haptics.selection();
                  setCurrentMonth(subMonths(currentMonth, 1));
                }}
                aria-label="Previous Month"
                title="Previous Month"
              />
              <Button
                variant="outline"
                size="icon"
                icon={<ChevronRight size={16} />}
                onClick={() => {
                  if (isCurrentOrFutureMonth) return;
                  haptics.selection();
                  setCurrentMonth(addMonths(currentMonth, 1));
                }}
                disabled={isCurrentOrFutureMonth}
                aria-label={isCurrentOrFutureMonth ? 'Cannot browse future months' : 'Next Month'}
                title={isCurrentOrFutureMonth ? 'Cannot browse future months' : 'Next Month'}
              />
            </div>
          }
        >
          {/* Days Grid Responsive Scroll Container */}
          <div className="overflow-x-auto -mx-1 px-1 custom-scrollbar">
            <div className="grid grid-cols-7 gap-1.5 pt-2 min-w-[344px] [&>*]:min-w-0">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div
                  key={d}
                  className={cn("text-center pb-2", TYPOGRAPHY.label, "text-zinc-500")}
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
                  <button
                    key={dateStr}
                    type="button"
                    data-testid={`calendar-day-${dateStr}`}
                    disabled={!isCurrentMonthDay}
                    aria-label={`${format(day, 'MMMM d, yyyy')}${status?.label ? `, ${status.label}` : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={Boolean(isSelected)}
                    onClick={() => {
                      haptics.selection();
                      setSelectedDate(day);
                    }}
                    className={cn(
                      "group relative aspect-square sm:aspect-auto sm:min-h-[54px] p-1.5 border flex flex-col items-center justify-center overflow-hidden cursor-pointer",
                      CONTROL_HEIGHT.touchTarget,
                      FOCUS.visible,
                      TRANSITION.interactive,
                      RADIUS.card,
                      !isCurrentMonthDay && "opacity-20 pointer-events-none disabled:cursor-not-allowed",
                      isSelected
                        ? cn("border-emerald-400/70 bg-emerald-500/15", SHADOW.emeraldSubtle)
                        : isToday
                          ? cn("border-emerald-500/50 bg-emerald-500/10", SHADOW.emeraldInset)
                          : cn(BORDER.subtle, SURFACE.recessed, INTERACTIVE.hover)
                    )}
                  >
                    {/* Date Number Badge */}
                    <span
                      className={cn(
                        "text-xs font-mono leading-none w-7 h-7 flex items-center justify-center rounded-full font-bold",
                        TRANSITION.colors,
                        isToday
                          ? cn("bg-emerald-500 text-black font-black", SHADOW.emeraldDate)
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
                          "w-1.5 h-1.5 rounded-full mt-1",
                          TRANSITION.opacity,
                          status.isFuture ? "opacity-70" : "opacity-100"
                        )}
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className={cn("mt-6 pt-5 border-t flex flex-wrap gap-x-5 gap-y-2.5", BORDER.standard)}>
            {[
              { label: 'Push', color: WORKOUT_COLORS.push },
              { label: 'Pull', color: WORKOUT_COLORS.pull },
              { label: 'Upper', color: WORKOUT_COLORS.upper },
              { label: 'Lower', color: WORKOUT_COLORS.lower },
              { label: 'Hybrid', color: WORKOUT_COLORS.hybrid },
              { label: 'Custom', color: WORKOUT_COLORS.custom },
              { label: 'Rest', color: WORKOUT_COLORS.rest },
              { label: 'Missed', color: SEMANTIC_COLORS.red },
              { label: 'Incomplete', color: SEMANTIC_COLORS.amber },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className={TYPOGRAPHY.label}>
                  {l.label}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Selected Day Detail Panel */}
      <AnimatePresence>
        {selectedDate ? (
          <motion.div
            key={selectedDateStr || 'detail'}
            initial={shouldReduceMotion ? false : MOTION_CONFIG.calendarPanel.initial}
            animate={shouldReduceMotion ? { opacity: 1 } : MOTION_CONFIG.calendarPanel.animate}
            exit={shouldReduceMotion ? { opacity: 0 } : MOTION_CONFIG.calendarPanel.exit}
            transition={shouldReduceMotion ? { duration: 0 } : MOTION_CONFIG.calendarPanel.transition}
            className="w-full lg:w-96 flex flex-col"
          >
            <Card variant="elevated" padding="none" className="overflow-hidden h-full flex flex-col">
              {/* Header */}
              <div className={cn("p-5 border-b", BORDER.standard, SURFACE.subtle)}>
                <div className="flex justify-between items-start mb-2">
                  <SectionHeader
                    eyebrow="Day Overview"
                    eyebrowColor="emerald"
                    title={format(selectedDate, 'EEEE')}
                    description={format(selectedDate, 'MMMM do, yyyy')}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={<X size={14} />}
                    onClick={() => {
                      haptics.selection();
                      setSelectedDate(null);
                    }}
                    aria-label="Close Details"
                    title="Close Details"
                  />
                </div>

                {/* Status Badges in Header */}
                <div className="pt-2 flex flex-wrap gap-2 items-center">
                  {selectedLog ? (
                    <>
                      <Badge
                        label={
                          selectedLog.complete
                            ? 'COMPLETED SESSION'
                            : `PARTIAL (${selectedDoneSets}/${selectedPlannedSets || selectedDoneSets} SETS)`
                        }
                        color={selectedLog.complete ? 'emerald' : 'zinc'}
                        variant="subtle"
                      />
                      {isSelectedDateToday && (
                        <Badge label="TODAY" color="emerald" variant="solid" />
                      )}
                    </>
                  ) : (isSelectedDateFuture || isSelectedDateToday) && expectedWoForSelected ? (
                    <Badge
                      label={
                        expectedWoForSelected.type === 'rest'
                          ? 'SCHEDULED REST'
                          : isSelectedDateToday
                            ? `TODAY: ${expectedWoForSelected.name}`
                            : `UPCOMING: ${expectedWoForSelected.name}`
                      }
                      colorOverride={WORKOUT_COLORS[expectedWoForSelected.type] || SEMANTIC_COLORS.zinc}
                      variant="subtle"
                    />
                  ) : isSelectedDatePast && expectedWoForSelected ? (
                    <Badge
                      label={
                        expectedWoForSelected.type === 'rest'
                          ? 'SCHEDULED REST'
                          : `MISSED: ${expectedWoForSelected.name}`
                      }
                      colorOverride={expectedWoForSelected.type === 'rest' ? WORKOUT_COLORS.rest : undefined}
                      color={expectedWoForSelected.type === 'rest' ? undefined : 'red'}
                      variant="subtle"
                    />
                  ) : (
                    <Badge label="REST DAY" colorOverride={WORKOUT_COLORS.rest} variant="subtle" />
                  )}
                </div>
              </div>

              {/* Scrollable Content Area: PRIMARY Exercise List, SECONDARY Stats below */}
              <div className="flex-1 p-5 overflow-y-auto space-y-5">
                {/* 1. PRIMARY SECTION: Exercise & Set Breakdown (Logged Session) */}
                {selectedLog && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={TYPOGRAPHY.label}>
                        Exercise Breakdown
                      </span>
                      <span className={TYPOGRAPHY.metadata}>
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
                                <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-white leading-tight break-words")}>
                                  {meta?.name || exercise?.name || 'Custom Exercise'}
                                </h5>
                                {exercise?.target && (
                                  <span className={TYPOGRAPHY.caption}>
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
                                    "border px-2 py-1 flex items-center gap-1.5",
                                    RADIUS.badge,
                                    TYPOGRAPHY.metadata,
                                    s.done
                                      ? cn(SURFACE.default, BORDER.strong, "text-white")
                                      : cn(SURFACE.recessed, BORDER.subtle, "text-zinc-600 line-through")
                                  )}
                                >
                                  <span className="font-bold text-white/90">
                                    {s.weight ? `${s.weight}kg` : 'BW'}
                                  </span>
                                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-500")}>×</span>
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

                {/* 2. PRIMARY SECTION: Scheduled Workout Preview (Today or Future) */}
                {!selectedLog && (isSelectedDateFuture || isSelectedDateToday) && expectedWoForSelected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={cn(TYPOGRAPHY.label, "text-orange-400 flex items-center gap-1.5")}>
                        <CalendarIcon size={12} />
                        {isSelectedDateToday ? "Today's Scheduled Protocol" : "Scheduled Protocol"}
                      </span>
                      <span className={TYPOGRAPHY.metadata}>
                        {expectedWoForSelected.type === 'rest'
                          ? 'Rest Day'
                          : `${expectedWoForSelected.exercises?.length || 0} Exercises`}
                      </span>
                    </div>

                    {expectedWoForSelected.type === 'rest' ? (
                      <Card variant="standard" padding="standard" className="space-y-2.5 border-emerald-500/30 bg-emerald-500/5">
                        <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-emerald-300")}>
                          Rest & Adaptation Protocol
                        </h5>
                        <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-300 leading-relaxed")}>
                          Muscle recovery window. Prioritize hydration, sleep quality, and reaching your daily protein targets.
                        </p>
                        {expectedWoForSelected.restNotes && expectedWoForSelected.restNotes.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-emerald-500/20">
                            {expectedWoForSelected.restNotes.map((note, nIdx) => (
                              <div key={`note-${nIdx}`} className={cn(TYPOGRAPHY.bodySecondary, "flex items-center gap-2 font-mono text-emerald-200")}>
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
                            <p className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Workout Routine</p>
                            <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-white")}>{expectedWoForSelected.name}</h5>
                          </div>
                          <Badge
                            label={expectedWoForSelected.badge}
                            colorOverride={WORKOUT_COLORS[expectedWoForSelected.type] || SEMANTIC_COLORS.zinc}
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
                                  <p className={cn(TYPOGRAPHY.titleSubsection, "text-xs text-zinc-200")}>{meta?.name || 'Exercise'}</p>
                                  <p className={TYPOGRAPHY.caption}>{meta?.target || ''}</p>
                                </div>
                                <div className="text-right">
                                  <span className={cn("font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5", RADIUS.badge)}>
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
                      <span className={cn(TYPOGRAPHY.label, "text-red-400 flex items-center gap-1.5")}>
                        <AlertCircle size={12} />
                        Missed Session Preview
                      </span>
                    </div>

                    {expectedWoForSelected.type === 'rest' ? (
                      <Card variant="standard" padding="standard" className="space-y-2 border-emerald-500/30 bg-emerald-500/5">
                        <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-emerald-300")}>
                          Scheduled Rest Day
                        </h5>
                        <p className={cn(TYPOGRAPHY.body, "text-xs text-zinc-300 leading-relaxed")}>
                          This date was a planned recovery day.
                        </p>
                      </Card>
                    ) : (
                      <div className="space-y-2.5">
                        <Card variant="standard" padding="standard" className="space-y-1.5 border-red-500/30 bg-red-500/5">
                          <div className="flex justify-between items-center">
                            <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-white")}>
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
                          <span className={cn(TYPOGRAPHY.caption, "text-zinc-500 block font-bold")}>
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
                                    <span className={cn(TYPOGRAPHY.caption, "ml-2")}>({meta.target})</span>
                                  )}
                                </div>
                                <span className={TYPOGRAPHY.metadata}>
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
                  <div className={cn("space-y-3 pt-3 border-t", BORDER.standard)}>
                    <span className={cn(TYPOGRAPHY.label, "block")}>
                      Session Summary
                    </span>
                    <Grid cols={3} gap="sm">
                      <StatCard
                        label="Total Volume"
                        value={selectedDayVolume}
                        formatValue={formatCompactWeight}
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
                        value={`${selectedDoneSets}/${selectedPlannedSets || selectedDoneSets}`}
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
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: DURATION.standard / 1000 }}
            className="hidden lg:flex flex-col w-96"
          >
            <Card variant="standard" padding="section" className="h-full flex items-center justify-center min-h-[380px]">
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
    </Stack>
  );
};

