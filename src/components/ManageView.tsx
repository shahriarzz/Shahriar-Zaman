import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Repeat, 
  ChevronRight, 
  Download, 
  Upload, 
  Shield, 
  History, 
  ClipboardCopy, 
  Check, 
  Save 
} from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';

export const ManageView: React.FC = () => {
  const { 
    workouts, 
    setWorkouts, 
    resetLogs, 
    login, 
    logout, 
    user, 
    exportBackup, 
    importBackup,
    getAutoBackups,
    restoreAutoBackup,
    createManualBackup
  } = useFitness();
  
  const [expandedWo, setExpandedWo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Backup & Restore states
  const [restoreMessage, setRestoreMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-backup refresh state (to force rerender when savepoint creates)
  const [autoBackupsTick, setAutoBackupsTick] = useState(0);

  const handleExport = () => {
    try {
      haptics.success();
      const backupStr = exportBackup();
      const blob = new Blob([backupStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `gainlog_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setRestoreMessage({ text: "Keyfile downloaded successfully!", isError: false });
      setTimeout(() => setRestoreMessage(null), 4000);
    } catch (e: any) {
      alert("Failed to export backup: " + e.message);
    }
  };

  const handleCopyClipboard = () => {
    try {
      haptics.success();
      const backupStr = exportBackup();
      navigator.clipboard.writeText(backupStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy. Try downloading the file instead.");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    haptics.medium();
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      
      const res = await importBackup(content);
      if (res.success) {
        haptics.success();
        setRestoreMessage({ text: res.message, isError: false });
        setAutoBackupsTick(prev => prev + 1);
        setTimeout(() => setRestoreMessage(null), 5000);
      } else {
        haptics.warning();
        setRestoreMessage({ text: res.message, isError: true });
      }
    };
    reader.readAsText(file);
  };

  const handlePasteRestore = async () => {
    if (!pastedJson.trim()) return;
    haptics.medium();
    const res = await importBackup(pastedJson);
    if (res.success) {
      haptics.success();
      setRestoreMessage({ text: res.message, isError: false });
      setPastedJson('');
      setShowPasteBox(false);
      setAutoBackupsTick(prev => prev + 1);
      setTimeout(() => setRestoreMessage(null), 5000);
    } else {
      haptics.warning();
      setRestoreMessage({ text: res.message, isError: true });
    }
  };

  const handleCreateRestorePoint = async () => {
    haptics.medium();
    const res = await createManualBackup();
    if (res.success) {
      haptics.success();
      setRestoreMessage({ text: res.message, isError: false });
      setAutoBackupsTick(prev => prev + 1);
      setTimeout(() => setRestoreMessage(null), 4000);
    } else {
      haptics.warning();
      setRestoreMessage({ text: res.message, isError: true });
    }
  };

  const handleRestoreCheckpoint = async (timestamp: string, desc: string) => {
    const confirmRestore = window.confirm(
      `🚨 RESTORE SAVEPOINT\n\nAre you sure you want to revert your routines and logs to:\n"${desc}"?\n\nThis will overwrite your active state parameters.`
    );
    if (!confirmRestore) return;

    haptics.success();
    const res = await restoreAutoBackup(timestamp);
    if (res.success) {
      setRestoreMessage({ text: res.message, isError: false });
      setAutoBackupsTick(prev => prev + 1);
      setTimeout(() => setRestoreMessage(null), 5000);
    } else {
      setRestoreMessage({ text: res.message, isError: true });
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen && !((event.target as Element).closest('.manage-dropdown-container'))) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  const handleResetWorkouts = async () => {
    if (window.confirm("Overwrite all training routines with default factory structures? This will keep history but replace routines.")) {
      await setWorkouts(INITIAL_WORKOUTS);
      setExpandedWo(null);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await login();
      setAutoBackupsTick(prev => prev + 1);
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') return;
      setAuthError(e?.message || "Authentication failed");
    }
  };

  const deleteExercise = (workoutId: string, exId: string) => {
    setWorkouts(prev => prev.map(wo => {
      if (wo.id === workoutId) {
        return { ...wo, exercises: wo.exercises.filter(ex => ex.id !== exId) };
      }
      return wo;
    }));
  };

  const addExercise = (workoutId: string) => {
    const name = window.prompt('Exercise Name:');
    if (!name) return;
    const target = window.prompt('Target Muscle (e.g. Upper Chest, Delts):');

    setWorkouts(prev => prev.map(wo => {
      if (wo.id === workoutId) {
        const generatedId = `ex-${Math.random().toString(36).substr(2, 9)}`;
        return {
          ...wo,
          exercises: [
            ...wo.exercises,
            { 
              id: generatedId, 
              name, 
              target: target || 'Custom Isolation', 
              sets: 3, 
              reps: '10–12',
              tags: [],
              note: ''
            }
          ]
        };
      }
      return wo;
    }));
  };

  const checkpointHistory = getAutoBackups();

  return (
    <div className="space-y-8 pt-4 pb-12">
      <div className="space-y-2">
        <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-500 uppercase">Architecture</span>
        <h1 className="text-4xl md:text-6xl font-black uppercase leading-[0.85] tracking-tighter text-zinc-400">Manage</h1>
      </div>

      {/* Cloud Sync Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group">
        <div className="space-y-1 relative z-10">
          <h3 className="font-bold flex items-center gap-2">
            Cloud Synchronization
            {user && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
          </h3>
          <p className="text-xs text-zinc-500">
            {user 
              ? `Signed in as ${user.email}. Continuous background sync active.` 
              : "Synchronize routines, custom calendars, and safety benchmarks securely by signing in."}
          </p>
        </div>
        
        {user ? (
          <button 
            onClick={() => {
              haptics.warning();
              logout();
            }}
            className="px-6 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-zinc-700 transition-all z-10 cursor-pointer active:scale-95"
          >
            Sign Out
          </button>
        ) : (
          <div className="flex flex-col gap-2 items-end">
            <button 
              onClick={() => {
                haptics.medium();
                handleLogin();
              }}
              className="px-6 py-3 bg-white text-black rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest hover:scale-105 transition-all z-10 cursor-pointer active:scale-95"
            >
              Sync with Google
            </button>
            {authError && (
              <span className="text-[9px] font-mono text-red-500 uppercase tracking-tighter">
                {authError}
              </span>
            )}
          </div>
        )}

        <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <Repeat size={120} className="text-white" />
        </div>
      </section>

      {/* Rock Solid Backup & Restore Vault */}
      <section className="bg-zinc-900 border border-orange-500/10 rounded-3xl p-6 space-y-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="text-orange-500 w-4 h-4" />
              <h3 className="font-bold uppercase tracking-wider text-sm">Resilient Backup Vault</h3>
            </div>
            <p className="text-xs text-zinc-500 max-w-2xl">
              Physical export files, instant clipboard extraction, and manual database restore-point checkpoints prevent and secure against data loss during splits modification or cloud sync mismatches.
            </p>
          </div>

          <button
            onClick={handleCreateRestorePoint}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[10px] font-mono uppercase tracking-widest flex items-center shadow-lg gap-2 cursor-pointer active:scale-95"
          >
            <Save size={13} className="text-orange-400" />
            Create Savepoint
          </button>
        </div>

        {/* Restore messages indicator */}
        <AnimatePresence>
          {restoreMessage && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "p-3 rounded-xl border font-mono text-[10px] uppercase tracking-wide flex items-center justify-between",
                restoreMessage.isError ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              )}
            >
              <span>{restoreMessage.text}</span>
              <button onClick={() => setRestoreMessage(null)} className="text-zinc-650 hover:text-white font-bold ml-2">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Action 1: Export Keys */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between items-start gap-4 hover:border-zinc-800/80 transition-all">
            <div className="space-y-1">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest block">Export Protocols</span>
              <h4 className="text-xs font-bold text-zinc-350">Standalone Data Keyfile</h4>
              <p className="text-[10px] text-zinc-500 leading-normal">
                Compiles all training cycles, logged weights, rep sets, and cycle configs into a structured database file.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <button
                onClick={handleExport}
                className="flex-1 px-4 py-2.5 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 hover:text-white rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-350 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Download size={13} className="text-orange-500" />
                Download JSON
              </button>

              <button
                onClick={handleCopyClipboard}
                className="px-4 py-2.5 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                {copied ? <Check size={13} className="text-green-500 animate-pulse" /> : <ClipboardCopy size={13} />}
                <span>{copied ? "Copied!" : "Extract String"}</span>
              </button>
            </div>
          </div>

          {/* Action 2: Import Keys */}
          <div className="bg-zinc-950/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between items-start gap-4 hover:border-zinc-800/80 transition-all">
            <div className="space-y-1 w-full">
              <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest block">Restore Protocol</span>
              <h4 className="text-xs font-bold text-zinc-350">Inward Protocol Overload</h4>
              <p className="text-[10px] text-zinc-500 leading-normal">
                Import routines by specifying a digital JSON file or copying string structures directly below.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <label className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-black rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all text-center cursor-pointer flex items-center justify-center gap-2 active:scale-95">
                <Upload size={13} />
                <span>Upload Keyfile</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => setShowPasteBox(!showPasteBox)}
                className="px-4 py-2.5 bg-zinc-800/80 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer active:scale-95"
              >
                {showPasteBox ? "Close Area" : "Paste Text Data"}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Paste Area */}
        <AnimatePresence>
          {showPasteBox && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="space-y-2 bg-zinc-950 p-4 border border-zinc-800/60 rounded-2xl"
            >
              <label className="block font-mono text-[9px] uppercase tracking-widest text-zinc-600">Raw Keyfile JSON Structure</label>
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Paste your backup string block here... (e.g., {"version": 1, ...})'
                className="w-full h-32 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 focus:border-zinc-600 rounded-xl p-3 font-mono text-[10px] text-zinc-400 outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPastedJson('')}
                  className="px-3 py-1.5 text-[9px] font-mono uppercase text-zinc-600 hover:text-zinc-400"
                >
                  Clear Fields
                </button>
                <button
                  onClick={handlePasteRestore}
                  disabled={!pastedJson.trim()}
                  className="px-4 py-1.5 bg-orange-500 disabled:opacity-30 disabled:hover:bg-orange-500 hover:bg-orange-600 text-black text-[9px] font-mono font-bold uppercase tracking-widest rounded-lg transition-all cursor-pointer active:scale-95"
                >
                  Inject Backup String
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Automatic Rolling Checkpoints */}
        <div className="space-y-3 bg-zinc-950/30 p-4 border border-zinc-850 rounded-2xl">
          <div className="flex items-center gap-1.5 justify-between">
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <History size={13} className="text-zinc-500" />
              Automated Checkpoints History
            </h4>
            <span className="text-[8px] font-mono text-zinc-600 uppercase">Up to 8 autosaves</span>
          </div>

          <p className="text-[10px] text-zinc-500 leading-normal">
            GainLog caches complete savepoint snapshots during sessions, custom modifications, or imports. Click Restore to roll back.
          </p>

          <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pt-1 pr-1">
            {checkpointHistory.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-zinc-800 text-[9px] font-mono text-zinc-600 uppercase rounded-xl">
                No local checkpoints available.
              </div>
            ) : (
              checkpointHistory.map((b) => (
                <div 
                  key={b.timestamp}
                  className="p-3 bg-zinc-950/70 border border-zinc-900/40 rounded-xl flex items-center justify-between gap-3 text-left hover:border-zinc-800 hover:bg-zinc-950 transition-all group"
                >
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-mono text-orange-400/90 font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-500/5 border border-orange-500/10 mr-1.5">
                      {b.changeType}
                    </span>
                    <span className="text-[10px] text-zinc-300 font-bold">{b.desc}</span>
                    <div className="text-[8px] font-mono text-zinc-600 uppercase">
                      {new Date(b.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestoreCheckpoint(b.timestamp, b.desc)}
                    className="opacity-100 md:opacity-0 group-hover:opacity-100 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:text-orange-400 text-[8px] font-mono uppercase tracking-widest rounded transition-all cursor-pointer"
                  >
                    Restore
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Routine Splits Manager & Layout Editor */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
        <div className="relative flex-1 manage-dropdown-container">
          <label className="block font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-2 ml-2">Training Split Selection</label>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 font-mono text-[10px] uppercase tracking-widest text-left flex justify-between items-center hover:border-zinc-700 transition-all focus:ring-1 focus:ring-zinc-600 outline-none cursor-pointer"
          >
            {workouts.find(w => w.id === expandedWo)?.name || "Select Protocol to Edit"}
            <ChevronRight size={16} className={cn("text-zinc-600 transition-transform", isDropdownOpen && "rotate-90")} />
          </button>
          
          {isDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setIsDropdownOpen(false)} 
              />
              <div className="absolute z-20 left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-2xl space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                {workouts.map(wo => (
                  <button 
                    key={wo.id}
                    onClick={() => {
                      setExpandedWo(wo.id);
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full p-4 rounded-xl text-left transition-all flex items-center gap-3",
                      expandedWo === wo.id ? "bg-white/5 border border-white/10" : "hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <div className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: WORKOUT_COLORS[wo.type] }} />
                    <span className="text-[10px] font-mono uppercase tracking-widest">{wo.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="hidden md:block font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-2 invisible">Actions</label>
          <button 
            onClick={handleResetWorkouts}
            className="h-[52px] px-6 bg-zinc-900 border border-zinc-800 rounded-2xl text-[10px] font-mono text-zinc-500 hover:text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 hover:border-zinc-600 cursor-pointer active:scale-95"
          >
            <Repeat size={14} />
            Reset Routines Library
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {workouts.find(w => w.id === expandedWo) && (() => {
          const wo = workouts.find(w => w.id === expandedWo)!;
          return (
            <div key={wo.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-6 flex items-center justify-between border-b border-zinc-850 bg-zinc-950/20">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: WORKOUT_COLORS[wo.type] }} />
                  <div>
                    <div className="font-bold text-xl uppercase tracking-tighter">{wo.name}</div>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest leading-none mt-1.5">{wo.badge}</div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-700">Split Configurator</div>
              </div>

              <div className="p-6 space-y-4">
                {!wo.isRest ? (
                  <>
                    <div className="space-y-2">
                      {wo.exercises.map(ex => (
                        <div key={ex.id} className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/60 rounded-2xl group hover:border-zinc-700 transition-colors">
                          <div className="flex items-center gap-3">
                            <GripVertical size={16} className="text-zinc-800" />
                            <div>
                               <div className="text-sm font-bold text-zinc-300">{ex.name}</div>
                               <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">{ex.target}</div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => deleteExercise(wo.id, ex.id)}
                            className="p-2 text-zinc-750 hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => addExercise(wo.id)}
                      className="w-full py-4 flex items-center justify-center gap-2 text-xs font-mono text-zinc-500 border border-dashed border-zinc-800 rounded-2xl hover:bg-zinc-950 hover:text-zinc-300 hover:border-zinc-750 transition-all cursor-pointer"
                    >
                      <Plus size={15} /> Append New Exercise to Protocol
                    </button>
                  </>
                ) : (
                  <div className="bg-zinc-950/40 p-10 rounded-2xl text-center border border-dashed border-zinc-800">
                    <div className="text-xs text-zinc-600 font-mono uppercase tracking-widest">Rest Phase</div>
                    <p className="text-[10px] text-zinc-750 mt-1.5 uppercase tracking-wider">This recovery phase is structurally immutable (0 exercises).</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Danger Zone */}
      <div className="pt-6 border-t border-zinc-800/50">
        <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl space-y-4">
          <h3 className="text-red-500 font-mono text-[10px] uppercase tracking-[0.3em] font-bold animate-pulse">Terminal Commands</h3>
          <p className="text-xs text-red-500/60 leading-relaxed uppercase tracking-wider font-mono">
            Caution: Purging session history logs will permanently clear all historical weights and calendars. Split routines will remain preserved.
          </p>
          <button
            onClick={() => {
              if (window.confirm('🚨 DANGER: IRREVERSIBLE PURGE\n\nAre you absolutely positive you want to completely delete all training calendars and histories? This cannot be undone.')) resetLogs();
            }}
            className="px-6 py-3 border border-red-500/30 text-red-500 text-[10px] font-mono uppercase tracking-widest rounded-xl hover:bg-red-500 hover:text-black transition-all cursor-pointer"
          >
            Purge All Session Logs
          </button>
        </div>
      </div>
    </div>
  );
};
