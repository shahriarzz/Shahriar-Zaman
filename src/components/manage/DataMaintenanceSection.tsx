import React, { useState, useMemo, useRef } from 'react';
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
import { useFitness } from '../../context/FitnessContext';
import { useConfirm } from '../../context/ConfirmContext';
import { SessionLog } from '../../types/fitness';
import { INITIAL_WORKOUTS } from '../../types/initialData';
import { haptics } from '../../utils/haptics';
import {
  Section,
  Card,
  Button,
  Banner,
  Stack,
  Grid,
  TYPOGRAPHY,
  BORDER,
  SURFACE,
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';

interface BannerMessage {
  type: 'success' | 'danger' | 'warning' | 'info';
  text: string;
}

export const DataMaintenanceSection: React.FC = () => {
  const {
    workouts,
    setWorkouts,
    logs,
    exerciseDefinitions,
    resetLogs,
    exportBackup,
    importBackup,
    getAutoBackups,
    restoreAutoBackup,
    createManualBackup
  } = useFitness();
  const { confirm } = useConfirm();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [restoringTimestamp, setRestoringTimestamp] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<BannerMessage | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoBackupsTick, setAutoBackupsTick] = useState(0);

  // Compute authoritative data-health metric string
  const dataHealthInfo = useMemo(() => {
    const totalWorkouts = workouts.length;
    const totalExercises = (exerciseDefinitions || []).length;
    const completedSessions = (Object.values(logs || {}) as SessionLog[]).filter(l => Boolean(l?.complete)).length;
    return `${totalWorkouts} Workouts · ${totalExercises} Exercises · ${completedSessions} Completed Sessions`;
  }, [workouts, exerciseDefinitions, logs]);

  const checkpointHistory = useMemo(() => getAutoBackups(), [autoBackupsTick, getAutoBackups]);

  const handleExport = async () => {
    if (loadingAction) return;
    setLoadingAction('export');
    try {
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

      haptics.success();
      setBannerMessage({ type: 'success', text: "Backup File downloaded successfully." });
      setTimeout(() => setBannerMessage(null), 4000);
    } catch (e: any) {
      haptics.warning();
      setBannerMessage({ type: 'danger', text: "Failed to export backup: " + (e?.message || e) });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopyClipboard = async () => {
    if (loadingAction) return;
    setLoadingAction('copy');
    try {
      const backupStr = exportBackup();
      await navigator.clipboard.writeText(backupStr);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      haptics.warning();
      setBannerMessage({ type: 'warning', text: "Failed to copy JSON. Try downloading the backup file instead." });
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
      setBannerMessage({ type: 'danger', text: "Selected file is too large. Backup files must be under 5MB." });
      event.target.value = '';
      return;
    }

    setLoadingAction('upload');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) return;

        const res = await importBackup(content);
        if (res.success) {
          haptics.success();
          setBannerMessage({ type: 'success', text: res.message });
          setAutoBackupsTick(prev => prev + 1);
          setTimeout(() => setBannerMessage(null), 5000);
        } else {
          haptics.warning();
          setBannerMessage({ type: 'danger', text: res.message });
        }
      } catch {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: "Failed to import backup file." });
      } finally {
        setLoadingAction(null);
      }
    };
    reader.onerror = () => {
      haptics.warning();
      setBannerMessage({ type: 'danger', text: "Error reading backup file." });
      setLoadingAction(null);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handlePasteRestore = async () => {
    if (!pastedJson.trim() || loadingAction) return;
    setLoadingAction('paste');
    try {
      const res = await importBackup(pastedJson);
      if (res.success) {
        haptics.success();
        setBannerMessage({ type: 'success', text: res.message });
        setPastedJson('');
        setShowPasteBox(false);
        setAutoBackupsTick(prev => prev + 1);
        setTimeout(() => setBannerMessage(null), 5000);
      } else {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: res.message });
      }
    } catch {
      haptics.warning();
      setBannerMessage({ type: 'danger', text: "Failed to process JSON backup." });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateRestorePoint = async () => {
    if (loadingAction) return;
    setLoadingAction('savepoint');
    try {
      const res = await createManualBackup();
      if (res.success) {
        haptics.success();
        setBannerMessage({ type: 'success', text: res.message });
        setAutoBackupsTick(prev => prev + 1);
        setTimeout(() => setBannerMessage(null), 4000);
      } else {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: res.message });
      }
    } catch {
      haptics.warning();
      setBannerMessage({ type: 'danger', text: "Failed to create savepoint." });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestoreCheckpoint = async (timestamp: string, desc: string) => {
    if (loadingAction || restoringTimestamp) return;
    haptics.warning();
    const confirmRestore = await confirm({
      title: 'Restore Savepoint',
      message: `Are you sure you want to revert your routines and logs to:\n"${desc}"?\n\nThis will overwrite your active state parameters.`,
      isDanger: true
    });
    if (!confirmRestore) return;

    setRestoringTimestamp(timestamp);
    try {
      const res = await restoreAutoBackup(timestamp);
      if (res.success) {
        haptics.success();
        setBannerMessage({ type: 'success', text: res.message });
        setAutoBackupsTick(prev => prev + 1);
        setTimeout(() => setBannerMessage(null), 5000);
      } else {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: res.message });
      }
    } catch {
      haptics.warning();
      setBannerMessage({ type: 'danger', text: "Failed to restore savepoint snapshot." });
    } finally {
      setRestoringTimestamp(null);
    }
  };

  const handleResetWorkouts = async () => {
    if (loadingAction) return;
    haptics.warning();
    const proceed = await confirm({
      title: 'Reset Training Routines',
      message: 'Overwrite all training routines with default factory structures? This will keep history but replace routines.',
      isDanger: true
    });
    if (proceed) {
      setLoadingAction('reset_workouts');
      try {
        await setWorkouts(INITIAL_WORKOUTS);
        haptics.success();
        setBannerMessage({ type: 'success', text: "Training routines reset to factory defaults." });
        setTimeout(() => setBannerMessage(null), 4000);
      } catch {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: "Failed to reset routines." });
      } finally {
        setLoadingAction(null);
      }
    }
  };

  const handlePurgeLogs = async () => {
    if (loadingAction) return;
    haptics.warning();
    const proceed = await confirm({
      title: '🚨 DANGER: IRREVERSIBLE PURGE',
      message: 'Are you absolutely positive you want to completely delete all training calendars and histories? This cannot be undone.',
      isDanger: true
    });
    if (proceed) {
      setLoadingAction('purge_logs');
      try {
        await resetLogs();
        haptics.success();
        setBannerMessage({ type: 'success', text: "All session histories have been deleted." });
        setTimeout(() => setBannerMessage(null), 4000);
      } catch {
        haptics.warning();
        setBannerMessage({ type: 'danger', text: "Failed to delete training history." });
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
      padding="relaxed"
    >
      <Stack spacing="lg">
        {/* 1. DATA HEALTH READOUT */}
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

        {/* Restore / Operation Message Banner */}
        <AnimatePresence>
          {bannerMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Banner
                variant={bannerMessage.type}
                title={bannerMessage.text}
                onDismiss={() => setBannerMessage(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. BACKUP & RESTORE GROUP */}
        <Grid cols={1} colsMd={2} gap="md">
          {/* Action 1: Export Backup */}
          <Card variant="standard" padding="standard" className="flex flex-col justify-between items-start gap-4">
            <div className="space-y-1">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Export</span>
              <h4 className="text-xs font-bold text-zinc-200">Data Backup File</h4>
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
                icon={copied ? <Check size={13} className="text-emerald-400" /> : <ClipboardCopy size={13} />}
                onClick={handleCopyClipboard}
              >
                {copied ? "Copied!" : "Copy JSON"}
              </Button>
            </div>
          </Card>

          {/* Action 2: Import / Restore from Backup */}
          <Card variant="standard" padding="standard" className="flex flex-col justify-between items-start gap-4">
            <div className="space-y-1 w-full">
              <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500 block")}>Import</span>
              <h4 className="text-xs font-bold text-zinc-200">Restore from Backup</h4>
              <p className={cn(TYPOGRAPHY.body, "text-[10px] text-zinc-400 leading-normal")}>
                Import saved routines and historical session logs by uploading a JSON backup file or pasting raw JSON text.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={loadingAction === 'upload'}
                className="hidden"
                aria-hidden="true"
              />
              <Button
                variant="primary"
                size="md"
                fullWidth
                loading={loadingAction === 'upload'}
                icon={<Upload size={14} />}
                onClick={() => fileInputRef.current?.click()}
              >
                {loadingAction === 'upload' ? 'Uploading...' : 'Upload File'}
              </Button>

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
                Raw Backup JSON Structure
              </label>
              <textarea
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='Paste your backup JSON string here... (e.g., {"version": 1, ...})'
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
                  {loadingAction === 'paste' ? 'Restoring...' : 'Restore from JSON'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. RESTORE POINTS GROUP */}
        <Card variant="standard" surface="recessed" padding="standard" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <History size={14} className="text-zinc-400" />
                <h4 className={cn(TYPOGRAPHY.label, "text-zinc-200 font-bold")}>
                  Restore Points
                </h4>
                <span className={cn(TYPOGRAPHY.eyebrow, "text-zinc-500")}>
                  Up to 8 snapshots
                </span>
              </div>
              <p className={cn(TYPOGRAPHY.body, "text-[10px] text-zinc-400 leading-normal")}>
                GainLog caches local savepoint snapshots before modifications or imports. You can also create manual checkpoints.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              loading={loadingAction === 'savepoint'}
              icon={<Save size={13} className="text-orange-400" />}
              onClick={handleCreateRestorePoint}
              className="shrink-0 self-start sm:self-auto"
            >
              {loadingAction === 'savepoint' ? 'Saving...' : 'Create Savepoint'}
            </Button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pt-1 pr-1">
            {checkpointHistory.length === 0 ? (
              <div className={cn(BORDER.standard, RADIUS.button, "p-4 text-center border border-dashed text-[9px] font-mono text-zinc-500 uppercase")}>
                No restore points available.
              </div>
            ) : (
              checkpointHistory.map((b) => {
                const isRestoringThis = restoringTimestamp === b.timestamp;
                return (
                  <div
                    key={b.timestamp}
                    className={cn(
                      SURFACE.subtle,
                      BORDER.standard,
                      RADIUS.button,
                      "p-3 border flex items-center justify-between gap-3 text-left hover:border-zinc-700 hover:bg-zinc-900/50 transition-all"
                    )}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] font-mono text-orange-400 font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                          {b.changeType}
                        </span>
                        <span className="text-[10px] text-zinc-200 font-bold truncate">{b.desc}</span>
                      </div>
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
                      loading={isRestoringThis}
                      disabled={Boolean(restoringTimestamp && !isRestoringThis)}
                      onClick={() => handleRestoreCheckpoint(b.timestamp, b.desc)}
                      className="shrink-0"
                    >
                      {isRestoringThis ? 'Restoring...' : 'Restore'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* 4. DANGER ZONE GROUP */}
        <Card variant="standard" surface="recessed" padding="standard" className="border-red-500/20 bg-red-500/[0.02] space-y-4">
          <div className="space-y-1">
            <h4 className={cn(TYPOGRAPHY.eyebrow, "text-red-400 font-bold flex items-center gap-1.5")}>
              <AlertTriangle size={12} className="text-red-400" />
              Danger Zone
            </h4>
            <p className={cn(TYPOGRAPHY.body, "text-[11px] text-zinc-400 leading-normal")}>
              Reset your workout catalog back to factory defaults or permanently delete all recorded session history.
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
              {loadingAction === 'purge_logs' ? 'Deleting...' : 'Delete Training History'}
            </Button>
          </div>
        </Card>
      </Stack>
    </Section>
  );
};

