import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Plus, CheckCircle2, Trophy, Clock, Zap, MessageSquareQuote, Trash2 } from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { useConfirm } from '../store/ConfirmContext';
import { Workout, Exercise, SetLog, SessionLog } from '../types/fitness';
import { WORKOUT_COLORS, dk, getAdjustedCycleStart, generateId } from '../utils/fitnessHelpers';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';

interface ExerciseCardProps {
  ex: Exercise;
  ghostData: { lastSession: any; allTimePR: any };
  aiAdvice: Record<string, string>;
  loadingAdvice: string | null;
  sessionSets: Record<string, SetLog[]>;
  getAiAdvice: (ex: Exercise) => void;
  updateSet: (exId: string, setIndex: number, field: keyof SetLog, value: string | boolean) => void;
  addSet: (exId: string) => void;
  deleteSet: (exId: string, setIndex: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({
  ex,
  ghostData,
  aiAdvice,
  loadingAdvice,
  sessionSets,
  getAiAdvice,
  updateSet,
  addSet,
  deleteSet,
  isExpanded,
  onToggleExpand,
}) => {
  const { lastSession, allTimePR } = ghostData || { lastSession: null, allTimePR: null };
  const setsForEx = sessionSets[ex.id] || [];
  const isDone = setsForEx.slice(0, ex.sets).every(s => s.done);

  const prevIsDoneRef = useRef(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [flashingSets, setFlashingSets] = useState<Set<number>>(new Set());
  const timeoutsRef = useRef<any[]>([]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let timer: any;
    if (isDone && !prevIsDoneRef.current) {
      setJustCompleted(true);
      timer = setTimeout(() => setJustCompleted(false), 450);
      timeoutsRef.current.push(timer);
    }
    prevIsDoneRef.current = isDone;
    return () => {
      if (timer) {
        clearTimeout(timer);
        timeoutsRef.current = timeoutsRef.current.filter(t => t !== timer);
      }
    };
  }, [isDone]);

  const handleSetDone = (exId: string, si: number, currentDone: boolean) => {
    if (!currentDone) {
      haptics.success();
      setFlashingSets(prev => new Set(prev).add(si));
      const timer = setTimeout(() => {
        setFlashingSets(prev => {
          const next = new Set(prev);
          next.delete(si);
          return next;
        });
        timeoutsRef.current = timeoutsRef.current.filter(t => t !== timer);
      }, 500);
      timeoutsRef.current.push(timer);
    } else {
      haptics.light();
    }
    updateSet(exId, si, 'done', !currentDone);
  };

  const doneCount = setsForEx.slice(0, ex.sets).filter(s => s.done).length;
  const totalSets = ex.sets;

  return (
    <motion.div
      layout
      key={ex.id}
      animate={justCompleted ? { scale: [1, 1.015, 1] } : {}}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "bg-zinc-900/50 border rounded-3xl overflow-hidden transition-all",
        isDone ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-zinc-800"
      )}
    >
      {/* Header */}
      <div 
        onClick={onToggleExpand}
        className="p-6 cursor-pointer hover:bg-zinc-800/10 transition-colors flex items-start justify-between gap-4"
      >
        <div className="space-y-1">
          <h3 className="text-lg font-bold flex items-center gap-2">
            {ex.name}
            {isDone && <CheckCircle2 size={16} className="text-emerald-500" />}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 font-mono tracking-wider uppercase">
            <span>{ex.target}</span>
            <span>·</span>
            <span>{ex.sets} Sets</span>
            <span>·</span>
            <span>{ex.reps} Reps</span>
            <span>·</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px]",
              isDone ? "bg-emerald-500/20 text-emerald-400 font-bold" : "bg-zinc-800 text-zinc-400"
            )}>
              {doneCount}/{totalSets} Done
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => getAiAdvice(ex)}
            disabled={loadingAdvice === ex.id}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-orange-500 transition-colors"
          >
            <Zap size={18} className={loadingAdvice === ex.id ? 'animate-pulse text-orange-500' : ''} />
          </button>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-zinc-500 p-2"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* AI Advice Box */}
            {aiAdvice[ex.id] && (
              <div className="mx-6 mb-4 p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex gap-3 text-xs text-orange-200/80">
                <MessageSquareQuote size={18} className="shrink-0 text-orange-500" />
                <p>{aiAdvice[ex.id]}</p>
              </div>
            )}

            {/* Ghost Data Grid */}
            <div className="grid grid-cols-2 bg-zinc-950/20 border-y border-zinc-800/50">
              <div className="p-4 border-r border-zinc-800/50 space-y-1">
                <span className="text-[8px] font-mono uppercase text-zinc-600 tracking-[0.2em]">Last Session</span>
                {lastSession ? (
                  <div className="text-[10px] font-mono text-zinc-400">
                    {lastSession.sets.slice(0, 3).map((s: SetLog, idx: number) => (
                      <div key={idx}>Set {idx + 1}: {s.weight}kg × {s.reps}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-zinc-600 italic">No history data</div>
                )}
              </div>
              <div className="p-4 space-y-1">
                <span className="text-[8px] font-mono uppercase text-zinc-600 tracking-[0.2em]">All-Time PR</span>
                {allTimePR ? (
                  <div className="text-[10px] font-mono text-orange-500/80 flex items-center gap-1">
                    <Trophy size={10} /> {allTimePR.weight}kg × {allTimePR.reps}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-zinc-600 italic">No PR recorded</div>
                )}
              </div>
            </div>

            {/* Sets Table */}
            <div className="p-6 pt-4 space-y-3">
              <div className="grid grid-cols-[40px_1fr_1fr_60px_45px] gap-3 text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-600 px-2 text-center">
                <span>Set</span>
                <span>KG</span>
                <span>Reps</span>
                <span>Done</span>
                <span>Del</span>
              </div>

              <div className="space-y-4">
                {setsForEx.map((s: SetLog, si: number) => {
                  const isExtremeWeight = (parseFloat(s.weight) || 0) > 500;
                  const isExtremeReps = (parseInt(s.reps) || 0) > 100;
                  const isExtreme = isExtremeWeight || isExtremeReps;

                  return (
                    <div
                      key={s.id || `set-${si}`}
                      className={cn(
                        "space-y-1.5 rounded-2xl px-2 py-1.5 transition-colors duration-500",
                        flashingSets.has(si) ? "bg-emerald-500/10" : "bg-transparent"
                      )}
                    >
                      <div className="grid grid-cols-[40px_1fr_1fr_60px_45px] gap-3 items-center">
                        <span className="text-zinc-600 font-mono text-[10px] text-center">{si + 1}</span>
                        <input
                          type="number"
                          placeholder="kg"
                          value={s.weight}
                          inputMode="decimal"
                          onChange={(e) => updateSet(ex.id, si, 'weight', e.target.value)}
                          className={cn(
                            "bg-zinc-950 border rounded-xl py-3 px-1 text-sm text-center focus:border-zinc-500 outline-none transition-all placeholder:text-zinc-850 min-w-0 font-mono",
                            isExtremeWeight ? "border-amber-500/80 text-amber-400 focus:border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.15)]" : "border-zinc-800 focus:border-zinc-500"
                          )}
                        />
                        <input
                          type="number"
                          placeholder="reps"
                          value={s.reps}
                          inputMode="numeric"
                          onChange={(e) => updateSet(ex.id, si, 'reps', e.target.value)}
                          className={cn(
                            "bg-zinc-950 border rounded-xl py-3 px-1 text-sm text-center focus:border-zinc-500 outline-none transition-all placeholder:text-zinc-850 min-w-0 font-mono",
                            isExtremeReps ? "border-amber-500/80 text-amber-400 focus:border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.15)]" : "border-zinc-800 focus:border-zinc-500"
                          )}
                        />
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleSetDone(ex.id, si, s.done)}
                            className={cn(
                              "w-12 h-12 flex items-center justify-center rounded-xl border transition-all",
                              s.done ? "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "bg-zinc-950 border-zinc-800 text-zinc-850 hover:text-zinc-650"
                            )}
                          >
                            <CheckCircle2 size={24} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              haptics.warning();
                              deleteSet(ex.id, si);
                            }}
                            disabled={setsForEx.length <= 1}
                            className="w-12 h-12 flex items-center justify-center rounded-xl border border-zinc-800/40 bg-zinc-950/20 text-zinc-600 hover:text-red-500 hover:border-red-500/35 hover:bg-red-500/5 active:scale-95 transition-all disabled:opacity-10 disabled:pointer-events-none cursor-pointer"
                            title="Delete this set"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      {isExtreme && (
                        <div className="mx-10 p-2 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[10px] text-amber-400 font-mono animate-pulse">
                          <span className="shrink-0 font-bold">⚠️ UNUSUAL PARAMETER:</span>
                          <span>{isExtremeWeight ? 'Weight exceeds 500kg.' : ''} {isExtremeReps ? 'Reps exceed 100.' : ''} Double-check spelling!</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  haptics.medium();
                  addSet(ex.id);
                }}
                className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-600 border border-dashed border-zinc-800 rounded-xl hover:bg-zinc-900/50 hover:text-zinc-400 transition-colors"
              >
                <Plus size={14} /> Add Additional Set
              </button>
            </div>

            {/* Coach Note (Collapsed) */}
            {ex.note && (
              <div className="px-6 pb-6 pt-2 border-t border-zinc-800/30">
                <div className="bg-zinc-950/40 p-4 rounded-2xl text-[11px] text-zinc-500 leading-relaxed border border-zinc-900">
                  <span className="text-zinc-700 font-mono text-[8px] uppercase tracking-widest block mb-2">Coach's Field Notes</span>
                  {ex.note}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface SessionViewProps {
  onExit: () => void;
  workoutId?: string | null;
}

export const SessionView: React.FC<SessionViewProps> = ({ onExit, workoutId }) => {
  const { 
    workouts, 
    logs, 
    addLog, 
    updateCycleStart,
    activeSession,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession,
    user
  } = useFitness();
  const { confirm } = useConfirm();
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [sessionSets, setSessionSets] = useState<Record<string, SetLog[]>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [loadingAdvice, setLoadingAdvice] = useState<string | null>(null);
  const [expandedExId, setExpandedExId] = useState<string | null>(null);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const initializedWorkoutIdRef = useRef<string | null>(null);

  // Auto-expand first incomplete exercise on load
  useEffect(() => {
    if (!activeWorkout || expandedExId) return;
    const firstIncomplete = activeWorkout.exercises.find(ex => 
      !sessionSets[ex.id]?.slice(0, ex.sets).every(s => s.done)
    );
    setExpandedExId(firstIncomplete?.id || activeWorkout.exercises[0]?.id || null);
  }, [activeWorkout?.id, sessionSets, expandedExId]);

  // Clean up AbortControllers on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      abortControllersRef.current.forEach(controller => controller.abort());
    };
  }, []);

  useEffect(() => {
    const wo = activeWorkout || workouts.find(w => w.id === workoutId);
    if (!wo) return;

    if (!activeWorkout) {
      setActiveWorkout(wo);
      return;
    }

    // Only initialize if we don't have sets for THIS workout yet, and have not yet initialized it
    if (initializedWorkoutIdRef.current === wo.id) {
      return;
    }

    const hasSetsForThisWo = Object.keys(sessionSets).length > 0 && wo.exercises.every(ex => sessionSets[ex.id]);

    if (!hasSetsForThisWo) {
      initializedWorkoutIdRef.current = wo.id;
      if (activeSession && activeSession.workoutId === wo.id) {
        setStartTime(activeSession.startTime);
        setDuration(Math.floor((Date.now() - activeSession.startTime) / 1000));
        
        // Ensure all loaded sets have a stable unique id
        const restoredSets: Record<string, SetLog[]> = {};
        Object.entries(activeSession.sessionSets).forEach(([exId, sets]) => {
          restoredSets[exId] = (sets as SetLog[]).map(s => ({
            ...s,
            id: s.id || generateId()
          }));
        });
        setSessionSets(restoredSets);
      } else {
        setStartTime(Date.now());
        setDuration(0);
        
        const initialSets: Record<string, SetLog[]> = {};
        const sortedLogValues = (Object.values(logs) as SessionLog[]).sort((a, b) => a.date.localeCompare(b.date));

        wo.exercises.forEach(ex => {
          const exLogs = sortedLogValues
            .filter(l => l.sets?.[ex.id] && (l.sets[ex.id] as SetLog[]).some(s => s.done && s.weight));
          const lastExLog = exLogs.length > 0 ? (exLogs[exLogs.length - 1].sets?.[ex.id] as SetLog[]) : null;

          initialSets[ex.id] = Array.from({ length: Math.max(ex.sets, lastExLog?.length || 0) }, (_, idx) => {
            const prevSet = lastExLog?.[idx];
            return {
              id: prevSet?.id || generateId(),
              weight: prevSet?.weight || '',
              reps: prevSet?.reps || '',
              done: false
            };
          });
        });
        setSessionSets(initialSets);
        startActiveSession(wo.id, initialSets, Date.now());
      }
    }
  }, [activeWorkout?.id, workoutId, activeSession, workouts, logs, startActiveSession, sessionSets]); // Run when identity of the workout changes or restored session is loaded

  useEffect(() => {
    let interval: any;
    if (startTime && !isFinishing) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [startTime, isFinishing]);

  const formatTime = React.useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  const ghostData = React.useMemo(() => {
    const data: Record<string, { lastSession: any, allTimePR: any }> = {};
    if (!activeWorkout) return data;

    activeWorkout.exercises.forEach(ex => {
      const exLogs = (Object.values(logs) as SessionLog[])
        .map(l => ({ date: l.date, sets: l.sets?.[ex.id] }))
        .filter(l => l.sets && (l.sets as SetLog[]).some(s => s.done && s.weight));

      const lastSession = exLogs.length > 0 ? exLogs[exLogs.length - 1] : null;

      let allTimePR: { weight: number; reps: string; date: string } | null = null;
      exLogs.forEach(l => {
        (l.sets as SetLog[]).forEach(s => {
          const w = parseFloat(s.weight);
          if (s.done && (!allTimePR || w > allTimePR.weight)) {
            allTimePR = { weight: w, reps: s.reps, date: l.date };
          }
        });
      });
      data[ex.id] = { lastSession, allTimePR };
    });
    return data;
  }, [logs, activeWorkout?.id]);

  const todaysPRs = React.useMemo(() => {
    if (!activeWorkout || !isFinishing) return [];
    const prs: { name: string; weight: number; reps: string; isNew: boolean }[] = [];
    
    activeWorkout.exercises.forEach(ex => {
      const todaySets = sessionSets[ex.id] || [];
      const doneToday = todaySets.filter(s => s.done && s.weight);
      if (doneToday.length === 0) return;
      
      const todayWeights = doneToday.map(s => parseFloat(s.weight) || 0);
      const todayMax = Math.max(...todayWeights);
      if (todayMax <= 0) return;
      
      const bestTodaySet = doneToday.find(s => (parseFloat(s.weight) || 0) === todayMax);
      const todayReps = bestTodaySet?.reps || '0';
      
      const historicLogs = (Object.values(logs) as SessionLog[])
        .filter(l => l.date !== dk()); // prior to today
        
      let prevPRWeight = 0;
      let hasHistory = false;
      
      historicLogs.forEach(l => {
         const sets = l.sets?.[ex.id] || [];
         sets.forEach(s => {
           if (s.done && s.weight) {
             hasHistory = true;
             const w = parseFloat(s.weight) || 0;
             if (w > prevPRWeight) {
               prevPRWeight = w;
             }
           }
         });
      });
      
      if (!hasHistory || todayMax > prevPRWeight) {
        prs.push({
          name: ex.name,
          weight: todayMax,
          reps: todayReps,
          isNew: !hasHistory
        });
      }
    });
    
    return prs;
  }, [isFinishing, activeWorkout, sessionSets, logs]);

  const updateSet = (exId: string, setIndex: number, field: keyof SetLog, value: string | boolean) => {
    // Audit: Prevent excessive length or non-numeric input for weights/reps
    if (typeof value === 'string') {
      if (value.length > 6) return; // Limit to 6 chars (e.g. 999.99)
      if (field === 'reps' && !/^\d*$/.test(value)) return; // Reps must be integers
    }

    const nextSets = {
      ...sessionSets,
      [exId]: sessionSets[exId].map((s, i) => i === setIndex ? { ...s, [field]: value } : s)
    };
    setSessionSets(nextSets);
    updateActiveSessionSets(nextSets);

    // Auto-advance logic: if a set is marked done, check if the exercise is complete
    if (field === 'done' && value === true && activeWorkout) {
      const ex = activeWorkout.exercises.find(e => e.id === exId);
      if (ex) {
        const isNowDone = nextSets[exId]?.slice(0, ex.sets).every(s => s.done);
        if (isNowDone) {
          // Find the first incomplete exercise
          const nextIncomplete = activeWorkout.exercises.find(e => 
            !nextSets[e.id]?.slice(0, e.sets).every(s => s.done)
          );
          if (nextIncomplete) {
            setExpandedExId(nextIncomplete.id);
          }
        }
      }
    }
  };

  const addSet = (exId: string) => {
    const nextSets = {
      ...sessionSets,
      [exId]: [...(sessionSets[exId] || []), { id: generateId(), weight: '', reps: '', done: false }]
    };
    setSessionSets(nextSets);
    updateActiveSessionSets(nextSets);
  };

  const deleteSet = async (exId: string, setIndex: number) => {
    const sets = sessionSets[exId] || [];
    if (sets.length <= 1) return;
    
    const setToDelete = sets[setIndex];
    if (setToDelete?.done) {
      const proceed = await confirm({
        title: 'Delete Completed Set',
        message: `Are you sure you want to delete Set ${setIndex + 1}? This set is marked as completed and will be lost.`,
        isDanger: true
      });
      if (!proceed) return;
    }

    const nextSets = {
      ...sessionSets,
      [exId]: sets.filter((_, i) => i !== setIndex)
    };
    setSessionSets(nextSets);
    updateActiveSessionSets(nextSets);
  };

  const getAiAdvice = async (ex: Exercise) => {
    if (!user) {
      setAiAdvice(prev => ({ 
        ...prev, 
        [ex.id]: "AI Coaching requires a secure verified session. Please sign in under the 'Terminal / Backups' settings tab." 
      }));
      return;
    }

    // Abort previous advice request for this exercise if one is active
    if (abortControllersRef.current.has(ex.id)) {
      abortControllersRef.current.get(ex.id)?.abort();
    }

    const controller = new AbortController();
    abortControllersRef.current.set(ex.id, controller);

    setLoadingAdvice(ex.id);
    try {
      const history = (Object.values(logs) as SessionLog[])
        .map(l => ({ date: l.date, sets: l.sets?.[ex.id] }))
        .filter(l => l.sets && (l.sets as SetLog[]).some(s => s.done))
        .slice(-3); // Last 3 sessions

      const idToken = await user.getIdToken();

      const response = await fetch('/api/fitness/advice', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          exercise: ex,
          history
        }),
        signal: controller.signal
      });
      
      if (!response.ok) {
        let serverErrorMsg = `Server status: ${response.status}`;
        try {
          const isJson = response.headers.get('content-type')?.includes('application/json');
          if (isJson) {
            const errData = await response.json().catch(() => null);
            if (errData && errData.error) {
              serverErrorMsg = errData.error;
            }
          }
        } catch (_) {}
        throw new Error(serverErrorMsg);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Non-JSON response received from coaching service.');
      }

      const data = await response.json();
      setAiAdvice(prev => ({ ...prev, [ex.id]: data.suggestion || "No advice provided. Stick to the program!" }));
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // Ignored, request was aborted
        return;
      }
      console.error('Failed to get AI advice', error);
      
      // Selectively present detailed server/Gemini errors or guide user if missing config
      let humanMsg = "Unable to reach the Coach's server right now. Keep your form strict, match your targets, and try again shortly!";
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("GEMINI_API_KEY") || msg.includes("api key") || msg.includes("API key")) {
          humanMsg = "Coaching engine requires a configured GEMINI_API_KEY environment variable. Please make sure it is added inside the project Settings.";
        } else if (msg.includes("Too many advice requests") || msg.includes("rate-limit")) {
          humanMsg = "Coaching engine is on a set cooldown: " + msg;
        } else if (msg && !msg.includes("Server status") && !msg.includes("Non-JSON")) {
          humanMsg = msg;
        }
      }

      setAiAdvice(prev => ({ 
        ...prev, 
        [ex.id]: humanMsg 
      }));
    } finally {
      if (abortControllersRef.current.get(ex.id) === controller) {
        abortControllersRef.current.delete(ex.id);
        setLoadingAdvice(null);
      }
    }
  };

  const calculateVolumeLocal = () => {
    return (Object.values(sessionSets).flat() as SetLog[]).reduce((total: number, s: SetLog) => {
      if (s.done && s.weight && s.reps) {
        const weightVal = parseFloat(s.weight) || 0;
        const repsVal = parseInt(s.reps, 10) || 0;
        return total + (weightVal * repsVal);
      }
      return total;
    }, 0);
  };

  const finishSession = async () => {
    if (!activeWorkout || isSubmitting || isFinishing) return;
    setIsSubmitting(true);

    // Safety checks for extreme or illogical inputs to secure tracking data
    const extremeSets: { exName: string; weight: number; reps: number }[] = [];
    Object.entries(sessionSets).forEach(([exId, sets]) => {
      const exName = activeWorkout.exercises.find(e => e.id === exId)?.name || 'Exercise';
      (sets as SetLog[]).forEach((s: SetLog) => {
        if (s.done) {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps) || 0;
          if (w > 500 || r > 100) {
            extremeSets.push({ exName, weight: w, reps: r });
          }
        }
      });
    });

    if (extremeSets.length > 0) {
      const warningLines = extremeSets.map(e => `• ${e.exName}: ${e.weight}kg × ${e.reps} reps`).join('\n');
      const proceed = await confirm({
        title: 'Illogical Protocol Warning',
        message: `Abnormally high parameters detected:\n${warningLines}\n\nMost training routines don't exceed 500kg or 100 reps per set. Proceed only if these are genuine, intentional values and NOT typos.`,
        isDanger: true
      });
      if (!proceed) {
        setIsSubmitting(false);
        return;
      }
    }

    haptics.success();
    const logId = `${dk()}_${activeWorkout.id}_${Date.now()}`;
    const finalLogs = {
      workoutId: activeWorkout.id,
      date: dk(),
      sets: sessionSets,
      complete: true,
      durationMinutes: Math.floor(duration / 60)
    };
    addLog(logId, finalLogs);

    if (activeWorkout.cycleDay && activeWorkout.isCore) {
      const newCycleStart = getAdjustedCycleStart(activeWorkout.cycleDay);
      updateCycleStart(newCycleStart);
    }

    clearActiveSession();
    setIsFinishing(true);
    setIsSubmitting(false);
  };

  const handleExitAttempt = async () => {
    const proceed = await confirm({
      title: 'Abandon Active Session?',
      message: 'Your current training progress is in-flight. Exiting now will suspend or clear this active protocol. Are you sure you want to abort?',
      isDanger: true
    });
    if (proceed) {
      clearActiveSession();
      onExit();
    }
  };

  if (!activeWorkout) return (
    <div className="py-20 text-center space-y-6">
      <h2 className="text-2xl font-bold">Select a Protocol to Begin</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {workouts.map(wo => (
            <button
              key={wo.id}
              onClick={() => setActiveWorkout(wo)}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-left hover:border-zinc-500 transition-colors"
            >
              <div className="text-xs font-mono text-zinc-500">{wo.badge}</div>
              <div className="font-bold">{wo.name}</div>
            </button>
          ))}
      </div>
    </div>
  );

  if (isFinishing) {
    return (
      <div className="py-20 text-center space-y-8 max-w-lg mx-auto">
        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase">Session Cleared</h1>
          <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">Target Achieved · Stats Synchronized</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900/50 border border-zinc-800 border-t-2 border-t-blue-500/40 p-6 rounded-3xl text-center">
            <div className="text-3xl font-black text-blue-500">{Math.floor(duration / 60)}m</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Duration</div>
          </div>
           <div className="bg-zinc-900/50 border border-zinc-800 border-t-2 border-t-orange-500/40 p-6 rounded-3xl text-center">
            <div className="text-3xl font-black text-orange-500">{(Object.values(sessionSets).flat() as SetLog[]).filter(s => s.done).length}</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Sets Done</div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 border-t-2 border-t-emerald-500/40 p-6 rounded-3xl col-span-2 text-center">
            <div className="text-3xl font-black text-emerald-500">
              {calculateVolumeLocal().toLocaleString()}kg
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Total Volume Lifted</div>
          </div>

          {/* Today's Personal Records Summary */}
          {todaysPRs.length > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20 p-5 rounded-3xl col-span-2 space-y-3 text-left">
              <div className="flex items-center gap-2">
                <Trophy className="text-amber-500 animate-pulse" size={16} />
                <span className="font-mono text-[9px] text-amber-400 uppercase tracking-[0.2em] font-bold">New Records Set Today!</span>
              </div>
              <div className="space-y-2">
                {todaysPRs.map((pr, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1.5 border-b border-zinc-800/40 last:border-0 text-xs">
                    <div>
                      <div className="font-bold text-white leading-tight">{pr.name}</div>
                      <div className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-wider">
                        {pr.isNew ? 'Baseline Established' : 'Personal Record Smashed'}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-orange-500 bg-orange-500/5 border border-orange-550/10 px-2 py-1 rounded-xl">
                      {pr.weight}kg × {pr.reps}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onExit}
          className="w-full py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-[0.2em] text-sm hover:scale-105 active:scale-95 transition-all"
        >
          Dismiss Summary
        </button>
      </div>
    );
  }

  const allExercisesDone = activeWorkout.exercises.every(ex =>
    (sessionSets[ex.id] || []).slice(0, ex.sets).every(s => s.done)
  );

  return (
    <div className="space-y-8 pb-32">
      {/* Session Top Bar */}
      <header 
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-40 bg-[#09090e]/95 backdrop-blur-xl py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/50 -mx-4 px-4 pb-6 mb-6 session-sticky-header transition-all duration-300"
        style={{
          borderTop: `1px solid ${WORKOUT_COLORS[activeWorkout.type]}40`
        }}
      >
        <div className="flex items-center gap-4">
          <button onClick={handleExitAttempt} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="space-y-1">
            <div
               className="inline-flex px-2 py-0.5 rounded-full text-[8px] font-mono font-bold tracking-widest uppercase"
               style={{
                 backgroundColor: `${WORKOUT_COLORS[activeWorkout.type]}22`,
                 color: WORKOUT_COLORS[activeWorkout.type],
                 border: `1px solid ${WORKOUT_COLORS[activeWorkout.type]}55`
               }}
            >
              {activeWorkout.badge}
            </div>
            <h2 className="text-2xl font-black uppercase leading-none">{activeWorkout.name}</h2>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2 font-mono">
              <Clock size={16} className="text-zinc-500" />
              <span className="text-xl font-black tabular-nums">{formatTime(duration)}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-zinc-600">
              <span className="text-xs font-black tabular-nums text-zinc-400">
                {calculateVolumeLocal().toLocaleString()}
              </span>
              <span className="text-[9px] uppercase tracking-widest">kg</span>
            </div>
          </div>
          <button
            onClick={finishSession}
            disabled={isSubmitting || isFinishing}
            className={cn(
              "px-6 py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none",
              allExercisesDone 
                ? "shadow-[0_0_20px_rgba(255,255,255,0.25)] animate-pulse font-extrabold" 
                : "shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            )}
          >
            {isSubmitting ? 'Syncing...' : 'Finish'}
          </button>
        </div>
      </header>

      {/* Exercises List */}
      <div className="space-y-6">
        {activeWorkout.exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            ghostData={ghostData[ex.id]}
            aiAdvice={aiAdvice}
            loadingAdvice={loadingAdvice}
            sessionSets={sessionSets}
            getAiAdvice={getAiAdvice}
            updateSet={updateSet}
            addSet={addSet}
            deleteSet={deleteSet}
            isExpanded={expandedExId === ex.id}
            onToggleExpand={() => {
              setExpandedExId(prev => prev === ex.id ? null : ex.id);
            }}
          />
        ))}

        {activeWorkout.cardio && (
          <div className="bg-gradient-to-br from-zinc-800/10 to-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500">Active Finish Protocol</span>
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wide">{activeWorkout.cardio.name}</h3>
              <p className="text-xs text-zinc-500 font-mono tracking-tight">{activeWorkout.cardio.detail}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-2xl flex items-center gap-3 self-stretch sm:self-auto justify-center">
              <Clock size={16} className="text-orange-500" />
              <div className="text-left leading-none">
                <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Target Dur</span>
                <span className="text-xs font-bold font-mono tracking-tight">{activeWorkout.cardio.duration}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

