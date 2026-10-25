import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { FitnessProvider, useFitness } from './context/FitnessContext';
import { ConfirmProvider, useConfirm } from './context/ConfirmContext';
import { Layout, ActiveTab } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { SessionView } from './components/SessionView';
import { HistoryView } from './components/HistoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { ManageView } from './components/ManageView';
import { isFirebaseConfigured, firebaseConfigState } from './lib/firebase';
import { cn } from './lib/utils';
import { ToastContainer, Card, TYPOGRAPHY } from './components/ui';
import { CANVAS_HEX, SURFACE } from './styles/tokens';

function AppContent() {
  const { loading, activeSession, clearActiveSession, syncStatus, user } = useFitness();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [historySearchDate, setHistorySearchDate] = useState<string | null>(null);

  // Set up native status bar style and background color on launch
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Light }).catch(err => {
        console.warn('Error setting StatusBar style:', err);
      });
      StatusBar.setBackgroundColor({ color: CANVAS_HEX }).catch(err => {
        console.warn('Error setting StatusBar background color:', err);
      });
    }
  }, []);

  // Dynamically hide the native splash screen with loading completion & safety timeout
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Safety timeout: splash screen must never remain indefinitely under slow or offline conditions
    const safetyTimer = setTimeout(() => {
      SplashScreen.hide().catch(err => {
        console.warn('Error hiding splash screen on safety timeout:', err);
      });
    }, 3000);

    if (!loading) {
      // Small timeout to allow browser to paint ready state before hiding splash
      const timer = setTimeout(() => {
        SplashScreen.hide().catch(err => {
          console.warn('Error hiding splash screen:', err);
        });
      }, 100);
      return () => {
        clearTimeout(timer);
        clearTimeout(safetyTimer);
      };
    }

    return () => clearTimeout(safetyTimer);
  }, [loading]);

  // Current-state refs to maintain a stable Android back handler without re-registration cycles
  const activeTabRef = useRef<ActiveTab>(activeTab);
  activeTabRef.current = activeTab;

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const clearActiveSessionRef = useRef(clearActiveSession);
  clearActiveSessionRef.current = clearActiveSession;

  // Stable session exit/abandon flow using latest refs
  const leaveSession = useCallback(async (destination: ActiveTab): Promise<boolean> => {
    if (activeSessionRef.current) {
      const confirmExit = await confirmRef.current({
        title: 'Abandon Active Session?',
        message: 'Your current training progress is in-flight. Exiting now will discard or clear this active protocol. Are you sure you want to abort?',
        isDanger: true
      });
      if (confirmExit) {
        clearActiveSessionRef.current();
        setSelectedWorkoutId(null);
        setActiveTab(destination);
        return true;
      }
      return false;
    } else {
      setSelectedWorkoutId(null);
      setActiveTab(destination);
      return true;
    }
  }, []);

  const leaveSessionRef = useRef(leaveSession);
  leaveSessionRef.current = leaveSession;

  // Set up safe native hardware back button support on Android with stable registration and lifecycle cleanup protection
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isCleanedUp = false;
    let sub: PluginListenerHandle | null = null;

    const initBackButton = async () => {
      try {
        const handle = await CapApp.addListener('backButton', async () => {
          const currentTab = activeTabRef.current;
          if (currentTab === 'session') {
            await leaveSessionRef.current('dashboard');
          } else if (currentTab !== 'dashboard') {
            setActiveTab('dashboard');
          } else {
            CapApp.minimizeApp();
          }
        });

        if (isCleanedUp) {
          // If effect was unmounted while addListener was in-flight (e.g. Strict Mode), immediately remove it!
          await handle.remove().catch(err => console.warn("Failed removing in-flight back listener:", err));
        } else {
          sub = handle;
        }
      } catch (err) {
        console.warn("Failed to register native back button listener:", err);
      }
    };

    initBackButton();

    return () => {
      isCleanedUp = true;
      if (sub && typeof sub.remove === 'function') {
        const handleToRemove = sub;
        sub = null;
        handleToRemove.remove().catch(err => console.warn("Failed removing back listener on unmount:", err));
      }
    };
  }, []);

  if (loading) {
    // Determine dynamic network and connection details for highly accurate loader logging
    const getStatusDetails = () => {
      if (!isFirebaseConfigured) {
        if (firebaseConfigState === 'incomplete') {
          return {
            dotColor: 'bg-amber-600',
            statusText: 'Incomplete Cloud Setup (Running Offline)',
            connectionText: 'INCOMPLETE CONFIG',
            connectionColor: 'text-amber-500'
          };
        }
        return {
          dotColor: 'bg-zinc-600',
          statusText: 'Local Offline Protocol',
          connectionText: 'OFFLINE',
          connectionColor: 'text-zinc-500'
        };
      }
      switch (syncStatus) {
        case 'syncing':
          return {
            dotColor: 'bg-amber-500',
            statusText: 'Syncing Cloud Protocol',
            connectionText: 'SYNCING...',
            connectionColor: 'text-amber-400'
          };
        case 'failed':
          return {
            dotColor: 'bg-red-500',
            statusText: 'Sync Interrupted',
            connectionText: 'FAILED',
            connectionColor: 'text-red-400'
          };
        case 'synced':
          return {
            dotColor: 'bg-emerald-500',
            statusText: 'Cloud Sync Verified',
            connectionText: 'SYNCED',
            connectionColor: 'text-emerald-400'
          };
        case 'idle':
        default:
          return {
            dotColor: 'bg-zinc-500',
            statusText: user ? 'Cloud Ready' : 'Local Offline Mode',
            connectionText: user ? 'STANDBY' : 'OFFLINE',
            connectionColor: 'text-zinc-400'
          };
      }
    };

    const status = getStatusDetails();

    return (
      <div className={cn("fixed inset-0 flex flex-col items-center justify-center p-6 z-50", SURFACE.canvas)}>
        <div className="flex flex-col items-center max-w-sm w-full gap-8 relative text-center">
          {/* Restrained single loading spinner */}
          <div className="relative flex items-center justify-center">
            <div className="w-12 h-12 border-2 border-zinc-800 border-t-orange-500 rounded-full motion-safe:animate-spin [animation-duration:1s]" />
          </div>

          <div className="space-y-3">
            <span className={cn(TYPOGRAPHY.eyebrow, "text-orange-500 block")}>
              GainLog Synchronizer
            </span>
            <h3 className="text-xl font-bold uppercase tracking-wider text-white">
              Booting Protocol Engine
            </h3>
            <p className="text-xs text-zinc-500 max-w-[280px] leading-relaxed mx-auto">
              Loading training data and preparing your dashboard...
            </p>
          </div>

          {/* System status row */}
          <Card variant="standard" surface="recessed" padding="compact" className="w-full text-left space-y-2">
            <div className={cn("flex items-center gap-2 text-zinc-300", TYPOGRAPHY.caption)}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              {status.statusText}
            </div>
            <div className={cn("flex justify-between text-zinc-500", TYPOGRAPHY.micro)}>
              <span>Local Storage</span>
              <span className="text-emerald-400">READY</span>
            </div>
            <div className={cn("flex justify-between text-zinc-500", TYPOGRAPHY.micro)}>
              <span>Cloud Sync</span>
              <span className={status.connectionColor}>{status.connectionText}</span>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const handleStartSession = (workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setActiveTab('session');
  };

  const handleTabChange = async (tab: string) => {
    if (activeTab === 'session' && tab !== 'session') {
      await leaveSession(tab as ActiveTab);
    } else {
      setActiveTab(tab as ActiveTab);
    }
  };

  return (
    <>
      <ToastContainer />
      <Layout activeTab={activeTab} onTabChange={handleTabChange}>
        {activeTab === 'dashboard' && (
          <Dashboard 
            onStartWorkout={handleStartSession} 
            onNavigateToHistory={(date) => {
              setHistorySearchDate(date);
              setActiveTab('history');
            }}
          />
        )}
        {activeTab === 'session' && (
          <SessionView
            workoutId={selectedWorkoutId}
            onExit={() => {
              setSelectedWorkoutId(null);
              setActiveTab('dashboard');
            }}
          />
        )}
        {activeTab === 'history' && (
          <HistoryView 
            initialDate={historySearchDate} 
            onClearInitialDate={() => setHistorySearchDate(null)} 
            />
        )}
        {activeTab === 'analytics' && <AnalyticsView />}
        {activeTab === 'manage' && <ManageView />}
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <FitnessProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </FitnessProvider>
  );
}
