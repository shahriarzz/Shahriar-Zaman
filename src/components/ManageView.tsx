import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Repeat, 
  ChevronRight, 
  Download, 
  Upload, 
  Shield, 
  History, 
  ClipboardCopy, 
  Check, 
  Save,
  Cloud
} from 'lucide-react';
import { useFitness } from '../store/FitnessContext';
import { useConfirm } from '../store/ConfirmContext';
import { WORKOUT_COLORS, getWorkoutBadgeStyle } from '../utils/fitnessHelpers';
import { StatusChip } from './StatusChip';
import { INITIAL_WORKOUTS } from '../types/initialData';
import { cn } from '../lib/utils';
import { haptics } from '../utils/haptics';
import {
  Section,
  SectionHeader,
  Card,
  StatCard,
  Badge,
  EmptyState,
  SEMANTIC_COLORS,
  RADIUS
} from './ui';

export const ManageView: React.FC = () => {
  const { 
    workouts, 
    setWorkouts, 
    resetLogs, 
    login, 
    logout, 
    user, 
    syncStatus,
    syncError,
    exportBackup, 
    importBackup,
    getAutoBackups,
    restoreAutoBackup,
    createManualBackup
  } = useFitness();
  const { confirm } = useConfirm();
  
  const [expandedWo, setExpandedWo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Loading state to prevent rapid double-taps on async operations
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Backup & Restore states
  const [restoreMessage, setRestoreMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-backup refresh state (to force rerender when savepoint creates)
  const [autoBackupsTick, setAutoBackupsTick] = useState(0);

  // Inline Add Exercise States
  const [addingExWoId, setAddingExWoId] = useState<string | null>(null);
  const [newExName, setNewExName] = useState('');
  const [newExTarget, setNewExTarget] = useState('');

  // Selected workout memo to prevent duplicate searches
  const selectedWorkout = React.useMemo(() => workouts.find(w => w.id === expandedWo) || null, [workouts, expandedWo]);

  const handleExport = async () => {
    if (loadingAction) return;
    setLoadingAction('export');
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
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopyClipboard = async () => {
    if (loadingAction) return;
    setLoadingAction('copy');
    try {
      haptics.success();
      const backupStr = exportBackup();
      await navigator.clipboard.writeText(backupStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy. Try downloading the file instead.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reject files over 5MB to avoid accidental huge files freezing the import
    const MAX_SIZE = 5 * 1024 * 1024; 
    if (file.size > MAX_SIZE) {
      haptics.warning();
      setRestoreMessage({ text: "Error: Selected file is too large. Please select a JSON backup smaller than 5MB.", isError: true });
      event.target.value = '';
      return;
    }

    setLoadingAction('upload');
    haptics.medium();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
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
      } catch {
        haptics.warning();
        setRestoreMessage({ text: "Failed to import backup.", isError: true });
      } finally {
        setLoadingAction(null);
      }
    };
    reader.onerror = () => {
      haptics.warning();
      setRestoreMessage({ text: "Error reading file.", isError: true });
      setLoadingAction(null);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handlePasteRestore = async () => {
    if (!pastedJson.trim() || loadingAction) return;
    setLoadingAction('paste');
    haptics.medium();
    try {
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
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateRestorePoint = async () => {
    if (loadingAction) return;
    setLoadingAction('savepoint');
    haptics.medium();
    try {
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
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestoreCheckpoint = async (timestamp: string, desc: string) => {
    if (loadingAction) return;
    const confirmRestore = await confirm({
      title: 'Restore Savepoint',
      message: `Are you sure you want to revert your routines and logs to:\n"${desc}"?\n\nThis will overwrite your active state parameters.`,
      isDanger: true
    });
    if (!confirmRestore) return;

    setLoadingAction('restore');
    haptics.success();
    try {
      const res = await restoreAutoBackup(timestamp);
      if (res.success) {
        setRestoreMessage({ text: res.message, isError: false });
        setAutoBackupsTick(prev => prev + 1);
        setTimeout(() => setRestoreMessage(null), 5000);
      } else {
        setRestoreMessage({ text: res.message, isError: true });
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResetWorkouts = async () => {
    if (loadingAction) return;
    const proceed = await confirm({
      title: 'Reset Training Routines',
      message: 'Overwrite all training routines with default factory structures? This will keep history but replace routines.',
      isDanger: true
    });
    if (proceed) {
      setLoadingAction('reset_workouts');
      try {
        await setWorkouts(INITIAL_WORKOUTS);
        setExpandedWo(null);
      } finally {
        setLoadingAction(null);
      }
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await login();
      setAutoBackupsTick(prev => prev + 1);
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') return;
      if (e?.code === 'auth/not-configured') {
        await confirm({
          title: 'Cloud Sync Disabled',
          message: e.message || 'To enable signing in and secure cloud backups, please complete the Firebase integration setup.',
          isDanger: false
        });
        return;
      }
      setAuthError(e?.message || "Authentication failed");
    }
  };

  const deleteExercise = async (workoutId: string, exId: string) => {
    const proceed = await confirm({
      title: 'Remove Exercise',
      message: 'Are you sure you want to remove this exercise from this routine?',
      isDanger: true
    });
    if (!proceed) return;

    setWorkouts(prev => prev.map(wo => {
      if (wo.id === workoutId) {
        return { ...wo, exercises: wo.exercises.filter(ex => ex.id !== exId) };
      }
      return wo;
    }));
  };

  const handleSaveNewExercise = (workoutId: string) => {
    if (!newExName.trim()) return;

    setWorkouts(prev => prev.map(wo => {
      if (wo.id === workoutId) {
        const generatedId = `ex-${crypto.randomUUID()}`;
        return {
          ...wo,
          exercises: [
            ...wo.exercises,
            { 
              id: generatedId, 
              name: newExName.trim(), 
              target: newExTarget.trim() || 'Custom Isolation', 
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

    setNewExName('');
    setNewExTarget('');
    setAddingExWoId(null);
  };

  const checkpointHistory = React.useMemo(() => getAutoBackups(), [autoBackupsTick, getAutoBackups]);

  return (
    <div className="space-y-8 pt-4 pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-500 uppercase">Architecture</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase leading-[0.85] tracking-tighter font-display bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
          Manage
        </h1>
      </div>

      {/* Cloud Sync Section */}
      <Card variant="elevated" padding="relaxed" className="flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative group">
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <Cloud className="text-orange-500 w-4 h-4" />
            <h3 className="font-bold flex items-center gap-2 text-white">
              Cloud Synchronization
              {user && (
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  syncStatus === 'synced' && 'bg-emerald-500 animate-pulse',
                  syncStatus === 'syncing' && 'bg-amber-500 animate-pulse',
                  syncStatus === 'failed' && 'bg-red-500 animate-pulse',
                  syncStatus === 'idle' && 'bg-zinc-500'
                )} />
              )}
            </h3>
          </div>
          <div className="text-xs text-zinc-400">
            {user ? (
              <div className="flex flex-col gap-1">
                <span>Signed in as <strong className="text-white font-mono">{user.email}</strong>.</span>
                {syncStatus === 'syncing' && <span className="text-amber-400 font-mono text-[10px] uppercase tracking-wider">⚡ Synchronizing with Firestore...</span>}
                {syncStatus === 'synced' && <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider">✓ Cloud synchronization complete. Data secure.</span>}
                {syncStatus === 'failed' && (
                  <span className="text-red-400 font-mono text-[10px] uppercase tracking-wider flex flex-col gap-0.5">
                    <span>⚠ Sync mismatch / connection timeout.</span>
                    {syncError && <span className="text-zinc-400 normal-case tracking-normal">{syncError}</span>}
                  </span>
                )}
                {syncStatus === 'idle' && <span className="text-zinc-400 font-mono text-[10px] uppercase tracking-wider">Connection established. Idle.</span>}
              </div>
            ) : (
              "Synchronize routines, custom calendars, and safety benchmarks securely by signing in."
            )}
          </div>
        </div>
        
        {user ? (
          <button 
            onClick={async () => {
              if (loadingAction === 'auth') return;
              setLoadingAction('auth');
              haptics.warning();
              try {
                await logout();
              } finally {
                setLoadingAction(null);
              }
            }}
            disabled={loadingAction === 'auth'}
            className="px-6 py-3 bg-zinc-800 border border-zinc-700 disabled:opacity-50 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-zinc-700 text-white transition-all z-10 cursor-pointer active:scale-95"
          >
            {loadingAction === 'auth' ? 'Signing Out...' : 'Sign Out'}
          </button>
        ) : (
          <div className="flex flex-col gap-2.5 items-end">
            <button 
              onClick={async () => {
                if (loadingAction === 'auth') return;
                setLoadingAction('auth');
                haptics.medium();
                try {
                  await handleLogin();
                } finally {
                  setLoadingAction(null);
                }
              }}
              disabled={loadingAction === 'auth'}
              className="px-6 py-3 bg-white text-black disabled:opacity-50 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest hover:scale-105 transition-all z-10 cursor-pointer active:scale-95 shadow-md"
            >
              {loadingAction === 'auth' ? 'Signing In...' : 'Sync with Google'}
            </button>
            {authError && (
              <span className="text-[9px] font-mono text-red-400 uppercase tracking-tighter text-right max-w-xs">
                {authError}
              </span>
            )}
            {typeof window !== 'undefined' && window.self !== window.top && (
              <div className="max-w-[280px] p-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-right space-y-1">
                <span className="text-[9px] font-mono text-orange-400 uppercase tracking-wider font-bold">💡 Web Preview Alert</span>
                <p className="text-[9px] text-zinc-400 uppercase tracking-wide leading-normal">
                  Google Sign-In popups are blocked inside the embedded preview. Please open this app in a <span className="text-zinc-200 font-bold">New Tab</span> using the button in the top-right corner to log in and restore your history seamlessly!
                </p>
              </div>
            )}
          </div>
        )}

        <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <Repeat size={120} className="text-white" />
        </div>
      </Card>

      {/* Rock Solid Backup & Restore Vault */}
      <Section
        eyebrow="Resilience & Integrity"
        eyebrowColor="orange"
        title="Backup & Restore Vault"
        action={
          <button
            onClick={handleCreateRestorePoint}
            disabled={loadingAction === 'savepoint'}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-xl text-[10px] font-mono uppercase tracking-widest flex items-center shadow-lg gap-2 cursor-pointer active:scale-95"
          >
            <Save size={13} className="text-orange-400" />
            {loadingAction === 'savepoint' ? 'Saving...' : 'Create Savepoint'}
          </button>
        }
        padding="relaxed"
      >
        <div className="space-y-6">
          <p className="text-xs text-zinc-400 max-w-2xl">
            Physical export files, instant clipboard extraction, and manual database restore-point checkpoints prevent and secure against data loss during splits modification or cloud sync mismatches.
          </p>

          {/* Restore messages indicator */}
          <AnimatePresence>
            {restoreMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "p-3 rounded-xl border font-mono text-[10px] uppercase tracking-wide flex items-center justify-between",
                  restoreMessage.isError ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                )}
              >
                <span>{restoreMessage.text}</span>
                <button onClick={() => setRestoreMessage(null)} className="text-zinc-400 hover:text-white font-bold ml-2">×</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Action 1: Export Keys */}
            <Card variant="default" padding="default" className="flex flex-col justify-between items-start gap-4">
              <div className="space-y-1">
                <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest block">Export Protocols</span>
                <h4 className="text-xs font-bold text-zinc-200">Standalone Data Keyfile</h4>
                <p className="text-[10px] text-zinc-400 leading-normal">
                  Compiles all training cycles, logged weights, rep sets, and cycle configs into a structured database file.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <button
                  onClick={handleExport}
                  disabled={loadingAction === 'export'}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 disabled:opacity-50 hover:bg-zinc-700 hover:text-white rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-200 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Download size={13} className="text-orange-500" />
                  {loadingAction === 'export' ? 'Exporting...' : 'Download JSON'}
                </button>

                <button
                  onClick={handleCopyClipboard}
                  disabled={loadingAction === 'copy'}
                  className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 disabled:opacity-50 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  {copied ? <Check size={13} className="text-emerald-400 animate-pulse" /> : <ClipboardCopy size={13} />}
                  <span>{copied ? "Copied!" : "Extract String"}</span>
                </button>
              </div>
            </Card>

            {/* Action 2: Import Keys */}
            <Card variant="default" padding="default" className="flex flex-col justify-between items-start gap-4">
              <div className="space-y-1 w-full">
                <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest block">Restore Protocol</span>
                <h4 className="text-xs font-bold text-zinc-200">Inward Protocol Overload</h4>
                <p className="text-[10px] text-zinc-400 leading-normal">
                  Import routines by specifying a digital JSON file or copying string structures directly below.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <label className={cn(
                  "flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-black rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all text-center cursor-pointer flex items-center justify-center gap-2 active:scale-95",
                  loadingAction === 'upload' && "opacity-50 pointer-events-none"
                )}>
                  <Upload size={13} />
                  <span>{loadingAction === 'upload' ? 'Uploading...' : 'Upload Keyfile'}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    disabled={loadingAction === 'upload'}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => setShowPasteBox(!showPasteBox)}
                  className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer active:scale-95"
                >
                  {showPasteBox ? "Close Area" : "Paste Text Data"}
                </button>
              </div>
            </Card>
          </div>

          {/* Dynamic Paste Area */}
          <AnimatePresence>
            {showPasteBox && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2 bg-zinc-950 p-4 border border-zinc-800 rounded-2xl"
              >
                <label className="block font-mono text-[9px] uppercase tracking-widest text-zinc-500">Raw Keyfile JSON Structure</label>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder='Paste your backup string block here... (e.g., {"version": 1, ...})'
                  className="w-full h-32 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-xl p-3 font-mono text-[10px] text-zinc-300 outline-none resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setPastedJson('')}
                    className="px-3 py-1.5 text-[9px] font-mono uppercase text-zinc-500 hover:text-zinc-300"
                  >
                    Clear Fields
                  </button>
                  <button
                    onClick={handlePasteRestore}
                    disabled={!pastedJson.trim() || loadingAction === 'paste'}
                    className="px-4 py-1.5 bg-orange-500 disabled:opacity-30 disabled:hover:bg-orange-500 hover:bg-orange-600 text-black text-[9px] font-mono font-bold uppercase tracking-widest rounded-lg transition-all cursor-pointer active:scale-95"
                  >
                    {loadingAction === 'paste' ? 'Injecting...' : 'Inject Backup String'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Automatic Rolling Checkpoints */}
          <div className="space-y-3 bg-zinc-950/50 p-4 border border-zinc-800 rounded-2xl">
            <div className="flex items-center gap-1.5 justify-between">
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <History size={13} className="text-zinc-500" />
                Automated Checkpoints History
              </h4>
              <span className="text-[8px] font-mono text-zinc-500 uppercase">Up to 8 autosaves</span>
            </div>

            <p className="text-[10px] text-zinc-400 leading-normal">
              GainLog caches complete savepoint snapshots during sessions, custom modifications, or imports. Click Restore to roll back.
            </p>

            <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pt-1 pr-1">
              {checkpointHistory.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-zinc-800 text-[9px] font-mono text-zinc-500 uppercase rounded-xl">
                  No local checkpoints available.
                </div>
              ) : (
                checkpointHistory.map((b) => (
                  <div 
                    key={b.timestamp}
                    className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-between gap-3 text-left hover:border-zinc-700 hover:bg-zinc-900/50 transition-all group"
                  >
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-mono text-orange-400 font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 mr-1.5">
                        {b.changeType}
                      </span>
                      <span className="text-[10px] text-zinc-200 font-bold">{b.desc}</span>
                      <div className="text-[8px] font-mono text-zinc-500 uppercase">
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
                      disabled={loadingAction === 'restore'}
                      className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-800 hover:text-orange-400 text-[8px] font-mono uppercase tracking-widest rounded transition-all cursor-pointer text-zinc-300"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Routine Splits Manager & Layout Editor */}
      <Section
        eyebrow="Protocols & Exercises"
        eyebrowColor="zinc"
        title="Training Split Editor"
        padding="none"
      >
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="relative flex-1 manage-dropdown-container">
              <label className="block font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500 mb-2 ml-2">Training Split Selection</label>
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 font-mono text-[10px] uppercase tracking-widest text-left flex justify-between items-center hover:border-zinc-700 transition-all focus:ring-1 focus:ring-zinc-600 outline-none cursor-pointer text-white"
              >
                {selectedWorkout?.name || "Select Protocol to Edit"}
                <ChevronRight size={16} className={cn("text-zinc-500 transition-transform", isDropdownOpen && "rotate-90")} />
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
                          expandedWo === wo.id ? "bg-white/10 border border-white/10 text-white" : "hover:bg-white/5 border border-transparent text-zinc-400 hover:text-white"
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
                disabled={loadingAction === 'reset_workouts'}
                className="h-[52px] px-6 bg-zinc-900 border border-zinc-800 disabled:opacity-50 rounded-2xl text-[10px] font-mono text-zinc-400 hover:text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2 hover:border-zinc-600 cursor-pointer active:scale-95"
              >
                <Repeat size={14} />
                {loadingAction === 'reset_workouts' ? 'Resetting...' : 'Reset Routines Library'}
              </button>
            </div>
          </div>

          {selectedWorkout && (
            <Card variant="elevated" padding="none" className="overflow-hidden">
              <div className="p-6 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/40">
                <div className="flex items-center gap-4">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WORKOUT_COLORS[selectedWorkout.type] }} />
                  <div className="space-y-1">
                    <div className="font-bold text-xl uppercase tracking-tighter font-display text-white">{selectedWorkout.name}</div>
                    <Badge
                      label={selectedWorkout.badge}
                      color={selectedWorkout.type === 'push' || selectedWorkout.type === 'pull' || selectedWorkout.type === 'legs' ? 'orange' : 'zinc'}
                      variant="subtle"
                    />
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">Split Configurator</div>
              </div>

              <div className="p-6 space-y-4">
                {selectedWorkout.type !== 'rest' ? (
                  <>
                    <div className="space-y-2">
                      {selectedWorkout.exercises.map(ex => (
                        <div key={ex.id} className="flex items-center justify-between p-4 bg-zinc-950/60 border border-zinc-800 rounded-2xl group hover:border-zinc-700 transition-colors">
                          <div className="flex items-center gap-3">
                            <div>
                               <div className="text-sm font-bold text-zinc-200">{ex.name}</div>
                               <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{ex.target}</div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => deleteExercise(selectedWorkout.id, ex.id)}
                            className="p-2 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {addingExWoId === selectedWorkout.id ? (
                      <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-4">
                        <span className="block font-mono text-[9px] uppercase tracking-widest text-zinc-400 font-bold">New Exercise Details</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono uppercase text-zinc-400 ml-1">Exercise Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Incline Bench Press"
                              value={newExName}
                              onChange={(e) => setNewExName(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono uppercase text-zinc-400 ml-1">Target Muscle Group</label>
                            <input
                              type="text"
                              placeholder="e.g. Upper Chest"
                              value={newExTarget}
                              onChange={(e) => setNewExTarget(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-xl px-3 py-2.5 text-xs text-white outline-none transition-colors"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                          <button
                            type="button"
                            onClick={() => {
                              setAddingExWoId(null);
                              setNewExName('');
                              setNewExTarget('');
                            }}
                            className="px-4 py-2 text-[10px] font-mono uppercase text-zinc-400 hover:text-zinc-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveNewExercise(selectedWorkout.id)}
                            disabled={!newExName.trim()}
                            className="px-5 py-2 bg-orange-500 disabled:opacity-30 disabled:hover:bg-orange-500 hover:bg-orange-600 text-black text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer active:scale-95"
                          >
                            Append Exercise
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingExWoId(selectedWorkout.id);
                          setNewExName('');
                          setNewExTarget('');
                        }}
                        className="w-full py-4 flex items-center justify-center gap-2 text-xs font-mono text-zinc-400 border border-dashed border-zinc-800 rounded-2xl hover:bg-zinc-950 hover:text-zinc-200 hover:border-zinc-700 transition-all cursor-pointer"
                      >
                        <Plus size={15} /> Append New Exercise to Protocol
                      </button>
                    )}
                  </>
                ) : (
                  <div className="bg-zinc-950/60 p-10 rounded-2xl text-center border border-dashed border-zinc-800">
                    <div className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Rest Phase</div>
                    <p className="text-[10px] text-zinc-500 mt-1.5 uppercase tracking-wider">This recovery phase is structurally immutable (0 exercises).</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </Section>

      {/* Danger Zone */}
      <div className="pt-6 border-t border-zinc-900">
        <div className="p-6 bg-red-500/5 border border-red-500/15 rounded-3xl space-y-4">
          <h3 className="text-red-400 font-mono text-[10px] uppercase tracking-[0.3em] font-bold">Terminal Commands</h3>
          <p className="text-xs text-red-400/70 leading-relaxed uppercase tracking-wider font-mono">
            Caution: Purging session history logs will permanently clear all historical weights and calendars. Split routines will remain preserved.
          </p>
          <button
            onClick={async () => {
              const proceed = await confirm({
                title: '🚨 DANGER: IRREVERSIBLE PURGE',
                message: 'Are you absolutely positive you want to completely delete all training calendars and histories? This cannot be undone.',
                isDanger: true
              });
              if (proceed) {
                setLoadingAction('purge_logs');
                try {
                  await resetLogs();
                } finally {
                  setLoadingAction(null);
                }
              }
            }}
            disabled={loadingAction === 'purge_logs'}
            className="px-6 py-3 border border-red-500/30 text-red-400 disabled:opacity-50 text-[10px] font-mono uppercase tracking-widest rounded-xl hover:bg-red-500 hover:text-black transition-all cursor-pointer"
          >
            {loadingAction === 'purge_logs' ? 'Purging...' : 'Purge All Session Logs'}
          </button>
        </div>
      </div>
    </div>
  );
};
