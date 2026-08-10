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
  Button,
  Input,
  Stack,
  Grid,
  SEMANTIC_COLORS,
  RADIUS,
  SURFACE,
  BORDER,
  SPACING,
  GAP,
  STACK_SPACING,
  TYPOGRAPHY,
  SHADOW
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
    <Stack spacing="xl" className="pt-4 pb-12">
      <SectionHeader
        eyebrow="Architecture"
        eyebrowColor="zinc"
        title="Manage"
        size="page"
      />

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
          <Button 
            variant="secondary"
            size="md"
            loading={loadingAction === 'auth'}
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
            className="z-10"
          >
            {loadingAction === 'auth' ? 'Signing Out...' : 'Sign Out'}
          </Button>
        ) : (
          <div className="flex flex-col gap-2.5 items-end">
            <Button 
              variant="primary"
              size="md"
              loading={loadingAction === 'auth'}
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
              className="z-10 shadow-md"
            >
              {loadingAction === 'auth' ? 'Signing In...' : 'Sync with Google'}
            </Button>
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
          <Button
            variant="secondary"
            size="sm"
            loading={loadingAction === 'savepoint'}
            icon={<Save size={13} className="text-orange-400" />}
            onClick={handleCreateRestorePoint}
          >
            {loadingAction === 'savepoint' ? 'Saving...' : 'Create Savepoint'}
          </Button>
        }
        padding="relaxed"
      >
        <Stack spacing="lg">
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
                  "p-3 border flex items-center justify-between",
                  RADIUS.button,
                  TYPOGRAPHY.label,
                  restoreMessage.isError ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                )}
              >
                <span>{restoreMessage.text}</span>
                <button onClick={() => setRestoreMessage(null)} className="text-zinc-400 hover:text-white font-bold ml-2">×</button>
              </motion.div>
            )}
          </AnimatePresence>

          <Grid cols={1} colsMd={2} gap="md">
            {/* Action 1: Export Keys */}
            <Card variant="standard" padding="md" className="flex flex-col justify-between items-start gap-4">
              <div className="space-y-1">
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Export Protocols</span>
                <h4 className="text-xs font-bold text-zinc-200">Standalone Data Keyfile</h4>
                <p className="text-[10px] text-zinc-400 leading-normal">
                  Compiles all training cycles, logged weights, rep sets, and cycle configs into a structured database file.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  variant="outline"
                  size="md"
                  fullWidth
                  loading={loadingAction === 'export'}
                  icon={<Download size={13} className="text-orange-500" />}
                  onClick={handleExport}
                >
                  {loadingAction === 'export' ? 'Exporting...' : 'Download JSON'}
                </Button>

                <Button
                  variant="outline"
                  size="md"
                  loading={loadingAction === 'copy'}
                  icon={copied ? <Check size={13} className="text-emerald-400 animate-pulse" /> : <ClipboardCopy size={13} />}
                  onClick={handleCopyClipboard}
                >
                  {copied ? "Copied!" : "Extract String"}
                </Button>
              </div>
            </Card>

            {/* Action 2: Import Keys */}
            <Card variant="standard" padding="md" className="flex flex-col justify-between items-start gap-4">
              <div className="space-y-1 w-full">
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Restore Protocol</span>
                <h4 className="text-xs font-bold text-zinc-200">Inward Protocol Overload</h4>
                <p className="text-[10px] text-zinc-400 leading-normal">
                  Import routines by specifying a digital JSON file or copying string structures directly below.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <label className={cn(
                  "flex-1 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all text-center cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98]",
                  RADIUS.button,
                  loadingAction === 'upload' && "opacity-40 pointer-events-none"
                )}>
                  <Upload size={14} />
                  <span>{loadingAction === 'upload' ? 'Uploading...' : 'Upload Keyfile'}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    disabled={loadingAction === 'upload'}
                    className="hidden"
                  />
                </label>

                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setShowPasteBox(!showPasteBox)}
                >
                  {showPasteBox ? "Close Area" : "Paste Text Data"}
                </Button>
              </div>
            </Card>
          </Grid>

          {/* Dynamic Paste Area */}
          <AnimatePresence>
            {showPasteBox && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={cn(SURFACE.recessed, BORDER.standard, RADIUS.card, "space-y-2 border p-4")}
              >
                <label className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Raw Keyfile JSON Structure</label>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder='Paste your backup string block here... (e.g., {"version": 1, ...})'
                  className={cn(SURFACE.subtle, BORDER.standard, RADIUS.button, "w-full h-32 border hover:border-zinc-700 focus:border-zinc-600 p-3 font-mono text-[10px] text-zinc-300 outline-none resize-none")}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPastedJson('')}
                  >
                    Clear Fields
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={loadingAction === 'paste'}
                    disabled={!pastedJson.trim() || loadingAction === 'paste'}
                    onClick={handlePasteRestore}
                  >
                    {loadingAction === 'paste' ? 'Injecting...' : 'Inject Backup String'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Automatic Rolling Checkpoints */}
          <div className={cn(SURFACE.recessed, BORDER.standard, RADIUS.card, "space-y-3 border p-4")}>
            <div className="flex items-center gap-1.5 justify-between">
              <h4 className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-2")}>
                <History size={13} className="text-zinc-500" />
                Automated Checkpoints History
              </h4>
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500")}>Up to 8 autosaves</span>
            </div>

            <p className="text-[10px] text-zinc-400 leading-normal">
              GainLog caches complete savepoint snapshots during sessions, custom modifications, or imports. Click Restore to roll back.
            </p>

            <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pt-1 pr-1">
              {checkpointHistory.length === 0 ? (
                <div className={cn(BORDER.standard, RADIUS.button, "p-4 text-center border border-dashed text-[9px] font-mono text-zinc-500 uppercase")}>
                  No local checkpoints available.
                </div>
              ) : (
                checkpointHistory.map((b) => (
                  <div 
                    key={b.timestamp}
                    className={cn(SURFACE.subtle, BORDER.standard, RADIUS.button, "p-3 border flex items-center justify-between gap-3 text-left hover:border-zinc-700 hover:bg-zinc-900/50 transition-all group")}
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

                    <Button
                      variant="outline"
                      size="sm"
                      loading={loadingAction === 'restore'}
                      onClick={() => handleRestoreCheckpoint(b.timestamp, b.desc)}
                    >
                      Restore
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Stack>
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
              <label className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 mb-2 ml-2 block")}>Training Split Selection</label>
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={cn(SURFACE.subtle, BORDER.standard, RADIUS.card, TYPOGRAPHY.label, "w-full border p-4 text-left flex justify-between items-center hover:border-zinc-700 transition-all focus:ring-1 focus:ring-zinc-600 outline-none cursor-pointer text-white")}
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
                  <div className={cn(SURFACE.subtle, BORDER.standard, RADIUS.card, "absolute z-20 left-0 right-0 mt-2 border p-2 shadow-2xl space-y-1 max-h-64 overflow-y-auto custom-scrollbar")}>
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
                        <span className={cn(TYPOGRAPHY.label)}>{wo.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              <label className={cn(TYPOGRAPHY.eyebrow, "hidden md:block text-zinc-500 mb-2 invisible")}>Actions</label>
              <Button 
                variant="outline"
                size="lg"
                loading={loadingAction === 'reset_workouts'}
                icon={<Repeat size={14} />}
                onClick={handleResetWorkouts}
                className="h-[52px]"
              >
                {loadingAction === 'reset_workouts' ? 'Resetting...' : 'Reset Routines Library'}
              </Button>
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
                        <div key={ex.id} className={cn(SURFACE.recessed, BORDER.standard, RADIUS.card, "flex items-center justify-between p-4 border group hover:border-zinc-700 transition-colors")}>
                          <div className="flex items-center gap-3">
                            <div>
                               <div className="text-sm font-bold text-zinc-200">{ex.name}</div>
                               <div className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500")}>{ex.target}</div>
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            icon={<Trash2 size={15} />}
                            className="text-zinc-500 hover:text-red-400"
                            onClick={() => deleteExercise(selectedWorkout.id, ex.id)}
                          />
                        </div>
                      ))}
                    </div>

                    {addingExWoId === selectedWorkout.id ? (
                      <div className={cn(SURFACE.recessed, BORDER.standard, RADIUS.card, "p-5 border space-y-4")}>
                        <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-400 font-bold block")}>New Exercise Details</span>
                        <Grid cols={1} colsMd={2} gap="sm">
                          <Input
                            label="Exercise Name"
                            placeholder="e.g. Incline Bench Press"
                            value={newExName}
                            onChange={(e) => setNewExName(e.target.value)}
                          />
                          <Input
                            label="Target Muscle Group"
                            placeholder="e.g. Upper Chest"
                            value={newExTarget}
                            onChange={(e) => setNewExTarget(e.target.value)}
                          />
                        </Grid>
                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setAddingExWoId(null);
                              setNewExName('');
                              setNewExTarget('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            type="button"
                            disabled={!newExName.trim()}
                            onClick={() => handleSaveNewExercise(selectedWorkout.id)}
                          >
                            Append Exercise
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="lg"
                        fullWidth
                        icon={<Plus size={15} />}
                        onClick={() => {
                          setAddingExWoId(selectedWorkout.id);
                          setNewExName('');
                          setNewExTarget('');
                        }}
                        className="py-4 border-dashed"
                      >
                        Append New Exercise to Protocol
                      </Button>
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
          <h3 className={cn(TYPOGRAPHY.eyebrow, "text-red-400 font-bold")}>Terminal Commands</h3>
          <p className="text-xs text-red-400/70 leading-relaxed uppercase tracking-wider font-mono">
            Caution: Purging session history logs will permanently clear all historical weights and calendars. Split routines will remain preserved.
          </p>
          <Button
            variant="destructive"
            size="md"
            loading={loadingAction === 'purge_logs'}
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
          >
            {loadingAction === 'purge_logs' ? 'Purging...' : 'Purge All Session Logs'}
          </Button>
        </div>
      </div>
    </Stack>
  );
};
