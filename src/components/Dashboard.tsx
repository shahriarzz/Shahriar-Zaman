import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { TrendingUp, Calendar as CalendarIcon, Repeat, ChevronRight, Trash2, Dumbbell, Weight, CheckCircle2 } from 'lucide-react';
import { WORKOUT_COLORS, formatCompactWeight } from '../utils/fitnessHelpers';
import { formatDateStr } from '../utils/dashboardSelectors';
import { Calendar } from './Calendar';
import { haptics } from '../utils/haptics';
import { useConfirm } from '../context/ConfirmContext';
import { useDashboardData, parseStrictBodyWeight } from '../hooks/useDashboardData';
import {
  Section,
  SectionHeader,
  StatCard,
  Badge,
  EmptyState,
  Button,
  Input,
  Banner,
  Stack,
  Grid,
  ListRow,
  WorkoutColorIndicator,
  SEMANTIC_COLORS,
  SURFACE,
  BORDER,
  RADIUS,
  SHADOW,
  TYPOGRAPHY,
  CONTROL_HEIGHT,
} from './ui';
import { cn } from '../lib/utils';

interface DashboardProps {
  onStartWorkout: (id: string) => void;
  onNavigateToHistory: (dateStr?: string) => void;
  onPrewarmSession?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onStartWorkout, onNavigateToHistory, onPrewarmSession }) => {
  const {
    heroDateStr,
    stats,
    trainingStreak,
    trainingFrequency,
    strengthTrend,
    unfinishedSession,
    todayWorkout,
    currentCycleDay,
    hasWorkouts,
    workouts,
    weightSummary,
    recentMilestones,
    clearActiveSession,
    resetToCycleDay1,
    reloadInitialWorkouts,
    isTodayCompleted,
    todayCompletedSummary,
    nextScheduledWorkout,
    adherence
  } = useDashboardData();

  const { confirm } = useConfirm();
  const shouldReduceMotion = useReducedMotion();
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [weightInput, setWeightInput] = React.useState('');
  const [weightError, setWeightError] = React.useState<string | null>(null);
  const [isSubmittingWeight, setIsSubmittingWeight] = React.useState(false);

  const triggerButtonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownContainerRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on pointerdown outside
  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        isDropdownOpen &&
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isDropdownOpen]);

  // Close dropdown on Escape and restore focus to trigger button
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDropdownOpen && event.key === 'Escape') {
        event.preventDefault();
        setIsDropdownOpen(false);
        triggerButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDropdownOpen]);

  const handleLogWeightSubmit = async () => {
    if (isSubmittingWeight) return;
    const { value, error } = parseStrictBodyWeight(weightInput);
    if (error || value === null) {
      haptics.warning();
      setWeightError(error);
      return;
    }
    setWeightError(null);
    setIsSubmittingWeight(true);
    try {
      await weightSummary.logWeight(value);
      haptics.success();
      setWeightInput('');
    } catch (err) {
      haptics.warning();
      setWeightError(err instanceof Error ? err.message : 'Failed to save body weight.');
    } finally {
      setIsSubmittingWeight(false);
    }
  };

  return (
    <Stack spacing="2xl" className="pt-4 pb-16">
      {/* 1. Page Header, 2. Stable 4-KPI Overview Grid, 3. Unfinished Session, 4. Today's Protocol */}
      <Stack spacing="lg">
        <SectionHeader
          eyebrow={heroDateStr}
          eyebrowColor="zinc"
          title="Stay Aggressive"
          size="page"
        />

        {/* Stable 4-KPI Overview Grid (Locked slot identities) */}
        <Grid cols={2} colsMd={4} gap="md" data-testid="dashboard-overview-stats">
          <StatCard
            label="Streak"
            value={trainingStreak.currentStreak}
            unit={trainingStreak.currentStreak === 1 ? 'session' : 'sessions'}
            sublabel={`Best: ${trainingStreak.longestStreak} ${trainingStreak.longestStreak === 1 ? 'session' : 'sessions'}`}
            accent="zinc"
            icon={TrendingUp}
            disableAnimation
            size="standard"
          />
          <StatCard
            label="Training Frequency"
            value={trainingFrequency.sessionsPerWeek}
            formatValue={(val) => val.toFixed(1)}
            unit="/ week"
            sublabel={`${trainingFrequency.change >= 0 ? '+' : ''}${trainingFrequency.change.toFixed(1)} vs previous 28d`}
            accent="zinc"
            icon={CalendarIcon}
            disableAnimation
            size="standard"
          />
          <StatCard
            label="Strength Progress"
            value={strengthTrend.percentChange}
            formatValue={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}`}
            unit="%"
            sublabel={
              strengthTrend.percentChange !== null
                ? `28d vs prev · ${strengthTrend.comparableExercises} ${strengthTrend.comparableExercises === 1 ? 'lift' : 'lifts'} (${strengthTrend.confidence})`
                : 'Insufficient 28d baseline'
            }
            isUnavailable={strengthTrend.percentChange === null}
            accent={
              strengthTrend.percentChange === null
                ? 'zinc'
                : strengthTrend.percentChange > 0
                  ? 'emerald'
                  : strengthTrend.percentChange < 0
                    ? 'red'
                    : 'zinc'
            }
            trendDirection={
              strengthTrend.percentChange === null
                ? undefined
                : strengthTrend.percentChange > 0
                  ? 'positive'
                  : strengthTrend.percentChange < 0
                    ? 'negative'
                    : 'neutral'
            }
            icon={Dumbbell}
            disableAnimation
            size="standard"
          />
          <StatCard
            label="Adherence"
            value={adherence && adherence.evaluatedScheduledWorkouts > 0 ? adherence.percent : null}
            unit="%"
            isUnavailable={!adherence || adherence.evaluatedScheduledWorkouts === 0}
            unavailableLabel="Building baseline"
            sublabel={
              adherence && adherence.evaluatedScheduledWorkouts > 0
                ? `${adherence.completedScheduled}/${adherence.evaluatedScheduledWorkouts} scheduled`
                : 'Complete 1 scheduled workout'
            }
            accent="zinc"
            icon={CheckCircle2}
            disableAnimation
            size="standard"
          />
        </Grid>

        {/* Unfinished Session Alert (only when present) */}
        {unfinishedSession && (
          <motion.div
            data-testid="unfinished-session-banner"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
          >
            <Banner
              variant="warning"
              badge="UNFINISHED SESSION RESTORED"
              title={unfinishedSession.workout.name}
              description={`Started ${unfinishedSession.relativeTime}`}
              action={
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Discard Unfinished Session?',
                        message: 'All unsubmitted progress and logged sets in this active session will be lost.',
                        confirmText: 'Discard Session',
                        isDanger: true,
                      });
                      if (confirmed) {
                        haptics.destructive();
                        clearActiveSession();
                      }
                    }}
                    className={cn("flex-1 sm:flex-initial", CONTROL_HEIGHT.touchTarget, "sm:min-h-[40px] sm:min-w-0")}
                  >
                    Discard
                  </Button>
                  <Button
                    variant="warning"
                    size="md"
                    haptic="medium"
                    onPointerDown={() => onPrewarmSession?.()}
                    onMouseEnter={() => onPrewarmSession?.()}
                    onClick={() => {
                      onStartWorkout(unfinishedSession.workoutId);
                    }}
                    className={cn("flex-1 sm:flex-initial", CONTROL_HEIGHT.touchTarget, "sm:min-h-[40px] sm:min-w-0")}
                  >
                    Resume Session
                  </Button>
                </div>
              }
            />
          </motion.div>
        )}

        {/* Today's Workout (Single consolidated section heading) */}
        <Section
          title="Today's Protocol"
          variant="standard"
          padding="section"
        >
          {!hasWorkouts ? (
            <EmptyState
              icon={Dumbbell}
              title="Routines Library Is Empty"
              description="Reload standard protocols to populate your workout engine."
              action={{
                label: 'Reload Engine',
                onClick: () => {
                  reloadInitialWorkouts();
                }
              }}
            />
          ) : todayWorkout ? (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <Stack spacing="xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(TYPOGRAPHY.badgeMd, "font-mono font-bold text-xs tracking-wider px-2 py-0.5 border", RADIUS.badge, SURFACE.recessed, BORDER.subtle, "text-zinc-300")}>
                    DAY {currentCycleDay} / 8
                  </span>
                  {todayWorkout.type !== 'rest' && (
                    <Badge
                      label={isTodayCompleted ? 'COMPLETED TODAY' : 'TRAINING DAY'}
                      color={isTodayCompleted ? 'emerald' : 'orange'}
                      variant="subtle"
                      size="md"
                    />
                  )}
                  {todayWorkout.badge && todayWorkout.badge !== 'DAY 8 · REST' && (
                    <Badge
                      label={todayWorkout.badge}
                      colorOverride={WORKOUT_COLORS[todayWorkout.type]}
                      variant="subtle"
                    />
                  )}
                </div>
                <h3 className={cn(TYPOGRAPHY.titleSubsection, "text-lg md:text-xl text-white")}>
                  {todayWorkout.name}
                </h3>
                {isTodayCompleted && todayCompletedSummary ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 text-xs font-mono text-zinc-300">
                      <span>{todayCompletedSummary.setsCount} {todayCompletedSummary.setsCount === 1 ? 'set' : 'sets'}</span>
                      <span className="text-zinc-600">·</span>
                      <span>{todayCompletedSummary.durationMinutes} min</span>
                      <span className="text-zinc-600">·</span>
                      <span>{formatCompactWeight(todayCompletedSummary.totalVolume)} kg</span>
                    </div>
                    {nextScheduledWorkout && (
                      <span className={cn(TYPOGRAPHY.caption, "text-zinc-400 font-mono")}>
                        Next Scheduled: {nextScheduledWorkout.cycleDay != null ? `Day ${nextScheduledWorkout.cycleDay} · ` : ''}{nextScheduledWorkout.name}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className={cn(TYPOGRAPHY.metadata, "text-zinc-400 normal-case")}>
                    {todayWorkout.type === 'rest' ? 'Scheduled recovery' : `${todayWorkout.exercises.length} Exercises`}
                  </p>
                )}
              </Stack>

              <Button
                variant={isTodayCompleted || todayWorkout.type === 'rest' ? 'secondary' : 'primary'}
                size="lg"
                disabled={isTodayCompleted || todayWorkout.type === 'rest'}
                onPointerDown={() => onPrewarmSession?.()}
                onMouseEnter={() => onPrewarmSession?.()}
                onClick={() => {
                  if (!isTodayCompleted && todayWorkout.type !== 'rest') {
                    onStartWorkout(todayWorkout.id);
                  }
                }}
                className="w-full md:w-auto"
              >
                {isTodayCompleted ? 'Completed' : todayWorkout.type === 'rest' ? 'Rest Day' : 'Start Session'}
              </Button>
            </div>
          ) : (
            <EmptyState
              icon={Repeat}
              title="Protocol Out of Sync"
              description={`No core workout found for Day ${currentCycleDay}.`}
              action={{
                label: 'Reset to Cycle Day 1',
                onClick: () => resetToCycleDay1()
              }}
            />
          )}
        </Section>
      </Stack>

      {/* 4. Recent Milestones */}
      <Section
        eyebrow="Milestones"
        eyebrowColor="zinc"
        title="Recent Achievements"
        padding="section"
      >
        <Stack spacing="lg">
          {/* Rolling 7-Day & Lifetime Training Volume Summary */}
          <div className={cn("p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4", RADIUS.card, SURFACE.recessed, BORDER.subtle)}>
            <div>
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Rolling 7-Day Volume</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={cn(TYPOGRAPHY.statValue, "text-white")}>
                  {formatCompactWeight(recentMilestones.recentVolume.volume)}
                </span>
                <span className={TYPOGRAPHY.unit}>kg</span>
              </div>
              <span className={cn(TYPOGRAPHY.caption, "text-zinc-400 font-mono block mt-1")}>
                {recentMilestones.recentVolume.dateRangeLabel}
              </span>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-zinc-800/70 pt-3 sm:pt-0 sm:pl-6 shrink-0">
              <div className="flex items-center sm:justify-end gap-1.5">
                <Weight size={12} className="text-zinc-400 shrink-0" />
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Total Volume (Lifetime)</span>
              </div>
              <div className="flex items-baseline sm:justify-end gap-1.5 mt-0.5">
                <span className={cn(TYPOGRAPHY.statValue, "text-zinc-200")}>
                  {formatCompactWeight(stats.totalWeight)}
                </span>
                <span className={TYPOGRAPHY.unit}>kg</span>
              </div>
            </div>
          </div>

          {/* Personal Records Sub-block */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Personal Records</span>
              <span className={cn(TYPOGRAPHY.caption, "font-mono")}>
                {recentMilestones.recentPREvents.length > 0 ? `Latest ${recentMilestones.recentPREvents.length}` : 'All-time verified'}
              </span>
            </div>

            {recentMilestones.recentPREvents.length === 0 ? (
              <EmptyState
                size="compact"
                title="No Recent Personal Records"
                description="Personal records appear automatically as you log qualifying lifts."
              />
            ) : (
              <Grid cols={2} gap="sm">
                {recentMilestones.recentPREvents.map((pr) => (
                  <div
                    key={pr.id}
                    className={cn(
                      "flex flex-col justify-between p-3 sm:p-3.5 border gap-2 min-w-0",
                      RADIUS.card,
                      SURFACE.recessed,
                      BORDER.subtle
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-2 min-w-0">
                        <span className={cn(TYPOGRAPHY.titleSubsection, "text-xs sm:text-sm text-white break-words flex-1 min-w-0 leading-snug")}>
                          {pr.exerciseName}
                        </span>
                        <span className={cn(TYPOGRAPHY.caption, "font-mono shrink-0 whitespace-nowrap")}>
                          {formatDateStr(pr.date)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {pr.isWeightPR && (
                          <Badge label="WEIGHT PR" color="orange" variant="subtle" />
                        )}
                        {pr.isE1RMPR && (
                          <Badge label="E1RM PR" color="emerald" variant="subtle" />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2 border-t border-zinc-800/60 text-xs font-mono min-w-0">
                      <span className="text-zinc-300 break-words sm:whitespace-nowrap">{pr.weight} kg × {pr.reps} reps</span>
                      <span className="text-zinc-400 break-words sm:whitespace-nowrap">e1RM: <strong className="text-white font-bold tabular-nums">{pr.e1rm}</strong> kg</span>
                    </div>
                  </div>
                ))}
              </Grid>
            )}
          </div>
        </Stack>
      </Section>

      {/* Body Weight Log */}
      <Section
        eyebrow="Biometrics"
        eyebrowColor="zinc"
        title="Body Weight Tracker"
        padding="section"
      >
        <Stack spacing="lg">
          {/* Current + Input Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-1">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Current</span>
              <div className="flex items-end gap-1.5">
                <span className={cn(TYPOGRAPHY.statValueHero, "text-white")}>
                  {weightSummary.currentWeight}
                </span>
                <span className={TYPOGRAPHY.unit}>kg</span>
              </div>
            </div>

            {/* Quick log input */}
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label htmlFor="quick-body-weight-input" className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400 block")}>
                Body Weight
              </label>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="w-full sm:w-36">
                  <Input
                    id="quick-body-weight-input"
                    name="bodyWeight"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    unit="kg"
                    value={weightInput}
                    aria-label="Body Weight"
                    onChange={(e) => {
                      setWeightInput(e.target.value);
                      if (weightError) setWeightError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleLogWeightSubmit();
                      }
                    }}
                    aria-invalid={Boolean(weightError)}
                    aria-describedby={weightError ? "body-weight-error" : undefined}
                    className="text-center font-mono font-bold"
                  />
                </div>
                <Button
                  variant="primary"
                  color="orange"
                  haptic="none"
                  disabled={isSubmittingWeight}
                  onClick={handleLogWeightSubmit}
                  className={cn("whitespace-nowrap", CONTROL_HEIGHT.touchTarget, "sm:min-h-[40px] sm:min-w-0")}
                >
                  {isSubmittingWeight ? 'Logging...' : 'Log'}
                </Button>
              </div>
              {weightError && (
                <p id="body-weight-error" role="alert" className={cn(TYPOGRAPHY.caption, "text-red-400 mt-1")}>
                  {weightError}
                </p>
              )}
            </div>
          </div>

          {/* Sparkline */}
          {weightSummary.sparklineData && (() => {
            const { sorted, min, observedMin, observedMax, range, w } = weightSummary.sparklineData;
            const safeRange = range > 0 ? range : 1;
            const firstDate = sorted[0][0];
            const lastDate = sorted[sorted.length - 1][0];
            const sparklineAriaLabel = `Body weight trend for last ${sorted.length} entries from ${formatDateStr(firstDate)} to ${formatDateStr(lastDate)}, ranging from ${observedMin} kg to ${observedMax} kg`;

            // Prevent overlapping markers with dense histories while always keeping endpoints readable
            const MAX_SPARKLINE_MARKERS = 6;
            const visibleMarkerIndices = new Set<number>();
            if (sorted.length <= MAX_SPARKLINE_MARKERS) {
              for (let i = 0; i < sorted.length; i++) visibleMarkerIndices.add(i);
            } else {
              visibleMarkerIndices.add(0);
              visibleMarkerIndices.add(sorted.length - 1);
              const step = (sorted.length - 1) / (MAX_SPARKLINE_MARKERS - 1);
              for (let k = 1; k < MAX_SPARKLINE_MARKERS - 1; k++) {
                visibleMarkerIndices.add(Math.round(k * step));
              }
            }

            return (
              <Stack spacing="xs">
                <div
                  className="relative h-12 w-full"
                  role="img"
                  aria-label={sparklineAriaLabel}
                >
                  <svg
                    viewBox="0 0 100 32"
                    className="w-full h-full"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <polyline
                      points={sorted.map((e, i) =>
                        `${i * w},${32 - ((e[1] - min) / safeRange) * 28}`
                      ).join(' ')}
                      fill="none"
                      stroke={SEMANTIC_COLORS.zinc}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>

                  {/* Overlaid circular point markers: neutral zinc series with orange latest marker */}
                  <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                    {sorted.map((e, i) => {
                      if (!visibleMarkerIndices.has(i)) return null;
                      const isLatest = i === sorted.length - 1;
                      const leftPct = i * w;
                      const yCoord = 32 - ((e[1] - min) / safeRange) * 28;
                      const topPct = (yCoord / 32) * 100;
                      return (
                        <div
                          key={`spark-dot-${e[0]}-${i}`}
                          data-testid="bodyweight-marker"
                          data-latest={isLatest ? 'true' : undefined}
                          className={cn(
                            "absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-zinc-950",
                            isLatest ? "bg-orange-500" : "bg-zinc-400"
                          )}
                          style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Min/Max labels */}
                <div className={cn("flex justify-between uppercase", TYPOGRAPHY.caption, "font-mono")} aria-hidden="true">
                  <span>{formatDateStr(firstDate)}</span>
                  <span className="text-zinc-400">
                    {observedMin}kg → {observedMax}kg
                  </span>
                  <span>{formatDateStr(lastDate)}</span>
                </div>
              </Stack>
            );
          })()}

          {/* Empty state */}
          {weightSummary.weightEntries.length === 0 && (
            <EmptyState
              size="compact"
              title="No Weight Records"
              description="Log your first weigh-in above to track biometrics."
            />
          )}

          {/* Recent Entries */}
          {weightSummary.recentWeightLogs.length > 0 && (
            <div className={cn("border-t pt-4 space-y-2", BORDER.subtle)}>
              <div className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Recent Logs</div>
              <Stack spacing="xs" className="max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {weightSummary.recentWeightLogs.map(([date, weight]) => (
                  <ListRow
                    key={date}
                    content={
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-400 font-mono text-xs">{formatDateStr(date)}</span>
                        <span className="text-white font-mono font-bold text-xs">
                          {weight} <span className={cn(TYPOGRAPHY.unit, "ml-0.5")}>kg</span>
                        </span>
                      </div>
                    }
                    trailing={
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={<Trash2 size={14} />}
                        onClick={async () => {
                          const proceed = await confirm({
                            title: 'Delete Weight Log',
                            message: `Are you sure you want to delete your weight log for ${formatDateStr(date)}?`,
                            confirmText: 'Delete Entry',
                            isDanger: true,
                          });
                          if (proceed) {
                            await weightSummary.deleteWeight(date);
                          }
                        }}
                        className="text-zinc-600 hover:text-red-400"
                        aria-label={`Delete weight entry for ${formatDateStr(date)}`}
                        title="Delete Entry"
                      />
                    }
                  />
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </Section>

      {/* Quick All Workouts */}
      <Section
        eyebrow="Protocols"
        eyebrowColor="zinc"
        title="Routine Library"
        variant="standard"
        padding="compact"
      >
        <div ref={dropdownContainerRef} className="relative dropdown-container">
          <Button
            ref={triggerButtonRef}
            variant="secondary"
            fullWidth
            aria-expanded={isDropdownOpen}
            aria-controls="routine-library-dropdown"
            aria-haspopup="true"
            onClick={() => {
              setIsDropdownOpen(!isDropdownOpen);
            }}
            className={cn(
              "p-4 pr-6 font-mono text-xs uppercase tracking-wider justify-between items-center text-left",
              CONTROL_HEIGHT.touchTarget,
              "sm:min-h-[40px] sm:min-w-0",
              SURFACE.recessed
            )}
            rightIcon={
              <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", isDropdownOpen && "rotate-90")} />
            }
          >
            <span className="text-zinc-300">Browse All Routines</span>
          </Button>

          {isDropdownOpen && (
            <div
              id="routine-library-dropdown"
              className={cn(
                "absolute z-40 left-0 right-0 mt-2 border p-2 space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar",
                SURFACE.elevated,
                BORDER.standard,
                RADIUS.card,
                SHADOW.elevation
              )}
            >
              {workouts.map((wo) => {
                const isRest = wo.type === 'rest';
                return (
                  <ListRow
                    key={wo.id}
                    disabled={isRest}
                    onClick={() => {
                      if (!isRest) {
                        onStartWorkout(wo.id);
                        setIsDropdownOpen(false);
                      }
                    }}
                    leading={<WorkoutColorIndicator type={wo.type} size="sm" />}
                    content={
                      <div>
                        <div className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-white")}>{wo.name}</div>
                        <div className={cn(TYPOGRAPHY.caption, "mt-1")}>
                          {wo.cycleDay != null ? `Day ${wo.cycleDay} · ${wo.badge}` : (wo.badge || 'Bonus Protocol')}
                        </div>
                      </div>
                    }
                    trailing={
                      !isRest ? (
                        <div className="flex items-center gap-2">
                          <Badge label={`${wo.exercises.length} EXERCISES`} color="zinc" variant="subtle" />
                          <ChevronRight size={14} className="text-zinc-500" />
                        </div>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* Calendar Section */}
      <Calendar onNavigateToHistory={onNavigateToHistory} onStartWorkout={onStartWorkout} />
    </Stack>
  );
};
