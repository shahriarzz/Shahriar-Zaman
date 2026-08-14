import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Plus, CheckCircle2, Trophy, Clock, Zap, MessageSquareQuote, Trash2 } from 'lucide-react';
import { useFitness } from '../context/FitnessContext';
import { useConfirm } from '../context/ConfirmContext';
import { Workout, Exercise, SetLog, SessionLog, WorkoutType } from '../types/fitness';
import { WORKOUT_COLORS, getWorkoutBadgeStyle, dk, getAdjustedCycleStart, generateId, resolveWorkoutExercise } from '../utils/fitnessHelpers';
import { sanitizeSessionLog } from '../utils/fitnessCalculations';
import { useFitnessDerivedData } from '../hooks/useFitnessDerivedData';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';
import {
  Card,
  StatCard,
  Badge,
  Button,
  Input,
  Banner,
  Stack,
  Grid,
  SEMANTIC_COLORS
} from './ui';

interface ExerciseCardProps {
  ex: Exercise;
  workoutType: WorkoutType;
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
  workoutType,
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
      key={ex.id}
      animate={justCompleted ? { scale: [1, 1.015, 1] } : {}}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "bg-zinc-900/80 border rounded-3xl overflow-hidden transition-all",
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
              <Badge
                label={`${doneCount}/${totalSets} Done`}
                color={isDone ? 'emerald' : 'zinc'}
                size="sm"
                dot={false}
              />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => getAiAdvice(ex)}
            disabled={loadingAdvice === ex.id}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 transition-colors"
          >
            <Zap 
              size={18} 
              className={loadingAdvice === ex.id ? 'animate-pulse' : ''} 
              style={{ color: loadingAdvice === ex.id ? WORKOUT_COLORS[workoutType] : undefined }}
            />
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
              <div 
                className="mx-6 mb-4 p-4 rounded-2xl flex gap-3 text-xs border"
                style={{
                  backgroundColor: `${WORKOUT_COLORS[workoutType]}0D`,
                  borderColor: `${WORKOUT_COLORS[workoutType]}1A`,
                  color: `${WORKOUT_COLORS[workoutType]}CC`,
                }}
              >
                <MessageSquareQuote size={18} className="shrink-0" style={{ color: WORKOUT_COLORS[workoutType] }} />
                <p>{aiAdvice[ex.id]}</p>
              </div>
            )}

            {/* Ghost Data Grid */}
            <Grid cols={2} gap="none" className="bg-zinc-950/20 border-y border-zinc-800/50">
              <div className="p-4 border-r border-zinc-800/50 space-y-1">
                <span className="text-[8px] font-mono uppercase text-zinc-600 tracking-[0.2em]">Last Session</span>
                {lastSession ? (
                  <div className="text-[10px] font-mono text-zinc-400">
                    {lastSession.sets.slice(0, 3).map((s: SetLog, idx: number) => (
                      <div key={s.id || `ghost-set-${idx}`}>Set {idx + 1}: {s.weight}kg × {s.reps}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-zinc-600 italic">No history data</div>
                )}
              </div>
              <div className="p-4 space-y-1">
                <span className="text-[8px] font-mono uppercase text-zinc-600 tracking-[0.2em]">All-Time PR</span>
                {allTimePR ? (
                  <div className="text-[10px] font-mono flex items-center gap-1" style={{ color: `${WORKOUT_COLORS[workoutType]}CC` }}>
                    <Trophy size={10} style={{ color: WORKOUT_COLORS[workoutType] }} /> {allTimePR.weight}kg × {allTimePR.reps}
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-zinc-600 italic">No PR recorded</div>
                )}
              </div>
            </Grid>

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
                      key={s.id ? `set-${ex.id}-${s.id}-${si}` : `set-${ex.id}-${si}`}
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
    exerciseDefinitions,
    addLog, 
    updateCycleStart,
    activeSession,
    startActiveSession,
    updateActiveSessionSets,
    clearActiveSession,
    user
  } = useFitness();
  const { getLatestForExercise, getHeaviestForExercise, getHistoryForExercise } = useFitnessDerivedData();
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
  // Explicit lifecycle ref: prevents background snapshot updates (e.g. logs/workouts) from resetting active sessionSets
  const initializedWorkoutIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef<boolean>(false);

  // Auto-expand first incomplete exercise on load
  useEffect(() => {
    if (!activeWorkout || expandedExId) return;
    const firstIncomplete = activeWorkout.exercises.find(ex => 
      !sessionSets[ex.exerciseDefinitionId]?.slice(0, ex.sets).every(s => s.done)
    );
    setExpandedExId(firstIncomplete?.exerciseDefinitionId || activeWorkout.exercises[0]?.exerciseDefinitionId || null);
  }, [activeWorkout?.id, sessionSets, expandedExId]);

  // Clean up AbortControllers on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      abortControllersRef.current.forEach(controller => controller.abort());
    };
  }, []);

  // Session Initialization Guard:
  // Once initialized for a given workoutId, background updates to `logs` or `workouts` will NEVER overwrite current sessionSets.
  useEffect(() => {
    const targetWorkoutId = workoutId || activeWorkout?.id;
    if (!targetWorkoutId) return;

    const wo = workouts.find(w => w.id === targetWorkoutId) || activeWorkout;
    if (!wo) return;

    if (!activeWorkout || activeWorkout.id !== wo.id) {
      setActiveWorkout(wo);
    }

    // Protection: If this workout is already initialized in state, do not overwrite with background snapshots
    if (isInitializedRef.current && initializedWorkoutIdRef.current === wo.id) {
      return;
    }

    // If restoring an active in-flight session
    if (activeSession && activeSession.workoutId === wo.id) {
      initializedWorkoutIdRef.current = wo.id;
      isInitializedRef.current = true;
      setStartTime(activeSession.startTime);
      setDuration(Math.floor((Date.now() - activeSession.startTime) / 1000));
      
      const restoredSets: Record<string, SetLog[]> = {};
      Object.entries(activeSession.sessionSets).forEach(([exDefId, sets]) => {
        restoredSets[exDefId] = (sets as SetLog[]).map(s => ({
          ...s,
          id: s.id || generateId()
        }));
      });
      setSessionSets(restoredSets);
      return;
    }

    // Otherwise, initialize a fresh session for this workout
    initializedWorkoutIdRef.current = wo.id;
    isInitializedRef.current = true;
    const sessionStart = Date.now();
    setStartTime(sessionStart);
    setDuration(0);
    
    const initialSets: Record<string, SetLog[]> = {};

    wo.exercises.forEach(ex => {
      const exDefId = ex.exerciseDefinitionId;
      // Fetch latest completed historical session using canonical index
      const latestHistorical = getLatestForExercise(exDefId);
      const lastExSets = latestHistorical?.sets || null;

      // STEP 6 Invariant: Programmed sets count (ex.sets) determines initial displayed rows.
      // Prior session performance provides weight/reps guidance for those rows without expanding row count.
      initialSets[exDefId] = Array.from({ length: ex.sets }, (_, idx) => {
        const prevSet = lastExSets?.[idx];
        return {
          id: generateId(),
          weight: prevSet?.weight || '',
          reps: prevSet?.reps || '',
          done: false
        };
      });
    });

    setSessionSets(initialSets);
    startActiveSession(wo.id, initialSets, sessionStart);
  }, [workoutId, workouts, activeSession, startActiveSession, getLatestForExercise, activeWorkout]);

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

  // Ghost data & All-Time Heaviest Weight computed via canonical derived index
  const ghostData = React.useMemo(() => {
    const data: Record<string, { lastSession: any, allTimePR: any }> = {};
    if (!activeWorkout) return data;

    activeWorkout.exercises.forEach(ex => {
      const exDefId = ex.exerciseDefinitionId;
      const lastSession = getLatestForExercise(exDefId);
      const allTimePR = getHeaviestForExercise(exDefId);
      data[exDefId] = { lastSession, allTimePR };
    });
    return data;
  }, [activeWorkout, getLatestForExercise, getHeaviestForExercise]);

  // Today's PRs: Heaviest completed weight compared against prior historical logs
  const todaysPRs = React.useMemo(() => {
    if (!activeWorkout || !isFinishing) return [];
    const prs: { name: string; weight: number; reps: string; isNew: boolean }[] = [];

    activeWorkout.exercises.forEach(ex => {
      const exDefId = ex.exerciseDefinitionId;
      const resolvedEx = resolveWorkoutExercise(ex, exerciseDefinitions);
      const todaySets = sessionSets[exDefId] || [];
      const doneToday = todaySets.filter(s => s.done && s.weight);
      if (doneToday.length === 0) return;
      
      const todayWeights = doneToday.map(s => parseFloat(s.weight) || 0);
      const todayMax = Math.max(...todayWeights);
      if (todayMax <= 0) return;
      
      const bestTodaySet = doneToday.find(s => (parseFloat(s.weight) || 0) === todayMax);
      const todayReps = bestTodaySet?.reps || '0';
      
      const prevPR = getHeaviestForExercise(exDefId);
      const hasHistory = !!prevPR;
      const prevPRWeight = prevPR?.weight || 0;
      
      if (!hasHistory || todayMax > prevPRWeight) {
        prs.push({
          name: resolvedEx.name,
          weight: todayMax,
          reps: todayReps,
          isNew: !hasHistory
        });
      }
    });
    
    return prs;
  }, [isFinishing, activeWorkout, sessionSets, exerciseDefinitions, getHeaviestForExercise]);

  // Resilient set mutation with defensive fallback and input validation
  const updateSet = (exId: string, setIndex: number, field: keyof SetLog, value: string | boolean) => {
    const currentSets = sessionSets[exId] || [];
    if (setIndex < 0 || setIndex >= currentSets.length) return;

    // Input validation & sanitization
    if (typeof value === 'string') {
      if (value.length > 7) return; // Prevent unreasonable input length
      if (field === 'reps') {
        // Reps: allow empty while typing, or positive integers
        if (!/^\d*$/.test(value)) return;
      }
      if (field === 'weight') {
        // Weight: allow empty, positive integers or positive decimals (e.g. 0, 0.5, 10, 100.25)
        if (!/^\d*\.?\d*$/.test(value)) return;
      }
    }

    const nextSets = {
      ...sessionSets,
      [exId]: currentSets.map((s, i) => i === setIndex ? { ...s, [field]: value } : s)
    };
    setSessionSets(nextSets);
    updateActiveSessionSets(nextSets);

    // Auto-advance logic: if a set is marked done, check if the exercise is complete
    if (field === 'done' && value === true && activeWorkout) {
      const ex = activeWorkout.exercises.find(e => e.exerciseDefinitionId === exId);
      if (ex) {
        const isNowDone = nextSets[exId]?.slice(0, ex.sets).every(s => s.done);
        if (isNowDone) {
          // Find the first incomplete exercise
          const nextIncomplete = activeWorkout.exercises.find(e => 
            !nextSets[e.exerciseDefinitionId]?.slice(0, e.sets).every(s => s.done)
          );
          if (nextIncomplete) {
            setExpandedExId(nextIncomplete.exerciseDefinitionId);
          }
        }
      }
    }
  };

  const addSet = (exId: string) => {
    const currentSets = sessionSets[exId] || [];
    const nextSets = {
      ...sessionSets,
      [exId]: [...currentSets, { id: generateId(), weight: '', reps: '', done: false }]
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
    // Canonical data identity: ex is the resolved Exercise where ex.id === ex.exerciseDefinitionId
    const exDefId = ex.exerciseDefinitionId || ex.id;

    // Abort previous advice request for this exercise if one is active
    if (abortControllersRef.current.has(exDefId)) {
      abortControllersRef.current.get(exDefId)?.abort();
    }

    const controller = new AbortController();
    abortControllersRef.current.set(exDefId, controller);

    setLoadingAdvice(exDefId);
    try {
      // Historical lookup using canonical derived index (most recent 3 sessions)
      const history = getHistoryForExercise(exDefId).slice(0, 3);

      let idToken = '';
      if (user && typeof user.getIdToken === 'function') {
        try {
          idToken = await user.getIdToken();
        } catch (tokenErr) {
          console.warn("Could not retrieve Firebase ID token:", tokenErr);
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/fitness/advice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          exercise: ex,
          history
        }),
        signal: controller.signal
      });
      
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!response.ok) {
        let serverErrorMsg = `Server error (${response.status})`;
        if (isJson) {
          const errData = await response.json().catch(() => null);
          if (errData && errData.error) {
            serverErrorMsg = errData.error;
          }
        } else {
          const textData = await response.text().catch(() => '');
          if (textData) {
            serverErrorMsg = textData.substring(0, 150);
          }
        }
        throw new Error(serverErrorMsg);
      }

      if (!isJson) {
        throw new Error('Server returned an invalid response format.');
      }

      const data = await response.json();
      setAiAdvice(prev => ({ ...prev, [exDefId]: data.suggestion || "No advice provided. Stick to the program!" }));
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // Ignored, request was aborted
        return;
      }
      console.error('AI Coaching advice service notice:', error?.message || error);
      
      // Selectively present detailed server/Gemini errors or guide user if missing config
      let humanMsg = "Unable to reach the Coach's server right now. Keep your form strict, match your targets, and try again shortly!";
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("GEMINI_API_KEY") || msg.includes("api key") || msg.includes("API key")) {
          humanMsg = "Coaching engine requires a configured GEMINI_API_KEY environment variable. Please make sure it is added inside the project Settings.";
        } else if (msg.includes("Too many advice requests") || msg.includes("rate-limit") || msg.includes("cooldown")) {
          humanMsg = "Coaching engine cooldown: " + msg;
        } else if (msg && !msg.includes("Server error") && !msg.includes("invalid response")) {
          humanMsg = msg;
        }
      }

      setAiAdvice(prev => ({ 
        ...prev, 
        [exDefId]: humanMsg 
      }));
    } finally {
      if (abortControllersRef.current.get(exDefId) === controller) {
        abortControllersRef.current.delete(exDefId);
        setLoadingAdvice(null);
      }
    }
  };

  // Calculate volume: only done === true sets count as completed training volume
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

  // STEP 3: Transactional session completion flow
  // 1. Validate extreme parameters
  // 2. Harden & sanitize SessionLog contract
  // 3. Persist (await addLog and updateCycleStart)
  // 4. Clear active in-flight session
  // 5. Show completion summary
  const finishSession = async () => {
    if (!activeWorkout || isSubmitting || isFinishing) return;
    setIsSubmitting(true);

    // Safety checks for extreme or illogical inputs to secure tracking data
    const extremeSets: { exName: string; weight: number; reps: number }[] = [];
    Object.entries(sessionSets).forEach(([exDefId, sets]) => {
      const ex = activeWorkout.exercises.find(e => e.exerciseDefinitionId === exDefId);
      const exName = ex ? resolveWorkoutExercise(ex, exerciseDefinitions).name : 'Exercise';
      (sets as SetLog[]).forEach((s: SetLog) => {
        if (s.done) {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps, 10) || 0;
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

    try {
      haptics.success();
      const logId = `${dk()}_${activeWorkout.id}_${Date.now()}`;
      const rawLog = {
        id: logId,
        workoutId: activeWorkout.id,
        date: dk(),
        sets: sessionSets,
        complete: true,
        durationMinutes: Math.floor(duration / 60)
      };
      
      // Harden log according to GainLog contract
      const sanitizedLog = sanitizeSessionLog(rawLog);

      // Await persistence (offline-first ensures local save occurs immediately)
      await addLog(logId, sanitizedLog);

      if (activeWorkout.cycleDay && activeWorkout.isCore) {
        const newCycleStart = getAdjustedCycleStart(activeWorkout.cycleDay);
        await updateCycleStart(newCycleStart);
      }

      // Only after persistence completes do we clear active session and display finish summary
      clearActiveSession();
      setIsFinishing(true);
    } catch (err) {
      console.error("Failed to persist session log:", err);
    } finally {
      setIsSubmitting(false);
    }
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
    <Stack spacing="xl" className="py-20">
      <div className="text-center">
        <h2 className="text-2xl font-bold font-display uppercase tracking-wide">Select a Protocol to Begin</h2>
      </div>
      <Grid cols={1} colsSm={2} gap="md">
        {workouts.map((wo, woIdx) => (
          <Card
            key={wo.id ? `wo-${wo.id}-${woIdx}` : `wo-${woIdx}`}
            variant="interactive"
            padding="md"
            onClick={() => setActiveWorkout(wo)}
            className="text-left cursor-pointer"
          >
            <div className="text-xs font-mono text-zinc-500 mb-1">{wo.badge}</div>
            <div className="font-bold text-white text-base">{wo.name}</div>
          </Card>
        ))}
      </Grid>
    </Stack>
  );

  if (isFinishing) {
    return (
      <Stack spacing="xl" className="py-20 text-center max-w-lg mx-auto">
        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase">Session Cleared</h1>
          <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">Target Achieved · Stats Synchronized</p>
        </div>

        <Grid cols={2} gap="md">
          <StatCard
            label="Duration"
            value={`${Math.floor(duration / 60)}m`}
            accent="blue"
            size="hero"
          />
          <StatCard
            label="Sets Done"
            value={(Object.values(sessionSets).flat() as SetLog[]).filter(s => s.done).length}
            accent="orange"
            size="hero"
          />
          <StatCard
            label="Total Volume Lifted"
            value={calculateVolumeLocal().toLocaleString()}
            unit="kg"
            accent="emerald"
            size="hero"
            className="col-span-2"
          />

          {/* Today's Personal Records Summary */}
          {todaysPRs.length > 0 && (
            <Card
              variant="elevated"
              accent="amber"
              padding="md"
              className="col-span-2 space-y-3 text-left bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-amber-500/20"
            >
              <div className="flex items-center gap-2">
                <Trophy className="text-amber-500 animate-pulse" size={16} />
                <span className="font-mono text-[9px] text-amber-400 uppercase tracking-[0.2em] font-bold">New Records Set Today!</span>
              </div>
              <div className="space-y-2">
                {todaysPRs.map((pr, idx) => (
                  <div key={`session-pr-${pr.name}-${idx}`} className="flex justify-between items-center py-1.5 border-b border-zinc-800/40 last:border-0 text-xs">
                    <div>
                      <div className="font-bold text-white leading-tight">{pr.name}</div>
                      <div className="text-[7.5px] font-mono text-zinc-500 uppercase tracking-wider">
                        {pr.isNew ? 'Baseline Established' : 'Personal Record Smashed'}
                      </div>
                    </div>
                    <Badge
                      label={`${pr.weight}kg × ${pr.reps}`}
                      color="orange"
                      size="sm"
                      dot={false}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Grid>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onExit}
          className="py-4"
        >
          Dismiss Summary
        </Button>
      </Stack>
    );
  }

  const allExercisesDone = activeWorkout.exercises.every(ex =>
    (sessionSets[ex.exerciseDefinitionId] || []).slice(0, ex.sets).every(s => s.done)
  );

  return (
    <Stack spacing="xl" className="pb-32">
      {/* Session Top Bar */}
      <header 
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-40 bg-[#09090e]/95 backdrop-blur-md transform-gpu will-change-transform py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/50 -mx-4 px-4 pb-6 mb-6 session-sticky-header transition-all duration-300"
        style={{
          borderTop: `1px solid ${WORKOUT_COLORS[activeWorkout.type]}40`
        }}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExitAttempt}
            icon={<ChevronLeft size={20} />}
          />
          <div className="space-y-1">
            <Badge
              label={activeWorkout.badge}
              color={WORKOUT_COLORS[activeWorkout.type]}
              variant="subtle"
            />
            <h2 className="text-2xl font-black uppercase leading-none font-display">{activeWorkout.name}</h2>
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
          <Button
            variant="primary"
            size="md"
            loading={isSubmitting}
            disabled={isSubmitting || isFinishing}
            onClick={finishSession}
            className={cn(
              allExercisesDone && "shadow-[0_0_20px_rgba(255,255,255,0.25)] animate-pulse font-extrabold"
            )}
          >
            {isSubmitting ? 'Syncing...' : 'Finish'}
          </Button>
        </div>
      </header>

      {/* Exercises List */}
      <Stack spacing="lg">
        {activeWorkout.exercises.map((ex, exIdx) => {
          const resolvedEx = resolveWorkoutExercise(ex, exerciseDefinitions);
          const exDefId = ex.exerciseDefinitionId;
          return (
            <ExerciseCard
              key={`session-ex-${exDefId}-${exIdx}`}
              ex={resolvedEx}
              workoutType={activeWorkout.type}
              ghostData={ghostData[exDefId]}
              aiAdvice={aiAdvice}
              loadingAdvice={loadingAdvice}
              sessionSets={sessionSets}
              getAiAdvice={getAiAdvice}
              updateSet={updateSet}
              addSet={addSet}
              deleteSet={deleteSet}
              isExpanded={expandedExId === exDefId}
              onToggleExpand={() => {
                setExpandedExId(prev => prev === exDefId ? null : exDefId);
              }}
            />
          );
        })}

        {activeWorkout.cardio && (
          <div className="bg-gradient-to-br from-zinc-800/10 to-zinc-950 border border-zinc-800 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: WORKOUT_COLORS[activeWorkout.type] }} />
                <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500">Active Finish Protocol</span>
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wide">{activeWorkout.cardio.name}</h3>
              <p className="text-xs text-zinc-500 font-mono tracking-tight">{activeWorkout.cardio.detail}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-2xl flex items-center gap-3 self-stretch sm:self-auto justify-center">
              <Clock size={16} style={{ color: WORKOUT_COLORS[activeWorkout.type] }} />
              <div className="text-left leading-none">
                <span className="block text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Target Dur</span>
                <span className="text-xs font-bold font-mono tracking-tight">{activeWorkout.cardio.duration}</span>
              </div>
            </div>
          </div>
        )}
      </Stack>
    </Stack>
  );
};

