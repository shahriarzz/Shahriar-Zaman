import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar as CalendarIcon, Repeat, Trophy, ChevronRight, Trash2, Dumbbell } from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { getNextCycleDayFromLogs, WORKOUT_COLORS, dk } from '../utils/fitnessHelpers';
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
  Card,
  Badge,
  EmptyState,
  Button,
  Input,
  Banner,
  Stack,
  Grid,
  SEMANTIC_COLORS,
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

  // Memoized weight calculations
  const weightEntries = React.useMemo(() => {
    return (Object.entries(appState.weightLog || {}) as [string, number][])
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [appState.weightLog]);

  const currentWeight = React.useMemo(() => {
    if (weightEntries.length === 0) return '--';
    return weightEntries[0][1];
  }, [weightEntries]);

  const recentWeightLogs = React.useMemo(() => {
    return weightEntries.slice(0, 5);
  }, [weightEntries]);

  const sparklineData = React.useMemo(() => {
    const raw = Object.entries(appState.weightLog || {}) as [string, number][];
    if (raw.length <= 1) return null;
    const sorted = [...raw].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    const weights = sorted.map(e => e[1]);
    const min = Math.min(...weights) - 0.5;
    const max = Math.max(...weights) + 0.5;
    const range = max - min || 1;
    const w = 100 / (sorted.length - 1);
    return { sorted, weights, min, max, range, w };
  }, [appState.weightLog]);

  const heroDateStr = React.useMemo(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  return (
    <Stack spacing="2xl" className="pt-4">
      {/* Hero Greeting */}
      <SectionHeader
        eyebrow={heroDateStr}
        eyebrowColor="orange"
        title="Stay Aggressive"
        size="page"
      />

      {/* Stats Grid */}
      <Grid cols={2} colsMd={4} gap="md">
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
          accent="zinc"
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
      </Grid>

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
            <Banner
              variant="warning"
              badge="UNFINISHED SESSION RESTORED"
              title={unfinishedWo.name}
              description={`Started ${relativeTime}`}
              action={
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      haptics.warning();
                      clearActiveSession();
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    Discard
                  </Button>
                  <Button
                    variant="warning"
                    size="md"
                    onClick={() => {
                      haptics.medium();
                      onStartWorkout(activeSession.workoutId);
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    Resume Session
                  </Button>
                </div>
              }
            />
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
              <Stack spacing="xs">
                <Badge
                  label={todayWorkout.badge}
                  colorOverride={WORKOUT_COLORS[todayWorkout.type]}
                  variant="subtle"
                />
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight font-display text-white">{todayWorkout.name}</h2>
                <p className="text-zinc-500 text-sm font-mono">
                  {todayWorkout.type === 'rest' ? 'Rest & Recovery Protocol' : `${todayWorkout.exercises.length} Exercises · Approx 60 min`}
                </p>
              </Stack>

              <Button
                variant={todayWorkout.type === 'rest' ? 'secondary' : 'success'}
                size="lg"
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.medium();
                  onStartWorkout(todayWorkout.id);
                }}
                className="w-full md:w-auto"
              >
                {todayWorkout.type === 'rest' ? 'Rest Day' : 'Start Session'}
              </Button>
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
        <Stack spacing="lg">
          {/* Current + Input Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-1">
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Current</span>
              <div className="flex items-end gap-1.5">
                <span className="text-4xl font-black text-white tabular-nums">
                  {currentWeight}
                </span>
                <span className="text-zinc-500 font-mono text-xs mb-1.5">kg</span>
              </div>
            </div>

            {/* Quick log input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="w-full sm:w-36">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="0.0"
                  unit="kg"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLogWeight();
                    }
                  }}
                  className="text-center font-bold"
                />
              </div>
              <Button
                variant="primary"
                color="orange"
                onClick={handleLogWeight}
                className="whitespace-nowrap"
              >
                Log
              </Button>
            </div>
          </div>

          {/* Sparkline */}
          {sparklineData && (
            <Stack spacing="xs">
              <div className="relative h-12 w-full">
                <svg viewBox="0 0 100 32" className="w-full h-full" preserveAspectRatio="none">
                  <polyline
                    points={sparklineData.sorted.map((e, i) => 
                      `${i * sparklineData.w},${32 - ((e[1] - sparklineData.min) / sparklineData.range) * 28}`
                    ).join(' ')}
                    fill="none"
                    stroke={SEMANTIC_COLORS.orange}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {sparklineData.sorted.map((e, i) => (
                    <circle
                      key={i}
                      cx={i * sparklineData.w}
                      cy={32 - ((e[1] - sparklineData.min) / sparklineData.range) * 28}
                      r="2"
                      fill={SEMANTIC_COLORS.orange}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>

              {/* Min/Max labels */}
              <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase">
                <span>{sparklineData.sorted[0][0].slice(5)}</span>
                <span className="text-zinc-500">
                  {Math.min(...sparklineData.weights)}kg → {Math.max(...sparklineData.weights)}kg
                </span>
                <span>{sparklineData.sorted[sparklineData.sorted.length - 1][0].slice(5)}</span>
              </div>
            </Stack>
          )}

          {/* Empty state */}
          {weightEntries.length === 0 && (
            <EmptyState
              size="compact"
              title="No Weight Records"
              description="Log your first weigh-in above to track biometrics."
            />
          )}

          {/* Recent Entries */}
          {recentWeightLogs.length > 0 && (
            <div className="border-t border-zinc-800/60 pt-4 space-y-2">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Recent Logs</div>
              <Grid cols={1} gap="xs" className="max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {recentWeightLogs.map(([date, weight]) => (
                  <Card key={date} variant="standard" padding="compact" className="flex items-center justify-between text-xs font-mono">
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
              </Grid>
            </div>
          )}
        </Stack>
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
    </Stack>
  );
};

