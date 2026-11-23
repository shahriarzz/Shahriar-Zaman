import React, { useState, useMemo, useId } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  subDays,
  isSameMonth
} from 'date-fns';
import { MuscleBalanceRecovery } from './MuscleBalanceRecovery';
import { DeferredViewSection } from './DeferredViewSection';
import { AnalyticsTabState } from '../types/tabViewState';
import { formatCompactWeight } from '../utils/fitnessHelpers';
import { useAnalyticsData, TimeRange, MuscleMetric } from '../hooks/useAnalyticsData';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';
import {
  Section,
  SectionHeader,
  StatCard,
  AchievementCard,
  EmptyState,
  SegmentedControl,
  Badge,
  Card,
  Button,
  Stack,
  Grid,
  ChartTooltip,
  BORDER,
  SURFACE,
  RADIUS,
  GAP,
  STACK_SPACING,
  TYPOGRAPHY,
  CHART_THEME,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  SEMANTIC_PALETTE,
  TRANSITION
} from './ui';

// Unified heatmap intensity scale used for both matrix cells and legend
const HEATMAP_INTENSITY_STEPS = [
  { level: 0, bg: SURFACE.default, border: BORDER.subtle, text: 'text-zinc-400', maxRatio: 0 },
  { level: 1, bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', maxRatio: 0.25 },
  { level: 2, bg: 'bg-emerald-500/45', border: 'border-emerald-500/50', text: 'text-emerald-300', maxRatio: 0.50 },
  { level: 3, bg: 'bg-emerald-500/75', border: 'border-emerald-500/70', text: 'text-black font-bold', maxRatio: 0.75 },
  { level: 4, bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-black font-bold', maxRatio: 1.0 }
] as const;

function getHeatmapIntensity(vol: number, maxVol: number) {
  if (vol <= 0 || maxVol <= 0) return HEATMAP_INTENSITY_STEPS[0];
  const ratio = vol / maxVol;
  if (ratio < 0.25) return HEATMAP_INTENSITY_STEPS[1];
  if (ratio < 0.50) return HEATMAP_INTENSITY_STEPS[2];
  if (ratio < 0.75) return HEATMAP_INTENSITY_STEPS[3];
  return HEATMAP_INTENSITY_STEPS[4];
}

export interface AnalyticsViewProps {
  savedState?: AnalyticsTabState;
  onSaveState?: (state: AnalyticsTabState) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ savedState, onSaveState }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>(savedState?.timeRange ?? '30d');
  const [muscleMetric, setMuscleMetric] = useState<MuscleMetric>(savedState?.muscleMetric ?? 'volume');
  const [selected1RMExerciseId, setSelected1RMExerciseId] = useState<string | null>(savedState?.selected1RMExerciseId ?? null);
  const [currentHeatmapMonth, setCurrentHeatmapMonth] = useState<Date>(savedState?.currentHeatmapMonth ?? new Date());
  const [showAllRecords, setShowAllRecords] = useState<boolean>(false);
  const [showAllExercises, setShowAllExercises] = useState<boolean>(false);
  const rawE1rmGradientId = useId();
  const e1rmGradientId = `e1rmAreaFill-${rawE1rmGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  React.useEffect(() => {
    onSaveState?.({
      timeRange,
      muscleMetric,
      selected1RMExerciseId,
      currentHeatmapMonth
    });
  }, [timeRange, muscleMetric, selected1RMExerciseId, currentHeatmapMonth, onSaveState]);

  const {
    trainingStreak,
    adherenceInsight,
    performanceScore,
    currentDate,
    todayStr
  } = useFitnessDerivedData();

  const {
    coreWorkoutByCycleDayMap,
    priorityExercises,
    active1RMExerciseId,
    aggregated,
    heatmapData,
    muscleChartData,
    workoutPieData,
    insightsList,
    getCycleDayForDate,
    index
  } = useAnalyticsData({
    timeRange,
    muscleMetric,
    selected1RMExerciseId,
    currentHeatmapMonth
  });

  const monthlySummary = heatmapData.summary ?? {
    activeDaysCount: 0,
    missedPastCoreDays: 0,
    completedScheduled: 0,
    evaluatedScheduledWorkouts: 0,
    adherencePct: 0,
  };

  // Visible records slice
  const visibleRecords = showAllRecords ? aggregated.recordsList : aggregated.recordsList.slice(0, 3);

  // Visible frequent exercises slice
  const visibleExercises = showAllExercises
    ? aggregated.mostFrequentExercises
    : aggregated.mostFrequentExercises.slice(0, 3);

  const active1RMExerciseName =
    priorityExercises.find((ex) => ex.id === active1RMExerciseId)?.name || 'Selected Exercise';

  const muscleBalanceDateRange = useMemo(() => {
    const today = currentDate;
    if (timeRange === '7d') {
      return {
        startDate: format(subDays(today, 6), 'yyyy-MM-dd'),
        endDate: todayStr,
        label: 'Last 7 Days'
      };
    }
    if (timeRange === '30d') {
      return {
        startDate: format(subDays(today, 29), 'yyyy-MM-dd'),
        endDate: todayStr,
        label: 'Last 30 Days'
      };
    }
    if (timeRange === '90d') {
      return {
        startDate: format(subDays(today, 89), 'yyyy-MM-dd'),
        endDate: todayStr,
        label: 'Last 90 Days'
      };
    }
    return {
      startDate: aggregated.firstLogDate || '1970-01-01',
      endDate: todayStr,
      label: 'All Time'
    };
  }, [timeRange, aggregated.firstLogDate, currentDate, todayStr]);

  return (
    <Stack spacing="2xl" className="pt-4 pb-16">
      {/* 1. HEADER & TIME TOGGLE */}
      <SectionHeader
        eyebrow="Performance Intelligence"
        eyebrowColor="emerald"
        title="Analytics"
        size="page"
        action={
          <SegmentedControl<TimeRange>
            options={[
              { value: '7d', label: '7D' },
              { value: '30d', label: '30D' },
              { value: '90d', label: '90D' },
              { value: 'all', label: 'ALL' }
            ]}
            value={timeRange}
            onChange={(r) => {
              haptics.selection();
              setTimeRange(r);
            }}
            accent="emerald"
            size="md"
          />
        }
      />

      {/* 2. SECTION 1: OVERVIEW HERO STATS */}
      <Grid cols={2} colsLg={4} gap="md">
        {/* 1. Scheduled Training Streak */}
        <StatCard
          label="Scheduled Training Streak"
          value={trainingStreak.currentStreak}
          unit={trainingStreak.currentStreak === 1 ? 'day' : 'days'}
          accent="zinc"
          sublabel="Respects recovery days"
          trend={<span className={cn(TYPOGRAPHY.label, "text-zinc-400 font-bold tabular-nums")}>Best: {trainingStreak.longestStreak}d</span>}
        />

        {/* 2. Adherence Rate */}
        <StatCard
          label="Adherence Rate"
          value={adherenceInsight.evaluatedScheduledWorkouts === 0 ? '—' : adherenceInsight.percent}
          unit={adherenceInsight.evaluatedScheduledWorkouts === 0 ? undefined : '%'}
          isUnavailable={adherenceInsight.evaluatedScheduledWorkouts === 0}
          unavailableLabel="Building baseline"
          accent={
            adherenceInsight.evaluatedScheduledWorkouts === 0
              ? 'zinc'
              : adherenceInsight.percent >= 80
              ? 'emerald'
              : adherenceInsight.percent >= 50
              ? 'amber'
              : 'red'
          }
          sublabel={
            adherenceInsight.evaluatedScheduledWorkouts === 0
              ? 'Complete 1 scheduled workout'
              : adherenceInsight.pendingScheduledWorkouts > 0
              ? `${adherenceInsight.completedScheduled}/${adherenceInsight.evaluatedScheduledWorkouts} evaluated · ${adherenceInsight.pendingScheduledWorkouts} pending`
              : `${adherenceInsight.completedScheduled}/${adherenceInsight.evaluatedScheduledWorkouts} evaluated`
          }
        />

        {/* 3. Window Volume with Period-over-Period Trend */}
        <StatCard
          label="Window Volume"
          value={aggregated.rangeVolume}
          formatValue={formatCompactWeight}
          unit="kg"
          accent={
            aggregated.volumePeriodChangePct !== null
              ? aggregated.volumePeriodChangePct > 0
                ? 'emerald'
                : aggregated.volumePeriodChangePct < 0
                ? 'red'
                : 'zinc'
              : 'zinc'
          }
          sublabel={`${timeRange.toUpperCase()} completed volume`}
          trend={
            aggregated.volumePeriodChangePct !== null ? (
              <span
                className={cn(
                  "font-bold flex items-center gap-0.5 tabular-nums",
                  aggregated.volumePeriodChangePct > 0
                    ? "text-emerald-400"
                    : (aggregated.volumePeriodChangePct < 0 ? "text-red-400" : "text-zinc-400")
                )}
              >
                {aggregated.volumePeriodChangePct > 0 ? (
                  <TrendingUp size={12} />
                ) : aggregated.volumePeriodChangePct < 0 ? (
                  <TrendingDown size={12} />
                ) : null}
                {aggregated.volumePeriodChangePct > 0 ? `+${aggregated.volumePeriodChangePct}%` : `${aggregated.volumePeriodChangePct}%`}
              </span>
            ) : undefined
          }
        />

        {/* 4. Performance Score */}
        <StatCard
          label="Performance Score"
          value={performanceScore.score}
          sublabel={performanceScore.score !== null ? `${performanceScore.status} · Rolling 28D` : 'Building baseline'}
          isUnavailable={performanceScore.score === null}
          unavailableLabel="Building baseline"
          accent={
            performanceScore.score === null
              ? 'zinc'
              : performanceScore.status === 'Excellent' || performanceScore.status === 'Strong'
              ? 'emerald'
              : performanceScore.status === 'Good'
              ? 'amber'
              : 'red'
          }
        />
      </Grid>

      {/* 3. SECTION 2: PRIMARY ANALYTICAL FOCUS — STRENGTH PROGRESSION (1RM TREND) */}
      <DeferredViewSection minHeight={420}>
        <Section
          eyebrow="Strength & Long-Term Progress"
          eyebrowColor="indigo"
          title="Estimated 1RM Progression"
          padding="section"
          action={
            priorityExercises.length > 0 ? (
              <div className={cn("flex items-center w-full sm:w-auto sm:max-w-xl lg:max-w-2xl overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 scrollbar-none", GAP.sm)}>
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400 shrink-0")}>Lift:</span>
                <div className={cn("flex sm:flex-wrap", GAP.xs)}>
                  {priorityExercises.map((ex, idx) => (
                    <Button
                      key={ex.id ? `p-ex-${ex.id}-${idx}` : `p-ex-${idx}`}
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        haptics.selection();
                        setSelected1RMExerciseId(ex.id);
                      }}
                      className={cn(
                        "whitespace-nowrap shrink-0",
                        active1RMExerciseId === ex.id && cn(SEMANTIC_PALETTE.indigo.compound, "text-indigo-300 hover:bg-indigo-500/20")
                      )}
                    >
                      {ex.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : undefined
          }
        >
          <Stack spacing="lg">
            {aggregated.active1RMTrend.length > 0 ? (
              <div
                className="h-64 sm:h-72 w-full"
                role="img"
                aria-label={`Estimated 1RM progression chart for ${active1RMExerciseName} across ${aggregated.active1RMTrend.length} sessions`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aggregated.active1RMTrend} margin={{ top: 12, right: 16, left: -4, bottom: 8 }}>
                    <defs>
                      <linearGradient id={e1rmGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_THEME.indigo} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={CHART_THEME.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID_PROPS} vertical={false} />
                    <XAxis
                      dataKey="displayDate"
                      {...CHART_AXIS_PROPS}
                      dy={6}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      {...CHART_AXIS_PROPS}
                      width={48}
                      tickFormatter={(v) => `${Math.round(v)}kg`}
                      domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <ChartTooltip>
                              <p className="text-zinc-400 font-bold">{data.date}</p>
                              <p className="text-indigo-400 font-black text-sm tabular-nums">
                                Est. 1RM: {data.epley1RM} kg
                              </p>
                              <p className={cn(TYPOGRAPHY.caption)}>Best Set: {data.setDetail}</p>
                            </ChartTooltip>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="epley1RM"
                      stroke={CHART_THEME.indigo}
                      strokeWidth={2.5}
                      fill={`url(#${e1rmGradientId})`}
                      fillOpacity={1}
                      dot={{ fill: CHART_THEME.indigo, r: 4, stroke: CHART_THEME.background, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: CHART_THEME.indigo, stroke: CHART_THEME.text, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No lift progression data"
                description="No completed sets recorded for this movement in the selected range."
              />
            )}

            {/* Summary metrics beneath chart */}
            <Grid cols={2} gap="md">
              <StatCard
                label="Average Session Length"
                value={aggregated.avgDuration}
                unit="min"
                isUnavailable={aggregated.avgDuration <= 0}
                accent="zinc"
                sublabel={aggregated.avgDuration > 0 ? 'Measured duration' : 'No duration recorded'}
              />

              <AchievementCard
                title="Biggest Week Ever"
                value={aggregated.biggestWeek.volume > 0 ? `${formatCompactWeight(aggregated.biggestWeek.volume)} kg` : '0 kg'}
                subtitle={aggregated.biggestWeek.weekStr}
                icon={<Trophy size={18} />}
              />
            </Grid>
          </Stack>
        </Section>
      </DeferredViewSection>

      {/* 4. SECTION 3: TRAINING ACTIVITY & CONSISTENCY */}
      <div className={cn("pt-2 border-t", BORDER.subtle)}>
        <p className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>01 · Training Activity & Consistency</p>
      </div>
      <Section
        eyebrow="Daily Training Volume"
        eyebrowColor="zinc"
        title="Monthly Intensity Heatmap"
        description="Daily completed training volume by date (kg)."
        padding="section"
        action={
          <div className={cn("flex items-center", GAP.sm)}>
            <span className={cn(TYPOGRAPHY.label, "text-zinc-300 mr-1 sm:mr-2 tabular-nums")}>
              {format(heatmapData.monthStart, 'MMMM yyyy')}
            </span>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(subMonths(currentHeatmapMonth, 1));
              }}
              icon={<ChevronLeft size={16} />}
              aria-label="Previous Month"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                haptics.selection();
                setCurrentHeatmapMonth(addMonths(currentHeatmapMonth, 1));
              }}
              icon={<ChevronRight size={16} />}
              aria-label="Next Month"
            />
          </div>
        }
      >
        <Stack spacing="lg">
          {/* Heatmap Grid */}
          <div
            role="region"
            aria-label={`Monthly volume intensity heatmap for ${format(heatmapData.monthStart, 'MMMM yyyy')}, ${monthlySummary.activeDaysCount} active days`}
          >
          <Stack spacing="xs">
            {/* Weekday headers */}
            <div className={cn("grid grid-cols-7 text-center uppercase", GAP.xs, TYPOGRAPHY.label, "text-zinc-400")}>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Days grid */}
            <div className={cn("grid grid-cols-7", GAP.xs)}>
              {heatmapData.days.map((day, dayIdx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(day, heatmapData.monthStart);
                const vol = heatmapData.logVolMap[dateStr] || 0;
                const detail = heatmapData.dayDetailMap[dateStr];
                const intensity = getHeatmapIntensity(vol, heatmapData.maxDayVol);

                const cycleDay = getCycleDayForDate(day);
                const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);

                let tooltipText = `${dateStr}`;
                if (detail && detail.workoutNames.length > 0) {
                  tooltipText = `${dateStr} • ${detail.workoutNames.join(', ')} (${vol.toLocaleString()} kg, ${detail.doneSets} sets)`;
                } else if (expectedWo?.type === 'rest') {
                  tooltipText = `${dateStr} • Scheduled Rest (${expectedWo.name})`;
                } else if (expectedWo) {
                  tooltipText = `${dateStr} • Scheduled: ${expectedWo.name} (No log recorded)`;
                } else {
                  tooltipText = `${dateStr} • Rest`;
                }

                if (!isCurrentMonth) {
                  return (
                    <div
                      key={`day-${dateStr}-${dayIdx}`}
                      aria-hidden="true"
                      className={cn(
                        "aspect-square border bg-zinc-950/40 border-zinc-900/50",
                        RADIUS.badge
                      )}
                    />
                  );
                }

                return (
                  <div
                    key={`day-${dateStr}-${dayIdx}`}
                    title={tooltipText}
                    aria-label={tooltipText}
                    className={cn(
                      "aspect-square border flex flex-col items-center justify-center p-1 relative group cursor-default",
                      TRANSITION.colors,
                      RADIUS.badge,
                      intensity.bg,
                      intensity.border,
                      intensity.text
                    )}
                  >
                    <span className={cn(TYPOGRAPHY.label, "text-current leading-none tabular-nums")}>{format(day, 'd')}</span>
                    {vol > 0 && (
                      <span className={cn(TYPOGRAPHY.micro, "text-current leading-none mt-1 tabular-nums")}>
                        {(vol / 1000).toFixed(1)}k
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Stack>
          </div>

          {/* Legend + Summary derived directly from single intensity scale */}
          <div className={cn("flex flex-col sm:flex-row items-center justify-between pt-3 border-t", GAP.md, BORDER.subtle)}>
            <div className={cn("flex items-center", GAP.sm)}>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>Less</span>
              <div className={cn("flex", GAP.xs)}>
                {HEATMAP_INTENSITY_STEPS.map((step) => (
                  <span
                    key={`step-${step.level}`}
                    className={cn("w-3.5 h-3.5 border", RADIUS.badge, step.bg, step.border)}
                  />
                ))}
              </div>
              <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>More</span>
            </div>

            <div className={cn(TYPOGRAPHY.label, "text-zinc-400 flex flex-wrap items-center justify-center tabular-nums", GAP.sm)}>
              <span className="text-emerald-400 font-bold">{monthlySummary.activeDaysCount}</span> Active Days ·{' '}
              <span className="text-zinc-400">{monthlySummary.missedPastCoreDays} Skipped</span> ·{' '}
              <span className="text-zinc-300">
                {monthlySummary.evaluatedScheduledWorkouts > 0
                  ? `${monthlySummary.adherencePct}% Adherence`
                  : '— Adherence'}
              </span>
            </div>
          </div>
        </Stack>
      </Section>

      {/* 5. SECTION 4: TRAINING DISTRIBUTION (MUSCLES, MOST FREQUENT EXERCISES) */}
      <div className={cn("pt-2 border-t", BORDER.subtle)}>
        <p className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>02 · Training Distribution & Anatomical Load</p>
      </div>
      <DeferredViewSection minHeight={480}>
        <Section
          eyebrow={`Anatomical Load · ${muscleBalanceDateRange.label}`}
          eyebrowColor="zinc"
          title="Muscle Group Targeting"
          padding="section"
          action={
            <SegmentedControl<MuscleMetric>
              options={[
                { value: 'volume', label: 'Volume' },
                { value: 'sets', label: 'Sets' },
                { value: 'frequency', label: 'Freq' }
              ]}
              value={muscleMetric}
              onChange={(m) => {
                haptics.selection();
                setMuscleMetric(m);
              }}
              accent="emerald"
              size="sm"
            />
          }
        >
          <Stack spacing="lg">
            {/* Horizontal Bar Chart without redundant Cell layers */}
            {muscleChartData.length > 0 ? (
              <div
                className="h-72 w-full"
                role="img"
                aria-label={`Muscle group targeting bar chart by ${muscleMetric} across ${muscleChartData.length} muscle groups`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={muscleChartData} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid {...CHART_GRID_PROPS} horizontal={false} />
                    <XAxis type="number" {...CHART_AXIS_PROPS} />
                    <YAxis
                      dataKey="category"
                      type="category"
                      interval={0}
                      {...CHART_AXIS_PROPS}
                      width={88}
                      tickFormatter={(val: string) => (val && val.length > 13 ? `${val.slice(0, 12)}…` : val)}
                    />
                    <Tooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <ChartTooltip>
                              <span className="text-zinc-400 uppercase">{d.category}: </span>
                              <strong className="text-emerald-400 font-bold">{d.formattedVal}</strong>
                            </ChartTooltip>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar isAnimationActive={false} dataKey="value" fill={CHART_THEME.emerald} radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                size="compact"
                title="No muscle targeting data"
                description="Complete sets in this range to view muscle load distribution."
              />
            )}

            {/* Most Frequent Exercises inside one unified compact Card */}
            <Stack spacing="sm" className={cn("pt-4 border-t", BORDER.subtle)}>
              <div className="flex items-center justify-between gap-2">
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>
                  Most Frequent Exercises
                </span>
                {aggregated.mostFrequentExercises.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllExercises(!showAllExercises)}
                    icon={showAllExercises ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    iconPosition="right"
                  >
                    {showAllExercises ? 'Show Top 3' : `View All (${aggregated.mostFrequentExercises.length})`}
                  </Button>
                )}
              </div>

              <div className={cn("p-4 border", SURFACE.recessed, BORDER.subtle, RADIUS.button)}>
                {visibleExercises.length > 0 ? (
                  <div className={cn("divide-y", BORDER.subtle)}>
                    {visibleExercises.map((ex, idx) => (
                      <div
                        key={`freq-ex-${ex.name}-${idx}`}
                        className={cn(
                          "flex items-center justify-between py-2.5 first:pt-0 last:pb-0",
                          GAP.sm
                        )}
                      >
                        <div className={cn("flex items-center min-w-0", GAP.sm)}>
                          <span className={cn(
                            "w-6 h-6 flex items-center justify-center font-mono font-bold text-xs shrink-0 border tabular-nums",
                            RADIUS.badge,
                            idx === 0
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : cn(SURFACE.elevated, BORDER.standard, "text-zinc-400")
                          )}>
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white break-words">{ex.name}</p>
                            <p className={cn(TYPOGRAPHY.label, "text-zinc-400 tabular-nums")}>
                              {ex.count} {ex.count === 1 ? 'session' : 'sessions'} logged
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-xs text-zinc-300 tabular-nums">
                            {(ex.volume / 1000).toFixed(1)}k kg
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={cn(TYPOGRAPHY.body, "text-zinc-400 text-center py-2")}>
                    No exercise logs recorded in this period.
                  </p>
                )}
              </div>
            </Stack>
          </Stack>
        </Section>
      </DeferredViewSection>

      {/* 5B. SECTION 4B: MUSCLE BALANCE & RECOVERY ANALYTICS */}
      <DeferredViewSection minHeight={360}>
        <Section
          eyebrow={`Anatomical Balance · ${muscleBalanceDateRange.label} vs 14D Decay`}
          eyebrowColor="zinc"
          title="Muscle Balance & Recovery"
          padding="section"
        >
          <MuscleBalanceRecovery
            startDate={muscleBalanceDateRange.startDate}
            endDate={muscleBalanceDateRange.endDate}
            timeRangeLabel={muscleBalanceDateRange.label}
            referenceDate={currentDate}
          />
        </Section>
      </DeferredViewSection>

      {/* 6. SECTION 5: PERSONAL BESTS / RECORDS (COMPACT ACCORDION & TOP 3) */}
      <div className={cn("pt-2 border-t", BORDER.subtle)}>
        <p className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>03 · Records & Long-Term Progress</p>
      </div>
      <Section
        eyebrow="Strength Records"
        eyebrowColor="orange"
        title="Personal Bests"
        padding="section"
        action={
          aggregated.recordsList.length > 3 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                haptics.selection();
                setShowAllRecords(!showAllRecords);
              }}
              icon={showAllRecords ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              iconPosition="right"
            >
              {showAllRecords ? 'Show Top 3' : `View All Records (${aggregated.recordsList.length})`}
            </Button>
          ) : undefined
        }
      >
        {aggregated.recordsList.length > 0 ? (
          <Grid cols={1} colsMd={2} colsLg={3} gap="sm">
            {visibleRecords.map((rec, idx) => (
              <Card
                key={rec.exerciseName ? `rec-${rec.exerciseName}-${idx}` : `rec-${idx}`}
                variant="standard"
                padding="standard"
                className="flex items-center justify-between group"
              >
                <div className={cn("min-w-0 pr-2", STACK_SPACING.xs)}>
                  <p className={cn("text-xs font-bold text-white group-hover:text-orange-400 break-words", TRANSITION.colors)}>
                    {rec.exerciseName}
                  </p>
                  <p className={cn(TYPOGRAPHY.label, "tabular-nums")}>
                    Logged: {rec.date}
                  </p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="text-sm font-black font-mono text-orange-400">
                    {rec.weight}kg × {rec.reps}
                  </div>
                  <div className={cn(TYPOGRAPHY.label)}>
                    Est. 1RM ~{index.e1RMPRsMap.get(rec.exerciseDefinitionId)?.maxEpley ?? Math.round((rec.weight || 0) * (1 + (rec.reps || 1) / 30) * 10) / 10}kg
                  </div>
                </div>
              </Card>
            ))}
          </Grid>
        ) : (
          <EmptyState
            icon={Award}
            title="No strength records logged"
            description="Record completed sets during workouts to automatically track your all-time heaviest lifts."
          />
        )}
      </Section>

      {/* 7. SECTION 6: LIFETIME SUMMARY */}
      <Section
        eyebrow="Cumulative Milestones"
        eyebrowColor="zinc"
        title="Lifetime Summary"
        padding="section"
      >
        <Stack spacing="lg">
          <Grid cols={2} colsLg={4} gap="md">
            <StatCard
              label="Total Workouts"
              value={aggregated.totalLogsCount}
              accent="zinc"
              sublabel="Completed runs"
            />
            <StatCard
              label="Hours Trained"
              value={aggregated.lifetimeHours}
              unit="hrs"
              accent="zinc"
              sublabel={aggregated.lifetimeHours > 0 ? "Measured duration" : "Logged sessions"}
            />
            <StatCard
              label="Total Sets"
              value={aggregated.lifetimeSets}
              formatValue={(val) => Math.round(val).toLocaleString()}
              accent="zinc"
              sublabel="Executed sets"
            />
            <StatCard
              label="Total Volume"
              value={aggregated.lifetimeVolume}
              formatValue={formatCompactWeight}
              unit="kg"
              accent="zinc"
              sublabel="Cumulative tonnage"
            />
          </Grid>

          {aggregated.firstLogDate && (
            <div className={cn("pt-4 border-t flex items-center tabular-nums", GAP.sm, BORDER.subtle, TYPOGRAPHY.label, "text-zinc-400")}>
              <Sparkles size={14} className="text-zinc-400 shrink-0" />
              <span>
                Training active since <strong className="text-white">{aggregated.firstLogDate}</strong>
              </span>
            </div>
          )}
        </Stack>
      </Section>

      {/* 8. SECTION 7: INSIGHTS & ROUTINE DISTRIBUTION */}
      <div className={cn("pt-2 border-t", BORDER.subtle)}>
        <p className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>04 · Training Patterns & Insights</p>
      </div>
      <Grid cols={1} colsLg={3} gap="lg">
        {/* Performance Insights as flat divided rows inside Section */}
        <Section
          eyebrow="Automated Synthesis"
          eyebrowColor="zinc"
          title="Performance Insights"
          padding="section"
          className="lg:col-span-2"
        >
          <ul className={cn("border divide-y", SURFACE.recessed, BORDER.subtle, RADIUS.button)}>
            {insightsList.map((sentence, idx) => (
              <li
                key={`insight-${idx}`}
                className={cn("flex items-start p-3", GAP.sm)}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" aria-hidden="true" />
                <p className={cn(TYPOGRAPHY.body, "text-zinc-300 text-xs")}>
                  {sentence}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Routine Distribution Pie Chart */}
        <DeferredViewSection minHeight={260}>
          <Section
            eyebrow="Split Breakdown"
            eyebrowColor="zinc"
            title="Routine Distribution"
            padding="section"
            className="flex flex-col justify-between"
          >
            {workoutPieData.length > 0 ? (
              <div
                className="h-48 w-full relative my-auto"
                role="img"
                aria-label={`Routine distribution pie chart across ${workoutPieData.length} workout types`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={workoutPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {workoutPieData.map((entry, idx) => (
                        <Cell
                          key={`cell-${entry.type || idx}`}
                          fill={entry.color}
                          stroke={CHART_THEME.background}
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      animationDuration={0}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <ChartTooltip>
                              <span style={{ color: d.color }}>{d.name}: </span>
                              <strong className="text-white">{d.value} {d.value === 1 ? 'session' : 'sessions'}</strong>
                            </ChartTooltip>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center">
                <EmptyState size="compact" title="No session data in range" className="w-full" />
              </div>
            )}

            {/* Compact Routine Legend (Top 5) */}
            <div className={cn("flex flex-wrap pt-3 border-t", GAP.sm, BORDER.subtle)}>
              {workoutPieData.slice(0, 5).map((p, idx) => (
                <Badge
                  key={`badge-${p.type || idx}`}
                  label={`${p.name} (${p.value})`}
                  colorOverride={p.color}
                  variant="subtle"
                  size="sm"
                />
              ))}
            </div>
          </Section>
        </DeferredViewSection>
      </Grid>

      {/* 9. SECTION 8: TRAINING GAP & ACTIVITY */}
      <Section
        eyebrow="Spacing & Cadence"
        eyebrowColor="zinc"
        title="Training Cadence"
        padding="section"
      >
        <Grid cols={2} gap="md">
          <StatCard
            label="Last Session"
            value={
              !aggregated.firstLogDate
                ? '—'
                : aggregated.daysSinceLast === 0
                ? 'Today'
                : aggregated.daysSinceLast
            }
            unit={
              !aggregated.firstLogDate || aggregated.daysSinceLast === 0
                ? undefined
                : 'd ago'
            }
            isUnavailable={!aggregated.firstLogDate}
            accent="zinc"
            sublabel={!aggregated.firstLogDate ? 'No sessions recorded' : 'Last recorded workout'}
          />
          <StatCard
            label="Average Training Gap"
            value={aggregated.totalLogsCount < 2 ? '—' : aggregated.avgGapDays}
            unit={aggregated.totalLogsCount < 2 ? undefined : 'days'}
            isUnavailable={aggregated.totalLogsCount < 2}
            unavailableLabel="Need 2+ sessions"
            accent="zinc"
            sublabel={aggregated.totalLogsCount < 2 ? 'Need 2+ sessions' : 'Spacing between sessions'}
          />
          <StatCard
            label="Active Days in Window"
            value={aggregated.activeDaysCount}
            unit="days"
            accent="zinc"
            sublabel={`Logged in ${timeRange.toUpperCase()} window`}
          />
          <StatCard
            label="Sessions in Window"
            value={!aggregated.firstLogDate ? '—' : aggregated.rangeLogsCount}
            unit={!aggregated.firstLogDate ? undefined : (aggregated.rangeLogsCount === 1 ? 'session' : 'sessions')}
            accent="zinc"
            isUnavailable={!aggregated.firstLogDate}
            unavailableLabel="No sessions recorded"
            sublabel={
              !aggregated.firstLogDate
                ? 'No sessions recorded'
                : aggregated.rangeLogsCount === 0
                ? `No sessions in ${timeRange.toUpperCase()} window`
                : `Logged in ${timeRange.toUpperCase()} window`
            }
          />
        </Grid>
      </Section>
    </Stack>
  );
};


