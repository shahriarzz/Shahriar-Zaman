import React, { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isAfter, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Dumbbell, TrendingUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFitness } from '../store/FitnessContext';
import { getCycleDay, getWorkoutBadgeStyle, WORKOUT_COLORS, calculateVolume } from '../utils/fitnessHelpers';
import { SessionLog, SetLog } from '../types/fitness';
import { StatusChip } from './StatusChip';
import { haptics } from '../utils/haptics';

interface CalendarProps {
  onNavigateToHistory?: (dateStr?: string) => void;
}

const getCompletionPercentage = (log: SessionLog): number => {
  if (!log || !log.sets) return 0;
  const setsArray = Object.values(log.sets).flat() as SetLog[];
  if (setsArray.length === 0) return 0;
  const doneSets = setsArray.filter(s => s.done).length;
  return Math.round((doneSets / setsArray.length) * 100);
};

export const Calendar: React.FC<CalendarProps> = ({ onNavigateToHistory }) => {
  const { logs, workouts, appState } = useFitness();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Memoize calendar range calculations on currentMonth change
  const calendarRange = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return { monthStart, monthEnd, days };
  }, [currentMonth]);

  const { monthStart, days } = calendarRange;

  // Memoize logs map by date string for O(1) lookups
  const logsByDateMap = useMemo(() => {
    const map = new Map<string, SessionLog>();
    (Object.values(logs) as SessionLog[]).forEach(log => {
      if (log.date) {
        map.set(log.date, log);
      }
      if (log.id) {
        if (log.id.length >= 10) {
          map.set(log.id.slice(0, 10), log);
        }
        map.set(log.id, log);
      }
    });
    return map;
  }, [logs]);

  // Memoize workouts map by ID for O(1) lookups
  const workoutMap = useMemo(() => {
    const map = new Map<string, typeof workouts[0]>();
    (workouts || []).forEach(w => {
      map.set(w.id, w);
    });
    return map;
  }, [workouts]);

  // Memoize core workouts map by cycleDay for O(1) expected workout lookups
  const coreWorkoutByCycleDayMap = useMemo(() => {
    const map = new Map<number, typeof workouts[0]>();
    (workouts || []).forEach(w => {
      if (w.isCore) {
        map.set(w.cycleDay, w);
      }
    });
    return map;
  }, [workouts]);

  const getDayStatus = (date: Date, dateStr: string) => {
    const log = logsByDateMap.get(dateStr);
    const today = new Date();
    const isFuture = isAfter(startOfDay(date), startOfDay(today));

    const cycleDay = getCycleDay(appState?.cycleStart, date);
    const expectedWo = coreWorkoutByCycleDayMap.get(cycleDay);

    if (log) {
      const wo = workoutMap.get(log.workoutId);
      if (!log.complete) {
        const pct = getCompletionPercentage(log);
        return { color: '#6366f1', label: `${pct}%`, log };
      }
      return { color: WORKOUT_COLORS[wo?.type || 'push'] || '#6366f1', label: wo?.type || 'session', log };
    }

    if (isFuture) {
      if (expectedWo) {
        if (expectedWo.type === 'rest') {
          return { color: '#22c55e', label: 'rest', isFuture: true };
        }
        return { color: WORKOUT_COLORS[expectedWo.type] || '#6366f1', label: expectedWo.name, isFuture: true };
      }
      return null;
    }

    if (expectedWo) {
      if (expectedWo.type === 'rest') return { color: '#22c55e', label: 'rest' };
      if (!isSameDay(date, today)) return { color: '#ef4444', label: 'missed' };
    }

    return null;
  };

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedLog = selectedDateStr ? (logsByDateMap.get(selectedDateStr) || null) : null;

  const isSameMonthAsToday = isSameMonth(currentMonth, new Date());

  const selectedCycleDay = selectedDate ? getCycleDay(appState?.cycleStart, selectedDate) : null;
  const expectedWoForSelected = selectedCycleDay !== null ? coreWorkoutByCycleDayMap.get(selectedCycleDay) : null;
  const isSelectedDateFuture = selectedDate ? isAfter(startOfDay(selectedDate), startOfDay(new Date())) : false;

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Calendar Grid */}
      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 h-fit">
        <div className="flex items-center justify-between mb-8">
          <div className="flex flex-col">
            <h3 className="font-display text-2xl tracking-wider uppercase">
              {format(currentMonth, 'MMMM')}
            </h3>
            <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">{format(currentMonth, 'yyyy')}</span>
          </div>
          <div className="flex gap-2 items-center">
            {!isSameMonthAsToday && (
              <button
                onClick={() => {
                  haptics.selection();
                  const today = new Date();
                  setCurrentMonth(today);
                  setSelectedDate(today);
                }}
                className="px-4 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800/50 hover:bg-zinc-800 rounded-full text-xs font-mono uppercase tracking-wider transition-colors text-zinc-400 hover:text-white cursor-pointer"
              >
                Today
              </button>
            )}
            <button 
              onClick={() => { haptics.selection(); setCurrentMonth(subMonths(currentMonth, 1)); }} 
              className="w-10 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => { haptics.selection(); setCurrentMonth(addMonths(currentMonth, 1)); }} 
              className="w-10 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center font-mono text-[9px] text-zinc-600 uppercase pb-4 tracking-tighter">{d}</div>
          ))}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const status = getDayStatus(day, dateStr);
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <motion.button
                key={dateStr}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  haptics.selection();
                  setSelectedDate(day);
                  const logOnDay = logsByDateMap.get(dateStr);
                  if (logOnDay && onNavigateToHistory) {
                    onNavigateToHistory(logOnDay.id || dateStr);
                  }
                }}
                className={`group relative min-h-[70px] p-2 border transition-all duration-200 rounded-2xl flex flex-col gap-1 overflow-hidden cursor-pointer ${
                  !isCurrentMonth ? 'opacity-20 pointer-events-none' : ''
                } ${isSelected 
                    ? 'border-white/40 bg-white/10' 
                    : isToday 
                      ? 'border-white/20 bg-zinc-800/40' 
                      : 'border-zinc-800/30 bg-zinc-950/20 hover:bg-zinc-800/30'
                  }`}
              >
                <div className="flex justify-between items-start">
                  <span 
                    className={`text-[11px] font-mono leading-none w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                      isToday || isSelected 
                        ? 'text-white' 
                        : status 
                          ? 'text-zinc-200' 
                          : 'text-zinc-600'
                    } ${status && !isSelected ? (status.isFuture ? 'border-2 border-dashed' : 'border-2') : ''}`}
                    style={status && !isSelected ? { borderColor: status.color } : undefined}
                  >
                    {format(day, 'd')}
                  </span>
                  {isToday && !isSelected && <div className="w-1 h-1 rounded-full bg-white animate-pulse" />}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-wrap gap-x-6 gap-y-3">
          {[
            { label: 'Push', color: WORKOUT_COLORS.push },
            { label: 'Pull', color: WORKOUT_COLORS.pull },
            { label: 'Hybrid', color: WORKOUT_COLORS.hybrid },
            { label: 'Rest', color: '#22c55e' },
            { label: 'Missed', color: '#ef4444' },
            { label: 'Incomplete', color: '#6366f1' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.1)]" style={{ backgroundColor: l.color }} />
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Detail */}
      <AnimatePresence mode="wait">
        {selectedDate ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-full lg:w-96 flex flex-col"
          >
            <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden h-full flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-white/5 bg-gradient-to-br from-zinc-800/50 to-transparent">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1">Session Protocol</p>
                    <h4 className="font-display text-3xl uppercase leading-none">{format(selectedDate, 'EEEE')}</h4>
                    <p className="font-mono text-xs text-white/40 mt-1">{format(selectedDate, 'MMMM do, yyyy')}</p>
                  </div>
                  <button 
                    onClick={() => { haptics.selection(); setSelectedDate(null); }}
                    className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                {selectedLog ? (
                  <div className="grid grid-cols-3 gap-2 mt-8">
                    <div className="bg-zinc-950/40 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp size={10} className="text-blue-400" />
                        <span className="font-mono text-[8px] uppercase text-zinc-500">Volume</span>
                      </div>
                      <p className="text-base font-display uppercase tracking-tight">
                        {calculateVolume(selectedLog).toLocaleString()} <span className="text-[8px] font-mono text-zinc-500">kg</span>
                      </p>
                    </div>
                    <div className="bg-zinc-950/40 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock size={10} className="text-amber-400" />
                        <span className="font-mono text-[8px] uppercase text-zinc-500">Time</span>
                      </div>
                      <p className="text-base font-display uppercase tracking-tight">
                        {selectedLog.durationMinutes} <span className="text-[8px] font-mono text-zinc-500">min</span>
                      </p>
                    </div>
                    <div className="bg-zinc-950/40 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 animate-pulse" />
                        <span className="font-mono text-[8px] uppercase text-zinc-500">Done</span>
                      </div>
                      <p className="text-base font-display uppercase tracking-tight">
                        {getCompletionPercentage(selectedLog)}<span className="text-[8px] font-mono text-zinc-500">%</span>
                      </p>
                    </div>
                  </div>
                ) : (isSelectedDateFuture && expectedWoForSelected) ? (
                  <div className="mt-8 p-4 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Upcoming Session</span>
                    </div>
                    <div className="space-y-2">
                      <StatusChip
                        label={expectedWoForSelected.badge || (expectedWoForSelected.type === 'rest' ? 'REST' : expectedWoForSelected.type)}
                        color={WORKOUT_COLORS[expectedWoForSelected.type] || '#6366f1'}
                        variant="subtle"
                      />
                      <h4 className="text-xl font-display uppercase tracking-tight text-white leading-none">{expectedWoForSelected.name}</h4>
                      <p className="text-zinc-500 font-mono text-[9px] uppercase leading-relaxed">
                        {expectedWoForSelected.type === 'rest' ? 'Rest & Recovery Protocol' : `${expectedWoForSelected.exercises?.length || 0} Exercises · Approx 60 min`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 py-8 bg-zinc-950/20 rounded-2xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center px-6">
                    <Info size={24} className="text-zinc-700 mb-3" />
                    <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider leading-relaxed">
                      No performance data recovered for this timestamp.
                    </p>
                  </div>
                )}
              </div>

              {/* Data Content */}
              <div className="flex-1 p-6 overflow-y-auto font-sans">
                {selectedLog && (
                  <div className="space-y-6">
                    {Object.entries(selectedLog.sets || {}).map(([exId, sets]) => {
                      const workout = workoutMap.get(selectedLog.workoutId);
                      const exercise = workout?.exercises.find(e => e.id === exId);
                      const doneSets = (sets as SetLog[]).filter(s => s.done);

                      if (doneSets.length === 0) return null;

                      return (
                        <div key={exId} className="group">
                          <div className="flex justify-between items-center mb-2">
                             <h5 className="font-display uppercase text-sm tracking-wide text-zinc-200">{exercise?.name || 'Unknown Exercise'}</h5>
                             <span className="font-mono text-[9px] text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full">{doneSets.length} Sets</span>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {doneSets.map((s, idx) => (
                              <div key={idx} className="bg-zinc-800/30 border border-white/5 rounded-lg px-3 py-1 flex items-center gap-2">
                                <span className="font-mono text-[10px] text-white/80">{s.weight}</span>
                                <span className="text-[8px] text-zinc-600 uppercase font-mono">x</span>
                                <span className="font-mono text-[10px] whitespace-nowrap">{s.reps} <span className="text-[8px] text-zinc-600">reps</span></span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:flex flex-col w-96 bg-zinc-900/10 border border-zinc-800/50 border-dashed rounded-3xl items-center justify-center text-center p-12"
          >
            <Dumbbell className="text-zinc-800 mb-4" size={48} />
            <p className="font-display uppercase text-zinc-600 text-lg">Protocol Inspector</p>
            <p className="font-mono text-[10px] text-zinc-700 uppercase mt-2 tracking-widest">Select a date to audit performance logs</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
