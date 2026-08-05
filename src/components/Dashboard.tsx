import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar as CalendarIcon, Repeat, Trophy, ChevronRight, Trash2, Scale, Dumbbell, Flame, Sparkles } from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { getCycleDay, getNextCycleDayFromLogs, getWorkoutBadgeStyle, WORKOUT_COLORS, dk } from '../utils/fitnessHelpers';
import { SetLog, SessionLog } from '../types/fitness';
import { Calendar } from './Calendar';
import { haptics } from '../utils/haptics';
import { useConfirm } from '../store/ConfirmContext';
import { useCountUp } from '../hooks/useCountUp';
import { INITIAL_WORKOUTS } from '../types/initialData';
import {
  Section,
  SectionHeader,
  StatCard,
  HighlightCard,
  Card,
  Badge,
  EmptyState,
  SEMANTIC_COLORS,
  RADIUS
} from './ui';
import { cn } from '../lib/utils';

const formatDateStr = (dateStr: string) => {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

interface DashboardProps {
  onStartWorkout: (id: string) => void;
  onNavigateToHistory: (dateStr?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onStartWorkout, onNavigateToHistory }) => {
  const { 
    logs, 
    workouts, 
    appState, 
    updateCycleStart, 
    activeSession, 
    clearActiveSession,
    logBodyWeight,
    deleteBodyWeight,
    setWorkouts
  } = useFitness();
  const { confirm } = useConfirm();
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [weightInput, setWeightInput] = React.useState('');

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen && !(event.target as Element).closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const currentCycleDay = React.useMemo(() => {
    return getNextCycleDayFromLogs(logs, workouts, appState?.cycleStart);
  }, [logs, workouts, appState?.cycleStart]);

  const todayWorkout = React.useMemo(() => {
    return (workouts || []).find(w => w.cycleDay === currentCycleDay && w.isCore);
  }, [workouts, currentCycleDay]);

  const handleLogWeight = () => {
    const val = parseFloat(weightInput);
    if (!val || val < 20 || val > 300) return;
    haptics.success();
    logBodyWeight(dk(), val);
    setWeightInput('');
  };

  const totalWeight = React.useMemo(() => {
    return (Object.values(logs || {}) as SessionLog[]).reduce((acc: number, log) => {
      let logVol = 0;
      Object.values(log?.sets || {}).forEach((exSets) => {
        (exSets as SetLog[] || []).forEach((s: SetLog) => {
          if (s && s.done && s.weight && s.reps) {
            logVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
          }
        });
      });
      return acc + logVol;
    }, 0);
  }, [logs]);

  const streakCount = React.useMemo(() => {
    const datesSet = new Set((Object.values(logs || {}) as SessionLog[]).map(l => l.date));
    if (datesSet.size === 0) return 0;
    
    let streak = 0;
    let checkDate = new Date();
    
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${r}`;
    };

    let checkStr = formatDate(checkDate);
    
    // If today is not in the set, check yesterday to sustain the current active streak
    if (!datesSet.has(checkStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = formatDate(checkDate);
      if (!datesSet.has(checkStr)) {
        return 0;
      }
    }
    
    while (datesSet.has(formatDate(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  }, [logs]);

  const animatedSessions = useCountUp(Object.keys(logs || {}).length);
  const animatedCycles = useCountUp(Math.floor(Object.keys(logs || {}).length / 8));
  const animatedWeight = useCountUp(Math.round(totalWeight));

  const stats = [
    { label: 'Day Streak', val: streakCount.toString(), icon: <TrendingUp size={16} />, color: 'text-orange-500', accentColor: 'border-t-orange-500/40' },
    { label: 'Sessions', val: animatedSessions.toString(), icon: <CalendarIcon size={16} />, color: 'text-blue-500', accentColor: 'border-t-blue-500/40' },
    { label: 'Cycles', val: animatedCycles.toString(), icon: <Repeat size={16} />, color: 'text-purple-500', accentColor: 'border-t-purple-500/40' },
    { label: 'kg Lifted', val: animatedWeight >= 1000 ? (animatedWeight / 1000).toFixed(1) + 'k' : animatedWeight.toString(), icon: <Trophy size={16} />, color: 'text-emerald-500', accentColor: 'border-t-emerald-500/40' },
  ];

  return (
    <div className="space-y-10 pt-4">
      {/* Hero Greeting */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-500 uppercase">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase leading-[0.9] tracking-tighter font-display text-white">
          Stay<br />Aggressive
        </h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Day Streak"
          value={streakCount.toString()}
          accent="orange"
          icon={TrendingUp}
          size="standard"
        />
        <StatCard
          label="Sessions"
          value={animatedSessions.toString()}
          accent="emerald"
          icon={CalendarIcon}
          size="standard"
        />
        <StatCard
          label="Cycles"
          value={animatedCycles.toString()}
          accent="amber"
          icon={Repeat}
          size="standard"
        />
        <StatCard
          label="kg Lifted"
          value={animatedWeight >= 1000 ? (animatedWeight / 1000).toFixed(1) + 'k' : animatedWeight.toString()}
          accent="emerald"
          icon={Trophy}
          size="standard"
        />
      </div>

      {/* Unfinished Session Alert */}
      {activeSession && (() => {
        const unfinishedWo = workouts.find(w => w.id === activeSession.workoutId);
        if (!unfinishedWo) return null;
        
        const elapsedMin = Math.floor((Date.now() - activeSession.startTime) / 60000);
        const relativeTime = elapsedMin < 60 
          ? `${elapsedMin} min ago` 
          : `${Math.floor(elapsedMin / 60)}h ago`;

        return (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant="elevated" padding="relaxed" className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-zinc-900/40 to-transparent relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    <Badge label="UNFINISHED SESSION RESTORED" color="amber" variant="subtle" />
                  </div>
                  <h3 className="text-2xl font-black uppercase text-white tracking-tight leading-none font-display">
                    {unfinishedWo.name}
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Started {relativeTime}
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      haptics.warning();
                      clearActiveSession();
                    }}
                    className="flex-1 sm:flex-initial px-5 py-2.5 border border-zinc-800 rounded-xl font-mono text-xs uppercase font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => {
                      haptics.medium();
                      onStartWorkout(activeSession.workoutId);
                    }}
                    className="flex-1 sm:flex-initial px-6 py-2.5 bg-amber-500 text-black hover:bg-amber-400 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-transform hover:scale-105 cursor-pointer"
                  >
                    Resume Session
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })()}

      {/* Today's Workout */}
      <Section
        eyebrow="Today's Protocol"
        eyebrowColor="emerald"
        title="Active Target"
        padding="none"
      >
        {workouts.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Routines Library Is Empty"
            description="Reload standard protocols to populate your workout engine."
            action={{
              label: 'Reload Engine',
              onClick: () => {
                haptics.medium();
                setWorkouts(INITIAL_WORKOUTS);
              }
            }}
          />
        ) : todayWorkout ? (
          <Card
            variant="interactive"
            padding="relaxed"
            onClick={() => {
              haptics.medium();
              onStartWorkout(todayWorkout.id);
            }}
            className="group relative overflow-hidden"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <Badge
                  label={todayWorkout.badge}
                  color={todayWorkout.type === 'push' || todayWorkout.type === 'pull' || todayWorkout.type === 'hybrid' ? 'orange' : 'emerald'}
                  variant="subtle"
                />
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight font-display text-white">{todayWorkout.name}</h2>
                <p className="text-zinc-500 text-sm">
                  {todayWorkout.type === 'rest' ? 'Rest & Recovery Protocol' : `${todayWorkout.exercises.length} Exercises · Approx 60 min`}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.medium();
                  onStartWorkout(todayWorkout.id);
                }}
                className={cn(
                  "w-full md:w-auto px-8 py-3.5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all hover:scale-105 active:scale-95 cursor-pointer",
                  todayWorkout.type === 'rest'
                    ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                    : "bg-emerald-500 text-black hover:bg-emerald-400"
                )}
              >
                {todayWorkout.type === 'rest' ? 'Rest Day' : 'Start Session'}
              </button>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={Repeat}
            title="Protocol Out of Sync"
            description={`No core workout found for Day ${currentCycleDay}.`}
            action={{
              label: 'Reset to Cycle Day 1',
              onClick: () => updateCycleStart(dk())
            }}
          />
        )}
      </Section>

      {/* Body Weight Log */}
      <Section
        eyebrow="Biometrics"
        eyebrowColor="orange"
        title="Body Weight Tracker"
        padding="relaxed"
      >
        <div className="space-y-5">
          {/* Current + Input Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-1">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Current</span>
              <div className="flex items-end gap-1.5">
                <span className="text-4xl font-black text-white tabular-nums">
                  {(() => {
                    const entries = Object.entries(appState.weightLog || {}) as [string, number][];
                    if (entries.length === 0) return '--';
                    const latest = entries.sort((a, b) => b[0].localeCompare(a[0]))[0];
                    return latest[1];
                  })()}
                </span>
                <span className="text-zinc-500 font-mono text-xs mb-1.5">kg</span>
              </div>
            </div>

            {/* Quick log input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="kg"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLogWeight();
                  }
                }}
                className="flex-1 sm:flex-none w-full sm:w-28 bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-center font-mono focus:border-orange-500 outline-none transition-all text-white placeholder-zinc-600"
              />
              <button
                onClick={handleLogWeight}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl text-xs font-mono uppercase tracking-wider transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              >
                Log
              </button>
            </div>
          </div>

          {/* Sparkline */}
          {Object.keys(appState.weightLog || {}).length > 1 && (() => {
            const entries = Object.entries(appState.weightLog || {}) as [string, number][];
            const sorted = entries.sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
            
            const weights = sorted.map(e => e[1]);
            const min = Math.min(...weights) - 0.5;
            const max = Math.max(...weights) + 0.5;
            const range = max - min || 1;
            const w = 100 / (sorted.length - 1);

            return (
              <div className="space-y-2">
                <div className="relative h-12 w-full">
                  <svg viewBox="0 0 100 32" className="w-full h-full" preserveAspectRatio="none">
                    <polyline
                      points={sorted.map((e, i) => 
                        `${i * w},${32 - ((e[1] - min) / range) * 28}`
                      ).join(' ')}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {sorted.map((e, i) => (
                      <circle
                        key={i}
                        cx={i * w}
                        cy={32 - ((e[1] - min) / range) * 28}
                        r="2"
                        fill="#f97316"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                </div>

                {/* Min/Max labels */}
                <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase">
                  <span>{sorted[0][0].slice(5)}</span>
                  <span className="text-zinc-500">
                    {Math.min(...weights)}kg → {Math.max(...weights)}kg
                  </span>
                  <span>{sorted[sorted.length - 1][0].slice(5)}</span>
                </div>
              </div>
            );
          })()}

          {/* Empty state */}
          {Object.keys(appState.weightLog || {}).length === 0 && (
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest text-center py-2">
              Log your first weigh-in above
            </p>
          )}

          {/* Recent Entries */}
          {Object.keys(appState.weightLog || {}).length > 0 && (
            <div className="border-t border-zinc-800/60 pt-4 space-y-2">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Recent Logs</div>
              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {(Object.entries(appState.weightLog || {}) as [string, number][])
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 5)
                  .map(([date, weight]) => (
                    <Card key={date} variant="default" padding="compact" className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">{formatDateStr(date)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-white font-bold">{weight} <span className="text-[10px] text-zinc-500 font-normal">kg</span></span>
                        <button
                          onClick={async () => {
                            haptics.warning();
                            const proceed = await confirm({
                              title: 'Delete Weight Log',
                              message: `Are you sure you want to delete your weight log for ${formatDateStr(date)}?`,
                              isDanger: true,
                            });
                            if (proceed) {
                              deleteBodyWeight(date);
                            }
                          }}
                          className="text-zinc-600 hover:text-red-400 p-1 transition-colors cursor-pointer"
                          title="Delete Entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Quick All Workouts */}
      <Section
        eyebrow="Protocols"
        eyebrowColor="zinc"
        title="Routine Library"
        padding="none"
      >
        <div className="relative dropdown-container">
          <button 
            onClick={() => {
              haptics.light();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 pr-10 font-mono text-xs uppercase tracking-wider outline-none text-left flex justify-between items-center hover:border-zinc-700 transition-all cursor-pointer"
          >
            <span className="text-zinc-300">Browse All Routines</span>
            <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", isDropdownOpen && "rotate-90")} />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute z-40 left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-2xl space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {workouts.map((wo) => (
                <button
                  key={wo.id}
                  onClick={() => {
                    haptics.selection();
                    if (wo.type !== 'rest') onStartWorkout(wo.id);
                    setIsDropdownOpen(false);
                  }}
                  disabled={wo.type === 'rest'}
                  className={cn(
                    "w-full p-3.5 rounded-xl flex items-center justify-between text-left transition-all border border-transparent",
                    wo.type === 'rest' ? "opacity-30 grayscale cursor-not-allowed" : "hover:bg-zinc-800 cursor-pointer active:scale-[0.99]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-1.5 h-6 rounded-full" 
                      style={{ 
                        backgroundColor: WORKOUT_COLORS[wo.type],
                      }} 
                    />
                    <div>
                      <div className="font-bold text-sm uppercase tracking-tight text-white">{wo.name}</div>
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest leading-none mt-1">Day {wo.cycleDay} · {wo.badge}</div>
                    </div>
                  </div>
                  {wo.type !== 'rest' && (
                    <div className="flex items-center gap-2">
                      <Badge label={`${wo.exercises.length} EXERCISES`} color="zinc" variant="subtle" />
                      <ChevronRight size={14} className="text-zinc-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Calendar Section */}
      <Calendar onNavigateToHistory={onNavigateToHistory} />
    </div>
  );
};

