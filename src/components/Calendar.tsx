import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Dumbbell, Zap, TrendingUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFitness } from '../store/FitnessContext';
import { getCycleDay, WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { SessionLog } from '../types/fitness';

interface CalendarProps {
  onNavigateToHistory?: (dateStr?: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ onNavigateToHistory }) => {
  const { logs, workouts, appState } = useFitness();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const getDayStatus = (date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    const log = (Object.values(logs) as SessionLog[]).find(l => l.date === key);
    const isFuture = date > new Date();

    const diff = differenceInCalendarDays(date, parseISO(appState?.cycleStart || format(new Date(), 'yyyy-MM-dd')));
    const cycleDay = (((diff % 8) + 8) % 8) + 1;
    const expectedWo = (workouts || []).find(w => w.cycleDay === cycleDay && w.isCore);

    if (log) {
      const wo = workouts.find(w => w.id === log.workoutId);
      if (!log.complete) return { color: '#6366f1', label: 'partial', log };
      return { color: WORKOUT_COLORS[wo?.type || 'push'], label: wo?.type || 'session', log };
    }

    if (!isFuture && expectedWo) {
      if (expectedWo.isRest) return { color: '#34d399', label: 'rest' };
      if (!isSameDay(date, new Date())) return { color: '#ef4444', label: 'missed' };
    }

    return null;
  };

  const calculateVolume = (log: SessionLog) => {
    let total = 0;
    Object.values(log.sets || {}).forEach(sets => {
      (sets || []).forEach(s => {
        if (s.done && s.weight && s.reps) {
          total += parseFloat(s.weight) * parseInt(s.reps);
        }
      });
    });
    return total;
  };

  const selectedLog = (selectedDate ? (Object.values(logs) as SessionLog[]).find(l => l.date === format(selectedDate, 'yyyy-MM-dd')) : null) as SessionLog | null;

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
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} 
              className="w-10 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} 
              className="w-10 h-10 flex items-center justify-center bg-zinc-900 border border-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors"
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
            const status = getDayStatus(day);
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <motion.button
                key={day.toString()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedDate(day);
                  const dateStr = format(day, 'yyyy-MM-dd');
                  if (logs[dateStr] && onNavigateToHistory) {
                    onNavigateToHistory(dateStr);
                  }
                }}
                className={`group relative min-h-[70px] p-2 border transition-all duration-200 rounded-2xl flex flex-col gap-1 overflow-hidden ${
                  !isCurrentMonth ? 'opacity-20 pointer-events-none' : ''
                } ${isSelected 
                    ? 'border-white/40 bg-white/10' 
                    : isToday 
                      ? 'border-white/20 bg-zinc-800/40' 
                      : 'border-zinc-800/30 bg-zinc-950/20 hover:bg-zinc-800/30'
                  }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-[11px] font-mono leading-none ${isToday || isSelected ? 'text-white' : 'text-zinc-600'}`}>
                    {format(day, 'd')}
                  </span>
                  {isToday && !isSelected && <div className="w-1 h-1 rounded-full bg-white animate-pulse" />}
                </div>

                {status && (
                  <div className="mt-auto flex flex-col items-center gap-1.5">
                    <div className="w-full h-0.5 rounded-full overflow-hidden bg-zinc-800/50">
                       <div className="h-full" style={{ backgroundColor: status.color, width: '100%' }} />
                    </div>
                    <span className="text-[7px] font-mono uppercase tracking-tighter text-zinc-500 truncate w-full text-center">
                      {status.label}
                    </span>
                  </div>
                )}
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
            { label: 'Rest', color: '#34d399' },
            { label: 'Missed', color: '#ef4444' },
            { label: 'Partial', color: '#6366f1' },
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
                    onClick={() => setSelectedDate(null)}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                {selectedLog ? (
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-zinc-950/40 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={12} className="text-blue-400" />
                        <span className="font-mono text-[9px] uppercase text-zinc-500">Volume</span>
                      </div>
                      <p className="text-xl font-display uppercase tracking-tight">
                        {calculateVolume(selectedLog).toLocaleString()} <span className="text-[10px] font-mono text-zinc-500">kg</span>
                      </p>
                    </div>
                    <div className="bg-zinc-950/40 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={12} className="text-amber-400" />
                        <span className="font-mono text-[9px] uppercase text-zinc-500">Duration</span>
                      </div>
                      <p className="text-xl font-display uppercase tracking-tight">
                        {selectedLog.duration} <span className="text-[10px] font-mono text-zinc-500">min</span>
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
              <div className="flex-1 p-6 overflow-y-auto">
                {selectedLog && (
                  <div className="space-y-6">
                    {Object.entries(selectedLog.sets || {}).map(([exId, sets]) => {
                      const workout = workouts.find(w => w.id === selectedLog.workoutId);
                      const exercise = workout?.exercises.find(e => e.id === exId);
                      const doneSets = (sets as any[]).filter(s => s.done);

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
