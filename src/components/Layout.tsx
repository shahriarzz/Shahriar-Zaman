import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, History, Settings, Dumbbell } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { cn } from '../lib/utils';
import { useFitness } from '../store/FitnessContext';

interface NavItemProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, active, onClick }) => {
  const handleClick = () => {
    haptics.selection();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center justify-center py-2 px-4 gap-1 transition-all relative group",
        active ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      {icon}
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
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, onTabChange, children }) => {
  const { user } = useFitness();

  return (
    <div className="min-h-screen bg-[#09090e] text-zinc-200 font-sans selection:bg-orange-500/30">
      {/* Top Banner / Nav */}
      <nav className="sticky top-0 z-50 bg-[#09090e]/90 backdrop-blur-xl border-b border-zinc-800/50 px-4 flex items-center justify-between pt-safe h-[calc(3.5rem+env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={18} className="text-black stroke-[3px]" />
          </div>
          <span className="font-display text-xl tracking-[0.2em] font-black uppercase">
            Gain<span className="text-orange-500">Log</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1">
          <NavItem id="dashboard" label="Dash" icon={<LayoutDashboard size={18} />} active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
          <NavItem id="history" label="History" icon={<History size={18} />} active={activeTab === 'history'} onClick={() => onTabChange('history')} />
          <NavItem id="manage" label="Manage" icon={<Settings size={18} />} active={activeTab === 'manage'} onClick={() => onTabChange('manage')} />
        </div>

        <div className="flex items-center gap-2">
          {/* Subtle user status avatar */}
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || "User"} 
              referrerPolicy="no-referrer" 
              className="w-8 h-8 rounded-full object-cover border border-zinc-850" 
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090e]/95 backdrop-blur-2xl border-t border-zinc-800 flex items-center justify-around pb-safe h-[calc(4rem+env(safe-area-inset-bottom,0px))] px-4">
        <NavItem id="dashboard" label="Dash" icon={<LayoutDashboard size={20} />} active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
        <NavItem id="history" label="History" icon={<History size={20} />} active={activeTab === 'history'} onClick={() => onTabChange('history')} />
        <NavItem id="manage" label="Manage" icon={<Settings size={20} />} active={activeTab === 'manage'} onClick={() => onTabChange('manage')} />
      </div>
    </div>
  );
};
