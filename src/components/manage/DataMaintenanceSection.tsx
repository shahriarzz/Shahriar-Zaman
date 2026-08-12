import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  Upload,
  Save,
  History,
  ClipboardCopy,
  Check,
  RotateCcw,
  Trash2,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { useFitness } from '../../store/FitnessContext';
import { useConfirm } from '../../store/ConfirmContext';
import { INITIAL_WORKOUTS } from '../../types/initialData';
import { haptics } from '../../utils/haptics';
import {
  Section,
  Card,
  Button,
  Badge,
  Stack,
  Grid,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS,
  SPACING
} from '../ui';
import { cn } from '../../lib/utils';

export const DataMaintenanceSection: React.FC = () => {
  const {
    workouts,
    setWorkouts,
    logs,
    resetLogs,
    exportBackup,
    importBackup,
    getAutoBackups,
    restoreAutoBackup,
    createManualBackup
  } = useFitness();
  const { confirm } = useConfirm();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoBackupsTick, setAutoBackupsTick] = useState(0);

  // Compute lightweight data-health metric string
  const dataHealthInfo = useMemo(() => {
    const totalWorkouts = workouts.length;
    const uniqueExerciseNames = new Set(
      workouts.flatMap(w => (w.exercises || []).map(e => e.name.toLowerCase().trim()))
    );
    const totalExercises = uniqueExerciseNames.size;
    const totalSessions = Object.keys(logs || {}).length;
    return `${totalWorkouts} Workouts · ${totalExercises} Exercises · ${totalSessions} Sessions`;
  }, [workouts, logs]);

  const checkpointHistory = useMemo(() => getAutoBackups(), [autoBackupsTick, getAutoBackups]);

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
      alert("Failed to export backup: " + (e?.message || e));
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

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      haptics.warning();
      setRestoreMessage({ text: "Error: Selected file is too large. Must be under 5MB.", isError: true });
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
        setRestoreMessage({ text: "Training routines reset to factory defaults.", isError: false });
        setTimeout(() => setRestoreMessage(null), 4000);
      } finally {
        setLoadingAction(null);
      }
    }
  };

  const handlePurgeLogs = async () => {
    if (loadingAction) return;
    const proceed = await confirm({
      title: '🚨 DANGER: IRREVERSIBLE PURGE',
      message: 'Are you absolutely positive you want to completely delete all training calendars and histories? This cannot be undone.',
      isDanger: true
    });
    if (proceed) {
      setLoadingAction('purge_logs');
      try {
        await resetLogs();
        setRestoreMessage({ text: "All session histories have been purged.", isError: false });
        setTimeout(() => setRestoreMessage(null), 4000);
      } finally {
        setLoadingAction(null);
      }
    }
  };

  return (
    <Section
      eyebrow="Data & Maintenance"
      eyebrowColor="zinc"
      title="Data & Maintenance"
      description="Manage database backups, import/export archives, restore checkpoints, and clear storage."
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
        {/* Lightweight Data-Health Line */}
        <Card variant="standard" surface="recessed" padding="compact">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 flex items-center gap-1.5")}>
              <Activity size={12} className="text-emerald-500" />
              DATA HEALTH
            </span>
            <span className={cn(TYPOGRAPHY.label, "text-zinc-300 font-mono")}>
              {dataHealthInfo}
            </span>
          </div>
        </Card>

        {/* Restore messages banner */}
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
                restoreMessage.isError
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              )}
            >
              <span>{restoreMessage.text}</span>
              <button
                onClick={() => setRestoreMessage(null)}
                className="text-zinc-400 hover:text-white font-bold ml-2 cursor-pointer"
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export & Import Grid */}
        <Grid cols={1} colsMd={2} gap="md">
          {/* Action 1: Export Keys */}
          <Card variant="standard" padding="standard" className="flex flex-col justify-between items-start gap-4">
            <div className="space-y-1">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Export</span>
              <h4 className="text-xs font-bold text-zinc-200">Data Archive Keyfile</h4>
              <p className={cn(TYPOGRAPHY.body, "text-[10px] text-zinc-400 leading-normal")}>
                Compile all training routines, session history, set logs, and body weight logs into a downloadable JSON file.
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
                {copied ? "Copied!" : "Extract"}
              </Button>
            </div>
          </Card>

          {/* Action 2: Import Keys */}
          <Card variant="standard" padding="standard" className="flex flex-col justify-between items-start gap-4">
            <div className="space-y-1 w-full">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Import</span>
              <h4 className="text-xs font-bold text-zinc-200">Restore Archive</h4>
              <p className={cn(TYPOGRAPHY.body, "text-[10px] text-zinc-400 leading-normal")}>
                Import saved routines and historical session logs by uploading a JSON backup or pasting raw JSON text.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <label
                className={cn(
                  "flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-black text-xs font-mono font-bold uppercase tracking-wider transition-all text-center cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98]",
                  RADIUS.button,
                  loadingAction === 'upload' && "opacity-40 pointer-events-none"
                )}
              >
                <Upload size={14} />
                <span>{loadingAction === 'upload' ? 'Uploading...' : 'Upload File'}</span>
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
                {showPasteBox ? "Close" : "Paste JSON"}
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
              <label className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>
                Raw Keyfile JSON Structure
              </label>
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Paste your backup string block here... (e.g., {"version": 1, ...})'
                className={cn(
                  SURFACE.subtle,
                  BORDER.standard,
                  RADIUS.button,
                  "w-full h-32 border hover:border-zinc-700 focus:border-zinc-600 p-3 font-mono text-[10px] text-zinc-300 outline-none resize-none"
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPastedJson('')}
                >
                  Clear
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={loadingAction === 'paste'}
                  disabled={!pastedJson.trim() || loadingAction === 'paste'}
                  onClick={handlePasteRestore}
                >
                  {loadingAction === 'paste' ? 'Injecting...' : 'Inject Backup'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Automatic Rolling Checkpoints */}
        <Card variant="standard" surface="recessed" padding="standard" className="space-y-3">
          <div className="flex items-center gap-1.5 justify-between">
            <h4 className={cn(TYPOGRAPHY.label, "text-zinc-300 flex items-center gap-2")}>
              <History size={13} className="text-zinc-500" />
              Automated Checkpoints History
            </h4>
            <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500")}>
              Up to 8 autosaves
            </span>
          </div>

          <p className={cn(TYPOGRAPHY.body, "text-[10px] text-zinc-400 leading-normal")}>
            GainLog automatically caches local savepoint snapshots before modifications or imports. Click Restore to roll back.
          </p>

          <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pt-1 pr-1">
            {checkpointHistory.length === 0 ? (
              <div className={cn(BORDER.standard, RADIUS.button, "p-4 text-center border border-dashed text-[9px] font-mono text-zinc-500 uppercase")}>
                No local checkpoints available.
              </div>
            ) : (
              checkpointHistory.map((b) => (
                <div
                  key={b.timestamp}
                  className={cn(
                    SURFACE.subtle,
                    BORDER.standard,
                    RADIUS.button,
                    "p-3 border flex items-center justify-between gap-3 text-left hover:border-zinc-700 hover:bg-zinc-900/50 transition-all"
                  )}
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
        </Card>

        {/* Clear & Delete Data Operations */}
        <Card variant="standard" surface="recessed" padding="standard" className="border-red-500/20 bg-red-500/[0.02] space-y-4">
          <div className="space-y-1">
            <h4 className={cn(TYPOGRAPHY.eyebrow, "text-red-400 font-bold flex items-center gap-1.5")}>
              <AlertTriangle size={12} className="text-red-400" />
              Clear & Reset Operations
            </h4>
            <p className={cn(TYPOGRAPHY.body, "text-[11px] text-zinc-400 leading-normal")}>
              Reset your workout catalog back to default routines or permanently delete all recorded session history.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              size="md"
              loading={loadingAction === 'reset_workouts'}
              icon={<RotateCcw size={14} />}
              onClick={handleResetWorkouts}
            >
              {loadingAction === 'reset_workouts' ? 'Resetting...' : 'Reset Default Routines'}
            </Button>

            <Button
              variant="destructive"
              size="md"
              loading={loadingAction === 'purge_logs'}
              icon={<Trash2 size={14} />}
              onClick={handlePurgeLogs}
            >
              {loadingAction === 'purge_logs' ? 'Purging...' : 'Purge All Session Logs'}
            </Button>
          </div>
        </Card>
      </Stack>
    </Section>
  );
};
