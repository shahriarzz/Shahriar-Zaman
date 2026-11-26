import React, { useState, useEffect, useRef, useId, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Search, ChevronRight, ChevronDown, Trophy, Trash2, Clock, Dumbbell, X, Edit2, Plus, Sparkles } from 'lucide-react';
import { useFitness } from '../context/FitnessContext';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import { useConfirm } from '../context/ConfirmContext';
import { generateId, formatCompactWeight } from '../utils/fitnessHelpers';
import { SessionLog, SetLog, WorkoutType } from '../types/fitness';
import { isCompletedSession, getCompletedSets, calculateSetsVolume } from '../utils/fitnessCalculations';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';
import {
  Section,
  SectionHeader,
  Card,
  StatCard,
  Badge,
  Button,
  Input,
  Banner,
  Stack,
  Grid,
  EmptyState,
  ProgressBar,
  SEMANTIC_COLORS,
  SEMANTIC_PALETTE,
  getAccentColor,
  RADIUS,
  SURFACE,
  BORDER,
  SPACING,
  TYPOGRAPHY,
  GAP,
  TRANSITION,
  MOTION_CONFIG,
  CONTROL_HEIGHT,
  FOCUS
} from './ui';
import { DeferredViewSection } from './DeferredViewSection';
import { HistoryTabState, HistoryNavigationTarget } from '../types/tabViewState';

const HistoryProgressionChart = React.lazy(() =>
  import('./HistoryProgressionChart').then((m) => ({ default: m.HistoryProgressionChart }))
);

