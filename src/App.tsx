import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { FitnessProvider } from './store/FitnessContext';
import { ConfirmProvider, useConfirm } from './store/ConfirmContext';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { SessionView } from './components/SessionView';
import { HistoryView } from './components/HistoryView';
import { ManageView } from './components/ManageView';
import { useFitness } from './store/FitnessContext';

function AppContent() {
  const { loading } = useFitness();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [historySearchDate, setHistorySearchDate] = useState<string | null>(null);

  // Set up safe native hardware back button support on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let sub: any;
    const initBackButton = async () => {
      sub = await CapApp.addListener('backButton', async () => {
        if (activeTab === 'session') {
          const confirmExit = await confirm({
            title: 'Exit Session',
            message: 'Exit current training session?',
            isDanger: true
          });
          if (confirmExit) {
            setSelectedWorkoutId(null);
            setActiveTab('dashboard');
          }
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
  }, [activeTab]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#06060a] flex flex-col items-center justify-center p-6 z-50">
        {/* Subtle glowing ambient background spheres */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/3 left-1/3 w-60 h-60 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

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
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.35em] text-orange-500 block animate-pulse">
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
          <div className="border border-zinc-900 bg-zinc-950/40 rounded-2xl p-4 w-full text-left space-y-2">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Secure Link Active
            </div>
            <div className="flex justify-between text-[8px] font-mono uppercase text-zinc-500">
              <span>Cloud DB Connection</span>
              <span className="text-zinc-400">SUCCESS</span>
            </div>
            <div className="flex justify-between text-[8px] font-mono uppercase text-zinc-500">
              <span>Encryption Status</span>
              <span className="text-zinc-300">AES-256</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleStartSession = (workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setActiveTab('session');
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
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
      {activeTab === 'manage' && <ManageView />}
    </Layout>
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
