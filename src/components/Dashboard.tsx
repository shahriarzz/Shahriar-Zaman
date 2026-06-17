import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Calendar as CalendarIcon, Repeat, Trophy, ChevronRight } from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { getCycleDay, WORKOUT_COLORS, dk } from '../utils/fitnessHelpers';
import { SetLog, SessionLog } from '../types/fitness';
import { Calendar } from './Calendar';
import { haptics } from '../utils/haptics';

import { cn } from '../lib/utils';

interface DashboardProps {
  onStartWorkout: (id: string) => void;
  onNavigateToHistory: (dateStr?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onStartWorkout, onNavigateToHistory }) => {
  const { logs, workouts, appState, updateCycleStart, activeSession, clearActiveSession } = useFitness();
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen && !(event.target as Element).closest('.dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const currentCycleDay = getCycleDay(appState?.cycleStart || dk());
  const todayWorkout = (workouts || []).find(w => w.cycleDay === currentCycleDay && w.isCore);

   // Stats Logic
  const totalWeight = (Object.values(logs || {}) as SessionLog[]).reduce((acc: number, log) => {
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

  const stats = [
    { label: 'Day Streak', val: streakCount.toString(), icon: <TrendingUp size={16} />, color: 'text-orange-500', accentColor: 'border-t-orange-500/40' },
    { label: 'Sessions', val: Object.keys(logs).length.toString(), icon: <CalendarIcon size={16} />, color: 'text-blue-500', accentColor: 'border-t-blue-500/40' },
    { label: 'Cycles', val: Math.floor(Object.keys(logs).length / 8).toString(), icon: <Repeat size={16} />, color: 'text-purple-500', accentColor: 'border-t-purple-500/40' },
    { label: 'kg Lifted', val: totalWeight >= 1000 ? (totalWeight / 1000).toFixed(1) + 'k' : Math.round(totalWeight).toString(), icon: <Trophy size={16} />, color: 'text-emerald-500', accentColor: 'border-t-emerald-500/40' },
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
        <h1 className="text-4xl md:text-6xl font-black uppercase leading-[0.85] tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
          Stay<br />Aggressive
        </h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex flex-col items-start gap-1 border-t-2",
              stat.accentColor
            )}
          >
            <div className={stat.color}>{stat.icon}</div>
            <span className="text-3xl font-black">{stat.val}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</span>
          </motion.div>
        ))}
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
            className="border-2 border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden"
          >
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-amber-500/5 blur-xl rounded-full" />
            <div className="space-y-2 relative z-10 font-sans">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-500 font-bold">Unfinished Session Restored</span>
              </div>
              <h3 className="text-2xl font-black uppercase text-white tracking-tight leading-none font-display">
                {unfinishedWo.name}
              </h3>
              <p className="text-sm text-zinc-400 font-mono">
                Started {relativeTime}
              </p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto relative z-10">
              <button
                onClick={() => {
                  haptics.warning();
                  clearActiveSession();
                }}
                className="flex-1 sm:flex-initial px-5 py-3 border border-zinc-800 rounded-xl font-mono text-[10px] uppercase font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  haptics.medium();
                  onStartWorkout(activeSession.workoutId);
                }}
                className="flex-1 sm:flex-initial px-6 py-3 bg-amber-500 text-black hover:bg-amber-400 rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest transition-transform hover:scale-105 cursor-pointer"
              >
                Resume Session
              </button>
            </div>
          </motion.div>
        );
      })()}

      {/* Today's Workout */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Today's Protocol</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {workouts.length === 0 ? (
          <div className="bg-zinc-900 border border-dashed border-zinc-800 p-12 rounded-3xl text-center space-y-4">
            <p className="text-zinc-500 font-mono text-sm">Routines library is empty.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2 bg-white text-black rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest"
            >
              Reload Engine
            </button>
          </div>
        ) : todayWorkout ? (
          <motion.div
            whileHover={{ y: -4 }}
            className="relative overflow-hidden group cursor-pointer"
          >
            <div
              className="absolute inset-0 opacity-10 blur-3xl group-hover:opacity-30 transition-opacity"
              style={{ background: WORKOUT_COLORS[todayWorkout.type] }}
            />
            <div className="relative bg-zinc-900/80 border border-zinc-800 p-6 rounded-3xl backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div
                  className="inline-flex px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-widest"
                  style={{
                    backgroundColor: `${WORKOUT_COLORS[todayWorkout.type]}22`,
                    color: WORKOUT_COLORS[todayWorkout.type],
                    border: `1px solid ${WORKOUT_COLORS[todayWorkout.type]}55`
                  }}
                >
                  {todayWorkout.badge}
                </div>
                <h2 className="text-4xl font-black uppercase tracking-tight">{todayWorkout.name}</h2>
                <p className="text-zinc-500 text-sm">
                  {todayWorkout.isRest ? 'Rest & Recovery Protocol' : `${todayWorkout.exercises.length} Exercises · Approx 60 min`}
                </p>
              </div>

              <button
                onClick={() => {
                  haptics.medium();
                  onStartWorkout(todayWorkout.id);
                }}
                className="w-full md:w-auto px-8 py-4 rounded-2xl font-mono text-xs font-bold tracking-widest transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: WORKOUT_COLORS[todayWorkout.type],
                  color: 'black'
                }}
              >
                {todayWorkout.isRest ? 'Rest Day' : 'Start Session'}
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center space-y-4">
             <div className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Protocol Out of Sync</div>
             <p className="text-sm text-zinc-400">No core workout found for Day {currentCycleDay}.</p>
             <button 
              onClick={() => updateCycleStart(dk())}
              className="px-6 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-[10px] font-mono uppercase tracking-widest"
            >
              Reset to Cycle Day 1
            </button>
          </div>
        )}
      </section>

      {/* Quick All Workouts */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">All Routines</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

         <div className="relative dropdown-container">
          <button 
            onClick={() => {
              haptics.light();
              setIsDropdownOpen(!isDropdownOpen);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 pr-10 font-mono text-[10px] uppercase tracking-widest outline-none text-left flex justify-between items-center hover:border-zinc-700 transition-all focus:ring-1 focus:ring-zinc-600"
          >
            All Routines Architecture
            <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", isDropdownOpen && "rotate-90")} />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute z-40 left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {workouts.map((wo) => (
                <button
                  key={wo.id}
                  onClick={() => {
                    haptics.selection();
                    if (!wo.isRest) onStartWorkout(wo.id);
                    setIsDropdownOpen(false);
                  }}
                  disabled={wo.isRest}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all border border-transparent",
                    wo.isRest ? "opacity-30 grayscale cursor-not-allowed" : "hover:bg-white/5 hover:border-white/5 cursor-pointer active:scale-[0.98]"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-1.5 h-8 rounded-full" 
                      style={{ 
                        backgroundColor: WORKOUT_COLORS[wo.type],
                        boxShadow: `0 0 8px ${WORKOUT_COLORS[wo.type]}80`
                      }} 
                    />
                    <div>
                      <div className="font-bold text-sm uppercase tracking-tight">{wo.name}</div>
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] leading-none mt-1.5">Day {wo.cycleDay} · {wo.badge}</div>
                    </div>
                  </div>
                  {!wo.isRest && (
                    <div className="flex flex-col items-end gap-1">
                       <ChevronRight size={14} className="text-zinc-700" />
                       <span className="text-[7px] font-mono text-zinc-800 uppercase">{wo.exercises.length} Exercises</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Calendar Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Training Calendar</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>
        <Calendar onNavigateToHistory={onNavigateToHistory} />
      </section>
    </div>
  );
};

