import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { FitnessProvider, useFitness } from './context/FitnessContext';
import { useActiveSessionMeta } from './context/ActiveSessionContext';
import { ConfirmProvider, useConfirm } from './context/ConfirmContext';
import { Layout, ActiveTab } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ToastContainer } from './components/ui';
import { CANVAS_HEX } from './styles/tokens';
import {
  HistoryTabState,
  AnalyticsTabState,
  DEFAULT_HISTORY_TAB_STATE,
  DEFAULT_ANALYTICS_TAB_STATE
} from './types/tabViewState';

// Lazy-load secondary views to reduce initial bundle size while keeping Dashboard static
const SessionView = lazy(() => import('./components/SessionView').then(m => ({ default: m.SessionView })));
const HistoryView = lazy(() => import('./components/HistoryView').then(m => ({ default: m.HistoryView })));
const AnalyticsView = lazy(() => import('./components/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const ManageView = lazy(() => import('./components/ManageView').then(m => ({ default: m.ManageView })));

import {
  initialNavigationState,
  navigationTransition,
  getActiveTabFromRoute,
  getSelectedWorkoutId
} from './state/app/navigationMachine';

function AppContent() {
  const { activeSession, clearActiveSession } = useActiveSessionMeta();
  const { confirm } = useConfirm();
  const [navState, dispatchNav] = React.useReducer(navigationTransition, initialNavigationState);
  const activeTab = getActiveTabFromRoute(navState);
  const selectedWorkoutId = getSelectedWorkoutId(navState);
  const [historySearchDate, setHistorySearchDate] = useState<string | null>(null);

  // Tab view state preservation across unmounts
  const [historyTabState, setHistoryTabState] = useState<HistoryTabState>(DEFAULT_HISTORY_TAB_STATE);
  const [analyticsTabState, setAnalyticsTabState] = useState<AnalyticsTabState>(DEFAULT_ANALYTICS_TAB_STATE);

  // Prewarm chunks on pointer-down
  const prewarmTab = useCallback((tab: ActiveTab) => {
    switch (tab) {
      case 'session':
        import('./components/SessionView');
        break;
      case 'history':
        import('./components/HistoryView');
        break;
      case 'analytics':
        import('./components/AnalyticsView');
        break;
      case 'manage':
        import('./components/ManageView');
        break;
      default:
        break;
    }
  }, []);

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

    // Small timeout to allow browser to paint ready state before hiding splash
    const timer = setTimeout(() => {
      SplashScreen.hide().catch(err => {
        console.warn('Error hiding splash screen:', err);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Current-state refs to maintain a stable Android back handler without re-registration cycles
  const activeTabRef = useRef<ActiveTab>(activeTab);
  activeTabRef.current = activeTab;

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const clearActiveSessionRef = useRef(clearActiveSession);
  clearActiveSessionRef.current = clearActiveSession;

  const isLeavingRef = useRef(false);

  // Stable session exit/abandon flow using latest refs and unique request IDs
  const leaveSession = useCallback(async (destination: ActiveTab): Promise<boolean> => {
    if (activeSessionRef.current) {
      if (isLeavingRef.current) {
        // Reject or safely serialize concurrent exit attempts
        return false;
      }
      isLeavingRef.current = true;
      const requestId = `leave_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      dispatchNav({ type: 'REQUEST_LEAVE_SESSION', requestId, destination });

      try {
        const confirmExit = await confirmRef.current({
          title: 'Abandon Active Session?',
          message: 'Your current training progress is in-flight. Exiting now will discard or clear this active protocol. Are you sure you want to abort?',
          isDanger: true
        });
        if (confirmExit) {
          clearActiveSessionRef.current();
          dispatchNav({ type: 'CONFIRM_LEAVE_SESSION', requestId });
          return true;
        }
        dispatchNav({ type: 'CANCEL_LEAVE_SESSION', requestId });
        return false;
      } finally {
        isLeavingRef.current = false;
      }
    } else {
      dispatchNav({ type: 'NAVIGATE', to: destination });
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
            if (isLeavingRef.current) return;
            await leaveSessionRef.current('dashboard');
          } else if (currentTab !== 'dashboard') {
            dispatchNav({ type: 'ANDROID_BACK' });
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

  const handleStartSession = async (workoutId: string) => {
    if (activeSession && activeSession.workoutId !== workoutId) {
      const confirmed = await confirm({
        title: 'Discard Unfinished Session?',
        message: 'All unsubmitted progress and logged sets in this active session will be lost.',
        confirmText: 'Discard Session',
        isDanger: true,
      });
      if (!confirmed) {
        return;
      }
      clearActiveSession();
    }
    dispatchNav({ type: 'START_SESSION', workoutId });
  };

  const handleTabChange = async (tab: string) => {
    if (activeTab === 'session' && tab !== 'session') {
      await leaveSession(tab as ActiveTab);
    } else if (tab === 'session') {
      if (activeSession) {
        dispatchNav({ type: 'RESUME_SESSION', workoutId: activeSession.workoutId });
      }
    } else {
      dispatchNav({ type: 'NAVIGATE', to: tab as ActiveTab });
    }
  };

  return (
    <>
      <ToastContainer />
      <Layout activeTab={activeTab} onTabChange={handleTabChange} onPrewarm={prewarmTab}>
        <Suspense
          fallback={
            <div
              className="w-full py-8 flex items-center justify-center"
              aria-busy="true"
            >
              <div className="w-6 h-6 border-2 border-zinc-800 border-t-orange-500 rounded-full motion-safe:animate-spin [animation-duration:1s]" />
            </div>
          }
        >
          {activeTab === 'dashboard' && (
            <Dashboard 
              onStartWorkout={handleStartSession} 
              onPrewarmSession={() => prewarmTab('session')}
              onNavigateToHistory={(date) => {
                setHistorySearchDate(date);
                dispatchNav({ type: 'NAVIGATE', to: 'history' });
              }}
            />
          )}

          {activeTab === 'session' && (
            <SessionView
              workoutId={selectedWorkoutId}
              onExit={() => {
                dispatchNav({ type: 'SESSION_COMPLETED' });
              }}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView 
              initialDate={historySearchDate} 
              onClearInitialDate={() => setHistorySearchDate(null)} 
              savedState={historyTabState}
              onSaveState={setHistoryTabState}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView 
              savedState={analyticsTabState}
              onSaveState={setAnalyticsTabState}
            />
          )}

          {activeTab === 'manage' && (
            <ManageView />
          )}
        </Suspense>
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
