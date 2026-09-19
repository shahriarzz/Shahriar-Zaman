import React, { useState, useEffect, useCallback } from 'react';
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
import { isFirebaseConfigured } from './lib/firebase';
import { cn } from './lib/utils';
import { AmbientBackground, ToastContainer, Card, TYPOGRAPHY } from './components/ui';

function AppContent() {
  const { loading, activeSession, clearActiveSession, syncStatus } = useFitness();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [historySearchDate, setHistorySearchDate] = useState<string | null>(null);

  // Set up native status bar style and background color on launch
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(err => {
        console.warn('Error setting StatusBar style:', err);
      });
      StatusBar.setBackgroundColor({ color: '#09090e' }).catch(err => {
        console.warn('Error setting StatusBar background color:', err);
      });
    }
  }, []);

  // Dynamically hide the native splash screen only when loading is fully complete
  useEffect(() => {
    if (!loading && Capacitor.isNativePlatform()) {
      // Small timeout to allow the browser to paint the ready state before hiding the splash screen
      const timer = setTimeout(() => {
        SplashScreen.hide().catch(err => {
          console.warn('Error hiding splash screen:', err);
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Unify and deduplicate session exit/abandon flow
  const leaveSession = useCallback(async (destination: ActiveTab): Promise<boolean> => {
    if (activeSession) {
      const confirmExit = await confirm({
        title: 'Abandon Active Session?',
        message: 'Your current training progress is in-flight. Exiting now will discard or clear this active protocol. Are you sure you want to abort?',
        isDanger: true
      });
      if (confirmExit) {
        clearActiveSession();
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
  }, [activeSession, confirm, clearActiveSession]);

  // Set up safe native hardware back button support on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let sub: PluginListenerHandle | null = null;
    const initBackButton = async () => {
      sub = await CapApp.addListener('backButton', async () => {
        if (activeTab === 'session') {
          await leaveSession('dashboard');
        } else if (activeTab !== 'dashboard') {
          setActiveTab('dashboard');
        } else {
          CapApp.minimizeApp();
        }
      });
    };

    initBackButton();

    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, [activeTab, leaveSession]);

  if (loading) {
    // Determine dynamic network and connection details for highly accurate loader logging
    const getStatusDetails = () => {
      if (!isFirebaseConfigured) {
        return {
          dotColor: 'bg-zinc-600',
          statusText: 'Local Offline Protocol',
          connectionText: 'DISABLED',
          connectionColor: 'text-zinc-500'
        };
      }
      switch (syncStatus) {
        case 'syncing':
          return {
            dotColor: 'bg-amber-500 animate-pulse',
            statusText: 'Syncing Cloud Protocol',
            connectionText: 'SYNCING...',
            connectionColor: 'text-amber-400'
          };
        case 'failed':
          return {
            dotColor: 'bg-red-500 animate-pulse',
            statusText: 'Sync Interrupted',
            connectionText: 'FAILED',
            connectionColor: 'text-red-400'
          };
        case 'synced':
        case 'idle':
        default:
          return {
            dotColor: 'bg-green-500 animate-pulse',
            statusText: 'Secure Link Active',
            connectionText: 'SUCCESS',
            connectionColor: 'text-green-400'
          };
      }
    };

    const status = getStatusDetails();

    return (
      <div className="fixed inset-0 bg-[#06060a] flex flex-col items-center justify-center p-6 z-50">
        <AmbientBackground />

        <div className="flex flex-col items-center max-w-sm w-full gap-8 relative text-center">
          {/* Main loader design */}
          <div className="relative flex items-center justify-center">
            {/* Outer spinning ring */}
            <div className="w-16 h-16 border-2 border-white/5 border-t-orange-500/80 rounded-full animate-spin [animation-duration:1.2s]" />
            {/* Inner inverse spinning ring */}
            <div className="w-10 h-10 border border-white/5 border-b-blue-400/80 rounded-full animate-spin absolute [animation-duration:0.8s] [animation-direction:reverse]" />
            {/* Core dot */}
            <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-ping absolute" />
          </div>

          <div className="space-y-3">
            <span className={cn(TYPOGRAPHY.eyebrow, "text-orange-500 block animate-pulse")}>
              GainLog Synchronizer
            </span>
            <h3 className="text-xl font-bold uppercase tracking-wider text-white">
              Booting Protocol Engine
            </h3>
            <p className="text-xs text-zinc-500 max-w-[280px] leading-relaxed mx-auto">
              Decrypting database layers and aligning previous statistics securely...
            </p>
          </div>

          {/* Secure status checks log row */}
          <Card variant="standard" surface="recessed" padding="compact" className="w-full text-left space-y-2">
            <div className={cn("flex items-center gap-2 text-zinc-300", TYPOGRAPHY.caption)}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor}`} />
              {status.statusText}
            </div>
            <div className={cn("flex justify-between text-zinc-500", TYPOGRAPHY.micro)}>
              <span>Cloud DB Connection</span>
              <span className={status.connectionColor}>{status.connectionText}</span>
            </div>
            <div className={cn("flex justify-between text-zinc-500", TYPOGRAPHY.micro)}>
              <span>Encryption Status</span>
              <span className="text-zinc-300">AES-256</span>
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
      <AmbientBackground intensity="subtle" />
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