interface HistoryViewProps {
  initialDate?: string | null;
  initialTarget?: HistoryNavigationTarget | null;
  onClearInitialDate?: () => void;
  savedState?: HistoryTabState;
  onSaveState?: (state: HistoryTabState) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ 
  initialDate,
  initialTarget,
  onClearInitialDate,
  savedState,
  onSaveState
}) => {
  const { deleteLog, addLog } = useFitness();
  const { sortedLogs, workoutMap, index, prEvents, getStrengthTrendForRange, getVolumeForRange } = useFitnessDerivedData();
  const { confirm } = useConfirm();

  // Restore lightweight preferences across tab changes
  const [search, setSearch] = useState(savedState?.search ?? '');
  const [expandedDate, setExpandedDate] = useState<string | null>(savedState?.expandedDate ?? null);
  const [selectedExKey, setSelectedExKey] = useState<string | null>(savedState?.selectedExKey ?? null); // Format: "YYYY-MM-DD_exerciseDefinitionId"
  
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editSessionState, setEditSessionState] = useState<SessionLog | null>(null);
  const [editVerified, setEditVerified] = useState(false);
  const [activeMonthTab, setActiveMonthTab] = useState<string | null>(savedState?.activeMonthTab ?? null);
  const [showMonthlyReports, setShowMonthlyReports] = useState<boolean>(Boolean(savedState?.activeMonthTab));
  const editVerifyCheckboxId = useId();
  const shouldReduceMotion = useReducedMotion();

  // Save lightweight state outside the view so preferences survive tab switches
  useEffect(() => {
    onSaveState?.({
      search,
      expandedDate,
      selectedExKey,
      activeMonthTab
    });
  }, [search, expandedDate, selectedExKey, activeMonthTab, onSaveState]);

  const consumedInitialTargetRef = useRef<string | null>(null);
  const pendingScrollSelectorRef = useRef<string | null>(null);

  const effectiveTarget: HistoryNavigationTarget | null = initialTarget ?? (initialDate ? { date: initialDate } : null);

  // Sync initial navigation target (date, logId, optional exerciseDefinitionId) once on arrival
  useEffect(() => {
    if (!effectiveTarget) {
      consumedInitialTargetRef.current = null;
      return;
    }

    const signature = [
      effectiveTarget.date ?? '',
      effectiveTarget.logId ?? '',
      effectiveTarget.exerciseDefinitionId ?? '',
      effectiveTarget.searchQuery ?? ''
    ].join('|');

    if (consumedInitialTargetRef.current === signature) {
      return;
    }
    consumedInitialTargetRef.current = signature;

    const matched =
      (effectiveTarget.logId ? sortedLogs.find(log => log.id === effectiveTarget.logId) : undefined) ||
      (effectiveTarget.date && effectiveTarget.exerciseDefinitionId
        ? sortedLogs.find(log => log.date === effectiveTarget.date && Boolean(log.sets?.[effectiveTarget.exerciseDefinitionId!]))
        : undefined) ||
      (effectiveTarget.date ? sortedLogs.find(log => log.date === effectiveTarget.date) : undefined);

    const resolvedSearch = effectiveTarget.searchQuery ?? matched?.date ?? effectiveTarget.date ?? effectiveTarget.logId ?? '';
    setSearch(resolvedSearch);

    const resolvedExpandedId = matched ? matched.id : (effectiveTarget.logId ?? effectiveTarget.date ?? null);
    setExpandedDate(resolvedExpandedId);

    const resolvedExKey =
      matched && effectiveTarget.exerciseDefinitionId
        ? `${matched.date}_${effectiveTarget.exerciseDefinitionId}`
        : null;
    setSelectedExKey(resolvedExKey);

    if (resolvedExKey) {
      pendingScrollSelectorRef.current = `[data-history-ex-key="${resolvedExKey}"]`;
    } else if (resolvedExpandedId) {
      pendingScrollSelectorRef.current = `[data-history-log-id="${resolvedExpandedId}"]`;
    }

    onClearInitialDate?.();
  }, [effectiveTarget, sortedLogs, onClearInitialDate]);

  useEffect(() => {
    const selector = pendingScrollSelectorRef.current;
    if (!selector || typeof window === 'undefined') return;
    const rafId = requestAnimationFrame(() => {
      const targetEl = document.querySelector(selector) as HTMLElement | null;
      if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
        const rect = targetEl.getBoundingClientRect();
        const y = Math.max(0, Math.round(rect.top + window.scrollY - 76));
        window.scrollTo({ top: y, behavior: shouldReduceMotion ? 'auto' : 'smooth' });
      }
      pendingScrollSelectorRef.current = null;
    });
    return () => cancelAnimationFrame(rafId);
  }, [expandedDate, selectedExKey, shouldReduceMotion]);

  // Group personal records by date once so session rows perform O(1) lookup
  const weightPRsByDate = React.useMemo(() => {
    const map = new Map<string, typeof index.weightPRs>();
    for (const pr of index.weightPRs || []) {
      const existing = map.get(pr.date);
      if (existing) {
        existing.push(pr);
      } else {
        map.set(pr.date, [pr]);
      }
    }
    return map;
  }, [index.weightPRs]);

  // Filter day sessions based on search with hoisted lowercase string
  const filteredSessions = React.useMemo(() => {
    const lowercaseSearch = search.trim().toLowerCase();
    if (!lowercaseSearch) return sortedLogs;

    return sortedLogs.filter(session => {
      const wo = workoutMap.get(session.workoutId);
      const workoutName = wo?.name || 'Session';
      
      const matchesDate = session.date.includes(lowercaseSearch);
      const matchesWorkout = workoutName.toLowerCase().includes(lowercaseSearch);
      const matchesId = session.id?.toLowerCase().includes(lowercaseSearch);
      
      // Also match if any of the completed exercises match the search via canonical ExerciseMeta
      const matchesExercises = Object.keys(session.sets).some(exId => {
        const meta = index.exerciseMetaById.get(exId);
        const exName = meta?.name || 'Deleted or Custom Exercise';
        return exName.toLowerCase().includes(lowercaseSearch);
      });

      return matchesDate || matchesWorkout || matchesExercises || matchesId;
    });
  }, [sortedLogs, workoutMap, search, index.exerciseMetaById]);

  const clearFilter = () => {
    setSearch('');
    setExpandedDate(null);
    setSelectedExKey(null);
    onClearInitialDate?.();
  };

  // Compile Month-End Growth Protocols and Peak Performances
  const monthlySummaries = React.useMemo(() => {
    const summaries: Record<string, {
      monthKey: string; // "YYYY-MM"
      monthName: string; // "June 2026"
      sessionsCount: number;
      totalDuration: number; // mins
      totalVolume: number; // kg volume
      prCount: number;
      peakLifts: Record<string, { exerciseName: string; weight: number }>; // exId -> lift details
      workoutsByType: Record<string, number>; // type -> count of completed runs
    }> = {};

    const completedLogs = sortedLogs.filter(isCompletedSession);

    // Group PR counts by month once with O(P) single pass
    const prCountsByMonth = new Map<string, number>();
    for (const pr of prEvents || []) {
      if (pr.monthKey) {
        prCountsByMonth.set(pr.monthKey, (prCountsByMonth.get(pr.monthKey) || 0) + 1);
      }
    }

    completedLogs.forEach(log => {
      const monthKey = log.date.substring(0, 7); // "YYYY-MM"
      if (!monthKey) return;

      const [year, month] = monthKey.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const monthName = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!summaries[monthKey]) {
        summaries[monthKey] = {
          monthKey,
          monthName,
          sessionsCount: 0,
          totalDuration: 0,
          totalVolume: 0,
          prCount: prCountsByMonth.get(monthKey) || 0,
          peakLifts: {},
          workoutsByType: { push: 0, pull: 0, legs: 0, custom: 0 }
        };
      }

      const summary = summaries[monthKey];
      summary.sessionsCount += 1;
      summary.totalDuration += log.durationMinutes || 0;

      const workout = workoutMap.get(log.workoutId);
      if (workout) {
        const type = workout.type || 'custom';
        summary.workoutsByType[type] = (summary.workoutsByType[type] || 0) + 1;
      }

      Object.entries(log.sets).forEach(([exId, sets]) => {
        const doneSets = (sets as SetLog[]).filter(s => s.done);
        if (doneSets.length === 0) return;

        const meta = index.exerciseMetaById.get(exId);
        const exerciseName = meta?.name || 'Deleted or Custom Exercise';
        const weights = doneSets.map(s => parseFloat(s.weight) || 0);
        const logMaxWeight = weights.length > 0 ? Math.max(...weights) : 0;

        if (logMaxWeight > 0) {
          if (!summary.peakLifts[exId] || logMaxWeight > summary.peakLifts[exId].weight) {
            summary.peakLifts[exId] = { exerciseName, weight: logMaxWeight };
          }
        }
      });
    });

    // Populate canonical monthly volume from canonical range volume selector
    Object.values(summaries).forEach(summary => {
      const [year, month] = summary.monthKey.split('-').map(Number);
      const lastDayOfCurMonth = new Date(year, month, 0).getDate();
      const monthStart = `${summary.monthKey}-01`;
      const monthEnd = `${summary.monthKey}-${String(lastDayOfCurMonth).padStart(2, '0')}`;
      summary.totalVolume = getVolumeForRange(monthStart, monthEnd);
    });

    return Object.values(summaries).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [sortedLogs, workoutMap, index.exerciseMetaById, prEvents, getVolumeForRange]);

  const latestMonthlySummary = React.useMemo(() => {
    if (monthlySummaries.length === 0) return null;
    return monthlySummaries.reduce((latest, candidate) => {
      const [ly, lm] = latest.monthKey.split('-').map(Number);
      const [cy, cm] = candidate.monthKey.split('-').map(Number);
      const latestTs = new Date(ly || 0, (lm || 1) - 1, 1).getTime();
      const candidateTs = new Date(cy || 0, (cm || 1) - 1, 1).getTime();
      return candidateTs > latestTs ? candidate : latest;
    }, monthlySummaries[0]);
  }, [monthlySummaries]);

  // Securely finalize edited log back to the Context store
  const handleSaveEdit = async () => {
    if (!editSessionState || !editingLogId) return;

    if (!editVerified) {
      await confirm({
        title: 'Verification Required',
        message: 'Please click the checkbox below to verify these alterations before confirming modifications.'
      });
      return;
    }

    const extremeSets: string[] = [];
    Object.entries(editSessionState.sets).forEach(([exId, sets]) => {
      const meta = index.exerciseMetaById.get(exId);
      const exName = meta?.name || 'Deleted or Custom Exercise';
      (sets as SetLog[]).forEach((s, idx) => {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps) || 0;
        if (w > 500 || r > 100) {
          extremeSets.push(`${exName} Set ${idx + 1}: ${s.weight}kg × ${s.reps} reps`);
        }
      });
    });

    if (extremeSets.length > 0) {
      const textLines = extremeSets.map(e => `• ${e}`).join('\n');
      const proceed = await confirm({
        title: 'Abnormal Tracking Warning',
        message: `Abnormally high parameters detected:\n${textLines}\n\nLifts exceeding 500kg or 100 reps are unusual. Proceed only if these are genuine, intentional data edits and NOT typos.`,
        isDanger: true
      });
      if (!proceed) return;
    }

    haptics.success();
    
    await addLog(editingLogId, editSessionState);
    
    setEditingLogId(null);
    setEditSessionState(null);
    setEditVerified(false);
  };

  return (
    <Stack spacing="xl" className="pt-4">
      {/* Upper header */}
      <SectionHeader
        eyebrow="Growth Protocol"
        eyebrowColor="orange"
        title="History"
        size="page"
      />

      {/* Search Bar */}
      <Input
        type="search"
        placeholder="Search date, routine or exercise…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search size={18} />}
        rightIcon={search ? (
          <Button 
            variant="ghost"
            size="icon"
            onClick={clearFilter}
            className="relative after:content-[''] after:absolute after:-inset-0.5 text-zinc-400 hover:text-white"
            aria-label="Clear filter"
            icon={<X size={14} />}
          />
        ) : undefined}
      />

      {initialDate && search === initialDate && (
        <Banner
          variant="warning"
          title={`Filtering history for target date: ${initialDate}`}
          onDismiss={clearFilter}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilter}
              className={cn(TYPOGRAPHY.eyebrow, "text-amber-400")}
            >
              Clear Filter
            </Button>
          }
        />
      )}

      {/* Monthly Training Analytics — Compact preview & expandable reports above archive */}
      {monthlySummaries.length > 0 && latestMonthlySummary && (
        <Section
          eyebrow="Month-End Summary Reports"
          eyebrowColor="zinc"
          title="Monthly Training Analytics"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeMonthTab && showMonthlyReports && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveMonthTab(null)}
                  className={cn(CONTROL_HEIGHT.touchTarget, "sm:min-h-[32px] sm:h-8 sm:min-w-0 whitespace-nowrap")}
                >
                  Close Report
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={showMonthlyReports}
                onClick={() => setShowMonthlyReports((prev) => !prev)}
                icon={<ChevronDown size={14} className={cn(TRANSITION.transform, showMonthlyReports && "rotate-180")} />}
                iconPosition="right"
                className={cn(CONTROL_HEIGHT.touchTarget, "sm:min-h-[32px] sm:h-8 sm:min-w-0 whitespace-nowrap")}
              >
                {showMonthlyReports ? 'Hide Monthly Reports' : `Monthly Reports (${monthlySummaries.length})`}
              </Button>
            </div>
          }
          padding="section"
        >
          {showMonthlyReports ? (
            <DeferredViewSection minHeight={150}>
              <div className="space-y-4">
                <div className={cn("flex overflow-x-auto pb-2 scrollbar-none snap-x pr-2", GAP.sm)}>
                  {monthlySummaries.map((summary) => {
                    const isSelected = activeMonthTab === summary.monthKey;
                    return (
                      <Card
                        key={summary.monthKey}
                        variant={isSelected ? 'selected' : 'interactive'}
                        surface={isSelected ? undefined : 'recessed'}
                        aria-pressed={isSelected}
                        onClick={() => {
                          haptics.selection();
                          setActiveMonthTab(isSelected ? null : summary.monthKey);
                        }}
                        padding="standard"
                        className="snap-start shrink-0 min-w-[172px] sm:min-w-[200px] min-h-[120px] sm:min-h-[132px] text-left relative overflow-hidden group cursor-pointer flex flex-col"
                      >
                        <div
                          className={cn(
                            TYPOGRAPHY.eyebrow,
                            "tabular-nums",
                            isSelected ? "text-orange-400" : "text-zinc-400 group-hover:text-zinc-300",
                            TRANSITION.colors
                          )}
                        >
                          {summary.monthKey}
                        </div>

                        <div className="mt-1 min-h-[2.25rem] flex items-start">
                          <div className="text-sm font-bold uppercase tracking-wide leading-tight text-white break-words">
                            {summary.monthName}
                          </div>
                        </div>

                        <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                          <span className={cn(TYPOGRAPHY.label, "min-w-0 break-words")}>
                            Completed Runs
                          </span>

                          <span className="shrink-0 text-lg font-mono font-bold tabular-nums text-white">
                            {summary.sessionsCount}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {activeMonthTab && (() => {
                    const selectedReport = monthlySummaries.find(m => m.monthKey === activeMonthTab);
                    if (!selectedReport) return null;

                    const [curYear, curMonth] = selectedReport.monthKey.split('-').map(Number);
                    const prevMonthDate = new Date(curYear, curMonth - 2, 1);
                    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
                    const prevMonthName = prevMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const prevReport = monthlySummaries.find(m => m.monthKey === prevMonthKey);

                    const earliestMonthKey = monthlySummaries.length > 0
                      ? monthlySummaries[monthlySummaries.length - 1].monthKey
                      : selectedReport.monthKey;
                    const hasEarlierHistory = prevMonthKey >= earliestMonthKey;

                    const currentSessions = selectedReport.sessionsCount;
                    let sessionsTrendText = 'First recorded month';
                    let sessionsTrendDir: 'positive' | 'negative' | 'neutral' = 'neutral';
                    let sessionsSublabel: string | undefined = undefined;

                    if (prevReport) {
                      const sDiff = currentSessions - prevReport.sessionsCount;
                      sessionsTrendText = sDiff > 0 ? `+${sDiff} vs prev month` : sDiff < 0 ? `${sDiff} vs prev month` : `Equal vs prev month`;
                      sessionsTrendDir = sDiff > 0 ? 'positive' : sDiff < 0 ? 'negative' : 'neutral';
                      sessionsSublabel = `${prevReport.sessionsCount} in ${prevReport.monthName.split(' ')[0]}`;
                    } else if (hasEarlierHistory) {
                      sessionsTrendText = currentSessions > 0 ? `+${currentSessions} vs prev month` : `Equal vs prev month`;
                      sessionsTrendDir = currentSessions > 0 ? 'positive' : 'neutral';
                      sessionsSublabel = `0 in ${prevMonthName.split(' ')[0]}`;
                    }

                    const currentVolume = selectedReport.totalVolume;
                    let volumeTrendText = 'First recorded month';
                    let volumeTrendDir: 'positive' | 'negative' | 'neutral' = 'neutral';

                    if (prevReport && prevReport.totalVolume > 0) {
                      const vPct = ((currentVolume - prevReport.totalVolume) / prevReport.totalVolume) * 100;
                      const roundedVPct = Math.round(vPct * 10) / 10;
                      volumeTrendText = roundedVPct > 0 ? `+${roundedVPct}% vs prev month` : `${roundedVPct}% vs prev month`;
                      volumeTrendDir = roundedVPct > 0 ? 'positive' : roundedVPct < 0 ? 'negative' : 'neutral';
                    } else if (prevReport || hasEarlierHistory) {
                      volumeTrendText = currentVolume > 0 ? `+${Math.round(currentVolume)}kg (0 prev)` : 'Equal vs prev month';
                      volumeTrendDir = currentVolume > 0 ? 'positive' : 'neutral';
                    }

                    const currentMonthPRs = (prEvents || []).filter(e => e.monthKey === selectedReport.monthKey);
                    const prevMonthPRs = prevReport ? (prEvents || []).filter(e => e.monthKey === prevMonthKey) : [];
                    let prTrendText = 'First recorded month';
                    let prTrendDir: 'positive' | 'negative' | 'neutral' = 'neutral';
                    let prSublabel: string | undefined = undefined;

                    if (prevReport) {
                      const prDiff = currentMonthPRs.length - prevMonthPRs.length;
                      prTrendText = prDiff > 0 ? `+${prDiff} vs prev month` : prDiff < 0 ? `${prDiff} vs prev month` : `Equal vs prev month`;
                      prTrendDir = prDiff > 0 ? 'positive' : prDiff < 0 ? 'negative' : 'neutral';
                      prSublabel = `${prevMonthPRs.length} in ${prevReport.monthName.split(' ')[0]}`;
                    } else if (hasEarlierHistory) {
                      prTrendText = currentMonthPRs.length > 0 ? `+${currentMonthPRs.length} vs prev month` : `Equal vs prev month`;
                      prTrendDir = currentMonthPRs.length > 0 ? 'positive' : 'neutral';
                      prSublabel = `0 in ${prevMonthName.split(' ')[0]}`;
                    }

                    const lastDayOfCurMonth = new Date(curYear, curMonth, 0).getDate();
                    const curStart = `${selectedReport.monthKey}-01`;
                    const curEnd = `${selectedReport.monthKey}-${String(lastDayOfCurMonth).padStart(2, '0')}`;

                    const lastDayOfPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
                    const prevStart = `${prevMonthKey}-01`;
                    const prevEnd = `${prevMonthKey}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;

                    const monthlyStrengthTrend = getStrengthTrendForRange(
                      { start: curStart, end: curEnd },
                      { start: prevStart, end: prevEnd }
                    );

                    const strengthChange = monthlyStrengthTrend.percentChange;
                    const strengthTrendText = monthlyStrengthTrend.comparableExercises > 0
                      ? `${monthlyStrengthTrend.comparableExercises} lift${monthlyStrengthTrend.comparableExercises > 1 ? 's' : ''} compared`
                      : undefined;
                    const strengthTrendDir: 'positive' | 'negative' | 'neutral' =
                      strengthChange !== null && strengthChange > 0 ? 'positive' : strengthChange !== null && strengthChange < 0 ? 'negative' : 'neutral';

                    const totalWorkouts = (Object.values(selectedReport.workoutsByType) as number[]).reduce((a, b) => a + b, 0);

                    const durationHours = Math.floor(selectedReport.totalDuration / 60);
                    const durationMins = selectedReport.totalDuration % 60;
                    const avgDuration = selectedReport.sessionsCount > 0
                      ? Math.round(selectedReport.totalDuration / selectedReport.sessionsCount)
                      : 0;

                    return (
                      <motion.div
                        initial={shouldReduceMotion ? false : MOTION_CONFIG.collapse.initial}
                        animate={shouldReduceMotion ? { opacity: 1 } : MOTION_CONFIG.collapse.animate}
                        exit={shouldReduceMotion ? { opacity: 0 } : MOTION_CONFIG.collapse.exit}
                        transition={shouldReduceMotion ? { duration: 0 } : MOTION_CONFIG.collapse.transition}
                        className={cn(SURFACE.recessed, BORDER.standard, RADIUS.card, SPACING.section, "border space-y-6 overflow-hidden text-zinc-200")}
                      >
                        <Grid cols={2} gap="md">
                          <StatCard
                            label="Sessions"
                            value={currentSessions}
                            accent="zinc"
                            trend={sessionsTrendText}
                            trendDirection={sessionsTrendDir}
                            sublabel={sessionsSublabel}
                          />
                          <StatCard
                            label="Window Volume"
                            value={currentVolume}
                            unit="kg"
                            formatValue={formatCompactWeight}
                            accent="zinc"
                            trend={volumeTrendText}
                            trendDirection={volumeTrendDir}
                          />
                          <StatCard
                            label="PRs"
                            value={currentMonthPRs.length}
                            accent={currentMonthPRs.length > 0 ? "orange" : "zinc"}
                            icon={Trophy}
                            trend={prTrendText}
                            trendDirection={prTrendDir}
                            sublabel={prSublabel}
                          />
                          <StatCard
                            label="Strength Progress"
                            value={monthlyStrengthTrend.percentChange}
                            unit="%"
                            formatValue={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}`}
                            accent={
                              strengthChange !== null
                                ? strengthChange > 0
                                  ? 'emerald'
                                  : strengthChange < 0
                                  ? 'red'
                                  : 'zinc'
                                : 'zinc'
                            }
                            icon={Sparkles}
                            trend={strengthTrendText}
                            trendDirection={strengthTrendDir}
                            isUnavailable={monthlyStrengthTrend.percentChange === null}
                            unavailableLabel="No Overlap"
                            sublabel={
                              monthlyStrengthTrend.percentChange !== null
                                ? 'vs previous month'
                                : (monthlyStrengthTrend.comparableExercises > 0
                                  ? `Confidence: ${monthlyStrengthTrend.confidence}`
                                  : hasEarlierHistory
                                  ? 'No matching lifts vs prev'
                                  : 'First recorded month')
                            }
                          />
                        </Grid>

                        <div className={cn("flex flex-wrap items-center justify-between gap-4 p-3 border text-xs font-mono", RADIUS.card, SURFACE.subtle, BORDER.standard)}>
                          <div className="flex items-center gap-2 text-zinc-300">
                            <Clock size={15} className="text-orange-400" />
                            <span>Total Time Trained:</span>
                            <span className="font-bold text-white">
                              {durationHours > 0 ? `${durationHours}h ${durationMins}m` : `${durationMins}m`} ({selectedReport.totalDuration} mins)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-zinc-400">
                            <span>Average Session Duration:</span>
                            <span className="font-bold text-zinc-200">{avgDuration} mins</span>
                          </div>
                        </div>

                        <Grid cols={1} colsMd={2} gap="lg" className={cn("pt-2 border-t", BORDER.standard)}>
                          <div className="space-y-3">
                            <h4 className={cn(TYPOGRAPHY.label, "font-bold")}>Training Plan Coverage</h4>
                            <div className="space-y-2.5">
                              {(Object.entries(selectedReport.workoutsByType) as [string, number][]).map(([type, count]) => {
                                const percentage = totalWorkouts ? Math.round((count / totalWorkouts) * 100) : 0;
                                return count > 0 ? (
                                  <div key={type} className="space-y-1">
                                    <div className="flex justify-between items-center text-xs font-mono">
                                      <span className="uppercase font-bold text-zinc-400">{type} Protocol</span>
                                      <span className="text-zinc-400">{count} workouts ({percentage}%)</span>
                                    </div>
                                    <ProgressBar
                                      value={percentage}
                                      max={100}
                                      colorOverride={(type && getAccentColor(type as WorkoutType)) || getAccentColor('zinc') || SEMANTIC_COLORS.zinc}
                                      aria-label={`${type} protocol coverage: ${percentage}%`}
                                      className="border-0"
                                    />
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className={cn(TYPOGRAPHY.label, "font-bold")}>Month Peak Lifts Achievements</h4>
                            <div
                              tabIndex={0}
                              role="region"
                              aria-label="Month peak lifts achievements"
                              className={cn("space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1", RADIUS.button, FOCUS.visible)}
                            >
                              {Object.keys(selectedReport.peakLifts).length === 0 ? (
                                <div className="text-xs text-zinc-400 italic font-mono pt-4 text-center">No heavy lifts recorded this month.</div>
                              ) : (
                                (Object.entries(selectedReport.peakLifts) as [string, { exerciseName: string; weight: number }][]).map(([exId, lift]) => (
                                  <div key={exId} className={cn("flex justify-between items-center gap-3 p-2 border text-xs text-zinc-300", RADIUS.button, SURFACE.subtle, BORDER.standard)}>
                                    <span className="min-w-0 flex-1 break-words font-medium">{lift.exerciseName}</span>
                                    <Badge label={`${lift.weight}kg`} color="orange" variant="subtle" className="shrink-0" />
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </Grid>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>
            </DeferredViewSection>
          ) : (
            <div
              data-testid="latest-month-preview"
              className={cn(
                "border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                SURFACE.recessed,
                BORDER.standard,
                RADIUS.card
              )}
            >
              <div className="space-y-0.5 min-w-0">
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400 block")}>
                  Latest Month · {latestMonthlySummary.monthName}
                </span>
                <p className={cn(TYPOGRAPHY.bodySecondary, "text-zinc-400")}>
                  {monthlySummaries.length} recorded {monthlySummaries.length === 1 ? 'month' : 'months'} available
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-5 tabular-nums shrink-0">
                <div>
                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-400 block")}>Sessions</span>
                  <span className="font-mono text-sm sm:text-base font-bold text-white">
                    {latestMonthlySummary.sessionsCount}
                  </span>
                </div>
                <div>
                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-400 block")}>Volume</span>
                  <span className="font-mono text-sm sm:text-base font-bold text-emerald-400">
                    {formatCompactWeight(latestMonthlySummary.totalVolume)}
                    <span className="text-xs font-normal text-zinc-400 ml-0.5">kg</span>
                  </span>
                </div>
                <div>
                  <span className={cn(TYPOGRAPHY.micro, "text-zinc-400 block")}>PRs</span>
                  <span className="font-mono text-sm sm:text-base font-bold text-orange-400">
                    {latestMonthlySummary.prCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Main Days Drill Down Hierarchy — Chronological Archive */}
      <Section
        eyebrow="Chronological Archive"
        eyebrowColor="zinc"
        title="Training Sessions"
        padding="none"
      >
        {filteredSessions.length === 0 ? (
          sortedLogs.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No Workouts Logged Yet"
              description="Complete a training session from the Dashboard to start building your training logbook."
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No Matching Sessions"
              description={`No logged workouts match "${search.trim()}". Try clearing filters or searching another exercise or date.`}
              action={{ label: 'Clear Filters', onClick: clearFilter }}
            />
          )
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session, sIdx) => {
              const workout = workoutMap.get(session.workoutId);
              const completedSets = getCompletedSets(session);
              const totalSets = completedSets.length;
              const vol = calculateSetsVolume(completedSets);
              const color = (workout?.type && getAccentColor(workout.type as WorkoutType)) || getAccentColor('zinc') || SEMANTIC_COLORS.zinc;
              const isExpanded = expandedDate === session.id;
              const sessionPRs = weightPRsByDate.get(session.date) || [];

              const detailPanelId = `history-session-panel-${session.id || sIdx}`;

              return (
                <Card
                  key={session.id ? `session-${session.id}-${sIdx}` : `session-${sIdx}`}
                  data-history-log-id={session.id}
                  variant="standard"
                  surface={isExpanded ? "subtle" : undefined}
                  accent={isExpanded ? "orange" : undefined}
                  accentVariant={isExpanded ? "left" : undefined}
                  padding="none"
                  className="overflow-hidden"
                >
                  {/* 1. Days list bar: native expandable summary trigger + sibling actions */}
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.light();
                        setExpandedDate(isExpanded ? null : session.id);
                      }}
                      aria-expanded={isExpanded}
                      aria-controls={detailPanelId}
                      className={cn(
                        "flex-1 min-w-0 text-left flex items-center justify-between gap-3 p-1.5 -m-1.5 hover:bg-zinc-800/30",
                        CONTROL_HEIGHT.touchTarget,
                        RADIUS.button,
                        TRANSITION.colors,
                        FOCUS.visible
                      )}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className={cn(TYPOGRAPHY.label, "text-zinc-400 font-bold tabular-nums")}>
                            {session.date}
                          </span>
                        </div>
                        <h3 className={cn(TYPOGRAPHY.titleSubsection, "text-white break-words")}>
                          {workout?.name || 'Custom Protocol'}
                        </h3>
                        <div className={cn(TYPOGRAPHY.metadata, "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-zinc-400 normal-case tabular-nums")}>
                          <div className="flex items-center gap-1">
                            <Clock size={13} className="text-zinc-500 shrink-0" /> {session.durationMinutes || 0} min
                          </div>
                          <span aria-hidden="true">·</span>
                          <div className="flex items-center gap-1">
                            <Dumbbell size={13} className="text-zinc-500 shrink-0" /> {totalSets} sets
                          </div>
                          {vol > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <div>
                                Volume: <span className="text-emerald-400 font-bold">{vol.toLocaleString()}kg</span>
                              </div>
                            </>
                          )}
                          {sessionPRs.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <div className="flex items-center gap-1 text-orange-400 font-bold">
                                <Trophy size={12} className="shrink-0 text-orange-400" />
                                <span>{sessionPRs.length} PR{sessionPRs.length > 1 ? 's' : ''}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <span
                        aria-hidden="true"
                        className={cn("w-8 h-8 rounded-full border flex items-center justify-center text-zinc-400 shrink-0", SURFACE.recessed, BORDER.standard)}
                      >
                        <ChevronRight 
                          size={16} 
                          className={cn(TRANSITION.transform, isExpanded && "rotate-90 text-orange-500")} 
                        />
                      </span>
                    </button>

                    <div className={cn("flex items-center justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0", BORDER.subtle)}>
                      <Button
                        variant={editingLogId === session.id ? "primary" : "secondary"}
                        size="icon"
                        icon={<Edit2 size={14} />}
                        onClick={() => {
                          setEditingLogId(session.id);
                          setEditSessionState(JSON.parse(JSON.stringify(session)));
                          setEditVerified(false);
                          setExpandedDate(session.id);
                        }}
                        className="relative after:content-[''] after:absolute after:-inset-1"
                        title="Edit session logs"
                        aria-label="Edit session logs"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        icon={<Trash2 size={14} />}
                        onClick={async () => {
                          const proceed = await confirm({
                            title: 'Delete Workout Log',
                            message: 'Permanently delete this workout log from history? This cannot be undone.',
                            isDanger: true
                          });
                          if (proceed) {
                            haptics.warning();
                            await deleteLog(session.id);
                          }
                        }}
                        title="Purge session"
                        aria-label="Purge session"
                        className="relative after:content-[''] after:absolute after:-inset-0.5 hover:text-red-400"
                      />
                    </div>
                  </div>

                {/* 2. Exercises Drop Down / Secure Drawer Editor (if Selected Day is expanded) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      id={detailPanelId}
                      initial={shouldReduceMotion ? false : MOTION_CONFIG.collapse.initial}
                      animate={shouldReduceMotion ? { opacity: 1 } : MOTION_CONFIG.collapse.animate}
                      exit={shouldReduceMotion ? { opacity: 0 } : MOTION_CONFIG.collapse.exit}
                      transition={shouldReduceMotion ? { duration: 0 } : MOTION_CONFIG.collapse.transition}
                      className={cn("border-t p-4 sm:p-6 space-y-4", BORDER.standard, SURFACE.recessed)}
                    >
                      {editingLogId === session.id && editSessionState ? (
                        <div className="space-y-6 text-zinc-300">
                          {/* Editor Header */}
                          <div className={cn("flex justify-between items-center p-4 border", SURFACE.subtle, BORDER.standard, RADIUS.card)}>
                            <div className="space-y-1">
                              <span className={cn(TYPOGRAPHY.eyebrow, "text-orange-400 block")}>Editing Historical Session</span>
                              <h4 className={cn(TYPOGRAPHY.titleSubsection, "text-sm text-white")}>Edit Session Logs</h4>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              icon={<X size={16} />}
                              onClick={() => {
                                setEditingLogId(null);
                                setEditSessionState(null);
                                setEditVerified(false);
                              }}
                              className="relative after:content-[''] after:absolute after:-inset-0.5"
                              aria-label="Close session editor"
                              title="Close session editor"
                            />
                          </div>

                          {/* 1. Duration field */}
                          <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border", SURFACE.subtle, BORDER.standard, RADIUS.card)}>
                            <div>
                              <label className={cn(TYPOGRAPHY.label, "block")}>Session Duration</label>
                              <span className="text-xs text-zinc-400 font-sans">Total elapsed active protocol duration</span>
                            </div>
                            <div className="w-32">
                              <Input
                                type="number"
                                size="sm"
                                suffix="min"
                                value={editSessionState.durationMinutes}
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  if (rawVal === '') {
                                    setEditSessionState(prev => prev ? { ...prev, durationMinutes: 0 } : null);
                                    return;
                                  }
                                  let val = parseInt(rawVal) || 0;
                                  if (val < 0) val = 0;
                                  if (val > 600) val = 600;
                                  setEditSessionState(prev => prev ? { ...prev, durationMinutes: val } : null);
                                }}
                                className="text-center font-mono"
                              />
                            </div>
                          </div>

                          {/* Sets list per exercise */}
                          <div className="space-y-6">
                            {Object.entries(editSessionState.sets).map(([exId, sets]) => {
                              const meta = index.exerciseMetaById.get(exId);
                              const exName = meta?.name || 'Deleted or Custom Exercise';
                              return (
                                <div key={exId} className={cn("border p-3 sm:p-5 space-y-4 text-zinc-300", SURFACE.subtle, BORDER.standard, RADIUS.card)}>
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                                    <h5 className={cn(TYPOGRAPHY.titleSubsection, "text-xs sm:text-sm text-white")}>{exName}</h5>
                                  </div>

                                  <div className={cn("grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_44px] gap-1.5 sm:grid-cols-[36px_1fr_1fr_44px] sm:gap-2.5 items-center", TYPOGRAPHY.eyebrow, "text-zinc-400")}>
                                    <span className="text-center font-bold">Set</span>
                                    <span className="text-center font-bold">Weight (KG)</span>
                                    <span className="text-center font-bold">Reps</span>
                                    <span className="text-center font-bold">Del</span>
                                  </div>

                                  <div className="space-y-2.5">
                                    {(sets as SetLog[]).map((s, idx) => {
                                      const isExtremeW = (parseFloat(s.weight) || 0) > 500;
                                      const isExtremeR = (parseInt(s.reps) || 0) > 100;
                                      const isSetExtreme = isExtremeW || isExtremeR;

                                      return (
                                        <div key={s.id ? `edit-set-${s.id}-${idx}` : `edit-set-${exId}-${idx}`} className="space-y-1.5">
                                          <div className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_44px] gap-1.5 sm:grid-cols-[36px_1fr_1fr_44px] sm:gap-2.5 items-center">
                                            <span className="font-mono text-xs text-zinc-400 text-center font-bold tabular-nums">{idx + 1}</span>
                                            {/* specialized table/matrix input for historical set weight */}
                                            <Input
                                              type="number"
                                              variant="standard"
                                              size="md"
                                              placeholder="0"
                                              value={s.weight}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (val.length > 6) return;
                                                setEditSessionState(prev => {
                                                  if (!prev) return null;
                                                  const newSets = { ...prev.sets };
                                                  newSets[exId] = (newSets[exId] as SetLog[]).map((curS, curI) => 
                                                    curI === idx ? { ...curS, weight: val } : curS
                                                  );
                                                  return { ...prev, sets: newSets };
                                                });
                                              }}
                                              aria-label={`Set ${idx + 1} weight`}
                                              className={cn(
                                                "text-center text-xs",
                                                isExtremeW && "border-amber-500 text-amber-400 font-bold"
                                              )}
                                            />
                                            {/* specialized table/matrix input for historical set reps */}
                                            <Input
                                              type="number"
                                              variant="standard"
                                              size="md"
                                              placeholder="0"
                                              value={s.reps}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                if (val.length > 4 || !/^\d*$/.test(val)) return;
                                                setEditSessionState(prev => {
                                                  if (!prev) return null;
                                                  const newSets = { ...prev.sets };
                                                  newSets[exId] = (newSets[exId] as SetLog[]).map((curS, curI) => 
                                                    curI === idx ? { ...curS, reps: val } : curS
                                                  );
                                                  return { ...prev, sets: newSets };
                                                });
                                              }}
                                              aria-label={`Set ${idx + 1} reps`}
                                              className={cn(
                                                "text-center text-xs",
                                                isExtremeR && "border-amber-500 text-amber-400 font-bold"
                                              )}
                                            />
                                            <div className="flex items-center justify-center">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                icon={<X size={14} />}
                                                onClick={() => {
                                                  setEditSessionState(prev => {
                                                    if (!prev) return null;
                                                    const newSets = { ...prev.sets };
                                                    newSets[exId] = (newSets[exId] as SetLog[]).filter((_, curI) => curI !== idx);
                                                    return { ...prev, sets: newSets };
                                                  });
                                                }}
                                                className="relative after:content-[''] after:absolute after:-inset-0.5 hover:text-red-400"
                                                aria-label="Remove set"
                                                title="Remove set"
                                              />
                                            </div>
                                          </div>

                                          {/* Set-Level Warning */}
                                          {isSetExtreme && (
                                            <div className={cn("ml-9 p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400", RADIUS.button, TYPOGRAPHY.micro)}>
                                              ⚠️ Unusual volume bounds: {isExtremeW ? 'Weight exceeds 500kg.' : ''} {isExtremeR ? 'Reps exceed 100.' : ''} Check typographical mistakes.
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    fullWidth
                                    icon={<Plus size={13} />}
                                    onClick={() => {
                                      setEditSessionState(prev => {
                                        if (!prev) return null;
                                        const newSets = { ...prev.sets };
                                        newSets[exId] = [...(newSets[exId] as SetLog[] || []), { id: generateId(), weight: '', reps: '', done: true }];
                                        return { ...prev, sets: newSets };
                                      });
                                    }}
                                    className="py-2.5 border-dashed"
                                  >
                                    Add Set
                                  </Button>
                                </div>
                              );
                            })}
                          </div>

                          {/* Dynamic Safeguard: Verification Checkbox */}
                          <div className={cn("p-3 sm:p-4 border text-zinc-300", SURFACE.recessed, BORDER.standard, RADIUS.card)}>
                            <label
                              htmlFor={editVerifyCheckboxId}
                              className={cn("flex items-center gap-3 cursor-pointer text-xs select-none", CONTROL_HEIGHT.touchTarget)}
                            >
                              <input
                                id={editVerifyCheckboxId}
                                type="checkbox"
                                checked={editVerified}
                                onChange={(e) => setEditVerified(e.target.checked)}
                                className="shrink-0 rounded border-zinc-700 bg-zinc-950 text-orange-500 focus:ring-orange-500 w-5 h-5 cursor-pointer"
                              />
                              <span>
                                I verify that these data alterations are <strong className="text-white">intentional, accurate, and correct</strong>. I want to sync updates securely to my history archives.
                              </span>
                            </label>
                          </div>

                          <div className="flex items-center gap-3">
                            <Button
                              variant="primary"
                              size="lg"
                              fullWidth
                              disabled={!editVerified}
                              onClick={handleSaveEdit}
                            >
                              Confirm Modifications
                            </Button>
                            <Button
                              variant="outline"
                              size="lg"
                              onClick={() => {
                                setEditingLogId(null);
                                setEditSessionState(null);
                                setEditVerified(false);
                              }}
                            >
                              Discard
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>
                            Completed Exercises · Select one to view historical timeline
                          </div>

                          <div className="space-y-3">
                        {Object.entries(session.sets).map(([exId, sets]) => {
                          const meta = index.exerciseMetaById.get(exId);
                          const exerciseName = meta?.name || 'Deleted or Custom Exercise';
                          const doneSets = (sets as SetLog[]).filter(s => s.done);
                          if (doneSets.length === 0) return null;

                          const exKey = `${session.date}_${exId}`;
                          const isSelected = selectedExKey === exKey;
                          const exPanelId = `history-ex-panel-${session.id || sIdx}-${exId}`;

                          // Canonical PR calculation directly from canonical index
                          const historyLogs = index.exerciseIndex.get(exId)?.sessions || [];
                          const canonicalPR = index.exerciseIndex.get(exId)?.weightPR;
                          const prWeight = canonicalPR?.weight ?? (index.exerciseIndex.get(exId)?.maxWeight ?? (historyLogs.length > 0 ? Math.max(...historyLogs.map(h => h.maxW)) : 0));
                          const oldestPrDate = canonicalPR?.date ?? (prWeight > 0 ? historyLogs.slice().reverse().find(h => h.maxW === prWeight)?.date : null);
                          const isSessionPR = sessionPRs.some(pr => pr.exerciseDefinitionId === exId);
                          const currentMaxWeight = Math.max(...doneSets.map(s => parseFloat(s.weight) || 0));
                          const exColor = (workout?.type && getAccentColor(workout.type as WorkoutType)) || getAccentColor('zinc') || SEMANTIC_COLORS.zinc;

                          return (
                            <div
                              key={exId}
                              data-history-ex-key={exKey}
                              className={cn("border overflow-hidden", BORDER.standard, RADIUS.card, SURFACE.subtle)}
                            >
                              <button
                                type="button"
                                aria-expanded={isSelected}
                                aria-controls={exPanelId}
                                onClick={() => {
                                  haptics.selection();
                                  setSelectedExKey(isSelected ? null : exKey);
                                }}
                                className={cn(
                                  "w-full text-left p-4 pr-12 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/40 cursor-pointer relative",
                                  CONTROL_HEIGHT.touchTarget,
                                  TRANSITION.colors,
                                  FOCUS.visible,
                                  isSelected && "bg-zinc-800/30"
                                )}
                              >
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span 
                                      className="w-1.5 h-1.5 rounded-full shrink-0" 
                                      style={{ backgroundColor: exColor }} 
                                    />
                                    <h4 className="font-bold text-zinc-200 text-sm tracking-wide break-words">
                                      {exerciseName}
                                    </h4>
                                  </div>
                                  <div className={cn("flex flex-wrap items-center gap-2", TYPOGRAPHY.label, "text-zinc-400 tabular-nums")}>
                                    <span>{doneSets.length} sets logged</span>
                                    {isSessionPR && (
                                      <span className="text-orange-400 font-bold flex items-center gap-1">
                                        <Trophy size={10} className="shrink-0" /> PR SET
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 self-start sm:self-auto shrink-0">
                                  {currentMaxWeight > 0 && (
                                    <div className={cn("px-2.5 py-1 border text-zinc-300 tabular-nums", SURFACE.recessed, BORDER.standard, RADIUS.button, TYPOGRAPHY.metadata)}>
                                      Peak Today: <span className="text-white font-bold">{currentMaxWeight}kg</span>
                                    </div>
                                  )}
                                  <ChevronRight 
                                    size={14} 
                                    aria-hidden="true"
                                    className={cn("text-zinc-500 absolute right-4 top-1/2 -translate-y-1/2", TRANSITION.transform, isSelected && "rotate-90")} 
                                    style={isSelected ? { color: exColor } : undefined}
                                  />
                                </div>
                              </button>

                              {/* 3. Single Exercise All-Time Records & PR Highlight (nested) */}
                              <AnimatePresence>
                                {isSelected && (
                                  <motion.div
                                    id={exPanelId}
                                    initial={shouldReduceMotion ? false : MOTION_CONFIG.collapse.initial}
                                    animate={shouldReduceMotion ? { opacity: 1 } : MOTION_CONFIG.collapse.animate}
                                    exit={shouldReduceMotion ? { opacity: 0 } : MOTION_CONFIG.collapse.exit}
                                    transition={shouldReduceMotion ? { duration: 0 } : MOTION_CONFIG.collapse.transition}
                                    className={cn("border-t p-4 sm:p-5 space-y-4", BORDER.standard, SURFACE.recessed)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <Trophy size={12} className="shrink-0 text-orange-400" />
                                        <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400")}>Progressive Benchmark</span>
                                      </div>
                                      {prWeight > 0 && (
                                        <Badge
                                          label={`Lifetime PR: ${prWeight}kg${canonicalPR?.reps ? ` × ${canonicalPR.reps}` : ''}`}
                                          color="orange"
                                          variant="subtle"
                                          size="sm"
                                          dot={false}
                                        />
                                      )}
                                    </div>

                                    {/* Progression Line Chart using Recharts (lazy-loaded on panel expand) */}
                                    {prWeight > 0 && historyLogs.length > 1 && (
                                      <Suspense
                                        fallback={
                                          <div
                                            className={cn("h-32 w-full pt-1 border flex items-center justify-center", SURFACE.recessed, BORDER.subtle, RADIUS.card)}
                                            aria-busy="true"
                                          >
                                            <div className="w-5 h-5 border-2 border-zinc-800 border-t-orange-500 rounded-full motion-safe:animate-spin [animation-duration:1s]" />
                                          </div>
                                        }
                                      >
                                        <HistoryProgressionChart exerciseName={exerciseName} historyLogs={historyLogs} />
                                      </Suspense>
                                    )}

                                    {/* Times Done Timeline Logs (with PRs highlighted) */}
                                    <div className="space-y-2">
                                      <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400 block")}>History Progression Logs (Latest First)</span>
                                      <div
                                        tabIndex={0}
                                        role="region"
                                        aria-label="History progression logs"
                                        className={cn("space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1", RADIUS.button, FOCUS.visible)}
                                      >
                                        {historyLogs.map((h, hIdx) => {
                                          const isPR = prWeight > 0 && h.maxW === prWeight && h.date === oldestPrDate;

                                          return (
                                            <div 
                                              key={hIdx}
                                              className={cn(
                                                "flex items-center justify-between p-2.5 border text-xs",
                                                TRANSITION.colors,
                                                RADIUS.card,
                                                isPR 
                                                  ? cn(SEMANTIC_PALETTE.orange.compound, "font-bold")
                                                  : SEMANTIC_PALETTE.zinc.compound
                                              )}
                                            >
                                              <div className="flex items-center gap-2">
                                                <span className={cn(TYPOGRAPHY.metadata, "text-zinc-400")}>{h.date}</span>
                                                {isPR && (
                                                  <Badge label="PR PEAK" color="orange" size="sm" dot={false} />
                                                )}
                                              </div>

                                              <div className="flex items-center gap-3">
                                                <div className="flex gap-1 flex-wrap">
                                                  {h.sets.map((s, sIdx) => (
                                                    <span key={sIdx} className={cn("bg-zinc-950 px-1.5 py-0.5 border text-zinc-400", BORDER.standard, RADIUS.badge, TYPOGRAPHY.micro)}>
                                                      {s.weight ? `${s.weight}kg×${s.reps}` : `${s.reps}r`}
                                                    </span>
                                                  ))}
                                                </div>
                                                <div className={cn("font-mono font-bold text-xs shrink-0", isPR ? "text-orange-400" : "text-zinc-200")}>
                                                  {h.maxW > 0 ? `${h.maxW}kg` : 'Done'}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
              </Card>
            );
          })}
          </div>
        )}
      </Section>
    </Stack>
  );
};
