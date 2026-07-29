import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, History, Settings, Dumbbell } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { cn } from '../lib/utils';
import { useFitness } from '../store/FitnessContext';

export type ActiveTab = 'dashboard' | 'session' | 'history' | 'manage';

interface NavItemProps {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ id, label, icon, active, onClick }) => {
  const handleClick = () => {
    haptics.selection();
    onClick();
  };

  return (
    <button
      id={`nav-item-${id}`}
      onClick={handleClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        "flex flex-col items-center justify-center py-2 px-4 gap-1 transition-all relative group",
        active ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      <div className={cn(
        "transition-transform duration-300",
        active && "drop-shadow-[0_0_8px_rgba(249,115,22,0.45)]"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      {active && (
        <motion.div
          layoutId="nav-pill"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-orange-500 rounded-full"
        />
      )}
    </button>
  );
};

interface LayoutProps {
  activeTab: ActiveTab;
  onTabChange: (id: ActiveTab) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, onTabChange, children }) => {
  const { user, syncStatus, syncError } = useFitness();
  const [showTooltip, setShowTooltip] = useState(false);

  const getSyncColorClass = () => {
    switch (syncStatus) {
      case 'syncing': return 'bg-amber-500 animate-pulse';
      case 'synced': return 'bg-emerald-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-zinc-600';
    }
  };

  const getSyncTooltip = () => {
    switch (syncStatus) {
      case 'syncing': return 'Synchronizing database...';
      case 'synced': return 'All training splits isomorphically synced';
      case 'failed': return `Synchronization issue: ${syncError || 'Timeout'}`;
      default: return 'Local storage active';
    }
  };

  const navConfig = [
    { id: 'dashboard' as ActiveTab, label: 'Dash', icon: (size: number) => <LayoutDashboard size={size} /> },
    { id: 'history' as ActiveTab, label: 'History', icon: (size: number) => <History size={size} /> },
    { id: 'manage' as ActiveTab, label: 'Manage', icon: (size: number) => <Settings size={size} /> },
  ];

  return (
    <div className={cn(
      "min-h-screen bg-[#09090e] text-zinc-200 font-sans selection:bg-orange-500/30",
      activeTab === 'session' && "session-active"
    )}>
      {/* Top Banner / Nav */}
      <nav className="sticky top-0 z-50 bg-[#09090e]/95 backdrop-blur-md transform-gpu will-change-transform border-b border-zinc-800/50 px-4 flex items-center justify-between pt-safe h-[calc(3.5rem+env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={18} className="text-black stroke-[3px]" />
          </div>
          <span className="font-display text-xl tracking-[0.2em] font-black uppercase">
            Gain<span className="text-orange-500">Log</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {navConfig.map(item => (
            <NavItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon(18)}
              active={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Subtle user status avatar with integrated sync indicator */}
          <div 
            className="relative group/sync cursor-pointer select-none" 
            title={user ? getSyncTooltip() : 'Offline database mode'}
            role="status"
            aria-label={user ? getSyncTooltip() : 'Offline database mode'}
            onClick={() => setShowTooltip(!showTooltip)}
          >
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || "User"} 
                referrerPolicy="no-referrer" 
                className="w-8 h-8 rounded-full object-cover border border-zinc-800" 
              />
            ) : user ? (
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-bold text-zinc-300">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : '?')}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              </div>
            )}

            {user && (
              <span 
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-[9px] h-[9px] rounded-full border border-[#09090e]",
                  getSyncColorClass()
                )} 
              />
            )}

            {/* Dynamic visual touch/mobile tooltip popover */}
            <AnimatePresence>
              {showTooltip && (
                <>
                  {/* Backdrop to dismiss on tapping anywhere outside */}
                  <div 
                    className="fixed inset-0 z-40 bg-transparent" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTooltip(false);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-10 z-50 w-52 bg-zinc-950/95 border border-zinc-800 rounded-2xl p-4.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl text-left pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", getSyncColorClass())} />
                      <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest leading-none">Cloud Protocol</p>
                    </div>
                    <p className="text-[11px] text-zinc-200 leading-normal font-sans">
                      {user ? getSyncTooltip() : 'Local client database active.'}
                    </p>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      <main className="pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-w-5xl mx-auto px-4 md:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090e]/95 backdrop-blur-md transform-gpu will-change-transform border-t border-zinc-800 flex items-center justify-around pb-safe h-[calc(4rem+env(safe-area-inset-bottom,0px))] px-4">
        {navConfig.map(item => (
          <NavItem
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon(20)}
            active={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
          />
        ))}
      </div>
    </div>
  );
};
