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
import { SetLog, Exercise } from '../types/fitness';
import { haptics } from '../utils/haptics';
import { useCalendarGrid } from '../hooks/useCalendarGrid';
import { cn } from '../lib/utils';
import {
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
  SEMANTIC_COLORS,
  DURATION,
  MOTION_CONFIG,
  TRANSITION,
  CONTROL_HEIGHT,
  FOCUS
} from './ui';

interface CalendarProps {
  onNavigateToHistory?: (dateStr?: string) => void;
  onStartWorkout?: (workoutId: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ onNavigateToHistory, onStartWorkout }) => {
  const { workouts } = useFitness();
  const { index, workoutMap, coreWorkoutByCycleDayMap, getCycleDayForDate, resolveExerciseMeta, currentDate } = useFitnessDerivedData();
  const todayDate = currentDate || new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => todayDate);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // 1. Shared Calendar Grid hook for month dates and log mapping consuming canonical FitnessIndex
  const {
    monthStart,
    days,
    logsByDateMap,
    dayDetailMap
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
    return isSameMonth(currentMonth, todayDate) || isAfter(currentMonth, todayDate);
  }, [currentMonth, todayDate]);

  const isSameMonthAsToday = isSameMonth(currentMonth, todayDate);

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
      today: todayDate,
      log,
      dayDetail,
      workout: wo,
      expectedWorkout: expectedWo,
    });
  };

  // 4. Selected date analysis
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedLog = selectedDateStr ? (logsByDateMap.get(selectedDateStr) || null) : null;

  const selectedCycleDay = selectedDate
    ? getCycleDayForDate(selectedDate)
    : null;
  const expectedWoForSelected = selectedCycleDay !== null
    ? coreWorkoutByCycleDayMap.get(selectedCycleDay)
    : null;

  const isSelectedDateFuture = selectedDate
    ? isAfter(startOfDay(selectedDate), startOfDay(todayDate))
    : false;
  const isSelectedDateToday = selectedDate ? isSameDay(selectedDate, todayDate) : false;
  const isSelectedDatePast = selectedDate && !isSelectedDateToday && !isSelectedDateFuture;

  // Canonical completed / planned sets and volume for selected date from index
  const selectedDoneSets = selectedDateStr ? (index.completedSetsByDate[selectedDateStr] ?? 0) : 0;
  const selectedPlannedSets = selectedDateStr ? (index.plannedSetsByDate[selectedDateStr] ?? 0) : 0;
  const selectedDayVolume = selectedDateStr ? (index.volumeByDate[selectedDateStr] ?? 0) : 0;

  return (
    <Stack spacing="md" className="pt-0 pb-6">
      <SectionHeader
        eyebrow="Schedule & Consistency"
        eyebrowColor="zinc"
        title="Calendar"
        size="section"
      />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Calendar Grid Container */}
        <div className="flex-1 w-full min-w-0">
        <Card
          variant="standard"
          padding="none"
          className="p-3 sm:p-6 w-full min-w-0"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className={cn(TYPOGRAPHY.cardTitle, "min-w-0 truncate")}>
              {format(currentMonth, 'MMMM')} {format(currentMonth, 'yyyy')}
            </h3>
            <div className="flex gap-1.5 sm:gap-2 items-center shrink-0">
              {!isSameMonthAsToday && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(CONTROL_HEIGHT.touchTarget, "sm:min-h-[32px] sm:min-w-0")}
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
                className="relative after:content-[''] after:absolute after:-inset-1"
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
                className="relative after:content-[''] after:absolute after:-inset-1"
              />
            </div>
          </div>
          {/* Days Grid Responsive Container */}
          <div className="w-full">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-2 w-full [&>*]:min-w-0">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div
                  key={d}
                  className={cn("text-center pb-2", TYPOGRAPHY.label)}
                >
                  {d}
                </div>
              ))}

              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const status = getDayStatus(day, dateStr);
                const isToday = isSameDay(day, todayDate);
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
                      "group relative aspect-square sm:aspect-auto sm:min-h-[54px] p-1 sm:p-1.5 border flex flex-col items-center justify-center overflow-hidden cursor-pointer",
                      CONTROL_HEIGHT.touchTarget,
                      FOCUS.visible,
                      TRANSITION.interactive,
                      RADIUS.card,
                      !isCurrentMonthDay && "opacity-20 pointer-events-none disabled:cursor-not-allowed",
                      isSelected
                        ? "border-orange-500/70 bg-zinc-800/90 ring-1 ring-orange-500/40"
                        : isToday
                          ? "border-zinc-500 bg-zinc-800/50"
                          : cn(BORDER.subtle, SURFACE.recessed, INTERACTIVE.hover)
                    )}
                  >
                    {/* Date Number Badge */}
                    <span
                      className={cn(
                        "text-xs font-mono leading-none w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full font-bold",
                        TYPOGRAPHY.listValue,
                        TRANSITION.colors,
                        status ? ((status.isScheduled || status.isFuture) ? 'border-2 border-dashed' : 'border-2') : 'border-2 border-transparent',
                        isSelected
                          ? (isToday ? "bg-zinc-800 text-orange-400 font-black" : "bg-zinc-800 text-white font-bold")
                          : isToday
                            ? "bg-zinc-800 text-orange-400 font-black"
                            : status
                              ? "text-zinc-200"
                              : "text-zinc-400"
                      )}
                      style={status ? { borderColor: status.color } : undefined}
                    >
                      {format(day, 'd')}
                    </span>

                    {/* Color-Coded Status Dot + Non-Color Status Glyph */}
                    {status && (
                      <div className="flex items-center justify-center gap-0.5 mt-1 leading-none">
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            TRANSITION.opacity,
                            (status.isScheduled || status.isFuture) ? "opacity-70" : "opacity-100"
                          )}
                          style={{ backgroundColor: status.color }}
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            TYPOGRAPHY.micro,
                            "tracking-normal leading-none",
                            status.isMissed
                              ? "text-red-400"
                              : status.isPartial
                              ? "text-amber-400"
                              : status.isRest
                              ? "text-emerald-400"
                              : (status.isScheduled || status.isFuture)
                              ? "text-zinc-400"
                              : "text-zinc-200"
                          )}
                        >
                          {status.isMissed
                            ? '!'
                            : status.isPartial
                            ? '◐'
                            : status.isRest
                            ? '—'
                            : (status.isScheduled || status.isFuture)
                            ? '·'
                            : '✓'}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend — Status Shapes + Routine Colors */}
          <div className={cn("mt-6 pt-5 border-t space-y-3", BORDER.standard)}>
            <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Status:</span>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-1")}>
                <span aria-hidden="true" className="font-mono text-zinc-200">✓</span> Completed
              </span>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-1")}>
                <span aria-hidden="true" className="font-mono text-amber-400">◐</span> Incomplete
              </span>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-1")}>
                <span aria-hidden="true" className="font-mono text-red-400">!</span> Missed
              </span>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-1")}>
                <span aria-hidden="true" className="font-mono text-zinc-400">·</span> Scheduled
              </span>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-1")}>
                <span aria-hidden="true" className="font-mono text-emerald-400">—</span> Rest
              </span>
            </div>

            <div className="flex flex-wrap gap-x-3.5 sm:gap-x-5 gap-y-2 items-center">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Routines:</span>
              {[
                { label: 'Push', color: WORKOUT_COLORS.push },
                { label: 'Pull', color: WORKOUT_COLORS.pull },
                { label: 'Upper', color: WORKOUT_COLORS.upper },
                { label: 'Lower', color: WORKOUT_COLORS.lower },
                { label: 'Hybrid', color: WORKOUT_COLORS.hybrid },
                { label: 'Custom', color: WORKOUT_COLORS.custom },
                { label: 'Rest', color: WORKOUT_COLORS.rest },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
                    {l.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
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
            <Card variant="standard" surface="subtle" padding="none" className="overflow-hidden h-full flex flex-col">
              {/* Header */}
              <div className={cn("p-5 border-b", BORDER.standard, SURFACE.subtle)}>
                <div className="flex justify-between items-start mb-2">
                  <SectionHeader
                    eyebrow="Day Overview"
                    eyebrowColor="zinc"
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
                        size="md"
                      />
                      {isSelectedDateToday && (
                        <Badge label="TODAY" color="orange" variant="subtle" size="md" />
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
                    <Badge label="OFF-PROTOCOL" color="zinc" variant="subtle" />
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

                    <div className={cn("border divide-y divide-zinc-800/60 overflow-hidden", RADIUS.card, BORDER.subtle, SURFACE.recessed)}>
                      {Object.entries(selectedLog.sets || {}).map(([exId, sets]) => {
                        const exercise = exerciseMap.get(exId);
                        const meta = resolveExerciseMeta(exId);
                        const setsList = (sets as SetLog[]) || [];
                        const doneSets = setsList.filter(s => s && s.done);

                        if (setsList.length === 0) return null;

                        return (
                          <div
                            key={exId}
                            className="p-3 space-y-2"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
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
                            <div className="flex gap-1.5 flex-wrap pt-0.5">
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
                          </div>
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

                        {/* List of Planned Exercises as unified divided rows */}
                        <div className={cn("border divide-y divide-zinc-800/60 overflow-hidden", RADIUS.card, BORDER.subtle, SURFACE.recessed)}>
                          {(expectedWoForSelected.exercises || []).map((ex, eIdx) => {
                            const exId = ex.exerciseDefinitionId || (ex as { id?: string }).id || '';
                            const meta = resolveExerciseMeta(exId);
                            return (
                              <div
                                key={`planned-${exId || eIdx}`}
                                className="p-3 flex items-center justify-between gap-2"
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <p className="text-xs font-semibold text-zinc-200 break-words">{meta?.name || 'Exercise'}</p>
                                  {meta?.target && (
                                    <p className={cn(TYPOGRAPHY.caption, "text-zinc-400")}>{meta.target}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={cn("font-mono text-xs font-bold text-zinc-200 bg-zinc-900 border border-zinc-800 px-2 py-0.5 tabular-nums", RADIUS.badge)}>
                                    {ex.sets} × {ex.reps}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {expectedWoForSelected.cardio && (
                          <div className={cn("p-2.5 border text-xs font-mono text-zinc-300 flex items-center justify-between", RADIUS.button, BORDER.subtle, SURFACE.recessed)}>
                            <span>Cardio: {expectedWoForSelected.cardio.name}</span>
                            <span className="text-zinc-400">{expectedWoForSelected.cardio.duration}</span>
                          </div>
                        )}

                        {isSelectedDateToday && onStartWorkout && (
                          <Button
                            variant="primary"
                            size="md"
                            fullWidth
                            onClick={() => {
                              onStartWorkout(expectedWoForSelected.id);
                            }}
                            className="mt-2"
                          >
                            Start Scheduled Session
                          </Button>
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
                          <span className={cn(TYPOGRAPHY.caption, "text-zinc-400 block font-bold")}>
                            Planned Exercises:
                          </span>
                          <div className={cn("border divide-y divide-zinc-800/60 overflow-hidden", RADIUS.card, BORDER.subtle, SURFACE.recessed)}>
                            {(expectedWoForSelected.exercises || []).map((ex, eIdx) => {
                              const exId = ex.exerciseDefinitionId || (ex as { id?: string }).id || '';
                              const meta = resolveExerciseMeta(exId);
                              return (
                                <div
                                  key={`missed-${exId || eIdx}`}
                                  className="p-3 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-sans font-semibold text-zinc-200 break-words">{meta?.name || 'Exercise'}</span>
                                    {meta?.target && (
                                      <span className={cn(TYPOGRAPHY.caption, "text-zinc-400 ml-2")}>({meta.target})</span>
                                    )}
                                  </div>
                                  <span className={cn(TYPOGRAPHY.metadata, "text-zinc-300 shrink-0 tabular-nums")}>
                                    {ex.sets} × {ex.reps}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
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
                    <Grid cols={1} colsSm={3} gap="sm">
                      <StatCard
                        label="Total Volume"
                        value={selectedDayVolume}
                        formatValue={formatCompactWeight}
                        unit="kg"
                        accent="zinc"
                        icon={TrendingUp}
                        size="standard"
                      />
                      <StatCard
                        label="Duration"
                        value={selectedLog.durationMinutes ?? 0}
                        unit="min"
                        accent="zinc"
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
                        rightIcon={<ArrowRight size={14} className="text-zinc-400" />}
                        onClick={() => {
                          haptics.selection();
                          onNavigateToHistory(selectedLog.id || selectedDateStr || undefined);
                        }}
                        className={cn("mt-2", CONTROL_HEIGHT.touchTarget, "sm:min-h-[40px] sm:min-w-0")}
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

