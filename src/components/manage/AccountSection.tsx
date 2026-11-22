import React, { useState, useRef } from 'react';
import { Cloud, LogOut, LogIn } from 'lucide-react';
import { useFitness } from '../../context/FitnessContext';
import { useConfirm } from '../../context/ConfirmContext';
import { haptics } from '../../utils/haptics';
import {
  Section,
  Button,
  Stack,
  TYPOGRAPHY,
  SURFACE,
  BORDER,
  RADIUS
} from '../ui';
import { cn } from '../../lib/utils';

export const AccountSection: React.FC = () => {
  const {
    user,
    login,
    logout,
    syncStatus,
    syncError
  } = useFitness();
  const { confirm } = useConfirm();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authInFlightRef = useRef(false);

  const handleLogin = async () => {
    if (authInFlightRef.current || loadingAction === 'auth') return;
    authInFlightRef.current = true;
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
      authInFlightRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleLogout = async () => {
    if (authInFlightRef.current || loadingAction === 'auth') return;
    authInFlightRef.current = true;
    setLoadingAction('auth');
    haptics.warning();
    try {
      await logout();
    } finally {
      authInFlightRef.current = false;
      setLoadingAction(null);
    }
  };

  return (
    <Section
      eyebrow="Account & Synchronization"
      eyebrowColor="zinc"
      title="Cloud Account"
      description="Manage your account login and real-time cloud data synchronization."
      padding="section"
    >
      <Stack spacing="md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Cloud className="text-zinc-400 w-4 h-4 shrink-0" />
              <h3 className={cn(TYPOGRAPHY.label, "text-white text-xs font-bold flex items-center gap-2")}>
                Cloud Synchronization
                {user && (
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    syncStatus === 'synced' && 'bg-emerald-500',
                    syncStatus === 'syncing' && 'bg-amber-500',
                    syncStatus === 'failed' && 'bg-red-500',
                    syncStatus === 'offline' && 'bg-zinc-400',
                    syncStatus === 'idle' && 'bg-zinc-500'
                  )} />
                )}
              </h3>
            </div>

            <div className={cn(TYPOGRAPHY.body, "text-xs text-zinc-400")}>
              {user ? (
                <div className="flex flex-col gap-1">
                  <span className="break-words">
                    Signed in as <strong className="text-white font-mono break-all">{user.email}</strong>
                  </span>
                  {syncStatus === 'syncing' && (
                    <span className={cn(TYPOGRAPHY.label, "text-amber-400")}>
                      Synchronizing with Firestore...
                    </span>
                  )}
                  {syncStatus === 'synced' && (
                    <span className={cn(TYPOGRAPHY.label, "text-emerald-400")}>
                      Cloud synchronization complete. Data secure.
                    </span>
                  )}
                  {syncStatus === 'offline' && (
                    <span className={cn(TYPOGRAPHY.label, "text-zinc-400 flex flex-col gap-0.5")}>
                      <span>Operating offline (local-first storage active).</span>
                      <span className="text-zinc-400 normal-case tracking-normal">Changes queued and preserved locally.</span>
                    </span>
                  )}
                  {syncStatus === 'failed' && (
                    <span className={cn(TYPOGRAPHY.label, "text-red-400 flex flex-col gap-0.5")}>
                      <span>Sync mismatch / connection timeout.</span>
                      {syncError && <span className="text-zinc-400 normal-case tracking-normal break-words">{syncError}</span>}
                    </span>
                  )}
                  {syncStatus === 'idle' && (
                    <span className={cn(TYPOGRAPHY.label, "text-zinc-400")}>
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
              <span
                role="alert"
                className={cn(TYPOGRAPHY.errorText, "text-left md:text-right max-w-xs break-words")}
              >
                {authError}
              </span>
            )}
          </div>
        </div>

        {/* Embedded preview disclaimer */}
        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className={cn("p-3 border", SURFACE.recessed, BORDER.subtle, RADIUS.button)}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2.5">
              <span className={cn(TYPOGRAPHY.label, "text-zinc-300 shrink-0 mt-0.5")}>
                Web Preview Notice:
              </span>
              <p className={TYPOGRAPHY.bodySecondary}>
                Google Sign-In popups are restricted inside embedded iframes. Open the app in a <strong className="text-zinc-200">New Tab</strong> to authenticate and synchronize seamlessly.
              </p>
            </div>
          </div>
        )}
      </Stack>
    </Section>
  );
};
