import React, { useState } from 'react';
import { Cloud, User as UserIcon, LogOut, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useFitness } from '../../context/FitnessContext';
import { useConfirm } from '../../context/ConfirmContext';
import { haptics } from '../../utils/haptics';
import {
  Section,
  Card,
  Button,
  Badge,
  Stack,
  TYPOGRAPHY,
  GAP,
  BORDER,
  SURFACE,
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';

export const AccountSection: React.FC = () => {
  const { user, login, logout, syncStatus, syncError } = useFitness();
  const { confirm } = useConfirm();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async () => {
    setAuthError(null);
    setLoadingAction('auth');
    haptics.medium();
    try {
      await login();
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
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLogout = async () => {
    if (loadingAction === 'auth') return;
    setLoadingAction('auth');
    haptics.warning();
    try {
      await logout();
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Section
      eyebrow="Account & Synchronization"
      eyebrowColor="zinc"
      title="Cloud Account"
      description="Manage your account login and real-time cloud data synchronization."
      padding="relaxed"
    >
      <Stack spacing="md">
        <Card variant="standard" padding="standard" className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Cloud className="text-orange-500 w-4 h-4" />
              <h3 className={cn(TYPOGRAPHY.label, "text-white text-xs font-bold flex items-center gap-2")}>
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

            <div className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400")}>
              {user ? (
                <div className="flex flex-col gap-1">
                  <span>
                    Signed in as <strong className="text-white font-mono">{user.email}</strong>
                  </span>
                  {syncStatus === 'syncing' && (
                    <span className="text-amber-400 font-mono text-[10px] uppercase tracking-wider">
                      ⚡ Synchronizing with Firestore...
                    </span>
                  )}
                  {syncStatus === 'synced' && (
                    <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider">
                      ✓ Cloud synchronization complete. Data secure.
                    </span>
                  )}
                  {syncStatus === 'failed' && (
                    <span className="text-red-400 font-mono text-[10px] uppercase tracking-wider flex flex-col gap-0.5">
                      <span>⚠ Sync mismatch / connection timeout.</span>
                      {syncError && <span className="text-zinc-400 normal-case tracking-normal">{syncError}</span>}
                    </span>
                  )}
                  {syncStatus === 'idle' && (
                    <span className="text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
                      Connection established. Idle.
                    </span>
                  )}
                </div>
              ) : (
                "Synchronize routines, custom calendars, and safety benchmarks securely by signing in with Google."
              )}
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            {user ? (
              <Button
                variant="secondary"
                size="md"
                loading={loadingAction === 'auth'}
                icon={<LogOut size={14} />}
                onClick={handleLogout}
              >
                {loadingAction === 'auth' ? 'Signing Out...' : 'Sign Out'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                loading={loadingAction === 'auth'}
                icon={<LogIn size={14} />}
                onClick={handleLogin}
              >
                {loadingAction === 'auth' ? 'Signing In...' : 'Sync with Google'}
              </Button>
            )}

            {authError && (
              <span className="text-[9px] font-mono text-red-400 uppercase tracking-tighter text-left md:text-right max-w-xs">
                {authError}
              </span>
            )}
          </div>
        </Card>

        {/* Embedded preview disclaimer */}
        {typeof window !== 'undefined' && window.self !== window.top && (
          <Card variant="standard" surface="recessed" padding="compact">
            <div className="flex items-start gap-2.5">
              <span className="text-[9px] font-mono text-orange-400 uppercase tracking-wider font-bold shrink-0 mt-0.5">
                💡 Web Preview Alert:
              </span>
              <p className="text-[10px] text-zinc-400 leading-normal">
                Google Sign-In popups are restricted inside embedded iframes. Open the app in a <strong className="text-zinc-200">New Tab</strong> to authenticate and synchronize seamlessly.
              </p>
            </div>
          </Card>
        )}
      </Stack>
    </Section>
  );
};
