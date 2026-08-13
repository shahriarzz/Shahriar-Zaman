import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar as CalendarIcon, Repeat, Trophy, ChevronRight, Trash2, Dumbbell } from 'lucide-react';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { formatDateStr } from '../utils/dashboardSelectors';
import { Calendar } from './Calendar';
import { haptics } from '../utils/haptics';
import { useConfirm } from '../context/ConfirmContext';
import { useDashboardData } from '../hooks/useDashboardData';
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

interface DashboardProps {
  onStartWorkout: (id: string) => void;
  onNavigateToHistory: (dateStr?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onStartWorkout, onNavigateToHistory }) => {
  const {
    heroDateStr,
    stats,
    unfinishedSession,
    todayWorkout,
    currentCycleDay,
    hasWorkouts,
    workouts,
    weightSummary,
    clearActiveSession,
    resetToCycleDay1,
    reloadInitialWorkouts
  } = useDashboardData();

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

  const handleLogWeightSubmit = () => {
    const val = parseFloat(weightInput);
    if (!val || val < 20 || val > 300) return;
    haptics.success();
    weightSummary.logWeight(val);
    setWeightInput('');
  };

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
          value={stats.streakCount.toString()}
          accent="orange"
          icon={TrendingUp}
          size="standard"
        />
        <StatCard
          label="Sessions"
          value={stats.animatedSessions.toString()}
          accent="emerald"
          icon={CalendarIcon}
          size="standard"
        />
        <StatCard
          label="Cycles"
          value={stats.animatedCycles.toString()}
          accent="zinc"
          icon={Repeat}
          size="standard"
        />
        <StatCard
          label="kg Lifted"
          value={stats.formattedWeightLifted}
          accent="emerald"
          icon={Trophy}
          size="standard"
        />
      </Grid>

      {/* Unfinished Session Alert */}
      {unfinishedSession && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
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
                    onStartWorkout(unfinishedSession.workoutId);
                  }}
                  className="flex-1 sm:flex-initial"
                >
                  Resume Session
                </Button>
              </div>
            }
          />
        </motion.div>
      )}

      {/* Today's Workout */}
      <Section
        eyebrow="Today's Protocol"
        eyebrowColor="emerald"
        title="Active Target"
        padding="none"
      >
        {!hasWorkouts ? (
          <EmptyState
            icon={Dumbbell}
            title="Routines Library Is Empty"
            description="Reload standard protocols to populate your workout engine."
            action={{
              label: 'Reload Engine',
              onClick: () => {
                haptics.medium();
                reloadInitialWorkouts();
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
              onClick: () => resetToCycleDay1()
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
                  {weightSummary.currentWeight}
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
                      handleLogWeightSubmit();
                    }
                  }}
                  className="text-center font-bold"
                />
              </div>
              <Button
                variant="primary"
                color="orange"
                onClick={handleLogWeightSubmit}
                className="whitespace-nowrap"
              >
                Log
              </Button>
            </div>
          </div>

          {/* Sparkline */}
          {weightSummary.sparklineData && (
            <Stack spacing="xs">
              <div className="relative h-12 w-full">
                <svg viewBox="0 0 100 32" className="w-full h-full" preserveAspectRatio="none">
                  <polyline
                    points={weightSummary.sparklineData.sorted.map((e, i) => 
                      `${i * weightSummary.sparklineData!.w},${32 - ((e[1] - weightSummary.sparklineData!.min) / weightSummary.sparklineData!.range) * 28}`
                    ).join(' ')}
                    fill="none"
                    stroke={SEMANTIC_COLORS.orange}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {weightSummary.sparklineData.sorted.map((e, i) => (
                    <circle
                      key={`spark-${e[0]}-${i}`}
                      cx={i * weightSummary.sparklineData!.w}
                      cy={32 - ((e[1] - weightSummary.sparklineData!.min) / weightSummary.sparklineData!.range) * 28}
                      r="2"
                      fill={SEMANTIC_COLORS.orange}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>

              {/* Min/Max labels */}
              <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase">
                <span>{weightSummary.sparklineData.sorted[0][0].slice(5)}</span>
                <span className="text-zinc-500">
                  {Math.min(...weightSummary.sparklineData.weights)}kg → {Math.max(...weightSummary.sparklineData.weights)}kg
                </span>
                <span>{weightSummary.sparklineData.sorted[weightSummary.sparklineData.sorted.length - 1][0].slice(5)}</span>
              </div>
            </Stack>
          )}

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
            <div className="border-t border-zinc-800/60 pt-4 space-y-2">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Recent Logs</div>
              <Grid cols={1} gap="xs" className="max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {weightSummary.recentWeightLogs.map(([date, weight]) => (
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
                            weightSummary.deleteWeight(date);
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
