import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, ChevronRight, Trophy, Trash2, Clock, Dumbbell, X, Calendar, Edit2, Plus, Sparkles } from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { useConfirm } from '../store/ConfirmContext';
import { WORKOUT_COLORS, calculateVolume, generateId } from '../utils/fitnessHelpers';
import { SessionLog, SetLog } from '../types/fitness';
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
  SEMANTIC_COLORS,
  RADIUS
} from './ui';

interface HistoryViewProps {
  initialDate?: string | null;
  onClearInitialDate?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ initialDate, onClearInitialDate }) => {
  const { logs, workouts, deleteLog, addLog } = useFitness();
  const { confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [selectedExKey, setSelectedExKey] = useState<string | null>(null); // Format: "YYYY-MM-DD_exerciseId"
  
  // Custom states for Month-End reports and secure inline log editing
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editSessionState, setEditSessionState] = useState<SessionLog | null>(null);
  const [editVerified, setEditVerified] = useState(false);
  const [activeMonthTab, setActiveMonthTab] = useState<string | null>(null);

  // Sync initialDate search and auto-expand it if provided
  useEffect(() => {
    if (initialDate) {
      setSearch(initialDate);
      const matched = Object.entries(logs).find(([_, log]) => (log as SessionLog).date === initialDate);
      if (matched) {
        setExpandedDate(matched[0]);
      } else {
        setExpandedDate(initialDate);
      }
    }
  }, [initialDate, logs]);

  // Find workout metadata for each exercise mapping exercise ID to details
  const exMeta = React.useMemo(() => {
    const meta: Record<string, { name: string; type: string; workoutName: string }> = {};
    workouts.forEach(wo => {
      wo.exercises.forEach(ex => {
        meta[ex.id] = { name: ex.name, type: wo.type, workoutName: wo.name };
      });
    });
    return meta;
  }, [workouts]);

  // Group logs by exercise - MEMOIZED for PR mapping
  const exerciseHistory = React.useMemo(() => {
    const history: Record<string, any[]> = {};
    (Object.values(logs) as SessionLog[]).forEach(log => {
      Object.entries(log.sets).forEach(([exId, sets]) => {
        const doneSets = (sets as SetLog[]).filter(s => s.done);
        if (doneSets.length > 0) {
          const weights = doneSets.map(s => parseFloat(s.weight) || 0);
          const maxW = weights.length > 0 ? Math.max(...weights) : 0;
          if (!history[exId]) history[exId] = [];
          history[exId].push({
            date: log.date,
            maxW,
            sets: doneSets
          });
        }
      });
    });
    return history;
  }, [logs]);

  // Get chronological session list
  const sessionsList = React.useMemo(() => {
    return Object.entries(logs).map(([id, log]) => ({
      ...(log as any),
      id
    })).sort((a: any, b: any) => b.date.localeCompare(a.date));
  }, [logs]);

  // Filter day sessions based on search
  const filteredSessions = React.useMemo(() => {
    return sessionsList.filter(session => {
      const wo = workouts.find(w => w.id === session.workoutId);
      const workoutName = wo?.name || 'Session';
      const lowercaseSearch = search.toLowerCase();
      
      const matchesDate = session.date.includes(lowercaseSearch);
      const matchesWorkout = workoutName.toLowerCase().includes(lowercaseSearch);
      const matchesId = session.id?.toLowerCase().includes(lowercaseSearch);
      
      // Also match if any of the completed exercises match the search
      const matchesExercises = Object.keys(session.sets).some(exId => {
        const meta = exMeta[exId];
        return meta?.name.toLowerCase().includes(lowercaseSearch);
      });

      return matchesDate || matchesWorkout || matchesExercises || matchesId;
    });
  }, [sessionsList, workouts, search, exMeta]);

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

    const allLogs = Object.values(logs) as SessionLog[];
    const sortedLogsChronological = allLogs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const runningPRs: Record<string, number> = {};

    sortedLogsChronological.forEach(log => {
      const monthKey = log.date.substring(0, 7); // "YYYY-MM"
      if (!monthKey) return;

      const [year, month] = monthKey.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!summaries[monthKey]) {
        summaries[monthKey] = {
          monthKey,
          monthName,
          sessionsCount: 0,
          totalDuration: 0,
          totalVolume: 0,
          prCount: 0,
          peakLifts: {},
          workoutsByType: { push: 0, pull: 0, legs: 0, custom: 0 }
        };
      }

      const summary = summaries[monthKey];
      summary.sessionsCount += 1;
      summary.totalDuration += log.durationMinutes || 0;
      summary.totalVolume += calculateVolume(log);

      const workout = workouts.find(w => w.id === log.workoutId);
      if (workout) {
        const type = workout.type || 'custom';
        summary.workoutsByType[type] = (summary.workoutsByType[type] || 0) + 1;
      }

      Object.entries(log.sets).forEach(([exId, sets]) => {
        const doneSets = (sets as SetLog[]).filter(s => s.done);
        if (doneSets.length === 0) return;

        const exerciseName = exMeta[exId]?.name || 'Exercise';
        const weights = doneSets.map(s => parseFloat(s.weight) || 0);
        const logMaxWeight = weights.length > 0 ? Math.max(...weights) : 0;

        if (logMaxWeight > 0) {
          if (!summary.peakLifts[exId] || logMaxWeight > summary.peakLifts[exId].weight) {
            summary.peakLifts[exId] = { exerciseName, weight: logMaxWeight };
          }

          const prevPR = runningPRs[exId] || 0;
          if (logMaxWeight > prevPR) {
            summary.prCount += 1;
            runningPRs[exId] = logMaxWeight;
          }
        }
      });
    });

    return Object.values(summaries).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [logs, workouts, exMeta]);

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
      const exName = exMeta[exId]?.name || 'Exercise';
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

  const [historySubTab, setHistorySubTab] = useState<'log'>('log');

  return (
    <div className="space-y-8 pt-4">
      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <SectionHeader
          eyebrow="Growth Protocol"
          eyebrowColor="orange"
          title="History"
          size="page"
        />

        {/* Sub-tab navigation bar */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setHistorySubTab('log');
            }}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer flex items-center gap-2",
              historySubTab === 'log'
                ? "bg-orange-500 text-black shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Calendar size={14} />
            Log
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <Input
        type="search"
        placeholder="Search by date, workout routine scope, or exercise name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search size={18} />}
        rightIcon={search ? (
          <button 
            type="button"
            onClick={clearFilter}
            className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
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
              className="text-[10px] uppercase font-mono tracking-wider font-bold"
            >
              Clear Filter
            </Button>
          }
        />
      )}

      {/* Monthly Archive Summaries Panel */}
      {monthlySummaries.length > 0 && (
        <Section
          eyebrow="Month-End Summary Reports"
          eyebrowColor="orange"
          title="Monthly Training Analytics"
          action={
            activeMonthTab ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveMonthTab(null)}
              >
                Close Report
              </Button>
            ) : undefined
          }
          padding="relaxed"
        >
          <div className="space-y-4">
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x pr-2">
              {monthlySummaries.map((summary) => {
                const isSelected = activeMonthTab === summary.monthKey;
                return (
                  <button
                    key={summary.monthKey}
                    onClick={() => {
                      haptics.selection();
                      setActiveMonthTab(isSelected ? null : summary.monthKey);
                    }}
                    className={cn(
                      "snap-center shrink-0 p-4 rounded-2xl border text-left min-w-[200px] transition-all relative overflow-hidden group cursor-pointer",
                      isSelected 
                        ? "bg-gradient-to-br from-orange-500/15 to-transparent border-orange-500 text-white shadow-[0_4px_20px_rgba(249,115,22,0.15)]"
                        : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 text-zinc-400 hover:text-white"
                    )}
                  >
                    <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 group-hover:text-amber-400 transition-colors">
                      {summary.monthKey}
                    </div>
                    <div className="text-sm font-black uppercase tracking-wide leading-tight mt-1 text-white">
                      {summary.monthName}
                    </div>
                    <div className="mt-3 flex justify-between items-end">
                      <span className="font-mono text-[10px] text-zinc-500">Completed Runs</span>
                      <span className="text-lg font-mono font-black text-white">{summary.sessionsCount}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {activeMonthTab && (() => {
                const selectedReport = monthlySummaries.find(m => m.monthKey === activeMonthTab);
                if (!selectedReport) return null;

                const totalWorkouts = (Object.values(selectedReport.workoutsByType) as number[]).reduce((a, b) => a + b, 0);

                return (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl space-y-6 overflow-hidden text-zinc-200"
                  >
                    {/* Summary Grid */}
                    <Grid cols={2} colsMd={4} gap="md">
                      <StatCard
                        label="Completed Workouts"
                        value={selectedReport.sessionsCount.toString()}
                        unit="runs"
                        accent="zinc"
                      />
                      <StatCard
                        label="Total Volume"
                        value={selectedReport.totalVolume.toLocaleString()}
                        unit="kg"
                        accent="emerald"
                      />
                      <StatCard
                        label="Total Duration"
                        value={selectedReport.totalDuration.toString()}
                        unit="min"
                        accent="orange"
                      />
                      <StatCard
                        label="PR Benchmarks"
                        value={selectedReport.prCount.toString()}
                        unit="PRs"
                        accent="amber"
                        icon={Trophy}
                      />
                    </Grid>

                    {/* Routine split and Peaks */}
                    <Grid cols={1} colsMd={2} gap="lg" className="pt-2 border-t border-zinc-900">
                      {/* Training Split Distribution */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">Training Plan Coverage</h4>
                        <div className="space-y-2.5">
                          {(Object.entries(selectedReport.workoutsByType) as [string, number][]).map(([type, count]) => {
                            const percentage = totalWorkouts ? Math.round((count / totalWorkouts) * 100) : 0;
                            return count > 0 ? (
                              <div key={type} className="space-y-1">
                                <div className="flex justify-between items-center text-xs font-mono">
                                  <span className="uppercase font-bold text-zinc-400">{type} Protocol</span>
                                  <span className="text-zinc-500">{count} workouts ({percentage}%)</span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-orange-500" 
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: WORKOUT_COLORS[type] || '#f97316'
                                    }} 
                                  />
                                </div>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>

                      {/* Monthly Peak Performance */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">Month Peak Lifts Achievements</h4>
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                          {Object.keys(selectedReport.peakLifts).length === 0 ? (
                            <div className="text-xs text-zinc-600 italic font-mono pt-4 text-center">No heavy lifts recorded this month.</div>
                          ) : (
                            (Object.entries(selectedReport.peakLifts) as [string, { exerciseName: string; weight: number }][]).map(([exId, lift]) => (
                              <div key={exId} className="flex justify-between items-center p-2 rounded-lg bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-300">
                                <span className="font-medium truncate max-w-[200px]">{lift.exerciseName}</span>
                                <Badge label={`${lift.weight}kg`} color="orange" variant="subtle" />
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
        </Section>
      )}

      {/* Main Days Drill Down Hierarchy */}
      <Section
        eyebrow="Chronological Archive"
        eyebrowColor="zinc"
        title="Training Sessions"
        padding="none"
      >
        {filteredSessions.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No Historical Milestones Detected"
            description="No logged workouts match your active filters. Complete training protocols on the dashboard to register stats in the engine."
            action={search ? { label: 'Clear Filters', onClick: clearFilter } : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session, sIdx) => {
              const workout = workouts.find(w => w.id === session.workoutId);
              const totalSets = Object.values(session.sets).flat().filter((s: any) => s.done).length;
              const vol = calculateVolume(session);
              const color = WORKOUT_COLORS[workout?.type || 'push'];
              const isExpanded = expandedDate === session.id;

              return (
                <Card
                  key={sIdx}
                  variant={isExpanded ? "elevated" : "default"}
                  padding="none"
                  className={cn(
                    "overflow-hidden transition-all",
                    isExpanded && "border-orange-500/40"
                  )}
                >
                  {/* 1. Days list bar */}
                  <div
                    onClick={() => {
                      haptics.light();
                      setExpandedDate(isExpanded ? null : session.id);
                    }}
                    className="w-full text-left p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/30 transition-all duration-200"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-mono text-zinc-400 text-xs font-bold uppercase tracking-wider">
                          {session.date}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black uppercase text-white font-display leading-[0.9] tracking-wider">
                        {workout?.name || 'Custom Protocol'}
                      </h3>
                      <div className="flex flex-wrap gap-3 text-xs font-mono text-zinc-400 uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <Clock size={13} className="text-zinc-500 shrink-0" /> {session.durationMinutes || 0} min
                        </div>
                        <div>·</div>
                        <div className="flex items-center gap-1">
                          <Dumbbell size={13} className="text-zinc-500 shrink-0" /> {totalSets} sets
                        </div>
                        {vol > 0 && (
                          <>
                            <div>·</div>
                            <div>
                              Volume: <span className="text-emerald-400 font-bold">{vol.toLocaleString()}kg</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-zinc-800/60 pt-4 sm:pt-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLogId(session.id);
                          setEditSessionState(JSON.parse(JSON.stringify(session)));
                          setEditVerified(false);
                          setExpandedDate(session.id);
                        }}
                        className={cn(
                          "p-2.5 bg-zinc-950 border hover:bg-zinc-800 hover:text-orange-400 rounded-xl text-zinc-400 transition-all cursor-pointer",
                          editingLogId === session.id ? "border-orange-500 text-orange-400 bg-orange-500/10" : "border-zinc-800"
                        )}
                        title="Edit session logs"
                      >
                        <Edit2 size={15} />
                      </button>

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const proceed = await confirm({
                            title: 'Purge Workout Log',
                            message: 'Are you sure you want to purge this workout log from history?',
                            isDanger: true
                          });
                          if (proceed) {
                            haptics.warning();
                            await deleteLog(session.id);
                          }
                        }}
                        className="p-2.5 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 hover:border-red-500/50 hover:text-red-400 rounded-xl text-zinc-400 transition-all cursor-pointer"
                        title="Purge session"
                      >
                        <Trash2 size={15} />
                      </button>
                      
                      <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 bg-zinc-950">
                        <ChevronRight 
                          size={16} 
                          className={cn("transition-transform duration-300", isExpanded && "rotate-90 text-orange-500")} 
                        />
                      </div>
                    </div>
                  </div>

                {/* 2. Exercises Drop Down / Secure Drawer Editor (if Selected Day is expanded) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-zinc-800 bg-zinc-950/40 p-6 space-y-4"
                    >
                      {editingLogId === session.id && editSessionState ? (
                        <div className="space-y-6 text-zinc-300">
                          {/* Secure Editor Header */}
                          <div className="flex justify-between items-center bg-zinc-900/50 p-4 border border-zinc-800 rounded-2xl">
                            <div className="space-y-1">
                              <span className="font-mono text-[8.5px] uppercase tracking-widest text-orange-500 block font-bold">Secure Archive Modification</span>
                              <h4 className="text-sm font-black uppercase text-white leading-tight">Edit Session Logs</h4>
                            </div>
                            <button
                              onClick={() => {
                                setEditingLogId(null);
                                setEditSessionState(null);
                                setEditVerified(false);
                              }}
                              className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          {/* 1. Duration field */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
                            <div>
                              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">Session Duration</label>
                              <span className="text-xs text-zinc-500 font-sans">Total elapsed active protocol duration</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
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
                                className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-center focus:border-zinc-500 outline-none font-mono text-white"
                              />
                              <span className="text-xs font-mono text-zinc-400 uppercase">min</span>
                            </div>
                          </div>

                          {/* Sets list per exercise */}
                          <div className="space-y-6">
                            {Object.entries(editSessionState.sets).map(([exId, sets]) => {
                              const meta = exMeta[exId] || { name: 'Unlisted Exercise' };
                              return (
                                <div key={exId} className="border border-zinc-800 rounded-2xl bg-zinc-900/20 p-4 sm:p-5 space-y-4 text-zinc-300">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                                    <h5 className="font-black text-xs sm:text-sm text-white uppercase tracking-wider">{meta.name}</h5>
                                  </div>

                                  <div className="grid grid-cols-[36px_1fr_1fr_36px] gap-2.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400 items-center">
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
                                        <div key={idx} className="space-y-1.5">
                                          <div className="grid grid-cols-[36px_1fr_1fr_36px] gap-2.5 items-center">
                                            <span className="font-mono text-xs text-zinc-400 text-center font-bold">{idx + 1}</span>
                                            <input
                                              type="number"
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
                                              className={cn(
                                                "w-full min-w-0 bg-zinc-950 border rounded-xl py-2 px-2 text-xs text-center focus:outline-none font-mono text-white transition-all",
                                                isExtremeW ? "border-amber-500 text-amber-400 font-bold" : "border-zinc-800 focus:border-zinc-600"
                                              )}
                                            />
                                            <input
                                              type="number"
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
                                              className={cn(
                                                "w-full min-w-0 bg-zinc-950 border rounded-xl py-2 px-2 text-xs text-center focus:outline-none font-mono text-white transition-all",
                                                isExtremeR ? "border-amber-500 text-amber-400 font-bold" : "border-zinc-800 focus:border-zinc-600"
                                              )}
                                            />
                                            <div className="flex items-center justify-center">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditSessionState(prev => {
                                                    if (!prev) return null;
                                                    const newSets = { ...prev.sets };
                                                    newSets[exId] = (newSets[exId] as SetLog[]).filter((_, curI) => curI !== idx);
                                                    return { ...prev, sets: newSets };
                                                  });
                                                }}
                                                className="p-2 hover:bg-zinc-900 text-zinc-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                                title="Remove set"
                                              >
                                                <X size={14} />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Set-Level Warning */}
                                          {isSetExtreme && (
                                            <div className="ml-9 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[9px] text-amber-400 font-mono">
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
                          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-400">
                            <label className="flex items-start gap-3 cursor-pointer text-xs select-none">
                              <input
                                type="checkbox"
                                checked={editVerified}
                                onChange={(e) => setEditVerified(e.target.checked)}
                                className="mt-0.5 rounded border-zinc-800 bg-zinc-950 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer"
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
                          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-400">
                            Completed Exercises · Select one to view historical timeline
                          </div>

                          <div className="space-y-3">
                        {Object.entries(session.sets).map(([exId, sets]) => {
                          const meta = exMeta[exId] || { name: 'Unlisted Exercise', type: 'custom', workoutName: 'Routine' };
                          const doneSets = (sets as SetLog[]).filter(s => s.done);
                          if (doneSets.length === 0) return null;

                          const exKey = `${session.date}_${exId}`;
                          const isSelected = selectedExKey === exKey;

                          // Dynamic PR calculation of all time for this exercise
                          const historyLogs = (exerciseHistory[exId] || []).sort((a, b) => b.date.localeCompare(a.date));
                          const prWeight = historyLogs.length > 0 ? Math.max(...historyLogs.map(h => h.maxW)) : 0;
                          const oldestPrDate = prWeight > 0 
                            ? historyLogs.slice().reverse().find(h => h.maxW === prWeight)?.date 
                            : null;
                          const currentMaxWeight = Math.max(...doneSets.map(s => parseFloat(s.weight) || 0));
                          const exColor = WORKOUT_COLORS[meta.type as keyof typeof WORKOUT_COLORS] || '#f59e0b';

                          return (
                            <div key={exId} className="border border-zinc-800 rounded-2xl bg-zinc-900/20 overflow-hidden">
                              <button
                                onClick={() => {
                                  haptics.selection();
                                  setSelectedExKey(isSelected ? null : exKey);
                                }}
                                className={cn(
                                  "w-full text-left p-4 pr-12 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/40 transition-colors cursor-pointer relative",
                                  isSelected && "bg-zinc-800/30"
                                )}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span 
                                      className="w-1.5 h-1.5 rounded-full shrink-0" 
                                      style={{ backgroundColor: exColor }} 
                                    />
                                    <h4 className="font-bold text-zinc-200 text-sm tracking-wide">
                                      {meta.name}
                                    </h4>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
                                    <span>{doneSets.length} sets logged</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 self-start sm:self-auto">
                                  {currentMaxWeight > 0 && (
                                    <div className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-300">
                                      Peak Today: <span className="text-white font-bold">{currentMaxWeight}kg</span>
                                    </div>
                                  )}
                                  <ChevronRight 
                                    size={14} 
                                    className={cn("text-zinc-500 transition-transform absolute right-4 top-1/2 -translate-y-1/2 duration-300", isSelected && "rotate-90")} 
                                    style={isSelected ? { color: exColor } : undefined}
                                  />
                                </div>
                              </button>

                              {/* 3. Single Exercise All-Time Records & PR Highlight (nested) */}
                              <AnimatePresence>
                                {isSelected && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-zinc-800 bg-zinc-950/80 p-5 space-y-4"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <Trophy size={12} className="shrink-0" style={{ color: exColor }} />
                                        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">Progressive Benchmark</span>
                                      </div>
                                      {prWeight > 0 && (
                                        <div 
                                          className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border"
                                          style={{
                                            backgroundColor: `${exColor}1F`,
                                            color: exColor,
                                            borderColor: `${exColor}40`
                                          }}
                                        >
                                          Lifetime PR: {prWeight}kg
                                        </div>
                                      )}
                                    </div>

                                    {/* Progression Line Chart using Recharts */}
                                    {prWeight > 0 && historyLogs.length > 1 && (
                                      <div className="h-32 w-full pt-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                          <LineChart data={historyLogs.slice().reverse()} margin={{ top: 8, right: 12, left: -15, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                            <XAxis 
                                              dataKey="date" 
                                              stroke="#71717a" 
                                              fontSize={9} 
                                              tickLine={false} 
                                              axisLine={false}
                                              tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                            />
                                            <YAxis 
                                              stroke="#71717a" 
                                              fontSize={9} 
                                              tickLine={false} 
                                              axisLine={false}
                                              width={35}
                                              tickFormatter={(val) => `${val}kg`}
                                            />
                                            <Tooltip
                                              contentStyle={{
                                                backgroundColor: '#09090b',
                                                borderColor: '#27272a',
                                                borderRadius: '12px',
                                                fontSize: '10px',
                                                fontFamily: 'monospace',
                                                color: '#fff'
                                              }}
                                              itemStyle={{ color: exColor }}
                                              labelStyle={{ color: '#a1a1aa' }}
                                              formatter={(value) => [`${value}kg`, 'Peak Weight']}
                                              labelFormatter={(label) => `Date: ${label}`}
                                            />
                                            <Line
                                              type="monotone"
                                              dataKey="maxW"
                                              stroke={exColor}
                                              strokeWidth={2}
                                              dot={{ r: 2.5, fill: exColor, strokeWidth: 0 }}
                                              activeDot={{ r: 4 }}
                                            />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </div>
                                    )}

                                    {/* Times Done Timeline Logs (with PRs highlighted) */}
                                    <div className="space-y-2">
                                      <span className="block text-[8px] font-mono uppercase tracking-[0.25em] text-zinc-500">History Progression Logs (Latest First)</span>
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                        {historyLogs.map((h, hIdx) => {
                                          const isPR = prWeight > 0 && h.maxW === prWeight && h.date === oldestPrDate;

                                          return (
                                            <div 
                                              key={hIdx}
                                              className={cn(
                                                "flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors",
                                                isPR 
                                                  ? "bg-orange-500/10 border-orange-500/30 text-orange-200 font-bold" 
                                                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
                                              )}
                                            >
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] text-zinc-400">{h.date}</span>
                                                {isPR && (
                                                  <Badge label="PR PEAK" color="orange" size="sm" dot={false} />
                                                )}
                                              </div>

                                              <div className="flex items-center gap-3">
                                                <div className="flex gap-1 flex-wrap">
                                                  {h.sets.map((s, sIdx) => (
                                                    <span key={sIdx} className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
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
    </div>
  );
};
